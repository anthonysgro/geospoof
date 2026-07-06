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

/// Polls the agent's `status.json` from the app's Documents. The desktop agent
/// rewrites it every few seconds over AFC; if it goes stale the Mac agent isn't
/// running, so we treat the feature as "waiting for your Mac".
@MainActor
final class GpsStatusStore: ObservableObject {
    @Published private(set) var status: GpsStatus?
    /// True when there's no fresh status (agent not running / never set up).
    @Published private(set) var isStale = true

    /// The agent ticks ~every 5s; allow slack before calling it stale.
    private static let freshWindow: TimeInterval = 20

    func reload() {
        guard let docs = FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask).first else {
            status = nil; isStale = true; return
        }
        let url = docs.appendingPathComponent("status.json")
        guard let data = try? Data(contentsOf: url) else {
            status = nil; isStale = true; return
        }
        let decoded = try? JSONDecoder().decode(GpsStatus.self, from: data)
        status = decoded
        // Freshness comes from the report's own `updated_at` (agent clock), not the
        // file's mtime — the agent can't rewrite the file once it loses the device, so
        // a lingering file would otherwise look live. Comparing timestamps also survives
        // AFC quirks. A report without a timestamp (older agent) is treated as stale.
        // A small negative age (agent clock slightly ahead) still counts as fresh.
        if let updatedAt = decoded?.updatedAt {
            let age = Date().timeIntervalSince1970 - updatedAt
            isStale = age > Self.freshWindow
        } else {
            isStale = true
        }
    }
}

/// Coarse UI phase derived from Pro state + the agent status.
private enum GpsPhase: Equatable {
    case notPro
    case waitingForMac
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
                case .setupNeeded(let message):
                    setupNeededSection(message)
                    syncToggleSection
                case .ready:
                    connectedSection(active: false)
                    syncToggleSection
                case .spoofing:
                    connectedSection(active: true)
                    syncToggleSection
                case .lost:
                    lostSection
                    syncToggleSection
                }
            }
            .groupedFormStyle()
            .tint(.brand)
            .navigationTitle("GPS")
            .onAppear { statusStore.reload() }
            .onReceive(refreshTimer) { _ in statusStore.reload() }
        }
    }

    private var phase: GpsPhase {
        if !pro.isPro { return .notPro }
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

    private var proPitchSection: some View {
        Section {
            VStack(alignment: .leading, spacing: 10) {
                Label("Device GPS", systemImage: "location.circle.fill")
                    .font(.headline)
                Text("Spoof your iPhone’s real system GPS — not just the browser — to match your chosen location, controlled from your Mac. A GeoSpoof Pro feature.")
                    .font(.subheadline)
                    .foregroundColor(.secondary)
                Button {
                    router.showPaywall = true
                } label: {
                    Text("Upgrade to Pro")
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .padding(.top, 2)
            }
            .padding(.vertical, 4)
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
