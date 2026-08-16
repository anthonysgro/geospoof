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
                // verbatim: fixed-format coordinates. Deliberately not run
                // through a locale — this is a technical readout and a
                // comma decimal separator would misread as a pair separator.
                LabeledRow(label: "Latitude", value: Text(verbatim: String(format: "%.5f", loc.latitude)))
                LabeledRow(label: "Longitude", value: Text(verbatim: String(format: "%.5f", loc.longitude)))
                // Localized: both helpers return display copy ("Exact", "Realistic", "±2 km").
                LabeledRow(label: "Accuracy", value: Text(accuracyDetailValue(for: controller.accuracySetting)))
                LabeledRow(label: "Precision", value: Text(precisionDetailValue(for: controller.locationPrecision)))
                if let name = controller.locationName?.displayName, !name.isEmpty {
                    // verbatim: reverse-geocoded place name.
                    LabeledRow(label: "Location", value: Text(verbatim: name))
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
                // verbatim: IANA timezone id and a formatted UTC offset — both identifiers.
                LabeledRow(label: "Identifier", value: Text(verbatim: tz.identifier))
                LabeledRow(label: "Offset", value: Text(verbatim: tz.utcOffsetText))
                // Localized: "min" is an abbreviation that translates.
                LabeledRow(label: "DST Offset", value: Text("\(tz.dstOffsetMinutes) min"))
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
            groups.append(APICategory(id: "Geolocation", title: "Geolocation", apis: [
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
            groups.append(APICategory(id: "Date & Time", title: "Date & Time", apis: [
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

            groups.append(APICategory(id: "Temporal", title: "Temporal", apis: [
                "Temporal.Now.timeZoneId()",
                "Temporal.Now.plainDateTimeISO()",
                "Temporal.Now.plainDateISO()",
                "Temporal.Now.plainTimeISO()",
                "Temporal.Now.zonedDateTimeISO()",
            ]))

            groups.append(APICategory(id: "XSLT / EXSLT", title: "XSLT / EXSLT", apis: [
                "XSLTProcessor.prototype.transformToFragment()",
                "XSLTProcessor.prototype.transformToDocument()",
                "EXSLT date:date-time() (result rewriting)",
            ]))

            groups.append(APICategory(id: "Workers", title: "Workers", apis: [
                "Worker (constructor wrapper)",
                "SharedWorker (constructor wrapper)",
                "navigator.serviceWorker.register()",
            ]))
        }

        // Mirrors the browser popup's "Language & Locale" group (src/popup/ui.ts).
        // Keep the two lists in step — this screen is a technical readout, so a
        // surface listed on one platform and missing on the other reads as a bug.
        if controller.localeSpoofing != .off {
            groups.append(APICategory(id: "Language & Locale", title: "Language & Locale", apis: [
                "navigator.language",
                "navigator.languages",
                "WorkerNavigator.language / languages (worker scopes)",
                "Accept-Language (request header)",
                "Intl.DateTimeFormat() (locale + timezone)",
                "Intl.NumberFormat()",
                "Intl.Collator()",
                "Intl.RelativeTimeFormat()",
                "Intl.ListFormat()",
                "Intl.PluralRules()",
                "Intl.DisplayNames()",
                "Intl.Segmenter()",
                "Intl.DurationFormat()",
                "Intl.*.prototype.resolvedOptions()",
                "Number.prototype.toLocaleString()",
                "BigInt.prototype.toLocaleString()",
                "Array.prototype.toLocaleString()",
                "Date.prototype.toLocaleString() / toLocaleDateString() / toLocaleTimeString()",
                "String.prototype.localeCompare()",
                "String.prototype.toLocaleUpperCase() / toLocaleLowerCase()",
            ]))
        }
        if controller.webrtcProtection {
            groups.append(APICategory(id: "WebRTC", title: "WebRTC", apis: [
                "RTCPeerConnection (constructor wrapper)",
                "RTCPeerConnection.prototype.getStats()",
            ]))
        }

        groups.append(APICategory(id: "Anti-Fingerprinting & Structural", title: "Anti-Fingerprinting & Structural", apis: [
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
                            // `.formatted()` keeps locale-correct digits (digit
                            // shaping, separators) while going through the
                            // verbatim path. `Text("\(count)")` would instead
                            // derive a catalog key of just `%lld` — a
                            // translatable row containing only a placeholder.
                            Text(group.apis.count.formatted())
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
                            // verbatim: JavaScript API identifiers — code, not prose.
                            Text(verbatim: api)
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
    /// Identity for the expansion set. Stays a plain `String` — identity values
    /// are never localized — and is stated separately from `title` because a
    /// `LocalizedStringKey` can't be read back out as a `String`. The values are
    /// the same literals the ids used to derive from, so behavior is unchanged.
    let id: String
    let title: LocalizedStringKey
    let apis: [String]
}

// MARK: - Onboarding

/// A native activation flow that starts with a real product action, then walks
/// the user through enabling the Safari extension.
struct OnboardingView: View {
    @ObservedObject var controller: SpoofController
    let onDone: () -> Void

    @State private var step = 0
    @State private var showTrust = false
    #if os(iOS)
    @ObservedObject private var router = AppRouter.shared
    @State private var navigationPath: [StepKind] = []
    #endif
    #if os(macOS)
    @StateObject private var extState = ExtensionStateModel()
    @Environment(\.scenePhase) private var scenePhase
    #endif

    /// The flow is modeled as an ordered list of steps rather than index-based
    /// switches, because it diverges by platform. Index math across a divergent
    /// flow is error-prone, so the step list is the single source of truth for
    /// count, progress, and content.
    private enum StepKind: Hashable {
        case welcome
        case location
        case enable
        case safariReady
        case permission
        case gps
        case done
    }

    private var steps: [StepKind] {
        #if os(iOS)
        // The first setup action is the product's core action, not an
        // explanation: choose the location that Safari will report. The choice
        // is written to the App Group immediately and Safari adopts it when the
        // extension is enabled later in this flow.
        [.welcome, .location, .enable, .safariReady]
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
        case .location: return "mappin.and.ellipse"
        case .enable: return "puzzlepiece.extension.fill"
        case .safariReady: return "checkmark.circle.fill"
        case .permission: return "lock.shield.fill"
        case .gps: return "location.circle.fill"
        case .done: return "checkmark.circle.fill"
        }
    }

    private func title(_ kind: StepKind) -> LocalizedStringKey {
        switch kind {
        case .welcome: return "Welcome to GeoSpoof"
        case .location: return "Choose a Location"
        case .enable: return "Enable in Safari"
        case .safariReady: return "Safari is Ready"
        case .permission: return "When Safari Asks"
        case .gps: return "Match Your iPhone's Real GPS"
        case .done: return "You're All Set"
        }
    }

    private func subtitle(_ kind: StepKind) -> LocalizedStringKey {
        switch kind {
        case .welcome:
            return "Mask the location and timezone you reveal online with a tap -- and keep your real whereabouts private."
        case .location:
            return "Pick the location you want GeoSpoof to report. You can change it anytime."
        case .enable:
            #if os(iOS)
            return "Turn GeoSpoof on in Safari's extension settings."
            #else
            return "In Safari, choose Settings > Extensions and turn on GeoSpoof."
            #endif
        case .safariReady:
            return "Websites in Safari now receive your GeoSpoof location."
        case .permission:
            return "The first time you browse, Safari asks to allow access. Approving it is what lets GeoSpoof work -- here's what you'll see."
        case .gps:
            #if os(iOS)
            return "Want more than Safari? GeoSpoof Pro can set your iPhone's real GPS for privacy and app testing, driven from a companion Mac app -- no jailbreak. It's optional; browser spoofing is free."
            #else
            return "Want more than Safari? GeoSpoof Pro can set a connected iPhone's real GPS for privacy and app testing, right from this Mac -- no jailbreak. It's optional; browser spoofing is free."
            #endif
        case .done:
            return "Pick a location and GeoSpoof keeps the real one hidden. You can change it anytime."
        }
    }

    private var primaryTitle: LocalizedStringKey {
        isLast ? "Get Started" : "Continue"
    }

    var body: some View {
        Group {
            #if os(iOS)
            iOSFlow
            #else
            setupStep
            #endif
        }
        .adaptiveModalCover(isPresented: $showTrust) {
            TrustSheet()
        }
        #if os(iOS)
        .onAppear {
            consumeSafariCompletionRequest()
        }
        .onChange(of: router.safariOnboardingCompletionRequested) { requested in
            if requested {
                consumeSafariCompletionRequest()
            }
        }
        // The hosted page's return link is the happy path, but it is not the only
        // way back: users routinely switch apps instead of tapping it. The
        // extension's own check-in is an equally authoritative signal that Safari
        // is ready, so treat it as a second entrance to the same screen.
        .onChange(of: controller.isActiveInSafari) { _ in
            advanceIfSafariIsActive()
        }
        #endif
        #if os(macOS)
        .animation(.easeInOut(duration: 0.25), value: step)
        .animation(.easeInOut(duration: 0.2), value: extState.state)
        .onAppear { extState.refresh() }
        .onChange(of: scenePhase) { phase in
            // Re-check when the user returns from Safari's settings.
            if phase == .active { extState.refresh() }
        }
        .onChange(of: step) { _ in extState.refresh() }
        .frame(minWidth: 460, minHeight: 560)
        #endif
        .interactiveDismissDisabled()
    }

    #if os(iOS)
    /// Once the welcome's single action is taken, the system navigation stack
    /// owns movement through setup. This gives the transition standard iOS
    /// physics, back-swipe behavior, and accessibility instead of a bespoke
    /// onboarding animation.
    @ViewBuilder
    private var iOSFlow: some View {
        if #available(iOS 16.0, *) {
            NavigationStack(path: $navigationPath) {
                welcomeRoot
                    .navigationDestination(for: StepKind.self) { kind in
                        iOSPage(kind)
                    }
            }
            .onChange(of: navigationPath) { path in
                syncStep(with: path.last)
            }
        } else {
            NavigationView {
                welcomeRoot
                    .background {
                        NavigationLink(
                            destination: iOSPage(current),
                            isActive: Binding(
                                get: { step > 0 },
                                set: { if !$0 { step = 0 } }
                            )
                        ) {
                            EmptyView()
                        }
                        .hidden()
                    }
            }
            .navigationViewStyle(.stack)
        }
    }

    private var welcomeRoot: some View {
        OnboardingWelcomeView {
            showFirstSetupStep()
        }
        .navigationBarHidden(true)
    }

    @ViewBuilder
    private func iOSPage(_ kind: StepKind) -> some View {
        if kind == .location {
            OnboardingLocationView(controller: controller) {
                advance()
            }
            .navigationBarHidden(false)
        } else if kind == .enable {
            OnboardingSafariHandoffView(
                controller: controller,
                onOpenSetup: openSafariActivationPage
            )
            .navigationBarHidden(false)
            .onAppear { syncStep(with: kind) }
            .task { await watchForSafariActivation() }
        } else if kind == .safariReady {
            OnboardingSafariReadyView(
                controller: controller,
                onFinish: onDone
            )
            .navigationBarHidden(true)
            .onAppear { syncStep(with: kind) }
        } else {
            setupStep
                .navigationBarHidden(false)
                .onAppear { syncStep(with: kind) }
        }
    }

    private func showFirstSetupStep() {
        guard let firstSetup = steps.dropFirst().first else { return }
        step = 1
        if #available(iOS 16.0, *) {
            navigationPath.append(firstSetup)
        }
    }

    private func syncStep(with kind: StepKind?) {
        guard let kind, let index = steps.firstIndex(of: kind) else {
            step = 0
            return
        }
        step = index
    }

    /// Consume the one-shot route only after OnboardingView exists. This works
    /// for both a warm return from Safari and a cold launch where SceneDelegate
    /// receives the URL before SwiftUI has mounted the navigation stack.
    private func consumeSafariCompletionRequest() {
        guard router.consumeSafariOnboardingCompletion() else { return }
        showSafariReady()
    }

    private func showSafariReady() {
        guard let readyIndex = steps.firstIndex(of: .safariReady) else { return }
        step = readyIndex

        if #available(iOS 16.0, *) {
            if navigationPath.last != .safariReady {
                navigationPath.append(.safariReady)
            }
        }
    }

    /// Advance on the extension's own check-in, but only from the handoff screen.
    ///
    /// The step guard is load-bearing, not defensive: `isActiveInSafari` is a
    /// seven-day heartbeat window, so it can already be true when onboarding
    /// starts — a user who enables the extension in Safari before ever opening
    /// the app, or the debug replay on a device that's already set up. Without
    /// the guard those cases would jump straight from the welcome screen to
    /// "Safari is ready", skipping location selection and leaving the success
    /// screen with no location to name.
    private func advanceIfSafariIsActive() {
        guard current == .enable,
              controller.isActiveInSafari,
              controller.hasLocation else { return }
        showSafariReady()
    }

    /// Keep checking for the extension's check-in while the handoff screen is on
    /// screen.
    ///
    /// `SpoofController` refreshes from the App Group on
    /// `didBecomeActive`, which covers the ordinary return from Safari on iPhone.
    /// Two cases it doesn't cover: iPad multitasking, where GeoSpoof and Safari
    /// can both be visible so the app never re-activates, and a first check-in
    /// that lands a moment after the app is already frontmost. Both leave the
    /// user parked on a screen that has nothing left to say. The poll is a small
    /// App Group plist read, runs only while this step is displayed, and stops
    /// on its own when iOS suspends the app.
    private func watchForSafariActivation() async {
        advanceIfSafariIsActive()

        while !Task.isCancelled {
            try? await Task.sleep(for: .seconds(2))
            guard !Task.isCancelled else { return }
            controller.refreshFromExtension()
            advanceIfSafariIsActive()
        }
    }

    #endif

    /// The instructional steps retain the established scrolling layout. The
    /// iOS welcome deliberately does not use this scaffold: it is a launch
    /// scene, while these are the setup flow that begins after Continue.
    private var setupStep: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 20) {
                    Spacer(minLength: 0)

            standardHeader

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

            stepProgress

            Button {
                advance()
            } label: {
                Text(primaryTitle).frame(maxWidth: .infinity)
            }
            .glassButtonStyle(prominent: true)
            .controlSize(.large)
            .padding(.horizontal)

            #if os(macOS)
            if step > 0 {
                Button("Back") {
                    withAnimation { step -= 1 }
                }
                .font(.subheadline)
            }
            #endif
                }
                .padding()
                .padding(.bottom, 12)
                .frame(maxWidth: .infinity, minHeight: geo.size.height)
            }
        }
    }

    private var stepProgress: some View {
        HStack(spacing: 8) {
            ForEach(progressRange, id: \.self) { i in
                Circle()
                    .fill(i == step ? Color.brand : Color.secondary.opacity(0.3))
                    .frame(width: 8, height: 8)
            }
        }
    }

    /// On iOS the welcome is the doorway into setup, not one of its pages, so
    /// progress starts with the first real task. macOS keeps its existing count.
    private var progressRange: Range<Int> {
        #if os(iOS)
        return 1..<stepCount
        #else
        return 0..<stepCount
        #endif
    }

    private var standardHeader: some View {
        VStack(spacing: 20) {
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
        }
    }

    private func advance() {
        if isLast {
            onDone()
        } else {
            #if os(iOS)
            step += 1
            if #available(iOS 16.0, *) {
                navigationPath.append(current)
            }
            #else
            withAnimation { step += 1 }
            #endif
        }
    }

    private func openSystemSettings() {
        #if os(macOS)
        SFSafariApplication.showPreferencesForExtension(withIdentifier: "com.moonloaf.geospoof.Extension")
        #endif
    }

    #if os(iOS)
    /// Opens the first-party activation page in the user's default browser.
    /// The page itself will handle the non-Safari fallback in the next slice;
    /// iOS provides no public API for forcing an HTTPS link into Safari.
    private func openSafariActivationPage() {
        let activationURL = AppLink.site(
            "/activate",
            campaign: "onboarding-activate",
            localized: true
        )
        var components = URLComponents(url: activationURL, resolvingAgainstBaseURL: false)
        let safariUI: String
        if #available(iOS 26.0, *) {
            safariUI = "26"
        } else {
            safariUI = "18"
        }
        var queryItems = components?.queryItems ?? []
        queryItems.append(URLQueryItem(name: "safari_ui", value: safariUI))
        components?.queryItems = queryItems

        // AppLink always produces a valid URL; preserve that URL if component
        // reconstruction ever fails rather than interrupting onboarding.
        UIApplication.shared.open(components?.url ?? activationURL)
    }
    #endif
}

#if os(iOS)
/// A one-time, branded welcome after iOS hands control to the app. It renders in
/// its finished state immediately: the system launch screen remains neutral,
/// while this real app screen owns the brand, message, and action.
private struct OnboardingWelcomeView: View {
    let onContinue: () -> Void

    var body: some View {
        GeometryReader { geo in
            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 0) {
                    Spacer(minLength: 44)

                    VStack(spacing: 28) {
                        Image("LargeIcon")
                            .resizable()
                            .renderingMode(.template)
                            .aspectRatio(contentMode: .fit)
                            .foregroundStyle(Color.brand)
                            .frame(width: 136, height: 136)
                            .accessibilityHidden(true)

                        VStack(spacing: 10) {
                            Text("GeoSpoof")
                                .font(.custom("Nunito-Bold", size: 34, relativeTo: .largeTitle))
                                .tracking(-0.5)

                            Text("Control the location you share—from Safari to your iPhone’s GPS.")
                                .font(.body)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                                .lineSpacing(2)
                                .fixedSize(horizontal: false, vertical: true)
                                .frame(maxWidth: 330)
                        }
                    }
                    .padding(.horizontal, 32)

                    Spacer(minLength: 44)

                    VStack(spacing: 2) {
                        Button(action: onContinue) {
                            Text("Continue")
                                .frame(maxWidth: .infinity)
                        }
                        .glassButtonStyle(prominent: true)
                        .controlSize(.large)

                        HStack(spacing: 4) {
                            Link(destination: AppLink.site("/privacy", campaign: "onboarding-privacy")) {
                                Text("Privacy Policy")
                                    .frame(minHeight: 44)
                                    .contentShape(Rectangle())
                            }

                            Text(verbatim: "•")
                                .accessibilityHidden(true)

                            Link(destination: AppLink.site("/terms", campaign: "onboarding-terms")) {
                                Text("Terms of Service")
                                    .frame(minHeight: 44)
                                    .contentShape(Rectangle())
                            }
                        }
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .padding(.horizontal, 8)
                    }
                    .padding(.horizontal, 32)
                    .padding(.bottom, 8)
                }
                .frame(maxWidth: .infinity, minHeight: geo.size.height)
            }
        }
        .background(Color(uiColor: .systemBackground).ignoresSafeArea())
        .tint(.brand)
    }
}

/// The first activation task. City search stays entirely on-device through the
/// bundled catalog; selecting a row is reversible until the user confirms it.
/// That separation prevents an exploratory tap from silently changing the
/// location and gives the screen one unambiguous completion action.
private struct OnboardingLocationView: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var store = CityStore.shared

    let onContinue: () -> Void

    @State private var searchText = ""
    @State private var selection: Selection?
    @State private var showCoordinates = false

    private enum Selection: Equatable {
        case place(PlaceResult)
        case coordinates(latitude: Double, longitude: Double)
    }

    private var results: [PlaceResult] {
        searchText.isEmpty ? store.popular(7) : store.search(searchText)
    }

    private var selectedCoordinates: (latitude: Double, longitude: Double)? {
        guard case let .coordinates(latitude, longitude)? = selection else { return nil }
        return (latitude, longitude)
    }

    var body: some View {
        List {
            Section {
                Text("Pick the location you want GeoSpoof to report. You can change it anytime.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .listRowBackground(Color.clear)
                    .listRowInsets(EdgeInsets(top: 4, leading: 4, bottom: 8, trailing: 4))
                    .listRowSeparator(.hidden)
            }

            Section {
                locationRows
            } header: {
                Text(searchText.isEmpty ? "Popular Cities" : "Results")
            }

            Section {
                Button {
                    showCoordinates = true
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "number")
                            .font(.body.weight(.medium))
                            .foregroundStyle(Color.brand)
                            .frame(width: 28)

                        VStack(alignment: .leading, spacing: 2) {
                            Text("Enter Coordinates")
                                .foregroundStyle(.primary)
                            if let selectedCoordinates {
                                Text(Self.coordinateSummary(
                                    latitude: selectedCoordinates.latitude,
                                    longitude: selectedCoordinates.longitude
                                ))
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .monospacedDigit()
                            }
                        }

                        Spacer()

                        if case .coordinates? = selection {
                            Image(systemName: "checkmark")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(Color.brand)
                                .accessibilityHidden(true)
                        } else {
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.tertiary)
                                .accessibilityHidden(true)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            } header: {
                Text("Exact Location")
            } footer: {
                Text("Use coordinates when you need a precise point.")
            }
        }
        .listStyle(.insetGrouped)
        .navigationTitle("Choose a Location")
        .navigationBarTitleDisplayMode(.large)
        .searchable(
            text: $searchText,
            placement: .navigationBarDrawer(displayMode: .always),
            prompt: "Search cities and countries"
        )
        .safeAreaInset(edge: .bottom, spacing: 0) {
            confirmationBar
        }
        .sheet(isPresented: $showCoordinates) {
            OnboardingCoordinatesView(
                initialLatitude: selectedCoordinates?.latitude,
                initialLongitude: selectedCoordinates?.longitude
            ) { latitude, longitude in
                selection = .coordinates(latitude: latitude, longitude: longitude)
            }
        }
        .tint(.brand)
        .onAppear { store.preload() }
    }

    @ViewBuilder
    private var locationRows: some View {
        if !store.isLoaded && searchText.isEmpty {
            HStack(spacing: 12) {
                ProgressView().controlSize(.small)
                Text("Loading cities…")
                    .foregroundStyle(.secondary)
            }
        } else if results.isEmpty {
            Text("No locations found")
                .foregroundStyle(.secondary)
        } else {
            ForEach(results) { place in
                Button {
                    selection = .place(place)
                } label: {
                    HStack(spacing: 12) {
                        Text(place.flag)
                            .font(.title2)
                            .frame(width: 30)
                            .accessibilityHidden(true)

                        VStack(alignment: .leading, spacing: 2) {
                            Text(place.city)
                                .foregroundStyle(.primary)
                            Text(place.country)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }

                        Spacer()

                        if selection == .place(place) {
                            Image(systemName: "checkmark")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(Color.brand)
                                .accessibilityHidden(true)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .accessibilityValue(selection == .place(place) ? "Selected" : "")
            }
        }
    }

    private var confirmationBar: some View {
        VStack(spacing: 0) {
            Divider()

            Button {
                useSelection()
            } label: {
                Text("Use This Location")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
            }
            .glassButtonStyle(prominent: true)
            .controlSize(.large)
            .disabled(selection == nil)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .accessibilityHint("Saves the selected location and continues setup")
        }
        .background(.regularMaterial)
    }

    private func useSelection() {
        guard let selection else { return }

        switch selection {
        case .place(let place):
            controller.setLocation(from: place)
        case let .coordinates(latitude, longitude):
            controller.setLocation(latitude: latitude, longitude: longitude, name: nil)
        }

        Haptics.notify(.success)
        onContinue()
    }

    private static func coordinateSummary(latitude: Double, longitude: Double) -> String {
        "\(latitude.formatted(.number.precision(.fractionLength(0...5)))), \(longitude.formatted(.number.precision(.fractionLength(0...5))))"
    }
}

/// Progressive disclosure for users who already have an exact coordinate. It
/// returns a reviewed pair to the location screen rather than committing it on
/// its own, so every selection still goes through the same confirmation action.
private struct OnboardingCoordinatesView: View {
    let onSelect: (Double, Double) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var latitude = ""
    @State private var longitude = ""
    @State private var error: LocalizedStringKey?

    private enum Field { case latitude, longitude }
    @FocusState private var focusedField: Field?

    init(
        initialLatitude: Double? = nil,
        initialLongitude: Double? = nil,
        onSelect: @escaping (Double, Double) -> Void
    ) {
        self.onSelect = onSelect
        _latitude = State(initialValue: initialLatitude.map(Self.coordinateString) ?? "")
        _longitude = State(initialValue: initialLongitude.map(Self.coordinateString) ?? "")
    }

    var body: some View {
        AdaptiveNavigationStack {
            Form {
                Section {
                    TextField("Latitude", text: $latitude)
                        .keyboardType(.numbersAndPunctuation)
                        .focused($focusedField, equals: .latitude)
                        .submitLabel(.next)

                    TextField("Longitude", text: $longitude)
                        .keyboardType(.numbersAndPunctuation)
                        .focused($focusedField, equals: .longitude)
                        .submitLabel(.done)

                    Button("Paste Coordinates") {
                        pasteCoordinates()
                    }
                } footer: {
                    if let error {
                        Text(error)
                            .foregroundStyle(.red)
                    } else {
                        Text("Latitude must be between −90 and 90; longitude between −180 and 180.")
                    }
                }
            }
            .navigationTitle("Enter Coordinates")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Select") { selectCoordinates() }
                        .disabled(latitude.isEmpty || longitude.isEmpty)
                }
            }
            .onSubmit {
                switch focusedField {
                case .latitude: focusedField = .longitude
                case .longitude: selectCoordinates()
                case .none: break
                }
            }
        }
        .tint(.brand)
    }

    private func pasteCoordinates() {
        let raw = (UIPasteboard.general.string ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return }
        guard let parsed = CoordinateParser.parse(raw) else {
            error = "Couldn't read coordinates — try a coordinate pair or a geohash"
            Haptics.notify(.error)
            return
        }

        latitude = Self.coordinateString(parsed.latitude)
        longitude = Self.coordinateString(parsed.longitude)
        error = nil
    }

    private func selectCoordinates() {
        guard let latitudeValue = Self.value(latitude), (-90...90).contains(latitudeValue) else {
            error = "Latitude must be between −90 and 90."
            Haptics.notify(.error)
            return
        }
        guard let longitudeValue = Self.value(longitude), (-180...180).contains(longitudeValue) else {
            error = "Longitude must be between −180 and 180."
            Haptics.notify(.error)
            return
        }

        error = nil
        onSelect(latitudeValue, longitudeValue)
        dismiss()
    }

    private static func value(_ text: String) -> Double? {
        let normalized = text.replacingOccurrences(of: "−", with: "-")
        if let direct = Double(normalized) { return direct }

        let formatter = NumberFormatter()
        formatter.locale = .current
        formatter.numberStyle = .decimal
        return formatter.number(from: normalized)?.doubleValue
    }

    private static func coordinateString(_ value: Double) -> String {
        String((value * 1_000_000).rounded() / 1_000_000)
    }
}

/// A compact handoff from native setup to Safari. The preceding screen already
/// explains location selection, so this page only confirms the choice and
/// presents the next action.
private struct OnboardingSafariHandoffView: View {
    @ObservedObject var controller: SpoofController
    let onOpenSetup: () -> Void

    private var selectedLocation: String {
        if let name = controller.locationName?.displayName, !name.isEmpty {
            return name
        }
        guard let location = controller.location else { return "—" }
        return Self.coordinateSummary(
            latitude: location.latitude,
            longitude: location.longitude
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Turn GeoSpoof on in Safari's extension settings.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.bottom, 28)

                HStack(alignment: .center, spacing: 14) {
                    Image(systemName: "mappin.and.ellipse")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundStyle(Color.brand)
                        .frame(width: 28, height: 28)
                        .accessibilityHidden(true)

                    VStack(alignment: .leading, spacing: 3) {
                        Text("Selected Location")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        Text(verbatim: selectedLocation)
                            .font(.body)
                            .foregroundStyle(.primary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                }
                .accessibilityElement(children: .combine)
            }
            .padding(.horizontal, 24)
            .padding(.top, 12)
            .padding(.bottom, 32)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .navigationTitle("Enable in Safari")
        .navigationBarTitleDisplayMode(.large)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                Divider()

                Button(action: onOpenSetup) {
                    Label("Open Safari Setup", systemImage: "safari")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
                .glassButtonStyle(prominent: true)
                .controlSize(.large)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
                .accessibilityHint("Opens the setup page where Safari can enable and verify GeoSpoof")
            }
            .background(.regularMaterial)
        }
        .background(Color(uiColor: .systemBackground))
        .tint(.brand)
    }

    private static func coordinateSummary(latitude: Double, longitude: Double) -> String {
        "\(latitude.formatted(.number.precision(.fractionLength(0...5)))), \(longitude.formatted(.number.precision(.fractionLength(0...5))))"
    }
}

/// A quiet bridge from verified Safari activation into the product. The hosted
/// page already supplies explicit success feedback, so this screen focuses on
/// the outcome, one essential product boundary, and a single exit action.
private struct OnboardingSafariReadyView: View {
    @ObservedObject var controller: SpoofController
    let onFinish: () -> Void

    private var selectedLocation: String {
        if let name = controller.locationName {
            let conciseName = [name.city, name.country]
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .joined(separator: ", ")
            if !conciseName.isEmpty { return conciseName }
            if !name.displayName.isEmpty { return name.displayName }
        }

        guard let location = controller.location else { return "Selected Location" }
        return Self.coordinateSummary(
            latitude: location.latitude,
            longitude: location.longitude
        )
    }

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                Text("Safari is ready")
                    .font(.largeTitle.bold())
                    .accessibilityAddTraits(.isHeader)

                VStack(alignment: .leading, spacing: 5) {
                    Text("Websites now see")
                        .font(.body)
                        .foregroundStyle(.secondary)

                    Text(verbatim: selectedLocation)
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(.top, 36)
                .accessibilityElement(children: .combine)

                Text("This changes websites in Safari. Your iPhone GPS and IP address remain unchanged.")
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .padding(.top, 30)
            }
            .padding(.horizontal, 24)
            .padding(.top, 32)
            .padding(.bottom, 32)
            .frame(maxWidth: 600, alignment: .leading)
            .frame(maxWidth: .infinity)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            VStack(spacing: 0) {
                Divider()

                Button(action: onFinish) {
                    Text("Start using GeoSpoof")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
                .glassButtonStyle(prominent: true)
                .controlSize(.large)
                .padding(.horizontal, 20)
                .padding(.vertical, 12)
            }
            .background(.regularMaterial)
        }
        .background(Color(uiColor: .systemBackground))
        .tint(.brand)
    }

    private static func coordinateSummary(latitude: Double, longitude: Double) -> String {
        "\(latitude.formatted(.number.precision(.fractionLength(0...5)))), \(longitude.formatted(.number.precision(.fractionLength(0...5))))"
    }
}
#endif

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

    /// `image` stays a `String` (asset catalog name); `caption` is display copy.
    private func shot(image: String, index: Int, caption: LocalizedStringKey) -> some View {
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
                // Locale-formatted digits, no `%lld` catalog key — see the API
                // count badge above.
                Text(index.formatted())
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
        // Concatenated `Text` rather than interpolation: `caption` is now a
        // `LocalizedStringKey`, and a key can't be interpolated into another key.
        // The prefix is a standalone numbering pattern, not half a sentence, and
        // the spoken result is identical to the previous interpolated form.
        .accessibilityLabel(Text("Step \(index): ") + Text(caption))
    }
}

// MARK: - Trust Sheet

/// Progressive-disclosure sheet surfaced just-in-time when the user is about to
/// enable GeoSpoof in Safari (from the home Setup card, or the macOS onboarding
/// slide). Combines what Safari will ask, why it's safe, and links to verify.
struct TrustSheet: View {
    @Environment(\.dismiss) private var dismiss

    /// `symbol` stays a `String` (SF Symbol name, and the `ForEach` identity);
    /// `text` is display copy.
    private let points: [(symbol: String, text: LocalizedStringKey)] = [
        ("lock.fill",           "Spoofing runs on your device — we operate no data-collecting backend."),
        ("eye.slash.fill",      "Never reads, stores, or transmits your browsing."),
        ("chevron.left.forwardslash.chevron.right", "Open source — the code is public and auditable."),
        ("hand.raised.fill",    "No account, no sign-up, no tracking of any kind."),
    ]

    private struct TrustLink: Identifiable {
        let id = UUID()
        let title: LocalizedStringKey
        let detail: LocalizedStringKey
        /// SF Symbol name — never localized.
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
            url: AppLink.site("/support", campaign: "trust-sheet")
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
    private func section<Content: View>(_ title: LocalizedStringKey, @ViewBuilder content: () -> Content) -> some View {
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
    /// Applies medium/large detents + a drag indicator on current targets, with
    /// a defensive full-height fallback if deployment targets are lowered.
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

                // verbatim: a placeholder domain in a mock Safari address bar.
                // A domain is not prose and must not be translated; as a bare
                // literal it was being extracted as a translatable key.
                Text(verbatim: "example.com")
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

    private func stepLine(_ n: Int, _ text: LocalizedStringKey) -> some View {
        HStack(spacing: 8) {
            // Locale-formatted digits, no `%lld` catalog key.
            Text(n.formatted())
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
    /// macOS keeps onboarding in a focused window-sized sheet. iOS launches it
    /// directly from RootView and intentionally does not call this presenter.
    func onboardingCover<C: View>(
        isPresented: Binding<Bool>,
        @ViewBuilder content: @escaping () -> C
    ) -> some View {
        modifier(OnboardingCover(isPresented: isPresented, coverContent: content))
    }

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

private struct OnboardingCover<C: View>: ViewModifier {
    @Binding var isPresented: Bool
    @ViewBuilder var coverContent: () -> C

    func body(content: Content) -> some View {
        #if os(iOS)
        content.fullScreenCover(isPresented: $isPresented, content: coverContent)
        #else
        content.sheet(isPresented: $isPresented, content: coverContent)
        #endif
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
