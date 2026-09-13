//
//  SceneDelegate.swift
//  iOS (App)
//
//  Created by Anthony on 5/1/26.
//

import Combine
// For a stable content hash of an imported GPX file — see `GpsGpxImporter.contentID`.
import CryptoKit
import SwiftUI
// `UTType`, for the GPX file importer's content types.
import UniformTypeIdentifiers
import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }

        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = UIHostingController(rootView: RootView())
        self.window = window
        window.makeKeyAndVisible()

        // Cold launch via a widget or hosted-onboarding deep link.
        handleDeepLinks(connectionOptions.urlContexts)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Warm open via a widget or hosted-onboarding deep link.
        handleDeepLinks(URLContexts)
    }

    /// Route app-owned URL schemes in one place. SceneDelegate handles both
    /// cold and warm opens reliably, including widget links where SwiftUI's
    /// `.onOpenURL` has been inconsistent.
    private func handleDeepLinks(_ contexts: Set<UIOpenURLContext>) {
        // A GPX file opened from AirDrop, Mail, Files or a share sheet arrives as a `file:` URL
        // through the same door as our own scheme, so it is claimed here before the scheme checks
        // below — which would otherwise ignore it.
        if let gpx = contexts.first(where: { $0.url.isFileURL && $0.url.isGpx }) {
            GpsPendingRouteImport.offer(gpx.url, options: gpx.options)
            Task { @MainActor in
                // Put the user where the file can be imported and its outcome shown. On a cold
                // launch this is Home, and the GPS tab is the only screen that claims a pending
                // import — so without this the file is claimed by nobody and opening it appears to
                // do nothing.
                AppRouter.shared.selectedTab = .gps
            }
        }

        let wantsPaywall = contexts.contains { ctx in
            ctx.url.scheme == "geospoof" && ctx.url.host == "paywall"
        }

        let wantsSafariCompletion = contexts.contains { ctx in
            ctx.url.scheme == "geospoof" &&
                ctx.url.host == "onboarding" &&
                ctx.url.path == "/safari-complete"
        }

        guard wantsPaywall || wantsSafariCompletion else { return }

        Task { @MainActor in
            let router = AppRouter.shared

            if wantsPaywall {
                router.showPaywall = true
            }

            if wantsSafariCompletion {
                // A regular user who has already finished onboarding should
                // simply return to the app. Preserve the route while the debug
                // onboarding preview is active so the full flow remains
                // testable without clearing app data.
                let onboardingCompleted = UserDefaults.standard.bool(
                    forKey: "spoofOnboardingCompleted"
                )
                if !onboardingCompleted || router.showOnboarding {
                    router.requestSafariOnboardingCompletion()
                }
            }
        }
    }

}

// MARK: - SwiftUI

struct RootView: View {
    @StateObject private var controller = SpoofController()
    @ObservedObject private var router = AppRouter.shared
    @AppStorage("appearanceMode") private var appearance: AppearanceMode = .system
    @AppStorage("spoofOnboardingCompleted") private var onboardingCompleted = false
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    /// Whether setup owns the screen. Named so the branch below and the animation
    /// keyed to it read the same expression and can't drift apart.
    private var showingOnboarding: Bool {
        !onboardingCompleted || router.showOnboarding
    }

    var body: some View {
        Group {
            if showingOnboarding {
                OnboardingView(controller: controller) {
                    onboardingCompleted = true
                    router.showOnboarding = false
                }
                .transition(onboardingTransition)
            } else {
                mainTabs
                    .transition(.opacity)
            }
        }
        // Keyed to the value rather than wrapping the mutation in `withAnimation`,
        // because this swap has three triggers — the close screen's button, the
        // skip path, and the debug replay in Settings — and a value-keyed animation
        // covers all of them without each having to remember.
        .animation(.easeInOut(duration: 0.35), value: showingOnboarding)
        .onAppear {
            applyInterfaceStyle(appearance)
            // A locked control (which can't open the app itself) may have left a
            // paywall request; surface it now.
            if WidgetPaywallRequest.consume() { router.showPaywall = true }
            installMotionPositionProvider()
        }
        .onChange(of: appearance) { _, newValue in applyInterfaceStyle(newValue) }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            if WidgetPaywallRequest.consume() { router.showPaywall = true }
        }
        .sheet(isPresented: $router.showPaywall) {
            ProPaywallView()
        }
        #if DEBUG
        // TEMPORARY layout harness — removed before this change is finished.
        .sheet(isPresented: .constant(ProcessInfo.processInfo.arguments.contains("-showDeviceGpsSheet"))) {
            DeviceGpsSheet {}
        }
        #endif
    }

    /// Teach the controller how to find out where the device actually is.
    ///
    /// Installed here, at the root, rather than from `GpsView`: the browser must keep up with a
    /// route regardless of which tab is on screen, and a provider owned by one tab's lifecycle
    /// would stop feeding the moment the user swiped to Home.
    ///
    /// The split exists because reading the roster and applying the echo rules is iOS-only code,
    /// while the controller is shared with the widget and macOS targets. Rather than move the
    /// report types into shared code so they could be re-read there, the controller asks for a
    /// summary and decides what to do with it.
    private func installMotionPositionProvider() {
        controller.motionPositionProvider = { [controller] in
            let store = GpsStatusStore()
            await store.reload(selectedId: controller.selectedControllerId)
            guard let status = store.status, !store.isStale else {
                // The roster was read and had nothing fresh to say. That still releases the
                // write gate — a user whose computer is off must not be stuck behind it — but it
                // yields no position, and the caller must then leave the last one alone.
                return GpsMotionSample(latitude: nil, longitude: nil, rosterWasRead: true)
            }
            let gate = GpsEchoGate(status: status, asked: controller.motionState)
            let resolved = gate.resolvedPosition(
                route: controller.loadGpsRoute(),
                chosen: controller.location
            )
            return GpsMotionSample(
                latitude: resolved?.latitude,
                longitude: resolved?.longitude,
                rosterWasRead: true
            )
        }
        controller.startMotionSync()
    }

    /// How setup leaves: a cross-dissolve, with the outgoing screen easing very
    /// slightly toward the viewer as it goes.
    ///
    /// A dissolve rather than a slide. A slide claims the two screens are siblings
    /// you moved between, and offers a direction to come back from — neither is
    /// true here: onboarding is a one-way launch state that ceases to exist, and on
    /// iOS it isn't a modal being dismissed (see `mainTabs` on why the tabs aren't
    /// built underneath it), so there is no edge for it to go back to. The 1.03
    /// scale is the whole gesture: enough to read as the screen lifting off rather
    /// than blinking out, small enough that nothing looks like it zoomed.
    ///
    /// The tabs only fade — no counter-scale. Transforming a `TabView` mid-insertion
    /// also transforms the tab bar, and scaling OS 26's glass bar for a third of a
    /// second draws the eye to exactly the wrong element.
    private var onboardingTransition: AnyTransition {
        // Reduce Motion drops the scale, not the transition. A cross-fade is the
        // sanctioned substitute for motion; removing the whole thing would just
        // restore the hard cut this exists to fix.
        guard !reduceMotion else { return .opacity }
        return .asymmetric(
            // Insertion is the debug replay re-entering setup, so it stays a plain
            // fade — a screen arriving shouldn't mirror the "lifting away" read.
            insertion: .opacity,
            removal: .opacity.combined(with: .scale(scale: 1.03))
        )
    }

    /// The normal application surface is built only after onboarding. Keeping
    /// it out of the first frame prevents a Home-screen flash and makes the
    /// welcome a true launch state rather than a modal placed over the app.
    ///
    /// It now fades in rather than appearing instantly, so the first build of the
    /// tabs lands under a dissolve instead of a cut — which also hides any layout
    /// settling on that first frame rather than showing it.
    /// Bound to `AppRouter.selectedTab` so an incoming file can put the user on the tab that
    /// handles it — see `AppRouter.RootTab`. Tags are named rather than positional, so reordering
    /// the tabs can't silently retarget anything that selects one.
    private var mainTabs: some View {
        TabView(selection: $router.selectedTab) {
            HomeView(controller: controller)
                .tabItem {
                    Label("Home", systemImage: "house")
                }
                .tag(AppRouter.RootTab.home)

            BrowserSettingsView(controller: controller)
                .tabItem {
                    Label("Browser", systemImage: "globe")
                }
                .tag(AppRouter.RootTab.browser)

            // GPS sits in the center (5 tabs: Home · Browser · GPS · Details · Settings) and
            // reuses Home's old location glyph.
            GpsView(controller: controller)
                .tabItem {
                    Label("GPS", systemImage: "location.circle")
                }
                .tag(AppRouter.RootTab.gps)

            DetailsTab(controller: controller)
                .tabItem {
                    Label("Details", systemImage: "list.bullet.rectangle")
                }
                .tag(AppRouter.RootTab.details)

            SettingsView(controller: controller)
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
                .tag(AppRouter.RootTab.settings)
        }
    }
}

/// Drives the app's appearance at the window level. `.unspecified` cleanly
/// reverts to following the system — unlike `preferredColorScheme(nil)`, which
/// can leave content stuck on the previously forced scheme.
@MainActor
private func applyInterfaceStyle(_ mode: AppearanceMode) {
    let style: UIUserInterfaceStyle
    switch mode {
    case .system: style = .unspecified
    case .light: style = .light
    case .dark: style = .dark
    }

    for scene in UIApplication.shared.connectedScenes {
        guard let windowScene = scene as? UIWindowScene else { continue }
        for window in windowScene.windows {
            window.overrideUserInterfaceStyle = style
        }
    }
}

enum AppearanceMode: String, CaseIterable, Identifiable {
    case system
    case light
    case dark

    var id: String { rawValue }

    var displayName: LocalizedStringKey {
        switch self {
        case .system: return "System"
        case .light: return "Light"
        case .dark: return "Dark"
        }
    }

    /// `nil` follows the system setting; otherwise forces the scheme.
    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .light: return .light
        case .dark: return .dark
        }
    }
}

// MARK: - Home (native control panel — parity with the extension popup)

struct HomeView: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var review = ReviewPrompt.shared

    var body: some View {
        AdaptiveNavigationStack {
            SpoofControlPanel(controller: controller)
                .navigationTitle("GeoSpoof")
        }
        // Outside the navigation stack on purpose — the review action can
        // silently no-op when fired from a view nested inside one.
        .requestReview(on: review.token)
    }
}

// MARK: - GPS (device / system GPS spoofing via the GeoSpoof GPS desktop agent)

/// Redacted device summary from the agent's status report.
nonisolated struct GpsDeviceSummary: Codable, Equatable {
    var name: String
    var productType: String
    var iosVersion: String
    enum CodingKeys: String, CodingKey {
        case name
        case productType = "product_type"
        case iosVersion = "ios_version"
    }
}

// `GpsMotionMode` lives in `Shared (App)/SpoofModel.swift`: the writer needs it too, and that
// file compiles into the widget and macOS targets where this one does not.

/// How the agent is reaching the device. Display metadata only — it never changes how a
/// location is applied.
nonisolated enum GpsTransport: String, Codable, Equatable {
    case usb
    case wireless
    case unknown

    init(reported: String) {
        self = GpsTransport(rawValue: reported) ?? .unknown
    }
}

/// Route playback progress from the agent's report. Present only while a route really is
/// playing — absence is meaningful and is the normal state, not an error.
///
/// **Naming trap.** The app writes `route_started_at` at the *top level* of `desired.json`
/// and reads it back as `started_at` *nested inside* `route`. Easy to get backwards; the
/// contract calls this out explicitly.
nonisolated struct GpsRouteStatus: Codable, Equatable {
    /// Which route is playing, echoing the `route_id` we asked for.
    var id: String?
    /// **Which run** is playing, echoing the `route_started_at` we sent.
    ///
    /// A replay reuses the same `id` with a new marker, so the id alone cannot separate the
    /// new run from the one it replaced. A report written a beat before the agent noticed a
    /// replay would otherwise have us render the old run's progress as the new one's: 80%,
    /// then a snap to 0%. See `GpsEchoGate`.
    var startedAt: Double?
    /// Display only. Never load-bearing.
    var name: String?
    var travelledM: Double?
    /// One lap's length. Under `repeat` this does NOT grow — `travelledM` resets each lap.
    var totalM: Double?
    /// Seconds left, computed by the side that knows the pace.
    ///
    /// This is the number to show. It cannot be derived here: for an `as-recorded` route the
    /// pace varies along the track, so it is not `(total - travelled) / speed`, and
    /// `speedDefaulted` says a fallback happened without saying what pace is in force.
    /// Absent for a repeating route, which never arrives; `0` once finished.
    var remainingSecs: Double?
    var paused: Bool?
    /// The route ended and the device is holding the final point. Deliberately not cleared:
    /// reverting the moment a journey completed would undo the feature. Say "finished", not
    /// "stopped".
    var finished: Bool?
    /// The requested pace could not be honoured and a fallback is in force. Must be surfaced —
    /// silently giving someone walking pace for a cycling route has misled them.
    var speedDefaulted: Bool?

    enum CodingKeys: String, CodingKey {
        case id, name, paused, finished
        case startedAt = "started_at"
        case travelledM = "travelled_m"
        case totalM = "total_m"
        case remainingSecs = "remaining_secs"
        case speedDefaulted = "speed_defaulted"
    }
}

/// Live steering feedback from the agent's report — the one place a status report tells us a
/// coordinate.
///
/// Everywhere else the app already knows the coordinate because it chose it. With the agent
/// integrating a vector, the agent knows something we cannot derive, including any stretch it
/// was unable to drive. An app returning from suspension trusts this over its own dead
/// reckoning.
nonisolated struct GpsSteeringStatus: Codable, Equatable {
    /// The gesture the agent is acting on, echoing the `seq` we wrote.
    ///
    /// The field that makes the rest trustworthy: heading and speed can coincidentally match
    /// the previous vector, so without this we cannot tell a report that reflects our latest
    /// write from one written just before it. See `GpsEchoGate`.
    var seq: Double?
    var headingDeg: Double?
    /// The pace actually in force, which may be a clamp of what we asked for. Use this for
    /// display rather than echoing our own value back at the user.
    var speedMps: Double?
    /// The agent's integrated position — authoritative during steering.
    var latitude: Double?
    var longitude: Double?
    var travelledM: Double?
    /// The TTL actually in force, so a `9999` we sent shows up clamped.
    var ttlSecs: Double?
    /// Remaining seconds measured by the side that owns the deadline — immune to both clock
    /// skew and clamping, and reads `0` once expired rather than underflowing. Never build a
    /// countdown from the TTL we sent.
    var expiresInSecs: Double?
    /// Speed is zero: the vector is live and the position is held.
    var held: Bool?
    /// The deadline passed with no interaction. The device is being held, and that is a
    /// different message from the user stopping.
    var expired: Bool?
    /// Why a vector was refused. Every refusal case (NaN, infinite, negative speed) indicates
    /// a defect in *this app* rather than a user action, so this is a bug canary for the debug
    /// surface — not customer-facing copy to translate.
    var rejected: String?

    enum CodingKeys: String, CodingKey {
        case seq, latitude, longitude, held, expired, rejected
        case headingDeg = "heading_deg"
        case speedMps = "speed_mps"
        case travelledM = "travelled_m"
        case ttlSecs = "ttl_secs"
        case expiresInSecs = "expires_in_secs"
    }
}

/// The per-computer status the GeoSpoof GPS desktop agent writes back into this app's Documents,
/// as `controllers/<id>.json` over AFC — one self-file per computer (controller-arbitration),
/// not a single `status.json`. Mirrors the agent's `StatusReport`; the flat
/// `ControllerReport` wraps it with the writing computer's identity (see `GpsController`).
///
/// Every field the agent may omit is decoded as an `Optional`, because the contract's rule
/// runs both ways: a newer writer must never break an older reader, and an older *agent*
/// must never break this app. Unknown keys are ignored for free by `Codable`.
nonisolated struct GpsStatus: Codable, Equatable {
    var version: Int
    var agentVersion: String
    var connected: Bool
    var device: GpsDeviceSummary?
    var session: String     // "idle" | "spoofing" | "lost"
    var provenance: String  // "vpn-sync" | "manual" | "from-app" | "unknown"
    var remediation: String
    var error: String?
    var pro: Bool
    /// Unix seconds the agent produced this report. Used to detect a stale report (the
    /// agent can't publish once it loses the device), so we never show a false "spoofing".
    var updatedAt: Double?
    /// The mode the agent **delivered**, deliberately allowed to differ from what we asked for.
    ///
    /// Kept as the raw `String?` rather than the enum so that *absent* and *unrecognised* stay
    /// distinguishable, because Requirement 7 treats them differently and the difference is not
    /// academic. Read it through `deliveredMotion`, never directly.
    var motionRaw: String?
    /// USB vs wireless, for display. Absent on an older agent.
    var transportRaw: String?
    /// This computer's wireless credential no longer verifies and must be re-minted over a
    /// cable. A machine-readable companion to `remediation`, because this is the one
    /// unreachable state with a specific one-step fix and it deserves a different affordance
    /// from the generic "we can't find your iPhone".
    var pairingRepairNeeded: Bool?
    /// Route progress. Absent unless a route is playing.
    var route: GpsRouteStatus?
    /// Steering feedback. Absent unless a vector is running.
    var steering: GpsSteeringStatus?

    enum CodingKeys: String, CodingKey {
        case version
        case agentVersion = "agent_version"
        case connected, device, session, provenance, remediation, error, pro
        case updatedAt = "updated_at"
        case motionRaw = "motion"
        case transportRaw = "transport"
        case pairingRepairNeeded = "pairing_repair_needed"
        case route, steering
    }

    /// Whether this computer is actively driving a location right now.
    var isSpoofing: Bool { session == "spoofing" }

    /// The mode the agent is delivering, or `nil` when the question doesn't apply.
    ///
    /// **`nil` is not "no mode" — it is "the question is meaningless".** `motion` is populated
    /// only while spoofing, so an absent value on an idle, disconnected, non-owning, or
    /// simply older computer means nothing is driving a location there. Telling a user
    /// "this computer can't steer" when spoofing is switched off would be wrong, and it is a
    /// mistake that has already been made once in a throwaway check script against an
    /// unreachable iPad.
    ///
    /// So this returns `nil` unless `session` is `spoofing`, and callers that want to report a
    /// missing capability must go through `delivers(_:)`.
    var deliveredMotion: GpsMotionMode? {
        guard isSpoofing else { return nil }
        guard let motionRaw else { return nil }
        return GpsMotionMode(reported: motionRaw)
    }

    var transport: GpsTransport {
        GpsTransport(reported: transportRaw ?? "")
    }

    /// Whether this computer is delivering `mode`.
    ///
    /// The contract's single rule for every mode, including ones added after an agent shipped:
    /// *if you asked for something and the report doesn't echo it, that computer isn't doing
    /// it.* False for an agent that declined, and equally false for one that predates the
    /// field — we don't need to know which to be honest with the user, and `agentVersion` is
    /// here if a message wants to name a version.
    ///
    /// Only meaningful while spoofing; see `deliveredMotion`.
    func delivers(_ mode: GpsMotionMode) -> Bool {
        deliveredMotion == mode
    }
}

/// Decides which fields of a report may be believed, given what we last asked for.
///
/// ## Why a gate is needed at all
///
/// The agent reads `desired.json` about once a second, so for a moment after every write the
/// freshest report still describes the **previous** intent. Rendering it produces specific,
/// visible lies:
///
///   * **Steering.** `expires_in_secs` is pre-extension, so a countdown built from it runs out
///     early and says "expired" while the device is still moving. Heading and speed can
///     coincidentally match the previous vector, so they cannot be used to detect this —
///     `seq` can, which is why the agent echoes it.
///   * **Routes.** A replay reuses the same `id` with a new `started_at`, so a report written a
///     beat too early reports the *old* run's progress. The bar shows 80%, then snaps to 0%.
///
/// ## What is deliberately NOT gated
///
/// **Position.** `steering.latitude`/`longitude` is the agent's integrated position, and it is
/// the best answer available whichever vector produced it. Withholding it until the echo matched
/// would stall the map for a round trip and buy nothing. Only quantities that describe *our
/// request* — timing, pace, progress — need the echo.
///
/// That split is what keeps the gate cheap enough to always apply.
nonisolated struct GpsEchoGate {
    let status: GpsStatus
    /// What we last asked for. The comparison basis for every echo below.
    let asked: GpsMotionState

    /// Whether the report's steering timing and pace fields describe our latest gesture.
    var steeringEchoMatches: Bool {
        guard let sent = asked.steering?.seq, let echoed = status.steering?.seq else { return false }
        return sent == echoed
    }

    /// Whether the report's route progress describes the run we last started.
    var routeEchoMatches: Bool {
        guard let sent = asked.routeStartedAt, let echoed = status.route?.startedAt else {
            return false
        }
        return sent == echoed
    }

    /// The pace actually in force, or `nil` until confirmed.
    ///
    /// Read from the report rather than echoing back what we sent, because the agent clamps —
    /// so a picker offering a speed above the cap stays honest instead of displaying a number
    /// that isn't happening.
    var confirmedSpeedMps: Double? {
        steeringEchoMatches ? status.steering?.speedMps : nil
    }

    /// When the current steering vector lapses, or `nil` until confirmed.
    ///
    /// **The single place `expires_in_secs` becomes an absolute date**, so the in-app UI and a
    /// Live Activity cannot disagree about a deadline. Built from the agent's remaining-seconds
    /// rather than the TTL we sent, which would be wrong by the clock skew between the two
    /// machines plus any clamping the agent applied.
    ///
    /// `nil` while the echo is unmatched is the signal to keep showing the last known deadline
    /// rather than a fresh wrong one.
    func steeringDeadline(now: Date = Date()) -> Date? {
        guard steeringEchoMatches, let remaining = status.steering?.expiresInSecs else {
            return nil
        }
        return now.addingTimeInterval(max(0, remaining))
    }

    /// Route progress, or `nil` until the run marker is confirmed.
    ///
    /// `remainingSecs` is passed through rather than derived: for an `as-recorded` route the pace
    /// varies along the track, so it is not `(total - travelled) / speed`, and only the agent
    /// knows what pace is actually in force.
    var confirmedRouteProgress: (travelledM: Double, totalM: Double, remainingSecs: Double?)? {
        guard routeEchoMatches,
              let route = status.route,
              let travelled = route.travelledM,
              let total = route.totalM else { return nil }
        return (travelled, total, route.remainingSecs)
    }

    /// How long a request is given to reach a computer before its silence means anything.
    ///
    /// Bracketed by the agent's own documented cadence rather than picked: its worst-case publish
    /// interval is `POLL_INTERVAL` (1 s) plus `PASS_HARVEST_BUDGET` (5 s), so a request can legitimately
    /// go unacknowledged for ~6 s. It must also stay **below** the 20 s freshness window, or a report
    /// would go stale before we were ever willing to judge it. 10 s sits inside that bracket.
    static let deliveryGrace: TimeInterval = 10

    /// Seconds since we last changed what we asked for, or `nil` when we asked for nothing.
    ///
    /// Measured on **our own clock** on both ends — `routeStartedAt` and `seq` are both stamped here —
    /// so this deliberately avoids comparing against the report's `updatedAt`, which comes from the
    /// computer's clock. A skewed clock there would either suppress the message forever or fire it
    /// immediately, and neither failure would be visible.
    func requestAge(now: Date = Date()) -> TimeInterval? {
        let askedAt: Double?
        switch asked.mode {
        case .route: askedAt = asked.routeStartedAt
        // `seq` is a millisecond timestamp, by the same convention.
        case .steering: askedAt = asked.steering.map { $0.seq / 1000 }
        case .still, .unknown: askedAt = nil
        }
        return askedAt.map { now.timeIntervalSince1970 - $0 }
    }

    /// Whether a report that doesn't echo our request is simply too early to mean anything.
    ///
    /// This is what stops "this computer isn't following your route" flashing up for a second every
    /// time a route starts. The freshest report at that moment was written *before* the request
    /// existed, so it describes a computer holding a coordinate — which is true — rather than one
    /// declining a route it has not yet read.
    ///
    /// A negative age (a clock that moved backwards) also counts as too young: suppressing the
    /// message is the recoverable direction, since the next report resolves it either way.
    func requestTooYoungToJudge(now: Date = Date()) -> Bool {
        guard let age = requestAge(now: now) else { return false }
        return age < GpsEchoGate.deliveryGrace
    }

    /// The agent's integrated position while steering. Never echo-gated — see the type comment.
    var steeringPosition: (latitude: Double, longitude: Double)? {
        guard let lat = status.steering?.latitude, let lon = status.steering?.longitude else {
            return nil
        }
        return (lat, lon)
    }

    /// Where the device is, per the mode the agent says it is delivering.
    ///
    /// This is what keeps browser geolocation in agreement with device GPS during motion, which
    /// is the product's whole consistency claim. Three branches:
    ///
    ///   * `steering` — the agent's integrated position, which we cannot derive
    ///   * `route` — our own polyline walked to the agent's `travelled_m`, which agrees by
    ///     construction because `travelled_m` is the shared quantity
    ///   * `still` — the coordinate we chose, which we already know
    ///
    /// `route` is passed in rather than re-read here so this stays pure and testable. Returns
    /// `nil` when there is nothing trustworthy to report, and the caller must then leave the
    /// last position alone rather than guessing — a guess here is how a stale seed gets written
    /// back and drags the device.
    func resolvedPosition(
        route: GpsRoute?,
        chosen: SpoofLocation?
    ) -> (latitude: Double, longitude: Double)? {
        switch status.deliveredMotion {
        case .steering:
            return steeringPosition
        case .route:
            guard let route,
                  let progress = confirmedRouteProgress,
                  let point = route.position(atTravelled: progress.travelledM) else { return nil }
            return (point.lat, point.lon)
        case .still:
            guard let chosen else { return nil }
            return (chosen.latitude, chosen.longitude)
        case .unknown, nil:
            // Either a mode this build can't name, or a computer that isn't spoofing at all.
            // Neither is a position we can claim.
            return nil
        }
    }
}

/// One controller (computer) entry from the agent roster under
/// `Documents/controllers/<id>.json` (controller-arbitration). Mirrors the agent's
/// `ControllerReport`: identity (`id`, `name`) plus a flattened `StatusReport` — the same
/// flat JSON decodes into both the identity fields here and a `GpsStatus`.
nonisolated struct GpsController: Identifiable, Equatable {
    let id: String
    let name: String
    let status: GpsStatus

    /// Fresh if the agent's own timestamp is within the staleness window (matches the
    /// agent's `CONTROLLER_FRESH_SECS`). A missing timestamp counts as stale.
    var isFresh: Bool {
        guard let updatedAt = status.updatedAt else { return false }
        return Date().timeIntervalSince1970 - updatedAt <= GpsStatusStore.freshWindow
    }

    /// Decode one `controllers/<id>.json` payload. `nil` if identity or status won't parse.
    init?(data: Data) {
        struct Ident: Decodable { let id: String; let name: String }
        guard let ident = try? JSONDecoder().decode(Ident.self, from: data),
              let status = try? JSONDecoder().decode(GpsStatus.self, from: data) else {
            return nil
        }
        self.id = ident.id
        self.name = ident.name
        self.status = status
    }
}

/// Reads the agent roster from this app's `Documents/controllers/` (each computer writes one
/// `<id>.json` self-file over AFC — controller-arbitration). Exposes the fresh roster plus
/// a single display `status`: the user-selected controller's, or the sole controller's when
/// only one is present. If it goes stale/empty the desktop agent isn't running, so the
/// feature reads as "waiting for your computer".
@MainActor
final class GpsStatusStore: ObservableObject {
    /// The display status: the selected (owner) controller's, or the sole controller's.
    @Published private(set) var status: GpsStatus?
    /// The fresh roster of computers currently able to drive this phone.
    @Published private(set) var controllers: [GpsController] = []
    /// True when there's no fresh display status (no owner/sole controller present).
    @Published private(set) var isStale = true

    /// The agent refreshes each self-file well within this window; older ⇒ that computer is gone.
    nonisolated static let freshWindow: TimeInterval = 20

    /// Reload the roster and resolve the display status for `selectedId` (the user's chosen
    /// controlling computer, or nil for auto/sole).
    ///
    /// The disk enumeration + JSON decode in `readRoster` can block for a noticeable time
    /// (many files, slow/contended storage, iCloud-backed container), so it runs off the
    /// main thread; only the published-state update touches the main actor. Callers `await`.
    func reload(selectedId: String?) async {
        let roster = await Task.detached(priority: .utility) {
            Self.readRoster()
        }.value
        apply(roster: roster, selectedId: selectedId)
    }

    /// Resolve the display status for a freshly-read roster + current selection and publish
    /// it. Runs on the main actor (the class is `@MainActor`).
    private func apply(roster: [GpsController], selectedId: String?) {
        controllers = roster
        // Display status: the explicitly-selected controller if it's present; else, when
        // exactly one controller is present, that sole one; else none (ambiguous — the UI
        // asks the user to choose).
        let owner: GpsController?
        if let selectedId, let picked = roster.first(where: { $0.id == selectedId }) {
            owner = picked
        } else if roster.count == 1 {
            owner = roster.first
        } else {
            owner = nil
        }
        status = owner?.status
        isStale = owner == nil
    }

    /// Read + freshness-filter every `controllers/<id>.json`. Empty if the directory is
    /// absent (no computer has announced yet). The `.json` filter also skips the agent's
    /// hidden `.<id>.json.tmp` atomic-write scratch files.
    ///
    /// `nonisolated` so `reload` can run it off the main actor (via `Task.detached`); it
    /// touches no instance state, and the `[GpsController]` it returns is `Sendable`.
    nonisolated private static func readRoster() -> [GpsController] {
        guard let docs = FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask).first else {
            return []
        }
        let dir = docs.appendingPathComponent("controllers")
        guard let urls = try? FileManager.default.contentsOfDirectory(
            at: dir, includingPropertiesForKeys: nil
        ) else {
            return []
        }
        return urls
            .filter { $0.pathExtension == "json" }
            .compactMap { try? Data(contentsOf: $0) }
            .compactMap { GpsController(data: $0) }
            .filter { $0.isFresh }
            .sorted { $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending }
    }
}

/// Coarse UI phase derived from Pro state + the agent status.
/// Route progress, already through the echo gate.
///
/// Only constructible from a confirmed report, which is the point: there is no way to build one
/// of these from a report describing a previous run, so the 80%-then-snap-to-0% glitch is
/// unreachable rather than merely avoided.
private struct GpsRouteProgress: Equatable {
    var name: String?
    var travelledM: Double
    var totalM: Double
    /// `nil` for a repeating route, which has no end and therefore no time remaining. The view
    /// reads that as "show a per-lap layout", not as "a number failed to arrive".
    var remainingSecs: Double?
    var paused: Bool
    var finished: Bool
    /// The requested pace wasn't honoured. Must be surfaced — someone who picked a cycling route
    /// and silently got walking pace has been misled, and it taints every other figure shown.
    var speedDefaulted: Bool
    /// Whether the route loops, taken from what **we** asked for rather than inferred from the
    /// report. See the footer in `routeSection` for the false statement this avoids.
    var repeats: Bool

    var fraction: Double {
        guard totalM > 0 else { return 0 }
        return min(1, max(0, travelledM / totalM))
    }
}

/// Live steering detail, already through the echo gate.
private struct GpsSteeringDetail: Equatable {
    var headingDeg: Double?
    /// The pace **in force**, read from the report rather than echoed back from what we sent, so
    /// an agent-side clamp is visible instead of us displaying a speed that isn't happening.
    var speedMps: Double?
    var travelledM: Double?
    /// When the vector lapses. `nil` while unconfirmed — the view must then keep showing its last
    /// known deadline rather than a fresh wrong one.
    var deadline: Date?
    var held: Bool
    var expired: Bool
}

/// What the owning computer is actually driving.
///
/// A payload on `GpsPhase.spoofing` rather than a set of flags read independently. That is
/// deliberate: `spoofing` is only reachable once the report is fresh and its session really is
/// `spoofing`, so nothing downstream can render motion detail derived from a report that has gone
/// stale or from a computer that isn't driving anything.
private enum GpsMotionDetail: Equatable {
    /// Holding one coordinate. Not the same as doing nothing.
    case still
    case route(GpsRouteProgress)
    case steering(GpsSteeringDetail)
    /// We asked for a mode and this computer is not delivering it.
    ///
    /// True both for an agent that declined and for one that predates the mode entirely, and we
    /// deliberately don't distinguish them: the report cannot tell us which, and the sentence a
    /// user needs is the same either way.
    case notDelivered(asked: GpsMotionMode)
}

private enum GpsPhase: Equatable {
    case notPro
    case waitingForComputer
    /// Two or more computers can drive this phone and none is chosen (or the chosen one
    /// left): the user must pick which computer controls it (controller-arbitration).
    case chooseController
    /// The **agent** refused our entitlement, which is a different problem from a broken
    /// connection and needs a different sentence.
    ///
    /// Reachable while this app believes itself Pro: the agent verifies the signed StoreKit
    /// material independently and offline, so a local debug override or an unverifiable founder
    /// grant lands here. Folding it into `setupNeeded` sent people to check cables over a
    /// purchase problem.
    case entitlementRejected
    case setupNeeded(String)
    case ready
    case spoofing(GpsMotionDetail)
    case lost
}

extension URL {
    /// Whether this looks like a GPX file.
    ///
    /// Matched on the extension rather than the declared content type: GPX has no
    /// system-declared UTI, and files arriving from Mail or a web download are routinely tagged
    /// generically. The parser is the real gate — it refuses anything without a track — so a
    /// permissive check here costs nothing and a strict one would drop legitimate files.
    var isGpx: Bool { pathExtension.lowercased() == "gpx" }
}

/// Holds a GPX file handed to the app from outside until something is ready to import it.
///
/// A buffer is needed because of *when* the file arrives. On a cold launch the URL is delivered in
/// `scene(_:willConnectTo:options:)` — before any SwiftUI view exists to act on it — so consuming
/// it there is impossible and dropping it means an AirDropped route silently does nothing. On a
/// warm open the view does exist, but the same path should work either way rather than having two.
///
/// So the URL is parked here and claimed by the first view that asks. Read-once, like
/// `WidgetPaywallRequest`, so a file can't be imported twice by two observers.
@MainActor
final class GpsPendingRouteImport: ObservableObject {
    static let shared = GpsPendingRouteImport()

    /// The waiting file, if any.
    @Published private(set) var url: URL?
    /// Whether the sender expects us to take ownership of the file rather than read it in place.
    ///
    /// AirDrop and Mail hand over a copy in the app's Inbox that is ours to delete; Files may open
    /// a document in place, which is not. Getting this backwards either leaves litter in the Inbox
    /// forever or deletes something out of a user's iCloud Drive.
    private(set) var openInPlace = false

    private init() {}

    static func offer(_ url: URL, options: UIScene.OpenURLOptions) {
        Task { @MainActor in
            shared.url = url
            shared.openInPlace = options.openInPlace
        }
    }

    /// Take the waiting file, if there is one. Clears it, so a second caller gets nothing.
    func claim() -> (url: URL, openInPlace: Bool)? {
        guard let url else { return nil }
        let inPlace = openInPlace
        self.url = nil
        openInPlace = false
        return (url, inPlace)
    }
}

// MARK: - GPX import

/// Why a GPX file couldn't become a route.
///
/// Every case has to produce a different sentence, which is why this isn't a `Bool`. "Too big"
/// names a number and is actionable; "no track in it" points at the wrong kind of file; a read
/// failure is nobody's fault and needs no advice.
nonisolated enum GpsGpxImportFailure: Error, Equatable {
    case unreadable
    /// Refused before parsing. Guards against a file large enough to matter before we allocate
    /// anything from it.
    case tooLarge(bytes: Int)
    /// Parsed, but there was no track, route, or waypoint list in it.
    case noTrack
    /// The root element wasn't `<gpx>`, so this isn't a GPX file at all. Carries what the root
    /// actually was, so the message can name it rather than being vaguely unhelpful.
    case notGpx(root: String?)
    /// **Refused, not truncated.** Playing the first fraction of someone's route is worse than
    /// declining it, because a truncated route looks like it worked.
    case tooManyPoints(Int)
    case invalidCoordinate

    /// Whether picking a different file could plausibly fix this.
    var isFileProblem: Bool { self != .unreadable }
}

/// Turns a GPX file into a `GpsRoute`.
///
/// Uses Foundation's `XMLParser` rather than taking a dependency: GPX is a small, stable schema
/// and we need four elements out of it.
///
/// ## What it reads, and what it deliberately ignores
///
/// Points come from `<trkpt>` (a recorded track — what Strava and Garmin export), falling back to
/// `<rtept>` (a planned route) and then `<wpt>` (bare waypoints). Elevation is dropped: the
/// contract has nowhere to put it and the agent walks a 2D path.
///
/// **Only the first `<trk>` is used**, and multiple `<trkseg>` within it are concatenated. A GPX
/// can legally hold several unrelated tracks, and joining them would splice a teleport into the
/// middle of the route — worse than quietly using one.
///
/// ## Timings
///
/// `<time>` becomes `offset_secs` relative to the first point, which is what makes
/// `as-recorded` replay possible. If *any* point lacks a time, offsets are dropped from the whole
/// route rather than partially filled: a route with holes in its timing would replay at a pace
/// that is neither the recorded one nor a chosen one, and the agent's own fallback flag can't
/// describe that.
nonisolated enum GpsGpxImporter {
    /// Refuse before allocating. Well above any real activity file — a 24-hour ride at one point
    /// per second is a couple of megabytes — and far below anything that would strain the AFC
    /// read on the far side.
    static let maxBytes = 16 * 1024 * 1024

    static func route(from data: Data, fallbackName: String?) -> Result<GpsRoute, GpsGpxImportFailure> {
        guard data.count <= maxBytes else { return .failure(.tooLarge(bytes: data.count)) }

        let delegate = Delegate()
        let parser = XMLParser(data: data)
        parser.delegate = delegate
        // A GPX with a malformed tail is still worth the points it yielded before the break, so a
        // parse error is not by itself fatal — `noTrack` below covers the case where it yielded
        // nothing usable.
        parser.parse()

        // The root must actually be `<gpx>`.
        //
        // Without this the parser matches element names wherever they appear, so an unrelated
        // document that happens to contain a `<trkpt>` — an inventory export, a config file — yields
        // a cheerful two-point route instead of an error. Found on the agent side while evaluating a
        // GPX library, and this importer had the identical hole. It only shows up when someone picks
        // the wrong file, which is exactly when a clear refusal is worth most.
        guard delegate.rootWasGpx else {
            return .failure(.notGpx(root: delegate.rootElement))
        }

        let points = delegate.bestPoints
        guard !points.isEmpty else { return .failure(.noTrack) }
        guard points.count <= GpsRoute.maxPoints else {
            return .failure(.tooManyPoints(points.count))
        }
        guard points.allSatisfy(\.isValid) else { return .failure(.invalidCoordinate) }

        let name = delegate.trackName ?? delegate.metadataName ?? fallbackName
        // A recorded track gets replayed at its own pace; anything without timings gets an
        // explicit walking default rather than `as-recorded`, so the agent never has to apply its
        // own fallback and set `speed_defaulted` for a file we could see was untimed.
        let timed = points.allSatisfy { $0.offsetSecs != nil } && points.count > 1
        // Normalised first, then identified from the normalised content. The order is the whole
        // point: the id must describe the route as it will be stored and played, so the two can
        // never disagree.
        //
        // `timed` is only a hint about which speed policy to request — `normalisedForImport` makes
        // the real decision about whether the offsets survive, and an `asRecorded` route whose
        // offsets it discards falls back to walking pace with `speed_defaulted` set.
        let normalised = GpsRoute(
            // Placeholder: replaced below by the content-derived id. Not left empty, because an
            // empty id reads as "no route" everywhere else in this file.
            id: "pending",
            name: name,
            points: points,
            speed: timed ? .asRecorded : .fixed(mps: GpsRouteSpeed.walkingMps),
            repeats: false
        ).normalisedForImport()

        var route = normalised
        // The shared, content-derived id — computed byte-for-byte identically on the agent side, so
        // the same track imported on either gets one id. Replaces an earlier SHA-256 of the raw file
        // bytes, which agreed across importers but forked on a re-export of the same activity: the
        // geometry was unchanged and only the metadata differed.
        //
        // `id` is excluded from the hash, so the placeholder above doesn't affect the result.
        route.id = normalised.derivedID
        return .success(route)
    }

    /// A short, stable identifier for a file's contents.
    ///
    /// SHA-256 truncated to 16 hex characters. Truncation is fine here: this is a cache key the
    /// user's own device generates for the user's own device, not a security boundary, and 64 bits
    /// makes an accidental collision between two routes someone actually owns implausible.
    private static func contentID(of data: Data) -> String {
        SHA256.hash(data: data).prefix(8).map { String(format: "%02x", $0) }.joined()
    }

    private final class Delegate: NSObject, XMLParserDelegate {
        private var tracks: [[GpsRoutePoint]] = []
        private var currentSegment: [GpsRoutePoint] = []
        private var routePoints: [GpsRoutePoint] = []
        private var waypoints: [GpsRoutePoint] = []

        private enum Container { case none, track, route, waypoint }
        private var container: Container = .none
        private var pendingLat: Double?
        private var pendingLon: Double?
        private var pendingTime: Date?
        private var text = ""
        private var capturingText = false
        private var inMetadata = false
        private(set) var trackName: String?
        private(set) var metadataName: String?
        /// The document's root element, whatever it was. Recorded so a refusal can name it.
        private(set) var rootElement: String?
        var rootWasGpx: Bool { rootElement == "gpx" }

        /// Points in priority order: a recorded track, else a planned route, else bare waypoints.
        var bestPoints: [GpsRoutePoint] {
            let raw: [GpsRoutePoint]
            if let first = tracks.first(where: { !$0.isEmpty }) {
                raw = first
            } else if !routePoints.isEmpty {
                raw = routePoints
            } else {
                raw = waypoints
            }
            return Self.withOffsets(raw)
        }

        /// Convert absolute times to offsets from the first point, **reporting only**.
        ///
        /// Deliberately makes no judgement about whether the result is a usable pace — it passes
        /// differences through unmodified, including negative ones, and
        /// `GpsRoute.normalisedForImport()` decides. That split mirrors the agent's, and it exists
        /// because a parser that quietly repairs its input destroys the evidence a shared rule needs.
        ///
        /// The lesson behind it: an earlier version clamped a backwards step to zero, reasoning that
        /// a negative offset is meaningless to the agent. It is — but clamping turned
        /// `topografix`'s `fells_loop.gpx` (a planned `<rte>` whose 46 `<rtept>` carry *waypoint
        /// creation dates* spanning five months, 14 of 45 going backwards) into a plausible-looking
        /// offset list. Playback then walked a 7-mile loop over a five-month timeline: about a
        /// millimetre every hundred seconds, indistinguishable from frozen.
        ///
        /// ## Milliseconds as integers, not seconds as doubles
        ///
        /// Differences are taken in **integer milliseconds** rather than by subtracting two
        /// `Double` seconds. `Date` is a `Double` counting from 2001 while the agent's counts from
        /// 1970, so the same pair of timestamps loses precision by *different* amounts on the two
        /// sides — around 5e-7 s near 2026. Rounding the result to milliseconds does not rescue
        /// that: it only shrinks the window in which the two land on opposite sides of a
        /// half-millisecond boundary. It doesn't close it.
        ///
        /// Rounding each absolute time to whole milliseconds *before* subtracting does close it.
        /// A millisecond count near 2026 is ~1.8e12, far inside the 9e15 an integer-valued `Double`
        /// represents exactly, so the subtraction is exact and both sides land on the same integer
        /// whatever their epoch.
        private static func withOffsets(_ points: [GpsRoutePoint]) -> [GpsRoutePoint] {
            let times = points.map(\.absoluteTime)
            guard let first = times.first ?? nil, times.allSatisfy({ $0 != nil }) else {
                // Nothing to report. `normalisedForImport` will drop the rest.
                return points.map { GpsRoutePoint(lat: $0.lat, lon: $0.lon, offsetSecs: nil) }
            }
            let baseMillis = (first.timeIntervalSince1970 * 1000).rounded()
            return zip(points, times).map { point, time in
                let millis = (time!.timeIntervalSince1970 * 1000).rounded()
                return GpsRoutePoint(
                    lat: point.lat,
                    lon: point.lon,
                    // Negative differences are passed through on purpose — see above.
                    offsetSecs: (millis - baseMillis) / 1000
                )
            }
        }

        private static let isoFractional: ISO8601DateFormatter = {
            let f = ISO8601DateFormatter()
            f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
            return f
        }()
        private static let iso = ISO8601DateFormatter()

        func parser(
            _ parser: XMLParser,
            didStartElement elementName: String,
            namespaceURI: String?,
            qualifiedName qName: String?,
            attributes attributeDict: [String: String] = [:]
        ) {
            if rootElement == nil {
                // Namespace prefixes stripped, so `<gpx:gpx>` reads the same as `<gpx>`. Real
                // exports use both forms.
                rootElement = elementName.components(separatedBy: ":").last
            }
            switch elementName {
            case "trk":
                tracks.append([])
                container = .track
            case "trkseg":
                currentSegment = []
            case "rte":
                container = .route
            case "metadata":
                inMetadata = true
            case "trkpt", "rtept", "wpt":
                if elementName == "wpt", container == .none { container = .waypoint }
                pendingLat = attributeDict["lat"].flatMap(Double.init)
                pendingLon = attributeDict["lon"].flatMap(Double.init)
                pendingTime = nil
            case "time", "name":
                text = ""
                capturingText = true
            default:
                break
            }
        }

        func parser(_ parser: XMLParser, foundCharacters string: String) {
            guard capturingText else { return }
            text += string
        }

        func parser(
            _ parser: XMLParser,
            didEndElement elementName: String,
            namespaceURI: String?,
            qualifiedName qName: String?
        ) {
            let value = text.trimmingCharacters(in: .whitespacesAndNewlines)
            switch elementName {
            case "time":
                capturingText = false
                pendingTime = Self.isoFractional.date(from: value) ?? Self.iso.date(from: value)
            case "name":
                capturingText = false
                if inMetadata {
                    if metadataName == nil { metadataName = value }
                } else if container == .track, trackName == nil, !value.isEmpty {
                    trackName = value
                }
            case "metadata":
                inMetadata = false
            case "trkpt", "rtept", "wpt":
                guard let lat = pendingLat, let lon = pendingLon else { return }
                let point = GpsRoutePoint(lat: lat, lon: lon, offsetSecs: pendingTime?.timeIntervalSince1970)
                switch elementName {
                case "trkpt": currentSegment.append(point)
                case "rtept": routePoints.append(point)
                default: waypoints.append(point)
                }
                pendingLat = nil
                pendingLon = nil
            case "trkseg":
                // Segments within one track are joined: a GPS pause splits a segment without
                // meaning the activity stopped being one route.
                if !tracks.isEmpty { tracks[tracks.count - 1].append(contentsOf: currentSegment) }
                currentSegment = []
            case "trk", "rte":
                container = .none
            default:
                break
            }
        }
    }
}

private extension GpsRoutePoint {
    /// While importing, `offsetSecs` temporarily carries an **absolute** epoch time, because
    /// offsets can't be computed until the first point is known. `withOffsets` converts them.
    var absoluteTime: Date? {
        offsetSecs.map { Date(timeIntervalSince1970: $0) }
    }
}

/// Center tab: device (system) GPS spoofing driven by the GeoSpoof GPS desktop
/// agent. The iOS app is the sole controller — it writes the desired location
/// (§13e) and reads the agent's status back. Location itself is chosen on Home;
/// this tab opts the device-GPS layer in/out and shows connection/setup status.
struct GpsView: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var pro = ProStore.shared
    @ObservedObject private var router = AppRouter.shared
    @StateObject private var statusStore = GpsStatusStore()

    /// Whether the app is frontmost, tracked from `UIApplication` notifications rather
    /// than `@Environment(\.scenePhase)`.
    ///
    /// Not a style preference: this app is UIKit-hosted — `AppDelegate` is `@main` and the
    /// SwiftUI tree hangs off a `UIHostingController` in `SceneDelegate` — so there is no
    /// SwiftUI `Scene` to publish `scenePhase`, and it never reports `.active`. Gating the
    /// poll below on it therefore disabled the poll outright: every tick returned early and
    /// the tab only ever refreshed through `onAppear`, i.e. when the user switched tabs, so
    /// a desktop agent connecting or dropping went unnoticed until they left and came back.
    ///
    /// `SpoofModel.startForegroundObserver()` and `RootView` already take the notification
    /// route for exactly this reason — see the note on the former.
    @State private var isForeground = true

    /// Where to send users to get the desktop app. TODO: confirm final URL.
    private let downloadURL = AppLink.site("/gps", campaign: "gps-download")
    /// Support contact for founders whose grant can't be auto-verified on this device
    /// (see `founderSupportLink`). Tagged distinctly from the general Settings support
    /// link because a founder who can't unlock is a different problem from a user with a
    /// question, and lumping them together hides which one is growing.
    private let founderSupportURL = AppLink.site("/support", campaign: "founder-support")
    /// `@State` rather than `let`, because `Timer.publish` hands back a *new* publisher on
    /// every `init` and this struct is rebuilt whenever `RootView` re-renders — which any of
    /// `SpoofController`'s 27 `@Published` properties can cause. `onReceive` resubscribes
    /// when the publisher instance changes, and resubscribing restarts the 3s countdown, so
    /// a busy controller could hold the poll off indefinitely. `@State` keeps one publisher
    /// for the life of the view's identity. (Throwaway publishers from the discarded `init`s
    /// cost nothing: `autoconnect()` only starts the timer once something subscribes.)
    @State private var refreshTimer = Timer.publish(every: 3, on: .main, in: .common).autoconnect()
    @State private var showRouteImporter = false
    @State private var showRouteImportAlert = false
    @State private var routeImportMessage = ""
    @ObservedObject private var pendingImport = GpsPendingRouteImport.shared
    /// The loaded route, cached.
    ///
    /// Read from `route.json`, which the pace picker needs for its current selection and its length.
    /// Cached rather than read inside the view body, because the body re-evaluates on any of
    /// `SpoofController`'s published properties and a file read per render to learn something we
    /// authored is the wrong trade. Refreshed when the route identity changes.
    @State private var loadedRoute: GpsRoute?

    var body: some View {
        AdaptiveNavigationStack {
            Form {
                switch phase {
                case .notPro:
                    proPitchSection
                    compatibilitySection
                case .waitingForComputer:
                    aboutSection
                    lastKnownMotionSection
                    waitingSection
                    // Reachable here on purpose. Turning device GPS off is the one action that
                    // returns the real location, and leaving it out of this phase meant a user who
                    // enabled it and then lost their computer had no way to switch it off — the
                    // toggle was only rendered once a computer was reporting again.
                    syncToggleSection
                    compatibilitySection
                case .chooseController:
                    chooseControllerSection
                case .setupNeeded(let message):
                    setupNeededSection(message)
                    controllingComputerSection
                    syncToggleSection
                case .entitlementRejected:
                    entitlementRejectedSection
                    controllingComputerSection
                case .ready:
                    connectedSection(active: false)
                    routeControlsSection(nil)
                    controllingComputerSection
                    syncToggleSection
                case .spoofing(let motion):
                    connectedSection(active: true)
                    motionSection(motion)
                    routeControlsSection(motion)
                    controllingComputerSection
                    syncToggleSection
                case .lost:
                    lostSection
                    controllingComputerSection
                    syncToggleSection
                }
            }
            .groupedFormStyle()
            .tint(.brand)
            .navigationTitle("GPS")
            .onAppear {
                refreshStatus()
                refreshLoadedRoute()
                claimPendingRouteImport()
            }
            // Keyed on the route identity rather than on a timer: the file only changes when the
            // route does, and the id is derived from its content so any change moves it.
            .onChange(of: controller.motionState.routeId) { _, _ in refreshLoadedRoute() }
            // A file handed to the app while this tab is already open. `onAppear` covers the cold
            // launch and a tab switch; this covers the case where neither fires.
            .onChange(of: pendingImport.url) { _, url in
                if url != nil { claimPendingRouteImport() }
            }
            .onReceive(NotificationCenter.default.publisher(
                for: UIApplication.didBecomeActiveNotification
            )) { _ in
                isForeground = true
                // Refresh at once rather than waiting up to 3s for the next tick: coming
                // back to the app is precisely when what's on screen is most likely stale.
                refreshStatus()
                claimPendingRouteImport()
            }
            .onReceive(NotificationCenter.default.publisher(
                for: UIApplication.didEnterBackgroundNotification
            )) { _ in
                isForeground = false
            }
            .onReceive(refreshTimer) { _ in
                // Only poll while the app is in the foreground. This status read is purely
                // for display — the device-GPS spoof itself is driven by the desktop agent
                // reading `desired.json` (written on user actions via writePending(), not
                // here), so pausing the poll in the background never drops the active spoof.
                // It just avoids needless main-work + re-renders that can trip the
                // scene-update watchdog while backgrounded.
                guard isForeground else { return }
                refreshStatus()
            }
        }
    }

    /// Reload the roster for the current selection, then keep the selection sensible as the
    /// roster changes (auto-drive a sole computer; drop a selection whose computer has left).
    private func refreshStatus() {
        Task { @MainActor in
            // `reload` reads + decodes the roster off the main thread, then publishes on the
            // main actor; `reconcileSelection` then runs against that fresh roster.
            await statusStore.reload(selectedId: controller.selectedControllerId)
            reconcileSelection()
        }
    }

    /// Keep the controlling-computer selection consistent with who's actually present:
    ///   * exactly one computer ⇒ it drives automatically (clear any explicit pick, so the
    ///     agent's sole-controller path applies and a departed computer fails over cleanly);
    ///   * two+ computers ⇒ drop a selection naming a computer no longer present (the UI then
    ///     re-prompts); a valid selection is kept.
    private func reconcileSelection() {
        let present = statusStore.controllers
        switch present.count {
        case 0:
            break // waiting for a computer; keep the selection for when one returns
        case 1:
            if controller.selectedControllerId != nil { controller.setSelectedController(nil) }
        default:
            if let sel = controller.selectedControllerId,
               !present.contains(where: { $0.id == sel }) {
                controller.setSelectedController(nil)
            }
        }
    }

    /// Two+ computers present and no valid choice ⇒ the user must pick which one controls.
    private var needsControllerChoice: Bool {
        let present = statusStore.controllers
        guard present.count >= 2 else { return false }
        if let sel = controller.selectedControllerId,
           present.contains(where: { $0.id == sel }) {
            return false
        }
        return true
    }

    private var phase: GpsPhase {
        if !pro.isPro { return .notPro }
        // Resolve the "which computer" ambiguity before reading a single status.
        if needsControllerChoice { return .chooseController }
        guard let s = statusStore.status, !statusStore.isStale else { return .waitingForComputer }
        if s.session == "lost" { return .lost }
        // Checked before `connected`, because a computer that reached the phone and refused the
        // entitlement is connected — reporting it as a setup problem would send the user to look
        // at cables over a purchase they need to restore.
        if !s.pro { return .entitlementRejected }
        if !s.connected {
            // Pass the agent's remediation through even when empty. Substituting
            // our own fallback copy here would bake it into a `String` before it
            // reached a `Text`, making it unlocalizable; the view supplies the
            // fallback instead, where it can be a real key.
            return .setupNeeded(s.remediation)
        }
        if s.session == "spoofing" { return .spoofing(motionDetail(s)) }
        if !s.remediation.isEmpty { return .setupNeeded(s.remediation) }
        return .ready
    }

    /// What the owning computer is delivering, for a report already known to be fresh and
    /// spoofing.
    ///
    /// Private and only called from that branch of `phase`, which is what enforces the rule that
    /// `motion` is meaningless outside a spoofing session. Reading it for an idle computer would
    /// report a missing capability for a device nobody is driving — a mistake already made once
    /// on the agent side against an unreachable iPad.
    private func motionDetail(_ s: GpsStatus) -> GpsMotionDetail {
        let asked = controller.motionState.mode
        let gate = GpsEchoGate(status: s, asked: controller.motionState)

        // Every rejection case the agent defines — NaN, infinite, negative speed — can only be
        // produced by a defect in this app. So it goes to the log as a canary rather than into
        // copy for a dozen locales to translate.
        if let rejected = s.steering?.rejected {
            Log.bridge.error("GPS steering vector refused by the agent: \(rejected)")
        }

        // A request needs time to reach the computer. Until the grace window is up, a report that
        // doesn't mention it is describing the state *before* we asked — not refusing us.
        //
        // Rendering `.still` during that window is honest rather than a placeholder: the computer
        // genuinely is holding a coordinate, which is what `still` means. It also draws no section,
        // so a route appears once rather than being preceded by a flash of alarming copy.
        let tooEarly = gate.requestTooYoungToJudge()

        switch s.deliveredMotion {
        case .route:
            guard let progress = gate.confirmedRouteProgress, let route = s.route else {
                // Delivering a route, but describing a run other than the one we asked for — a
                // replay the computer hasn't picked up yet. Hold rather than render the previous
                // run's progress as this one's.
                return tooEarly ? .still : .notDelivered(asked: asked)
            }
            return .route(
                GpsRouteProgress(
                    name: route.name,
                    travelledM: progress.travelledM,
                    totalM: progress.totalM,
                    remainingSecs: progress.remainingSecs,
                    paused: route.paused ?? false,
                    finished: route.finished ?? false,
                    speedDefaulted: route.speedDefaulted ?? false,
                    repeats: controller.motionState.routeRepeats
                )
            )
        case .steering:
            return .steering(
                GpsSteeringDetail(
                    headingDeg: gate.steeringEchoMatches ? s.steering?.headingDeg : nil,
                    speedMps: gate.confirmedSpeedMps,
                    travelledM: s.steering?.travelledM,
                    deadline: gate.steeringDeadline(),
                    held: s.steering?.held ?? false,
                    expired: s.steering?.expired ?? false
                )
            )
        case .still:
            // Asking for motion and being told `still` means this computer declined it — but only
            // once it has had time to see the request. This is the branch that produced the flash:
            // it is the *normal* state for the second or so between writing a route and the agent
            // reading it.
            return (asked == .still || tooEarly) ? .still : .notDelivered(asked: asked)
        case .unknown, nil:
            // A mode this build can't name, or an agent old enough not to report one. Either way it
            // isn't doing what we asked, and we don't need to know which to say so.
            return (asked == .still || tooEarly) ? .still : .notDelivered(asked: asked)
        }
    }

    // MARK: Sections

    /// Escape hatch for a founding supporter whose grant can't be auto-verified on this
    /// device — e.g. they became a founder on macOS or via the legacy iOS-15 heuristic, so
    /// this iPhone's signed App Store record doesn't prove it. Founder and lifetime are
    /// identical in-product, so support just issues a free lifetime code, which then
    /// verifies through the normal signed path.
    private var founderSupportLink: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text("Founding supporter and can’t access?")
                .font(.footnote)
                .foregroundColor(.secondary)
            Link("Contact support", destination: founderSupportURL)
                .font(.footnote)
        }
    }

    private var aboutSection: some View {
        Section {
            HStack(alignment: .top, spacing: 12) {
                Image(systemName: "location.circle.fill")
                    .font(.title2)
                    .foregroundColor(.brand)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Device GPS")
                        .font(.headline)
                    Text("Move your iPhone’s real system GPS to the location you pick, driven from the GeoSpoof GPS app on your computer.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                }
            }
            .padding(.vertical, 4)
        }
    }

    /// Non-Pro gate for the GPS tab. Leads with the value (what device GPS does +
    /// concrete benefits) before the ask, so a paywalled user understands what
    /// they'd unlock. The CTA uses the app-wide `glassButtonStyle` (Liquid Glass
    /// on OS 26, bordered fallback below) at `.large` so it matches every other
    /// primary button and gets a full 44pt tap target. Restore lives in Settings
    /// and on the paywall itself, so it's intentionally not duplicated here.
    ///
    /// `DeviceGpsPitch` now carries the "Learn about GeoSpoof GPS" link
    /// itself, so the standalone section this tab used to add below it is gone —
    /// otherwise the same link would appear twice on this screen.
    private var proPitchSection: some View {
        Section {
            DeviceGpsPitch { router.showPaywall = true }
                .padding(.vertical, 4)
        }
    }

    /// The install step, and the one place in this tab that names the desktop platforms
    /// outright. Everywhere else says "computer": the agent runs on macOS and Windows, so a
    /// Mac-specific noun would read as "not supported" to the Windows half of the audience.
    /// Here the user is about to go and fetch a build, and "your computer" leaves a PC owner
    /// guessing whether one exists for them — which is precisely the question this footer
    /// answers. The `Link` label stays platform-free because /gps resolves the download.
    private var waitingSection: some View {
        Section {
            HStack(spacing: 10) {
                ProgressView()
                Text("Waiting for your computer…")
                    .foregroundColor(.secondary)
            }
            Link(destination: downloadURL) {
                Label("Get GeoSpoof GPS", systemImage: "arrow.down.circle")
            }
        } header: {
            Text("Set up")
        } footer: {
            Text("Install GeoSpoof GPS on your Mac or Windows PC and open it — it walks you through the one-time setup. Your chosen location then syncs to this iPhone automatically, over Wi-Fi.")
        }
    }

    /// What we last asked for, while no computer is reporting.
    ///
    /// Shown only when something was moving, because that is the case where silence is genuinely
    /// ambiguous: the route may still be playing — the agent owns elapsed time and reads
    /// `desired.json` whether this app is running or not — or the computer may have gone away
    /// entirely. We cannot tell from here, so this says what we asked for and explicitly does
    /// **not** claim it is happening.
    ///
    /// The alternative was showing the last progress figures we saw, and that was rejected: a
    /// progress bar frozen mid-route is indistinguishable from a live one at a glance, which is
    /// exactly the false confidence the freshness window exists to prevent.
    @ViewBuilder
    private var lastKnownMotionSection: some View {
        if controller.hasActiveMotion {
            Section {
                HStack(alignment: .top, spacing: 10) {
                    Image(systemName: "questionmark.circle")
                        .foregroundColor(.secondary)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(controller.motionState.steering != nil
                            ? "You asked for steering."
                            : "You asked for a route.")
                        Text("It may still be running — your computer drives it, and it doesn't need this app open. We just can't confirm right now.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                // Available here specifically *because* the report is stale. Withdrawing a request
                // needs no knowledge of where the device is and no computer to be reachable, so it
                // is safe when the pause and stop controls — which live in a section only rendered
                // while a computer is reporting — are not. Without it, a route requested just
                // before a computer went away has no way out at all.
                Button(role: .destructive) {
                    controller.clearGpsMotion()
                } label: {
                    Label("Cancel Request", systemImage: "xmark.circle")
                }
                .tint(.red)
            } header: {
                Text("Last request")
            } footer: {
                // Says when it takes effect rather than implying it stops anything now. It can't:
                // the change reaches the device only when a computer next reads it.
                Text("Cancelling takes effect the next time your computer connects. To return your real location now, turn off Sync below.")
            }
        }
    }

    /// Compatibility caveat, shown beneath the "Waiting for your computer" setup
    /// section: device GPS is for privacy/browsing/development, not AR games.
    /// A single small, muted row so it sets expectations without dominating.
    ///
    /// The wording lives on `DeviceGpsPitch` rather than here, because
    /// `DeviceGpsSheet` shows the same caveat and the two were previously the same
    /// sentence typed out twice.
    private var compatibilitySection: some View {
        Section {
            Label {
                Text(DeviceGpsPitch.compatibilityCaveat)
            } icon: {
                Image(systemName: "exclamationmark.triangle")
            }
            .font(.footnote)
            .foregroundColor(.secondary)
        }
    }

    private func setupNeededSection(_ message: String) -> some View {
        Section {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.orange)
                // Two sources, two treatments. Remediation text is authored by
                // the desktop agent and read from its status report, so it is
                // runtime data and must be verbatim. The empty case is our own
                // copy and is looked up. Renders exactly as before, when the
                // fallback was substituted upstream as a plain `String`.
                if message.isEmpty {
                    Text("Connecting to your iPhone…")
                } else {
                    Text(verbatim: message)
                }
            }
            // When the blocker is specifically "Pro required" — which a genuine founder can
            // hit if this device's signed record can't prove the grant — offer the founder
            // support path (free lifetime code) rather than leaving them stuck.
            if message.localizedCaseInsensitiveContains("Pro required") {
                founderSupportLink
            }
        } header: {
            Text("Action needed")
        } footer: {
            Text("Complete this step on your iPhone or in the GeoSpoof GPS app on your computer.")
        }
    }

    /// Picker shown when two or more computers can drive this phone and none is chosen yet
    /// (controller-arbitration). Tapping one records it as the owner; every other computer
    /// then stands down. A single-computer user never sees this.
    private var chooseControllerSection: some View {
        Section {
            ForEach(statusStore.controllers) { c in
                Button {
                    controller.setSelectedController(c.id)
                } label: {
                    HStack {
                        Image(systemName: "desktopcomputer")
                            .foregroundColor(.brand)
                        // The computer's own name, reported by the agent — user data.
                        Text(verbatim: c.name)
                            .foregroundColor(.primary)
                        Spacer()
                        if controller.selectedControllerId == c.id {
                            Image(systemName: "checkmark")
                                .foregroundColor(.brand)
                        }
                    }
                }
            }
        } header: {
            Text("Choose your computer")
        } footer: {
            Text("More than one computer can control this iPhone. Pick which one drives your GPS — the others stand by.")
        }
    }

    /// When two+ computers are present, a compact picker so the user can switch which one is
    /// in charge. Hidden in the common single-computer case.
    @ViewBuilder
    private var controllingComputerSection: some View {
        if statusStore.controllers.count >= 2 {
            Section {
                Picker(selection: Binding(
                    get: { controller.selectedControllerId ?? "" },
                    set: { controller.setSelectedController($0.isEmpty ? nil : $0) }
                )) {
                    ForEach(statusStore.controllers) { c in
                        // The computer's own name, reported by the agent — user data.
                        Text(verbatim: c.name).tag(c.id)
                    }
                } label: {
                    Label("Controlling computer", systemImage: "desktopcomputer")
                }
            } footer: {
                Text("Only this computer drives your iPhone’s GPS. The others stand by.")
            }
        }
    }

    @ViewBuilder
    private func connectedSection(active: Bool) -> some View {
        Section {
            HStack {
                Image(systemName: active ? "checkmark.circle.fill" : "checkmark.circle")
                    .foregroundColor(active ? .green : .secondary)
                Text(active ? "GPS spoofing active" : "Connected")
                Spacer()
            }
            if let device = statusStore.status?.device {
                // Device name reported by the agent — user/device data, not copy.
                infoRow("Device", Text(verbatim: device.name))
            }
            if active {
                infoRow("Location", locationText)
                if let prov = provenanceLabel(statusStore.status?.provenance ?? "") {
                    infoRow("Source", Text(prov))
                }
            }
        } header: {
            Text("Status")
        }
    }

    /// What's driving the location right now.
    ///
    /// Nothing for a plain held coordinate: `connectedSection` already says the location and its
    /// source, and a row reading "not moving" is noise.
    @ViewBuilder
    private func motionSection(_ motion: GpsMotionDetail) -> some View {
        switch motion {
        case .still:
            EmptyView()
        case .route(let progress):
            routeSection(progress)
        case .steering(let detail):
            steeringSection(detail)
        case .notDelivered(let asked):
            notDeliveredSection(asked)
        }
    }

    private func routeSection(_ p: GpsRouteProgress) -> some View {
        Section {
            HStack {
                Image(systemName: p.finished
                    ? "flag.checkered"
                    : (p.paused ? "pause.circle.fill" : "figure.walk.motion"))
                    .foregroundColor(p.finished ? .secondary : (p.paused ? .orange : .green))
                // "Finished", never "Stopped". The agent deliberately doesn't clear a completed
                // route — the device holds the final point — so calling it stopped would suggest
                // the location had reverted when it hasn't.
                Text(p.finished ? "Route finished" : (p.paused ? "Route paused" : "Following route"))
                Spacer()
            }
            if let name = p.name, !name.isEmpty {
                infoRow("Route", Text(verbatim: name))
            }
            ProgressView(value: p.fraction)
                .tint(.brand)
                .accessibilityLabel(Text("Route progress"))
                .accessibilityValue(Text(verbatim: distanceText(p.travelledM, of: p.totalM)))
            infoRow("Travelled", Text(verbatim: distanceText(p.travelledM, of: p.totalM)))
            // Duration is what people actually decide on, so it leads over the distance pair.
            // Passed through from the agent, never derived: an as-recorded route's pace varies
            // along the track, so (total − travelled) / speed would be wrong.
            if let remaining = p.remainingSecs, !p.finished {
                infoRow("Time left", Text(verbatim: durationText(remaining)))
            }
        } header: {
            Text("Route")
        } footer: {
            if p.speedDefaulted {
                Label(
                    "This route had no usable pace, so it's playing at walking speed.",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .foregroundStyle(.orange)
            } else if p.remainingSecs == nil && !p.finished {
                // Two different reasons a duration can be missing, and they need different
                // sentences. This branch used to assume the first, which was a false statement
                // waiting for the second to exist:
                //
                //   • the route loops, so there is genuinely no finish to count down to
                //   • the route's recorded timeline is unusable, so no honest estimate exists
                //
                // The loop case is answered from what *we* asked for, never inferred from the
                // absence of the number — absence tells you a value is missing, not why.
                if p.repeats {
                    Text("This route repeats, so it has no finish time.")
                } else {
                    Text("This route's recorded timings aren't usable, so there's no time estimate.")
                }
            }
        }
    }

    private func steeringSection(_ d: GpsSteeringDetail) -> some View {
        Section {
            HStack {
                Image(systemName: d.expired
                    ? "clock.badge.exclamationmark"
                    : (d.held ? "pause.circle.fill" : "dot.arrowtriangles.up.right.down.left.circle"))
                    .foregroundColor(d.expired ? .orange : (d.held ? .orange : .green))
                // Three distinct states, deliberately worded apart: expiry is the deadline
                // lapsing with no interaction, which is not the same as the user choosing to wait.
                Text(d.expired ? "Steering timed out" : (d.held ? "Holding position" : "Steering"))
                Spacer()
            }
            if let speed = d.speedMps, !d.held {
                infoRow("Speed", Text(verbatim: speedText(speed)))
            }
            if let travelled = d.travelledM {
                // Distance with no denominator: steering has no end, so a progress proportion
                // would be inventing one.
                infoRow("Travelled", Text(verbatim: distanceText(travelled)))
            }
        } header: {
            Text("Steering")
        } footer: {
            if d.expired {
                Text("Your phone is being held where steering left it.")
            }
        }
    }

    /// We asked this computer for a mode and it isn't delivering it.
    ///
    /// Worded to be actionable without asserting a cause. An agent that declined and one that
    /// predates the feature are indistinguishable from the report, and "needs updating" is true
    /// enough in both cases to act on.
    private func notDeliveredSection(_ asked: GpsMotionMode) -> some View {
        Section {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "arrow.up.circle")
                    .foregroundColor(.orange)
                VStack(alignment: .leading, spacing: 4) {
                    Text(asked == .route
                        ? "This computer isn't following your route."
                        : "This computer isn't following your steering.")
                    Text("Update GeoSpoof GPS on your computer to the latest version.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            if let version = statusStore.status?.agentVersion, !version.isEmpty {
                infoRow("Computer app", Text(verbatim: version))
            }
        } header: {
            Text("Route")
        }
    }

    /// The agent verified our entitlement and said no.
    ///
    /// Distinct from a connection fault on purpose: the agent checks the signed StoreKit material
    /// itself, offline, so this is reachable while the app believes it is Pro — a debug override,
    /// or a founder grant this device can't prove. Sending those users to check a cable wastes
    /// their time.
    private var entitlementRejectedSection: some View {
        Section {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "lock.circle")
                    .foregroundColor(.orange)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Your computer couldn't confirm GeoSpoof Pro.")
                    Text("It checks your purchase directly with Apple, so this can differ from what this app shows. Restoring your purchase usually fixes it.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            Button {
                router.showPaywall = true
            } label: {
                Label("Restore Purchase", systemImage: "arrow.clockwise")
            }
            founderSupportLink
        } header: {
            Text("GeoSpoof Pro")
        }
    }

    /// Import a route, and control the one that's loaded.
    ///
    /// `motion` is `nil` when connected but not spoofing, where importing is still useful — a user
    /// can load a route before turning device GPS on.
    @ViewBuilder
    private func routeControlsSection(_ motion: GpsMotionDetail?) -> some View {
        let playing: GpsRouteProgress? = {
            if case .route(let p) = motion { return p }
            return nil
        }()
        Section {
            Button {
                showRouteImporter = true
            } label: {
                Label(playing == nil ? "Import Route (GPX)" : "Import a Different Route",
                      systemImage: "square.and.arrow.down")
            }
            if let route = loadedRoute, controller.motionState.routeId != nil {
                pacePicker(route)
            }
            if let playing {
                // Pause and stop are separate controls on purpose. Pausing waits in place and
                // keeps spoofing; stopping ends playback. Neither reverts to the phone's real
                // GPS — that's the Sync toggle below, and conflating the three is the mistake the
                // agent contract warns about.
                if playing.finished {
                    Button {
                        controller.restartGpsRoute()
                    } label: {
                        Label("Play Again", systemImage: "arrow.counterclockwise")
                    }
                } else if playing.paused {
                    Button {
                        controller.resumeGpsRoute()
                    } label: {
                        Label("Resume", systemImage: "play.fill")
                    }
                } else {
                    Button {
                        controller.pauseGpsRoute()
                    } label: {
                        Label("Pause", systemImage: "pause.fill")
                    }
                }
                Button(role: .destructive) {
                    controller.stopGpsRoute()
                } label: {
                    Label("Stop Route", systemImage: "stop.fill")
                }
                .tint(.red)
            }
        } header: {
            Text("Route")
        } footer: {
            if playing == nil {
                Text("Export a GPX from Strava, Garmin, or any tracking app, then bring it here with AirDrop, Files, or iCloud Drive.")
            } else {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Pausing waits where you are and keeps your phone's GPS spoofed. Turning off Sync below is what returns your real location.")
                    // Said up front rather than left to be discovered. Changing pace makes it a
                    // different route, so it starts again — see `changeGpsRoutePace`.
                    Text("Changing the pace starts the route again from the beginning.")
                }
            }
        }
        .fileImporter(
            isPresented: $showRouteImporter,
            // `.gpx` isn't a system-declared type, so it's identified by extension. Falls back to
            // XML rather than refusing, since some exporters serve GPX with a generic type.
            allowedContentTypes: [
                UTType(filenameExtension: "gpx") ?? .xml,
                .xml,
            ],
            allowsMultipleSelection: false
        ) { result in
            handleRouteImport(result)
        }
        .alert("Route", isPresented: $showRouteImportAlert) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(routeImportMessage)
        }
    }

    /// Choose how fast to walk the loaded route, with the resulting duration shown.
    ///
    /// The duration is the number people actually decide on — "about 40 min" answers the question a
    /// pace in metres per second doesn't. Computed locally from the route's own length rather than
    /// waiting for the agent's `remaining_secs`, because it has to be visible *before* you commit to
    /// a pace, and at that moment no report describes the new one.
    ///
    /// `asRecorded` is offered only when the file has a usable timeline. Offering it otherwise would
    /// let someone pick a pace that silently becomes walking, which is the same misleading outcome
    /// `speed_defaulted` exists to warn about.
    @ViewBuilder
    private func pacePicker(_ route: GpsRoute) -> some View {
        let hasTimings = route.points.count > 1
            && route.points.allSatisfy { $0.offsetSecs != nil }
        let options = GpsRoutePace.allCases.filter { $0 != .asRecorded || hasTimings }
        Picker(selection: Binding(
            get: { route.speed.pace },
            set: { newPace in
                if let failure = controller.changeGpsRoutePace(to: newPace) {
                    routeImportMessage = Self.message(for: failure)
                    showRouteImportAlert = true
                }
                refreshLoadedRoute()
            }
        )) {
            ForEach(options) { pace in
                if let mps = pace.mps {
                    // Names the pace and what it means for this route, so the choice is made on the
                    // duration rather than on a guess about what "Jog" implies.
                    //
                    // Concatenated `Text` values, not `Text("\(a) — \(b)")`. Interpolating derives
                    // the context-free catalog key `%@ — %@`, which is unusable for a translator and
                    // would collide with every other two-part label in the app. Both parts are
                    // already localised or formatted, so `verbatim` is correct here — see
                    // CONTRIBUTING's note on interpolating into a `LocalizedStringKey`.
                    (
                        Text(verbatim: Self.paceLabel(pace))
                            + Text(verbatim: " — ")
                            + Text(verbatim: durationText(route.lengthMeters / mps))
                    ).tag(pace)
                } else {
                    Text(verbatim: Self.paceLabel(pace)).tag(pace)
                }
            }
        } label: {
            Label("Pace", systemImage: "speedometer")
        }
    }

    private static func paceLabel(_ pace: GpsRoutePace) -> String {
        switch pace {
        case .asRecorded: return String(localized: "As recorded")
        case .walk: return String(localized: "Walk")
        case .jog: return String(localized: "Jog")
        case .run: return String(localized: "Run")
        case .cycle: return String(localized: "Cycle")
        case .drive: return String(localized: "Drive")
        }
    }

    /// Re-read `route.json` into the cache. Called when the route identity changes.
    private func refreshLoadedRoute() {
        loadedRoute = controller.motionState.routeId == nil ? nil : controller.loadGpsRoute()
    }

    /// Read the picked file and start playback, or explain why not.
    ///
    /// Reads on a background task: a large track is a few megabytes of XML, and parsing it on the
    /// main actor would drop frames on the very screen showing the result.
    private func handleRouteImport(_ result: Result<[URL], Error>) {
        switch result {
        case .failure:
            // The user cancelling arrives here too, and needs no alert.
            return
        case .success(let urls):
            guard let url = urls.first else { return }
            // The picker always hands back a URL outside the container and never transfers
            // ownership of it, so nothing is deleted afterwards.
            importRoute(from: url, deleteAfterReading: false)
        }
    }

    /// Take a GPX handed to the app from outside — AirDrop, Mail, Files, a share sheet — if one is
    /// waiting.
    ///
    /// Claimed here rather than in `RootView` because this is the screen that can show the result,
    /// and an import whose outcome appears on a tab the user isn't looking at is indistinguishable
    /// from nothing happening.
    private func claimPendingRouteImport() {
        guard let pending = pendingImport.claim() else { return }
        // Files can open a document *in place*, in which case the URL points at something we don't
        // own — an iCloud Drive document, say. AirDrop and Mail instead drop a copy in our Inbox
        // that is ours to clean up, and left alone it accumulates forever.
        importRoute(from: pending.url, deleteAfterReading: !pending.openInPlace)
    }

    /// One import path for every source, so a file behaves identically however it arrived.
    private func importRoute(from url: URL, deleteAfterReading: Bool) {
        Task { @MainActor in
            let outcome = await Task.detached(priority: .userInitiated) {
                // A URL from outside the container needs access taken explicitly and given back.
                // Without this the read fails silently on a file from iCloud Drive — silently
                // being the operative word, which is why it isn't conditional on the source.
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                guard let data = try? Data(contentsOf: url) else {
                    return Result<GpsRoute, GpsGpxImportFailure>.failure(.unreadable)
                }
                if deleteAfterReading {
                    // After reading, so a failed delete can never cost us the import.
                    try? FileManager.default.removeItem(at: url)
                }
                return GpsGpxImporter.route(
                    from: data,
                    fallbackName: url.deletingPathExtension().lastPathComponent
                )
            }.value

            switch outcome {
            case .success(let route):
                if let failure = controller.startGpsRoute(route) {
                    routeImportMessage = Self.message(for: failure)
                } else {
                    routeImportMessage = Self.startedMessage(for: route)
                }
            case .failure(let failure):
                routeImportMessage = Self.message(for: failure)
            }
            showRouteImportAlert = true
            refreshStatus()
        }
    }

    private static func startedMessage(for route: GpsRoute) -> String {
        let distance = Measurement(value: route.lengthMeters, unit: UnitLength.meters)
            .formatted(.measurement(width: .abbreviated, usage: .road))
        let name = route.name?.isEmpty == false ? route.name! : "Route"
        // Names the pace when we had to choose one, so nobody is surprised by a walking-speed
        // replay of a cycling track.
        switch route.speed {
        case .asRecorded:
            return "\(name) loaded — \(distance), replaying at its recorded pace."
        case .fixed:
            return "\(name) loaded — \(distance). This file had no timings, so it plays at walking pace."
        }
    }

    private static func message(for failure: GpsGpxImportFailure) -> String {
        switch failure {
        case .unreadable:
            return "That file couldn't be read."
        case .tooLarge(let bytes):
            let size = Measurement(value: Double(bytes), unit: UnitInformationStorage.bytes)
                .formatted(.byteCount(style: .file))
            return "That file is \(size), which is too large to use."
        case .noTrack:
            return "No route found in that file. GPX files exported from tracking apps should work."
        case .notGpx(let root):
            // Names what the file actually is where we can. "Not a GPX file" alone invites a second
            // attempt with the same file.
            if let root, !root.isEmpty {
                return "That isn't a GPX file — it starts with <\(root)>. Export a GPX from your tracking app."
            }
            return "That isn't a GPX file. Export a GPX from your tracking app."
        case .tooManyPoints(let count):
            // Names the number and refuses. Truncating would look like it worked.
            return "That route has \(count.formatted()) points, which is more than \(GpsRoute.maxPoints.formatted()). Try exporting it at a lower detail."
        case .invalidCoordinate:
            return "That route contains coordinates that aren't valid."
        }
    }

    private static func message(for failure: GpsRouteValidationFailure) -> String {
        switch failure {
        case .noPoints:
            return "That route has no points."
        case .tooManyPoints(let count):
            return "That route has \(count.formatted()) points, which is more than \(GpsRoute.maxPoints.formatted())."
        case .invalidCoordinate:
            return "That route contains coordinates that aren't valid."
        case .invalidSpeed:
            return "That route's pace isn't usable."
        case .writeFailed:
            // Nothing the user can act on, so it doesn't pretend to offer advice.
            return "Couldn't save that route on this device."
        }
    }

    // MARK: Motion formatting

    /// Locale-aware distance. Miles for a US customer, kilometres elsewhere — a running route
    /// quoted in metres to an American reads cheap.
    private func distanceText(_ meters: Double) -> String {
        Measurement(value: meters, unit: UnitLength.meters)
            .formatted(.measurement(width: .abbreviated, usage: .road))
    }

    private func distanceText(_ meters: Double, of total: Double) -> String {
        "\(distanceText(meters)) / \(distanceText(total))"
    }

    /// "about 9 min". Rounded deliberately — a second-precise countdown implies precision this
    /// number doesn't have, since it is recomputed from a report that can be a tick old.
    private func durationText(_ seconds: Double) -> String {
        Duration.seconds(max(0, seconds))
            .formatted(.units(allowed: [.hours, .minutes], width: .abbreviated))
    }

    private func speedText(_ mps: Double) -> String {
        Measurement(value: mps, unit: UnitSpeed.metersPerSecond)
            .formatted(.measurement(width: .abbreviated, usage: .general))
    }

    private var syncToggleSection: some View {
        Section {
            Toggle(isOn: Binding(
                get: { controller.deviceGpsEnabled },
                set: { controller.setDeviceGpsEnabled($0) }
            )) {
                Label("Sync my iPhone’s GPS", systemImage: "location.fill.viewfinder")
            }
        } footer: {
            if controller.deviceGpsEnabled && controller.location == nil {
                Text("Choose a location on the Home tab to start syncing.")
            } else {
                Text("When on, your iPhone’s real system GPS is set to your chosen location. This affects all apps, including Find My.")
            }
        }
    }

    private var lostSection: some View {
        Section {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "wifi.exclamationmark")
                    .foregroundColor(.orange)
                Text("Lost the connection to your computer. Your real GPS may have returned.")
            }
        } header: {
            Text("Status")
        } footer: {
            Text("Make sure the GeoSpoof GPS app is running and your computer is awake and online.")
        }
    }

    // MARK: Helpers

    /// `value` is a built `Text`, not a `String`, so each call site declares
    /// whether its value is localizable copy or a technical readout — the same
    /// split `LabeledRow` uses. A single `String` parameter renders everything
    /// verbatim and loses that distinction silently.
    private func infoRow(_ label: LocalizedStringKey, _ value: Text) -> some View {
        HStack {
            Text(label)
            Spacer()
            value
                .foregroundColor(.secondary)
                .multilineTextAlignment(.trailing)
        }
    }

    /// Returns a built `Text` rather than a key: the first two branches are data
    /// (a reverse-geocoded place name, then formatted coordinates) and the third
    /// is copy, so only the literal is looked up.
    private var locationText: Text {
        // Reverse-geocoded place name — runtime data, not copy.
        if let name = controller.locationName?.displayName, !name.isEmpty { return Text(verbatim: name) }
        if let loc = controller.location {
            // Formatted coordinates — numeric data, not copy.
            return Text(verbatim: String(format: "%.4f, %.4f", loc.latitude, loc.longitude))
        }
        return Text("No location chosen")
    }

    private func provenanceLabel(_ provenance: String) -> LocalizedStringKey? {
        switch provenance {
        case "vpn-sync": return "Matched to your VPN"
        case "manual": return "Manual"
        case "from-app": return "GeoSpoof"
        default: return nil
        }
    }
}

struct SettingsView: View {
    @ObservedObject var controller: SpoofController
    @StateObject private var iconModel = AppIconModel()
    @ObservedObject private var pro = ProStore.shared
    @AppStorage("appearanceMode") private var appearance: AppearanceMode = .system
    #if DEBUG
    @AppStorage(LogSettingsKey.enabled) private var loggingEnabled = false
    @AppStorage(LogSettingsKey.level) private var logLevelRaw = AppLogLevel.info.rawValue
    @State private var showDebugPaywall = false
    @State private var showDebugProPitch = false
    @State private var showDebugFounderWelcome = false
    @State private var debugProOverride = ProStore.debugProOverrideSelection()
    @State private var showTestRouteResult = false
    @State private var testRouteFailure: GpsRouteValidationFailure?
    @ObservedObject private var router = AppRouter.shared
    @ObservedObject private var review = ReviewPrompt.shared
    #endif

    var body: some View {
        NavigationView {
            Form {
                ProSettingsSection()

                Section {
                    NavigationLink {
                        AppearancePickerView(selection: $appearance)
                    } label: {
                        HStack {
                            Label("Appearance", systemImage: "circle.lefthalf.filled")
                            Spacer()
                            Text(appearance.displayName)
                                .foregroundColor(.secondary)
                        }
                    }
                    NavigationLink {
                        AppIconPickerView(iconModel: iconModel)
                    } label: {
                        HStack {
                            Label("App Icon", systemImage: "app.badge")
                            Spacer()
                            Text(iconModel.selection.displayName)
                                .foregroundColor(.secondary)
                        }
                    }
                } header: {
                    Text("Appearance")
                }

                // Tips remain available only to founding supporters — they got
                // Pro free for life, so this is the one way they can chip in.
                // Everyone else is funneled to the subscription instead.
                if pro.isFounder {
                    TipJarView()
                }

                Section {
                    Link(
                        destination: URL(
                            string: "https://apps.apple.com/app/id6765719745?action=write-review&pt=128299974&ct=ios-app-settings")!
                    ) {
                        Label("Rate GeoSpoof", systemImage: "star")
                    }
                    Link(destination: URL(string: "https://github.com/anthonysgro/geospoof")!) {
                        Label("View Source on GitHub", systemImage: "chevron.left.forwardslash.chevron.right")
                    }
                }

                Section {
                    Link(destination: URL(string: "https://www.geospoof.com/feedback?utm_source=ios-app&utm_medium=app&utm_campaign=feedback")!) {
                        Label("Give Feedback", systemImage: "text.bubble")
                    }
                    Link(destination: URL(string: "https://www.geospoof.com/support?utm_source=ios-app&utm_medium=app&utm_campaign=support")!) {
                        Label("Help & Support", systemImage: "questionmark.circle")
                    }
                    Link(destination: URL(string: "https://www.geospoof.com/privacy?utm_source=ios-app&utm_medium=app&utm_campaign=privacy")!) {
                        Label("Privacy Policy", systemImage: "hand.raised")
                    }
                    Link(destination: URL(string: "https://www.geospoof.com/terms?utm_source=ios-app&utm_medium=app&utm_campaign=terms")!) {
                        Label("Terms of Service", systemImage: "doc.text")
                    }
                } header: {
                    Text("Help & Legal")
                } footer: {
                    // Version + build identifier ("v1.19.10 (87)"), not copy.
                    Text(verbatim: AppInfo.versionWithBuild)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .padding(.top, 8)
                }

                #if DEBUG
                Section {
                    Toggle(isOn: $loggingEnabled) {
                        Label("Diagnostic Logging", systemImage: "ladybug")
                    }
                    if loggingEnabled {
                        Picker(selection: $logLevelRaw) {
                            ForEach(AppLogLevel.allCases) { level in
                                Text(level.label).tag(level.rawValue)
                            }
                        } label: {
                            Label("Log Level", systemImage: "slider.horizontal.3")
                        }
                    }
                    Button {
                        showDebugPaywall = true
                    } label: {
                        Label("Show Paywall", systemImage: "creditcard")
                    }
                    Button {
                        showDebugProPitch = true
                    } label: {
                        Label("Show Pro Pitch", systemImage: "sparkles.rectangle.stack")
                    }
                    Button {
                        showDebugFounderWelcome = true
                    } label: {
                        Label("Show Founder Welcome", systemImage: "sparkles")
                    }
                    Button {
                        router.showOnboarding = true
                    } label: {
                        Label("Show Onboarding", systemImage: "hand.wave")
                    }
                    // Proves the whole route pipe against a real agent before any authoring UI
                    // exists: writes `route.json`, arms `desired.json`, and the device should
                    // start walking within about a second. DEBUG-only — this is a test fixture,
                    // not a feature.
                    Button {
                        testRouteFailure = controller.startGpsRoute(.debugWalk)
                        showTestRouteResult = true
                    } label: {
                        Label("Play Test Route", systemImage: "figure.walk")
                    }
                    Button {
                        controller.stopGpsRoute()
                    } label: {
                        Label("Stop Test Route", systemImage: "stop.circle")
                    }
                    Picker(selection: $debugProOverride) {
                        Text("Auto (real check)").tag(0)
                        Text("Force Founder").tag(1)
                        Text("Force Not Pro").tag(2)
                        Text("Force Subscription").tag(3)
                    } label: {
                        Label("Pro Override", systemImage: "wand.and.stars")
                    }
                    .onChange(of: debugProOverride) { _, value in
                        ProStore.setDebugProOverride(value)
                    }
                } header: {
                    Text("Debug")
                } footer: {
                    Text("Founder status normally comes from the App Store original-download version, which isn't available on the simulator. Force Founder / Not Pro / Subscription to test each tier. (Overrides the app's local Pro gate only — the GPS agent still needs a real signed purchase.)")
                }
                .alert("Test Route", isPresented: $showTestRouteResult) {
                    Button("OK", role: .cancel) {}
                } message: {
                    Text(verbatim: testRouteFailure.map { "Refused: \($0)" }
                        ?? "Route written. Turn on Device GPS, then watch Find My — the pin should start moving within a second or two.")
                }

                Section {
                    Button {
                        review.forcePrompt()
                    } label: {
                        Label("Show Prompt (Scene API)", systemImage: "star.bubble")
                    }
                    Button {
                        review.forcePrompt(using: .environmentAction)
                    } label: {
                        Label("Show Prompt (Env Action)", systemImage: "star.bubble.fill")
                    }
                    Button {
                        review.recordEventForTesting()
                    } label: {
                        Label("Record Qualifying Occasion", systemImage: "plus.circle")
                    }
                    Button(role: .destructive) {
                        review.resetForTesting()
                    } label: {
                        Label("Reset Review Gating", systemImage: "arrow.counterclockwise")
                    }
                } header: {
                    Text("Debug · Review Prompt")
                } footer: {
                    // Live gate state, not copy — verbatim keeps it out of the catalog.
                    Text(verbatim: review.debugSummary)
                }

                Section {
                    Button {
                        controller.refreshSafariEnablement()
                        controller.refreshFromExtension()
                    } label: {
                        Label("Re-check Safari State", systemImage: "arrow.clockwise")
                    }
                } header: {
                    Text("Debug · Safari State")
                } footer: {
                    // The two raw signals and what they resolve to. Safari's own Settings
                    // and Manage Extensions screens can disagree with each other — and
                    // enablement also syncs between devices over iCloud — so when the app
                    // looks wrong, this is what says whether the OS reported something
                    // odd or the gate mis-fired. Verbatim: live state, not copy.
                    Text(verbatim: controller.safariDebugSummary)
                        .monospaced()
                }
                #endif
            }
            .navigationTitle("Settings")
            #if DEBUG
            .sheet(isPresented: $showDebugPaywall) { ProPaywallView() }
            .sheet(isPresented: $showDebugProPitch) { ProPitchSheet() }
            .sheet(isPresented: $showDebugFounderWelcome) {
                FounderWelcomeSheet { showDebugFounderWelcome = false }
            }
            #endif
        }
        .navigationViewStyle(.stack)
        #if DEBUG
        // Outside the navigation stack, same as the production attachment in
        // `HomeView`. Debug-only, so release builds keep exactly one presenter.
        .requestReview(on: review.token)
        #endif
    }
}

struct AppIconPickerView: View {
    @ObservedObject var iconModel: AppIconModel

    private let columns = [GridItem(.adaptive(minimum: 88), spacing: 20)]

    var body: some View {
        Group {
            if iconModel.supported {
                grid
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "app.dashed")
                        .font(.largeTitle)
                        .foregroundColor(.secondary)
                    Text("Icons Unavailable")
                        .font(.headline)
                    Text("This device doesn’t support changing the app icon.")
                        .font(.subheadline)
                        .foregroundColor(.secondary)
                        .multilineTextAlignment(.center)
                }
                .padding(40)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("App Icon")
    }

    private var grid: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 24) {
                ForEach(AppIconOption.allCases) { option in
                    cell(for: option)
                }
            }
            .padding(20)
        }
    }

    @ViewBuilder
    private func cell(for option: AppIconOption) -> some View {
        let isSelected = iconModel.selection == option

        Button {
            Task { await iconModel.apply(option) }
        } label: {
            VStack(spacing: 8) {
                ZStack(alignment: .topTrailing) {
                    Image(option.previewAsset)
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .strokeBorder(
                                    isSelected ? Color.accentColor : Color.primary.opacity(0.12),
                                    lineWidth: isSelected ? 3 : 1
                                )
                        )

                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.body.weight(.bold))
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, Color.accentColor)
                            .padding(4)
                    }
                }

                Text(option.displayName)
                    .font(.caption)
                    .foregroundColor(isSelected ? Color.accentColor : .secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(option.displayName)
        .accessibilityHint(isSelected ? "Selected" : "Tap to apply")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }
}

struct AppearancePickerView: View {
    @Binding var selection: AppearanceMode

    private let columns = [GridItem(.adaptive(minimum: 88), spacing: 20)]

    var body: some View {
        ScrollView {
            LazyVGrid(columns: columns, spacing: 24) {
                ForEach(AppearanceMode.allCases) { mode in
                    cell(for: mode)
                }
            }
            .padding(20)
        }
        .navigationTitle("Appearance")
    }

    @ViewBuilder
    private func cell(for mode: AppearanceMode) -> some View {
        let isSelected = selection == mode

        Button {
            selection = mode
        } label: {
            VStack(spacing: 8) {
                ZStack(alignment: .topTrailing) {
                    swatch(for: mode)
                        .frame(width: 72, height: 72)
                        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        .overlay(
                            RoundedRectangle(cornerRadius: 16, style: .continuous)
                                .strokeBorder(
                                    isSelected ? Color.accentColor : Color.primary.opacity(0.12),
                                    lineWidth: isSelected ? 3 : 1
                                )
                        )

                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.body.weight(.bold))
                            .symbolRenderingMode(.palette)
                            .foregroundStyle(.white, Color.accentColor)
                            .padding(4)
                    }
                }

                Text(mode.displayName)
                    .font(.caption)
                    .foregroundColor(isSelected ? Color.accentColor : .secondary)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .frame(minWidth: 44, minHeight: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(mode.displayName)
        .accessibilityHint(isSelected ? "Selected" : "Tap to apply")
        .accessibilityAddTraits(isSelected ? [.isSelected] : [])
    }

    /// A visual preview of each appearance: white for Light, near-black for
    /// Dark, and a split for System.
    @ViewBuilder
    private func swatch(for mode: AppearanceMode) -> some View {
        switch mode {
        case .light:
            Color.white.overlay(
                Image(systemName: "sun.max.fill")
                    .font(.title2)
                    .foregroundColor(.orange)
            )
        case .dark:
            Color(white: 0.11).overlay(
                Image(systemName: "moon.fill")
                    .font(.title2)
                    .foregroundColor(.yellow)
            )
        case .system:
            HStack(spacing: 0) {
                Color.white
                Color(white: 0.11)
            }
        }
    }
}

// MARK: - App icon model

enum AppIconOption: String, CaseIterable, Identifiable {
    case standard
    case dark

    var id: String { rawValue }

    var displayName: LocalizedStringKey {
        switch self {
        case .standard: return "Default"
        case .dark: return "Dark"
        }
    }

    /// `nil` restores the primary app icon; otherwise the alternate icon name
    /// as declared in the asset catalog.
    var alternateName: String? {
        switch self {
        case .standard: return nil
        case .dark: return "AppIconDark"
        }
    }

    /// A regular image set used for the grid thumbnail. App-icon-set assets
    /// can't be loaded via `Image(named:)`, so each option ships a separate
    /// preview imageset.
    var previewAsset: String {
        switch self {
        case .standard: return "IconPreviewLight"
        case .dark: return "IconPreviewDark"
        }
    }

    static func current(alternateName: String?) -> AppIconOption {
        guard let alternateName else { return .standard }
        return allCases.first { $0.alternateName == alternateName } ?? .standard
    }
}

@MainActor
final class AppIconModel: ObservableObject {
    @Published var selection: AppIconOption = .standard
    @Published var supported: Bool = false

    init() {
        refresh()
    }

    func refresh() {
        supported = UIApplication.shared.supportsAlternateIcons
        selection = AppIconOption.current(alternateName: UIApplication.shared.alternateIconName)
    }

    /// Applies the chosen icon, skipping redundant calls so the system
    /// "You have changed the icon" alert only appears on an actual change.
    func apply(_ option: AppIconOption) async {
        guard supported else { return }

        let target = option.alternateName
        guard UIApplication.shared.alternateIconName != target else {
            selection = option
            return
        }

        do {
            try await UIApplication.shared.setAlternateIconName(target)
            selection = option
        } catch {
            // The system rejected the change (e.g. bad asset name); the live
            // icon didn't change, so leave `selection` as-is.
        }
    }
}
