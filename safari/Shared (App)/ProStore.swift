//
//  ProStore.swift
//  Shared (App)
//
//  GeoSpoof Pro entitlement + purchase layer (StoreKit 2).
//
//  Three ways to be Pro:
//    1. Founder grant — anyone whose *first* downloaded version is below
//       `founderCutoff` (iOS build 40 / macOS 1.22.7) gets Pro free forever.
//       Resolved from `AppTransaction.originalAppVersion` in PRODUCTION only —
//       the sandbox/Xcode environments (App Review + TestFlight) report a "1.0"
//       sentinel that would wrongly grant everyone founder and hide the paywall,
//       so the grant is never applied there (see `captureFounderProof`). Synced
//       across the
//       user's devices via CloudKit (with iCloud KVS kept as a redundant
//       fallback rail), and made PERMANENT once seen (never revoked, even if a
//       later read is flaky). Needs no sign-in and no backend of our own. This
//       is our thank-you to early users.
//    2. Active subscription — monthly or annual auto-renewable.
//    3. Lifetime unlock — a one-time non-consumable purchase. Never expires,
//       and rides Apple's Universal Purchase rail across iOS/iPadOS/macOS on
//       its own (no iCloud-sync workaround, unlike the founder grant).
//
//  `isPro = isFounder || ownsLifetime || hasActiveSubscription`.
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
import CloudKit
#if os(iOS)
import UIKit
#elseif os(macOS)
import AppKit
#endif

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

// MARK: - Debug Pro override

/// Debug-only Pro override (Settings → Pro Override). Forces exactly one entitlement source
/// so each tier's UI can be exercised without real StoreKit (e.g. on the simulator, where
/// `originalAppVersion` and purchases aren't available). Compiled behavior is gated to
/// DEBUG — in release the override always resolves to `.auto`.
///
/// NOTE: an override only changes the app's LOCAL `isPro`. It does NOT produce a signed
/// StoreKit proof, so the GeoSpoof GPS desktop agent still won't grant Pro from it — test
/// the desktop/GPS path with a real (or StoreKit-config) purchase instead.
enum DebugProOverride: Int {
    case auto = 0 // real check
    case founder = 1 // force founding-supporter grant
    case notPro = 2 // force no entitlement
    case subscription = 3 // force an active subscription
}

// MARK: - ProStore

@MainActor
final class ProStore: ObservableObject {
    static let shared = ProStore()

    // MARK: Product IDs

    enum ProductID {
        static let monthly = "com.moonloaf.geospoof.pro.monthly"
        static let annual  = "com.moonloaf.geospoof.pro.annual"
        /// One-time, non-consumable. Unlike the subscriptions it never expires
        /// and — being a real purchase, not the founder *grant* — it rides
        /// Apple's Universal Purchase rail across iOS/iPadOS/macOS with no
        /// iCloud-sync workaround.
        static let lifetime = "com.moonloaf.geospoof.pro.lifetime"
        /// Auto-renewable subscriptions only (used to filter subscription
        /// entitlements). The lifetime non-consumable is handled separately.
        static let subscriptions: Set<String> = [monthly, annual]
        static let all: Set<String> = [monthly, annual, lifetime]
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
    /// via the synced founder grant (CloudKit private DB, with KVS as a fallback
    /// rail) — the grant isn't a StoreKit purchase, so it can't ride Universal
    /// Purchase the way a subscription does.
    #if os(iOS)
    static let founderCutoff = AppVersion([40])
    #else
    static let founderCutoff = AppVersion([1, 22, 7])
    #endif

    // MARK: App-local cache keys

    private enum Key {
        static let isFounder  = "pro_isFounder"
        static let originalAppVersion = "pro_originalAppVersion"
        /// The last VERIFIED signed `AppTransaction` JWS. Persisted so the GPS agent's
        /// founder proof survives launches where `AppTransaction.shared` can't be
        /// re-verified (offline, transient StoreKit/beta-OS hiccup) — the founder grant is
        /// permanent, so its Apple-signed evidence must be durable too, not re-derived
        /// live every launch. Only ever written from a `.verified` result.
        static let appTransactionJWS = "pro_appTransactionJWS"
        /// Debug-only override read from standard UserDefaults. Stores a
        /// `DebugProOverride` raw Int to force a Pro tier (founder / not-Pro /
        /// subscription) where real StoreKit isn't available (simulator / dev builds).
        /// Absent = auto (real check). Never set in production builds.
        static let debugProOverride = "debug_pro_override"
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
    /// Whether the user owns the one-time lifetime unlock (non-consumable).
    @Published private(set) var ownsLifetime = false
    @Published private(set) var isFounder = false
    @Published private(set) var isLoadingProducts = false
    @Published private(set) var purchaseInFlight = false
    @Published private(set) var subscriptionDetails: SubscriptionDetails?
    /// Transaction id of the lifetime purchase, for the refund-request sheet.
    /// `nil` unless the user bought lifetime.
    @Published private(set) var lifetimeTransactionID: UInt64?
    @Published var lastError: String?

    /// The single gate the rest of the app should read.
    var isPro: Bool { isFounder || ownsLifetime || !activeProductIDs.isEmpty }

    /// Where the user's Pro access comes from. Drives the management screen:
    /// founders have no Apple purchase to manage, lifetime owners have a one-
    /// time purchase (refundable, nothing to cancel), subscribers have a
    /// cancelable subscription.
    enum ProStatus { case none, founder, lifetime, subscribed }

    var status: ProStatus {
        // Precedence: a founder grant and a lifetime purchase both mean "Pro
        // forever, nothing to cancel", so they outrank an active subscription
        // for what the management screen shows. Founder wins over lifetime
        // (it's free — never steer a founder toward managing a purchase).
        if isFounder { return .founder }
        if ownsLifetime { return .lifetime }
        if !activeProductIDs.isEmpty { return .subscribed }
        return .none
    }

    /// True while an auto-renewable subscription is active on this account.
    var hasActiveSubscription: Bool { !activeProductIDs.isEmpty }

    /// A current subscriber who could pay once for the lifetime unlock instead.
    /// (`status` is exactly `.subscribed` in this case, since owning lifetime
    /// would outrank it.) Gated on the lifetime product having loaded so the UI
    /// can show its price. There is NO StoreKit "crossgrade" from a subscription
    /// to a non-consumable — the switch is just a normal purchase of the
    /// lifetime product, after which the user cancels the subscription
    /// themselves (see `hasRedundantSubscription`).
    var canUpgradeToLifetime: Bool {
        hasActiveSubscription && !ownsLifetime && lifetimeProduct != nil
    }

    /// Owns the lifetime unlock but still has an auto-renewable subscription
    /// billing on the account — e.g. right after switching to Lifetime. We
    /// can't cancel it for them (only Apple's Manage Subscriptions can), so the
    /// UI nudges them to cancel; otherwise they'd keep paying for access they
    /// already own forever.
    var hasRedundantSubscription: Bool { ownsLifetime && hasActiveSubscription }

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
    var lifetimeProduct: Product? { products.first { $0.id == ProductID.lifetime } }

    private let cache = UserDefaults.standard

    /// iCloud key-value store used to sync the founder bit across the user's own
    /// devices (see `CloudKey.founder`). Backend-free, no accounts. Requires the
    /// `com.apple.developer.ubiquity-kvstore-identifier` entitlement on the app
    /// target; without it these calls quietly no-op (founder just stays local).
    private let cloud = NSUbiquitousKeyValueStore.default

    /// Founder result derived from THIS platform's local `AppTransaction` check.
    private var localFounder = false
    /// Founder bit propagated from another of the user's devices via iCloud KVS.
    private var cloudFounder = false
    /// Founder bit propagated via the CloudKit private database — the durable
    /// cross-device channel. KVS (`cloudFounder`) is kept in parallel as a
    /// redundant, best-effort fallback: both are OR'd into the grant and we
    /// write `true` to both, so a value that fails to propagate on one rail can
    /// still arrive on the other.
    private var cloudKitFounder = false
    /// Set once we've pushed a positive grant to CloudKit this launch, so a
    /// frequently-called `recomputeFounder()` doesn't spam the network.
    private var cloudKitGrantPushed = false
    /// Latched true once THIS session verifies a non-production StoreKit
    /// environment (App Review / TestFlight sandbox, or Xcode StoreKit testing).
    /// When set, founder is forced OFF and every rail that could turn it back on
    /// — the app-local cache, the iCloud KVS bit, and the CloudKit grant — is
    /// ignored, so a bogus grant an earlier build synced to this Apple ID can
    /// never re-hide the paywall + In-App Purchases from a reviewer or tester.
    /// Production installs never set this, so real founders are unaffected.
    private var founderSuppressedByEnvironment = false

    /// Signed StoreKit entitlement proof (JWS strings), captured during entitlement /
    /// founder resolution and broadcast via `proEntitlementDidChange` so `SpoofModel` can
    /// write it into `desired.json`. The GeoSpoof GPS desktop agent verifies these OFFLINE
    /// (Apple signature + X.509 chain) — the tamper-resistant replacement for the unsigned
    /// `pro` bool. `appTransactionJWS` proves the founder grant (via its
    /// `originalAppVersion`); each entry in `entitlementTransactionsJWS` is a current
    /// lifetime / active-subscription transaction.
    private var appTransactionJWS: String?
    private var entitlementTransactionsJWS: [String] = []

    private var updatesTask: Task<Void, Never>?

    private init() {
        // Seed from caches immediately so the first frame doesn't flash the
        // wrong state before the async resolution finishes. The published gate
        // is the OR of the local check and the iCloud-synced bit.
        localFounder = cache.bool(forKey: Key.isFounder)
        cloudFounder = cloud.bool(forKey: CloudKey.founder)
        isFounder = localFounder || cloudFounder
        // Restore the last verified AppTransaction JWS so we can hand the GPS agent its
        // founder proof even on a launch where `AppTransaction.shared` doesn't re-verify
        // (offline / transient). Refreshed whenever a new verified one arrives.
        appTransactionJWS = cache.string(forKey: Key.appTransactionJWS)

        // React when the founder bit arrives from another device — e.g. the
        // user was a founder on iPhone and just installed the Mac app fresh.
        NotificationCenter.default.addObserver(
            self,
            selector: #selector(cloudStoreDidChange(_:)),
            name: NSUbiquitousKeyValueStore.didChangeExternallyNotification,
            object: cloud
        )
        cloud.synchronize()

        // Re-pull the founder bit whenever the app comes to the foreground.
        // iCloud KVS is eventually-consistent, so a single init-time read can
        // miss a bit another device wrote (notably on beta OSes, where this
        // first surfaced). A foreground re-sync gives the grant another chance
        // to arrive without the user doing anything.
        #if os(iOS)
        NotificationCenter.default.addObserver(
            self, selector: #selector(appBecameActive),
            name: UIApplication.didBecomeActiveNotification, object: nil)
        #elseif os(macOS)
        NotificationCenter.default.addObserver(
            self, selector: #selector(appBecameActive),
            name: NSApplication.didBecomeActiveNotification, object: nil)
        #endif

        updatesTask = listenForTransactions()

        // Pull the durable CloudKit grant in parallel with the KVS read above.
        refreshCloudKitFounder()

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
        #if DEBUG
        // Debug override wins, for testing each tier. Bypasses iCloud entirely (read and
        // write) so any path stays testable even if a previous run synced a grant.
        if debugProOverride() != .auto {
            applyDebugOverride()
            return
        }
        #endif

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
                Log.pro.info("Founder check (iOS 15 heuristic): legacyData => \(founder)")
                applyFounder(founder, originalVersion: "ios15-heuristic")
            }
        }
    }

    @available(iOS 16.0, macOS 13.0, *)
    private func resolveFounderViaAppTransaction() async {
        // Apple's documented pattern: read the cached `AppTransaction.shared` first (silent,
        // no prompt), and only fall back to `AppTransaction.refresh()` if that fails —
        // "If your app fails to get an AppTransaction by accessing the shared property, see
        // refresh()." `refresh()` fetches from the App Store and can present a one-time
        // Apple Account sign-in, so we gate it: it runs ONLY when the silent path failed AND
        // we have no previously-persisted signed proof to fall back on. That's what makes a
        // fresh install obtain the founder proof without the user having to delete/reinstall,
        // while never nagging a user who already has (or can silently get) the receipt.

        // 1. Silent path — the locally-cached transaction.
        if let result = try? await AppTransaction.shared,
           case .verified(let appTransaction) = result {
            captureFounderProof(appTransaction, jws: result.jwsRepresentation)
            return
        }

        // 2. Silent path didn't yield a verified transaction. If we already persisted a
        //    signed proof on a prior launch, keep using it — no fetch, no sign-in prompt.
        if appTransactionJWS != nil {
            Log.pro.warn("AppTransaction.shared unavailable; using previously cached signed proof (founder=\(self.isFounder))")
            return
        }

        // 3. No proof at all yet — actively fetch it (may present a one-time sign-in). This
        //    is the fresh-install recovery that avoids the delete/reinstall workaround.
        if let refreshed = try? await AppTransaction.refresh(),
           case .verified(let appTransaction) = refreshed {
            Log.pro.info("AppTransaction obtained via refresh() fallback")
            captureFounderProof(appTransaction, jws: refreshed.jwsRepresentation)
            return
        }

        // Neither path worked (offline with no cache, or StoreKit error). Don't downgrade an
        // existing grant — keep the cached founder status; we'll try again next launch.
        Log.pro.warn("AppTransaction unavailable (shared + refresh); keeping cached founder=\(self.isFounder)")
    }

    /// Record the signed AppTransaction as the GPS agent's founder proof and resolve founder
    /// status from its `originalAppVersion`. Persists the JWS so a later launch that can't
    /// re-verify still has durable proof to send (the founder grant is permanent).
    @available(iOS 16.0, macOS 13.0, *)
    private func captureFounderProof(_ appTransaction: AppTransaction, jws: String) {
        appTransactionJWS = jws
        cache.set(jws, forKey: Key.appTransactionJWS)

        // The founder grant is derived from `originalAppVersion`, but that value
        // is only the customer's REAL first-installed version in the PRODUCTION
        // App Store environment. In the sandbox (which App Review *and* TestFlight
        // use for purchases) and in Xcode StoreKit testing, it's a fixed sentinel
        // — the sandbox always reports "1.0" — which parses to [1,0] and is below
        // every `founderCutoff`. Trusting it there silently grants free founder
        // Pro to every reviewer/tester, which flips `isPro` on and HIDES the
        // paywall and all In-App Purchases. That's exactly why App Review reported
        // it "cannot locate the In-App Purchases, such as Pro Lifetime".
        //
        // So resolve the grant ONLY from a production transaction. In any other
        // environment, leave founder status untouched: a real production grant
        // that's already cached is preserved (founder is permanent), while a
        // fresh sandbox/review install stays non-Pro and sees the paywall + IAPs.
        guard isProductionEnvironment(appTransaction) else {
            // A VERIFIED non-production transaction is definitive proof we're in
            // the App Review / TestFlight sandbox or Xcode StoreKit testing. The
            // paywall + IAPs MUST be reachable here, so force founder OFF for the
            // session and ignore any cached or iCloud-synced grant: an earlier
            // buggy build may have pushed a bogus founder bit to the iCloud KVS /
            // CloudKit rails for this Apple ID, and that residue (which survives
            // reinstalls and syncs to every device on the account) must never
            // re-hide the purchases. We never persist `false`, so a genuine
            // production grant on this same device stays intact for its next
            // production launch.
            Log.pro.info("Non-production StoreKit environment (originalAppVersion '\(appTransaction.originalAppVersion)'): forcing founder OFF so the paywall + IAPs are visible.")
            suppressFounderForNonProduction()
            return
        }

        let originalString = appTransaction.originalAppVersion
        guard let original = AppVersion(string: originalString) else {
            Log.pro.warn("Unparseable originalAppVersion '\(originalString)'; founder=false")
            applyFounder(false, originalVersion: originalString)
            return
        }

        let founder = original < Self.founderCutoff
        Log.pro.info("Founder check: original \(original) < cutoff \(Self.founderCutoff) => \(founder)")
        applyFounder(founder, originalVersion: originalString)
    }

    /// True only for the PRODUCTION App Store environment, where
    /// `originalAppVersion` is the customer's real first-installed version and the
    /// founder comparison is meaningful.
    ///
    /// Uses StoreKit's typed `AppTransaction.environment` where available
    /// (iOS 16.4+ / macOS 13.3+). On iOS 16.0–16.3, where that property doesn't
    /// exist, fall back to rejecting the sandbox's fixed "1.0" sentinel: a real
    /// production iOS `originalAppVersion` is a plain build integer (e.g. "40"),
    /// never the dotted "1.0", and the Mac app's first-ever release was 1.21.10,
    /// so "1.0" never appears in production on either platform.
    @available(iOS 16.0, macOS 13.0, *)
    private func isProductionEnvironment(_ appTransaction: AppTransaction) -> Bool {
        if #available(iOS 16.4, macOS 13.3, *) {
            return appTransaction.environment == .production
        } else {
            return appTransaction.originalAppVersion != "1.0"
        }
    }

    /// Force founder OFF for this session because we verified a non-production
    /// StoreKit environment (App Review / TestFlight sandbox, or Xcode). Latches
    /// `founderSuppressedByEnvironment` so the async iCloud KVS / CloudKit rails
    /// can't turn it back on, and clears the in-memory synced flags. Never writes
    /// `false` to the local cache or the cloud rails — a real production grant on
    /// this device (or another of the user's devices) is preserved.
    private func suppressFounderForNonProduction() {
        founderSuppressedByEnvironment = true
        localFounder = false
        cloudFounder = false
        cloudKitFounder = false
        let was = isFounder
        isFounder = false
        if was {
            Log.pro.info("Founder forced OFF (non-production environment); ignoring cached/synced grant.")
        }
        persistIsPro()
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

    /// Fold the local check, both synced bits (KVS + CloudKit), and any prior
    /// grant into the published `isFounder` gate, then propagate a positive
    /// grant to the user's other devices over both rails. Founder is PERMANENT:
    /// once a device has ever seen the grant we OR it back in, so a later flaky
    /// read can't revoke it — `AppTransaction` going unverified on a beta OS, a
    /// regenerated macOS receipt reporting a recent `originalAppVersion`, or a
    /// sync that hasn't landed yet. We only ever WRITE `true`, never `false`.
    private func recomputeFounder() {
        // A verified non-production environment (App Review / TestFlight / Xcode)
        // suppresses founder unconditionally — no cached or synced bit may
        // re-enable it, and we must not persist or propagate a grant from here.
        if founderSuppressedByEnvironment {
            if isFounder { isFounder = false }
            persistIsPro()
            return
        }
        let everGranted = cache.bool(forKey: Key.isFounder)
        let combined = localFounder || cloudFounder || cloudKitFounder || everGranted
        let was = isFounder
        isFounder = combined
        cache.set(combined, forKey: Key.isFounder)
        // Make the decision observable: the local check logs its own line, but
        // the grant can also come from a synced rail or the cached prior grant,
        // which otherwise looks like founder appearing "from nowhere". Log the
        // inputs whenever the resolved status flips.
        if combined != was {
            Log.pro.info("Founder status → \(combined) (local=\(localFounder) kvs=\(cloudFounder) cloudKit=\(cloudKitFounder) cached=\(everGranted))")
        }
        if combined {
            // KVS rail.
            if !cloud.bool(forKey: CloudKey.founder) {
                cloud.set(true, forKey: CloudKey.founder)
                cloud.synchronize()
            }
            // CloudKit rail — push at most once per launch (the helper also
            // no-ops if the record already exists).
            if !cloudKitGrantPushed {
                cloudKitGrantPushed = true
                Task { await FounderCloud.setGranted() }
            }
        }
        persistIsPro()
    }

    /// iCloud reports the KV store changed on another device. Re-read the
    /// founder bit and only ever let it turn the grant ON (never off). Ignored
    /// while a debug override is active so it can't fight the override.
    @objc nonisolated private func cloudStoreDidChange(_ note: Notification) {
        Task { @MainActor [weak self] in
            guard let self else { return }
            if self.debugProOverride() != .auto { return }
            if self.founderSuppressedByEnvironment { return }
            if self.cloud.bool(forKey: CloudKey.founder), !self.cloudFounder {
                self.cloudFounder = true
                self.recomputeFounder()
            }
        }
    }

    /// App returned to the foreground — nudge iCloud and re-read the founder
    /// bit, in case it was written by another device while we were backgrounded
    /// or hadn't synced down yet at launch.
    @objc nonisolated private func appBecameActive() {
        Task { @MainActor [weak self] in
            guard let self else { return }
            if self.debugProOverride() != .auto { return }
            if self.founderSuppressedByEnvironment { return }
            self.cloud.synchronize()
            if self.cloud.bool(forKey: CloudKey.founder), !self.cloudFounder {
                self.cloudFounder = true
                self.recomputeFounder()
            }
            // Also re-pull the durable CloudKit grant.
            self.refreshCloudKitFounder()
        }
    }

    /// Fetch the founder grant from the CloudKit private database (off the main
    /// actor) and, if present, OR it into the gate. Only ever turns the grant
    /// ON. Silent on no-account / network failure — the grant just stays at
    /// whatever the local check and KVS produced.
    private func refreshCloudKitFounder() {
        if debugProOverride() != .auto { return }
        Task { [weak self] in
            let granted = await FounderCloud.fetchGranted()
            guard granted else { return }
            guard let self else { return }
            if self.founderSuppressedByEnvironment { return }
            if !self.cloudKitFounder {
                self.cloudKitFounder = true
                self.recomputeFounder()
            }
        }
    }

    /// The active debug override (`.auto` in release, or when no override is set).
    private func debugProOverride() -> DebugProOverride {
        #if DEBUG
        let raw = (UserDefaults.standard.object(forKey: Key.debugProOverride) as? Int) ?? 0
        return DebugProOverride(rawValue: raw) ?? .auto
        #else
        return .auto
        #endif
    }

    #if DEBUG
    /// Force the published entitlement state to match the debug override, then broadcast.
    /// Sets exactly one Pro source so `isPro`/`status` reflect the chosen tier. Only ever
    /// runs while an override is active (release resolves to `.auto`, so this isn't called).
    ///
    /// For the `.subscription` override: the UI state is faked (so the force-subscription
    /// flow works without a real purchase), but we also collect real signed JWS from
    /// `Transaction.currentEntitlements` if any exist — that way the GPS agent can verify
    /// the subscription cryptographically (the full tested path), rather than falling back
    /// to the unsigned legacy `pro` bool (which only a debug agent would accept).
    private func applyDebugOverride() {
        let ov = debugProOverride()
        localFounder = (ov == .founder)
        cloudFounder = false
        cloudKitFounder = false
        isFounder = (ov == .founder)
        ownsLifetime = false
        if ov == .subscription {
            activeProductIDs = [ProductID.annual]
            subscriptionDetails = SubscriptionDetails(
                planName: "Annual (debug)",
                renewalDate: Calendar.current.date(byAdding: .year, value: 1, to: .now),
                autoRenews: true,
                transactionID: 0
            )
            // Collect real transaction JWS from StoreKit so the GPS agent can
            // verify the subscription cryptographically. This is the key difference
            // from the old path that left `entitlementTransactionsJWS` empty:
            // with an empty array the agent saw transaction_count=0 and said "Not Pro"
            // even on a debug build that accepts Xcode-env proofs.
            Task {
                var proofJWS: [String] = []
                for await result in Transaction.currentEntitlements {
                    if let tx = acceptableTransaction(result) {
                        proofJWS.append(result.jwsRepresentation)
                        _ = tx // silence unused warning
                    }
                }
                // Only update if we actually found something — if no purchase exists yet
                // (user hasn't bought the sub in the local StoreKit config), leave it
                // empty so the agent falls back to the debug unsigned bool as before.
                if !proofJWS.isEmpty {
                    self.entitlementTransactionsJWS = proofJWS
                }
                self.persistIsPro()
            }
            // Broadcast immediately with whatever JWS we already have (may be empty on
            // the first call before the Task above finishes; the Task re-broadcasts).
        } else {
            activeProductIDs = []
            subscriptionDetails = nil
        }
        cache.set(isFounder, forKey: Key.isFounder)
        cache.set("debug-override", forKey: Key.originalAppVersion)
        persistIsPro()
    }

    /// Current debug override as a picker tag (see `DebugProOverride`): 0 = auto, 1 =
    /// founder, 2 = not Pro, 3 = subscription.
    static func debugProOverrideSelection() -> Int {
        (UserDefaults.standard.object(forKey: Key.debugProOverride) as? Int) ?? 0
    }

    /// Set the override to a picker tag (0 = auto, which clears it) and immediately
    /// re-resolve so the UI updates without a relaunch. DEBUG only. Re-runs both resolvers
    /// so clearing back to auto restores the real founder + entitlement state.
    static func setDebugProOverride(_ tag: Int) {
        if tag == DebugProOverride.auto.rawValue {
            UserDefaults.standard.removeObject(forKey: Key.debugProOverride)
        } else {
            UserDefaults.standard.set(tag, forKey: Key.debugProOverride)
        }
        Task {
            await ProStore.shared.resolveFounderStatus()
            await ProStore.shared.refreshEntitlements()
        }
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
            Log.pro.info("Loaded \(self.products.count) Pro products")
        } catch {
            lastError = error.localizedDescription
            Log.pro.error("Product load failed: \(error.localizedDescription)")
        }
    }

    // MARK: Purchase / restore

    /// Returns true if the purchase completed and unlocked Pro.
    /// Extract the transaction we're willing to act on from a StoreKit
    /// `VerificationResult`.
    ///
    /// - **Release builds:** verified only. An `.unverified` result returns nil
    ///   and is refused — we must NEVER trust an unsigned/tampered transaction
    ///   in production. This preserves the original `guard case .verified`
    ///   behavior exactly.
    /// - **DEBUG builds only:** also accept `.unverified`, logging loudly. In
    ///   local StoreKit testing the signer's certificate can fail JWS
    ///   verification (notably once the wall-clock passes an older Xcode test
    ///   certificate's validity window, or on clock skew), stranding otherwise-
    ///   successful purchases as `.unverified` and making the paywall/unlock
    ///   flow impossible to test. This escape hatch is compiled out of release
    ///   entirely, so it can never weaken a shipping build.
    private func acceptableTransaction(
        _ result: VerificationResult<StoreKit.Transaction>
    ) -> StoreKit.Transaction? {
        switch result {
        case .verified(let transaction):
            return transaction
        case .unverified(let transaction, let error):
            #if DEBUG
            Log.pro.warn("⚠️ DEBUG: accepting UNVERIFIED \(transaction.productID) — local StoreKit test cert failed verification (\(error.localizedDescription)). This path does NOT exist in release builds.")
            return transaction
            #else
            _ = (transaction, error)
            return nil
            #endif
        }
    }

    @discardableResult
    func purchase(_ product: Product) async -> Bool {
        guard !purchaseInFlight else { return false }
        purchaseInFlight = true
        defer { purchaseInFlight = false }

        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                guard let transaction = acceptableTransaction(verification) else {
                    // Release builds land here on unverified: purchase succeeded
                    // at Apple's layer but the signed payload failed local
                    // verification, so we never unlock — yet Apple considers the
                    // product owned, which is why a retry says "already
                    // subscribed". (DEBUG builds accept it via acceptableTransaction.)
                    if case .unverified(_, let error) = verification {
                        Log.pro.error("Purchase UNVERIFIED for \(product.id): \(error.localizedDescription)")
                    }
                    lastError = "Purchase could not be verified."
                    return false
                }
                #if DEBUG
                Log.pro.info("Purchase verified: \(transaction.productID) txn=\(transaction.id) type=\(String(describing: transaction.productType))")
                #endif
                await transaction.finish()
                await refreshEntitlements()
                #if DEBUG
                Log.pro.info("Post-purchase state: isPro=\(self.isPro) active=\(self.activeProductIDs) lifetime=\(self.ownsLifetime)")
                #endif
                return isPro
            case .userCancelled:
                #if DEBUG
                Log.pro.info("Purchase userCancelled for \(product.id)")
                #endif
                return false
            case .pending:
                // Ask-to-buy / SCA — entitlement arrives later via Transaction.updates.
                #if DEBUG
                Log.pro.info("Purchase pending for \(product.id)")
                #endif
                return false
            @unknown default:
                return false
            }
        } catch {
            lastError = error.localizedDescription
            Log.pro.error("Purchase failed: \(error.localizedDescription)")
            return false
        }
    }

    /// Restore purchases / re-check access. Required by App Review for any
    /// non-restoring product, and doubles as a founder re-check: a founder has
    /// no StoreKit purchase to restore, but their grant lives in the iCloud bit,
    /// so we force a sync and re-resolve first.
    func restore() async {
        // Re-pull the cross-device founder bit and re-run the local check.
        cloud.synchronize()
        if cloud.bool(forKey: CloudKey.founder), !cloudFounder {
            cloudFounder = true
            recomputeFounder()
        }
        refreshCloudKitFounder()
        await resolveFounderStatus()

        // Cap AppStore.sync() — it can hang indefinitely (notably on beta OSes),
        // which is what froze the "Restore" button in the field. The entitlement
        // refresh below reflects whatever actually synced.
        let didSync = await withTaskGroup(of: Bool.self) { group -> Bool in
            group.addTask {
                do { try await AppStore.sync(); return true } catch { return false }
            }
            group.addTask {
                try? await Task.sleep(nanoseconds: 20_000_000_000)
                return false
            }
            let first = await group.next() ?? false
            group.cancelAll()
            return first
        }
        if !didSync {
            Log.pro.warn("AppStore.sync failed or timed out during restore")
            lastError = "Couldn't reach the App Store. Your Pro access is unaffected; try again later."
        }
        await refreshEntitlements()
    }

    // MARK: Entitlement resolution

    /// Recompute active entitlements (subscriptions + the lifetime non-
    /// consumable) from StoreKit and cache the result. Safe to call repeatedly.
    func refreshEntitlements() async {
        #if DEBUG
        // An active debug override owns the entitlement state; don't let the real (usually
        // empty on simulator) scan clobber it.
        if debugProOverride() != .auto {
            applyDebugOverride()
            return
        }
        #endif
        var active: Set<String> = []
        var activeTransaction: StoreKit.Transaction?
        var lifetimeOwned = false
        var lifetimeTxnID: UInt64?
        // Apple-signed JWS of each entitlement we count, for the GPS agent's offline
        // verification. Collected in lockstep with the accepted transactions below.
        var proofJWS: [String] = []
        #if DEBUG
        // DIAGNOSTIC counters (DEBUG only): distinguish "StoreKit yielded
        // nothing" (env / simulator state) from "yielded something we filtered
        // out" (code).
        var seen = 0
        var unverifiedSeen = 0
        #endif
        for await result in Transaction.currentEntitlements {
            #if DEBUG
            seen += 1
            // Release: verified only. DEBUG: also accepts unverified (see
            // acceptableTransaction) so a failing local test cert doesn't
            // silently drop the just-purchased entitlement on every refresh.
            if case .unverified = result { unverifiedSeen += 1 }
            #endif
            guard let transaction = acceptableTransaction(result) else { continue }
            guard transaction.revocationDate == nil else { continue }
            #if DEBUG
            Log.pro.info("currentEntitlements entry: \(transaction.productID) type=\(String(describing: transaction.productType)) expiry=\(String(describing: transaction.expirationDate))")
            #endif

            // The one-time lifetime unlock: a non-consumable, so it has no
            // expiry and isn't part of the subscription set.
            if transaction.productID == ProductID.lifetime {
                lifetimeOwned = true
                lifetimeTxnID = transaction.id
                proofJWS.append(result.jwsRepresentation)
                continue
            }

            // Auto-renewable subscriptions.
            guard transaction.productType == .autoRenewable,
                  ProductID.subscriptions.contains(transaction.productID) else { continue }
            // currentEntitlements already excludes lapsed subs, but guard the
            // expiration date too for belt-and-suspenders.
            if let expiry = transaction.expirationDate, expiry < .now { continue }
            active.insert(transaction.productID)
            activeTransaction = transaction
            proofJWS.append(result.jwsRepresentation)
        }
        activeProductIDs = active
        ownsLifetime = lifetimeOwned
        lifetimeTransactionID = lifetimeTxnID
        entitlementTransactionsJWS = proofJWS
        #if DEBUG
        Log.pro.info("refreshEntitlements: seen=\(seen) unverified=\(unverifiedSeen) active=\(active) lifetime=\(lifetimeOwned) isFounder=\(self.isFounder) isPro=\(self.isPro)")
        #endif
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
                // Release: verified only. DEBUG: acceptableTransaction also lets
                // unverified local-test transactions through so out-of-band
                // updates still finish + refresh while testing.
                guard let self else { continue }
                guard let transaction = await self.acceptableTransaction(result) else { continue }
                await transaction.finish()
                await self.refreshEntitlements()
            }
        }
    }

    // MARK: Broadcast

    /// Broadcast the current entitlement so app-local listeners (the VPN
    /// auto-sync gate) can react. Intentionally does NOT touch the App Group —
    /// see the file header.
    private func persistIsPro() {
        // Broadcast the gate + the signed entitlement proof together, so SpoofModel can
        // mirror both into `desired.json` for the GPS agent. `entitlementTransactionsJWS`
        // is always included (possibly empty — a lapsed sub clears it); the app-transaction
        // JWS is included only once resolved (omit-when-nil so a pre-resolution broadcast
        // can't clobber a value another path already set).
        var info: [String: Any] = [
            "isPro": isPro,
            "entitlementTransactionsJWS": entitlementTransactionsJWS,
        ]
        if let appTransactionJWS {
            info["appTransactionJWS"] = appTransactionJWS
        }
        NotificationCenter.default.post(
            name: .proEntitlementDidChange,
            object: nil,
            userInfo: info
        )
    }
}

// MARK: - FounderCloud (CloudKit)

/// Durable cross-device transport for the founder grant, backed by the user's
/// private CloudKit database (per-Apple-ID, no backend of ours, no accounts).
///
/// This is the primary cross-device rail; `NSUbiquitousKeyValueStore` is kept in
/// parallel as a best-effort fallback. CloudKit is preferred because KVS is
/// eventually-consistent and silently evicts values — the exact failure that
/// stranded macOS founders whose local receipt check can't see the grant.
///
/// The grant is a single well-known record (`ProGrant/founderGrant`) holding
/// `granted = 1`. We only ever WRITE `true`: the grant is permanent, so there's
/// no negative to propagate. Every call is best-effort and never throws to the
/// caller — no iCloud account, no network, or a missing record all resolve to
/// "not granted here", leaving the local check and KVS to decide.
///
/// NOTE: before an App Store / TestFlight release, the `ProGrant` record type
/// must be deployed to the CloudKit **Production** environment in the CloudKit
/// Dashboard. The Development environment auto-creates it on first write; the
/// Production environment does not.
enum FounderCloud {
    private static let container = CKContainer(identifier: "iCloud.com.moonloaf.geospoof")
    private static var database: CKDatabase { container.privateCloudDatabase }
    private static let recordType = "ProGrant"
    private static let recordID = CKRecord.ID(recordName: "founderGrant")
    private static let grantedKey = "granted"

    /// True only if a granted founder record exists in the private database.
    /// Any failure (no account, offline, missing record) resolves to false.
    static func fetchGranted() async -> Bool {
        guard await isAvailable() else { return false }
        do {
            let record = try await database.record(for: recordID)
            return (record[grantedKey] as? Int64) == 1
        } catch let error as CKError where error.code == .unknownItem {
            return false // no grant written yet
        } catch {
            // Transient (offline / CloudKit blip). This runs on every foreground
            // and self-heals on the next pull, so keep it at info to avoid
            // always-on warn noise for users who are simply offline.
            Log.pro.info("CloudKit founder fetch failed: \(error.localizedDescription)")
            return false
        }
    }

    /// Write the founder grant. Monotonic — we only ever write `true`, and a
    /// record that already exists is left untouched. Safe to call repeatedly and
    /// best-effort: failures are logged and swallowed.
    static func setGranted() async {
        guard await isAvailable() else { return }
        do {
            // Already present? Nothing to do (the value only ever goes true).
            if let existing = try? await database.record(for: recordID),
               (existing[grantedKey] as? Int64) == 1 {
                return
            }
            let record = CKRecord(recordType: recordType, recordID: recordID)
            record[grantedKey] = 1 as Int64
            _ = try await database.save(record)
            Log.pro.info("CloudKit founder grant written")
        } catch let error as CKError where error.code == .serverRecordChanged {
            // Another device wrote it first — fine, the value is identical.
        } catch {
            Log.pro.warn("CloudKit founder save failed: \(error.localizedDescription)")
        }
    }

    /// Whether the iCloud account is usable for CloudKit right now. Guards every
    /// call so a signed-out user just falls back to the local/KVS path.
    private static func isAvailable() async -> Bool {
        do {
            return try await container.accountStatus() == .available
        } catch {
            return false
        }
    }
}
