//
//  ProStore.swift
//  Shared (App)
//
//  GeoSpoof Pro entitlement + purchase layer (StoreKit 2).
//
//  Two ways to be Pro:
//    1. Founder grant — anyone whose *first* downloaded version is below
//       `founderCutoff` (1.22.0) gets Pro free forever. Resolved from
//       `AppTransaction.originalAppVersion`, so it needs no sign-in, no
//       backend, and survives reinstalls (it's tied to the Apple ID's
//       purchase history). This is our thank-you to early users.
//    2. Active subscription — monthly or annual auto-renewable.
//
//  `isPro = isFounder || hasActiveSubscription`.
//
//  The resolved entitlement is cached in app-local UserDefaults (so a cold
//  launch keeps the last founder value) and broadcast via NotificationCenter
//  (`proEntitlementDidChange`) so the rest of the app — e.g. the VPN auto-sync
//  gate in SpoofController — can react without coupling to this StoreKit type
//  (which isn't in the widget target). We deliberately do NOT write the App
//  Group plist here: all App Group writes go through SpoofController's
//  direct-file writer, and mixing in UserDefaults(suiteName:) lets cfprefsd
//  clobber the pending_* keys.
//

import Foundation
import Combine
import StoreKit
import SwiftUI

// MARK: - Semantic version

/// Minimal dotted-numeric version (e.g. "1.21.10") with component-wise
/// comparison. String comparison is wrong here — "1.9.0" would sort *after*
/// "1.22.0" lexically — so we compare integer components left to right.
struct AppVersion: Comparable, CustomStringConvertible {
    let components: [Int]

    init(_ components: [Int]) {
        self.components = components
    }

    /// Parse a version string. Strips anything after the first non
    /// dot/digit run (build metadata, "-beta", etc.) and tolerates missing
    /// minor/patch. Returns nil only if there's not a single leading number.
    init?(string: String?) {
        guard let string else { return nil }
        let trimmed = string.trimmingCharacters(in: .whitespaces)
        // Keep the leading "1.21.10"-style run; drop suffixes like "-beta".
        let head = trimmed.prefix { $0.isNumber || $0 == "." }
        let parts = head.split(separator: ".").map { Int($0) ?? -1 }
        let cleaned = parts.filter { $0 >= 0 }
        guard !cleaned.isEmpty else { return nil }
        self.components = cleaned
    }

    static func < (lhs: AppVersion, rhs: AppVersion) -> Bool {
        let count = Swift.max(lhs.components.count, rhs.components.count)
        for i in 0..<count {
            let l = i < lhs.components.count ? lhs.components[i] : 0
            let r = i < rhs.components.count ? rhs.components[i] : 0
            if l != r { return l < r }
        }
        return false
    }

    var description: String { components.map(String.init).joined(separator: ".") }
}

// MARK: - ProStore

@MainActor
final class ProStore: ObservableObject {
    static let shared = ProStore()

    // MARK: Product IDs

    enum ProductID {
        static let monthly = "com.moonloaf.geospoof.pro.monthly"
        static let annual  = "com.moonloaf.geospoof.pro.annual"
        static let all: Set<String> = [monthly, annual]
    }

    /// First release that ships paywalled Pro. Anyone whose *original* (first-
    /// installed) download is strictly below this gets the free founder grant.
    ///
    /// ⚠️ `AppTransaction.originalAppVersion` is PLATFORM-SPECIFIC:
    ///   - iOS/iPadOS: it's `CFBundleVersion` — the BUILD number. Pro launched
    ///     in 1.22.1 = build 40, so the cutoff is the integer build `40`, NOT a
    ///     marketing string. Comparing a real build like "30" against a marketing
    ///     triple like [1,22,1] would wrongly evaluate `30 < 1` => false, denying
    ///     every early user. Build 40 also grandfathers 1.22.0 (build 39) users.
    ///   - macOS: it's `CFBundleShortVersionString` — the MARKETING version. Pro
    ///     ships on Mac in 1.22.7, so the cutoff is the version triple [1,22,7].
    ///     The Mac App Store was live at 1.21.10 when Pro launched on Mac, so
    ///     every existing Mac install is < 1.22.7 ⇒ founder (mirrors the iOS
    ///     "everyone before the paywall" intent).
    ///
    /// ⚠️ The macOS value MUST equal the MARKETING_VERSION of the build that
    /// actually introduces the paywall. If you ship a gating-OFF catch-up build
    /// as 1.22.7 and add the paywall in 1.22.8 instead, bump this to [1,22,8] —
    /// otherwise users who first installed the free 1.22.7 would be wrongly
    /// paywalled, or new 1.22.7 buyers wrongly granted founder.
    ///
    /// Cross-platform note: a founder on one platform is recognized on the other
    /// via the iCloud-synced `CloudKey.founder` bit — the grant isn't a StoreKit
    /// purchase, so it can't ride Universal Purchase the way a subscription does.
    #if os(iOS)
    static let founderCutoff = AppVersion([40])
    #else
    static let founderCutoff = AppVersion([1, 22, 7])
    #endif

    // MARK: App-local cache keys

    private enum Key {
        static let isFounder  = "pro_isFounder"
        static let originalAppVersion = "pro_originalAppVersion"
        /// Debug-only override read from standard UserDefaults. Set to a Bool
        /// to force founder status on/off in sandbox/TestFlight, where
        /// `originalAppVersion` is unreliable. Remove the key to use the real
        /// value. (Never set in production builds.)
        static let debugFounderOverride = "debug_pro_founderOverride"
    }

    /// Keys in `NSUbiquitousKeyValueStore` (iCloud), synced per-Apple-ID across
    /// the user's own devices with no backend and no accounts.
    private enum CloudKey {
        /// The cross-platform founder bit. We only ever WRITE `true` here; a
        /// local "not a founder" result (e.g. a fresh post-paywall install on a
        /// second platform) must NEVER clobber a founder grant set by the user's
        /// other device. This is what lets an iPhone founder stay Pro when they
        /// later install the Mac app (and vice versa) — the founder grant isn't a
        /// StoreKit purchase, so it can't sync over the Universal Purchase
        /// entitlement rail the way a real subscription does.
        static let founder = "pro_founderCloud"
    }

    // MARK: Published state

    @Published private(set) var products: [Product] = []
    @Published private(set) var activeProductIDs: Set<String> = []
    @Published private(set) var isFounder = false
    @Published private(set) var isLoadingProducts = false
    @Published private(set) var purchaseInFlight = false
    @Published private(set) var subscriptionDetails: SubscriptionDetails?
    @Published var lastError: String?

    /// The single gate the rest of the app should read.
    var isPro: Bool { isFounder || !activeProductIDs.isEmpty }

    /// Where the user's Pro access comes from. Drives the management screen:
    /// founders have no Apple subscription to manage, subscribers do.
    enum ProStatus { case none, founder, subscribed }

    var status: ProStatus {
        if isFounder { return .founder }
        if !activeProductIDs.isEmpty { return .subscribed }
        return .none
    }

    /// Snapshot of the active auto-renewable subscription, for the management
    /// screen (plan name, renewal/expiry, auto-renew flag, and the transaction
    /// id needed to start a refund request). `nil` for founders / non-Pro.
    struct SubscriptionDetails: Equatable {
        var planName: String
        var renewalDate: Date?
        var autoRenews: Bool
        var transactionID: UInt64
    }

    /// Convenience accessors for the paywall.
    var monthlyProduct: Product? { products.first { $0.id == ProductID.monthly } }
    var annualProduct: Product? { products.first { $0.id == ProductID.annual } }

    private let cache = UserDefaults.standard

    /// iCloud key-value store used to sync the founder bit across the user's own
    /// devices (see `CloudKey.founder`). Backend-free, no accounts. Requires the
    /// `com.apple.developer.ubiquity-kvstore-identifier` entitlement on the app
    /// target; without it these calls quietly no-op (founder just stays local).
    private let cloud = NSUbiquitousKeyValueStore.default

    /// Founder result derived from THIS platform's local `AppTransaction` check.
    private var localFounder = false
    /// Founder bit propagated from another of the user's devices via iCloud.
    private var cloudFounder = false

    private var updatesTask: Task<Void, Never>?

    private init() {
        // Seed from caches immediately so the first frame doesn't flash the
        // wrong state before the async resolution finishes. The published gate
        // is the OR of the local check and the iCloud-synced bit.
        localFounder = cache.bool(forKey: Key.isFounder)
        cloudFounder = cloud.bool(forKey: CloudKey.founder)
        isFounder = localFounder || cloudFounder

        // React when the founder bit arrives from another device — e.g. the
        // user was a founder on iPhone and just installed the Mac app fresh.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(cloudStoreDidChange(_:)),
            name: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: cloud
        )
        cloud.synchronize()

        updatesTask = listenForTransactions()

        Task {
            await resolveFounderStatus()
            await refreshEntitlements()
            await loadProducts()
        }
    }

    deinit {
        updatesTask?.cancel()
        NotificationCenter.default.removeObserver(self)
    }

    // MARK: Founder grant

    /// Derive founder status from the original (first-installed) app version.
    /// Falls back to the cached value if `AppTransaction` can't be read (e.g.
    /// offline on a cold first launch).
    func resolveFounderStatus() async {
        // Debug override wins, for testing both paths. Bypasses iCloud entirely
        // (read and write) so the non-founder path stays testable even if a
        // previous run set the cloud bit on this Apple ID.
        if let override = debugFounderOverride() {
            localFounder = override
            cloudFounder = false
            isFounder = override
            cache.set(override, forKey: Key.isFounder)
            cache.set("debug-override", forKey: Key.originalAppVersion)
            persistIsPro()
            return
        }

        if #available(iOS 16.0, macOS 13.0, *) {
            await resolveFounderViaAppTransaction()
        } else {
            // iOS 15: AppTransaction is unavailable. Use a backend-free
            // heuristic — anyone who already has prior-version data is an
            // existing (pre-1.22.0) user, so grandfather them. Evaluate only
            // once (when nothing is cached yet) so a brand-new install that
            // later accumulates data isn't retroactively promoted.
            if cache.object(forKey: Key.isFounder) == nil {
                let founder = hasLegacyInstallData()
                Log.app.info("Founder check (iOS 15 heuristic): legacyData => \(founder)")
                applyFounder(founder, originalVersion: "ios15-heuristic")
            }
        }
    }

    @available(iOS 16.0, macOS 13.0, *)
    private func resolveFounderViaAppTransaction() async {
        do {
            let result = try await AppTransaction.shared
            guard case .verified(let appTransaction) = result else {
                // Couldn't verify — keep cached value rather than revoking.
                Log.app.warn("AppTransaction unverified; keeping cached founder=\(self.isFounder)")
                return
            }

            let originalString = appTransaction.originalAppVersion
            guard let original = AppVersion(string: originalString) else {
                Log.app.warn("Unparseable originalAppVersion '\(originalString)'; founder=false")
                applyFounder(false, originalVersion: originalString)
                return
            }

            let founder = original < Self.founderCutoff
            Log.app.info("Founder check: original \(original) < cutoff \(Self.founderCutoff) => \(founder)")
            applyFounder(founder, originalVersion: originalString)
        } catch {
            // Network/StoreKit hiccup. Don't downgrade an existing grant.
            Log.app.warn("AppTransaction.shared failed (\(error.localizedDescription)); keeping cached founder=\(self.isFounder)")
        }
    }

    /// Best-effort "this user installed before the Pro release" signal for the
    /// iOS 15 path, where `originalAppVersion` isn't readable. Uses app-local
    /// signals only (no App Group access): a fresh install has neither a
    /// completed onboarding nor saved favorites.
    private func hasLegacyInstallData() -> Bool {
        if UserDefaults.standard.bool(forKey: "spoofOnboardingCompleted") { return true }
        // Favorites are persisted app-local by SpoofController ("app_favorites").
        if UserDefaults.standard.data(forKey: "app_favorites") != nil { return true }
        return false
    }

    private func applyFounder(_ value: Bool, originalVersion: String) {
        localFounder = value
        cache.set(originalVersion, forKey: Key.originalAppVersion)
        recomputeFounder()
    }

    /// Fold the local check and the iCloud-synced bit into the published
    /// `isFounder` gate, cache the local result, and propagate a positive grant
    /// to the user's other devices. Only ever WRITES `true` to iCloud, so a
    /// local negative (a fresh post-paywall install on a second platform) can't
    /// erase a founder grant the user earned on their other device.
    private func recomputeFounder() {
        let combined = localFounder || cloudFounder
        isFounder = combined
        cache.set(localFounder, forKey: Key.isFounder)
        if combined && !cloud.bool(forKey: CloudKey.founder) {
            cloud.set(true, forKey: CloudKey.founder)
            cloud.synchronize()
        }
        persistIsPro()
    }

    /// iCloud reports the KV store changed on another device. Re-read the
    /// founder bit and only ever let it turn the grant ON (never off). Ignored
    /// while a debug override is active so it can't fight the override.
    @objc nonisolated private func cloudStoreDidChange(_ note: Notification) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            if self.debugFounderOverride() != nil { return }
            if self.cloud.bool(forKey: CloudKey.founder), !self.cloudFounder {
                self.cloudFounder = true
                self.recomputeFounder()
            }
        }
    }

    private func debugFounderOverride() -> Bool? {
        #if DEBUG
        guard UserDefaults.standard.object(forKey: Key.debugFounderOverride) != nil else { return nil }
        return UserDefaults.standard.bool(forKey: Key.debugFounderOverride)
        #else
        return nil
        #endif
    }

    #if DEBUG
    /// Current debug override as a picker tag: 0 = auto (real check), 1 = force
    /// founder, 2 = force not-founder.
    static func debugProOverrideSelection() -> Int {
        guard UserDefaults.standard.object(forKey: Key.debugFounderOverride) != nil else { return 0 }
        return UserDefaults.standard.bool(forKey: Key.debugFounderOverride) ? 1 : 2
    }

    /// Set (or clear with `nil`) the founder override and immediately re-resolve
    /// so the UI updates without a relaunch. DEBUG only.
    static func setDebugFounderOverride(_ value: Bool?) {
        if let value {
            UserDefaults.standard.set(value, forKey: Key.debugFounderOverride)
        } else {
            UserDefaults.standard.removeObject(forKey: Key.debugFounderOverride)
        }
        Task { await ProStore.shared.resolveFounderStatus() }
    }
    #endif

    // MARK: Products

    func loadProducts() async {
        isLoadingProducts = true
        defer { isLoadingProducts = false }
        do {
            let loaded = try await Product.products(for: ProductID.all)
            // Stable order: annual first (the plan we want to anchor), monthly second.
            products = loaded.sorted { lhs, _ in lhs.id == ProductID.annual }
            Log.app.info("Loaded \(self.products.count) Pro products")
        } catch {
            lastError = error.localizedDescription
            Log.app.error("Product load failed: \(error.localizedDescription)")
        }
    }

    // MARK: Purchase / restore

    /// Returns true if the purchase completed and unlocked Pro.
    @discardableResult
    func purchase(_ product: Product) async -> Bool {
        guard !purchaseInFlight else { return false }
        purchaseInFlight = true
        defer { purchaseInFlight = false }

        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                guard case .verified(let transaction) = verification else {
                    lastError = "Purchase could not be verified."
                    return false
                }
                await transaction.finish()
                await refreshEntitlements()
                return isPro
            case .userCancelled:
                return false
            case .pending:
                // Ask-to-buy / SCA — entitlement arrives later via Transaction.updates.
                return false
            @unknown default:
                return false
            }
        } catch {
            lastError = error.localizedDescription
            Log.app.error("Purchase failed: \(error.localizedDescription)")
            return false
        }
    }

    /// Restore purchases. Required by App Review for any non-restoring product.
    func restore() async {
        do {
            try await AppStore.sync()
        } catch {
            lastError = error.localizedDescription
            Log.app.warn("AppStore.sync failed: \(error.localizedDescription)")
        }
        await refreshEntitlements()
    }

    // MARK: Entitlement resolution

    /// Recompute active subscriptions from the current entitlements and cache
    /// the result. Safe to call repeatedly.
    func refreshEntitlements() async {
        var active: Set<String> = []
        var activeTransaction: StoreKit.Transaction?
        for await result in Transaction.currentEntitlements {
            guard case .verified(let transaction) = result else { continue }
            guard transaction.productType == .autoRenewable,
                  ProductID.all.contains(transaction.productID),
                  transaction.revocationDate == nil else { continue }
            // currentEntitlements already excludes lapsed subs, but guard the
            // expiration date too for belt-and-suspenders.
            if let expiry = transaction.expirationDate, expiry < .now { continue }
            active.insert(transaction.productID)
            activeTransaction = transaction
        }
        activeProductIDs = active
        await updateSubscriptionDetails(from: activeTransaction)
        persistIsPro()
    }

    /// Build the management-screen snapshot from the active transaction.
    private func updateSubscriptionDetails(from transaction: StoreKit.Transaction?) async {
        guard let transaction else {
            subscriptionDetails = nil
            return
        }

        // Best-effort auto-renew flag from the product's subscription status.
        var autoRenews = true
        var product = products.first { $0.id == transaction.productID }
        if product == nil {
            product = (try? await Product.products(for: [transaction.productID]))?.first
        }
        if let statuses = try? await product?.subscription?.status,
           let status = statuses.first,
           case .verified(let renewalInfo) = status.renewalInfo {
            autoRenews = renewalInfo.willAutoRenew
        }

        subscriptionDetails = SubscriptionDetails(
            planName: planName(for: transaction.productID),
            renewalDate: transaction.expirationDate,
            autoRenews: autoRenews,
            transactionID: transaction.id
        )
    }

    private func planName(for productID: String) -> String {
        if let product = products.first(where: { $0.id == productID }),
           !product.displayName.isEmpty {
            return product.displayName
        }
        switch productID {
        case ProductID.annual: return "Annual"
        case ProductID.monthly: return "Monthly"
        default: return "Pro"
        }
    }

    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached { [weak self] in
            for await result in Transaction.updates {
                guard case .verified(let transaction) = result else { continue }
                await transaction.finish()
                await self?.refreshEntitlements()
            }
        }
    }

    // MARK: Broadcast

    /// Broadcast the current entitlement so app-local listeners (the VPN
    /// auto-sync gate) can react. Intentionally does NOT touch the App Group —
    /// see the file header.
    private func persistIsPro() {
        NotificationCenter.default.post(
            name: .proEntitlementDidChange,
            object: nil,
            userInfo: ["isPro": isPro]
        )
    }
}
