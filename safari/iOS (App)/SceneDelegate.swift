//
//  SceneDelegate.swift
//  iOS (App)
//
//  Created by Anthony on 5/1/26.
//

import Combine
// For a stable content hash of an imported GPX file — see `GpsGpxImporter.contentID`.
import CoreLocation
import CryptoKit
import MapKit
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
    /// Whether device GPS is already set up, resolved here so onboarding can skip its GPS step for
    /// someone who has nothing left to do there.
    ///
    /// Answered in `RootView` because the roster lives in `GpsStatusStore`, which is iOS-app-only,
    /// while `OnboardingView` is shared code that must not reach for it.
    ///
    /// Starts `false` and stays `false` on any failure, so the step shows. A step shown to someone
    /// who did not need it costs them one tap; a step skipped for someone who did leaves them with
    /// no guided route to the feature they paid for.
    @State private var deviceGpsAlreadyWorking = false

    /// Whether setup owns the screen. Named so the branch below and the animation
    /// keyed to it read the same expression and can't drift apart.
    private var showingOnboarding: Bool {
        !onboardingCompleted || router.showOnboarding
    }

    var body: some View {
        Group {
            if showingOnboarding {
                OnboardingView(
                    controller: controller,
                    deviceGpsAlreadyWorking: deviceGpsAlreadyWorking
                ) {
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
        .task {
            // Comfortably early: the customer walks welcome, the goal question, location, the Safari
            // handoff, and verification before the GPS step can be reached, so this one-shot read is
            // long settled by then. Resolving it here rather than on the step itself is what avoids a
            // screen that appears and then vanishes — the "flashed and vanished" read that
            // `advance()` already documents for an already-satisfied Safari step.
            await resolveDeviceGpsReadiness()
        }
        .onAppear {
            applyInterfaceStyle(appearance)
            // Seeded here rather than when Routes is first opened, so the GPS tab's saved-route count is
            // already right whichever surface the customer reaches first — a badge that reads 0 and then
            // 1 the moment you look at the list is a worse introduction than the route itself is a good
            // one. One flagged file write on the first launch of this build, and never again.
            GpsSampleRoute.seedIfNeeded()
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

    /// Decide whether onboarding's GPS step has anything to ask this customer.
    ///
    /// Both halves are required. Pro without a computer still needs the step — the computer is the
    /// outstanding half, and it is the one the step exists to hand off. A computer without Pro
    /// likewise. Only someone holding both has finished, and only they should never see it.
    ///
    /// `isStale` is the freshness test: the store resolves no owner when nothing has published
    /// inside its window, which also covers the two-computers-and-no-pick case.
    private func resolveDeviceGpsReadiness() async {
        guard ProStore.shared.isPro else { return }
        let store = GpsStatusStore()
        await store.reload(selectedId: controller.selectedControllerId)
        deviceGpsAlreadyWorking = !store.isStale
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
                return GpsMotionSample(
                    latitude: nil, longitude: nil, travelledM: nil, seekSupported: false,
                    confirmedRouteStartedAt: nil, routeFinished: nil, routePaused: nil,
                    rosterWasRead: true
                )
            }
            let gate = GpsEchoGate(status: status, asked: controller.motionState)
            let resolved = gate.resolvedPosition(
                route: controller.loadGpsRoute(),
                chosen: controller.location
            )
            return GpsMotionSample(
                latitude: resolved?.latitude,
                longitude: resolved?.longitude,
                // Through the gate, so this is the distance for the run we actually asked about
                // rather than one left over from the run it replaced. That is what makes it safe to
                // send back as a seek — see `GpsMotionState.routeStartTravelledM`.
                travelledM: gate.confirmedRouteProgress?.travelledM,
                // Presence, never equality — a legitimate clamp would fail an equality check and read as
                // an agent that can't seek. See `GpsRouteStatus.startTravelledM`.
                seekSupported: status.route?.startTravelledM != nil,
                // Only when the gate accepted progress for the run we asked about — so this is the marker
                // of a run genuinely under way, not one the agent merely has on file.
                confirmedRouteStartedAt: gate.confirmedRouteProgress == nil
                    ? nil : status.route?.startedAt,
                // Gate-guarded like the marker above it, and for the same reason: a `finished` left over
                // from the run this one replaced would tell a fresh replay it was already over.
                routeFinished: gate.confirmedRouteProgress == nil ? nil : status.route?.finished,
                // Gate-guarded for the same reason again. This is the computer's answer about holding, and
                // it is what a Pause/Resume control must read — `motionState.routePaused` is the question.
                routePaused: gate.confirmedRouteProgress == nil ? nil : status.route?.paused,
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
            // Location · Browser · GPS · Settings.
            //
            // One setting with two independent consumers, and each consumer owns its own tab.
            // `controller.location` is the setting; `enabled` gates the browser's copy of it and
            // `deviceGpsEnabled` gates the device's, and neither switch reads the other. The old
            // bar put the setting and one of its two consumers together on "Home" and gave the
            // other its own tab, which is what made GPS feel bolted on — a shape problem rather
            // than a priority one.
            //
            // The pin glyph is the chosen place; GPS keeps `location.circle` so existing muscle
            // memory still lands on the same tab.
            LocationView(controller: controller)
                .tabItem {
                    Label("Location", systemImage: "mappin.and.ellipse")
                }
                .tag(AppRouter.RootTab.location)

            BrowserSettingsView(controller: controller)
                .tabItem {
                    Label("Browser", systemImage: "globe")
                }
                .tag(AppRouter.RootTab.browser)

            GpsView(controller: controller)
                .tabItem {
                    Label("GPS", systemImage: "location.circle")
                }
                .tag(AppRouter.RootTab.gps)

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

// MARK: - Location (native control panel — parity with the extension popup)

/// The landing tab: the chosen location and everything that decides it.
///
/// Was `HomeView` while it also owned the browser's Protection switch. That switch now lives on
/// the Browser tab, which is what let this screen take the name of the one thing it is about.
struct LocationView: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var review = ReviewPrompt.shared
    /// Read here, not just on the GPS tab, so this screen can state whether the device's GPS is
    /// genuinely being driven rather than merely switched on.
    ///
    /// A one-shot read on appear and on each foreground return — deliberately not a timer. The GPS
    /// tab already polls this every few seconds while it's open, and this screen only has to be
    /// right at the moment someone looks at it. `readRoster` enumerates and decodes files, which
    /// the store itself warns can block, so it stays off the main thread there and is awaited here.
    @StateObject private var gpsStatus = GpsStatusStore()
    /// Separates "haven't looked yet" from "looked and found nothing", which are the same value of
    /// `isStale` (it starts `true`). Without this the first frame after launch accuses the setup of
    /// being broken before the roster has even been read — the app calling itself broken on no
    /// evidence, which is worse than saying nothing.
    @State private var rosterWasRead = false
    @Environment(\.scenePhase) private var scenePhase

    /// Whether a computer is, right now, confirming it is moving this device's GPS.
    ///
    /// `nil` while unread, so the summary can hold its tongue instead of guessing. Freshness and
    /// the report's own claim are both required: `isStale` also covers the two-computers-and-no-pick
    /// case, since the store resolves no owner for it.
    private var deviceGpsDelivering: Bool? {
        guard rosterWasRead else { return nil }
        return !gpsStatus.isStale && (gpsStatus.status?.isDeliveringSpoof ?? false)
    }

    var body: some View {
        AdaptiveNavigationStack {
            SpoofControlPanel(controller: controller, deviceGpsDelivering: deviceGpsDelivering)
                // Matches the tab label. It read "GeoSpoof" when the tab was "Home" and the screen
                // had no single subject to name; the app name is carried by the icon and the
                // brand tint regardless.
                .navigationTitle("Location")
        }
        // Outside the navigation stack on purpose — the review action can
        // silently no-op when fired from a view nested inside one.
        .requestReview(on: review.token)
        .task { await refreshDeviceGpsStatus() }
        .onChange(of: scenePhase) { _, phase in
            // A resident process can sit on this tab for days. Without this the summary would keep
            // reporting a computer that went away while the phone was in a pocket.
            if phase == .active { Task { await refreshDeviceGpsStatus() } }
        }
    }

    private func refreshDeviceGpsStatus() async {
        await gpsStatus.reload(selectedId: controller.selectedControllerId)
        rosterWasRead = true
    }
}

// MARK: - GPS (device / system GPS spoofing via the GeoSpoof GPS desktop agent)

/// Redacted device summary from the agent's status report.
/// Decoded, and deliberately **not displayed**.
///
/// It describes the phone the agent is driving, which — because each computer writes its self-file
/// into *this* app's container over AFC — is always the phone the customer is holding. A row naming
/// it told them something they could see by looking down. The Status block names the controlling
/// computer instead, which is the part they can't see.
///
/// Kept decodable rather than deleted: it is part of the agent's payload, and dropping fields from
/// the wire contract to match what the UI happens to show today is how a later feature discovers the
/// data was thrown away. `productType` and `iosVersion` have never been shown at all; if diagnostics
/// ever want them, the Details screen is where they belong.
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

/// Where the coordinate the agent is applying came from.
///
/// Typed rather than left as the agent's raw string, for the same reason `GpsTransport` is: the
/// mapping from wire value to a sentence belongs beside the model, not inline in a view. It was
/// previously a `switch` over string literals in `GpsView`, which is the shape that quietly stops
/// matching when the agent adds a value.
///
/// **This is only half of "what is driving my GPS".** It answers *where the coordinate came from*,
/// never *what is being done to it* — a route or a steering vector supersedes it entirely. See
/// `GpsDriver`, which is the join and the thing the UI should ask.
nonisolated enum GpsProvenance: String, Codable, Equatable {
    /// Matched to the exit node of the user's VPN.
    case vpnSync = "vpn-sync"
    /// A place the user picked.
    case manual
    /// Handed over by this app rather than chosen on the computer.
    case fromApp = "from-app"
    /// Absent, or a value this build can't name. Deliberately not folded into `manual`: claiming a
    /// user chose a place when we don't know that is worse than saying nothing.
    case unknown

    /// Total, never throws — an unrecognised string reads as `unknown` rather than failing a whole
    /// report's decode. A newer agent must never break an older app.
    init(reported: String) {
        self = GpsProvenance(rawValue: reported) ?? .unknown
    }

    /// `nil` for `unknown`, which is the signal to draw no source row at all rather than one
    /// reading "unknown" — a word that describes our parser, not the customer's situation.
    var label: LocalizedStringKey? {
        switch self {
        case .vpnSync: return "Matched to your VPN"
        case .manual: return "Manual"
        case .fromApp: return "GeoSpoof"
        case .unknown: return nil
        }
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
    /// The distance along the route this run **actually began at**, after the agent's clamping.
    ///
    /// Two things to get right about this field, both of which the contract states outright.
    ///
    /// **Presence is a capability signal.** The agent always populates it while a route plays, including
    /// `0` for a run that started at the first point — so absence means exactly one thing: an agent too
    /// old to have the field. That is what `GpsMotionSample.seekSupported` reads, and it is why we don't consult
    /// `agentVersion`: the contract's rule is that a host learns what an agent supports from what it
    /// echoes, which is the same rule `deliveredMotion` already follows.
    ///
    /// **Read presence, never equality.** This and `travelledM` can legitimately disagree on the first
    /// beat, so comparing it against the seek we asked for would report a false failure. They part
    /// company on two shapes: a leg whose endpoints share a timestamp (a teleport, so there is no
    /// position inside it to land on and the seek resolves to a boundary), and a timeline that stops
    /// being trustworthy partway, where the seek clamps to the usable prefix.
    var startTravelledM: Double?

    enum CodingKeys: String, CodingKey {
        case id, name, paused, finished
        case startedAt = "started_at"
        case travelledM = "travelled_m"
        case totalM = "total_m"
        case remainingSecs = "remaining_secs"
        case speedDefaulted = "speed_defaulted"
        case startTravelledM = "start_travelled_m"
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
    /// Where the applied coordinate came from, as the agent wrote it.
    ///
    /// Kept as the raw `String` and read through `provenance`, matching how `motionRaw` and
    /// `transportRaw` are carried: a value this build can't name must stay decodable, and the
    /// typed accessor is the only thing callers should use.
    var provenanceRaw: String
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

    /// Whether this report is a computer stating it is *actually moving this device's GPS right
    /// now* — as opposed to a switch being on, which is a request and proves nothing.
    ///
    /// The single definition of that question, because there are now two screens asking it and
    /// they must never disagree. `GpsView.phase` reaches its `.spoofing` case through this, and
    /// the Location summary reads it directly. A second, hand-rolled conjunction on the summary
    /// side is how one screen ends up claiming a spoof the other knows isn't happening — and the
    /// app has already shipped that bug once, showing a stale place name while the real GPS had
    /// gone back to where it started.
    ///
    /// Freshness is deliberately **not** part of this. A report is a claim about the moment it was
    /// written, and whether that moment is recent enough belongs to whoever holds the roster —
    /// `GpsStatusStore.isStale`. Folding it in here would need a clock inside a `Codable` value and
    /// would make the property untestable without one. Every caller must check both.
    var isDeliveringSpoof: Bool {
        pro && connected && session == "spoofing"
    }

    enum CodingKeys: String, CodingKey {
        case version
        case agentVersion = "agent_version"
        case connected, device, session, remediation, error, pro
        case provenanceRaw = "provenance"
        case updatedAt = "updated_at"
        case motionRaw = "motion"
        case transportRaw = "transport"
        case pairingRepairNeeded = "pairing_repair_needed"
        case route, steering
    }

    /// Whether this computer is actively driving a location right now.
    var isSpoofing: Bool { session == "spoofing" }

    /// Where the applied coordinate came from. Only half the "what's driving this" answer — see
    /// `GpsDriver`.
    var provenance: GpsProvenance { GpsProvenance(reported: provenanceRaw) }

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
    /// The owning computer's own name, for the one row that says who is driving this phone.
    ///
    /// Published separately because the name lives on `GpsController` while `status` is the
    /// `GpsStatus` inside it — so a view holding only the status has no way back to the identity.
    @Published private(set) var ownerName: String?

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
        ownerName = owner?.name
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
struct GpsRouteProgress: Equatable {
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
struct GpsSteeringDetail: Equatable {
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
/// Internal rather than `private` so `GpsDriver` can take it as a parameter and the derivation can
/// be unit tested. The types are still confined to this module.
enum GpsMotionDetail: Equatable {
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

/// **The single answer to "what is driving my iPhone's GPS right now?"**
///
/// This exists because the app modelled that question on two unconnected axes and rendered them in
/// two different sections, so the screen never actually stated it. `GpsStatus.provenance` says where
/// the coordinate came from; `GpsMotionDetail` says what is being done to it. A customer reading
/// "Source: Manual" in one section and "Following route" in another has to join those themselves.
///
/// The join is not a merge, because the two axes are not orthogonal: **motion supersedes
/// provenance.** While a route plays, the route *is* the source — the coordinate it started from is
/// no longer what the device is reporting, so naming the original pick would be stale at best. That
/// rule is expressed structurally here rather than by convention: `still` is the only case that
/// carries a `GpsProvenance` at all, so it is not possible to render a provenance while a route or a
/// vector is running.
///
/// Derived on demand and never stored. No wire field, no persistence, nothing for a second writer to
/// disagree with — it is a reading of state that already exists.
enum GpsDriver: Equatable {
    /// A route is advancing the position.
    ///
    /// `name` is carried for identity — it is what makes two drivers playing different routes unequal —
    /// and deliberately **not** rendered by the Source row, which answers "what is driving this" with
    /// "Route" and leaves "which route" to the section that owns it. May be absent: a GPX need not
    /// carry a name.
    case route(name: String?)
    /// A steering vector is being integrated.
    case steering
    /// One coordinate is being held, from `provenance`. Holding is not idleness — the device is
    /// actively being told where it is.
    case still(GpsProvenance)
    /// We asked for a mode and this computer is not delivering it, so what the device is doing is
    /// not what the customer asked for and the row must not imply otherwise.
    case undelivered(asked: GpsMotionMode)
    /// Nothing is driving the device's GPS. Distinct from `still`.
    case notDriving

    /// Derive the driver from the two axes.
    ///
    /// `motion` is `nil` when no computer is spoofing, which is the only route to `notDriving` —
    /// note that a `nil` motion is *not* the same as `.still`, and conflating them would report a
    /// held coordinate as nothing happening.
    init(motion: GpsMotionDetail?, provenance: GpsProvenance) {
        switch motion {
        case .none:
            self = .notDriving
        case .some(.still):
            self = .still(provenance)
        case .some(.route(let progress)):
            self = .route(name: progress.name)
        case .some(.steering):
            self = .steering
        case .some(.notDelivered(let asked)):
            self = .undelivered(asked: asked)
        }
    }

    /// Decorative — every case's state is also in `title`, so views hide this from accessibility.
    var symbol: String {
        switch self {
        case .route: return "figure.walk.motion"
        case .steering: return "dot.arrowtriangles.up.right.down.left.circle"
        case .still(let provenance):
            return provenance == .vpnSync ? "network.badge.shield.half.filled" : "mappin.circle.fill"
        case .undelivered: return "exclamationmark.triangle.fill"
        case .notDriving: return "location.slash"
        }
    }

    /// The phrase that answers the question. `nil` only when there is genuinely nothing to say —
    /// a held coordinate whose provenance this build can't name — which the view reads as "draw no
    /// row", never as "draw an empty one".
    /// Deliberately reuses existing catalog keys — `Route`, `Steering`, `Not delivered` — rather than
    /// minting near-duplicates like "Following a route". This row reads as a *value* ("Source: Route"),
    /// and the section below already carries the stateful sentence, so a second phrasing of the same
    /// fact would be two keys a translator has to tell apart for no benefit.
    var title: LocalizedStringKey? {
        switch self {
        case .route: return "Route"
        case .steering: return "Steering"
        case .still(let provenance): return provenance.label
        case .undelivered: return "Not delivered"
        // No row, for the same reason an unnameable provenance draws none: if nothing is driving the
        // device's GPS there is no source to name, and a row reading "Nothing" is a word we invented
        // to fill a space rather than an answer to anything.
        case .notDriving: return nil
        }
    }

    // No `detail`. This used to carry the route's name as a second line under the title, which made
    // the Source row two lines tall to repeat something the Route section states directly below it —
    // and it was the *only* two-line row in a block of one-line rows, so it set the height for all of
    // them. Source answers "what is driving this", and "Route" is the whole of that answer; *which*
    // route is a different question, already answered on the same screen.

    /// Whether this driver is a problem rather than a state. Drives tint, so the row can read as a
    /// warning without a second source of truth for "is something wrong".
    var isProblem: Bool {
        if case .undelivered = self { return true }
        return false
    }
}

/// A motion control the user has tapped, whose effect no report has confirmed yet.
///
/// ## Why this exists rather than optimistic state
///
/// Tapping Pause writes `desired.json` immediately, but nothing on screen could change until the agent
/// read it (about a second) and our own roster poll came round (up to three more). For up to four
/// seconds the button looked untouched, which reads as a press that didn't register — so people press
/// again.
///
/// The obvious fix is to flip the label to "Route paused" optimistically and revert on failure. That is
/// the one thing this feature must not do. Every progress figure on this screen comes from a
/// gate-confirmed report precisely so the UI can never claim a state the device isn't in, and the design
/// explicitly rejected showing stale progress because a frozen bar is indistinguishable from a live one
/// at a glance. An optimistic "paused" is the same lie with a shorter fuse.
///
/// So the *control* reports the request and the *state* keeps reporting the device. "Pausing…" is true
/// the moment it's tapped and stays true until the agent answers, which is all the reassurance the press
/// needed.
///
/// ## Why it needs a timeout
///
/// `pauseGpsRoute()` and friends return nothing to fail with — they write local state, and the real
/// failure is the agent never echoing it. That case had no representation at all: the button simply
/// stayed as it was forever. The timeout converts silence into a sentence.
struct GpsPendingAction: Equatable {
    enum Kind: Equatable {
        case pause
        case resume
        case restart
        case stop
        case start

        /// What the control says while the request is outstanding. Present continuous on purpose: it
        /// describes the request in flight, never the state it is asking for.
        var progressLabel: LocalizedStringKey {
            switch self {
            case .pause: return "Pausing…"
            case .resume: return "Resuming…"
            case .restart, .start: return "Starting…"
            case .stop: return "Stopping…"
            }
        }
    }

    var kind: Kind
    var startedAt: Date

    /// Whether the report now shows what this request asked for.
    ///
    /// Read from the gate-confirmed motion detail, so a request is only ever resolved by a report that
    /// actually describes the run we asked about.
    func isConfirmed(by motion: GpsMotionDetail?) -> Bool {
        switch kind {
        case .pause:
            if case .route(let progress) = motion { return progress.paused }
            return false
        case .resume:
            if case .route(let progress) = motion { return !progress.paused && !progress.finished }
            return false
        case .restart, .start:
            // A replay is confirmed by the gate accepting progress for the *new* run marker, which is
            // what `confirmedRouteProgress` already enforces — so a `.route` that isn't finished is
            // this run rather than the one it replaced.
            if case .route(let progress) = motion { return !progress.finished && !progress.paused }
            return false
        case .stop:
            // Stopping clears the mode, so anything that isn't a route is confirmation.
            if case .route = motion { return false }
            return true
        }
    }
}

/// Internal rather than `private` so `replacesScreenWithPitch` — the invariant that keeps the master
/// switch reachable — can be asserted by a test rather than only reasoned about.
enum GpsPhase: Equatable {
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
    /// A chosen computer is taking over and neither machine has reported on it yet. Carries the incoming
    /// computer's name, which is the only thing worth saying during the wait.
    ///
    /// **Transitional and bounded.** It outranks `lost` and `setupNeeded` for `GpsEchoGate.deliveryGrace`
    /// seconds and then stops, so a handover that genuinely fails still reports itself — with the agent's
    /// own remediation and its cancel affordance — rather than hiding behind a permanent spinner. See
    /// `SpoofController.controllerSwitchedAt`.
    case switchingController(String)
    case ready
    case spoofing(GpsMotionDetail)
    case lost

    /// Whether this phase replaces the whole screen with the Pro pitch instead of reporting state.
    ///
    /// **`notPro` is the only phase allowed to.** Every other phase must render the zones, because
    /// `syncZone` is what carries the Sync toggle — the single control that returns the device's real GPS —
    /// and a phase that skips the zones takes that control away with it.
    ///
    /// This is a named, tested property rather than an inline `if case` because the guarantee has
    /// already been broken twice by omission. `chooseController` and `entitlementRejected` each
    /// rendered their own section and no toggle, so a customer with two computers and no pick, or one
    /// whose entitlement the agent refused, could not switch device GPS off — their real system GPS
    /// stayed moved with no way back inside the app. Both were invisible in review because nothing
    /// stated the rule; the phase simply listed the sections it happened to want.
    ///
    /// Adding a phase now means answering this question, and the test in `GpsMotionModelTests` fails
    /// if a new one answers `true`.
    var replacesScreenWithPitch: Bool { self == .notPro }
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
/// Puts one route in the library the first time this build runs, so a customer opening Routes meets a
/// real route instead of an empty screen and an Import button.
///
/// **Why it lives here rather than on `GpsRouteStore`.** The store is in shared code, compiled for the
/// widget and macOS too; `GpsGpxImporter` is iOS-only, because parsing GPX is part of the iOS GPS surface.
/// Seeding needs both, so it belongs on the iOS side of that boundary — the same split
/// `motionPositionProvider` exists to keep, where the shared layer owns storage and the iOS layer owns the
/// formats.
///
/// **Once ever, and deletion is final.** The flag guarantees that, and it is deliberately *not* a check for
/// an empty library: someone who deletes the sample has said they don't want it, and putting it back on the
/// next launch would be the app arguing with them. Keying off a flag rather than off "is this a fresh
/// install" is also what delivers it to existing customers on the update that ships it — they are the ones
/// who have already seen the empty screen.
///
/// **Refusals are silent and permanent.** A missing or unparseable resource is a build mistake rather than
/// a customer problem, and a full library belongs to someone who needs no help discovering routes. The flag
/// is set either way, so a broken bundle costs one file read rather than one on every launch.
nonisolated enum GpsSampleRoute {
    private static let seededKey = "gpsSampleRouteSeeded"
    /// Bundled resource name, and the fallback title. The GPX carries its own `<name>` — "Central Park
    /// Loop" — so the fallback is only reached if that were ever stripped.
    private static let resource = "Central_Park_Loop"
    private static let displayName = "Central Park Loop"

    @discardableResult
    static func seedIfNeeded(
        defaults: UserDefaults = .standard,
        bundle: Bundle = .main
    ) -> Bool {
        guard !defaults.bool(forKey: seededKey) else { return false }
        defaults.set(true, forKey: seededKey)

        guard let url = bundle.url(forResource: resource, withExtension: "gpx"),
              let data = try? Data(contentsOf: url) else {
            Log.bridge.warn("route library: sample route missing from the bundle")
            return false
        }
        guard case .success(let route) = GpsGpxImporter.route(from: data, fallbackName: displayName) else {
            Log.bridge.warn("route library: sample route failed to parse")
            return false
        }
        let saved = GpsSavedRoute(adopting: route, source: .sample, fallbackName: displayName)
        if let failure = GpsRouteStore.shared.save(saved) {
            Log.bridge.warn("route library: sample route not saved (\(String(describing: failure)))")
            return false
        }
        Log.bridge.info("route library: seeded sample route")
        return true
    }
}

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

    /// Where to send users to get the desktop app.
    private let downloadURL = AppLink.site("/gps", campaign: "gps-download")
    /// The same page as `downloadURL`, reached for a different reason — so it is tagged differently and
    /// localized where that one isn't. Both deliberate:
    ///
    /// **A separate campaign** because `gps-download` answers "how many people went to get the desktop
    /// app", and `DeviceGpsPitch.desktopAppURL` shares that tag precisely so the number stays whole. Someone
    /// reading up on the feature has not started installing anything, and counting them as if they had would
    /// quietly inflate the one figure that decides whether setup is working.
    ///
    /// **`localized: true`** because this link's whole job is to be read, so it should land on the page in
    /// the reader's own language — the same reason `/verify` and `/activate` pass it. The download link
    /// doesn't, and that asymmetry is fine: its job ends at a binary, which is the same file in every
    /// language.
    private let learnMoreURL = AppLink.site("/gps", campaign: "gps-learn-more", localized: true)
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
    /// The playing route's name **as the library currently spells it**, or `nil` when it isn't a
    /// library route.
    ///
    /// Exists because a route's name has three copies and renaming only updates one of them. The
    /// library entry is the one the customer edits. `route.json` holds a copy taken when playback
    /// started, and the agent echoes that copy back in every report — so both of this tab's name
    /// readers were quoting a snapshot. Nothing refreshed it either: `name` is deliberately excluded
    /// from the content hash so a rename can't restart a run, which also means `routeId` doesn't move
    /// and `refreshLoadedRoute`'s trigger never fires. The stale name then outlived relaunches,
    /// because the file it came from did.
    ///
    /// Resolved from `savedRouteId` — the entity id, which exists precisely so "which library entry is
    /// playing" survives the content id changing — and read off the summaries index that
    /// `refreshLoadedRoute` already loads, so it costs nothing extra.
    @State private var activeRouteName: String?
    /// How many routes the library holds. Refreshed on appearance and after an import, which are the
    /// only moments it can change while this tab is on screen — deleting happens on the library screen,
    /// whose own `onAppear` this tab's re-appearance follows.
    @State private var savedRouteTally = 0

    /// The motion control tapped but not yet confirmed by a report. See `GpsPendingAction`.
    @State private var pendingAction: GpsPendingAction?
    /// Set when a request went unanswered for `pendingTimeout`. Shown inline rather than as an alert —
    /// the condition self-corrects the moment a report arrives, and a modal for something that may
    /// resolve a second later is worse than a line of text that quietly goes away.
    @State private var pendingTimedOut = false
    /// Drives the tap haptic. Incremented rather than toggled so two taps in a row both fire.
    @State private var tapFeedback = 0
    /// Drives the confirmation haptic, so the press and its result both land in the hand.
    @State private var confirmFeedback = 0
    /// The accelerated poll that runs while a request is outstanding.
    @State private var burstTask: Task<Void, Never>?
    /// Whether the "going out without your computer" explainer is up. See `goodToKnowSection`.
    @State private var showOfflineHold = false
    /// The route just imported, pushed so the customer lands on it.
    ///
    /// Driven from an optional rather than a `NavigationLink`, because the push has to happen from code —
    /// an import can arrive from AirDrop, Mail or a share sheet with nothing on screen to have been
    /// tapped. Mirrors `GpsRouteLibraryView.selected`, which solves the same problem for a row tap that
    /// has to load an entry before it can navigate.
    @State private var importedRoute: GpsSavedRoute?
    /// Whether to ask about turning Sync on before starting a route. See `syncStartDialog`.
    @State private var confirmSyncStart = false
    /// Gates the review report, same key `SpoofControlPanel` uses. Asking someone to rate the app before
    /// they have finished setting it up is asking about something they haven't seen work.
    @AppStorage("spoofOnboardingCompleted") private var reviewOnboardingCompleted = false
    /// Presents the system prompt from this tab as well as Home — see the note on `requestReview` below.
    @ObservedObject private var review = ReviewPrompt.shared

    /// How long to wait for the agent to echo a request before saying it didn't.
    ///
    /// Generous against the agent's own roughly one-second reconcile pass, because the link can be
    /// wireless and a slow answer is not a failed one.
    private static let pendingTimeout: TimeInterval = 10
    /// Poll interval while a request is outstanding. The 3s display timer is what made a confirmed
    /// action take up to four seconds to appear; this is the half of the latency we actually own.
    private static let burstInterval: TimeInterval = 0.4

    var body: some View {
        AdaptiveNavigationStack {
            Form {
                // `notPro` is the one phase that replaces the screen rather than changing it. It is
                // a different screen — an explanation and an ask — and there is nothing to report
                // the state of, so the zones below don't apply.
                //
                // Asked through `replacesScreenWithPitch` rather than matched inline, so the rule
                // that every other phase renders zone 4 is a single named thing a test can hold.
                if phase.replacesScreenWithPitch {
                    proPitchSection
                    compatibilitySection
                } else {
                    // Four zones, always in this order, always present. **Phase changes the content
                    // of a zone; it never changes the set of zones.**
                    //
                    // This replaced a `switch` that chose a different set of sections per phase, and
                    // the reason is not tidiness. That shape produced dead ends: gating happened as
                    // a side effect of which sections a phase happened to render, so an action was
                    // reachable or not by accident. Two phases — `chooseController` and
                    // `entitlementRejected` — rendered no sync toggle at all, which meant a customer
                    // with two computers and no pick, or one whose entitlement the agent refused,
                    // **could not turn device GPS off**. Their real system GPS stayed moved with no
                    // way back inside the app.
                    //
                    // That is the same failure the stale-phase fix already had to correct once. An
                    // unconditional `syncZone` makes the whole class unreachable rather than handled
                    // correctly case by case, which is why the invariant above is worth keeping even when
                    // a zone has little to say.
                    syncZone
                    statusZone
                    motionZone
                    routesZone
                    connectionZone
                }
            }
            .groupedFormStyle()
            .tint(.brand)
            .navigationTitle("GPS")
            // Where an import lands. Attached to the `Form` rather than to any row, because the push has
            // no originating control — the file can arrive from AirDrop, Mail or a share sheet while this
            // tab merely happens to be the one on screen.
            //
            // `onDeleted`-equivalent is `refreshLoadedRoute`, the same closure the tab's own route row
            // passes, so a rename or delete made on the pushed screen is reflected here on the way back.
            .navigationDestination(item: $importedRoute) { entry in
                GpsRouteDetailView(controller: controller, entry: entry) {
                    refreshLoadedRoute()
                }
            }
            // Two haptics, deliberately: one the moment a control is pressed, one when the agent
            // confirms it. The press one is what was missing — with a one-to-four-second gap before
            // anything on screen moved, a silent tap read as a tap that didn't land. The confirmation
            // one closes the loop, so the answer arrives in the hand as well as on the screen.
            //
            // The system already respects the customer's haptic settings, so there is nothing to gate
            // here. `.selection` for the press rather than `.impact`: this is choosing a control, not
            // simulating a physical collision.
            .sensoryFeedback(.selection, trigger: tapFeedback)
            .sensoryFeedback(.success, trigger: confirmFeedback)
            .syncStartDialog(isPresented: $confirmSyncStart) {
                controller.setDeviceGpsEnabled(true)
                perform(.start) { controller.restartGpsRoute() }
            }
            // Resolves a request confirmed by the ordinary 3-second tick, not just by the poll burst —
            // so a slow answer that arrives after the burst gave up still clears the spinner.
            .onChange(of: phase) { _, _ in
                resolvePendingAction()
                // A route that ends on its own is never "stopped" — the agent deliberately leaves it in
                // place and the device holds the final point — so `stopGpsRoute`'s name resolution never
                // fires for it. Without this, finishing a route left the Home tab showing bare
                // coordinates until the customer pressed Stop, which they have no reason to do.
                //
                // Cheap to call repeatedly: `resolveLocationNameIfMissing` returns immediately once a name
                // exists or a request is in flight.
                if case .spoofing(.route(let progress)) = phase, progress.finished {
                    controller.resolveLocationNameIfMissing()
                    // A journey played to completion is the strongest success this feature has. Reported
                    // in addition to the `.spoofing` occasion below, not instead of it — `ReviewPrompt`
                    // debounces, so the overlap costs nothing and missing it costs the occasion.
                    evaluateReviewPrompt()
                }
                switch phase {
                case .spoofing:
                    evaluateReviewPrompt()
                case .lost, .entitlementRejected:
                    // Visibly broken from the customer's side: their computer vanished mid-session, or
                    // their purchase couldn't be confirmed. Either is a bad moment to ask for five stars.
                    noteReviewTrouble()
                // `.switchingController` is neither, deliberately. It is not a success — nothing is
                // confirmed yet — and it is not trouble either: the customer asked for this and it is
                // proceeding. If the handover does fail, the phase becomes `.setupNeeded` or `.lost` when
                // the grace window closes, and *that* pass reports the trouble.
                case .notPro, .waitingForComputer, .chooseController, .setupNeeded, .ready,
                     .switchingController:
                    break
                }
            }
            .onDisappear {
                // Leaving the tab abandons the watch. The request itself is already written to
                // `desired.json` and the agent will apply it regardless — this only stops us polling
                // fast for an answer nobody is looking at.
                burstTask?.cancel()
                burstTask = nil
                pendingAction = nil
                pendingTimedOut = false
            }
            .onAppear {
                refreshStatus()
                refreshLoadedRoute()
                claimPendingRouteImport()
                evaluateReviewPrompt()
            }
            // Keyed on the route identity rather than on a timer: the file only changes when the
            // route does, and the id is derived from its content so any change moves it.
            .onChange(of: controller.motionState.routeId) { _, _ in refreshLoadedRoute() }
            // The entity id as well as the content id. A rename moves neither — that is the whole
            // point of `name` being outside the hash — so this does not catch the rename itself;
            // `onAppear` does, when the tab comes back from the library the rename happened in. This
            // catches a switch between two saved routes that happen to share content, where `routeId`
            // is identical and only the library entry differs.
            .onChange(of: controller.motionState.savedRouteId) { _, _ in refreshLoadedRoute() }
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
                // A resident process can go days without a fresh `onAppear`, and this app stays resident.
                // Without this, a customer who leaves the tab open would stop accruing occasions entirely —
                // the same gap `SpoofControlPanel` watches `scenePhase` for.
                evaluateReviewPrompt()
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
        // Outside the `AdaptiveNavigationStack` on purpose — the review action is reported to silently do
        // nothing when fired from a view nested inside a navigation container, which is the same reason
        // `LocationView` attaches it at its own root.
        //
        // **A second presenter, deliberately.** `LocationView` already has one, and `ReviewPrompt` supports
        // exactly this: `claimForPresentation(token:)` lets the first presenter to claim a token win and
        // the rest no-op, precisely so more than one can be attached. Without this the fix above would be
        // half a fix — a customer who only ever opens the GPS tab would accrue occasions and then depend on
        // a non-visible tab's `onChange` to actually present, which is not a thing to bet a rating on.
        .requestReview(on: review.token)
    }

    /// Reload the roster for the current selection, then keep the selection sensible as the
    /// roster changes (auto-drive a sole computer; drop a selection whose computer has left).
    private func refreshStatus() {
        Task { @MainActor in await reloadStatus() }
    }

    /// The awaitable half of `refreshStatus`, so the poll burst can space its reads rather than
    /// launching overlapping tasks that pile up on a slow read.
    @MainActor
    private func reloadStatus() async {
        // `reload` reads + decodes the roster off the main thread, then publishes on the
        // main actor; `reconcileSelection` then runs against that fresh roster.
        await statusStore.reload(selectedId: controller.selectedControllerId)
        reconcileSelection()
    }

    // MARK: Motion actions

    /// Run a motion control: fire the haptic, perform it, and start watching for the agent to agree.
    ///
    /// One funnel for every playback control, so none of them can be added later without the feedback.
    /// The order matters only in that the haptic is first — it is the part that has to feel instant, and
    /// it costs nothing to make it so.
    private func perform(_ kind: GpsPendingAction.Kind, _ action: () -> Void) {
        tapFeedback += 1
        pendingTimedOut = false
        // Starting a route needs Sync on to do anything at all — `desired.json`'s `enabled` is
        // `deviceGpsEnabled && …`, so with it off the agent is correctly told to do nothing. Rather than
        // running an action that cannot work, ask: the dialog turns Sync on and starts in one tap.
        //
        // Only `.start` takes this path. Pause, Resume, Play Again and Stop are all reachable only while
        // a route is already playing, which requires Sync to be on already.
        if kind == .start, !controller.deviceGpsEnabled {
            confirmSyncStart = true
            return
        }
        action()
        // **Don't watch for an answer we already know isn't coming.**
        //
        // `desired.json`'s `enabled` is `deviceGpsEnabled && …`, so with Sync off the agent is being
        // told, correctly, to do nothing — and no amount of waiting will produce a report that says
        // otherwise. Entering a pending state here spun for ten seconds and then blamed the computer
        // for something the app could see at the moment of the tap.
        //
        // The action still runs: arming a route with Sync off is a reasonable order to work in, and the
        // section footer says why nothing is moving.
        guard controller.deviceGpsEnabled else { return }
        pendingAction = GpsPendingAction(kind: kind, startedAt: Date())
        startPollBurst()
    }

    /// Poll fast while a request is outstanding.
    ///
    /// The display timer runs every three seconds, which is right for idle observation and wrong for the
    /// moment just after a tap — it was most of the delay people were feeling. This closes that half of
    /// the gap; the agent's own pass is the rest and isn't ours to shorten.
    private func startPollBurst() {
        burstTask?.cancel()
        burstTask = Task { @MainActor in
            while !Task.isCancelled, let pending = pendingAction {
                await reloadStatus()
                resolvePendingAction()
                // Re-read: `resolvePendingAction` may have just cleared it.
                guard pendingAction != nil else { break }
                if Date().timeIntervalSince(pending.startedAt) >= Self.pendingTimeout {
                    // Silence is the only failure mode these controls have — they write local state and
                    // return nothing — so a timeout is what turns "nothing happened" into a sentence.
                    pendingAction = nil
                    pendingTimedOut = true
                    break
                }
                try? await Task.sleep(nanoseconds: UInt64(Self.burstInterval * 1_000_000_000))
            }
            burstTask = nil
        }
    }

    /// Clear the outstanding request once a report shows what it asked for, and buzz to say so.
    ///
    /// Also called from `onChange(of: phase)`, so a request confirmed by the ordinary 3-second tick
    /// resolves even if the burst has already given up.
    // MARK: Review prompt

    /// Report a genuinely positive device-GPS moment to `ReviewPrompt`, which owns all the throttling.
    ///
    /// ## Why this had to exist
    ///
    /// `SpoofControlPanel.evaluateReviewPrompt()` was the app's **only** caller of
    /// `recordSignificantEvent()`, and it requires `controller.isActiveInSafari`. So a customer who bought
    /// GeoSpoof for device GPS, never switched the Safari extension on, and replays routes every day could
    /// never reach the threshold — **the people who pay for the app were the ones it could not ask.** The
    /// App Store rating those customers would leave is also what converts the next ones, so this was a
    /// revenue bug wearing the costume of a missing call.
    ///
    /// ## Why this is a new trigger rather than a looser gate
    ///
    /// `.kiro/steering/review-prompts.md` is explicit: add triggers from more genuine success points, never
    /// loosen the gate. Home's Safari condition is correct *for a browser customer* and is untouched. This
    /// adds the device-GPS equivalent of the same standard — a computer confirming, through a fresh report,
    /// that it is actually driving this phone. That is the same class of evidence `isActiveInSafari` is:
    /// the feature observably working, not merely switched on.
    ///
    /// Over-reporting is harmless by design — `recordSignificantEvent` debounces occasions four hours
    /// apart — and under-reporting is what left this whole audience out.
    private func evaluateReviewPrompt() {
        guard reviewOnboardingCompleted else { return }
        // `.spoofing` is only reachable from a fresh report whose session really is spoofing, so this
        // cannot fire on a stale report or a computer that isn't driving anything.
        guard case .spoofing = phase else { return }
        ReviewPrompt.shared.recordSignificantEvent()
    }

    /// Quiet the review ask when device GPS is visibly broken.
    ///
    /// Suppression on state **we infer ourselves** — a lost computer, an entitlement the agent refused, a
    /// route we couldn't read. That is explicitly allowed and encouraged; what is forbidden is asking the
    /// customer to declare whether they are happy and routing them accordingly. We never ask.
    ///
    /// Recorded as a timestamp rather than checked as live state, because these clear: a computer that
    /// dropped for a minute shouldn't earn a permanent veto, and asking for a review an hour after the app
    /// broke on someone is how you earn the one-star.
    private func noteReviewTrouble() {
        ReviewPrompt.shared.noteTrouble()
    }

    /// What a report currently says is moving the device, or `nil` when nothing is spoofing.
    ///
    /// `nil` is a meaningful input rather than a missing one — `GpsPendingAction.isConfirmed(by:)` reads
    /// it as "no route is running", which confirms a `stop` and confirms nothing else.
    private var reportedMotion: GpsMotionDetail? {
        if case .spoofing(let motion) = phase { return motion }
        return nil
    }

    /// Clear the outstanding request once a report shows what it asked for, and buzz to say so.
    ///
    /// **One decision, made by the pure function.** This previously special-cased the not-spoofing phase
    /// itself and cleared *every* pending kind there, which broke Start Route outright: for the second
    /// or two after the tap the phase is still `.ready`, so the burst's first read threw the request
    /// away and the label snapped back from "Starting…" to "Start Route". It also meant the timeout
    /// could never fire, so a start that genuinely never happened said nothing at all.
    ///
    /// The bug was not in `isConfirmed(by:)` — that was correct and tested for exactly this input. It
    /// was a second copy of the decision sitting next to it and disagreeing. Routing everything through
    /// the tested function removes the shape of the mistake, not just this instance of it.
    ///
    /// Also called from `onChange(of: phase)`, so a request confirmed by the ordinary 3-second tick
    /// resolves even if the burst has already given up.
    private func resolvePendingAction() {
        guard let pending = pendingAction else { return }
        guard pending.isConfirmed(by: reportedMotion) else { return }
        pendingAction = nil
        confirmFeedback += 1
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
        // **Before `lost` and `setupNeeded`, both of which a handover would otherwise trip.** A switch has
        // to reach two computers before either can report on it, and until then the freshest status from
        // the one just chosen was written while the other still owned the device — so it reads as not
        // connected, or as out of session, and its remediation names the other machine. Shown literally,
        // that turns a deliberate choice into an orange fault offering to cancel a handover that is
        // proceeding perfectly normally.
        //
        // Deliberately *not* placed above the staleness guard: if the incoming computer isn't in the
        // roster at all there is no name to show and nothing has started, and "Waiting for your computer"
        // is the honest answer.
        if isSwitchoverPending(s), let name = statusStore.ownerName {
            return .switchingController(name)
        }
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
        // Reached only once `pro` and `connected` are known true by the guards above, so this is
        // exactly the old `s.session == "spoofing"` test — routed through the shared property so
        // the Location summary and this switch cannot drift apart. See `isDeliveringSpoof`.
        if s.isDeliveringSpoof { return .spoofing(motionDetail(s)) }
        if !s.remediation.isEmpty { return .setupNeeded(s.remediation) }
        return .ready
    }

    /// Whether a controller handover is young enough that `s` cannot speak to it yet.
    ///
    /// Three conditions, each load-bearing:
    ///
    ///   * **A switch was actually requested.** `controllerSwitchedAt` is `nil` for the automatic
    ///     single-computer case, so an ordinary setup never enters this state.
    ///   * **It is inside `GpsEchoGate.deliveryGrace`.** The same 10 s the motion echo gate uses, and for
    ///     the same reason — it is bracketed by the agent's own worst-case publish interval, so a request
    ///     can legitimately go unacknowledged that long. Past it, silence means something and the real
    ///     phase takes over.
    ///   * **The report doesn't already show a working session.** A handover that lands immediately should
    ///     show the spoof, not a spinner for a wait that is over. This is also what makes the state
    ///     self-clearing: no confirmation plumbing, and nothing has to remember to reset the stamp.
    ///
    /// A negative age — the system clock moved backwards after the stamp — exits the state rather than
    /// extending it. That is the safe direction here: showing the truth early is recoverable, whereas a
    /// clock that jumped back an hour would otherwise pin a spinner over a real fault for an hour. Note
    /// this is the *opposite* choice from `requestTooYoungToJudge`, which suppresses on a negative age —
    /// there the suppressed thing was an alarming message, here it is the alarm itself.
    private func isSwitchoverPending(_ s: GpsStatus) -> Bool {
        guard let switchedAt = controller.controllerSwitchedAt else { return false }
        let age = Date().timeIntervalSince(switchedAt)
        guard age >= 0, age < GpsEchoGate.deliveryGrace else { return false }
        // `pro` as well as `connected`: an incoming computer that refuses the entitlement is a real
        // problem and must not be dressed as a handover in progress.
        return !(s.pro && s.connected)
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
                    // The agent echoes the name it was handed when the run began, so a rename since
                    // then is invisible to it. The library is authoritative — see `activeRouteName`.
                    name: activeRouteName ?? route.name,
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

    // MARK: Zones
    //
    // The five permanent regions of this tab. Each one owns a question, and the phase decides only
    // what that zone answers with — never whether the zone exists. See `body` for why.
    //
    //   1. syncZone        — the master switch: is device GPS on at all
    //   2. statusZone      — what is happening, and what is driving it
    //   3. motionZone      — the route or vector in play, and the controls for it
    //   4. routesZone      — getting a route in, and the saved library
    //   5. connectionZone  — which computer is in charge

    /// **Zone 1.** The master switch, and the first thing on the screen.
    ///
    /// It leads for the same reason Location Protection leads on Home: it is the one control that decides
    /// whether any of this is happening, so it answers the question a customer arrives with. It used to sit
    /// at the bottom, under the route controls and the computer picker, where the switch governing the
    /// whole feature was the last thing you found.
    ///
    /// **Unconditional outside `notPro`, and that is load-bearing rather than tidy.** This zone existing in
    /// every phase is what guarantees device GPS can always be switched off, whatever else has gone wrong —
    /// the guarantee `GpsPhase.replacesScreenWithPitch` names and `GpsPresentationRuleTests` asserts. It
    /// moved up here from `connectionZone` and the invariant moved with it; the test is written against the
    /// phase rather than a position, so it holds either way.
    @ViewBuilder
    private var syncZone: some View {
        syncToggleSection
    }

    /// **Zone 2.** What is happening right now, and what is driving it.
    ///
    /// Every phase has an answer to that, including the unhappy ones, so this zone is never empty
    /// outside `notPro`. The unhappy answers are the *only* content here — a phase that can't
    /// describe a live spoof describes the thing blocking it instead, which is the same question from
    /// the customer's side.
    @ViewBuilder
    private var statusZone: some View {
        switch phase {
        case .notPro:
            // Handled in `body`, which replaces the whole screen. Unreachable here.
            EmptyView()
        case .waitingForComputer:
            aboutSection
            lastKnownMotionSection
            waitingSection
        case .chooseController:
            chooseControllerSection
        case .switchingController(let name):
            switchingControllerSection(name)
        case .setupNeeded(let message):
            setupNeededSection(message)
        case .entitlementRejected:
            entitlementRejectedSection
        case .ready:
            connectedSection(active: false, motion: nil)
        case .spoofing(let motion):
            connectedSection(active: true, motion: motion)
        case .lost:
            lostSection
            lastKnownMotionSection
        }
    }

    /// **Zone 3.** The route or vector in play, and the controls that act on it.
    ///
    /// Empty when nothing is loaded and nothing is running, which is the honest answer — an empty
    /// zone here is not a gap, it is "no motion". The one thing it must never do is disappear while a
    /// request is outstanding: a route asked for just before the computer went away needs its
    /// withdrawal reachable, and that is what the stale branch below is for.
    @ViewBuilder
    private var motionZone: some View {
        switch phase {
        case .notPro, .chooseController, .entitlementRejected:
            EmptyView()
        case .waitingForComputer, .lost, .setupNeeded, .switchingController:
            // No report to describe, but possibly a request to withdraw. `clearGpsMotion()` needs
            // neither a position nor a reachable computer, so it stays available here on purpose —
            // this is precisely the state where the other controls cannot be trusted and this one
            // still can.
            //
            // A handover belongs in this group for exactly that reason: mid-switch, no report can be
            // trusted to describe the running route, and `clearGpsMotion()` is the one control that
            // works anyway. Withdrawing a route during a handover has to stay possible.
            cancelRequestSection
        case .ready:
            // Connected but not spoofing. A route can already be loaded and waiting here, which is
            // the state that previously had no representation at all.
            loadedRouteSection
        case .spoofing(let motion):
            motionSection(motion)
        }
    }

    /// **Zone 4.** Getting a route into the app.
    ///
    /// Separate from zone 2 deliberately. Importing a route and controlling the one already playing
    /// are different intentions, and the old single "Route" section put an import button in the
    /// middle of pause/stop controls — so the section that told you a route was running was also the
    /// section offering to replace it.
    ///
    /// Available in every connected phase, including `ready`, because loading a route before turning
    /// device GPS on is a reasonable order to work in.
    @ViewBuilder
    private var routesZone: some View {
        switch phase {
        case .notPro, .chooseController, .entitlementRejected:
            EmptyView()
        // `.switchingController` included so the library doesn't vanish and reappear across a ten-second
        // handover. A section that disappears while you watch reads as the app losing track, and the
        // reason it would have disappeared — we're unsure which computer is in charge — has nothing to do
        // with whether you can browse your saved routes.
        case .waitingForComputer, .setupNeeded, .ready, .spoofing, .lost, .switchingController:
            routeSourceSection
        }
    }

    /// **Zone 5.** Which computer is in charge, and the standing facts about the feature.
    ///
    /// The master switch used to live here, and the guarantee that it renders in every phase came with it —
    /// see `syncZone`, which now carries both. What is left is one grouped section: the things that are
    /// true of device GPS regardless of what it happens to be doing.
    @ViewBuilder
    private var connectionZone: some View {
        goodToKnowSection
    }

    /// The two facts about device GPS that aren't state: how to keep a location after leaving your
    /// computer, and what the feature is not for.
    ///
    /// **One header over both, because they were two headerless sections stacked at the bottom of the
    /// tab** — which reads as leftovers rather than as a group. Everything above them answers "what is
    /// happening right now"; these answer "what should I know", and saying so once costs one header and
    /// removes a section boundary.
    ///
    /// **"Good to know", not "Tips".** One of these two is a limitation, and a header calling a limitation
    /// a tip is exactly the framing this project's honesty rule exists to prevent. The word has to be true
    /// of both a capability nobody discovers and a caveat nobody wants to read, and this one is.
    ///
    /// **The caveat is the footer, not a second row.** It is deliberately the quietest thing on the screen,
    /// and a full-height row beside a tappable one would give a warning the same visual weight as a
    /// feature. A `Form` footer is already secondary footnote text, so it needs no font overrides to look
    /// deliberate rather than shrunken.
    ///
    /// On the offline-hold row: **the single most valuable thing about this feature that nobody
    /// discovers.** The ordinary running state needs the computer reachable, so customers reasonably
    /// conclude the location dies when they leave — and the whole appeal of moving a device's real GPS is
    /// being somewhere else while you are out. Turning Developer Mode off before disconnecting keeps it,
    /// with the phone fully off-network. It was documented on the website and nowhere in the app, which is
    /// the wrong way round: the person about to leave the house is holding the phone, not reading /gps.
    ///
    /// **Both shown in every phase, including before setup.** The row answers "can I actually use this away
    /// from my desk", which is a buying question as much as an operating one, and gating it on a running
    /// spoof would hide it from exactly the person weighing up whether the feature is worth having. The
    /// caveat is unconditional for the mirror-image reason: the old rule put it only in the two pre-setup
    /// phases, which meant it disappeared at the moment the feature started working. Somebody who set
    /// device GPS up for Pokémon GO does not find out during setup — they find out the first time they open
    /// the game, and by then the sentence that would have told them is gone.
    ///
    /// `.notPro` never reaches this — `replacesScreenWithPitch` swaps the whole screen for the pitch, which
    /// renders `compatibilitySection` standalone — so the caveat cannot appear twice.
    private var goodToKnowSection: some View {
        Section {
            Button {
                showOfflineHold = true
            } label: {
                HStack(spacing: 14) {
                    Image(systemName: "figure.walk.departure")
                        .font(.system(size: 17, weight: .medium))
                        .foregroundStyle(Color.brand)
                        .frame(width: 24)
                        .accessibilityHidden(true)
                    Text("Going out without your computer")
                        .foregroundStyle(.primary)
                        .fixedSize(horizontal: false, vertical: true)
                    Spacer(minLength: 0)
                    Image(systemName: "chevron.right")
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.tertiary)
                        .accessibilityHidden(true)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityElement(children: .combine)
            .accessibilityHint("Opens how to keep a location after leaving your computer")
            // A plain `Link` beside the custom row above, and the difference in appearance is the point:
            // this one is tinted with no chevron, which is how iOS says "leaves the app", while the
            // chevron row says "more of this app". Matching them would make one of the two lie about
            // where it goes.
            //
            // Last because it is the most general thing here — the row above and the caveat below are both
            // specific facts, and someone who wants the whole story is by definition not looking for one.
            OutboundLinkRow(
                title: "Learn more about GeoSpoof GPS",
                systemImage: "info.circle",
                destination: learnMoreURL
            )
        } header: {
            Text("Good to know")
        } footer: {
            // `Label` rather than a bare `Text` so the caveat carries the same warning glyph it has on the
            // pitch card and in the sheet. No `.font`/`.foregroundColor` overrides: a footer is already
            // footnote-sized and secondary, and re-stating that here is how the two drift apart.
            Label {
                Text(DeviceGpsPitch.compatibilityCaveat)
            } icon: {
                Image(systemName: "exclamationmark.triangle")
            }
        }
        .adaptiveModalCover(isPresented: $showOfflineHold) { OfflineHoldSheet() }
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
            // Two glyphs saying two things: the leading one is what you get, the trailing one is that you
            // leave to get it. This is a plain `Form` row rather than a prominent button, so it takes the
            // row treatment like every other outbound row.
            OutboundLinkRow(
                title: "Get GeoSpoof GPS",
                systemImage: "arrow.down.circle",
                destination: downloadURL
            )
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
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 4) {
                        Text(controller.motionState.steering != nil
                            ? "You asked for steering."
                            : "You asked for a route.")
                        Text("It may still be running — your computer drives it, and it doesn't need this app open. We just can't confirm right now.")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .accessibilityElement(children: .combine)
            } header: {
                Text("Last request")
            }
        }
    }

    /// Withdraw an outstanding motion request, in the phases where no report can be trusted.
    ///
    /// Split out of `lastKnownMotionSection` when the zones landed, because the two halves answer
    /// different questions and now live in different zones: the explanation is *status* (zone 1), the
    /// button is an *action on motion* (zone 2). They were one section only because they arrived
    /// together.
    ///
    /// Available here specifically **because** the report is stale. Withdrawing a request needs no
    /// knowledge of where the device is and no computer to be reachable, so it is safe exactly when
    /// pause and stop are not. Without it, a route requested just before a computer went away has no
    /// way out at all — which is the dead end the stale-phase fix had to correct once already.
    @ViewBuilder
    private var cancelRequestSection: some View {
        if controller.hasActiveMotion {
            Section {
                Button(role: .destructive) {
                    controller.clearGpsMotion()
                } label: {
                    Label("Cancel Request", systemImage: "xmark.circle")
                }
                .tint(.red)
                .accessibilityHint("Takes effect when your computer next connects")
            } footer: {
                // Says when it takes effect rather than implying it stops anything now. It can't:
                // the change reaches the device only when a computer next reads it.
                Text("Cancelling takes effect the next time your computer connects. To return your real location now, turn off Sync.")
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

    // No `controllingComputerSection`. It was a second `Section`, headed differently, carrying a picker
    // for a fact the Status block was already reporting one row above — so the driver's name was read in
    // one place and changed in another. The Status block's `Controller` row is now the picker, which is
    // also what lets it appear for a single computer: the old section hid itself below two, so the feature
    // was invisible until the day it silently wasn't.
    //
    // Arbitration is untouched and still separate. `chooseControllerSection` runs during
    // `.chooseController` — two-or-more computers and no valid pick — where `connectedSection` isn't
    // rendered at all, so the question gets asked once, as a list, and the Controller row takes over for
    // changing the answer afterwards.

    /// Zone 1's live state: whether a spoof is running, where, and **what is driving it**.
    ///
    /// The driver row is the reason this takes `motion`. Previously this section showed a `Source` row
    /// built from the agent's provenance string, while a *separate* section described the route or
    /// vector — so the two halves of "what is driving my GPS" were never stated together and a
    /// customer had to join them. `GpsDriver` is that join, and it encodes the rule that motion
    /// supersedes provenance: while a route plays, the route is the source, and naming the coordinate
    /// it started from would be stale.
    @ViewBuilder
    private func connectedSection(active: Bool, motion: GpsMotionDetail?) -> some View {
        let driver = GpsDriver(motion: motion, provenance: statusStore.status?.provenance ?? .unknown)
        Section {
            HStack {
                // `.brand` rather than `.green`, which this row used to use while every glyph beside
                // it used the brand token. One affirmative colour across the app; `.brand` is the one
                // that mirrors the extension's CSS.
                Image(systemName: active ? "checkmark.circle.fill" : "checkmark.circle")
                    .foregroundColor(active ? .brand : .secondary)
                    .accessibilityHidden(true)
                Text(active ? "GPS spoofing active" : "Connected")
                Spacer()
            }
            .accessibilityElement(children: .combine)
            // Names the *computer*, not this phone.
            //
            // This row once reported `status.device.name` — the name of the device you are already
            // holding. It answered a question nobody asks, and it was the only reader of that field in the
            // app. Meanwhile the fact a customer does want, which computer is driving, was visible only
            // when two or more happened to be present, because it lived in a separate section that hid
            // itself below two. So the ordinary one-computer setup named the phone and never named the
            // driver.
            // **This row is the switcher.** It was a read-only `LabeledRow` with a whole second
            // `Section` elsewhere on the screen carrying a picker for the same fact — so a customer with
            // a Mac and a PC read the driver's name here and changed it thirty points further down,
            // under a different heading. One row now states it and changes it.
            //
            // **Shown even with a single computer, as a picker of one.** The old separate section hid
            // itself below two, which meant the ordinary customer had no way to learn the feature exists
            // — and then the day they installed the agent on a second machine an unexplained control
            // appeared. A menu of one option answers "can this be changed?" before it needs to be.
            if !statusStore.controllers.isEmpty {
                Picker(selection: Binding(
                    // `reconcileSelection` deliberately keeps the selection `nil` for a sole computer —
                    // it drives implicitly, and storing an id would be a preference nobody expressed. So
                    // the display falls back to the only controller present rather than showing nothing.
                    get: { controller.selectedControllerId ?? statusStore.controllers.first?.id ?? "" },
                    // And picking the only option must not write that id back, or this would fight the
                    // rule above on every render.
                    set: { controller.setSelectedController(statusStore.controllers.count >= 2 ? $0 : nil) }
                )) {
                    ForEach(statusStore.controllers) { c in
                        // The computer's own name, reported by the agent — user data, not copy.
                        Text(verbatim: c.name)
                            // One line, always. A status block whose rows change height as the roster
                            // changes reads as the layout twitching rather than as information arriving.
                            .lineLimit(1)
                            // Middle rather than tail, because both ends of a machine name carry
                            // identity: the owner at the front and the model at the back. Tail
                            // truncation turns "Anthony's MacBook Pro" and "Anthony's MacBook Air" into
                            // the same string.
                            .truncationMode(.middle)
                            .tag(c.id)
                    }
                } label: {
                    // "Controller", not "Controlling computer": the longer label ate the width that the
                    // thing it labels actually needs. Machine names run long — "Anthony's MacBook Pro"
                    // is short as they go — and a picker has to fit the label, the value and a chevron.
                    Text("Controller")
                }
            }
            if active {
                LabeledRow(label: "Location", value: locationText)
                driverRow(driver)
            }
        } header: {
            Text("Status")
        } footer: {
            // Only worth saying once a second computer exists. With one, "the others stand by" describes
            // nobody — and the picker of one is self-evident without it.
            //
            // Same key the deleted `controllingComputerSection` used, so the explanation followed the
            // control it belongs to rather than being rewritten for its new home.
            if statusStore.controllers.count >= 2 {
                Text("Only this computer drives your iPhone’s GPS. The others stand by.")
            }
        }
    }

    /// The one row that answers "what is driving my iPhone's GPS right now?"
    ///
    /// Drawn only when there is something true to say. `GpsDriver.title` returns `nil` for a held
    /// coordinate whose provenance this build can't name, and the correct response to that is no row
    /// — not a row reading "Unknown", which describes our parser rather than the customer's device.
    @ViewBuilder
    private func driverRow(_ driver: GpsDriver) -> some View {
        if let title = driver.title {
            HStack(spacing: 8) {
                Text("Source")
                Spacer()
                // Decorative: the state is in the text beside it, and the tint is a second encoding
                // of `isProblem` for sighted users.
                Image(systemName: driver.symbol)
                    .font(.footnote)
                    .foregroundStyle(driver.isProblem ? .orange : Color.secondary)
                    .accessibilityHidden(true)
                // One line, and no `VStack`. See `GpsDriver`'s note where `detail` used to be: the
                // route's name was a second line here restating what the Route section says below,
                // and it made this the tallest row in a block of single-line rows.
                Text(title)
                    .foregroundStyle(driver.isProblem ? .orange : .secondary)
                    .multilineTextAlignment(.trailing)
            }
            .accessibilityElement(children: .combine)
        }
    }

    /// Zone 2's content: the route or vector in play.
    ///
    /// `.still` is not nothing — the device is being held at a coordinate — but it needs no *motion*
    /// row, because zone 1 already states the place and its source. What it may still need is the
    /// loaded route sitting there unstarted, which is what `loadedRouteSection` covers.
    @ViewBuilder
    private func motionSection(_ motion: GpsMotionDetail) -> some View {
        switch motion {
        case .still:
            loadedRouteSection
        case .route(let progress):
            routeSection(progress)
        case .steering(let detail):
            steeringSection(detail)
        case .notDelivered(let asked):
            notDeliveredSection(asked)
        }
    }

    /// A route that is loaded but not playing.
    ///
    /// This state had no representation at all before the zones landed. The only thing rendered was
    /// the combined route-controls section, whose import button read "Import a Different Route"
    /// without naming the route it would replace. So the app knew which route was loaded and never
    /// said — and the pace picker sat above a button offering to discard the route it configured.
    @ViewBuilder
    private var loadedRouteSection: some View {
        if let route = loadedRoute, controller.motionState.routeId != nil {
            Section {
                HStack {
                    Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
                        .foregroundColor(.brand)
                        .accessibilityHidden(true)
                    Text("Route ready")
                    Spacer()
                }
                .accessibilityElement(children: .combine)
                // Library name first, `route.json`'s copy only as a fallback. See `activeRouteName`.
                if let name = activeRouteName ?? route.name, !name.isEmpty {
                    LabeledRow(label: "Route", value: Text(verbatim: name))
                }
                LabeledRow(label: "Distance", value: Text(verbatim: distanceText(route.lengthMeters)))
                pacePicker(route)
                motionButton(.start, "Start Route", systemImage: "play.fill") {
                    controller.restartGpsRoute()
                }
                .accessibilityHint("Begins this route from its start")
            } header: {
                Text("Route")
            } footer: {
                // Deliberately **not** an alarm. A loaded route with Sync off is a normal preparatory
                // state, not an error — painting it orange overstated it. This just explains why Start
                // Route will ask a question, so the dialog isn't a surprise.
                //
                // The tap itself is answered by `syncStartDialog`, because a footer is information and a
                // press deserves a response.
                if !controller.deviceGpsEnabled {
                    Text("Sync is off, so starting this route will ask to turn it on first.")
                } else {
                    pendingFooter
                }
            }
        }
    }

    /// A playback control that acknowledges the press.
    ///
    /// Every motion control goes through this, which is the point: the feedback isn't something a call
    /// site can forget. While its own request is outstanding it shows a spinner and its in-flight label
    /// and stops accepting taps; while *another* control's request is outstanding it is merely disabled,
    /// so a stray second tap can't queue a contradictory instruction behind the first.
    @ViewBuilder
    private func motionButton(
        _ kind: GpsPendingAction.Kind,
        _ title: LocalizedStringKey,
        systemImage: String,
        role: ButtonRole? = nil,
        action: @escaping () -> Void
    ) -> some View {
        let isPending = pendingAction?.kind == kind
        Button(role: role) {
            perform(kind, action)
        } label: {
            HStack(spacing: 8) {
                Label(isPending ? kind.progressLabel : title, systemImage: systemImage)
                if isPending {
                    Spacer()
                    ProgressView()
                        .controlSize(.small)
                        // The label already says what's happening, and VoiceOver reads it.
                        .accessibilityHidden(true)
                }
            }
        }
        .disabled(pendingAction != nil)
        // **`.disabled` alone does not dim these.** The GPS tab applies `.tint(.brand)` at its root and
        // Stop Route adds `.tint(.red)`; a tinted label in a `Form` row keeps its colour when the
        // control is disabled, so the whole block sat at full strength while refusing every tap —
        // "Pausing…" looked like a finished state rather than a request in flight, and Stop Route
        // looked pressable.
        //
        // Applied to every button rather than only the pending one, because they are all disabled and
        // dimming just the busy one would leave the others reading as available.
        .opacity(pendingAction != nil ? 0.45 : 1)
    }

    /// The one line that explains an unanswered request.
    ///
    /// Inline rather than an alert. This state resolves itself the instant a report arrives, and a modal
    /// that may be stale before it's read is worse than a sentence that quietly disappears.
    @ViewBuilder
    private var pendingFooter: some View {
        if pendingTimedOut {
            Label(
                "Your computer hasn't confirmed that yet. It may still be catching up.",
                systemImage: "clock.arrow.circlepath"
            )
            .foregroundStyle(.orange)
        }
    }

    /// Route playback: what it is doing, how far along, and the controls that act on it.
    ///
    /// **One section, one header.** This used to be two adjacent `Section`s both titled "Route" — one
    /// read-only progress block and one control block — with a third, also titled "Route", for the
    /// not-delivered case. A customer saw the same heading twice in a row and had to work out why.
    /// The split existed because progress and controls were built at different times, not for any
    /// reason a reader could recover.
    /// Which route, and what it's doing — one row instead of two.
    ///
    /// The state used to have a row of its own, above a `Route — name` row. But the section is already
    /// headed "Route", so a row restating that was mostly redundant; what it actually carried was the
    /// *state*, and a state is a natural subtitle rather than a headline. The standard two-line list row
    /// says both in the space of one.
    ///
    /// The state cannot simply be dropped. "Route paused" and "Route finished" are materially different
    /// from "Following route", and the contract is emphatic that finished must never read as stopped —
    /// the agent deliberately leaves a completed route in place and the device holds the final point, so
    /// "stopped" would imply the real location had come back when it hasn't.
    ///
    /// Taps through to the route's detail screen when the route came from the library, which is where
    /// pace, repeat and the map now live. No chevron and no tap when it didn't — the DEBUG test route has
    /// no library entry, and a row that looks tappable and isn't is worse than a plain one.
    @ViewBuilder
    private func routeIdentityRow(_ p: GpsRouteProgress) -> some View {
        let label = HStack(spacing: 12) {
            Image(systemName: p.finished
                ? "flag.checkered"
                : (p.paused ? "pause.circle.fill" : "figure.walk.motion"))
                // Decorative: the state is in the text beside it, and the colour is a second encoding
                // of the same thing for sighted users.
                .foregroundColor(p.finished ? .secondary : (p.paused ? .orange : .brand))
                .accessibilityHidden(true)
            VStack(alignment: .leading, spacing: 2) {
                // The route's own name — user data, so verbatim. Falls back to the generic noun rather
                // than leaving the row headless when a GPX carried no name.
                if let name = p.name, !name.isEmpty {
                    Text(verbatim: name)
                } else {
                    Text("Route")
                }
                Text(p.finished ? "Route finished" : (p.paused ? "Route paused" : "Following route"))
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 8)
        }
        .accessibilityElement(children: .combine)

        if let entry = activeLibraryEntry {
            NavigationLink {
                GpsRouteDetailView(controller: controller, entry: entry) {
                    // The whole refresh, not just the tally: this is the screen that shows the
                    // playing route's name, and `refreshLoadedRoute` is what re-resolves it.
                    refreshLoadedRoute()
                }
            } label: {
                label
            }
        } else {
            label
        }
    }

    /// How far along — the bar and both numbers, in one row.
    ///
    /// Was three rows: a bare `ProgressView`, then `Travelled`, then `Time left`. All three answer the
    /// same question, and the native shape for that is a bar with its figures inline beneath it, the way
    /// a scrubber shows elapsed and remaining. Distance sits under the filled end, duration under the
    /// unfilled one, which is the direction each refers to.
    ///
    /// No percentage. The bar already carries the fraction visually, and task 21 settled that duration is
    /// the number people decide on — "about nine minutes left" answers what a bare "37%" doesn't.
    private func routeProgressRow(_ p: GpsRouteProgress) -> some View {
        VStack(alignment: .leading, spacing: 6) {
            ProgressView(value: p.fraction)
                .tint(.brand)
            HStack {
                Text(verbatim: distanceText(p.travelledM, of: p.totalM))
                Spacer()
                // Passed through from the agent, never derived: an as-recorded route's pace varies along
                // the track, so (total − travelled) / speed would be wrong. Absent for a repeating route
                // and meaningless once finished — the footer explains which.
                if let remaining = p.remainingSecs, !p.finished {
                    // One key with the duration interpolated, never a concatenated bare "left". Word
                    // order differs — "noch 9 Min.", "残り9分" — and a standalone fragment cannot be
                    // moved. `verbatim` because the value is already localised and formatted.
                    Text(verbatim: String(localized: "\(durationText(remaining)) left"))
                }
            }
            .font(.caption)
            .foregroundStyle(.secondary)
            .monospacedDigit()
        }
        .padding(.vertical, 2)
        // One element, and the value leads with duration to match the visible layout — a bar read out as
        // a bare percentage is the least useful form of the same information.
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(Text("Route progress"))
        .accessibilityValue(Text(verbatim: progressAccessibilityValue(p)))
    }

    /// The library entry for the route currently loaded, if it came from the library.
    ///
    /// Read through the **entity** id, which is the whole reason that id exists: the content hash moves
    /// whenever the pace changes and this lookup must not.
    private var activeLibraryEntry: GpsSavedRoute? {
        guard let id = controller.motionState.savedRouteId else { return nil }
        return GpsRouteStore.shared.load(id: id)
    }

    private func routeSection(_ p: GpsRouteProgress) -> some View {
        Section {
            routeIdentityRow(p)
            routeProgressRow(p)
            // Pause and stop are separate controls on purpose. Pausing waits in place and keeps
            // spoofing; stopping ends playback. Neither reverts to the phone's real GPS — that's the
            // Sync toggle in zone 4, and conflating the three is the mistake the agent contract warns
            // about.
            //
            // Hints rather than longer labels. VoiceOver reads these buttons in sequence with no
            // visual context, and "Pause" / "Stop Route" alone don't say what they leave behind —
            // which is the whole distinction between them and the Sync toggle. The hint carries that
            // without making the visible labels wordy.
            if p.finished {
                motionButton(.restart, "Play Again", systemImage: "arrow.counterclockwise") {
                    controller.restartGpsRoute()
                }
                .accessibilityHint("Plays this route again from its start")
            } else if p.paused {
                motionButton(.resume, "Resume", systemImage: "play.fill") {
                    controller.resumeGpsRoute()
                }
                .accessibilityHint("Continues from where the route paused")
            } else {
                motionButton(.pause, "Pause", systemImage: "pause.fill") {
                    controller.pauseGpsRoute()
                }
                .accessibilityHint("Waits here. Your phone's location stays spoofed")
            }
            motionButton(.stop, "Stop Route", systemImage: "stop.fill", role: .destructive) {
                controller.stopGpsRoute()
            }
            .tint(.red)
            .accessibilityHint("Ends the route. Your phone stays where the route left it")
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
            } else {
                // One sentence, not three. The pace-restart warning moved to the detail screen with the
                // picker it describes, and the pause explanation is tightened — it only has to draw the
                // one distinction the contract warns about, between waiting here and getting your real
                // location back.
                Text("Pausing keeps your GPS spoofed. Turning off Sync returns your real location.")
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
                    .accessibilityHidden(true)
                // Three distinct states, deliberately worded apart: expiry is the deadline
                // lapsing with no interaction, which is not the same as the user choosing to wait.
                Text(d.expired ? "Steering timed out" : (d.held ? "Holding position" : "Steering"))
                Spacer()
            }
            .accessibilityElement(children: .combine)
            if let speed = d.speedMps, !d.held {
                LabeledRow(label: "Speed", value: Text(verbatim: speedText(speed)))
            }
            if let travelled = d.travelledM {
                // Distance with no denominator: steering has no end, so a progress proportion
                // would be inventing one.
                LabeledRow(label: "Travelled", value: Text(verbatim: distanceText(travelled)))
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
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text(asked == .route
                        ? "This computer isn't following your route."
                        : "This computer isn't following your steering.")
                    Text("Update GeoSpoof GPS on your computer to the latest version.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)
            if let version = statusStore.status?.agentVersion, !version.isEmpty {
                LabeledRow(label: "Computer app", value: Text(verbatim: version))
            }
        } header: {
            // Deliberately not "Route". This is the third section that used to carry that heading,
            // and it is not describing a route — it is reporting that the computer is ignoring one.
            Text("Not delivered")
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
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 4) {
                    Text("Your computer couldn't confirm GeoSpoof Pro.")
                    Text("It checks your purchase directly with Apple, so this can differ from what this app shows. Restoring your purchase usually fixes it.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .accessibilityElement(children: .combine)
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

    /// **Zone 3.** Getting a route into the app.
    ///
    /// Nothing about playback lives here any more. This used to be the same section as the pause and
    /// stop controls, which meant the block telling you a route was running was also the block
    /// offering to replace it — two different intentions sharing one heading, and the heading was
    /// "Route", the same as the progress block directly above it.
    ///
    /// Rendered in every connected phase, `ready` included, because loading a route before switching
    /// device GPS on is a reasonable order to work in. It carries the `.fileImporter` and the import
    /// alert for the whole tab, since every import path — the button, AirDrop, Mail, Files, a share
    /// sheet — funnels through `importRoute(from:deleteAfterReading:)` and needs one place to report.
    @ViewBuilder
    private var routeSourceSection: some View {
        Section {
            NavigationLink {
                GpsRouteLibraryView(controller: controller, tally: $savedRouteTally)
            } label: {
                HStack {
                    Label("Saved Routes", systemImage: "list.bullet")
                    Spacer()
                    // The count, so the row states what's behind it rather than making you tap to
                    // find out. Read from the index, which is one small file.
                    if savedRouteCount > 0 {
                        Text(verbatim: savedRouteCount.formatted())
                            .foregroundStyle(.secondary)
                    }
                }
            }
            Button {
                showRouteImporter = true
            } label: {
                Label(hasLoadedRoute ? "Import a Different Route" : "Import Route (GPX)",
                      systemImage: "square.and.arrow.down")
            }
        } header: {
            Text("Routes")
        } footer: {
            Text("Export a GPX from Strava, Garmin, or any tracking app, then bring it here with AirDrop, Files, or iCloud Drive. Routes you import are saved automatically.")
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
    /// - Parameter resumingAt: the confirmed distance to carry across the pace change, or `nil` to start
    ///   over. Comes from `GpsRouteProgress`, which is only constructible from a gate-confirmed report —
    ///   so the contract's "never send a distance you merely believe" rule holds by construction here.
    @ViewBuilder
    private func pacePicker(_ route: GpsRoute, resumingAt travelledM: Double? = nil) -> some View {
        let hasTimings = route.points.count > 1
            && route.points.allSatisfy { $0.offsetSecs != nil }
        let options = GpsRoutePace.allCases.filter { $0 != .asRecorded || hasTimings }
        Picker(selection: Binding(
            get: { route.speed.pace },
            set: { newPace in
                if let failure = controller.changeGpsRoutePace(to: newPace, resumingAt: travelledM) {
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

    /// What VoiceOver reads for the progress bar.
    ///
    /// Duration first, then distance, mirroring the visible layout — and for the same reason: "about
    /// nine minutes left" answers the question a bare "37 percent" doesn't. Distance alone for a
    /// repeating route, which has no remaining time to state, and for a finished one, where a
    /// countdown of zero would be noise.
    private func progressAccessibilityValue(_ p: GpsRouteProgress) -> String {
        let distance = distanceText(p.travelledM, of: p.totalM)
        guard let remaining = p.remainingSecs, !p.finished else { return distance }
        // `String(localized:)`, not a bare interpolation. This previously read
        // `"\(duration) left, \(distance)"` as a plain Swift string, which is never extracted as a
        // catalog key — so every non-English VoiceOver user heard the English " left, ". Invisible in
        // English testing and invisible in the catalog, which is the failure mode CONTRIBUTING warns
        // about and the one that only reaches people using a screen reader.
        return String(localized: "\(durationText(remaining)) left, \(distance)")
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

    /// Whether a route is loaded, from the motion record rather than the cached file.
    ///
    /// Reads `routeId` rather than `loadedRoute` on purpose: the record is authoritative and always
    /// current, while the cache is refreshed asynchronously on an identity change, so a check against
    /// the cache reports "no route" for a frame after one is loaded.
    private var hasLoadedRoute: Bool { controller.motionState.routeId != nil }

    /// How many routes are saved, for the library row's count.
    ///
    /// Cached in `@State` rather than read in `body`: the body re-evaluates on any of
    /// `SpoofController`'s published properties, and reading the index on every render to learn a
    /// number we changed ourselves is the same wrong trade `loadedRoute` avoids.
    private var savedRouteCount: Int { savedRouteTally }

    /// Re-read `route.json` into the cache. Called when the route identity changes.
    private func refreshLoadedRoute() {
        loadedRoute = controller.motionState.routeId == nil ? nil : controller.loadGpsRoute()
        let library = GpsRouteStore.shared.summaries()
        // Same read that feeds the tally below, so resolving the current name is free. `nil` for a
        // route with no library entry — today the DEBUG test route — where the reported name is the
        // only name there is and the call sites fall back to it.
        activeRouteName = controller.motionState.savedRouteId.flatMap { saved in
            library.first(where: { $0.id == saved })?.name
        }
        savedRouteTally = library.count
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
        // Checked here rather than by hiding the button, because the button is not the only entrance.
        // A GPX handed in from AirDrop, Mail or a share sheet reaches this method regardless of which
        // phase the GPS tab is showing — so gating the UI alone left the worst possible outcome for a
        // customer without Pro: the file was read, **deleted from our Inbox**, reported as loaded, and
        // then nothing moved, with no copy left to retry from.
        //
        // Returning before the read is what makes it recoverable. The file stays where it is, so once
        // they have Pro the same file opens again and works.
        guard pro.isPro else {
            routeImportMessage = String(
                localized: "Routes need GeoSpoof Pro. Your file hasn't been changed — open it again once you upgrade."
            )
            showRouteImportAlert = true
            router.showPaywall = true
            return
        }
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
                // **Deletion moved to after a successful save** — see the call site below. It used to
                // happen here, right after reading, so a route that couldn't be kept took the customer's
                // only copy with it. Auto-start hid that: the route played once, so the loss was invisible
                // until they looked for it in the library. With starting removed there is nothing left to
                // mask it, and a full library would simply eat the file.
                return GpsGpxImporter.route(
                    from: data,
                    fallbackName: url.deletingPathExtension().lastPathComponent
                )
            }.value

            switch outcome {
            case .success(let route):
                // **Save and open. Deliberately no longer save and play.**
                //
                // Starting on import was inherited from before a library existed, when importing was the
                // only way to use a route so playing was the whole interaction. Now it means opening a
                // file moves the device's real GPS — every app, Find My included — with nothing pressed,
                // and it lands past the pace and repeat controls whose own footer warns that changing
                // them restarts the route. So the customer starts it, from a screen that first shows them
                // what they imported.
                //
                // A full library refuses rather than evicting. That case gets the message and no push:
                // there is no entry to open, and a detail screen for a route that was never stored would
                // offer to delete a file that does not exist.
                let saved = GpsSavedRoute(
                    adopting: route,
                    source: .gpxImport,
                    fallbackName: url.deletingPathExtension().lastPathComponent
                )
                if let saveFailure = GpsRouteStore.shared.save(saved) {
                    // Shared with the detail screen's own save failures rather than a second set of
                    // sentences. The old copy here opened "It's playing, but wasn't saved…", which is
                    // no longer true of anything — and the detail screen's wording was already the
                    // version that doesn't claim playback.
                    routeImportMessage = GpsRouteDetailView.message(for: saveFailure)
                    showRouteImportAlert = true
                    // Quiets the review ask, same as a parse failure already did. This branch didn't
                    // before, because the route used to play anyway — a full library cost you the *saving*,
                    // not the thing you came to do. Now that import no longer starts anything, this path
                    // hands the customer nothing at all, which is exactly the moment not to ask for stars.
                    noteReviewTrouble()
                } else {
                    if deleteAfterReading {
                        // Only now. The route is in the library, so the Inbox copy is redundant rather
                        // than the last one.
                        try? FileManager.default.removeItem(at: url)
                    }
                    // No alert on success. The push *is* the acknowledgement, and an alert stacked in
                    // front of the screen it is announcing is one dismissal for no information — the
                    // detail screen already names the route, draws it, and shows the pace the file
                    // resolved to, which is everything the old "loaded" message carried.
                    importedRoute = saved
                }
            case .failure(let failure):
                routeImportMessage = Self.message(for: failure)
                showRouteImportAlert = true
                noteReviewTrouble()
            }
            refreshStatus()
            refreshLoadedRoute()
        }
    }

    // MARK: Import messages
    //
    // Every message below goes through `String(localized:)`, NOT a bare string literal.
    //
    // These are shown through `Text(routeImportMessage)`, and `Text` given a `String` uses the
    // **non-localising** initialiser — so a plain `return "..."` here ships English to all eleven
    // other languages, and does it at the exact moment something has gone wrong for the customer.
    // The failure is invisible in English testing and invisible in the catalog, because a bare
    // literal returned as a `String` is never extracted as a key at all.
    //
    // `String(localized:)` both registers the key for extraction and resolves it at runtime.
    // Interpolating into it is correct and produces `%@`-style specifiers a translator can reorder.

    // No `message(for: GpsRouteSaveFailure)` here, and no `startedMessage`.
    //
    // Both existed to describe an import that had already begun playing: one opened "<name> loaded —
    // 4.2 km…" and appended a nudge about Sync being off, the other opened "It's playing, but wasn't
    // saved…". Import no longer plays, so every sentence in both was a claim about something that isn't
    // happening. Save failures now go through `GpsRouteDetailView.message(for:)`, whose wording never
    // claimed playback and is already translated; success needs no sentence at all, because the customer
    // is looking at the route.

    /// Delegated to `GpsRouteFormat`: the GPS tab and the library screen both import files and
    /// must explain a refusal the same way.
    private static func message(for failure: GpsGpxImportFailure) -> String {
        GpsRouteFormat.message(for: failure)
    }

    /// Delegated to `GpsRouteFormat` so the library and its detail screen produce the same sentence
    /// for the same failure. Kept as a local overload because the call sites here read better for it.
    private static func message(for failure: GpsRouteValidationFailure) -> String {
        GpsRouteFormat.message(for: failure)
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

    /// The master switch. First section on the tab — see `syncZone`.
    ///
    /// No header, matching Home's lead section: the toggle's own label already names it, and a header
    /// reading "Device GPS" would restate the tab title one line above it.
    ///
    /// Same glyph as Home's Location Protection on purpose. These are the two master switches in the app —
    /// one for what websites see, one for what the device reports — and they should read as siblings.
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
                // On but unable to do anything, which is a warning rather than a note — and it gets
                // the same treatment as the browser's "Protection is on, but no location is set yet."
                // Identical situation, so identical presentation.
                //
                // No longer names the tab to go to. It used to say "on the Home tab", which stopped
                // being true the moment that tab was renamed — the exact way copy describing the
                // layout rots. The sentence is complete without it.
                Label(
                    "Choose a location to start syncing.",
                    systemImage: "exclamationmark.triangle.fill"
                )
                .foregroundStyle(.orange)
            } else {
                Text("When on, your iPhone’s real system GPS is set to your chosen location. This affects all apps, including Find My.")
            }
        }
    }

    /// A controller handover in flight.
    ///
    /// **Shaped like `waitingSection`, not like `setupNeededSection`** — which is what this state used to
    /// render as. Spinner, one calm line, a footer that says how long. The distinction is the whole point:
    /// a spinner says "your request is on its way", an orange triangle says "something is wrong", and for
    /// the first few seconds after a switch only the first is true.
    ///
    /// Header "Status" rather than a new word, matching `lostSection` and `connectedSection`. Same block,
    /// same question, and no new key.
    ///
    /// No explicit timer drives the exit. The tab already re-reads the roster on a 3 s poll, so the grace
    /// window is observed within a poll of expiring — and by then the incoming computer has almost
    /// certainly published anyway, which clears the state through `isSwitchoverPending` instead.
    private func switchingControllerSection(_ name: String) -> some View {
        Section {
            HStack(spacing: 10) {
                ProgressView()
                // The computer's own name, reported by the agent — user data interpolated into copy, so
                // the sentence is looked up and the name is not.
                Text("Switching to \(name)…")
                    .foregroundColor(.secondary)
            }
        } header: {
            Text("Status")
        } footer: {
            Text("Handing control over. The other computer stands by — this usually takes a few seconds.")
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

    // `infoRow` used to live here — a private near-duplicate of `LabeledRow` with the same
    // signature, the accessibility combine this file needed, and none of `LabeledRow`'s
    // `monospacedDigit()` or `textSelection(.enabled)`. Distances, durations and speeds all want
    // monospaced digits so a value doesn't jitter as it counts, so the duplicate was the worse of the
    // two for exactly the rows it served. Both properties now live on `LabeledRow` and this tab uses
    // it directly.

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

}

// MARK: - Route library

/// Shared route formatting, so the library, its detail screen and the GPS tab can't disagree about
/// how far or how long a route is.
///
/// Free functions rather than methods on `GpsView`, which is where these lived — three views need them
/// now and the copies would drift.
enum GpsRouteFormat {
    /// Locale-aware distance. Miles for a US customer, kilometres elsewhere — a running route quoted
    /// in metres to an American reads cheap.
    static func distance(_ meters: Double) -> String {
        Measurement(value: meters, unit: UnitLength.meters)
            .formatted(.measurement(width: .abbreviated, usage: .road))
    }

    /// "about 40 min". Rounded deliberately: a second-precise figure implies precision a pace
    /// estimate doesn't have.
    static func duration(_ seconds: Double) -> String {
        Duration.seconds(max(0, seconds))
            .formatted(.units(allowed: [.hours, .minutes], width: .abbreviated))
    }

    /// How long this route takes at its own pace, or `nil` when it replays a recorded timeline whose
    /// total we'd have to guess at.
    ///
    /// For `asRecorded` the answer is the last point's offset, which is the recorded duration and not
    /// an estimate at all. For a fixed pace it is length ÷ speed.
    static func estimatedSeconds(_ summary: GpsRouteSummary) -> Double? {
        switch summary.speed {
        case .fixed(let mps):
            guard mps > 0 else { return nil }
            return summary.lengthMeters / mps
        case .asRecorded:
            return nil
        }
    }

    static func paceLabel(_ pace: GpsRoutePace) -> String {
        switch pace {
        case .asRecorded: return String(localized: "As recorded")
        case .walk: return String(localized: "Walk")
        case .jog: return String(localized: "Jog")
        case .run: return String(localized: "Run")
        case .cycle: return String(localized: "Cycle")
        case .drive: return String(localized: "Drive")
        }
    }

    /// Why a GPX file couldn't become a route. One definition, shared by the GPS tab and the
    /// library screen — both have a file picker, and two copies of these sentences would drift.
    static func message(for failure: GpsGpxImportFailure) -> String {
        switch failure {
        case .unreadable:
            return String(localized: "That file couldn't be read.")
        case .tooLarge(let bytes):
            let size = Measurement(value: Double(bytes), unit: UnitInformationStorage.bytes)
                .formatted(.byteCount(style: .file))
            return String(localized: "That file is \(size), which is too large to use.")
        case .noTrack:
            return String(localized: "No route found in that file. GPX files exported from tracking apps should work.")
        case .notGpx(let root):
            // Names what the file actually is where we can. "Not a GPX file" alone invites a second
            // attempt with the same file.
            if let root, !root.isEmpty {
                return String(localized: "That isn't a GPX file — it starts with <\(root)>. Export a GPX from your tracking app.")
            }
            return String(localized: "That isn't a GPX file. Export a GPX from your tracking app.")
        case .tooManyPoints(let count):
            // Names the number and refuses. Truncating would look like it worked.
            return String(localized: "That route has \(count) points, which is more than \(GpsRoute.maxPoints). Try exporting it at a lower detail.")
        case .invalidCoordinate:
            return String(localized: "That route contains coordinates that aren't valid.")
        }
    }

    /// Why a route can't be written. One definition, because three screens now report it and three
    /// copies would drift.
    static func message(for failure: GpsRouteValidationFailure) -> String {
        switch failure {
        case .noPoints:
            return String(localized: "That route has no points.")
        case .tooManyPoints(let count):
            return String(localized: "That route has \(count) points, which is more than \(GpsRoute.maxPoints).")
        case .invalidCoordinate:
            return String(localized: "That route contains coordinates that aren't valid.")
        case .invalidSpeed:
            return String(localized: "That route's pace isn't usable.")
        case .writeFailed:
            // Nothing the user can act on, so it doesn't pretend to offer advice.
            return String(localized: "Couldn't save that route on this device.")
        }
    }
}

/// The saved routes, as a list.
///
/// Pushed from the GPS tab's Routes zone rather than shown inline, for the reason
/// `BrowserSettingsView` pushes its site filters: this is an unbounded list, and inline it would push
/// every other section of the tab further off screen as it grew.
///
/// **Deliberately no map thumbnail per row**, which the plan called for. `MKMapSnapshotter` is a
/// render-and-sometimes-network operation per instance, and forty of them racing in a scrolling list is
/// the classic way to make a list stutter — it would need an image cache to be defensible, and that is
/// a bigger piece of work than it looks. Rows carry the numbers instead, which is what you compare
/// routes on, and the *shape* lives on the detail screen where exactly one map renders at a time.
struct GpsRouteLibraryView: View {
    @ObservedObject var controller: SpoofController
    /// The owning tab's badge count.
    ///
    /// A binding rather than leaving the tab to re-read on `onAppear`, because deleting happens
    /// *here* and whether a `NavigationStack` root re-runs `onAppear` on pop is not a thing worth
    /// betting a wrong number on. This makes the count follow the only writer that can change it.
    @Binding var tally: Int

    /// The index, loaded once per appearance rather than read in `body`. A file read per render to
    /// learn something we authored is the wrong trade — the same reasoning as `GpsView.loadedRoute`.
    @State private var summaries: [GpsRouteSummary] = []
    @State private var showImporter = false
    @State private var message: String?

    /// Set when a row is tapped, so the push carries the fully loaded entry.
    ///
    /// The list holds summaries, which have no points — so navigation has to load the entry, and
    /// loading can fail (a file removed underneath us, or one that no longer validates). Driving the
    /// push from an optional makes that failure expressible; a `NavigationLink(value:)` over summaries
    /// would need the detail screen to handle a missing entry instead.
    @State private var selected: GpsSavedRoute?

    var body: some View {
        Form {
            if summaries.isEmpty {
                emptySection
            } else {
                // **Two sections only once something is starred.** With no favourites the list is one
                // group headed "Saved", exactly as before — a "Favorites" header over an empty space and
                // an "All Routes" header over everything is two labels earning nothing.
                //
                // Sectioning rather than sorting silently: the library holds up to 50, so "why is this
                // one at the top" is a real question at the size this reaches, and a header answers it
                // where a star glyph alone only hints. The store's `libraryOrder` already puts favourites
                // first, so the split below is a partition of an already-correct order rather than a
                // second opinion about it.
                if favorites.isEmpty {
                    routeSection(summaries, header: "Saved", showsTally: true)
                } else {
                    routeSection(favorites, header: "Favorites", showsTally: false)
                    routeSection(others, header: "Saved", showsTally: true)
                }
            }
        }
        .groupedFormStyle()
        .navigationTitle("Routes")
        .toolbar {
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showImporter = true
                } label: {
                    Label("Import", systemImage: "plus")
                }
                .accessibilityLabel("Import a route")
            }
        }
        .navigationDestination(item: $selected) { entry in
            GpsRouteDetailView(controller: controller, entry: entry) {
                reload()
            }
        }
        .fileImporter(
            isPresented: $showImporter,
            // `.gpx` isn't a system-declared type, so it's identified by extension, falling back to
            // XML rather than refusing — some exporters serve GPX with a generic type.
            allowedContentTypes: [UTType(filenameExtension: "gpx") ?? .xml, .xml],
            allowsMultipleSelection: false
        ) { result in
            if case .success(let urls) = result, let url = urls.first {
                importRoute(from: url)
            }
        }
        .alert(
            "Routes",
            isPresented: Binding(get: { message != nil }, set: { if !$0 { message = nil } })
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(message ?? "")
        }
        .onAppear { reload() }
    }

    /// Starred routes, in the order the store already put them.
    ///
    /// Filtered rather than re-sorted — `GpsRouteStore.libraryOrder` has done the ordering, and sorting
    /// again here would be a second place for the rule to live.
    private var favorites: [GpsRouteSummary] { summaries.filter(\.favorite) }
    private var others: [GpsRouteSummary] { summaries.filter { !$0.favorite } }

    /// One section of rows. Shared by both groups so the swipe actions, the row, and the tap target
    /// cannot end up differing between Favorites and Saved.
    ///
    /// - Parameter showsTally: only the last section carries the count, which is a fact about the whole
    ///   library rather than about the group it sits under.
    @ViewBuilder
    private func routeSection(
        _ rows: [GpsRouteSummary],
        header: LocalizedStringKey,
        showsTally: Bool
    ) -> some View {
        Section {
            ForEach(rows) { summary in
                Button {
                    open(summary)
                } label: {
                    row(summary)
                }
                // Leading edge for the constructive gesture, trailing for the destructive one — the iOS
                // convention, and it means a full swipe in either direction can't be the wrong one.
                .swipeActions(edge: .leading, allowsFullSwipe: true) {
                    Button {
                        toggleFavorite(summary)
                    } label: {
                        Label(
                            summary.favorite ? "Remove from Favorites" : "Save as Favorite",
                            systemImage: summary.favorite ? "star.slash" : "star"
                        )
                    }
                    // Overrides the brand tint this screen inherits from the GPS tab's root, the same
                    // way the delete action below has to override it to render red.
                    .tint(Color.starAccent)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        delete(summary)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                    // `role: .destructive` does not make this red on its own. This screen
                    // inherits `.tint(.brand)` from the GPS tab's root, and the inherited tint
                    // wins — so a delete gesture renders brand green without this.
                    .tint(.red)
                }
            }
        } header: {
            Text(header)
        } footer: {
            if showsTally {
                Text("\(summaries.count) of \(GpsRouteStore.maxEntries) saved.")
            }
        }
    }

    private var emptySection: some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                Image(systemName: "point.topleft.down.to.point.bottomright.curvepath")
                    .font(.title2)
                    .foregroundColor(.brand)
                    .accessibilityHidden(true)
                Text("No saved routes yet")
                    .font(.headline)
                // The empty state has to teach the GPX path, because nothing else on this screen does
                // and a bare "no routes" leaves someone with no idea where one comes from.
                Text("Export a GPX from Strava, Garmin, or any tracking app, then bring it here with AirDrop, Files, or iCloud Drive. Routes you import are saved automatically.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                Button {
                    showImporter = true
                } label: {
                    Label("Import Route (GPX)", systemImage: "square.and.arrow.down")
                }
                .padding(.top, 2)
            }
            .padding(.vertical, 4)
        }
    }

    @ViewBuilder
    private func row(_ summary: GpsRouteSummary) -> some View {
        HStack(spacing: 12) {
            VStack(alignment: .leading, spacing: 3) {
                // The user's own name for it — data, so verbatim.
                Text(verbatim: summary.name)
                    .foregroundColor(.primary)
                HStack(spacing: 6) {
                    Text(verbatim: GpsRouteFormat.distance(summary.lengthMeters))
                    if let seconds = GpsRouteFormat.estimatedSeconds(summary) {
                        Text(verbatim: "·")
                        Text(verbatim: GpsRouteFormat.duration(seconds))
                    }
                    Text(verbatim: "·")
                    Text(verbatim: GpsRouteFormat.paceLabel(summary.speed.pace))
                }
                .font(.caption)
                .foregroundColor(.secondary)
            }
            Spacer(minLength: 8)
            // Kept even inside the Favorites section, where it is arguably redundant. It is what makes a
            // starred route recognisable after it has been scrolled away from its header, and it is the
            // only mark still visible in the sectionless single-group list.
            if summary.favorite {
                Image(systemName: "star.fill")
                    .font(.caption)
                    .foregroundColor(Color.starAccent)
                    .accessibilityLabel("Favorites")
            }
            if controller.motionState.savedRouteId == summary.id {
                // Which route is loaded for playback — read from `motionState`, so it is what we asked
                // for rather than what a report confirmed. "Active route", not "currently playing": the
                // device may be paused, finished, or waiting on a computer that hasn't picked the
                // request up, and only the GPS tab can tell those apart.
                //
                // Compared on the entity id, not the content hash — the hash moves when the pace changes
                // and this badge must not.
                Image(systemName: "location.fill")
                    .font(.caption)
                    .foregroundColor(.brand)
                    .accessibilityLabel("Active route")
            }
            Image(systemName: "chevron.right")
                .font(.caption.weight(.semibold))
                .foregroundStyle(.tertiary)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
    }

    private func reload() {
        summaries = GpsRouteStore.shared.summaries()
        tally = summaries.count
    }

    private func open(_ summary: GpsRouteSummary) {
        guard let entry = GpsRouteStore.shared.load(id: summary.id) else {
            // The index and the files disagreed, or the file no longer validates. `summaries()`
            // repairs the index on its next read, so reloading is both the fix and the explanation.
            message = String(localized: "That route couldn't be opened, so it's been removed from your library.")
            reload()
            return
        }
        selected = entry
    }

    /// Star or unstar from the list, without loading the full entry into a push.
    ///
    /// `setFavorite` does its own read, so this stays a summary-level gesture. A `nil` result means the
    /// file went missing or wouldn't write; `reload()` runs either way, because that is also what repairs
    /// an index that has drifted from the directory.
    private func toggleFavorite(_ summary: GpsRouteSummary) {
        GpsRouteStore.shared.setFavorite(id: summary.id, !summary.favorite)
        reload()
    }

    private func delete(_ summary: GpsRouteSummary) {
        if controller.motionState.savedRouteId == summary.id {
            // Otherwise the device keeps walking a route the library no longer has, and nothing on
            // screen could name what it was following.
            controller.stopGpsRoute()
        }
        GpsRouteStore.shared.delete(id: summary.id)
        reload()
    }

    /// Import from this screen. Saves and opens the route, exactly as importing from the GPS tab does —
    /// one behaviour for the same action, wherever it is taken from.
    ///
    /// **It used to save and immediately play.** That was inherited from before a library existed, when
    /// importing was the only way to use a route and playing was therefore the whole interaction. With a
    /// library, a detail screen and a transport, starting on import means opening a file moves the
    /// device's real GPS — every app, Find My included — without anything being pressed, and it skips the
    /// pace and repeat controls whose own footer warns that changing them restarts the route. So the file
    /// is saved and opened, and starting is left to the customer.
    private func importRoute(from url: URL) {
        Task { @MainActor in
            let outcome = await Task.detached(priority: .userInitiated) {
                // A URL from outside the container needs access taken explicitly and given back, or
                // the read fails silently on an iCloud Drive file.
                let scoped = url.startAccessingSecurityScopedResource()
                defer { if scoped { url.stopAccessingSecurityScopedResource() } }
                guard let data = try? Data(contentsOf: url) else {
                    return Result<GpsRoute, GpsGpxImportFailure>.failure(.unreadable)
                }
                return GpsGpxImporter.route(
                    from: data, fallbackName: url.deletingPathExtension().lastPathComponent
                )
            }.value

            switch outcome {
            case .success(let route):
                let saved = GpsSavedRoute(
                    adopting: route,
                    source: .gpxImport,
                    fallbackName: url.deletingPathExtension().lastPathComponent
                )
                if let failure = GpsRouteStore.shared.save(saved) {
                    // Couldn't be kept, so there is no library entry to open. The message is the whole
                    // response — pushing a detail screen for a route that isn't in the library would
                    // give it a Delete button for a file that was never stored.
                    message = GpsRouteDetailView.message(for: failure)
                    // Same reasoning as the GPS tab's import: with nothing started and nothing saved, the
                    // customer got nothing, so hold the review ask off for a while.
                    ReviewPrompt.shared.noteTrouble()
                    reload()
                } else {
                    reload()
                    // Opening the route *is* the confirmation, which is why there is no alert on the
                    // success path. The screen names it, draws it, and shows the pace the file resolved
                    // to — everything the old "loaded — 4.2 km, plays at walking pace" alert said, in a
                    // place where it can also be acted on.
                    selected = saved
                }
            case .failure(let failure):
                message = GpsRouteFormat.message(for: failure)
                // A file that couldn't be read or parsed is a visible failure. The GPS tab's import has
                // always reported this; this screen's never did, so importing from the library and hitting
                // a bad GPX left the review ask armed through a moment that plainly went wrong.
                ReviewPrompt.shared.noteTrouble()
            }
        }
    }
}

/// One saved route: its shape, its numbers, and what you can do with it.
///
/// **A route is a shape, and until this screen existed the app never drew one.** Playback was
/// presented as a progress bar and a name, which tells you how far along you are and nothing about
/// where you are going. Recognising a route by its outline is the whole reason a library is worth
/// having.
///
/// Live progress deliberately stays on the GPS tab rather than being mirrored here. That keeps this
/// screen a property sheet for a saved thing — it does not need the status store, the echo gate, or the
/// 3-second poll, and a pushed screen that quietly re-derives all of that is how two views start
/// disagreeing about the same report.
struct GpsRouteDetailView: View {
    @ObservedObject var controller: SpoofController
    /// The entry as loaded. Local state because rename and pace both edit it in place.
    @State var entry: GpsSavedRoute
    /// Called whenever this screen changes the library — a delete, a rename, a pace or repeat edit.
    ///
    /// **Pushed up rather than left to the parent's `onAppear`**, which is the pattern `tally` already
    /// established one level above: whether a `NavigationStack` root re-runs `onAppear` on pop is not
    /// something either screen should be betting a wrong value on. It was called only on delete, which
    /// is why a rename left the GPS tab quoting the old name until the next cold launch — and, because
    /// the name it quotes came from a file a rename doesn't rewrite, past that too.
    let onLibraryChanged: () -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var showRenameSheet = false
    @State private var confirmDelete = false
    @State private var failureMessage: String?
    /// Acknowledges a press here too. Starting a route from this screen has the same one-to-four-second
    /// wait before anything visible changes as it does on the GPS tab.
    @State private var tapFeedback = 0
    /// The *second* half of the haptic pair, and the one this screen was missing.
    ///
    /// The GPS tab fires `.selection` on the press and `.success` when a report confirms the run. Here only
    /// the press buzzed, so the same action felt acknowledged on one screen and answered on the other —
    /// and this is the screen where the confirmation matters most, because the wait is the whole reason
    /// `pending` exists.
    ///
    /// Bumped only on the confirmed path in `awaitConfirmation(of:)`, never on its timeout. A success
    /// haptic for a request that was never answered would be the buzz claiming something the screen
    /// deliberately declines to claim.
    @State private var confirmFeedback = 0
    /// Whether to ask about turning Sync on before starting. Same question the GPS tab asks, same words —
    /// see `View.syncStartDialog`.
    @State private var confirmSyncStart = false
    /// Gates the review report, same key every other trigger uses. Asking someone to rate the app before
    /// they have finished setting it up is asking about something they haven't seen work.
    @AppStorage("spoofOnboardingCompleted") private var reviewOnboardingCompleted = false
    /// The transport action asked for, while no report has confirmed it yet.
    ///
    /// **An earlier version of this carried a pending state for Start and Start Over only**, on the
    /// reasoning that Pause and Resume rewrite `motionState` synchronously so the label flipping is its own
    /// feedback. That was wrong, and wrong in the way this codebase is most careful about: the flip was
    /// driven by the *request*, so the control claimed "paused" before anything had confirmed it, and the
    /// GPS tab — which reads the gate-confirmed report — went on saying the opposite until the echo landed.
    /// Two surfaces disagreeing about one route, with this one asserting the optimistic half.
    ///
    /// So every transport is pending until a report agrees, and the labels come from the confirmed facts on
    /// the controller rather than from what we asked for.
    @State private var pending: GpsPendingAction.Kind?
    /// The watch that clears `pending`. Cancelled on a second press so two taps can't race.
    @State private var pendingWatch: Task<Void, Never>?

    private var coordinates: [CLLocationCoordinate2D] {
        entry.points.map { CLLocationCoordinate2D(latitude: $0.lat, longitude: $0.lon) }
    }

    var body: some View {
        Form {
            Section {
                RouteMapPane(coordinates: coordinates, live: liveCoordinate)
                    .frame(height: 220)
                    .clipShape(RoundedRectangle(cornerRadius: 12, style: .continuous))
                    .listRowInsets(EdgeInsets())
            }

            Section {
                // **This screen used to say nothing about state at all**, which made its Play button a
                // control whose effect was only observable on another screen. Arriving at a route that was
                // already the active one looked identical to arriving at an idle one.
                //
                // Two states now, because "we asked" and "it is happening" are different facts and this
                // screen only had a word for the first. That single "Active route" row showed while Sync
                // was off and nothing was moving anywhere — technically true, and read by the customer as
                // a confirmation that never came.
                //
                // The confirmed signal already existed and this screen was already fetching it:
                // `currentRunConfirmed` is the agent echoing back the run marker we asked for, the same
                // echo discipline the GPS tab gates on. `awaitConfirmation(of:)` polls it to clear a
                // pending transport and then discarded it — so the answer was being fetched and thrown
                // away one row above the place it was needed.
                //
                // Confirmed reads "Following route" rather than a new word, because that is what the
                // Location tab's summary already calls this exact state. One term for one fact across
                // both screens, and no new key to translate.
                if isActive {
                    HStack(spacing: 8) {
                        Image(systemName: playbackConfirmed ? "location.fill" : "circle.dashed")
                            .accessibilityHidden(true)
                        Text(playbackConfirmed ? "Following route" : "Active route")
                            .fontWeight(playbackConfirmed ? .medium : .regular)
                        Spacer()
                    }
                    // Brand tint only once a report has confirmed it. Unconfirmed stays secondary
                    // grey: it is a request in flight, not a fault and not an achievement, and
                    // colouring it would spend the one colour that means "this is working" on
                    // something that might not be.
                    .foregroundStyle(playbackConfirmed ? Color.brand : Color.secondary)
                    .accessibilityElement(children: .combine)
                }
                // The map is decorative to VoiceOver, so these rows have to carry the whole answer.
                LabeledRow(label: "Distance", value: Text(verbatim: GpsRouteFormat.distance(entry.summary.lengthMeters)))
                if let seconds = GpsRouteFormat.estimatedSeconds(entry.summary) {
                    LabeledRow(label: "Duration", value: Text(verbatim: GpsRouteFormat.duration(seconds)))
                }
                // No point count. It is a property of the GPX file rather than of the journey, and
                // nobody decides anything with it: a 4,000-point and a 40-point route that cover the
                // same ground at the same pace play identically. Distance and Duration are what the
                // customer is actually choosing between, and they carry the VoiceOver answer the map
                // can't — which was the only real argument for keeping a third row here.
                pacePicker
                Toggle(isOn: Binding(get: { entry.repeats }, set: { setRepeats($0) })) {
                    Label("Repeat", systemImage: "repeat")
                }
            } header: {
                Text("Route")
            } footer: {
                // **The restart warning survives, but only where it can be true.**
                // `route-seek-agreement.md` committed to it — *"we only stop warning the customer that a
                // pace change restarts the route once we know it doesn't"* — and it is still the honest
                // thing to say to somebody whose computer predates `route_start_travelled_m`, because
                // that agent ignores the seek and replays from the first point.
                //
                // Two conditions, and the previous version had neither right.
                //
                // `agentKeepsPlace` reads the echo's **presence** and nothing else, which is what
                // amendment 2 settled. The old `seekSupported` also required `resumableTravelledM`, and
                // that is `nil` whenever no route is loaded — so merely opening a saved route claimed the
                // agent couldn't seek and printed the warning at customers whose agent seeks perfectly
                // well. That is the false sentence that got reported.
                //
                // `isActive` is the second condition and it is independent of the contract: `persist`
                // restarts nothing behind `guard restartIfPlaying, isActive`, so on a route that isn't the
                // one playing, changing the pace saves a preference and touches no playback. A warning
                // about a restart there describes an event that cannot happen.
                //
                // The positive counterpart is gone deliberately. "Keeps your place on the route" was true
                // but told a customer who just watched their route carry on that it had carried on.
                //
                // Not to be re-litigated: pace and repeat are identical here. `canonicalBytes` hashes
                // `speed` and `repeats` alike, `setPace` and `setRepeats` are the same call into
                // `persist(restartIfPlaying: true)`, and both seed the same seek. Copy claiming one keeps
                // your place and the other doesn't would be inventing a distinction.
                if isActive, !agentKeepsPlace {
                    Text("Changing the pace or repeat starts the route again from the beginning.")
                }
            }

            Section {
                transportControls
                Button(role: .destructive) {
                    confirmDelete = true
                } label: {
                    Label("Delete Route", systemImage: "trash")
                }
                // `role: .destructive` alone does not make this red: the GPS tab applies
                // `.tint(.brand)` at its root and a pushed screen inherits it, which wins.
                .tint(.red)
                // Deliberately *not* disabled alongside the transport. Deleting a playing route is a
                // legitimate thing to want, and `delete()` stops playback first so it can't leave the
                // device walking a route the library no longer has.
            } footer: {
                if !controller.deviceGpsEnabled {
                    Text("Sync is off, so starting this route will ask to turn it on first.")
                }
            }
        }
        .groupedFormStyle()
        .navigationTitle(Text(verbatim: entry.name))
        // Same pair, same order, same triggers as the GPS tab. `sensoryFeedback` fires on a change of the
        // trigger value, so both are plain counters — and both honour the user's System Haptics setting
        // through `UIFeedbackGenerator`, which is why neither needs a check of its own.
        .sensoryFeedback(.selection, trigger: tapFeedback)
        .sensoryFeedback(.success, trigger: confirmFeedback)
        .onDisappear {
            // Leaving abandons the watch. The request is already written and the agent will apply it
            // regardless — this only stops polling for an answer nobody is looking at.
            pendingWatch?.cancel()
            pendingWatch = nil
        }
        // **A confirmed run on this screen is a qualifying occasion.** This screen reported nothing until
        // now, which mattered more once it gained a transport: a paying customer who starts routes from the
        // library never touches the GPS tab, so their success was only counted if they happened to visit
        // it. That is a quieter version of the bug `GpsView.evaluateReviewPrompt` exists to fix.
        //
        // `playbackConfirmed` is the same standard, not a looser one — `currentRunConfirmed` means the agent
        // echoed back the run marker we asked for, so a computer is genuinely driving this phone. Per
        // `.kiro/steering/review-prompts.md`: more triggers from genuine success points, never a looser gate.
        //
        // No presenter attached here. `GpsView` holds one at its root, outside its navigation container, and
        // it stays mounted while this screen is pushed — so the token it publishes is presented from there.
        // A second presenter on a pushed screen would be inside a `NavigationStack`, which is exactly the
        // placement the review action is reported to silently ignore.
        .onChange(of: playbackConfirmed) { _, confirmed in
            guard confirmed, reviewOnboardingCompleted else { return }
            ReviewPrompt.shared.recordSignificantEvent()
        }
        .toolbar {
            // Star before Rename, so the one-tap action sits nearest the edge. In the toolbar rather
            // than as a row in the Route section: that section is the route's *playback* configuration
            // — pace, repeat — and a favourite changes nothing about how it plays. It is filing, which
            // is what a nav-bar affordance is for, and it matches the star the location card already
            // uses on Home right down to `Color.starAccent`.
            ToolbarItem(placement: .primaryAction) {
                Button {
                    toggleFavorite()
                } label: {
                    Label(
                        entry.favorite ? "Remove from Favorites" : "Save as Favorite",
                        systemImage: entry.favorite ? "star.fill" : "star"
                    )
                }
                .tint(entry.favorite ? Color.starAccent : Color.brand)
                // Label styles collapse to the glyph in a toolbar, so the words have to be given to
                // VoiceOver explicitly. Lowercase keys — the app already ships both cases, sentence for
                // spoken labels and title for menu items.
                .accessibilityLabel(entry.favorite ? "Remove from favorites" : "Save as favorite")
            }
            ToolbarItem(placement: .primaryAction) {
                Button {
                    showRenameSheet = true
                } label: {
                    Label("Rename", systemImage: "pencil")
                }
            }
        }
        .sheet(isPresented: $showRenameSheet) {
            GpsRouteRenameSheet(name: entry.name) { newName in
                showRenameSheet = false
                rename(to: newName)
            }
        }
        // **An `alert`, not a `confirmationDialog`** — and the difference is not cosmetic. A
        // `confirmationDialog` presents as a *popover* on iPad, anchored to whichever view carries the
        // modifier. This one is attached at the root of the screen, so it anchored to the whole `Form` and
        // arrived as a pointered bubble at the top of the display, nowhere near the row that was pressed.
        // That is the same defect `syncStartDialog` had, fixed there by moving the modifier onto the
        // button.
        //
        // Moving it would have worked here too. An alert is the better answer because it needs no anchor
        // at all: it presents centred and modal on both iPhone and iPad, so the root attachment becomes
        // correct rather than merely relocated, and there is no arrangement of this screen that can
        // mis-place it again.
        //
        // It also suits the question. An action sheet offers a choice among actions; this is a yes/no about
        // one named object, with the destructive verb repeated on the button — the shape Apple uses for
        // "Delete Note?" and the same shape as the `failureMessage` alert directly below.
        //
        // Same four strings as before, so nothing new to translate. `titleVisibility` is gone because an
        // alert always shows its title.
        .alert("Delete this route?", isPresented: $confirmDelete) {
            // Declaration order doesn't set placement — SwiftUI puts `.cancel` in the conventional
            // position and tints `.destructive` red — but it does set the order VoiceOver reads them.
            Button("Delete Route", role: .destructive) { delete() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This removes it from your library. Your GPX file isn't affected.")
        }
        .alert(
            "Route",
            isPresented: Binding(get: { failureMessage != nil }, set: { if !$0 { failureMessage = nil } })
        ) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(failureMessage ?? "")
        }
    }

    /// Whether *this* entry is the one currently loaded, read through the entity id rather than the
    /// content hash — which is exactly what the entity id is for, since the hash moves when the pace
    /// does and this comparison must not.
    /// Whether this entry is the route currently loaded for playback.
    ///
    /// Named `isActive` rather than `isPlaying` because that is all it can honestly claim: it reads
    /// `motionState`, which is *our request*, not a gate-confirmed report. The device may be paused,
    /// finished, or waiting on a computer that hasn't picked the request up — all of which the GPS tab
    /// distinguishes and this screen deliberately does not try to.
    ///
    /// Compared on the entity id, not the content hash, which is exactly what the entity id is for: the
    /// hash moves when the pace changes and this comparison must not.
    private var isActive: Bool { controller.motionState.savedRouteId == entry.id }

    /// Whether a report has confirmed *this* route's *current* run, rather than us having merely asked.
    ///
    /// Both halves are load-bearing. `isActive` pins it to this entry; `currentRunConfirmed` compares
    /// the echoed run marker against the one we asked for, which is what separates a fresh replay from
    /// the run it replaced — a replay reuses the route id, so the id alone cannot tell them apart.
    ///
    /// This is the signal that makes a present-tense claim defensible here. Without it the screen had
    /// only the request, and a request is what was being shown as confirmation.
    private var playbackConfirmed: Bool { isActive && controller.currentRunConfirmed }

    /// The playback transport, matched to what the route is actually doing.
    ///
    /// **This screen used to offer one button reading "Play Again" whenever the route was loaded**, which
    /// was the correct word for exactly one of the three states it covered. On a route mid-run it invited
    /// you to restart the thing you were watching, and there was no way to pause or stop it without
    /// leaving for the GPS tab — on a screen that names the route, draws it, and now shows a live dot
    /// travelling along it. The file's own note about the earlier version of this applies: a control whose
    /// effect is only observable on another screen is the problem, and so is state with no control beside
    /// it.
    ///
    /// **"Start Over", never "Play Again".** The GPS tab may say "Play Again" because its status store
    /// tells it the run finished; that word is a lie on a route still going. "Start Over" is true in every
    /// state, which is what lets this screen offer a replay without needing to know which one it is in.
    ///
    /// Ordered by what a customer reaching this screen mid-run most likely wants: hold it, then send it
    /// back to the start, then end it. Stop is last and destructive-tinted, matching the GPS tab.
    @ViewBuilder
    private var transportControls: some View {
        if isActive {
            // Pause is meaningless on a spent run — the agent has nothing left to hold — so a finished
            // route is offered the replay instead. This is the one thing the screen cannot work out for
            // itself, and `confirmedRouteFinished` is a report-only fact carried on the controller for
            // exactly this: see `GpsMotionSample.routeFinished`.
            if controller.confirmedRouteFinished {
                EmptyView()
            } else if controller.confirmedRoutePaused {
                transportButton(.resume, "Resume", systemImage: "play.fill") {
                    controller.resumeGpsRoute()
                    awaitConfirmation(of: .resume)
                }
                .accessibilityHint("Continues from where the route paused")
            } else {
                transportButton(.pause, "Pause", systemImage: "pause.fill") {
                    controller.pauseGpsRoute()
                    awaitConfirmation(of: .pause)
                }
                .accessibilityHint("Waits here. Your phone's location stays spoofed")
            }

            transportButton(.restart, "Start Over", systemImage: "arrow.counterclockwise") {
                controller.restartGpsRoute()
                awaitConfirmation(of: .restart)
            }
            .accessibilityHint("Begins this route from its start")

            transportButton(.stop, "Stop Route", systemImage: "stop.fill", role: .destructive) {
                controller.stopGpsRoute()
            }
            .tint(.red)
            .accessibilityHint("Ends the route. Your phone stays where the route left it")
        } else {
            transportButton(.start, "Start Route", systemImage: "play.fill") {
                // Same dead end as the GPS tab's Start Route, and worse here: `play()` reports only a
                // *validation* failure, and there is none — the route is fine, Sync is off. So this
                // button used to give a haptic and then nothing at all.
                if controller.deviceGpsEnabled {
                    play()
                } else {
                    confirmSyncStart = true
                }
            }
            .accessibilityHint("Begins this route from its start")
            // **Attached to the button, not to the `Form`.** A `confirmationDialog` presents as a popover
            // on iPad, anchored to the view carrying the modifier — so hanging it on the whole form
            // anchored it to the form, and the sheet appeared up beside the status row instead of at the
            // control that was pressed. A popover pointing somewhere the finger never went reads as a
            // different button's dialog.
            .syncStartDialog(isPresented: $confirmSyncStart) {
                controller.setDeviceGpsEnabled(true)
                play()
            }
        }
    }

    /// One transport control, with the pending treatment applied uniformly.
    ///
    /// A sibling of the GPS tab's `motionButton` rather than a share of it: that one resolves its pending
    /// state from a status store this screen deliberately doesn't have, and lifting the difference into a
    /// shared type would mean giving it a store or a second confirmation path. What is worth keeping
    /// identical is the *presentation*, so the labels come from the same `GpsPendingAction.Kind` and the
    /// dimming matches.
    private func transportButton(
        _ kind: GpsPendingAction.Kind,
        _ title: LocalizedStringKey,
        systemImage: String,
        role: ButtonRole? = nil,
        action: @escaping () -> Void
    ) -> some View {
        let isPending = pending == kind
        return Button(role: role) {
            tapFeedback += 1
            action()
        } label: {
            HStack(spacing: 8) {
                Label(isPending ? kind.progressLabel : title, systemImage: systemImage)
                if isPending {
                    Spacer()
                    ProgressView()
                        .controlSize(.small)
                        // The label already says what's happening, and VoiceOver reads it.
                        .accessibilityHidden(true)
                }
            }
        }
        // Every transport control, not just the pending one: while a start is unconfirmed they are all
        // asking about the same run, and leaving the others live invites a contradictory second
        // instruction queued behind the first.
        .disabled(pending != nil)
        // `.disabled` alone does not dim these — this screen inherits `.tint(.brand)` and Stop adds
        // `.tint(.red)`, and a tinted label in a `Form` row keeps its colour when disabled. Without this
        // the block sits at full strength while refusing every tap.
        .opacity(pending != nil ? 0.45 : 1)
    }

    /// Where to draw the live dot, or `nil` for no dot.
    ///
    /// `controller.location` is the right source here and it is worth saying why, because it is also the
    /// wrong source one condition away. `adoptMotionCoordinate` overwrites that coordinate with the
    /// position the agent reported — that is its entire job, and it clears `locationName` for the same
    /// reason — so during a confirmed, freshly-reported run it *is* the device. Outside one it is the
    /// place the customer picked, and a dot drawn there would sit at the route's seed pretending to be
    /// the device.
    ///
    /// `isActive` pins it to this route; `isReportingLivePosition` pins it to a run we asked for and a
    /// report recent enough to still speak for the present. A sleeping computer stops reporting without
    /// announcing it, and that case ages out here rather than freezing a dot that claims to be live.
    private var liveCoordinate: CLLocationCoordinate2D? {
        guard isActive, controller.isReportingLivePosition, let live = controller.location else {
            return nil
        }
        return CLLocationCoordinate2D(latitude: live.latitude, longitude: live.longitude)
    }

    /// Whether a pace or repeat change will restart the run rather than carrying on from where the device
    /// is — i.e. whether this computer applies `route_start_travelled_m`.
    ///
    /// **Presence of the echo is the whole signal**, per round two of
    /// `.kiro/specs/device-gps-motion/route-seek-agreement.md`: *"Read the echo for 'was it honoured', read
    /// `travelled_m` for 'where is it'."* A supporting agent always populates the field while a route
    /// plays, `Some(0.0)` included, precisely so presence can mean "this agent seeks" — that was the gap
    /// the app side asked to have closed, and it was closed.
    ///
    /// An earlier version of this ANDed in `resumableTravelledM != nil`, fusing the two questions the
    /// amendment separated. The consequence was the copy bug this replaced: `resumableTravelledM` is `nil`
    /// whenever no route is loaded, so simply opening a saved route reported that the agent could not seek
    /// and printed a restart warning at somebody whose computer restarts nothing.
    ///
    /// This screen has no status store of its own, so the echo arrives via `SpoofController`, observed on
    /// the motion-sync read path — see `GpsMotionSample.seekSupported`.
    private var agentKeepsPlace: Bool { controller.agentSupportsSeek }

    @ViewBuilder
    private var pacePicker: some View {
        // `asRecorded` is offered only when the file has a usable timeline. Offering it otherwise lets
        // someone pick a pace that silently becomes walking, the misleading outcome
        // `speed_defaulted` exists to warn about.
        let options = GpsRoutePace.allCases.filter { $0 != .asRecorded || entry.hasTimings }
        Picker(selection: Binding(get: { entry.speed.pace }, set: { setPace($0) })) {
            ForEach(options) { pace in
                if let mps = pace.mps {
                    // Concatenated `Text`, never `Text("\(a) — \(b)")`: interpolating derives the
                    // context-free catalog key `%@ — %@`, which is unusable for a translator and
                    // collides with every other two-part label. Both halves are already localised or
                    // formatted, so `verbatim` is right here.
                    (
                        Text(verbatim: GpsRouteFormat.paceLabel(pace))
                            + Text(verbatim: " — ")
                            + Text(verbatim: GpsRouteFormat.duration(entry.summary.lengthMeters / mps))
                    ).tag(pace)
                } else {
                    Text(verbatim: GpsRouteFormat.paceLabel(pace)).tag(pace)
                }
            }
        } label: {
            Label("Pace", systemImage: "speedometer")
        }
    }

    private func setPace(_ pace: GpsRoutePace) {
        guard entry.speed.pace != pace else { return }
        var updated = entry
        updated.speed = pace.speed
        persist(updated, restartIfPlaying: true)
    }

    private func setRepeats(_ repeats: Bool) {
        guard entry.repeats != repeats else { return }
        var updated = entry
        updated.repeats = repeats
        persist(updated, restartIfPlaying: true)
    }

    /// Star or unstar this route.
    ///
    /// Goes through `persist(restartIfPlaying: false)` for the same reason `rename` does: `favorite` is
    /// outside the content id, so starring the route you are currently running must not restart it. That
    /// also means the parents hear about it — `persist` reports every library edit — so the list has
    /// reordered by the time you navigate back.
    private func toggleFavorite() {
        tapFeedback += 1
        var updated = entry
        updated.favorite.toggle()
        persist(updated, restartIfPlaying: false)
    }

    private func rename(to newName: String) {
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty, trimmed != entry.name else { return }
        var updated = entry
        updated.name = trimmed
        // `restartIfPlaying: false` — `name` is excluded from the content id precisely so a rename
        // can't restart a route somebody is in the middle of.
        persist(updated, restartIfPlaying: false)
    }

    /// Write an edit to the library, and re-materialise the playback route when this entry is the one
    /// playing and the edit changed how it plays.
    private func persist(_ updated: GpsSavedRoute, restartIfPlaying: Bool) {
        if let failure = GpsRouteStore.shared.save(updated) {
            failureMessage = Self.message(for: failure)
            return
        }
        entry = updated
        // Every edit, not just the ones that restart playback. A rename deliberately changes neither
        // the content id nor the entity id, so nothing downstream can notice it by watching state —
        // saying so explicitly is the only way the parents find out.
        onLibraryChanged()
        guard restartIfPlaying, isActive else { return }
        // Goes through `startGpsRoute` rather than `changeGpsRoutePace`, because the entry is already
        // saved and that method would write it a second time.
        //
        // **`resumingAt` closes the seam this screen used to have.** Pace and repeat are both in the
        // shared content id, so changing either is a new route to the agent and a new run — but a new run
        // can now begin partway along. Before `lastConfirmedTravelledM` existed, only the GPS tab could
        // supply that distance, so the same action preserved position there and restarted here.
        //
        // `nil` when nothing has been confirmed yet, which correctly means "start over": that is the only
        // honest answer when no report has said where the device is.
        if let failure = controller.startGpsRoute(
            updated.playbackRoute(),
            savedRouteId: updated.id,
            startTravelledM: controller.resumableTravelledM
        ) {
            failureMessage = GpsRouteFormat.message(for: failure)
        }
    }

    /// Start this route, and stay put.
    ///
    /// **This used to dismiss**, on the reasoning that popping was the feedback. That was wrong twice over.
    /// It threw the customer off a screen they had deliberately navigated to, and because this screen has
    /// two parents — the library list, and the GPS tab's route row — the same press landed you somewhere
    /// different depending on where you came from. That inconsistency is what made the two entry points
    /// feel unstandardized; the paths were fine, the exit wasn't.
    ///
    /// Two parents is a normal shape for an iOS detail screen and both are kept: back returns you where you
    /// came from, and routing the active route through the list would add a tap to the commonest journey.
    ///
    /// The feedback the dismissal was standing in for now exists properly: the status row flipping to
    /// "Following route", the transport swapping Start Route for the Pause/Start Over/Stop set, and
    /// `pending` for the case neither covers — replaying a route that was *already* active, where nothing
    /// about the screen would otherwise change.
    private func play() {
        if let failure = controller.startGpsRoute(entry.playbackRoute(), savedRouteId: entry.id) {
            failureMessage = GpsRouteFormat.message(for: failure)
            return
        }
        awaitConfirmation(of: .start)
    }

    /// Hold the in-flight state until a report confirms the run, or long enough that it clearly won't.
    ///
    /// Confirmation comes from `SpoofController.currentRunConfirmed`, which compares the run marker the
    /// agent echoed against the one we asked for. That is the same echo discipline the GPS tab uses — this
    /// screen just reads it off the controller rather than holding a status store, because the motion sync
    /// that populates it runs at the app root regardless of which tab is on screen.
    private func awaitConfirmation(of kind: GpsPendingAction.Kind) {
        pendingWatch?.cancel()
        // Nothing to wait for with Sync off: `desired.json`'s `enabled` is `deviceGpsEnabled && …`, so the
        // agent is being correctly told to do nothing and no report will ever say otherwise. The GPS tab
        // documents the same guard — spinning for ten seconds then blaming the computer for something the
        // app could see at the moment of the tap is worse than not spinning.
        guard controller.deviceGpsEnabled else { return }
        pending = kind
        pendingWatch = Task { @MainActor in
            let deadline = Date().addingTimeInterval(10)
            while !Task.isCancelled, Date() < deadline {
                if isConfirmed(kind) {
                    // Here and not after the loop: this is the branch where a report actually answered.
                    confirmFeedback += 1
                    pending = nil
                    return
                }
                try? await Task.sleep(nanoseconds: 400_000_000)
            }
            // Silence rather than an error. The route may well be doing what was asked — a stale or slow
            // report can't tell us otherwise — and the GPS tab is where an unanswered request gets named.
            pending = nil
        }
    }

    /// Whether a report now shows what the request asked for.
    ///
    /// Mirrors `GpsPendingAction.isConfirmed(by:)` deliberately, but reads the confirmed scalars the
    /// controller publishes rather than a `GpsMotionDetail` — this screen has no status store, and the
    /// motion sync that feeds those scalars runs at the app root regardless of which tab is on screen.
    ///
    /// One consequence worth knowing: the sync's own cadence is about three seconds and this screen has no
    /// equivalent of the tab's `startPollBurst`, so a spinner here can sit a beat longer than the same one
    /// on the tab. That is a slower truth, not a different one.
    private func isConfirmed(_ kind: GpsPendingAction.Kind) -> Bool {
        switch kind {
        case .pause:
            return controller.confirmedRoutePaused
        case .resume:
            return !controller.confirmedRoutePaused && !controller.confirmedRouteFinished
        case .start, .restart:
            // The marker has to be the *new* run's, which `currentRunConfirmed` enforces — so a confirmed
            // run that is neither held nor over is this one rather than the one it replaced.
            return controller.currentRunConfirmed
                && !controller.confirmedRoutePaused
                && !controller.confirmedRouteFinished
        case .stop:
            // Never entered. `stopGpsRoute` clears the run locally, so `isActive` goes false and this whole
            // transport is replaced by Start Route — there is no control left to hang a spinner on. An
            // unanswered stop is named on the GPS tab, which keeps its section through the transition.
            return true
        }
    }

    private func delete() {
        // Stop playback first when this is the route running, or the device keeps walking a route the
        // library no longer has — and nothing on screen would be able to name it.
        if isActive { controller.stopGpsRoute() }
        GpsRouteStore.shared.delete(id: entry.id)
        onLibraryChanged()
        dismiss()
    }

    static func message(for failure: GpsRouteSaveFailure) -> String {
        switch failure {
        case .libraryFull(let limit):
            return String(localized: "Your library is full at \(limit) routes. Delete one to save another.")
        case .invalid:
            return String(localized: "That route couldn't be saved to your library.")
        case .writeFailed:
            return String(localized: "That route couldn't be saved on this device.")
        }
    }
}

/// The route map as it appears on the detail screen: a window that can be opened.
///
/// Mirrors `LocationMapPane`'s affordance rather than inventing a second one — the same glyph in the
/// same glass circle in the same corner, and the same "Expand map to full screen" label — because a
/// customer who has opened the location map on Home should not have to discover this one separately.
///
/// The inline map stays non-interactive; the expanded one is where panning belongs. That split is the
/// point of having an expander at all: watching the dot move needs a map you can zoom into, and a
/// zoomable map inside a scrolling `Form` fights the scroll for every gesture.
private struct RouteMapPane: View {
    let coordinates: [CLLocationCoordinate2D]
    var live: CLLocationCoordinate2D?

    @State private var fullScreen = false

    var body: some View {
        ZStack(alignment: .topTrailing) {
            RoutePolylineMap(coordinates: coordinates, live: live)
            Image(systemName: "arrow.up.left.and.arrow.down.right")
                .font(.system(size: 13, weight: .semibold))
                .foregroundStyle(.primary)
                .frame(width: 36, height: 36)
                .glassCircle()
                .padding(10)
                .allowsHitTesting(false)
        }
        .contentShape(Rectangle())
        .onTapGesture { fullScreen = true }
        // One element, and a button. The map itself was previously hidden from assistive technologies
        // outright, which was right while it was a picture and wrong the moment it became a control.
        .accessibilityElement()
        .accessibilityAddTraits(.isButton)
        .accessibilityLabel("Expand map to full screen")
        .fullScreenCover(isPresented: $fullScreen) {
            RouteFullScreenMap(coordinates: coordinates, live: live)
        }
    }
}

/// The route map, full bleed and pannable, with the dot still on it.
///
/// Deliberately thin: no controls beyond Close. Everything that acts on a route — pace, repeat, play,
/// delete — stays on the detail screen behind this, because a control that only exists in a
/// fullscreen presentation is a control most people never find.
private struct RouteFullScreenMap: View {
    let coordinates: [CLLocationCoordinate2D]
    var live: CLLocationCoordinate2D?

    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ZStack(alignment: .topTrailing) {
            RoutePolylineMap(coordinates: coordinates, live: live, interactive: true)
                .ignoresSafeArea()
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 40, height: 40)
                    .glassCircle()
            }
            .padding(.trailing, 16)
            .padding(.top, 8)
            // Same key the location map's close control uses.
            .accessibilityLabel("Close map")
        }
    }
}

/// A route drawn on a map, framed to fit.
///
/// Split out so the `mapRenderSizeGate()` requirement and the camera framing live in one place rather
/// than at every call site. The gate is not optional: MapKit's multisampled render pass asserts on a
/// zero-width drawable, which a `Form` row can briefly hand it during layout.
struct RoutePolylineMap: View {
    let coordinates: [CLLocationCoordinate2D]
    /// The device's position, when a recent report vouched for it. `nil` draws no dot at all.
    ///
    /// **Absent must stay absent.** The only other coordinate to hand is the one in
    /// `controller.location`, which outside a confirmed run is the *chosen* place rather than where the
    /// device is — drawing that would put a "you are here" dot at the spot the route started and leave
    /// it there. `SpoofController.isReportingLivePosition` is the gate, and it exists so this decision
    /// is made once rather than at every map.
    var live: CLLocationCoordinate2D?
    /// Whether the map responds to pan and zoom. `false` inside a `Form`, where a pannable map steals
    /// the scroll gesture; `true` in the fullscreen presentation, which is the whole reason to open it.
    var interactive: Bool = false

    /// Turns the three-second-apart fixes into travel. See `SmoothedPosition` — MapKit re-places an
    /// annotation the instant its coordinate changes, so without this the dot stepped along the route
    /// instead of following it.
    @StateObject private var smoothed = SmoothedPosition()

    var body: some View {
        Map(initialPosition: .rect(Self.boundingRect(coordinates))) {
            if coordinates.count > 1 {
                MapPolyline(coordinates: coordinates)
                    .stroke(Color.brand, lineWidth: 4)
            }
            if let first = coordinates.first {
                Marker("Start", systemImage: "flag.fill", coordinate: first)
                    .tint(Color.brand)
            }
            // Only when there is a distinct end to mark: a single-point route would otherwise get two
            // pins stacked on one spot, and a loop's finish is its start.
            if let last = coordinates.last, coordinates.count > 1 {
                Marker("Finish", systemImage: "flag.checkered", coordinate: last)
                    .tint(Color.mapHighlight)
            }
            // Last in the builder, which puts it above the **polyline** — overlays and annotations are
            // different layers and that much is reliable.
            //
            // **It does not guarantee it draws above the two flags, and nothing public does.** MapKit
            // exposes no z-index for annotations: `mapOverlayLevel` applies to overlays like the polyline
            // above, not to `Marker` or `Annotation`. Apple's own forum answer is that annotation order
            // follows *latitude*, southernmost on top — undocumented, and not something to build on.
            //
            // So at a start or finish line the dot can be covered, and the fix is deliberately not
            // attempted here. The options were reordering by latitude (relying on undocumented
            // behaviour), hiding a flag when the dot is near it (the threshold is metres, the overlap is
            // pixels, so it is wrong at some zoom), or lifting the dot out of the map entirely with
            // `MapReader` + `MapProxy.convert(_:to:)` and drawing it as a SwiftUI overlay — the only
            // deterministic answer, and the only one that is fully public API. That last one is the
            // upgrade path if this ever matters enough; it costs a camera-change subscription to keep
            // the screen point current.
            if let shown = smoothed.coordinate ?? live {
                Annotation(coordinate: shown) {
                    // Shared with the Location tab's map, so the two surfaces that can show a moving
                    // device agree on what "moving right now" looks like.
                    LivePositionDot()
                } label: {
                    // No callout text. The row above the map already states the status in words, and a
                    // title here would print a label on the map beside the dot.
                    EmptyView()
                }
            }
        }
        // **Flat, always, with no 3D control anywhere on this screen.** Elevation was `.automatic` here,
        // which lets MapKit tilt into terrain on its own judgement — so a route map could quietly become a
        // 3D scene, and the live dot could be occluded by the mesh, for reasons no customer took an action
        // to cause.
        //
        // A route is a shape a few kilometres across. Flat is simply the better view of one: the polyline
        // reads as a line rather than as something draped over relief, and nothing about a loop in a park
        // benefits from a curved planet. That is also why the fullscreen route map gets no globe toggle
        // while the location map does — the location map can be showing a place on the other side of the
        // world, and a route never is.
        .mapStyle(.standard(elevation: .flat, pointsOfInterest: .excludingAll))
        .allowsHitTesting(interactive)
        .onAppear { smoothed.track(live) }
        // Keyed rather than on `live` directly, because `CLLocationCoordinate2D` isn't `Equatable`.
        // Passing `nil` when the dot goes away cancels any glide in flight, so it can't keep drifting
        // toward a fix nothing vouches for.
        .onChange(of: CoordinateKey(live)) { _, _ in smoothed.track(live) }
        .mapRenderSizeGate()
    }

    /// A rect containing the whole route, padded so the stroke isn't flush against the edges.
    ///
    /// Falls back to a small rect around the origin for an empty route, which can't be drawn anyway —
    /// `MKMapRect.null` would make MapKit frame the entire globe.
    static func boundingRect(_ coordinates: [CLLocationCoordinate2D]) -> MKMapRect {
        guard !coordinates.isEmpty else {
            return MKMapRect(origin: MKMapPoint(CLLocationCoordinate2D(latitude: 0, longitude: 0)),
                             size: MKMapSize(width: 1_000_000, height: 1_000_000))
        }
        let rect = coordinates.reduce(MKMapRect.null) { partial, coordinate in
            let point = MKMapPoint(coordinate)
            return partial.union(MKMapRect(origin: point, size: MKMapSize(width: 0, height: 0)))
        }
        // A single-point route has a zero-size rect, which frames the whole world. Give it a span.
        if rect.size.width < 1 || rect.size.height < 1 {
            return MKMapRect(
                origin: MKMapPoint(x: rect.origin.x - 2_000, y: rect.origin.y - 2_000),
                size: MKMapSize(width: 4_000, height: 4_000)
            )
        }
        return rect.insetBy(dx: -rect.size.width * 0.15, dy: -rect.size.height * 0.15)
    }
}

extension View {
    /// Asks to turn Sync on, then starts the route — the answer to tapping Start Route while device GPS
    /// is off.
    ///
    /// **A dialog rather than an alert, and this is the whole point.** An alert can only say "go and turn
    /// on Sync", leaving the customer to find a toggle in another section and then come back and press
    /// Start again. A dialog does what they asked for in one tap.
    ///
    /// **And a dialog rather than just doing it silently.** Sync moves the device's *real* system GPS,
    /// which every app sees including Find My. That is not a reasonable side effect of a play button, and
    /// the confirmation is where the disclosure lives.
    ///
    /// Shared between the GPS tab and the route detail screen because both offer Start Route and both hit
    /// the identical dead end. Two copies of this question would drift in wording, and the wording is
    /// carrying a consequence.
    func syncStartDialog(isPresented: Binding<Bool>, onConfirm: @escaping () -> Void) -> some View {
        confirmationDialog(
            "Turn on Sync to start this route?",
            isPresented: isPresented,
            titleVisibility: .visible
        ) {
            Button("Turn On and Start") { onConfirm() }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("Your iPhone's real GPS will follow the route. Every app sees it, including Find My.")
        }
    }
}

/// Rename a saved route. Modelled on `RenameFavoriteSheet`, which is the app's established shape for
/// this exact interaction.
struct GpsRouteRenameSheet: View {
    let name: String
    let onSave: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text: String = ""

    var body: some View {
        AdaptiveNavigationStack {
            Form {
                Section("Name") {
                    TextField("Name this route", text: $text)
                }
            }
            .groupedFormStyle()
            .navigationTitle("Rename Route")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(text) }
                        .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
        .tint(.brand)
        .onAppear { text = name }
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
                    // Deep-links to the App Store's own review sheet — the system path, not a prompt of
                    // ours, and unconditionally available to everyone who finds this screen. See the
                    // review-prompt rules: nothing here asks how the user feels first.
                    OutboundLinkRow(
                        title: "Rate GeoSpoof",
                        systemImage: "star",
                        destination: URL(
                            string: "https://apps.apple.com/app/id6765719745?action=write-review&pt=128299974&ct=ios-app-settings")!,
                        // The one row here that doesn't open a web page, and the hint has to say so.
                        hint: "Opens the App Store"
                    )
                    OutboundLinkRow(
                        title: "View Source on GitHub",
                        systemImage: "chevron.left.forwardslash.chevron.right",
                        destination: URL(string: "https://github.com/anthonysgro/geospoof")!
                    )
                }

                Section {
                    OutboundLinkRow(
                        title: "Give Feedback",
                        systemImage: "text.bubble",
                        destination: URL(string: "https://www.geospoof.com/feedback?utm_source=ios-app&utm_medium=app&utm_campaign=feedback")!
                    )
                    OutboundLinkRow(
                        title: "Help & Support",
                        systemImage: "questionmark.circle",
                        destination: URL(string: "https://www.geospoof.com/support?utm_source=ios-app&utm_medium=app&utm_campaign=support")!
                    )
                    OutboundLinkRow(
                        title: "Privacy Policy",
                        systemImage: "hand.raised",
                        destination: URL(string: "https://www.geospoof.com/privacy?utm_source=ios-app&utm_medium=app&utm_campaign=privacy")!
                    )
                    OutboundLinkRow(
                        title: "Terms of Service",
                        systemImage: "doc.text",
                        destination: URL(string: "https://www.geospoof.com/terms?utm_source=ios-app&utm_medium=app&utm_campaign=terms")!
                    )
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
        // `LocationView`. Debug-only, so release builds keep exactly one presenter.
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
