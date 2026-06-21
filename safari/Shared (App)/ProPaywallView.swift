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
                    featureList
                    trustLine
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
            Image("LargeIcon")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 84, height: 84)
                .clipShape(RoundedRectangle(cornerRadius: 19, style: .continuous))
                .shadow(color: .black.opacity(0.12), radius: 8, y: 3)
                .padding(.top, 4)
                .accessibilityHidden(true)
            Text("GeoSpoof Pro")
                .font(.largeTitle.bold())
            Text("Spoof smarter — automatic VPN sync, per-site rules, and more.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
    }

    /// Low-key trust strip — GeoSpoof's differentiators reassure before the ask.
    private var trustLine: some View {
        HStack(spacing: 6) {
            Image(systemName: "lock.shield")
                .accessibilityHidden(true)
            Text("No account · No tracking · Open source")
        }
        .font(.caption)
        .foregroundStyle(.secondary)
    }

    // MARK: Features

    private var featureList: some View {
        VStack(alignment: .leading, spacing: 16) {
            ForEach(ProFeatures.all) { feature in
                HStack(alignment: .top, spacing: 14) {
                    Image(systemName: feature.icon)
                        .font(.system(size: 20))
                        .foregroundStyle(Color.brand)
                        .frame(width: 28)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 2) {
                        Text(feature.title).font(.headline)
                        Text(feature.detail)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    Spacer(minLength: 0)
                }
            }

            // Closing line: keeps the bullet list short while signalling that a
            // subscription is an evolving bundle — and quietly covers smaller
            // additions (e.g. the map pin picker) without a dedicated row.
            Text("Plus every new Pro feature, the moment it ships.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .fixedSize(horizontal: false, vertical: true)
                .padding(.leading, 42)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    // MARK: Plan picker

    @ViewBuilder
    private var planPicker: some View {
        if store.products.isEmpty {
            ProgressView().padding(.vertical, 24)
        } else {
            VStack(spacing: 12) {
                if let annual = store.annualProduct {
                    PlanCard(
                        product: annual,
                        isSelected: selectedProductID == annual.id,
                        periodText: periodText(annual),
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
                        trialText: trialText(monthly),
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
        if let product = selectedProduct, trialText(product) != nil {
            return "Start Free Trial"
        }
        return "Subscribe"
    }

    /// Reassurance + exact billing terms directly under the CTA — what users
    /// look for before committing (free-trial length, real price, cancel).
    private var ctaSubtitle: String {
        guard let product = selectedProduct else { return "" }
        let price = product.displayPrice
        let period = periodText(product)
        if let days = trialDays(product) {
            return "\(days) days free, then \(price)/\(period). Cancel anytime."
        }
        return "\(price)/\(period). Cancel anytime."
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
        """
        Payment is charged to your Apple Account at confirmation of purchase. \
        Subscriptions renew automatically unless canceled at least 24 hours before \
        the end of the current period. Manage or cancel anytime in Settings. \
        Any unused portion of a free trial is forfeited when you purchase a subscription.
        """
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

// MARK: - Plan card

private struct PlanCard: View {
    let product: Product
    let isSelected: Bool
    let periodText: String
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
                    Text("per \(periodText)")
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
        case .subscribed: return "checkmark.seal.fill"
        case .none: return "location.fill.viewfinder"
        }
    }

    private var summaryTint: Color {
        store.status == .subscribed ? .green : .brand
    }

    private var summarySubtitle: String {
        switch store.status {
        case .founder: return "Founding Supporter — free for life"
        case .subscribed:
            if let plan = store.subscriptionDetails?.planName { return "\(plan) plan" }
            return "Active"
        case .none: return "Upgrade to unlock all features"
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
        .refundRequestSheet(for: store.subscriptionDetails?.transactionID ?? 0, isPresented: $showRefund)
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
            case .subscribed:
                statusRow(icon: "checkmark.seal.fill", tint: .green,
                          title: "\(store.subscriptionDetails?.planName ?? "Pro") plan",
                          subtitle: subscriptionStatusText)
            case .none:
                statusRow(icon: "location.fill.viewfinder", tint: .brand,
                          title: "GeoSpoof Pro",
                          subtitle: "Unlock automatic VPN sync and every power-user feature.")
            }
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
}

// MARK: - Shared feature catalog

struct ProFeatureItem: Identifiable {
    let id = UUID()
    let icon: String
    let title: String
    let detail: String
}

enum ProFeatures {
    /// Feature list shown on the paywall (icon + title + detail) and the Pro
    /// detail screen (icon + title). Edit here to change copy in both places.
    static let all: [ProFeatureItem] = [
        ProFeatureItem(icon: "arrow.triangle.2.circlepath", title: "Automatic VPN Sync",
                       detail: "Your spoofed location follows your VPN's exit IP automatically — even in the background."),
        ProFeatureItem(icon: "list.bullet.rectangle", title: "Per-Site Allowlist & Denylist",
                       detail: "Choose exactly which sites get the spoofed location."),
        ProFeatureItem(icon: "square.grid.2x2", title: "Widgets & Controls",
                       detail: "Switch locations from your Home Screen and Control Center."),
        ProFeatureItem(icon: "scope", title: "Custom Accuracy",
                       detail: "Fine-tune the accuracy value your location reports."),
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
