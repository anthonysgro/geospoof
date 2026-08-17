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

    #if os(iOS)
    @ObservedObject private var router = AppRouter.shared
    /// The navigation stack's path is the whole of the flow's state: the page on
    /// screen *is* the current step. An earlier version also kept an index and
    /// hand-synced the two through a `syncStep(with:)` helper called from four
    /// places plus a per-page `onAppear`, so every navigation had to remember to
    /// update both or the two would disagree.
    @State private var path: [StepKind] = []
    /// When the user reached the Safari step. Everything the extension does after
    /// this instant is evidence about now; everything before it is history that a
    /// leftover stamp can imitate. See `advanceIfSafariIsActive()`.
    ///
    /// Set once per flow rather than on every appearance of the step: it is a
    /// lower bound on "recently", and re-stamping it on a return from Safari would
    /// discard the very check-in the user just went and produced.
    @State private var safariStepEnteredAt: Date?
    /// Set once the success screen has been reached, and never cleared for the life of
    /// the flow.
    ///
    /// Stops the Safari step from pushing forward a second time. `path.last` can't
    /// carry this: if the user ever gets back to `.enable` — a pop, or a future change
    /// to how this screen is presented — the step is by then satisfied, so it would
    /// re-advance immediately and bounce them, firing the success haptic again on the
    /// way. Success having already happened is a fact about the flow, not about which
    /// screen is currently on top of it.
    @State private var hasReachedSafariReady = false
    /// Set once the flow has moved off the Safari step, and never cleared.
    ///
    /// Makes the back button work. `watchForSafariActivation()` re-runs whenever the
    /// Safari step reappears, and `isSafariStepSatisfied` is still true after the user
    /// has enabled the extension — so returning to it auto-advanced again, immediately,
    /// which read as the back button being broken rather than as the step being done.
    ///
    /// The watcher exists to catch evidence *arriving while the user waits*, not to
    /// re-decide a step they have already been past. This is the same distinction
    /// `hasReachedSafariReady` draws for the success screen; it needs drawing one step
    /// earlier too now that a step follows this one.
    @State private var hasAdvancedPastEnable = false
    #endif
    #if os(macOS)
    /// Raised by the "Why you can trust GeoSpoof" button on the permission step.
    ///
    /// macOS-only: iOS used to raise the same sheet from the Safari handoff screen, but
    /// both of its routes now answer the permission question at the point it arises —
    /// see the note where that button used to be.
    @State private var showTrust = false
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
        /// Website access, which is a separate grant from the extension toggle and the
        /// one the Settings deep link cannot deliver. Only in the flow when that deep
        /// link is the route taken — see `steps`.
        case grant
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
        //
        // `.grant` is a repair step, not a setup step. Both routes teach both consents
        // on the way through, so on a first run there is nothing left for it to ask.
        //
        // It used to be unconditional on the Settings-deep-link route, on the reasoning
        // that the deep link reaches the extension toggle and cannot reach the website
        // grant, so that route had to ask for the grant separately. That reasoning was
        // built on a Settings pane that listed nine service origins above "Other
        // Websites" — website access was buried in a list, and asking separately was the
        // only way to be sure it was seen.
        //
        // Dropping those origins from the manifest collapsed the pane's Permissions
        // section to a single "All Websites" row, which put both consents on one screen:
        // the exact screen the deep link already opens. So the grant is now reachable by
        // the same tap as the toggle, and `.enable` teaches both (see
        // `SafariSettingsDestinationView`). Keeping a separate step would send the user
        // out a second time — to a web page this time, so a second app switch and a
        // dependency on Safari being the default browser — for a switch they were just
        // shown.
        //
        // It also removes this route's dependence on Safari's permission prompt
        // appearing, which is the thing that cannot be relied on: the "Additional
        // Permissions Requested" banner is reported not to show at all in some cases.
        // Settings is deterministic; the prompt is not.
        //
        // What stays is the correction. A *confirmed* negative from the extension means
        // the second switch didn't get set, and then this isn't a repeat of something
        // already taught — it's the fix, and it's the only signal that can tell the
        // difference. `.unknown` deliberately does not qualify (see `warrantsRepair`),
        // so a fresh install whose extension hasn't reported yet is not accused of a
        // fault. Home's Setup card is the other half of this safety net for anyone who
        // finishes the flow with one switch set.
        if controller.safariWebsiteAccess.warrantsRepair {
            return [.welcome, .location, .enable, .grant, .safariReady]
        }
        return [.welcome, .location, .enable, .safariReady]
        #else
        [.welcome, .enable, .permission, .gps, .done]
        #endif
    }

    #if os(iOS)
    // No `canDeepLinkToSettings` here any more. The flow's shape no longer depends on
    // which route reaches the toggle — both routes now teach both consents, so `steps`
    // branches on evidence of a missing grant instead (see `steps`). The handoff screen
    // keeps its own copy, because *it* still branches: it has a different picture and a
    // different button per route.

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
            return "Mask the location and timezone you reveal online with a tap — and keep your real whereabouts private."
        case .enable:
            return "In Safari, choose Settings > Extensions and turn on GeoSpoof."
        case .permission:
            return "The first time you browse, Safari asks to allow access. Approving it is what lets GeoSpoof work — here's what you'll see."
        case .gps:
            return "Want more than Safari? GeoSpoof Pro can set a connected iPhone's real GPS for privacy and app testing, right from this Mac — no jailbreak. It's optional; browser spoofing is free."
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
        #if os(iOS)
        .onAppear {
            consumeSafariCompletionRequest()
        }
        .onChange(of: router.safariOnboardingCompletionRequested) { _, requested in
            if requested {
                consumeSafariCompletionRequest()
            }
        }
        // The hosted page's return link is the happy path, but it is not the only
        // way back: users routinely switch apps instead of tapping it. The
        // extension's own check-in is an equally authoritative signal that Safari
        // is ready, so treat it as a second entrance to the same screen.
        //
        // Keyed to the timestamp rather than to `isActiveInSafari`. The bool is
        // frequently already true on arrival — a leftover stamp from a previous
        // install, or from Safari loading the extension before the user switched it
        // off — and a value that is already true never reports a change, so the one
        // check-in that actually mattered would arrive unobserved. The timestamp
        // moves on every check-in, which is precisely the event worth waking for.
        .onChange(of: controller.extensionLastSeen) {
            advanceIfSafariIsActive()
        }
        // The third entrance, and on iOS 26.2+ the one that normally fires first: the
        // OS reporting that the extension is now switched on.
        .onChange(of: controller.safariEnablement) {
            advanceIfSafariIsActive()
        }
        #endif
        #if os(macOS)
        .adaptiveModalCover(isPresented: $showTrust) {
            TrustSheet()
        }
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
                onSkip: onDone,
                // Only ever true when the user came back to a step they'd finished:
                // on the way through, a satisfied Safari step is skipped rather than
                // shown (see `advance`).
                isAlreadyEnabled: hasAdvancedPastEnable && isSafariStepSatisfied,
                onContinue: { advance(from: .enable) }
            )
            .navigationBarHidden(false)
            .task {
                // Take the reference instant before the first poll reads it, so the
                // immediate check at the top of `watchForSafariActivation()` is
                // measured against arrival rather than against nothing.
                if safariStepEnteredAt == nil { safariStepEnteredAt = Date() }
                await watchForSafariActivation()
            }
        case .grant:
            OnboardingGrantAccessView(
                onOpenSafari: openSafariGrantPage,
                onSkip: onDone
            )
            .navigationBarHidden(false)
        case .safariReady:
            OnboardingSafariReadyView(
                controller: controller,
                onFinish: onDone
            )
            .navigationBarHidden(true)
            // Terminal by decision rather than by side effect. Hiding the bar already
            // removes the back button, but that is incidental — it says nothing about
            // the edge-swipe gesture, whose availability with a hidden bar is not
            // something to rely on staying put across iOS releases. Stating it here
            // means the screen keeps behaving the same either way.
            //
            // It should be terminal because there is nothing useful behind it: the
            // step before is either a completed location choice (whose selection state
            // is fresh again, so it presents a finished task as unfinished) or a Safari
            // step that is now satisfied and would immediately push forward again.
            .navigationBarBackButtonHidden(true)
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
        // Recorded here rather than at the watcher's call site so it holds however the
        // step was left — detection, or the Continue button the satisfied state offers.
        if kind == .enable { hasAdvancedPastEnable = true }
        // Skip anything with nothing left to ask. Previously the Safari step was
        // pushed unconditionally and then advanced off itself the instant it appeared,
        // so an already-configured device showed a screen that flashed and vanished —
        // which reads as a glitch rather than as a step that wasn't needed. Not
        // arriving at all is the honest version of the same outcome.
        guard let next = steps.dropFirst(index + 1).first(where: { !isStepSatisfied($0) }) else {
            onDone()
            return
        }
        // `.safariReady` owns entry conditions and a side effect (it requires a
        // location and warms the haptic engine), so it is always entered through its
        // own funnel rather than appended behind its back.
        if next == .safariReady {
            showSafariReady()
        } else {
            path.append(next)
        }
    }

    /// Whether a step can be skipped because there is nothing for the user to do on
    /// it. Only the Safari step can currently be satisfied ahead of time.
    ///
    /// `.grant` deliberately never is. The app cannot observe website access: the OS
    /// query answers for the extension *toggle* only, and the check-in stamp is written
    /// by any native-handler call — including the background script's, which runs
    /// without host access — so a fresh stamp is not evidence of a grant. Treating it
    /// as one would skip the step for someone who hasn't granted anything, which is
    /// exactly the silent-failure this step exists to prevent. Only the hosted page can
    /// prove it (a content script runs there or it doesn't), and that arrives as the
    /// return link rather than through this gate.
    private func isStepSatisfied(_ kind: StepKind) -> Bool {
        switch kind {
        case .enable: return isSafariStepSatisfied
        case .welcome, .location, .grant, .safariReady: return false
        }
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

        // The page's word isn't sufficient on its own, and this is the one place both
        // routes converge, so it is the one place worth checking.
        //
        // The activation page confirms only that GeoSpoof is running *on that page*. A
        // user who answers Safari's prompt with "Always Allow on This Website" while
        // standing on geospoof.com grants `*://*.geospoof.com/*` and nothing else — so the
        // page's content script runs, the page reports success, and it deep-links back
        // here to announce that Safari is ready while every other site on the internet
        // still sees the real location. That is not a hypothetical: it is what picking the
        // middle button of a three-button dialog does on the exact page this flow sends
        // people to, and it is reproducible.
        //
        // Only a confirmed negative diverts. `.unknown` has to pass through, or a fresh
        // install whose extension hasn't reported yet gets held back for lack of evidence
        // — which is the same overclaim in the other direction.
        // Diverts for the two states that look like mistakes, and not for `chosenSites` —
        // a user who scoped GeoSpoof to particular sites on purpose has finished setup, and
        // holding them on the grant screen would refuse to accept an answer they meant.
        if controller.safariWebsiteAccess.warrantsRepair {
            showGrantStep()
            return
        }
        // Both entrances funnel through here, which makes this the only place that
        // knows a success haptic is roughly a push-animation away. The engine is
        // reliably cold at this point — the app was backgrounded while the user
        // worked in Safari — and preparing it inside the destination's own `task`
        // would leave no time for the wake-up. Spending it here means the haptic
        // lands with the screen instead of after it.
        Haptics.prepare()
        hasReachedSafariReady = true
        path.append(.safariReady)
    }

    /// Send the user to the website-access step, from wherever they are.
    ///
    /// Guarded on the step being in the flow rather than assuming it: on the hosted-page
    /// route it is only present once a negative has been confirmed, which is exactly when
    /// this is called, but reading `steps` keeps the two from having to agree by memory.
    private func showGrantStep() {
        guard steps.contains(.grant) else { return }
        guard path.last != .grant else { return }
        path.append(.grant)
    }

    /// Advance on the extension's own check-in, but only on evidence produced
    /// *after* the user arrived at this step.
    ///
    /// A check-in stamp is a record of a moment, not of a state, so "the extension
    /// has checked in" is not the question this screen needs answered — "the
    /// extension checked in since I asked you to go and enable it" is. Comparing
    /// against `safariStepEnteredAt` is what makes that difference expressible.
    ///
    /// Without it, any stamp still inside the confidence window satisfies the gate,
    /// and the screen advances on history rather than on anything the user just
    /// did. That is not hypothetical: reinstalling and then disabling GeoSpoof in
    /// Safari leaves a fresh stamp behind with the extension switched off, so
    /// setup would congratulate the user on activating something they had turned
    /// off moments earlier. Requiring the stamp to beat a reference time taken on
    /// arrival makes stale evidence structurally unable to satisfy this, rather
    /// than merely unlikely to.
    ///
    /// The step guard stays for the case it was written for: `isActiveInSafari` can
    /// already be true when onboarding starts, so without it a user who enabled the
    /// extension before ever opening the app would jump from welcome straight to
    /// "Safari is ready" and never pick a location.
    private func advanceIfSafariIsActive() {
        guard !hasReachedSafariReady else { return }
        // Already been past this step, so the user is here by choice — they navigated
        // back. Auto-advancing would overrule that and strand them.
        guard !hasAdvancedPastEnable else { return }
        guard current == .enable, isSafariStepSatisfied else { return }
        // Advance through `steps` rather than jumping to the success screen. The
        // extension being switched on used to be the last thing setup needed, so
        // "enabled" and "finished" were the same event and this could land directly on
        // `.safariReady`. With `.grant` in the flow they are different events, and
        // hard-coding the destination here would step over it — the OS reports the
        // toggle the moment the user flips it, which is before they have granted
        // anything. Routing through `advance` also keeps the skip logic in one place.
        advance(from: .enable)
    }

    /// Whether the Safari step has nothing left to ask of the user.
    ///
    /// One definition, used both to advance off the step and to decide whether to push
    /// it at all, so the two can never disagree about the same device.
    ///
    /// Where the OS can be asked, its answer alone decides this — a verified-on
    /// extension is finished, with or without a check-in. Requiring a check-in as well
    /// meant an already-enabled user was sent out to the hosted activation page to
    /// produce one, which is the same detour the OS query exists to remove, and it
    /// proved nothing: the check-in comes from the background script, so it cannot
    /// attest to per-site permission.
    ///
    /// Below iOS 26.2 there is no answer to ask for, so the stamp is all there is — and
    /// there it must postdate arrival at the step, or a leftover stamp from a disabled
    /// extension would satisfy it.
    private var isSafariStepSatisfied: Bool {
        switch controller.safariSetupState {
        case .verifiedEnabled:
            // The OS says the extension is on, which is precisely what this step asked
            // for. Nothing further to verify, and nowhere useful to send the user.
            return true
        case .verifiedDisabled:
            return false
        case .inferred:
            // No OS answer, so a stamp only counts as evidence about now if it
            // postdates arrival at this step.
            guard let safariStepEnteredAt,
                  let lastSeen = controller.extensionLastSeen else { return false }
            return lastSeen > safariStepEnteredAt
        }
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
            // Also re-ask the OS. Foregrounding covers the ordinary return from
            // Settings, but not iPad multitasking — where GeoSpoof and Settings can
            // both be on screen, so the app never re-activates and would otherwise sit
            // on a finished step with nothing left to say.
            controller.refreshSafariEnablement()
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
        SFSafariApplication.showPreferencesForExtension(withIdentifier: AppGroup.extensionBundleIdentifier)
    }
    #endif

    #if os(iOS)
    /// Opens the first-party activation page in the user's default browser.
    /// The page itself will handle the non-Safari fallback in the next slice;
    /// iOS provides no public API for forcing an HTTPS link into Safari.
    private func openSafariActivationPage() {
        openActivationPage(stage: nil)
    }

    /// The grant step's route to the same page, distinguished by `stage=grant` so the
    /// page can drop the "turn the extension on" half of its walkthrough. Someone
    /// arriving from here has already done that in Settings, and re-teaching it invites
    /// them to go looking for a switch that is already flipped.
    ///
    /// The parameter is sent before the page reads it: the site still renders the full
    /// walkthrough, which is wrong-but-harmless (it over-explains) rather than broken.
    private func openSafariGrantPage() {
        openActivationPage(stage: "grant")
    }

    private func openActivationPage(stage: String?) {
        UIApplication.shared.open(
            AppLink.activationPage(
                campaign: stage == nil ? "onboarding-activate" : "onboarding-grant",
                stage: stage
            )
        )
    }
    #endif
}

#if os(iOS)
/// A one-time, branded welcome after iOS hands control to the app. It renders in
/// its finished state immediately: the system launch screen remains neutral,
/// Shared measures for the onboarding screens.
///
/// iPad is why these exist. Every screen here reads correctly on an iPhone, where
/// `maxWidth: .infinity` inside a 32pt gutter *is* a sensible column — but the same code
/// on a 13" iPad produces a prominent button over a thousand points wide and body copy
/// running the full width of the display. Two of the four screens already capped their
/// content at 600 and centred it; naming the measures makes that the rule instead of
/// something each screen separately remembers or forgets.
private enum OnboardingMetrics {
    /// Widest a *centred splash* column gets. Used by the welcome screen only, where the
    /// icon and copy are centre-aligned and a narrow measure is the point.
    ///
    /// Deliberately not applied to the two page-style screens. Capping those produced a
    /// 600pt column with roughly 216pt of empty margin either side of a 13" display —
    /// a phone layout stranded in the middle of an iPad. Those are normal pages now.
    static let contentMaxWidth: CGFloat = 600

    /// Page margin for a full-width screen, widening with the size class the way iPad's
    /// own detail panes do — 24pt hugs the edge on a 1000pt-wide display.
    static func pageMargin(_ sizeClass: UserInterfaceSizeClass?) -> CGFloat {
        sizeClass == .regular ? 44 : 24
    }

    /// Widest a primary action gets. Deliberately narrower than the content column: a
    /// button stretched to the full measure of the prose beside it reads as a banner
    /// rather than a control, and Apple's own setup flows keep the button tighter than
    /// the text.
    static let actionMaxWidth: CGFloat = 420

}

/// A bottom action bar that spans the display while its controls stay within
/// `OnboardingMetrics.actionMaxWidth`.
///
/// The split is the point. The divider and material are chrome and should run edge to
/// edge; the button inside is a control and should not. These bars previously carried
/// only `.padding(.horizontal, 20)`, so on iPad the button stretched the full width
/// directly beneath content capped at 600 — which was the most visible iPad problem in
/// the flow, because the mismatch is between two things you can see at once.
private struct OnboardingActionBar<Content: View>: View {
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(spacing: 0) {
            Divider()

            VStack(spacing: 0) {
                content()
            }
            .frame(maxWidth: OnboardingMetrics.actionMaxWidth)
            .frame(maxWidth: .infinity)
        }
        .background(.regularMaterial)
    }
}

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
                    .frame(maxWidth: OnboardingMetrics.contentMaxWidth)

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
                    // Caps the button and the legal links together, so the two stay
                    // visually attached instead of the button spanning the display with
                    // a short line of small print centred under it.
                    .frame(maxWidth: OnboardingMetrics.actionMaxWidth)
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
        .onAppear {
            store.preload()
            // The next thing that happens on this screen is a tap on a city, so
            // pay the engine wake-up cost now rather than inside that tap.
            Haptics.prepare()
        }
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
                    // Selection feedback, not impact: this moves the checkmark
                    // within a set of choices and commits nothing, which is
                    // exactly what `UISelectionFeedbackGenerator` describes. The
                    // main app's own city list already ticks on tap, so without
                    // this the same gesture felt different during setup than it
                    // does forever after.
                    Haptics.selection()
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
        OnboardingActionBar {
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
    }

    private func useSelection() {
        guard let selection else { return }

        switch selection {
        case .place(let place):
            controller.setLocation(from: place)
        case let .coordinates(latitude, longitude):
            controller.setLocation(latitude: latitude, longitude: longitude, name: nil)
        }

        // An impact, not `.notify(.success)`. This commits a setting and moves to
        // the next step — it is not the end of anything, and the flow now has a
        // real completion at the end of it. Reserving the notification-success
        // pattern for that one moment is what gives the sequence an arc; when
        // every step fired `.success` the strongest feedback in the app was spent
        // three screens before the user had actually finished.
        //
        // `.medium` places it on the existing scale deliberately: heavier than a
        // favorite toggle (`.light`), lighter than a completed VPN sync
        // (`.notify(.success)`).
        Haptics.impact(.medium)
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
        // Matches a city row rather than the confirm button: this sheet hands a
        // reviewed pair back to the location screen, so what changed is the
        // selection. The two invalid paths above already fire `.error`, and
        // leaving the valid path silent made the sheet feel like it only had an
        // opinion when the user got it wrong.
        Haptics.selection()
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

    /// `nonisolated` because the initializer calls it while seeding `@State`, and a
    /// `View`'s init is not main-actor isolated. Nothing here touches actor state — it is
    /// arithmetic on a `Double` — so the isolation the type would otherwise infer is
    /// inherited rather than needed, and inheriting it is what made those two calls warn.
    private nonisolated static func coordinateString(_ value: Double) -> String {
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

    /// Whether the user is revisiting a step they have already completed, which only
    /// happens by navigating back to it.
    ///
    /// Changes what the screen claims and what it offers. Left as-is it would tell
    /// someone who has already switched GeoSpoof on to go and switch it on, and hand
    /// them a button to Settings as the only way forward — a screen with no exit except
    /// backwards or "later".
    let isAlreadyEnabled: Bool
    /// Forward from the satisfied state. Distinct from the detection path, because here
    /// the user is deciding to move on rather than the app noticing they can.
    let onContinue: () -> Void

    /// On iOS 26.2+ the app can send the user straight to GeoSpoof's row in Settings,
    /// which removes the entire reason this screen hands off to a web page: there is
    /// no longer any need to teach a route, depend on Safari being the default
    /// browser, or have a page detect the extension in order to report back.
    ///
    /// When that route exists the screen drops both the page-menu walkthrough and the
    /// hosted-setup button rather than offering all three. They describe alternative
    /// ways to reach the same switch, and a setup screen listing three routes to one
    /// destination is how people end up unsure which one they were meant to take.
    private var canDeepLinkToSettings: Bool { controller.canOpenSafariExtensionSettings }

    @Environment(\.horizontalSizeClass) private var hSizeClass

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
                    // Hosted-page route only, and it stays that way even though the
                    // website-access step no longer follows on either route.
                    //
                    // The original reason for hiding it here was that `.grant` came next
                    // on the deep-link route, so the claim was false. That reason is gone,
                    // but the badge still shouldn't come back: on 26.2+ this screen makes
                    // the same point twice already — the sentence above says both switches
                    // are on one Settings screen, and the checklist ends at three. A third
                    // assurance about how small the task is adds nothing to the two that
                    // are more specific than it.
                    //
                    // It keeps earning its place on the other route, where the numbered
                    // list is a journey across three Safari screens rather than two
                    // switches on one. There the badge is saying something the list can't:
                    // three taps, still only one step of setup left.
                    //
                    // The second clause is the accuracy fix that the flow change made
                    // reachable to state properly. A confirmed-missing grant puts `.grant`
                    // after this step on *either* route (see `OnboardingView.steps`), and
                    // this badge used to announce finality straight through that case.
                    // Reading the same property `steps` branches on is what keeps the two
                    // from drifting.
                    if !canDeepLinkToSettings, !controller.safariWebsiteAccess.warrantsRepair {
                        Text("Last step")
                            .font(.footnote.weight(.semibold))
                            .foregroundStyle(Color.brand)
                    }

                    if isAlreadyEnabled {
                        // Same confirmation the macOS flow shows for this step, string
                        // included, so the two platforms agree about what "done" looks
                        // like. Replaces the instruction rather than sitting above it:
                        // telling someone to turn on a switch they already turned on is
                        // how a flow convinces them it isn't tracking what they did.
                        Label("GeoSpoof is enabled in Safari", systemImage: "checkmark.circle.fill")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.green)
                            .fixedSize(horizontal: false, vertical: true)
                    } else if canDeepLinkToSettings {
                        // Sets the count before the list does, because the count is the
                        // part that stops someone leaving after the first switch. The
                        // existing one-switch sentence is kept for the other route below,
                        // where it is still accurate: that route hands off to a page that
                        // walks through website access itself.
                        Text("GeoSpoof needs two switches turned on, and they're both on the same Settings screen.")
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    } else {
                        Text("Turn GeoSpoof on in Safari's extension settings.")
                            .font(.body)
                            .foregroundStyle(.secondary)
                            .fixedSize(horizontal: false, vertical: true)
                    }

                    // No per-profile line here. Enablement is per Safari profile and the
                    // app can't see which profile someone browses in, but the screenshot
                    // below shows whichever version of that screen the reader is about to
                    // see: an "Allow Extension In" list with a switch per profile on iPad,
                    // a single "Allow Extension" on iPhone, because Safari only splits it
                    // out once profiles exist. Either way the picture matches the screen
                    // they land on, which a sentence covering both cases could not.
                    //
                    // Home's Setup card still carries the sentence, because that card has
                    // no screenshot to do the work — and because a user who got that far
                    // without it working is exactly who a forgotten profile applies to.
                }
                // One announcement ("Last step. Turn GeoSpoof on …") instead of two
                // fragments, since the label only means anything attached to it.
                .accessibilityElement(children: .combine)
                .padding(.bottom, 20)

                // One route per branch. The Settings branch shows where the button lands
                // and how to get there by hand; the hosted-page branch shows the
                // page-menu gesture, since that flow has one.
                if canDeepLinkToSettings {
                    // Regular caps the width, because a screenshot blown up to the full
                    // width of a 13" display stops reading as a screenshot. Compact caps
                    // the height instead — see `maxImageHeight`.
                    SafariSettingsDestinationView(
                        maxImageWidth: hSizeClass == .regular ? 560 : .infinity,
                        // Portrait capture on compact, so the height is the binding cap
                        // there; the landscape one is capped by width instead.
                        maxImageHeight: hSizeClass == .regular ? .infinity : 340
                    )
                    .padding(.bottom, 24)
                } else {
                    SafariActivationAnimation(horizontalInset: 0)
                        .padding(.bottom, 24)
                }

                // No "what permissions does GeoSpoof ask for?" link here any more, on
                // either route, because both routes now answer it closer to the moment
                // it gets asked. `.grant` is entirely about that prompt and shows the two
                // real dialogs. The hosted activation page carries its own "What is
                // Safari asking for?" disclosure, and it only sends the user back with
                // success once the extension is detected on the page — which cannot
                // happen until access is granted, so the page has necessarily walked them
                // through it.
                //
                // Raising it here as well meant asking the question one screen before
                // anything could be done about it, and then asking again where it
                // mattered. Reachable outside the flow from Home's Setup card
                // ("Is GeoSpoof safe?") for anyone who wants it early.

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
            // A normal full-width page. No reading-column cap: capping at 600 left ~216pt
            // of dead margin on either side of a 13" display, which reads as a phone
            // layout stranded in the middle of an iPad rather than as a deliberate
            // measure. Page margins widen with the size class instead, which is what
            // iPad's own detail panes do.
            .padding(.horizontal, OnboardingMetrics.pageMargin(hSizeClass))
            .padding(.top, 12)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Enable in Safari")
        .navigationBarTitleDisplayMode(.large)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            OnboardingActionBar {
                if isAlreadyEnabled {
                    // Forward is the primary action now: the thing this screen asked
                    // for has been done, so continuing is what the user came back to be
                    // able to do.
                    Button(action: onContinue) {
                        Text("Continue")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                    }
                    .glassButtonStyle(prominent: true)
                    .controlSize(.large)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)

                    // Kept, demoted. Enablement is per Safari profile and the app cannot
                    // see which profile someone browses in, so "it says enabled but it
                    // isn't working" has a real cause and this is its fix — which is the
                    // main reason coming back here is worth allowing at all.
                    Button {
                        controller.openSafariExtensionSettings()
                    } label: {
                        Text("Open Safari Settings")
                            .font(.subheadline)
                            .frame(maxWidth: .infinity, minHeight: 44)
                            .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.brand)
                    .padding(.horizontal, 20)
                    .padding(.bottom, 4)
                    .accessibilityHint("Opens Settings, where you can check which Safari profiles GeoSpoof is on for")
                } else if canDeepLinkToSettings {
                    // One tap to the actual switch. No default-browser dependency, no
                    // page to load, nothing to detect — and the app reads the result
                    // from the OS when it foregrounds, so the user does not have to
                    // report back by tapping anything on return.
                    Button {
                        controller.openSafariExtensionSettings()
                    } label: {
                        Label("Open Safari Settings", systemImage: "gearshape")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                    }
                    .glassButtonStyle(prominent: true)
                    .controlSize(.large)
                    .padding(.horizontal, 20)
                    .padding(.top, 12)
                    .accessibilityHint("Opens Settings where you can switch GeoSpoof on for Safari")
                } else {
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
                }

                // Not offered in the satisfied state. "Later" refers to the task this
                // screen sets, and that task is done — leaving it there asks the user to
                // defer something they already finished, next to a Continue button that
                // is the actual way on. The step that follows carries its own skip, so
                // no exit is lost.
                if !isAlreadyEnabled {
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
            }
        }
        .background(Color(uiColor: .systemBackground))
        .tint(.brand)
    }

    private static func coordinateSummary(latitude: Double, longitude: Double) -> String {
        "\(latitude.formatted(.number.precision(.fractionLength(0...5)))), \(longitude.formatted(.number.precision(.fractionLength(0...5))))"
    }
}

/// Website access — the second consent, and the one the Settings deep link can't
/// deliver.
///
/// Only reached on the deep-link route (see `OnboardingView.steps`). Flipping the
/// extension toggle in Settings does not let GeoSpoof touch a single page; Safari asks
/// about that separately, on a web page, the first time the extension wants to run. A
/// user who stops after Settings has an extension that is on and doing nothing, and
/// nothing in the app would say so — which is the failure this screen exists to
/// prevent.
///
/// The screenshots earn their place here specifically. They were deliberately moved off
/// the handoff screen into `TrustSheet`, because there they were answering a question
/// ("what is Safari going to ask me?") that only some people stop to ask, and two
/// screenshot cards plus an illustration was too much for one screen. Here they are the
/// instruction: the user is seconds from seeing exactly these two dialogs, and the
/// decision they have to get right is which button to tap in the second one.
///
/// Two actions, not three. An earlier version offered a self-certifying "I've allowed
/// it" alongside "I'll do this later", and they were the same button: neither carries any
/// evidence, both just move the flow on, and the pair took a third of the screen to say
/// one thing twice. Only the label differed, and the app has no way to know which of the
/// two labels was true.
///
/// So there is one way past this screen, and it is honest about what the app knows —
/// nothing. `.safariReady` is now reached only by a route that carries proof: the hosted
/// page's return link, which it renders only once it has detected the extension running
/// on itself, which cannot happen before access is granted. Everything else lands on
/// Home, whose Setup card is built to carry unfinished setup.
///
/// The tradeoff, stated so it isn't rediscovered as a bug: someone who grants access on
/// the page and then app-switches back instead of tapping the return link doesn't see the
/// success screen. That is the cost of not letting the app claim a grant it cannot
/// observe, and it resolves the day the extension reports website access directly.
private struct OnboardingGrantAccessView: View {
    let onOpenSafari: () -> Void
    let onSkip: () -> Void

    @Environment(\.horizontalSizeClass) private var hSizeClass

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 0) {
                VStack(alignment: .leading, spacing: 6) {
                    // Accurate here in a way it isn't on the handoff screen any more:
                    // on this route the grant is the end of setup. Reuses the existing
                    // translated string rather than introducing a second phrasing.
                    Text("Last step")
                        .font(.footnote.weight(.semibold))
                        .foregroundStyle(Color.brand)

                    // Names the button rather than describing the concept. "Grant host
                    // permissions" is what it is; "Always Allow on Every Website" is
                    // what they have to tap, and it's the only wording that survives
                    // the trip into Safari.
                    Text("Safari asks before GeoSpoof can change what websites see. Choose Always Allow on Every Website.")
                        .font(.body)
                        .foregroundStyle(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                }
                .accessibilityElement(children: .combine)
                .padding(.bottom, 24)

                PermissionPromptsView(imageHeight: hSizeClass == .regular ? 260 : 170)
                    .padding(.bottom, 20)

                // The one branch worth naming, because it fails later rather than
                // immediately: "Allow for One Day" is the prominent default, it works,
                // and then it silently stops. A user who takes it has no reason to
                // connect tomorrow's failure to today's tap, so this is the only chance
                // to warn them.
                Text("Avoid \u{201C}Allow for One Day\u{201D} — GeoSpoof stops working when it expires.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .padding(.horizontal, OnboardingMetrics.pageMargin(hSizeClass))
            .padding(.top, 12)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .navigationTitle("Allow on Websites")
        .navigationBarTitleDisplayMode(.large)
        .safeAreaInset(edge: .bottom, spacing: 0) {
            OnboardingActionBar {
                Button(action: onOpenSafari) {
                    Label("Open Safari", systemImage: "safari")
                        .font(.headline)
                        .frame(maxWidth: .infinity)
                }
                .glassButtonStyle(prominent: true)
                .controlSize(.large)
                .padding(.horizontal, 20)
                .padding(.top, 12)
                .accessibilityHint("Opens a page in Safari where GeoSpoof asks for website access")

                Button(action: onSkip) {
                    Text("Continue")
                        .font(.subheadline)
                        .frame(maxWidth: .infinity, minHeight: 44)
                        .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .foregroundStyle(.secondary)
                .padding(.horizontal, 20)
                .padding(.bottom, 4)
                .accessibilityHint("Finishes setup without website access. GeoSpoof won't change websites until you allow it in Safari.")
            }
        }
        .background(Color(uiColor: .systemBackground))
        .tint(.brand)
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
    /// Flipped once on arrival to drive this screen's single success haptic. Held
    /// as state and fed to `sensoryFeedback` rather than firing imperatively from
    /// `onAppear`, so the feedback is declared as a consequence of arriving rather
    /// than as a side effect that runs on every appearance callback.
    ///
    /// Now also drives the checkmark's bounce, so the haptic and the thing it is about
    /// happen on the same frame. One flag rather than two: a haptic arriving ahead of the
    /// visual it belongs to is the specific thing that makes a moment feel cheap, and two
    /// flags is how they drift apart.
    @State private var hasArrived = false
    @Environment(\.horizontalSizeClass) private var hSizeClass
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Beat between the push beginning and the reveal firing.
    ///
    /// `.task` runs as the destination appears, which is when the push *starts* — so
    /// firing immediately put the haptic a third of a second ahead of the screen it
    /// belongs to. Waiting out the push means the map and the haptic land as it settles,
    /// and the whole thing reads as one arrival rather than two events.
    ///
    /// Matched to UIKit's push by eye, because there is no public API for that duration,
    /// and deliberately a little short of it: landing inside the tail feels connected,
    /// landing after it feels like a response to something.
    private static let revealDelay: Duration = .milliseconds(280)

    /// Compact matches `LocationMapPane`, so the two places the app shows a location map
    /// agree on iPhone.
    ///
    /// Regular no longer does. `LocationMapPane`'s 320 is sized for a card inside a
    /// `Form`, which stays narrow; this map now spans a full-width page, so at 320 it was
    /// a ~3:1 letterbox strip. 420 brings it back to roughly the proportion it has on
    /// iPhone.
    private var mapHeight: CGFloat {
        hSizeClass == .compact ? 180 : 420
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
                // The app's existing mark for "this is working", at the one place it has
                // most earned it. `checkmark.circle.fill` in green is already the
                // vocabulary — Home's status footer, the WebRTC row, the enable step on
                // both platforms, and macOS's own completion step all use it — so the
                // iOS success screen not having one was the inconsistency.
                //
                // Above the title rather than inline with it: a symbol set in largeTitle
                // beside largeTitle text competes with the words instead of introducing
                // them.
                //
                // Hidden from VoiceOver because the heading immediately below says the
                // same thing in words, and "checkmark, Safari is ready" is the mark being
                // read out as though it were content.
                Image(systemName: "checkmark.circle.fill")
                    .font(.system(size: 44, weight: .semibold))
                    .foregroundStyle(.green)
                    .symbolRenderingMode(.hierarchical)
                    // Apple's own success gesture, and the reason this replaced a fade:
                    // the fade was 10pt over half a second underneath a push animation,
                    // which is to say invisible. A moment nobody notices isn't restraint,
                    // it's dead code.
                    //
                    // Feeding `false` under Reduce Motion means the trigger never changes,
                    // so the effect never runs — the mark still appears, it just doesn't
                    // gesture. The haptic is untouched either way; it answers to the
                    // system's own haptics setting.
                    .symbolEffect(
                        .bounce,
                        options: .nonRepeating,
                        value: reduceMotion ? false : hasArrived
                    )
                    .accessibilityHidden(true)
                    .padding(.bottom, 14)

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
            .padding(.horizontal, OnboardingMetrics.pageMargin(hSizeClass))
            .padding(.top, 32)
            .padding(.bottom, 32)
            .frame(maxWidth: .infinity, alignment: .leading)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            OnboardingActionBar {
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
        }
        .background(Color(uiColor: .systemBackground))
        // The one completion in the flow, and the only `.success` on the iOS path.
        //
        // This screen is reached after the user left the app, did work in another
        // app, and came back — the longest gap in the whole experience and the
        // point at which they most need telling that it worked. Every earlier step
        // is a selection or a commit and is weighted accordingly, so this is the
        // first and only time the app plays notification-success.
        //
        // Fires on the false → true transition, which `sensoryFeedback` treats as
        // a change while ignoring the initial value; `showSafariReady()` has
        // already warmed the engine by the time the push lands.
        .sensoryFeedback(.success, trigger: hasArrived)
        .task {
            // Cancellation leaves `hasArrived` false, which would leave the reveal
            // hidden — acceptable, because `.task` is only cancelled when this screen is
            // going away, and this is a terminal screen with no way back to it.
            try? await Task.sleep(for: Self.revealDelay)
            guard !Task.isCancelled else { return }
            // No `withAnimation`: the mark's bounce is a symbol effect driven by this
            // value changing, and it carries its own timing. Wrapping it would animate
            // nothing and imply otherwise.
            hasArrived = true
        }
        // Both detail sheets undim their backdrop so their frost has something to
        // sample, and iOS treats undimmed as interactive — so this screen stands
        // down while one is open. Without it a tap near the sheet's edge lands on
        // a row behind it and stacks a second sheet on the first. Restored on
        // dismiss, since the flag is the same one driving the presentation.
        .allowsHitTesting(!showDeviceGps && !showVpn)
        .tint(.brand)
        // A plain sheet, not `adaptiveModalCover`. That presenter sends iPad to a
        // fullscreen cover, which is right for `TrustSheet`'s stack of cards but wrong
        // here: this content is a header, three lines and a button, so a whole iPad
        // display is ~90% empty under it. These two want a modal card that hugs the
        // content — `explainerSheetPresentation()` sizes it.
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

    /// Drives the iPad card's height. Unused on iPhone, where detents own the shape.
    @State private var contentHeight: CGFloat = 0

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
                .measuringExplainerContentHeight(into: $contentHeight)
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
        // informational sheet — rather than a one-off detent here. It handles the
        // iPad card too, since "don't leave the bottom empty" is the same
        // requirement there.
        .explainerSheetPresentation(padContentHeight: contentHeight)
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

    /// Drives the iPad card's height. Unused on iPhone, where detents own the shape.
    @State private var contentHeight: CGFloat = 0

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
                .measuringExplainerContentHeight(into: $contentHeight)
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
        // Same presentation as `DeviceGpsSheet`. The two rows that open these sit next
        // to each other, so a difference between them would read as one being broken.
        .explainerSheetPresentation(padContentHeight: contentHeight)
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

            Text("Both are Safari's standard warnings. GeoSpoof only uses this access to spoof location and timezone — it never reads, stores, or sends your browsing.")
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

#if os(iOS)
/// A centred modal card for iPad: a fixed comfortable width, and a height handed in from
/// a measurement of the sheet's own content.
///
/// **Why a card at all.** iPad has no bottom sheet. Once the window is regular width the
/// system stops attaching a sheet to the bottom edge and centres it as a card, and
/// detents stop behaving like detents — so the `.medium`/`.large` pair that shapes these
/// sheets on iPhone buys iPad nothing, and there is no public API that asks for a
/// bottom-anchored, draggable sheet there. What iPad chooses between is card sizes.
///
/// **Why none of the three built-in sizes.**
/// - `.form` (the iPadOS 18 default, and what these shipped with) is ~540pt, which wraps
///   this copy into a narrow column while the display around it goes unused.
/// - `.page` is a near-full-height card, so short content leaves most of it empty.
/// - `.fitted` is the one that should have worked, and it can't measure these sheets.
///
/// **Why `.fitted` can't measure them, which is the whole reason this type exists.**
/// Automatic sizing measures the *presented root* by proposing an unspecified height to
/// it. These sheets' root is an `AdaptiveNavigationStack` wrapping a `ScrollView`, and a
/// `ScrollView` has no preferred height under a nil height proposal — it is a view whose
/// job is to fill whatever it's given. Probing it here returned exactly 0.0 for an
/// unspecified proposal, and 10000.0 for a proposal of 10000: it reports back whatever it
/// is offered and contributes no information of its own. Apple's guidance says the same
/// thing — with a `ScrollView` in the sheet you have to measure the view *inside* it. So
/// the content measures itself (see `measuringExplainerContentHeight(into:)`) and hands
/// the number here.
///
/// **Why 640 wide.** Both callers cap their content column at `maxWidth: 600` inside
/// `padding(20)`, so 640 is the widest card whose content isn't sitting in its own inner
/// gutters — and it's ~100pt clear of `.form`, which is the difference between reading as
/// a thin strip and reading as a card. It's proposed from the very first call, before any
/// measurement exists, so the content's first layout pass is already at its final width
/// and only the height settles afterwards.
private struct ExplainerCardSizing: PresentationSizing {
    /// The measured height of the sheet's scrolling content. Zero until the first layout
    /// pass has reported one.
    var contentHeight: CGFloat

    /// Card width, and therefore the width the content gets measured at.
    var width: CGFloat = 640

    /// Room for the inline navigation bar, which sits outside the measured content and so
    /// can't come from the measurement. Deliberately rounded up: overshooting leaves a
    /// few points of empty card, undershooting makes short content scroll.
    var navigationBarAllowance: CGFloat = 56

    func proposedSize(
        for root: PresentationSizingRoot,
        context: PresentationSizingContext
    ) -> ProposedViewSize {
        // No measurement yet (first call, or a degenerate one): propose the width only
        // and let the system pick the height, rather than committing to a bad number.
        guard contentHeight > 0, contentHeight.isFinite else {
            return ProposedViewSize(width: width, height: nil)
        }
        // No upper clamp. A proposal taller than the container is limited to the
        // container by the presentation itself, and the `ScrollView` scrolls from there —
        // which is the behaviour large Dynamic Type and long translations need.
        return ProposedViewSize(width: width, height: contentHeight + navigationBarAllowance)
    }
}

private extension View {
    /// Reports this view's laid-out height, for `ExplainerCardSizing` to size an iPad
    /// card from.
    ///
    /// `onGeometryChange` rather than a `GeometryReader` + `PreferenceKey` pair: it's the
    /// current way to do this, it writes straight to state, and it doesn't join the
    /// layout as a greedy participant the way a bare `GeometryReader` does.
    ///
    /// Attach to the content *inside* the `ScrollView`, not to the sheet root — see
    /// `ExplainerCardSizing` for why measuring the root returns nothing. iPhone ignores
    /// the value; it's measured unconditionally so both sheets read the same.
    func measuringExplainerContentHeight(into height: Binding<CGFloat>) -> some View {
        onGeometryChange(for: CGFloat.self) { proxy in
            proxy.size.height
        } action: { newHeight in
            height.wrappedValue = newHeight
        }
    }
}
#endif

private extension View {
    /// The app's presentation for an explainer sheet.
    ///
    /// iPhone: opens at half height, drags up to full for anyone who needs the room
    /// (large Dynamic Type, or a long translation), with a drag indicator so that's
    /// discoverable.
    ///
    /// iPad: a centred card sized to `padContentHeight` instead — see
    /// `ExplainerCardSizing` for why detents can't do the job there and why the height has
    /// to be measured and passed in. No drag indicator, because the card isn't resizable
    /// and a grabber would advertise a gesture that does nothing.
    ///
    /// Shared by `TrustSheet`, `DeviceGpsSheet` and `VpnSheet` so the app's three
    /// informational sheets behave identically. `TrustSheet` only ever takes the iPhone
    /// branch in practice: it's presented through `adaptiveModalCover`, so on iPad it's
    /// a fullscreen cover and any sizing here is ignored.
    ///
    /// Falls back to full height if deployment targets are ever lowered. The glass
    /// treatment is separate — see `frostedSheetBackground()`.
    @ViewBuilder
    func explainerSheetPresentation(padContentHeight: CGFloat = 0) -> some View {
        #if os(iOS)
        // Device idiom rather than `horizontalSizeClass`, for the reason spelled out in
        // `AdaptiveModalCover`: the size class can read compact on iPad depending on
        // where the modifier sits, while the idiom is stable.
        if UIDevice.current.userInterfaceIdiom == .pad {
            self.presentationSizing(ExplainerCardSizing(contentHeight: padContentHeight))
        } else {
            self.bottomSheetPresentation()
        }
        #else
        self.bottomSheetPresentation()
        #endif
    }

    /// The half-height, draggable presentation. Split out only so the platform branch
    /// above doesn't state it twice.
    @ViewBuilder
    func bottomSheetPresentation() -> some View {
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
    /// the blur survives and only its intensity changes.
    ///
    /// 0.55 is the lighter of the two values this has held. It had been raised to 0.68
    /// to stop the map competing with the copy, and that reading was reversed on
    /// device: at 0.68 the frost is heavy enough to read as a slab rather than as
    /// glass, which is the thing the whole helper exists to avoid. Back at 0.55 the
    /// map is visible as depth behind the sheet, which is the intended effect.
    ///
    /// The useful range is narrow and bounded at both ends. Past ~0.8 it stops reading
    /// as glass at all; near 0 the backdrop wins and the copy becomes hard to read
    /// over a busy map. Anything outside roughly 0.5–0.7 should be checked against the
    /// close screen specifically, since its map is the most demanding backdrop in the
    /// app — and checked on a device, because neither failure shows up in a simulator
    /// screenshot the way it does in the hand.
    ///
    /// The catch on undimming, per Apple: dimming and touch pass-through are the
    /// same setting, so the content behind goes live. Hosts must disable hit testing
    /// while a sheet is up — see `OnboardingSafariReadyView`.
    ///
    /// Applied by `DeviceGpsSheet` and `VpnSheet` only. `TrustSheet` keeps the plain
    /// system treatment: it's a stack of `.regularMaterial` cards, which need a
    /// calm backing to keep their edges.
    ///
    /// iPhone only. The two halves of this depend on the detented presentation that only
    /// iPhone gets: `upThrough: .medium` names a detent the iPad card doesn't have, so
    /// the backdrop stays dimmed there and the scrim would then be laid over a dim layer
    /// rather than over live glass — the exact "reads as a slab" failure this helper
    /// exists to avoid. iPad keeps the standard system card material.
    @ViewBuilder
    func frostedSheetBackground() -> some View {
        if #available(iOS 16.4, *), UIDevice.current.userInterfaceIdiom != .pad {
            self
                .background(Color(uiColor: .systemBackground).opacity(0.55))
                .presentationBackgroundInteraction(.enabled(upThrough: .medium))
        } else {
            self
        }
    }
}
#endif

#if os(iOS)
// MARK: - Safari settings destination (iOS)

/// What to do on the Settings screen the hand-off button opens: the switches as a
/// numbered list, a screenshot of the real pane, and the manual route to it in words.
///
/// A photograph of the destination rather than an illustration of the gesture, because on
/// the Settings route there is no gesture to teach — the button does the navigating, and
/// what the user needs is to recognise the screen when it appears and know which switches
/// matter. The screenshot carries two things the copy can only assert: that the switches
/// are per Safari profile, and that Private Browsing is a separate one. Both are the
/// misses that leave someone with an app reporting success and a Safari that isn't
/// spoofing.
///
/// This is also where website access is asked for now, which is why the list is here and
/// not just a caption. There used to be a separate `.grant` step after this one for the
/// second consent; the Settings pane's Permissions section collapsed to a single "All
/// Websites" row once the manifest stopped declaring service origins, which put both
/// consents on this one screen and made the extra step a second trip for something
/// already on display. See `OnboardingView.steps` for what remains of that step, and
/// `src/build/manifest.ts` for the coupling to the origin list.
///
/// The breadcrumb is the fallback, and it is not hypothetical: the deep link depends on an
/// OS-provided route that can land somewhere adjacent, and it does nothing at all if
/// Settings is already open on another screen. A user who taps and sees the wrong pane has
/// no way to recover unless the path is written down, so it's on screen before they leave
/// rather than buried in support.
///
/// Sibling to `SafariActivationAnimation`, which is what the *other* branch of the
/// hand-off screen shows. The two are alternatives, never both: they describe different
/// routes to the same switch, and a setup screen offering two routes is how people end up
/// unsure which one they were meant to take.
struct SafariSettingsDestinationView: View {
    /// Widest the screenshot gets. `.infinity` lets it span the card.
    ///
    /// The artwork is idiom-specific (see the `SafariExtensionEnabled` image set), and
    /// the two shots have opposite proportions: the iPad capture is near-square
    /// landscape, the iPhone one is tall portrait. So neither knob alone can size both —
    /// hence a cap in each axis, with the call site supplying whichever one binds.
    var maxImageWidth: CGFloat = .infinity

    /// Tallest the screenshot gets.
    ///
    /// This is the one that matters on iPhone, where the capture is the taller of the
    /// two. Left uncapped it spans the page at 429pt, which is most of a phone display
    /// for a screenshot that is supporting evidence rather than the subject — and it
    /// pushes the "Settings › Apps › Safari …" fallback path below the fold, which is
    /// the part that helps anyone the button didn't land correctly for.
    ///
    /// Kept as a separate knob rather than folded into a single measurement because the
    /// captures get retaken, and their proportions have already changed more than once.
    /// A cap per axis holds regardless of which way the next one leans.
    ///
    /// Both caps are always applied, so no combination can overflow: `.aspectRatio(.fit)`
    /// inside a bounded frame fits whichever constraint binds first. That matters because
    /// the image is chosen by device idiom while the caps are chosen by size class, and
    /// an iPad in a narrow window reads as compact while still getting the landscape
    /// capture.
    var maxImageHeight: CGFloat = .infinity

    var body: some View {
        // A numbered list above the screenshot, not a title. There used to be nothing
        // here, on the reasoning that the caption below already said what the picture was
        // and labelling it from both sides framed it twice. That held while the pane asked
        // for one thing. It asks for two now — the extension toggle and website access —
        // and "recognise this screen" is no longer sufficient instruction for a screen
        // with two switches on it that both have to be set.
        //
        // Ordered rather than prose because the two are not interchangeable and one of
        // them is below the fold on the real pane: someone who reads a sentence, flips the
        // first switch and leaves has an extension that is on and touching nothing. A list
        // with a count is also the only form that tells the user when they are finished,
        // which is the actual failure mode here — not doing the wrong thing, but stopping
        // early and believing they're done.
        VStack(spacing: 12) {
            settingsChecklist
            // Resolves per device from the image set: the iPhone capture on iPhone, the
            // iPad one on iPad. Handled by the asset catalog's `iphone`/`ipad` idioms
            // rather than by branching here, so there is nothing in code that can pick a
            // different device's screenshot than the catalog does.
            // No border or clip shape here, and they can't simply be added back.
            //
            // `.aspectRatio(.fit)` inside `.frame(maxWidth:maxHeight:)` gives a frame that
            // accepts the full width it is offered while the capture letterboxes inside
            // it, so the frame is materially wider than the picture whenever height is the
            // binding cap — which is the normal case for the portrait iPhone shot. Shape
            // modifiers attach to that frame, not to the image, so a `strokeBorder`
            // overlay drew a rounded rectangle floating in the empty space either side of
            // the screenshot, and the `clipShape` it was paired with rounded corners that
            // nothing ever reached.
            //
            // The shadow is kept and is not the same problem: it renders from the content's
            // alpha rather than from the frame, so it hugs the capture's real edges. That's
            // also what now separates the screenshot from the material card behind it.
            //
            // If a border is ever wanted, it has to go on a wrapper sized to the image —
            // measuring the fitted rect — rather than on this frame.
            Image("SafariExtensionEnabled")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(maxWidth: maxImageWidth, maxHeight: maxImageHeight)
                .shadow(color: .black.opacity(0.18), radius: 6, y: 2)
                // Short now, and deliberately so. This label used to carry the
                // instructions, because the switches were the only place the information
                // existed and a VoiceOver user got none of it from the surrounding copy.
                // The checklist above is that copy — real text, in order, naming the same
                // switches — so describing the picture in detail as well would say
                // everything twice, and say it worse the second time.
                //
                // Still not hidden: a picture that a sighted reader is being asked to
                // recognise should at least be announced as existing, or its absence reads
                // as a rendering failure.
                //
                // Kept to what both captures have in common, because they are not the same
                // screen: Safari only splits enablement per profile once profiles exist,
                // so the iPad shot has a switch per profile where the iPhone one has a
                // single "Allow Extension". Naming either set here would describe a screen
                // half the readers aren't looking at.
                .accessibilityLabel("A screenshot of Safari's GeoSpoof extension settings, showing the switches listed above.")

            VStack(spacing: 3) {
                Text("Not where you landed? In Settings, go to:")
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)

                // The path Apple's own Settings uses. Localizable rather than hard-coded
                // English, because every term in it is a system UI label that iOS itself
                // translates — a user reading Settings in French needs the French names,
                // not ours.
                Text("Settings › Apps › Safari › Extensions › GeoSpoof")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.primary)
                    .multilineTextAlignment(.center)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .accessibilityElement(children: .combine)
        }
        // The card spans the page even though the screenshot inside it doesn't. Without
        // this the card shrinks to the capped image and sits narrow and left-aligned
        // beside the full-width `PermissionPromptsView` card below it, which reads as a
        // layout bug rather than as a choice.
        .frame(maxWidth: .infinity)
        .padding()
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
    }

    /// The two switches the pane wants set, in the order they appear on it, plus the
    /// return trip.
    ///
    /// Both are named with Safari's own labels rather than described as concepts — "Allow
    /// Extension", not "enable the extension"; "All Websites", not "grant host
    /// permissions". Those are the only words that are still on screen once the user has
    /// left this view for Settings, which is where they'll be trying to follow this.
    ///
    /// "All Websites" is the row's label only because the manifest declares no service
    /// origins. It used to be the last of ten rows, titled "Other Websites" beneath nine
    /// named domains, and it would go back to that if those declarations returned — so
    /// this string and the origin list in `src/build/manifest.ts` are coupled, and the
    /// comment there says the same thing from the other side.
    ///
    /// Step 3 is not busywork. Nothing needs tapping on return — the OS reports the toggle
    /// and the flow advances itself — but a user who doesn't know that can't tell "wait
    /// here" from "you're done", and the step they left is still sitting behind Settings
    /// looking unfinished. It also covers the case where the automatic advance doesn't
    /// fire, which is the situation where explicit instructions matter most.
    private var settingsChecklist: some View {
        VStack(alignment: .leading, spacing: 10) {
            checklistRow(1, "Turn on Allow Extension")
            checklistRow(2, "Set All Websites to Allow")
            checklistRow(3, "Come back to GeoSpoof")
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private func checklistRow(_ number: Int, _ text: LocalizedStringKey) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            StepBadge(number: number)
                // Aligns the badge to the first line's baseline rather than centring it on
                // the whole row, which is what keeps a wrapped two-line step from pushing
                // its number into the gap between the lines. A `Circle` has no baseline of
                // its own, so one is supplied from its bottom edge.
                .alignmentGuide(.firstTextBaseline) { $0[.bottom] - 3 }

            Text(text)
                .font(.subheadline)
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        // Spoken as "Step 1. Turn on Allow Extension". `StepBadge` is decorative by
        // design, so the ordinal has to be reintroduced here or a VoiceOver user gets
        // three unordered instructions — and the order is half of what the list is for.
        .accessibilityElement(children: .combine)
        .accessibilityLabel(Text("Step \(number)") + Text(verbatim: ". ") + Text(text))
    }
}

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
