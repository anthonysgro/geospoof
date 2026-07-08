//
//  SceneDelegate.swift
//  iOS (App)
//
//  Created by Anthony on 5/1/26.
//

import Combine
import SwiftUI
import UIKit

class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    var window: UIWindow?

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession, options connectionOptions: UIScene.ConnectionOptions) {
        guard let windowScene = (scene as? UIWindowScene) else { return }

        let window = UIWindow(windowScene: windowScene)
        window.rootViewController = UIHostingController(rootView: RootView())
        self.window = window
        window.makeKeyAndVisible()

        // Cold launch via a widget deep link (e.g. a locked free user tapping
        // "Tap to upgrade", which opens geospoof://paywall).
        handlePaywallDeepLink(connectionOptions.urlContexts)
    }

    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        // Warm open via a widget deep link.
        handlePaywallDeepLink(URLContexts)
    }

    /// Surface the Pro paywall when a widget's `geospoof://paywall` link opens
    /// the app. Handled here (not via SwiftUI `.onOpenURL`, which fires
    /// inconsistently from widgets) and bridged to RootView through AppRouter.
    private func handlePaywallDeepLink(_ contexts: Set<UIOpenURLContext>) {
        let wantsPaywall = contexts.contains { ctx in
            ctx.url.scheme == "geospoof" && ctx.url.host == "paywall"
        }
        guard wantsPaywall else { return }
        Task { @MainActor in
            AppRouter.shared.showPaywall = true
        }
    }

}

// MARK: - SwiftUI

struct RootView: View {
    @StateObject private var controller = SpoofController()
    @ObservedObject private var router = AppRouter.shared
    @AppStorage("appearanceMode") private var appearance: AppearanceMode = .system

    var body: some View {
        TabView {
            HomeView(controller: controller)
                .tabItem {
                    Label("Home", systemImage: "house")
                }

            SiteFiltersView(controller: controller, title: "Browser", showBrowserSettings: true)
                .tabItem {
                    Label("Browser", systemImage: "globe")
                }

            // GPS sits in the center (5 tabs: Home · Browser · GPS · Details · Settings) and
            // reuses Home's old location glyph. Placeholder for now — the real device-GPS UI
            // is the GeoSpoof GPS work.
            GpsView(controller: controller)
                .tabItem {
                    Label("GPS", systemImage: "location.circle")
                }

            DetailsTab(controller: controller)
                .tabItem {
                    Label("Details", systemImage: "list.bullet.rectangle")
                }

            SettingsView(controller: controller)
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
        }
        .onAppear {
            applyInterfaceStyle(appearance)
            // A locked control (which can't open the app itself) may have left a
            // paywall request; surface it now.
            if WidgetPaywallRequest.consume() { router.showPaywall = true }
        }
        .onChange(of: appearance) { newValue in applyInterfaceStyle(newValue) }
        .onReceive(NotificationCenter.default.publisher(for: UIApplication.didBecomeActiveNotification)) { _ in
            if WidgetPaywallRequest.consume() { router.showPaywall = true }
        }
        .sheet(isPresented: $router.showPaywall) {
            ProPaywallView()
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

    var displayName: String {
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

    var body: some View {
        AdaptiveNavigationStack {
            SpoofControlPanel(controller: controller)
                .navigationTitle("GeoSpoof")
        }
    }
}

// MARK: - GPS (device / system GPS spoofing via the GeoSpoof GPS desktop agent)

/// Redacted device summary from the agent's status report.
struct GpsDeviceSummary: Codable, Equatable {
    var name: String
    var productType: String
    var iosVersion: String
    enum CodingKeys: String, CodingKey {
        case name
        case productType = "product_type"
        case iosVersion = "ios_version"
    }
}

/// The status the GeoSpoof GPS desktop agent writes back into this app's Documents
/// as `status.json` over AFC (design §13e). Mirrors the agent's `StatusReport`.
struct GpsStatus: Codable, Equatable {
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
    enum CodingKeys: String, CodingKey {
        case version
        case agentVersion = "agent_version"
        case connected, device, session, provenance, remediation, error, pro
        case updatedAt = "updated_at"
    }
}

/// One controller (Mac) entry from the agent roster under
/// `Documents/controllers/<id>.json` (controller-arbitration). Mirrors the agent's
/// `ControllerReport`: identity (`id`, `name`) plus a flattened `StatusReport` — the same
/// flat JSON decodes into both the identity fields here and a `GpsStatus`.
struct GpsController: Identifiable, Equatable {
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

/// Reads the agent roster from this app's `Documents/controllers/` (each Mac writes one
/// `<id>.json` self-file over AFC — controller-arbitration). Exposes the fresh roster plus
/// a single display `status`: the user-selected controller's, or the sole controller's when
/// only one is present. If it goes stale/empty the Mac agent isn't running, so the feature
/// reads as "waiting for your Mac".
@MainActor
final class GpsStatusStore: ObservableObject {
    /// The display status: the selected (owner) controller's, or the sole controller's.
    @Published private(set) var status: GpsStatus?
    /// The fresh roster of Macs currently able to drive this phone.
    @Published private(set) var controllers: [GpsController] = []
    /// True when there's no fresh display status (no owner/sole controller present).
    @Published private(set) var isStale = true

    /// The agent refreshes each self-file well within this window; older ⇒ that Mac is gone.
    static let freshWindow: TimeInterval = 20

    /// Reload the roster and resolve the display status for `selectedId` (the user's chosen
    /// controlling Mac, or nil for auto/sole).
    func reload(selectedId: String?) {
        controllers = Self.readRoster()
        // Display status: the explicitly-selected controller if it's present; else, when
        // exactly one controller is present, that sole one; else none (ambiguous — the UI
        // asks the user to choose).
        let owner: GpsController?
        if let selectedId, let picked = controllers.first(where: { $0.id == selectedId }) {
            owner = picked
        } else if controllers.count == 1 {
            owner = controllers.first
        } else {
            owner = nil
        }
        status = owner?.status
        isStale = owner == nil
    }

    /// Read + freshness-filter every `controllers/<id>.json`. Empty if the directory is
    /// absent (no Mac has announced yet). The `.json` filter also skips the agent's
    /// hidden `.<id>.json.tmp` atomic-write scratch files.
    private static func readRoster() -> [GpsController] {
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
private enum GpsPhase: Equatable {
    case notPro
    case waitingForMac
    /// Two or more Macs can drive this phone and none is chosen (or the chosen one left):
    /// the user must pick which Mac controls it (controller-arbitration).
    case chooseController
    case setupNeeded(String)
    case ready
    case spoofing
    case lost
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

    /// Where to send users to get the desktop app. TODO: confirm final URL.
    private let downloadURL = URL(string: "https://www.geospoof.com/gps")!
    /// Support contact for founders whose grant can't be auto-verified on this device
    /// (see `founderSupportLink`). TODO: confirm final URL.
    private let supportURL = URL(string: "https://www.geospoof.com/support")!
    /// Feedback for this (experimental) feature.
    private let feedbackURL = URL(string: "https://www.geospoof.com/feedback")!
    private let refreshTimer = Timer.publish(every: 3, on: .main, in: .common).autoconnect()

    var body: some View {
        AdaptiveNavigationStack {
            Form {
                experimentalSection
                switch phase {
                case .notPro:
                    proPitchSection
                case .waitingForMac:
                    aboutSection
                    waitingSection
                case .chooseController:
                    chooseControllerSection
                case .setupNeeded(let message):
                    setupNeededSection(message)
                    controllingMacSection
                    syncToggleSection
                case .ready:
                    connectedSection(active: false)
                    controllingMacSection
                    syncToggleSection
                case .spoofing:
                    connectedSection(active: true)
                    controllingMacSection
                    syncToggleSection
                case .lost:
                    lostSection
                    controllingMacSection
                    syncToggleSection
                }
            }
            .groupedFormStyle()
            .tint(.brand)
            .navigationTitle("GPS")
            .onAppear { refreshStatus() }
            .onReceive(refreshTimer) { _ in refreshStatus() }
        }
    }

    /// Reload the roster for the current selection, then keep the selection sensible as the
    /// roster changes (auto-drive a sole Mac; drop a selection whose Mac has left).
    private func refreshStatus() {
        statusStore.reload(selectedId: controller.selectedControllerId)
        reconcileSelection()
    }

    /// Keep the controlling-Mac selection consistent with who's actually present:
    ///   * exactly one Mac ⇒ it drives automatically (clear any explicit pick, so the
    ///     agent's sole-controller path applies and a departed Mac fails over cleanly);
    ///   * two+ Macs ⇒ drop a selection that names a Mac no longer present (the UI then
    ///     re-prompts); a valid selection is kept.
    private func reconcileSelection() {
        let present = statusStore.controllers
        switch present.count {
        case 0:
            break // waiting for a Mac; keep the selection for when one returns
        case 1:
            if controller.selectedControllerId != nil { controller.setSelectedController(nil) }
        default:
            if let sel = controller.selectedControllerId,
               !present.contains(where: { $0.id == sel }) {
                controller.setSelectedController(nil)
            }
        }
    }

    /// Two+ Macs present and no valid choice ⇒ the user must pick which one controls.
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
        // Resolve the "which Mac" ambiguity before reading a single status.
        if needsControllerChoice { return .chooseController }
        guard let s = statusStore.status, !statusStore.isStale else { return .waitingForMac }
        if s.session == "lost" { return .lost }
        if !s.connected {
            return .setupNeeded(s.remediation.isEmpty ? "Connecting to your iPhone…" : s.remediation)
        }
        if s.session == "spoofing" { return .spoofing }
        if !s.remediation.isEmpty { return .setupNeeded(s.remediation) }
        return .ready
    }

    // MARK: Sections

    /// Always-visible banner: device GPS needs a Mac + a one-time pairing and rides Apple's
    /// developer tooling, so we set the expectation up front that it's still experimental.
    private var experimentalSection: some View {
        Section {
            Label {
                Text("Experimental feature")
            } icon: {
                Image(systemName: "flask.fill")
            }
            .font(.subheadline)
            .foregroundColor(.secondary)

            Link(destination: feedbackURL) {
                Label("Give Feedback", systemImage: "text.bubble")
            }
            Link(destination: supportURL) {
                Label("Contact Support", systemImage: "questionmark.circle")
            }
        } footer: {
            Text("Device GPS is new — tell us what’s working or what isn’t.")
        }
    }

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
            Link("Contact support", destination: supportURL)
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
                    Text("Move your iPhone’s real system GPS to your spoof location, driven from the GeoSpoof GPS app on your Mac.")
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
    private var proPitchSection: some View {
        Section {
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

                Text("Move your iPhone’s real system GPS — not just the browser — to your chosen location, controlled from your Mac.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                VStack(alignment: .leading, spacing: 8) {
                    pitchPoint("Works in every app, including Find My")
                    pitchPoint("Follows your VPN, or a location you pick")
                    pitchPoint("Driven from the GeoSpoof GPS app on your Mac")
                }

                Button {
                    router.showPaywall = true
                } label: {
                    Label("Upgrade to Pro", systemImage: "sparkles")
                        .frame(maxWidth: .infinity)
                }
                .glassButtonStyle(prominent: true)
                .controlSize(.large)
                .padding(.top, 2)
                .accessibilityHint("Opens GeoSpoof Pro upgrade options")
            }
            .padding(.vertical, 4)
        }
    }

    /// One benefit row in the Pro pitch — a green check plus a short line.
    private func pitchPoint(_ text: String) -> some View {
        HStack(alignment: .firstTextBaseline, spacing: 10) {
            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(.green)
                .accessibilityHidden(true)
            Text(text)
                .font(.subheadline)
                .fixedSize(horizontal: false, vertical: true)
        }
    }

    private var waitingSection: some View {
        Section {
            HStack(spacing: 10) {
                ProgressView()
                Text("Waiting for your Mac…")
                    .foregroundColor(.secondary)
            }
            Link(destination: downloadURL) {
                Label("Get GeoSpoof GPS for Mac", systemImage: "arrow.down.circle")
            }
        } header: {
            Text("Set up")
        } footer: {
            Text("1. Install GeoSpoof GPS on your Mac and open it.\n2. Connect this iPhone with a cable.\n3. Follow the setup steps in the Mac app (Trust · Developer Mode · Pair).\nThen your chosen location syncs to your iPhone’s GPS automatically — over Wi-Fi from then on.")
        }
    }

    private func setupNeededSection(_ message: String) -> some View {
        Section {
            HStack(alignment: .top, spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .foregroundColor(.orange)
                Text(message)
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
            Text("Complete this step on your iPhone or in the GeoSpoof GPS app on your Mac.")
        }
    }

    /// Picker shown when two or more Macs can drive this phone and none is chosen yet
    /// (controller-arbitration). Tapping one records it as the owner; every other Mac then
    /// stands down. A single-Mac user never sees this.
    private var chooseControllerSection: some View {
        Section {
            ForEach(statusStore.controllers) { c in
                Button {
                    controller.setSelectedController(c.id)
                } label: {
                    HStack {
                        Image(systemName: "desktopcomputer")
                            .foregroundColor(.brand)
                        Text(c.name)
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
            Text("Choose your Mac")
        } footer: {
            Text("More than one Mac can control this iPhone. Pick which one drives your GPS — the others stand by.")
        }
    }

    /// When two+ Macs are present, a compact picker so the user can switch which one is in
    /// charge. Hidden in the common single-Mac case.
    @ViewBuilder
    private var controllingMacSection: some View {
        if statusStore.controllers.count >= 2 {
            Section {
                Picker(selection: Binding(
                    get: { controller.selectedControllerId ?? "" },
                    set: { controller.setSelectedController($0.isEmpty ? nil : $0) }
                )) {
                    ForEach(statusStore.controllers) { c in
                        Text(c.name).tag(c.id)
                    }
                } label: {
                    Label("Controlling Mac", systemImage: "desktopcomputer")
                }
            } footer: {
                Text("Only this Mac drives your iPhone’s GPS. The others stand by.")
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
                infoRow("Device", device.name)
            }
            if active {
                infoRow("Location", locationText)
                if let prov = provenanceLabel(statusStore.status?.provenance ?? "") {
                    infoRow("Source", prov)
                }
            }
        } header: {
            Text("Status")
        }
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
                Text("Lost the connection to your Mac. Your real GPS may have returned.")
            }
        } header: {
            Text("Status")
        } footer: {
            Text("Make sure the GeoSpoof GPS app is running and your Mac is awake and online.")
        }
    }

    // MARK: Helpers

    private func infoRow(_ label: String, _ value: String) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.trailing)
        }
    }

    private var locationText: String {
        if let name = controller.locationName?.displayName, !name.isEmpty { return name }
        if let loc = controller.location {
            return String(format: "%.4f, %.4f", loc.latitude, loc.longitude)
        }
        return "No location chosen"
    }

    private func provenanceLabel(_ provenance: String) -> String? {
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
                    Text(AppInfo.versionWithBuild)
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
                    Picker(selection: $debugProOverride) {
                        Text("Auto (real check)").tag(0)
                        Text("Force Founder").tag(1)
                        Text("Force Not Pro").tag(2)
                        Text("Force Subscription").tag(3)
                    } label: {
                        Label("Pro Override", systemImage: "wand.and.stars")
                    }
                    .onChange(of: debugProOverride) { value in
                        ProStore.setDebugProOverride(value)
                    }
                } header: {
                    Text("Debug")
                } footer: {
                    Text("Founder status normally comes from the App Store original-download version, which isn't available on the simulator. Force Founder / Not Pro / Subscription to test each tier. (Overrides the app's local Pro gate only — the GPS agent still needs a real signed purchase.)")
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

    var displayName: String {
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
