//
//  SpoofDetailsView.swift
//  Shared (App)
//
//  The "Details" screen (parity with the popup Details tab) and the first-run
//  onboarding sheet that guides the user to enable the Safari extension.
//

import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import SafariServices
#endif

/// Wraps the Details screen in a navigation container for use as a tab root.
struct DetailsTab: View {
    @ObservedObject var controller: SpoofController

    var body: some View {
        AdaptiveNavigationStack {
            SpoofDetailsView(controller: controller)
        }
    }
}

struct SpoofDetailsView: View {
    @ObservedObject var controller: SpoofController
    @State private var expandedGroups: Set<String> = []

    var body: some View {
        Form {
            locationSection
            timezoneSection
            webrtcSection
            apisSection
        }
        .groupedFormStyle()
        .navigationTitle("Details")
    }

    // MARK: Location

    private var locationSection: some View {
        Section("Spoofed Location") {
            if let loc = controller.location {
                LabeledRow(label: "Latitude", value: String(format: "%.5f", loc.latitude))
                LabeledRow(label: "Longitude", value: String(format: "%.5f", loc.longitude))
                LabeledRow(label: "Accuracy", value: accuracyDetailValue(for: controller.accuracySetting))
                if let name = controller.locationName?.displayName, !name.isEmpty {
                    LabeledRow(label: "Location", value: name)
                }
            } else {
                Text("Not configured").foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Timezone

    private var timezoneSection: some View {
        Section("Spoofed Timezone") {
            if let tz = controller.timezone {
                LabeledRow(label: "Identifier", value: tz.identifier)
                LabeledRow(label: "Offset", value: tz.utcOffsetText)
                LabeledRow(label: "DST Offset", value: "\(tz.dstOffsetMinutes) min")
                if tz.fallback {
                    Text("⚠️ Estimated (API unavailable)")
                        .font(.caption).foregroundStyle(.orange)
                }
            } else {
                Text("Not configured").foregroundStyle(.secondary)
            }
        }
    }

    // MARK: WebRTC

    private var webrtcSection: some View {
        Section("WebRTC Protection") {
            if controller.webrtcProtection {
                Label("Active", systemImage: "checkmark.shield.fill")
                    .foregroundStyle(.green)
                Text("RTCPeerConnection is wrapped to suppress ICE candidate gathering, preventing WebRTC from leaking your real IP address.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Label("Inactive", systemImage: "xmark.shield")
                    .foregroundStyle(.secondary)
                Text("WebRTC can leak your real IP address even when using a VPN.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Overridden APIs

    /// The full set of overridden APIs, grouped by surface. Only groups whose
    /// protection is active are included; the structural / anti-fingerprinting
    /// overrides are always installed while protection is on.
    private var apiGroups: [APICategory] {
        var groups: [APICategory] = []

        if controller.hasLocation {
            groups.append(APICategory(title: "Geolocation", apis: [
                "navigator.geolocation.getCurrentPosition()",
                "navigator.geolocation.watchPosition()",
                "navigator.geolocation.clearWatch()",
                "navigator.permissions.query()",
                "GeolocationCoordinates.prototype.latitude",
                "GeolocationCoordinates.prototype.longitude",
                "GeolocationCoordinates.prototype.accuracy",
                "GeolocationCoordinates.prototype.altitude",
                "GeolocationCoordinates.prototype.altitudeAccuracy",
                "GeolocationCoordinates.prototype.heading",
                "GeolocationCoordinates.prototype.speed",
                "GeolocationCoordinates.prototype.toJSON()",
                "GeolocationPosition.prototype.coords",
                "GeolocationPosition.prototype.timestamp",
                "GeolocationPosition.prototype.toJSON()",
            ]))
        }

        if controller.timezone != nil {
            groups.append(APICategory(title: "Date & Time", apis: [
                "Date() constructor",
                "Date.parse()",
                "Date.prototype.getTimezoneOffset()",
                "Date.prototype.getHours() / getMinutes() / getSeconds()",
                "Date.prototype.getDate() / getDay() / getMonth() / getFullYear()",
                "Date.prototype.setHours() / setMinutes() / setSeconds()",
                "Date.prototype.setDate() / setMonth() / setFullYear()",
                "Date.prototype.toString() / toDateString() / toTimeString()",
                "Date.prototype.toLocaleString() / toLocaleDateString() / toLocaleTimeString()",
                "Intl.DateTimeFormat()",
                "Intl.DateTimeFormat.prototype.resolvedOptions()",
                "Intl.DateTimeFormat.prototype.formatToParts()",
                "Intl.DateTimeFormat.prototype.formatRange() / formatRangeToParts()",
            ]))

            groups.append(APICategory(title: "Temporal", apis: [
                "Temporal.Now.timeZoneId()",
                "Temporal.Now.plainDateTimeISO()",
                "Temporal.Now.plainDateISO()",
                "Temporal.Now.plainTimeISO()",
                "Temporal.Now.zonedDateTimeISO()",
            ]))

            groups.append(APICategory(title: "XSLT / EXSLT", apis: [
                "XSLTProcessor.prototype.transformToFragment()",
                "XSLTProcessor.prototype.transformToDocument()",
                "EXSLT date:date-time() (result rewriting)",
            ]))

            groups.append(APICategory(title: "Workers", apis: [
                "Worker (constructor wrapper)",
                "SharedWorker (constructor wrapper)",
                "navigator.serviceWorker.register()",
            ]))
        }

        if controller.webrtcProtection {
            groups.append(APICategory(title: "WebRTC", apis: [
                "RTCPeerConnection (constructor wrapper)",
                "RTCPeerConnection.prototype.getStats()",
            ]))
        }

        groups.append(APICategory(title: "Anti-Fingerprinting & Structural", apis: [
            "Function.prototype.toString()",
            "Document.prototype.lastModified",
            "HTMLIFrameElement.prototype.contentWindow",
            "HTMLIFrameElement.prototype.contentDocument",
            "Node.prototype.appendChild() / insertBefore() / replaceChild()",
            "Element.prototype.append() / prepend() / replaceWith()",
            "Element.prototype.insertAdjacentElement() / insertAdjacentHTML()",
            "Element.prototype.innerHTML (setter)",
        ]))

        return groups
    }

    private var apisSection: some View {
        Section("Overridden APIs") {
            if !controller.enabled {
                Text("None (protection disabled)").foregroundStyle(.secondary)
            } else {
                let groups = apiGroups
                let total = groups.reduce(0) { $0 + $1.apis.count }

                VStack(alignment: .leading, spacing: 3) {
                    Text("Key Overrides (where available)")
                        .font(.subheadline.weight(.semibold))
                    Text("\(total) JavaScript APIs are intercepted across \(groups.count) groups while protection is active. Expand a group for the full list.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 2)

                ForEach(groups) { group in
                    let isExpanded = expandedGroups.contains(group.id)
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            if isExpanded {
                                expandedGroups.remove(group.id)
                            } else {
                                expandedGroups.insert(group.id)
                            }
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Text(group.title)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.primary)
                            Spacer()
                            Text("\(group.apis.count)")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(group.title)
                    .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
                    .accessibilityHint("\(group.apis.count) APIs")

                    if isExpanded {
                        ForEach(group.apis, id: \.self) { api in
                            Text(api)
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .textSelection(.enabled)
                        }
                    }
                }
            }
        }
    }
}

private struct APICategory: Identifiable {
    var id: String { title }
    let title: String
    let apis: [String]
}

// MARK: - Onboarding

/// A classic multi-step native onboarding that walks the user through enabling
/// the Safari extension, with a button that jumps to the system settings.
struct OnboardingView: View {
    let onDone: () -> Void

    @State private var step = 0
    @State private var showTrust = false
    #if os(macOS)
    @StateObject private var extState = ExtensionStateModel()
    @Environment(\.scenePhase) private var scenePhase
    #endif

    /// The flow is modeled as an ordered list of steps rather than index-based
    /// switches, because it diverges by platform: iOS has an extra "turn it on
    /// for the page" step (the address-bar → Manage Extensions action) that
    /// doesn't exist on macOS, where website access is granted right in Safari
    /// Settings. Index math across a divergent flow is error-prone, so the
    /// step list is the single source of truth for count, dots, and content.
    private enum StepKind: Equatable {
        case welcome
        case enable
        case permission
        case gps
        case done
    }

    private var steps: [StepKind] {
        #if os(iOS)
        // iOS modal covers only what we can't detect or guide from the home
        // screen: the welcome and the Settings toggle. Activating it for a page
        // (+ the permission prompt and trust info) is handled just-in-time by
        // the state-driven Setup card on the home screen. A closing GPS teaser
        // introduces the optional Pro device-GPS layer (nothing to set up here).
        [.welcome, .enable, .gps]
        #else
        [.welcome, .enable, .permission, .gps, .done]
        #endif
    }

    private var stepCount: Int { steps.count }
    private var current: StepKind { steps[min(step, steps.count - 1)] }
    private var isLast: Bool { step == stepCount - 1 }

    private func symbol(_ kind: StepKind) -> String {
        switch kind {
        case .welcome: return "globe" // unused — welcome uses the app icon
        case .enable: return "puzzlepiece.extension.fill"
        case .permission: return "lock.shield.fill"
        case .gps: return "location.circle.fill"
        case .done: return "checkmark.circle.fill"
        }
    }

    private func title(_ kind: StepKind) -> String {
        switch kind {
        case .welcome: return "Welcome to GeoSpoof"
        case .enable: return "Enable in Safari"
        case .permission: return "When Safari Asks"
        case .gps: return "Match Your iPhone's Real GPS"
        case .done: return "You're All Set"
        }
    }

    private func subtitle(_ kind: StepKind) -> String {
        switch kind {
        case .welcome:
            return "Mask the location and timezone you reveal online with a tap -- and keep your real whereabouts private."
        case .enable:
            #if os(iOS)
            return "Turn GeoSpoof on in Safari's extension settings."
            #else
            return "In Safari, choose Settings > Extensions and turn on GeoSpoof."
            #endif
        case .permission:
            return "The first time you browse, Safari asks to allow access. Approving it is what lets GeoSpoof work -- here's what you'll see."
        case .gps:
            #if os(iOS)
            return "Want more than Safari? GeoSpoof Pro can set your iPhone's real GPS for privacy and app testing, using Apple's developer location simulation from a companion Mac app. It's optional -- browser spoofing is free."
            #else
            return "Want more than Safari? GeoSpoof Pro can set a connected iPhone's real GPS for privacy and app testing, using Apple's developer location simulation right from this Mac. It's optional -- browser spoofing is free."
            #endif
        case .done:
            return "Pick a location and GeoSpoof keeps the real one hidden. You can change it anytime."
        }
    }

    private var primaryTitle: String {
        isLast ? "Get Started" : "Continue"
    }

    var body: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 20) {
                    Spacer(minLength: 0)

            Group {
                if current == .welcome {
                    Image("LargeIcon")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 104, height: 104)
                } else {
                    Image(systemName: symbol(current))
                        .font(.system(size: 68))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(Color.brand)
                }
            }
            .transition(.scale.combined(with: .opacity))
            .id("symbol-\(step)")

            VStack(spacing: 10) {
                Text(title(current))
                    .font(.largeTitle.bold())
                    .multilineTextAlignment(.center)
                Text(subtitle(current))
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal)
            .id("text-\(step)")

            if current == .enable {
                #if os(macOS)
                if extState.state == .on {
                    Label("GeoSpoof is enabled in Safari", systemImage: "checkmark.circle.fill")
                        .font(.subheadline.weight(.semibold))
                        .foregroundStyle(.green)
                        .padding(.vertical, 10)
                        .padding(.horizontal, 16)
                        .background(Color.green.opacity(0.12), in: Capsule())
                        .padding(.top, 4)
                        .transition(.opacity)
                } else {
                    Button {
                        openSystemSettings()
                    } label: {
                        Label("Open Safari Settings", systemImage: "arrow.up.forward.app")
                            .frame(maxWidth: .infinity)
                    }
                    .glassButtonStyle()
                    .controlSize(.large)
                    .padding(.horizontal)
                    .padding(.top, 4)

                    if extState.state == .off {
                        Text("GeoSpoof's extension is currently turned off.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                #else
                // iOS has no public deep link into Safari → Extensions, and no
                // API to read the extension's enabled state. The only
                // App-Store-safe jump is openSettingsURLString, which lands on
                // the Settings app (this app's own page); from there the user
                // navigates to Apps › Safari › Extensions. We avoid the private
                // `prefs:root=SAFARI` scheme — it's undocumented, version-fragile,
                // and a review-rejection risk.
                Button {
                    openAppSettings()
                } label: {
                    Label("Open Settings", systemImage: "arrow.up.forward.app")
                        .frame(maxWidth: .infinity)
                }
                .glassButtonStyle()
                .controlSize(.large)
                .padding(.horizontal)
                .padding(.top, 4)

                Label("Apps › Safari › Extensions › GeoSpoof", systemImage: "gearshape")
                    .font(.caption.weight(.medium))
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)
                #endif
            }

            if current == .permission {
                PermissionPromptsView()
                    .padding(.horizontal)
                    .padding(.top, 8)

                Button {
                    showTrust = true
                } label: {
                    Label("Why you can trust GeoSpoof", systemImage: "checkmark.shield")
                        .font(.subheadline.weight(.medium))
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.brand)
                .padding(.top, 2)
                .accessibilityHint("Opens details about privacy and how to verify GeoSpoof")
            }

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                ForEach(0..<stepCount, id: \.self) { i in
                    Circle()
                        .fill(i == step ? Color.brand : Color.secondary.opacity(0.3))
                        .frame(width: 8, height: 8)
                }
            }

            Button {
                advance()
            } label: {
                Text(primaryTitle).frame(maxWidth: .infinity)
            }
            .glassButtonStyle(prominent: true)
            .controlSize(.large)
            .padding(.horizontal)

            Button("Back") {
                withAnimation { step -= 1 }
            }
            .font(.subheadline)
            .opacity(step > 0 ? 1 : 0)
            .disabled(step == 0)
                }
                .padding()
                .padding(.bottom, 12)
                .frame(maxWidth: .infinity, minHeight: geo.size.height)
            }
        }
        .adaptiveModalCover(isPresented: $showTrust) {
            TrustSheet()
        }
        .animation(.easeInOut(duration: 0.25), value: step)
        #if os(macOS)
        .animation(.easeInOut(duration: 0.2), value: extState.state)
        .onAppear { extState.refresh() }
        .onChange(of: scenePhase) { phase in
            // Re-check when the user returns from Safari's settings.
            if phase == .active { extState.refresh() }
        }
        .onChange(of: step) { _ in extState.refresh() }
        #endif
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 560)
        #endif
        .interactiveDismissDisabled()
    }

    private func advance() {
        if isLast {
            onDone()
        } else {
            withAnimation { step += 1 }
        }
    }

    private func openSystemSettings() {
        #if os(macOS)
        SFSafariApplication.showPreferencesForExtension(withIdentifier: "com.moonloaf.geospoof.Extension")
        #endif
    }

    #if os(iOS)
    /// Opens the Settings app. iOS only permits deep-linking to this app's own
    /// Settings page (openSettingsURLString); there is no public route straight
    /// to Safari → Extensions, so the on-screen path label guides the rest.
    private func openAppSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
    #endif
}

// MARK: - Permission prompts illustration

/// The two real Safari permission prompts the user is about to hit, so the
/// warning looks familiar (not alarming) when it appears. Shared by the macOS
/// onboarding slide and the iOS TrustSheet (opened from the home Setup card).
struct PermissionPromptsView: View {
    /// Screenshot height. Default matches the macOS onboarding slide; the iPad
    /// TrustSheet passes a larger value.
    var imageHeight: CGFloat = 170

    var body: some View {
        VStack(spacing: 12) {
            Text("The prompts you'll see")
                .font(.subheadline.weight(.semibold))
                .multilineTextAlignment(.center)

            HStack(alignment: .top, spacing: 14) {
                shot(image: "PermissionPrompt1", index: 1, caption: "Safari asks for access")
                shot(image: "PermissionPrompt2", index: 2, caption: "Confirm for every site")
            }

            Text("Both are Safari's standard warnings. GeoSpoof only uses this access to spoof location and timezone -- it never reads, stores, or sends your browsing.")
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    private func shot(image: String, index: Int, caption: String) -> some View {
        VStack(spacing: 8) {
            Image(image)
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(height: imageHeight)
                .clipShape(RoundedRectangle(cornerRadius: 10, style: .continuous))
                .overlay(
                    RoundedRectangle(cornerRadius: 10, style: .continuous)
                        .strokeBorder(Color.primary.opacity(0.08))
                )
                .shadow(color: .black.opacity(0.18), radius: 6, y: 2)

            HStack(spacing: 6) {
                Text("\(index)")
                    .font(.caption2.bold())
                    .foregroundStyle(.white)
                    .frame(width: 16, height: 16)
                    .background(Color.brand, in: Circle())
                Text(caption)
                    .font(.caption)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .accessibilityElement(children: .combine)
        .accessibilityLabel("Step \(index): \(caption)")
    }
}

// MARK: - Trust Sheet

/// Progressive-disclosure sheet surfaced just-in-time when the user is about to
/// enable GeoSpoof in Safari (from the home Setup card, or the macOS onboarding
/// slide). Combines what Safari will ask, why it's safe, and links to verify.
struct TrustSheet: View {
    @Environment(\.dismiss) private var dismiss

    private let points: [(symbol: String, text: String)] = [
        ("lock.fill",           "Spoofing runs on your device — we operate no data-collecting backend."),
        ("eye.slash.fill",      "Never reads, stores, or transmits your browsing."),
        ("chevron.left.forwardslash.chevron.right", "Open source — the code is public and auditable."),
        ("hand.raised.fill",    "No account, no sign-up, no tracking of any kind."),
    ]

    private struct TrustLink: Identifiable {
        let id = UUID()
        let title: String
        let detail: String
        let symbol: String
        let url: URL
    }

    private let links: [TrustLink] = [
        TrustLink(
            title: "View the source on GitHub",
            detail: "Every line is public and auditable.",
            symbol: "chevron.left.forwardslash.chevron.right",
            url: URL(string: "https://github.com/anthonysgro/geospoof")!
        ),
        TrustLink(
            title: "Read the privacy policy",
            detail: "No accounts, no tracking, no data collection.",
            symbol: "hand.raised.fill",
            url: URL(string: "https://github.com/anthonysgro/geospoof/blob/main/PRIVACY_POLICY.md")!
        ),
        TrustLink(
            title: "Help & support",
            detail: "Questions? We're happy to help.",
            symbol: "questionmark.circle",
            url: URL(string: "https://www.geospoof.com/support")!
        ),
    ]

    var body: some View {
        AdaptiveNavigationStack {
            ScrollView {
                VStack(spacing: isPad ? 30 : 24) {
                    hero
                    PermissionPromptsView(imageHeight: isPad ? 260 : 170)

                    section("What GeoSpoof does — and doesn't") {
                        VStack(alignment: .leading, spacing: isPad ? 18 : 14) {
                            ForEach(points, id: \.symbol) { point in
                                HStack(alignment: .top, spacing: 14) {
                                    Image(systemName: point.symbol)
                                        .font(isPad ? .title3 : .body)
                                        .foregroundStyle(Color.brand)
                                        .frame(width: isPad ? 30 : 24)
                                    Text(point.text)
                                        .font(isPad ? .body : .subheadline)
                                        .foregroundStyle(.primary)
                                        .fixedSize(horizontal: false, vertical: true)
                                    Spacer(minLength: 0)
                                }
                            }
                        }
                    }

                    section("Verify for yourself") {
                        VStack(spacing: 0) {
                            ForEach(Array(links.enumerated()), id: \.element.id) { idx, link in
                                Link(destination: link.url) { linkRow(link) }
                                    .accessibilityHint("Opens in your browser")
                                if idx < links.count - 1 {
                                    Divider().padding(.leading, isPad ? 44 : 36)
                                }
                            }
                        }
                    }
                }
                .frame(maxWidth: isPad ? 680 : 540)
                .frame(maxWidth: .infinity)
                .padding(.horizontal, isPad ? 28 : 20)
                .padding(.top, 8)
                .padding(.bottom, 28)
            }
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }.font(.body.weight(.semibold))
                }
            }
        }
        .trustSheetPresentation()
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 600)
        #endif
    }

    /// iPad gets a larger, more spacious treatment; iPhone/macOS keep the
    /// compact sizing. Scales one step up the existing semantic hierarchy
    /// rather than introducing arbitrary sizes.
    private var isPad: Bool {
        #if os(iOS)
        UIDevice.current.userInterfaceIdiom == .pad
        #else
        false
        #endif
    }

    // MARK: Pieces

    private var hero: some View {
        VStack(spacing: isPad ? 16 : 12) {
            Image(systemName: "checkmark.shield.fill")
                .font(.system(size: isPad ? 76 : 52))
                .symbolRenderingMode(.hierarchical)
                .foregroundStyle(Color.brand)
            Text("Why you can trust GeoSpoof")
                .font(isPad ? .largeTitle.bold() : .title2.bold())
                .multilineTextAlignment(.center)
            Text("Safari's permission warning sounds broad, but GeoSpoof uses that access narrowly — and you don't have to take our word for it.")
                .font(isPad ? .title3 : .subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .fixedSize(horizontal: false, vertical: true)
        }
        .frame(maxWidth: .infinity)
        .padding(.top, 8)
    }

    /// A titled group: uppercase section header above a material card.
    @ViewBuilder
    private func section<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title)
                .font((isPad ? Font.subheadline : .footnote).weight(.semibold))
                .textCase(.uppercase)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
            content()
                .padding(isPad ? 20 : 16)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }

    private func linkRow(_ link: TrustLink) -> some View {
        HStack(spacing: 14) {
            Image(systemName: link.symbol)
                .font(isPad ? .title3 : .body)
                .foregroundStyle(Color.brand)
                .frame(width: isPad ? 30 : 24)
            VStack(alignment: .leading, spacing: 2) {
                Text(link.title)
                    .font((isPad ? Font.body : .subheadline).weight(.medium))
                    .foregroundStyle(.primary)
                Text(link.detail)
                    .font(isPad ? .subheadline : .caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
            Image(systemName: "arrow.up.forward")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
        }
        .contentShape(Rectangle())
        .padding(.vertical, isPad ? 10 : 8)
    }
}

private extension View {
    /// Applies medium/large detents + a drag indicator where available
    /// (iOS 16 / macOS 13+); a no-op full-height sheet on iOS 15.
    @ViewBuilder
    func trustSheetPresentation() -> some View {
        if #available(iOS 16.0, macOS 13.0, *) {
            self
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        } else {
            self
        }
    }
}

#if os(iOS)
// MARK: - Safari activation animation (iOS)

/// A lightweight, looping illustration of the iOS Safari address bar with an
/// animated tap on the page-menu button. iOS has no API to drive or
/// deep-link this step, and users routinely miss it (the extension is enabled
/// in Settings but never switched on for the page), so we show exactly where to
/// tap and what to choose. Honors Reduce Motion by falling back to a static
/// highlighted state.
struct SafariActivationAnimation: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var pressed = false
    @State private var ripple = false

    var body: some View {
        VStack(spacing: 16) {
            // Mock Safari address bar with an animated tap on the page menu.
            HStack(spacing: 10) {
                ZStack {
                    Circle()
                        .stroke(Color.brand, lineWidth: 2)
                        .frame(width: 40, height: 40)
                        .scaleEffect(ripple ? 1.7 : 0.7)
                        .opacity(ripple ? 0 : 0.7)

                    // The page-menu glyph: a small page rectangle with text
                    // lines beneath it (the current iOS Safari address-bar
                    // button). Drawn directly so it matches regardless of the
                    // SF Symbol set on the running iOS version.
                    pageMenuGlyph
                        .frame(width: 40, height: 30)
                        .background(
                            Color.primary.opacity(pressed ? 0.18 : 0.07),
                            in: RoundedRectangle(cornerRadius: 8, style: .continuous)
                        )
                        .scaleEffect(pressed ? 0.9 : 1)

                    Image(systemName: "hand.tap.fill")
                        .font(.system(size: 18))
                        .foregroundStyle(Color.brand)
                        .offset(x: 15, y: 17)
                        .scaleEffect(pressed ? 0.88 : 1)
                }

                Text("example.com")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)

                Spacer(minLength: 0)

                Image(systemName: "arrow.clockwise")
                    .font(.callout)
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 10)
            .background(.regularMaterial, in: Capsule())
            .overlay(Capsule().strokeBorder(Color.primary.opacity(0.08)))

            VStack(alignment: .leading, spacing: 8) {
                stepLine(1, "Tap the page menu")
                stepLine(2, "Choose Manage Extensions")
                stepLine(3, "Switch on GeoSpoof")
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .padding(.horizontal)
        .padding(.top, 4)
        .onAppear(perform: startAnimating)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("In Safari, tap the page menu button in the address bar, choose Manage Extensions, then switch on GeoSpoof.")
    }

    /// The iOS Safari page-menu button: a small page rectangle above three
    /// left-aligned, decreasing-width text lines.
    private var pageMenuGlyph: some View {
        VStack(alignment: .leading, spacing: 2.5) {
            RoundedRectangle(cornerRadius: 2, style: .continuous)
                .stroke(Color.primary, lineWidth: 1.5)
                .frame(width: 15, height: 10)
            Capsule().fill(Color.primary).frame(width: 15, height: 1.6)
            Capsule().fill(Color.primary).frame(width: 11, height: 1.6)
            Capsule().fill(Color.primary).frame(width: 7, height: 1.6)
        }
    }

    private func stepLine(_ n: Int, _ text: String) -> some View {
        HStack(spacing: 8) {
            Text("\(n)")
                .font(.caption2.bold())
                .foregroundStyle(.white)
                .frame(width: 16, height: 16)
                .background(Color.brand, in: Circle())
            Text(text)
                .font(.caption)
                .foregroundStyle(.primary)
            Spacer(minLength: 0)
        }
    }

    private func startAnimating() {
        guard !reduceMotion else {
            pressed = true // static highlighted state, no looping motion
            return
        }
        withAnimation(.easeInOut(duration: 0.7).repeatForever(autoreverses: true)) {
            pressed = true
        }
        withAnimation(.easeOut(duration: 1.4).repeatForever(autoreverses: false)) {
            ripple = true
        }
    }
}
#endif

// MARK: - Adaptive modal presentation

extension View {
    /// Presents content fullscreen on iPad (regular width) — where a sheet
    /// renders as a centered card that looks like it's floating — while keeping
    /// the normal sheet/bottom-sheet behavior on iPhone (compact) and macOS.
    func adaptiveModalCover<C: View>(
        isPresented: Binding<Bool>,
        @ViewBuilder content: @escaping () -> C
    ) -> some View {
        modifier(AdaptiveModalCover(isPresented: isPresented, sheetContent: content))
    }
}

private struct AdaptiveModalCover<C: View>: ViewModifier {
    @Binding var isPresented: Bool
    @ViewBuilder var sheetContent: () -> C

    func body(content: Content) -> some View {
        #if os(iOS)
        // Use the device idiom rather than horizontalSizeClass: the size class
        // varies with where the modifier sits in the hierarchy (inside a Form
        // section, or nested in another cover) and can read .compact on iPad,
        // which made the trust sheet fall back to a floating sheet. The idiom is
        // stable. iPad → fullscreen (avoids the floating card); iPhone → sheet.
        if UIDevice.current.userInterfaceIdiom == .pad {
            content.fullScreenCover(isPresented: $isPresented, content: sheetContent)
        } else {
            content.sheet(isPresented: $isPresented, content: sheetContent)
        }
        #else
        content.sheet(isPresented: $isPresented, content: sheetContent)
        #endif
    }
}
