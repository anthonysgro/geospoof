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

    @State private var showTrust = false
    #if os(iOS)
    @ObservedObject private var router = AppRouter.shared
    /// The navigation stack's path is the whole of the flow's state: the page on
    /// screen *is* the current step. An earlier version also kept an index and
    /// hand-synced the two through a `syncStep(with:)` helper called from four
    /// places plus a per-page `onAppear`, so every navigation had to remember to
    /// update both or the two would disagree.
    @State private var path: [StepKind] = []
    #endif
    #if os(macOS)
    /// macOS swaps content in place rather than pushing, so it has no path to
    /// read and keeps an index it walks with Continue/Back.
    @State private var step = 0
    @StateObject private var extState = ExtensionStateModel()
    @Environment(\.scenePhase) private var scenePhase
    #endif

    /// The flow is modeled as an ordered list of steps rather than index math,
    /// because it diverges by platform. `steps` is the one place the order lives.
    ///
    /// Only `welcome` and `enable` are shared. The rest belong to a single
    /// platform, so they are declared per platform — that way the string catalog
    /// never carries copy for a step the running OS cannot reach, which is how
    /// "Safari is Ready" and its subtitle ended up as translatable keys that
    /// nothing rendered.
    private enum StepKind: Hashable {
        case welcome
        case enable
        #if os(iOS)
        case location
        case safariReady
        #else
        case permission
        case gps
        case done
        #endif
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

    #if os(iOS)
    /// The page on screen. An empty path is the welcome root.
    private var current: StepKind { path.last ?? .welcome }
    #else
    private var current: StepKind { steps[min(step, steps.count - 1)] }
    private var isLast: Bool { step == steps.count - 1 }

    private func symbol(_ kind: StepKind) -> String {
        switch kind {
        case .welcome: return "globe" // unused — welcome uses the app icon
        case .enable: return "puzzlepiece.extension.fill"
        case .permission: return "lock.shield.fill"
        case .gps: return "location.circle.fill"
        case .done: return "checkmark.circle.fill"
        }
    }

    private func title(_ kind: StepKind) -> LocalizedStringKey {
        switch kind {
        case .welcome: return "Welcome to GeoSpoof"
        case .enable: return "Enable in Safari"
        case .permission: return "When Safari Asks"
        case .gps: return "Match Your iPhone's Real GPS"
        case .done: return "You're All Set"
        }
    }

    private func subtitle(_ kind: StepKind) -> LocalizedStringKey {
        switch kind {
        case .welcome:
            return "Mask the location and timezone you reveal online with a tap -- and keep your real whereabouts private."
        case .enable:
            return "In Safari, choose Settings > Extensions and turn on GeoSpoof."
        case .permission:
            return "The first time you browse, Safari asks to allow access. Approving it is what lets GeoSpoof work -- here's what you'll see."
        case .gps:
            return "Want more than Safari? GeoSpoof Pro can set a connected iPhone's real GPS for privacy and app testing, right from this Mac -- no jailbreak. It's optional; browser spoofing is free."
        case .done:
            return "Pick a location and GeoSpoof keeps the real one hidden. You can change it anytime."
        }
    }

    private var primaryTitle: LocalizedStringKey {
        isLast ? "Get Started" : "Continue"
    }
    #endif

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
    private var iOSFlow: some View {
        NavigationStack(path: $path) {
            OnboardingWelcomeView {
                advance(from: .welcome)
            }
            .navigationBarHidden(true)
            .navigationDestination(for: StepKind.self) { kind in
                iOSPage(kind)
            }
        }
    }

    @ViewBuilder
    private func iOSPage(_ kind: StepKind) -> some View {
        switch kind {
        case .location:
            OnboardingLocationView(controller: controller) {
                advance(from: .location)
            }
            .navigationBarHidden(false)
        case .enable:
            OnboardingSafariHandoffView(
                controller: controller,
                onOpenSetup: openSafariActivationPage,
                onSkip: onDone
            )
            .navigationBarHidden(false)
            .task { await watchForSafariActivation() }
        case .safariReady:
            OnboardingSafariReadyView(
                controller: controller,
                onFinish: onDone
            )
            .navigationBarHidden(true)
        case .welcome:
            // The welcome is the stack's root, never a pushed destination.
            EmptyView()
        }
    }

    /// Push whatever follows `kind` in `steps`, or finish if it is the last one.
    /// Driving this off `steps` keeps the order in one place instead of spreading
    /// literal next-step names across the call sites.
    private func advance(from kind: StepKind) {
        guard let index = steps.firstIndex(of: kind) else { return }
        guard let next = steps.dropFirst(index + 1).first else {
            onDone()
            return
        }
        path.append(next)
    }

    /// Consume the one-shot route only after OnboardingView exists. This works
    /// for both a warm return from Safari and a cold launch where SceneDelegate
    /// receives the URL before SwiftUI has mounted the navigation stack.
    private func consumeSafariCompletionRequest() {
        guard router.consumeSafariOnboardingCompletion() else { return }
        showSafariReady()
    }

    /// The single way onto the verified-success screen, from either entrance: the
    /// hosted page's return link and the extension's own check-in both land here.
    ///
    /// Gated on having a location because that is what the screen exists to name,
    /// and because someone who arrives without one has not actually finished
    /// setup — dropping the request leaves them in the flow, which is where they
    /// still need to be. The realistic way to hit that is a cold launch straight
    /// from the return link before the location step was ever completed.
    private func showSafariReady() {
        guard controller.hasLocation else { return }
        guard path.last != .safariReady else { return }
        path.append(.safariReady)
    }

    /// Advance on the extension's own check-in, but only from the handoff screen.
    ///
    /// The step guard is load-bearing, not defensive: `isActiveInSafari` is a
    /// seven-day heartbeat window, so it can already be true when onboarding
    /// starts — a user who enables the extension in Safari before ever opening
    /// the app, or the debug replay on a device that's already set up. Without
    /// the guard those cases would jump straight from the welcome screen to
    /// "Safari is ready", skipping location selection entirely.
    private func advanceIfSafariIsActive() {
        guard current == .enable, controller.isActiveInSafari else { return }
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

    #if os(macOS)
    /// macOS's in-place setup scaffold: header, per-step extras, dot progress, and
    /// a Continue/Back pair.
    ///
    /// This is macOS-only on purpose. iOS gives every step a bespoke screen and
    /// reaches none of this, but while it was merely *unreachable* on iOS rather
    /// than *absent*, the compiler still extracted its copy into the shared string
    /// catalog — which is where the untranslated "Safari is Ready" key came from.
    private var setupStep: some View {
        GeometryReader { geo in
            ScrollView {
                VStack(spacing: 20) {
                    Spacer(minLength: 0)

            standardHeader

            if current == .enable {
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

            if step > 0 {
                Button("Back") {
                    withAnimation { step -= 1 }
                }
                .font(.subheadline)
            }
                }
                .padding()
                .padding(.bottom, 12)
                .frame(maxWidth: .infinity, minHeight: geo.size.height)
            }
        }
    }

    private var stepProgress: some View {
        HStack(spacing: 8) {
            ForEach(0..<steps.count, id: \.self) { i in
                Circle()
                    .fill(i == step ? Color.brand : Color.secondary.opacity(0.3))
                    .frame(width: 8, height: 8)
            }
        }
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
                    // Looks like a heading and is one, but a styled `Text` carries
                    // no trait on its own — only `navigationTitle` gets that for
                    // free, and this scaffold has no navigation bar.
                    .accessibilityAddTraits(.isHeader)
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
            withAnimation { step += 1 }
        }
    }

    private func openSystemSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: "com.moonloaf.geospoof.Extension")
    }
    #endif

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
                                // The welcome hides its navigation bar, so this is
                                // the screen's only title and nothing else supplies
                                // the trait. Rotor navigation lands nowhere without
                                // it.
                                .accessibilityAddTraits(.isHeader)

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
                // The selected trait, not a value string: VoiceOver already has
                // standard phrasing for selection in a list, and it doesn't need
                // translating. The previous `accessibilityValue(… : "")` form also
                // put a bare `""` in a LocalizedStringKey position, which the
                // string catalog extracted as an empty translatable row.
                .accessibilityAddTraits(selection == .place(place) ? [.isSelected] : [])
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

/// The handoff from native setup to Safari: what the user chose, what they're
/// about to do in Safari, and two ways out.
///
/// The steps are shown here and not only on the hosted page because the handoff
/// can fail in ways the app never sees — the default browser isn't Safari, the
/// page doesn't load, the device is offline — and because some people want to
/// read the task before leaving for it. `SafariActivationAnimation` is the same
/// component Home's Setup card uses, so there is one description of this step
/// rather than two that can drift.
///
/// `onSkip` is deliberately unconditional. Screen Time, parental controls, and
/// device management can all prevent Safari extensions from being enabled at
/// all, and on iOS this flow *is* the app's root — without an exit those users
/// have no reachable app. Skipping finishes onboarding and lands on Home, whose
/// Setup card carries the same instructions and stays until the extension checks
/// in, so nothing is lost by leaving early.
private struct OnboardingSafariHandoffView: View {
    @ObservedObject var controller: SpoofController
    let onOpenSetup: () -> Void
    let onSkip: () -> Void

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
                // Not a step counter. What the user needs here isn't "2 of 2" — it's
                // knowing that nothing else is waiting for them after they leave for
                // Safari. Kept as its own short label rather than folded into the
                // sentence below, because that sentence is already translated into
                // all 11 languages and rewording it would send a full sentence back
                // through native review to add two words.
                //
                // Sentence case, not uppercase: `.textCase(.uppercase)` reads as
                // shouting in Cyrillic and does nothing in CJK.
                VStack(alignment: .leading, spacing: 6) {
                    Text("Last step")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.brand)

                    Text("Turn GeoSpoof on in Safari's extension settings.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                // One announcement ("Last step. Turn GeoSpoof on …") instead of two
                // fragments, since the label only means anything attached to it.
                .accessibilityElement(children: .combine)
                .padding(.bottom, 20)

                SafariActivationAnimation(horizontalInset: 0)
                    .padding(.bottom, 24)

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
                .padding(.top, 12)
                .accessibilityHint("Opens the setup page where Safari can enable and verify GeoSpoof")

                Button(action: onSkip) {
                    Text("I'll do this later")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(Color.brand)
                .padding(.horizontal, 20)
                .padding(.bottom, 4)
                .accessibilityHint("Finishes setup without Safari. You can turn GeoSpoof on later from the Home tab.")
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

/// The bridge from verified Safari activation into the product, and the one place
/// the app draws its three location layers side by side.
///
/// The layered list exists because customers conflate the three. The store
/// listing sells "fake your GPS location" for ASO reasons, so a new user often
/// arrives believing the free tier moves their device's GPS and hides their IP.
/// This is the first moment the app can correct that: they have just succeeded at
/// the one layer that is free, so the other two read as "what else exists" rather
/// than as a list of things they don't have.
///
/// Shown as three rows rather than a paragraph on purpose — the previous version
/// stated the same boundary in one sentence ("This changes websites in Safari.
/// Your iPhone GPS and IP address remain unchanged.") and it was being skimmed
/// past. Three rows with three distinct states is a structure a non-reader still
/// absorbs.
///
/// Both rows open a detail sheet rather than pushing: this is a terminal screen
/// that hides its navigation bar, so a push would have no way back.
///
/// They started out non-tappable, on the reasoning that sending someone from
/// onboarding to a Pro screen turns the flow into something that ends at a
/// paywall. That still holds as a warning, and it is the thing to watch here —
/// between them these two rows now lead to a Pro upsell and a disclosed affiliate
/// recommendation, so the close screen is carrying more commerce than it used to.
/// What keeps it honest is that both sheets answer the question first and are
/// dismissible without acting, and neither row is on the path to finishing: the
/// primary button is still "Start using GeoSpoof". If a third selling row ever
/// wants in, that's the signal this screen has drifted.
private struct OnboardingSafariReadyView: View {
    @ObservedObject var controller: SpoofController
    let onFinish: () -> Void

    @ObservedObject private var router = AppRouter.shared
    /// Observed so the Device GPS row states what this user still needs rather
    /// than what a new customer needs. Someone can arrive here already owning Pro
    /// — a founder, or a subscriber setting up a second device — and quoting them
    /// a price they have already paid is the worst possible read of the screen
    /// that is supposed to tell them setup went well.
    @ObservedObject private var pro = ProStore.shared
    @State private var showDeviceGps = false
    @State private var showVpn = false
    @Environment(\.horizontalSizeClass) private var hSizeClass

    /// Matches `LocationMapPane` rather than inventing a height, so the two places
    /// the app shows a location map agree.
    private var mapHeight: CGFloat {
        hSizeClass == .compact ? 180 : 320
    }

    /// The place to name on this screen, or `nil` if the app has none on record.
    ///
    /// Optional rather than falling back to placeholder copy. The previous
    /// fallback returned the literal string "Selected Location", which reaches the
    /// view through `Text(verbatim:)` — so it stayed English in all twelve
    /// languages and read as though that were the name of somewhere. There is no
    /// honest way to word "we don't know", so the claim is dropped instead.
    private var selectedLocation: String? {
        if let name = controller.locationName {
            let conciseName = [name.city, name.country]
                .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
                .filter { !$0.isEmpty }
                .joined(separator: ", ")
            if !conciseName.isEmpty { return conciseName }
            if !name.displayName.isEmpty { return name.displayName }
        }

        guard let location = controller.location else { return nil }
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

                // The win, at full weight. `showSafariReady()` requires a location,
                // so the nil branch is the second line of defence rather than the
                // first — the heading stands on its own either way, because the
                // deep link proves Safari is set up regardless of what the app has
                // on record.
                if let selectedLocation {
                    VStack(alignment: .leading, spacing: 5) {
                        Text("Safari location & timezone")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)

                        // verbatim: a place name from the city catalog, not copy.
                        Text(verbatim: selectedLocation)
                            .font(.title2.weight(.semibold))
                            .foregroundStyle(.primary)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.top, 32)
                    .accessibilityElement(children: .combine)

                    // The place, shown rather than described. A name is a claim; the
                    // map is the evidence, and it's the one element on this screen
                    // that carries any colour.
                    //
                    // Non-interactive twice over (`SpoofMap` defaults to a static
                    // window, and hit testing is off anyway) so it can never swallow
                    // a scroll gesture on a screen whose job is to be left. Hidden
                    // from VoiceOver because the name above already says it, and a
                    // map is nothing a screen reader can use.
                    if let location = controller.location {
                        SpoofMap(
                            latitude: location.latitude,
                            longitude: location.longitude,
                            span: 5
                        )
                        .frame(height: mapHeight)
                        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 18, style: .continuous)
                                .strokeBorder(Color.primary.opacity(0.08))
                        )
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                        .padding(.top, 16)
                    }
                }

                // Category, not capability. GeoSpoof *does* change device GPS — with
                // Pro and a Mac — so any header phrased as "GeoSpoof doesn't change
                // these" denies the product to the customer who bought it for that.
                //
                // "Signal" is the vocabulary the rest of the product already uses
                // ("the one signal GeoSpoof can't change" on /verify), and framing
                // these as *other* signals does the teaching: the Safari location
                // above was one of them, here are the rest. That membership is
                // precisely what customers who conflate the three are missing.
                Text("Other location signals")
                    .font(.subheadline.weight(.semibold))
                    .foregroundStyle(.secondary)
                    .padding(.top, 34)
                    .accessibilityAddTraits(.isHeader)

                VStack(alignment: .leading, spacing: 0) {
                    Button {
                        showDeviceGps = true
                    } label: {
                        gapRow(
                            // Same mark `DeviceGpsPitch` and the GPS tab use, so
                            // the row and the sheet it opens agree. Replaced
                            // `location.slash`, which read as "location is off" —
                            // wrong for a feature GeoSpoof does ship, and it
                            // fought the brand tint.
                            symbol: "location.circle.fill",
                            title: "Device GPS",
                            // What is outstanding *for this user*. An owner is
                            // missing only the Mac, and the sheet behind this row
                            // agrees — both read `isPro`, so the row can never
                            // promise an upsell the sheet no longer shows.
                            detail: pro.isPro
                                ? DeviceGpsPitch.ownedNeedsMac
                                : "Needs Pro and a Mac",
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens what Device GPS does and how to get it")

                    Divider()

                    Button {
                        showVpn = true
                    } label: {
                        gapRow(
                            // Network plus a shield says "IP address, and the thing
                            // that covers it" in one mark, which bare `network`
                            // didn't. Matches `VpnSheet`'s header.
                            symbol: "network.badge.shield.half.filled",
                            title: "IP address",
                            detail: "Only a VPN can change this",
                            showsChevron: true
                        )
                    }
                    .buttonStyle(.plain)
                    .accessibilityHint("Opens why a VPN is the only thing that changes this")
                }
                .padding(.top, 8)
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
        // Both detail sheets undim their backdrop so their frost has something to
        // sample, and iOS treats undimmed as interactive — so this screen stands
        // down while one is open. Without it a tap near the sheet's edge lands on
        // a row behind it and stacks a second sheet on the first. Restored on
        // dismiss, since the flag is the same one driving the presentation.
        .allowsHitTesting(!showDeviceGps && !showVpn)
        .tint(.brand)
        // A plain sheet, not `adaptiveModalCover`. That presenter exists to stop
        // *tall* content rendering as a floating card on iPad, but this content is
        // short and its detent is the whole point — a fullscreen cover would
        // ignore the detent and hand iPad the empty screen this change removes.
        .sheet(isPresented: $showDeviceGps) {
            // Dismiss first: `showPaywall` is presented from RootView, which also
            // hosts this flow, so leaving this sheet up would stack one modal on
            // another.
            DeviceGpsSheet {
                showDeviceGps = false
                router.showPaywall = true
            }
        }
        // No paywall hand-off to sequence here, so this one is a plain sheet with
        // nothing to dismiss first.
        .sheet(isPresented: $showVpn) {
            VpnSheet()
        }
    }

    /// One signal that lies outside Safari, and what would move it.
    ///
    /// No "Not changed" status text: the section header already establishes that,
    /// so repeating it per row was the padding that made this read like a
    /// comparison table. What each row needs is the useful part.
    ///
    /// Centre-aligned rather than top-aligned so the glyph and the chevron sit on
    /// the row's midline instead of pinning to the first line of a two-line row —
    /// the same way a Settings row with a subtitle behaves.
    private func gapRow(
        symbol: String,
        title: LocalizedStringKey,
        detail: LocalizedStringKey,
        showsChevron: Bool
    ) -> some View {
        HStack(alignment: .center, spacing: 14) {
            // Brand tint rather than `.secondary`. These rows are navigable now,
            // and a coloured glyph on a chevron row is the standard iOS reading of
            // "tap this" — the grey was left over from when they were inert. The
            // "not changed" state is carried by `detail`, not by the colour, which
            // is the honest place for it: green here means "there's more to see",
            // not "this signal is handled".
            Image(systemName: symbol)
                .font(.system(size: 17, weight: .medium))
                .foregroundStyle(Color.brand)
                .frame(width: 24)
                .accessibilityHidden(true)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.body)
                    .foregroundStyle(.primary)
                    .fixedSize(horizontal: false, vertical: true)
                Text(detail)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Spacer(minLength: 0)

            if showsChevron {
                Image(systemName: "chevron.right")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.tertiary)
                    .accessibilityHidden(true)
            }
        }
        .padding(.vertical, 12)
        .contentShape(Rectangle())
        .accessibilityElement(children: .combine)
    }

    private static func coordinateSummary(latitude: Double, longitude: Double) -> String {
        "\(latitude.formatted(.number.precision(.fractionLength(0...5)))), \(longitude.formatted(.number.precision(.fractionLength(0...5))))"
    }
}
#endif

// MARK: - Device GPS pitch

#if os(iOS)
/// What Device GPS is, what it needs, and the way to get it.
///
/// Shared by the GPS tab's non-Pro state and the sheet the onboarding close
/// screen opens, because those are the same explanation given to the same person
/// at two moments — and a customer who reads one then the other must not find two
/// different accounts of what they'd be buying.
///
/// The Mac requirement is stated in the body rather than the fine print. It is the
/// fact most likely to produce a refund when discovered after purchase, and the
/// store listing's "fake your GPS location" gives people every reason to assume
/// the phone can do it alone.
///
/// Carries no background or outer padding of its own, because it has to sit in a
/// `Form` `Section` and in a plain `ScrollView` without doubling up on chrome.
struct DeviceGpsPitch: View {
    /// Opens the paywall. Injected because the two hosts reach it differently.
    /// Never called once the user is Pro — see `body`.
    let onUpgrade: () -> Void

    /// The ask is replaced by a confirmation once the user owns Pro.
    ///
    /// Branching here rather than at the call sites is deliberate: this type
    /// exists so a customer who meets the explanation twice gets one account of
    /// the feature, and that guarantee has to cover "do I already have this?"
    /// too. The GPS tab only renders this in its `.notPro` phase, so today the
    /// owned branch is reached from onboarding alone — but a host that starts
    /// showing the pitch to an owner gets the right behaviour for free instead of
    /// re-deriving it.
    @ObservedObject private var pro = ProStore.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "location.circle.fill")
                    .font(.title2)
                    .foregroundColor(.brand)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 3) {
                    Text("Device GPS")
                        .font(.headline)
                    Text("Included with GeoSpoof Pro")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }
            }
            .accessibilityElement(children: .combine)

            Text("Use your Mac to control the GPS location your iPhone reports.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 8) {
                PitchPoint("Location simulation for privacy and app testing")
                PitchPoint("Choose any location or match your VPN")
                PitchPoint("Secure Mac pairing with no jailbreak")
            }

            if pro.isPro {
                // Confirmation, not a badge: this is the answer to "have I already
                // paid for this?", so it names the entitlement and then names the
                // one thing still standing between them and the feature. Green +
                // sealed check is the mark the Pro screens already use for an
                // active entitlement.
                Label {
                    Text(Self.ownedNeedsMac)
                } icon: {
                    Image(systemName: "checkmark.seal.fill")
                }
                .font(.subheadline)
                .foregroundColor(.green)
                .fixedSize(horizontal: false, vertical: true)

                // The remaining step, in the place the ask used to occupy. Same
                // destination and campaign as the GPS tab's two Mac links, so
                // "went to get the Mac app" stays one number.
                //
                // A web link rather than a jump to the GPS tab: onboarding builds
                // the tabs only once it finishes, so there is nothing in-app to
                // route to yet. `glassButtonStyle` is a `buttonStyle`, which
                // `Link` honours, so this matches the button it replaces.
                Link(destination: Self.macAppURL) {
                    Label("Get GeoSpoof GPS for Mac", systemImage: "arrow.down.circle")
                        .frame(maxWidth: .infinity)
                }
                .glassButtonStyle(prominent: true)
                .controlSize(.large)
                .padding(.top, 2)
            } else {
                Button(action: onUpgrade) {
                    Label("Upgrade to Pro", systemImage: "sparkles")
                        .frame(maxWidth: .infinity)
                }
                .glassButtonStyle(prominent: true)
                .controlSize(.large)
                .padding(.top, 2)
                .accessibilityHint("Opens GeoSpoof Pro upgrade options")

                // Somewhere to go that isn't the paywall. The GPS tab already gave
                // its non-Pro visitors this link; the onboarding sheet did not, so
                // the only forward move there was "buy", and reading more meant
                // closing the sheet and finding the site yourself. Now it lives on
                // the shared pitch, which is also what stops the tab from showing
                // it twice — see `GpsView`, where the standalone section it used to
                // occupy is gone.
                //
                // Quiet on purpose: secondary weight, no button chrome. The screen
                // keeps one primary action and this isn't it.
                Link(destination: Self.macAppURL) {
                    Label("Learn about GeoSpoof GPS for Mac", systemImage: "arrow.up.right")
                        .font(.subheadline.weight(.medium))
                        .frame(maxWidth: .infinity)
                }
                .padding(.top, 4)
            }
        }
    }

    /// The scope caveat both hosts show alongside this pitch — the GPS tab in its
    /// own `Section`, the onboarding sheet directly beneath. Lives here rather
    /// than at each call site, where it was the same sentence typed out twice.
    static let compatibilityCaveat: LocalizedStringKey =
        "Not for AR games like Pokémon GO — device GPS is for privacy, browsing, and development."

    /// Where the Mac companion is explained and downloaded. One definition for both
    /// branches, and the same `gps-download` campaign the GPS tab's setup link uses,
    /// so "went to get the Mac app" stays a single number regardless of which
    /// surface sent them.
    private static var macAppURL: URL { AppLink.site("/gps", campaign: "gps-download") }

    /// Shown to a user who already owns Pro, in place of "Needs Pro and a Mac"
    /// and in place of the upgrade ask.
    ///
    /// One key for both, on purpose: the onboarding row and the sheet it opens are
    /// the same statement at two sizes, and the previous pair of near-identical
    /// sentences is what this file has been burned by before. "Pro" rather than
    /// "GeoSpoof Pro" because the row's other state says "Needs Pro", and the
    /// sheet names the product in its header two lines up.
    static let ownedNeedsMac: LocalizedStringKey = "You have Pro — you just need a Mac"
}

/// A checked line in a pitch — a quiet brand check plus a short claim. Shared by
/// `DeviceGpsPitch` and `VpnSheet` so the two detail sheets reachable from the
/// onboarding close screen read as one family.
///
/// Takes a key, not a `String`, so the literals at the call sites are extracted
/// for translation rather than rendered verbatim.
struct PitchPoint: View {
    private let text: LocalizedStringKey

    init(_ text: LocalizedStringKey) {
        self.text = text
    }

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "checkmark")
                .font(.subheadline.weight(.semibold))
                .foregroundColor(.brand)
                .frame(width: 18)
                .accessibilityHidden(true)
            Text(text)
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
    }
}

/// The onboarding close screen's Device GPS detail, presented as a sheet.
///
/// A sheet rather than a push: the close screen is terminal and hides its
/// navigation bar, so a pushed detail would have no way back.
///
/// Deliberately short, and sized to its content rather than to the screen. This
/// is a "what is that?" tap at the end of setup, not a considered purchase — the
/// GPS tab is where someone goes when they've decided to act. So it answers the
/// question and stops: the same pitch the tab shows, plus the scope caveat, in a
/// medium sheet. An earlier version filled the height with setup steps, a
/// requirements list and a Mac-to-iPhone diagram, which turned a one-tap
/// curiosity into a page of homework.
struct DeviceGpsSheet: View {
    @Environment(\.dismiss) private var dismiss
    let onUpgrade: () -> Void

    var body: some View {
        AdaptiveNavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    DeviceGpsPitch(onUpgrade: onUpgrade)

                    Label {
                        Text(DeviceGpsPitch.compatibilityCaveat)
                    } icon: {
                        Image(systemName: "exclamationmark.triangle")
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                }
                .padding(20)
                .frame(maxWidth: 600, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("Device GPS")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
            }
        }
        .tint(.brand)
        // The content is about half a phone screen, so a full-height sheet left
        // the bottom empty. Same presentation as `TrustSheet` — the app's other
        // informational sheet — rather than a one-off detent here.
        .explainerSheetPresentation()
        .frostedSheetBackground()
    }
}

// MARK: - IP address / VPN

/// The onboarding close screen's IP-address detail: the one location signal
/// GeoSpoof can't move, and the (disclosed) affiliate recommendation for the tool
/// that can.
///
/// Built as a sibling of `DeviceGpsSheet` — same header shape, same `PitchPoint`
/// rows, same presentation — because the two rows sit next to each other on the
/// close screen and tapping either should feel like the same gesture.
///
/// A heavily condensed port of the site's `/vpn` page, which runs to a hero, a
/// two-layer explainer, three Proton reasons, plan guidance, five FAQ entries and
/// two disclosures. None of that belongs on a phone sheet: the site already has a
/// condensed form of itself (the `verify.vpnCard` callout reused on /verify and
/// /gps) and this is the native version of *that*, not of the page.
///
/// Two things are deliberately left out. The "up to 70% off" figure, because a
/// price claim compiled into a binary can't be corrected when Proton changes the
/// promo, and a stale discount is both a review risk and a broken promise — the
/// site can carry it because the site can be edited. And the Proton logotype,
/// because bundling a partner's trademark is a separate brand-guidelines and
/// review question, and the button already says the name.
struct VpnSheet: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        AdaptiveNavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 14) {
                    HStack(alignment: .top, spacing: 12) {
                        // Same glyph as the row that opens this, so the sheet
                        // reads as that row expanding.
                        Image(systemName: "network.badge.shield.half.filled")
                            .font(.title2)
                            .foregroundColor(.brand)
                            .accessibilityHidden(true)
                        VStack(alignment: .leading, spacing: 3) {
                            Text("IP address")
                                .font(.headline)
                            Text("Handled by a VPN")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                    .accessibilityElement(children: .combine)

                    // The site's established sentence for this, word for word.
                    // It is the "GeoSpoof isn't a VPN" line, and saying it plainly
                    // is the point of the screen.
                    Text("Your IP address is the one signal GeoSpoof can't change. Only a VPN can.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)

                    Text("Why Proton VPN")
                        .font(.subheadline.weight(.semibold))
                        .padding(.top, 2)
                        .accessibilityAddTraits(.isHeader)

                    VStack(alignment: .leading, spacing: 8) {
                        PitchPoint("No-logs, independently audited")
                        PitchPoint("Swiss, open-source")
                        PitchPoint("Works with VPN Sync")
                    }

                    // Above the button, not below it and not on the far side of a
                    // tap: the relationship has to be clear before anyone acts on
                    // the recommendation.
                    Label {
                        Text("We partner with Proton VPN. If you subscribe through our link, we earn a commission at no extra cost to you.")
                            .fixedSize(horizontal: false, vertical: true)
                    } icon: {
                        Image(systemName: "info.circle")
                    }
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .padding(.top, 2)
                    .accessibilityElement(children: .combine)

                    Link(destination: AppLink.proton(.onboarding)) {
                        Text("See Proton VPN plans")
                            .frame(maxWidth: .infinity)
                    }
                    .glassButtonStyle(prominent: true)
                    .controlSize(.large)
                    .accessibilityHint("Opens in your browser")

                    // Non-negotiable counterweight to an affiliate link: the
                    // recommendation is only honest if the alternative is stated
                    // in the same breath, on the same screen.
                    Text("GeoSpoof works with any VPN — you’re never locked in.")
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .padding(20)
                .frame(maxWidth: 600, alignment: .leading)
                .frame(maxWidth: .infinity)
            }
            .navigationTitle("IP address")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button { dismiss() } label: { Image(systemName: "xmark") }
                        .accessibilityLabel("Close")
                }
            }
        }
        .tint(.brand)
        .explainerSheetPresentation()
        .frostedSheetBackground()
    }
}
#endif

// MARK: - Shared explainer pieces

/// The numbered brand circle that marks a step. Drawn by both the Safari
/// activation illustration and the permission-prompt screenshots, which had each
/// grown their own copy of it.
///
/// Always decorative: both hosts speak the number as part of a label they set on
/// the whole row, so a VoiceOver user never hears a bare digit.
struct StepBadge: View {
    let number: Int

    var body: some View {
        // Locale-formatted digits, not a `%lld` catalog key — a bare numeral is
        // nothing a translator can act on, and some locales use other digits.
        Text(number.formatted())
            .font(.caption2.bold())
            .foregroundStyle(.white)
            .frame(width: 16, height: 16)
            .background(Color.brand, in: Circle())
            .accessibilityHidden(true)
    }
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
                // Subheading for the card. The two screenshots below are already
                // combined into single elements, so this is the label that makes
                // sense of them when skimming by heading.
                .accessibilityAddTraits(.isHeader)

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
                StepBadge(number: index)
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
        .explainerSheetPresentation()
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
    /// The app's presentation for an explainer sheet: opens at half height, drags
    /// up to full for anyone who needs the room (large Dynamic Type, or a long
    /// translation), with a drag indicator so that's discoverable.
    ///
    /// Shared by `TrustSheet`, `DeviceGpsSheet` and `VpnSheet` so the app's three
    /// informational sheets behave identically. Falls back to full height if
    /// deployment targets are ever lowered. The glass treatment is separate — see
    /// `frostedSheetBackground()`.
    @ViewBuilder
    func explainerSheetPresentation() -> some View {
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
private extension View {
    /// Tones down a sheet's glass without giving up the translucency, by keeping the
    /// system background and laying a scrim over it.
    ///
    /// Two findings drive the shape of this, both confirmed on a device rather than
    /// reasoned about, because the obvious approaches are wrong in opposite
    /// directions:
    ///
    /// 1. **Do not set `presentationBackground`.** The system sheet background on
    ///    OS 26 is a real frosted glass that samples what's behind it. Passing a
    ///    `Material` there *replaces* that glass with a flat render of the material,
    ///    which comes out fully opaque — every step from `.ultraThinMaterial` to
    ///    `.thickMaterial` looks the same slab. Reaching for a heavier material to
    ///    get "more frost" produces less of it, not more.
    /// 2. **Undimming is required.** iOS dims behind a detented sheet by default,
    ///    so the glass has nothing but a dim layer to blur and reads as solid even
    ///    untouched. `presentationBackgroundInteraction` is what gives it a live
    ///    backdrop.
    ///
    /// With those two in place the glass is *too* lively over a colourful backdrop —
    /// the onboarding close screen's map turns the sheet into stained glass. The
    /// scrim is the actual knob: it sits above the glass and below the content, so
    /// the blur survives and only its intensity changes. Raised from 0.55 to 0.68
    /// for a thicker frost: the map still reads as depth behind the sheet, but it
    /// no longer competes with the copy. Lower shows more of the backdrop, and past
    /// ~0.8 it stops reading as glass at all — so 0.68 is a deliberate step toward
    /// that ceiling, not a new baseline to keep nudging.
    ///
    /// The catch on undimming, per Apple: dimming and touch pass-through are the
    /// same setting, so the content behind goes live. Hosts must disable hit testing
    /// while a sheet is up — see `OnboardingSafariReadyView`.
    ///
    /// Applied by `DeviceGpsSheet` and `VpnSheet` only. `TrustSheet` keeps the plain
    /// system treatment: it's a stack of `.regularMaterial` cards, which need a
    /// calm backing to keep their edges.
    @ViewBuilder
    func frostedSheetBackground() -> some View {
        if #available(iOS 16.4, *) {
            self
                .background(Color(uiColor: .systemBackground).opacity(0.68))
                .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        } else {
            self
        }
    }
}
#endif

#if os(iOS)
// MARK: - Safari activation animation (iOS)

/// A lightweight, looping illustration of the iOS Safari address bar with an
/// animated tap on the page-menu button. iOS has no API to drive or
/// deep-link this step, and users routinely miss it (the extension is enabled
/// in Settings but never switched on for the page), so we show exactly where to
/// tap and what to choose. Honors Reduce Motion by falling back to a static
/// highlighted state.
struct SafariActivationAnimation: View {
    /// Outer horizontal inset around the card. Home's Setup card insets it
    /// inside its Form row; the onboarding handoff screen already supplies page
    /// margins, so it passes 0 rather than nesting a second gutter.
    var horizontalInset: CGFloat = 16

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
        .padding(.horizontal, horizontalInset)
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
            StepBadge(number: n)
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
