//
//  ProPaywallView.swift
//  Shared (App)
//
//  The GeoSpoof Pro paywall and the one-time "founder" thank-you sheet.
//
//  The paywall is fully custom (rather than StoreKit's SubscriptionStoreView,
//  which is iOS 17+) because the app deploys back to iOS 15 / macOS 13. It
//  reads products / pricing / intro-offer info from `ProStore` and routes
//  purchase + restore through it, so the `isPro` gate updates automatically via
//  ProStore's Transaction.updates listener.
//
//  Apple requires subscription paywalls to disclose: title, price, billing
//  period, that the subscription auto-renews, and functional links to the
//  Terms (EULA) and Privacy Policy (Guideline 3.1.2). All of that lives in
//  `disclosureFooter` below — don't remove it or App Review will reject.
//

import SwiftUI
import StoreKit
import Foundation
import Combine

struct ProPaywallView: View {
    @ObservedObject private var store = ProStore.shared
    @Environment(\.dismiss) private var dismiss

    /// Currently selected plan; defaults to annual (the plan we want to anchor).
    @State private var selectedProductID = ProStore.ProductID.annual

    // Links shown in the required disclosure footer.
    private let privacyURL = URL(string: "https://www.geospoof.com/privacy")!
    // Apple's standard EULA is an acceptable Terms link when you don't ship a
    // custom one; swap for your own terms URL if you add it.
    private let termsURL = URL(string: "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/")!

    /// Shared feature list — see `ProFeatures.all` (also used by the Pro
    /// detail screen). Edit there to change the marketing pitch.

    var body: some View {
        AdaptiveNavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    header
                    socialProof
                    featureList
                    universalPurchaseNote
                    planPicker
                    VStack(spacing: 8) {
                        ctaButton
                        Text(ctaSubtitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                    if let err = store.lastError {
                        Text(err)
                            .font(.footnote)
                            .foregroundStyle(.red)
                            .multilineTextAlignment(.center)
                    }
                    restoreButton
                    disclosureFooter
                }
                .padding(20)
                .frame(maxWidth: 520)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("")
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
            }
            .task { if store.products.isEmpty { await store.loadProducts() } }
            // Dismiss as soon as the user becomes Pro (purchase or restore).
            // Single-arg onChange for iOS 15 compatibility.
            .onChange(of: store.isPro) { isPro in
                if isPro { dismiss() }
            }
        }
    }

    // MARK: Header

    private var header: some View {
        VStack(spacing: 12) {
            heroCluster
            Text("GeoSpoof Pro")
                .font(.largeTitle.bold())
            (Text(Image(systemName: "lock.shield")) + Text("  No account · No tracking · Open source"))
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    // MARK: Hero

    /// Decorative icon cluster: the app icon with the signals GeoSpoof controls
    /// (location, timezone, privacy, network) floating around it — echoes the
    /// "scattered icons" hero from high-converting paywalls. Purely cosmetic and
    /// hidden from accessibility; the title + subtitle below carry the meaning.
    /// Offsets are tuned to stay within a small-phone content width (~280pt).
    private var heroCluster: some View {
        ZStack {
            ForEach(Self.heroSatellites) { sat in
                Image(systemName: sat.symbol)
                    .font(.system(size: sat.size, weight: .semibold))
                    .foregroundStyle(sat.tint)
                    .frame(width: sat.tile, height: sat.tile)
                    .background(.ultraThinMaterial, in: Circle())
                    .overlay(Circle().strokeBorder(sat.tint.opacity(0.18), lineWidth: 1))
                    .shadow(color: .black.opacity(0.10), radius: 5, y: 2)
                    .offset(x: sat.x, y: sat.y)
            }

            Image("LargeIcon")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 88, height: 88)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
                .shadow(color: .black.opacity(0.15), radius: 10, y: 4)
        }
        .frame(height: 176)
        .frame(maxWidth: .infinity)
        .accessibilityHidden(true)
    }

    /// Satellite icons for `heroCluster`. Tints reuse the feature palette.
    private static let heroSatellites: [HeroSatellite] = [
        HeroSatellite(symbol: "globe.americas.fill", tint: .blue,   size: 22, tile: 44, x: -92, y: -46),
        HeroSatellite(symbol: "clock.fill",          tint: .orange, size: 19, tile: 38, x:  90, y: -50),
        HeroSatellite(symbol: "lock.shield.fill",    tint: .purple, size: 19, tile: 38, x: -110, y: 22),
        HeroSatellite(symbol: "mappin.and.ellipse",  tint: .pink,   size: 21, tile: 44, x:  106, y: 16),
        HeroSatellite(symbol: "wifi",                 tint: .teal,   size: 17, tile: 34, x: -60, y: 64),
        HeroSatellite(symbol: "location.fill",        tint: .brand,  size: 19, tile: 40, x:  68, y: 60),
    ]

    // MARK: Features

    private var featureList: some View {
        VStack(alignment: .leading, spacing: 18) {
            ForEach(ProFeatures.all) { feature in
                HStack(alignment: .top, spacing: 14) {
                    Image(systemName: feature.icon)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundStyle(feature.tint)
                        .frame(width: 40, height: 40)
                        .background(feature.tint.opacity(0.15),
                                    in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 3) {
                        Text(feature.title)
                            .font(.headline)
                        Text(feature.detail)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                            .minimumScaleFactor(0.8)
                    }
                    Spacer(minLength: 0)
                }
            }

            // Closing row: signals Pro is an evolving bundle. Uses the same
            // tile + title + detail layout as the features (with a sparkles
            // accent) so it doesn't read as an orphaned line.
            HStack(alignment: .top, spacing: 14) {
                Image(systemName: "sparkles")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundStyle(.pink)
                    .frame(width: 40, height: 40)
                    .background(Color.pink.opacity(0.15),
                                in: RoundedRectangle(cornerRadius: 11, style: .continuous))
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text("And More to Come")
                        .font(.headline)
                    Text("New Pro features, as they ship.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.8)
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    /// Universal Purchase reassurance, kept out of the (capped at 5) feature
    /// rows but still surfaced as a small icon note under the list.
    private var universalPurchaseNote: some View {
        (Text(Image(systemName: "ipad.and.iphone")) + Text("  One purchase unlocks iPhone, iPad & Mac"))
            .font(.caption)
            .foregroundStyle(.secondary)
            .multilineTextAlignment(.center)
            .frame(maxWidth: .infinity)
    }

    // MARK: Social proof

    /// Compact, honest social proof, placed just under the header (between the
    /// trust line and the feature list) to build credibility before the pitch.
    /// The 5 stars represent the quoted review (a real 5-star App Store review),
    /// NOT a claimed store-wide average — keep it that way (App Review 2.3 + our
    /// own honesty positioning). Update the count only to a figure you can defend.
    private var socialProof: some View {
        VStack(spacing: 8) {
            HStack(spacing: 2) {
                ForEach(0..<5, id: \.self) { _ in
                    Image(systemName: "star.fill")
                        .font(.caption)
                        .foregroundStyle(Color.brand)
                }
            }
            .accessibilityElement()
            .accessibilityLabel("Five-star App Store review")
            Text("“Perfect app — works exactly as expected.”")
                .font(.callout)
                .italic()
                .multilineTextAlignment(.center)
            Text("jq🦄 · App Store · trusted by 5,000+ users")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }

    // MARK: Plan picker

    @ViewBuilder
    private var planPicker: some View {
        if store.products.isEmpty {
            ProgressView().padding(.vertical, 24)
        } else {
            VStack(spacing: 12) {
                // Lead with lifetime — the anchor we want to convert toward:
                // one payment, no subscription, yours forever.
                if let lifetime = store.lifetimeProduct {
                    PlanCard(
                        product: lifetime,
                        isSelected: selectedProductID == lifetime.id,
                        periodText: "lifetime",
                        priceCaption: "one-time",
                        trialText: nil,
                        badgeText: "Best value",
                        subPriceText: nil
                    ) { selectedProductID = lifetime.id }
                }
                if let annual = store.annualProduct {
                    PlanCard(
                        product: annual,
                        isSelected: selectedProductID == annual.id,
                        periodText: periodText(annual),
                        priceCaption: "per \(periodText(annual))",
                        trialText: trialText(annual),
                        badgeText: savingsText,
                        subPriceText: monthlyEquivalent(annual)
                    ) { selectedProductID = annual.id }
                }
                if let monthly = store.monthlyProduct {
                    PlanCard(
                        product: monthly,
                        isSelected: selectedProductID == monthly.id,
                        periodText: periodText(monthly),
                        priceCaption: "per \(periodText(monthly))",
                        trialText: nil,
                        badgeText: nil,
                        subPriceText: nil
                    ) { selectedProductID = monthly.id }
                }
            }
        }
    }

    // MARK: CTA

    private var selectedProduct: Product? {
        store.products.first { $0.id == selectedProductID } ?? store.annualProduct
    }

    private var ctaButton: some View {
        Button {
            guard let product = selectedProduct else { return }
            Task { await store.purchase(product) }
        } label: {
            HStack {
                if store.purchaseInFlight {
                    ProgressView().controlSize(.small)
                }
                Text(ctaTitle)
                    .fontWeight(.semibold)
            }
            .frame(maxWidth: .infinity)
        }
        .glassButtonStyle(prominent: true)
        .controlSize(.large)
        .disabled(store.purchaseInFlight || selectedProduct == nil)
    }

    private var ctaTitle: String {
        guard let product = selectedProduct else { return "Subscribe" }
        if isLifetime(product) { return "Unlock Lifetime Access" }
        if trialText(product) != nil { return "Start Free Trial" }
        return "Subscribe"
    }

    /// Reassurance + exact billing terms directly under the CTA — what users
    /// look for before committing (free-trial length, real price, cancel).
    private var ctaSubtitle: String {
        guard let product = selectedProduct else { return "" }
        let price = product.displayPrice
        if isLifetime(product) {
            return "\(price) once. Yours forever — no subscription."
        }
        let period = periodText(product)
        if let days = trialDays(product) {
            return "\(days) days free, then \(price)/\(period). Cancel anytime."
        }
        return "\(price)/\(period). Cancel anytime."
    }

    /// True for the one-time, non-consumable lifetime unlock (which has no
    /// subscription metadata and never renews).
    private func isLifetime(_ product: Product) -> Bool {
        product.id == ProStore.ProductID.lifetime
    }

    private var restoreButton: some View {
        Button {
            Task { await store.restore() }
        } label: {
            Text("Restore Purchases")
                .font(.subheadline)
        }
        .buttonStyle(.plain)
        .foregroundStyle(Color.brand)
        .disabled(store.purchaseInFlight)
    }

    // MARK: Required disclosure

    private var disclosureFooter: some View {
        VStack(spacing: 8) {
            Text(disclosureText)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            HStack(spacing: 16) {
                Link("Terms (EULA)", destination: termsURL)
                Link("Privacy Policy", destination: privacyURL)
            }
            .font(.caption2)
        }
        .padding(.top, 4)
    }

    private var disclosureText: String {
        if let product = selectedProduct, isLifetime(product) {
            return "A one-time purchase billed to your Apple Account. Not a subscription — it doesn't renew."
        }
        return "Billed to your Apple Account. Auto-renews unless canceled at least 24 hours before the period ends — manage in Settings. Unused free-trial time is forfeited on purchase."
    }

    // MARK: Pricing helpers

    private func periodText(_ product: Product) -> String {
        guard let unit = product.subscription?.subscriptionPeriod.unit else { return "" }
        switch unit {
        case .day: return "day"
        case .week: return "week"
        case .month: return "month"
        case .year: return "year"
        @unknown default: return ""
        }
    }

    /// Number of free-trial days, or nil when the product has no free-trial
    /// intro offer. (StoreKit reports a 7-day trial as "1 week".)
    private func trialDays(_ product: Product) -> Int? {
        guard let offer = product.subscription?.introductoryOffer,
              offer.paymentMode == .freeTrial else { return nil }
        let period = offer.period
        switch period.unit {
        case .day: return period.value
        case .week: return period.value * 7
        case .month: return period.value * 30
        case .year: return period.value * 365
        @unknown default: return period.value
        }
    }

    /// e.g. "7-day free trial" — nil when the product has no free-trial intro.
    private func trialText(_ product: Product) -> String? {
        guard let days = trialDays(product) else { return nil }
        return "\(days)-day free trial"
    }

    /// Per-month equivalent shown on the annual card (makes annual feel cheap).
    private func monthlyEquivalent(_ product: Product) -> String? {
        guard product.subscription?.subscriptionPeriod.unit == .year else { return nil }
        let perMonth = product.price / 12
        return "≈ \(perMonth.formatted(product.priceFormatStyle))/mo"
    }

    /// "Save N%" comparing the annual price to 12× the monthly price.
    private var savingsText: String? {
        guard let monthly = store.monthlyProduct,
              let annual = store.annualProduct else { return nil }
        let yearAtMonthly = monthly.price * 12
        guard yearAtMonthly > 0 else { return nil }
        let savings = (yearAtMonthly - annual.price) / yearAtMonthly
        let pct = Int((savings as NSDecimalNumber).doubleValue * 100)
        guard pct > 0 else { return nil }
        return "Save \(pct)%"
    }
}

// MARK: - Hero satellite model

/// One floating icon in the paywall's hero cluster. `size` is the SF Symbol
/// point size; `tile` the diameter of its circular background; `x`/`y` the
/// offset from the centered app icon.
private struct HeroSatellite: Identifiable {
    let id = UUID()
    let symbol: String
    let tint: Color
    let size: CGFloat
    let tile: CGFloat
    let x: CGFloat
    let y: CGFloat
}

// MARK: - Plan card

private struct PlanCard: View {
    let product: Product
    let isSelected: Bool
    let periodText: String
    /// Caption under the price, e.g. "per year" for a subscription or
    /// "one-time" for the lifetime non-consumable.
    let priceCaption: String
    let trialText: String?
    let badgeText: String?
    let subPriceText: String?
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 14) {
                Image(systemName: isSelected ? "largecircle.fill.circle" : "circle")
                    .font(.system(size: 22))
                    .foregroundStyle(isSelected ? Color.brand : Color.secondary)
                    .accessibilityHidden(true)

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(product.displayName.isEmpty ? defaultName : product.displayName)
                            .font(.headline)
                        if let badgeText {
                            Text(badgeText)
                                .font(.caption2.bold())
                                .padding(.horizontal, 8)
                                .padding(.vertical, 3)
                                .background(Color.brand.opacity(0.18), in: Capsule())
                                .foregroundStyle(Color.brand)
                        }
                    }
                    if let trialText {
                        Text(trialText)
                            .font(.subheadline)
                            .foregroundStyle(Color.brand)
                    }
                }

                Spacer(minLength: 8)

                VStack(alignment: .trailing, spacing: 1) {
                    Text(product.displayPrice)
                        .font(.headline)
                    Text(priceCaption)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                    if let subPriceText {
                        Text(subPriceText)
                            .font(.caption2)
                            .foregroundStyle(.tertiary)
                    }
                }
            }
            .padding(16)
            .frame(maxWidth: .infinity)
            .background(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color.secondary.opacity(isSelected ? 0.12 : 0.06))
            )
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .strokeBorder(isSelected ? Color.brand : Color.clear, lineWidth: 2)
            )
            .contentShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
        .buttonStyle(.plain)
        .accessibilityElement(children: .combine)
        .accessibilityAddTraits(isSelected ? [.isButton, .isSelected] : .isButton)
    }

    private var defaultName: String {
        periodText == "year" ? "Annual" : "Monthly"
    }
}

// MARK: - Founder thank-you

/// One-time celebratory sheet shown to grandfathered ("founder") users — anyone
/// whose first install predates the Pro release. Presented by the host view via
/// an AppStorage "shown once" flag; tapping Done marks it seen.
struct FounderWelcomeSheet: View {
    var onDone: () -> Void

    var body: some View {
        VStack(spacing: 20) {
            Spacer(minLength: 12)

            Image(systemName: "sparkles")
                .font(.system(size: 52, weight: .semibold))
                .foregroundStyle(Color.brand)

            Text("You're a Founding Supporter")
                .font(.title.bold())
                .multilineTextAlignment(.center)

            Text("Thanks for being an early GeoSpoof user. As a thank-you, you've got **GeoSpoof Pro free, for life** — automatic VPN sync, widgets, per-site rules, and every Pro feature, on us.")
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 8)

            Spacer(minLength: 12)

            Button {
                onDone()
            } label: {
                Text("Let's Go")
                    .fontWeight(.semibold)
                    .frame(maxWidth: .infinity)
            }
            .glassButtonStyle(prominent: true)
            .controlSize(.large)
        }
        .padding(24)
        .frame(maxWidth: 480)
    }
}

// MARK: - Settings subscription section

/// A drop-in `Section` for the Settings form that adapts to subscription state:
///   • Founder    → "unlocked free for life" badge (nothing to manage).
///   • Subscriber → status + "Manage Subscription" (system sheet on iOS, App
///     Store account page on macOS).
///   • Not Pro    → "Upgrade" (opens the paywall) + "Restore Purchases".
struct ProSettingsSection: View {
    @ObservedObject private var store = ProStore.shared
    var body: some View {
        Section {
            NavigationLink {
                ProDetailView()
            } label: {
                HStack(spacing: 12) {
                    Image(systemName: summaryIcon)
                        .foregroundStyle(summaryTint)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("GeoSpoof Pro").font(.headline)
                        Text(summarySubtitle)
                            .font(.caption)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
            }
        } header: {
            Text("Subscription")
        }
    }

    private var summaryIcon: String {
        switch store.status {
        case .founder: return "sparkles"
        case .lifetime: return "infinity"
        case .subscribed: return "checkmark.seal.fill"
        case .none: return "location.fill.viewfinder"
        }
    }

    private var summaryTint: Color {
        switch store.status {
        case .subscribed, .lifetime: return .green
        case .founder, .none: return .brand
        }
    }

    private var summarySubtitle: String {
        switch store.status {
        case .founder: return "Founding Supporter — free for life"
        case .lifetime: return "Lifetime — yours forever"
        case .subscribed:
            if let plan = store.subscriptionDetails?.planName { return "\(plan) plan" }
            return "Active"
        case .none: return "Upgrade to unlock all features"
        }
    }
}

// MARK: - Pro pitch sheet

/// The one-time soft Pro introduction shown after a non-Pro user's first
/// confirmed spoof (presented from `SpoofControlPanel`). Deliberately routes to
/// the feature-list detail screen rather than the checkout-first paywall —
/// awareness over hard sell. The "Upgrade to Pro" button inside `ProDetailView`
/// is the path to the actual paywall when the user is ready. Wrapped in its own
/// navigation container (with a close button) since it's presented as a sheet
/// rather than pushed.
struct ProPitchSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        AdaptiveNavigationStack {
            ProDetailView()
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button { dismiss() } label: { Image(systemName: "xmark") }
                            .accessibilityLabel("Close")
                    }
                }
        }
    }
}

// MARK: - Pro detail screen

/// The "click into GeoSpoof Pro" screen. Unifies founders, subscribers, and
/// non-subscribers: everyone sees what Pro includes, but only subscribers get
/// the system manage/refund controls (founders have no Apple subscription to
/// manage — their access is a grant, not a purchase).
struct ProDetailView: View {
    @ObservedObject private var store = ProStore.shared
    @State private var showPaywall = false
    #if os(iOS)
    @State private var showManageSubscriptions = false
    @State private var showRefund = false
    #endif

    var body: some View {
        Form {
            statusSection
            if store.isPro { includedSection }
            actionsSection
        }
        .groupedFormStyle()
        .navigationTitle("GeoSpoof Pro")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .sheet(isPresented: $showPaywall) { ProPaywallView() }
        #if os(iOS)
        .manageSubscriptionsSheet(isPresented: $showManageSubscriptions)
        .refundRequestSheet(for: refundTransactionID, isPresented: $showRefund)
        #endif
        .task {
            if store.products.isEmpty { await store.loadProducts() }
            await store.refreshEntitlements()
        }
    }

    // MARK: Status

    @ViewBuilder
    private var statusSection: some View {
        Section {
            switch store.status {
            case .founder:
                statusRow(icon: "sparkles", tint: .brand,
                          title: "Founding Supporter",
                          subtitle: "You have GeoSpoof Pro free, for life — thanks for being an early user.")
            case .lifetime:
                statusRow(icon: "infinity", tint: .green,
                          title: "Lifetime",
                          subtitle: "You own GeoSpoof Pro — yours forever, on all your Apple devices. No subscription.")
            case .subscribed:
                statusRow(icon: "checkmark.seal.fill", tint: .green,
                          title: "\(store.subscriptionDetails?.planName ?? "Pro") plan",
                          subtitle: subscriptionStatusText)
            case .none:
                statusRow(icon: "location.fill.viewfinder", tint: .brand,
                          title: "GeoSpoof Pro",
                          subtitle: "Unlock automatic VPN sync and every power-user feature.")
            }
        } footer: {
            Label("Works on all your devices — iPhone, iPad & Mac, synced automatically.", systemImage: "ipad.and.iphone")
        }
    }

    private var subscriptionStatusText: String {
        guard let details = store.subscriptionDetails else { return "Active" }
        guard let date = details.renewalDate else {
            return details.autoRenews ? "Active" : "Canceled"
        }
        let formatted = date.formatted(date: .abbreviated, time: .omitted)
        return details.autoRenews ? "Renews \(formatted)" : "Active until \(formatted)"
    }

    private func statusRow(icon: String, tint: Color, title: String, subtitle: String) -> some View {
        HStack(spacing: 14) {
            Image(systemName: icon)
                .font(.system(size: 28))
                .foregroundStyle(tint)
                .frame(width: 36)
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 3) {
                Text(title).font(.headline)
                Text(subtitle)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(.vertical, 4)
    }

    // MARK: Included features

    private var includedSection: some View {
        Section("Included with Pro") {
            ForEach(ProFeatures.all) { feature in
                HStack(spacing: 12) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.green)
                        .accessibilityHidden(true)
                    Text(feature.title)
                    Spacer(minLength: 8)
                    Image(systemName: feature.icon)
                        .foregroundStyle(.secondary)
                        .accessibilityHidden(true)
                }
            }
        }
    }

    // MARK: Actions

    @ViewBuilder
    private var actionsSection: some View {
        switch store.status {
        case .none:
            Section {
                Button {
                    showPaywall = true
                } label: {
                    Label("Upgrade to Pro", systemImage: "sparkles")
                }
                restoreButton
            }

        case .subscribed:
            Section {
                manageRow
                refundRow
                restoreButton
            } footer: {
                Text("Manage or cancel your subscription anytime. Cancelling keeps Pro active until the end of the current period.")
            }

        case .lifetime:
            Section {
                refundRow
                restoreButton
            } footer: {
                Text("Lifetime is a one-time purchase tied to your Apple Account — it restores automatically when you reinstall or set up a new device. There's no subscription to manage.")
            }

        case .founder:
            Section {
                restoreButton
            } footer: {
                Text("Your founding-supporter access is tied to your Apple Account and restores automatically when you reinstall.")
            }
        }
    }

    private var restoreButton: some View {
        Button {
            Task { await store.restore() }
        } label: {
            Label("Restore Purchases", systemImage: "arrow.clockwise")
        }
        .disabled(store.purchaseInFlight)
    }

    @ViewBuilder
    private var manageRow: some View {
        #if os(iOS)
        Button {
            showManageSubscriptions = true
        } label: {
            Label("Manage Subscription", systemImage: "creditcard")
        }
        #else
        Link(destination: URL(string: "https://apps.apple.com/account/subscriptions")!) {
            Label("Manage Subscription", systemImage: "creditcard")
        }
        #endif
    }

    @ViewBuilder
    private var refundRow: some View {
        #if os(iOS)
        Button {
            showRefund = true
        } label: {
            Label("Request a Refund", systemImage: "arrow.uturn.backward")
        }
        #else
        Link(destination: URL(string: "https://reportaproblem.apple.com")!) {
            Label("Request a Refund", systemImage: "arrow.uturn.backward")
        }
        #endif
    }

    #if os(iOS)
    /// Transaction to refund — the lifetime purchase if owned, otherwise the
    /// active subscription. `0` when there's nothing refundable.
    private var refundTransactionID: UInt64 {
        store.lifetimeTransactionID ?? store.subscriptionDetails?.transactionID ?? 0
    }
    #endif
}

// MARK: - Shared feature catalog

struct ProFeatureItem: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let detail: String
    let tint: Color
}

enum ProFeatures {
    /// Feature list shown on the paywall (colored tile + title + one-line
    /// detail) and the Pro detail screen (icon + title). Keep each `detail` to
    /// a single short line of similar length so the rows stay visually even —
    /// uneven description lengths are what make the list look ragged. Edit here
    /// to change copy in both places.
    static let all: [ProFeatureItem] = [
        ProFeatureItem(icon: "arrow.triangle.2.circlepath", title: "Automatic VPN Sync",
                       detail: "Follows your VPN automatically.", tint: .brand),
        ProFeatureItem(icon: "list.bullet.rectangle", title: "Per-Site Rules",
                       detail: "Spoof only the sites you pick.", tint: .blue),
        ProFeatureItem(icon: "square.grid.2x2", title: "Widgets & Controls",
                       detail: "Switch from your Home Screen.", tint: .orange),
        ProFeatureItem(icon: "scope", title: "Custom Accuracy",
                       detail: "Set the accuracy you report.", tint: .purple),
    ]
}

// MARK: - Widget/Control paywall request

/// App-side router for surfacing the Pro paywall from outside the view tree —
/// e.g. a `geospoof://paywall` deep link tapped on a locked widget, or the
/// App Group request a locked control writes. Observed by RootView. App-target
/// only (the widget never references this).
@MainActor
final class AppRouter: ObservableObject {
    static let shared = AppRouter()
    private init() {}

    /// Drives a one-shot presentation of ProPaywallView from RootView.
    @Published var showPaywall = false
}

/// Bridges a "show the paywall" request written by a locked widget/control
/// (`AppGroupPending.requestPaywall`) into the app. The widget process can't
/// present a sheet, so it stamps the App Group and the app consumes the request
/// on its next activation. App-target only (the widget never reads this).
enum WidgetPaywallRequest {
    /// Returns true exactly once if a fresh request is pending, clearing it so
    /// it can't re-trigger. "Fresh" (within 30s) guards against a stale stamp
    /// surfacing the paywall on an unrelated later launch.
    static func consume() -> Bool {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppGroup.suite) else { return false }
        let plistURL = container.appendingPathComponent("Library/Preferences/\(AppGroup.suite).plist")
        guard var dict = NSDictionary(contentsOf: plistURL) as? [String: Any],
              let stampedAt = dict[AppGroup.widgetRequestPaywall] as? Double else {
            return false
        }
        // Consume regardless of freshness so a stale stamp can't linger.
        dict.removeValue(forKey: AppGroup.widgetRequestPaywall)
        (dict as NSDictionary).write(to: plistURL, atomically: true)
        return Date().timeIntervalSince1970 - stampedAt < 30
    }
}
