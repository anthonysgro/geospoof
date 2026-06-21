//
//  AppDelegate.swift
//  macOS (App)
//
//  Created by Anthony on 5/1/26.
//

import AppKit
import Combine
import os
import SafariServices
import SwiftUI

@main
struct GeoSpoofApp: App {
    @NSApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate

    /// One shared controller backs both the main window and the menu bar item,
    /// so VPN sync / bridge state stays identical whether the window is open or
    /// the user has closed it and lives in the menu bar.
    @StateObject private var controller = SpoofController()

    var body: some Scene {
        WindowGroup("GeoSpoof", id: "main") {
            MacRootView(controller: controller)
        }
        .windowResizability(.contentSize)

        MenuBarExtra {
            MenuBarContent(controller: controller)
        } label: {
            // Menu-bar template glyph (16pt, rendered as a template image so it
            // tints for light/dark menu bars and the selected state). Dimmed when
            // protection is off so the icon still signals state at a glance.
            Image("MenuBarIcon")
                .opacity(controller.enabled ? 1.0 : 0.5)
        }
        .menuBarExtraStyle(.window)
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {

    // When all windows close, demote to an agent (no dock icon) so the app
    // stays alive as a menu-bar item without cluttering the dock. The dock
    // icon comes back when the user reopens the window from the menu bar.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        NSApp.setActivationPolicy(.accessory)
        return false
    }

}

// MARK: - SwiftUI

struct MacRootView: View {
    @ObservedObject var controller: SpoofController
    @AppStorage("appearanceMode") private var appearance: AppearanceMode = .system
    @State private var section: MacSection? = .home

    var body: some View {
        // Standard, HIG-conformant macOS split view: a collapsible sidebar with
        // its system toggle. This is the pattern Mail/Notes/Finder/Reminders use,
        // and it's what makes the window adopt the full-height-sidebar title bar
        // where the traffic lights sit over the sidebar. On macOS 26 the system
        // renders the sidebar as floating Liquid Glass; on 13–15 it's the
        // standard inset sidebar. All chrome is system-managed.
        NavigationSplitView {
            List(selection: $section) {
                ForEach(MacSection.allCases) { item in
                    Label(item.rawValue, systemImage: item.icon)
                        .font(.title3)
                        .tag(item)
                }
            }
            .tint(.brand)
            .navigationSplitViewColumnWidth(min: 220, ideal: 240, max: 320)
            .navigationTitle("GeoSpoof")
            .safeAreaInset(edge: .bottom) {
                // Brand lockup pinned to the bottom of the sidebar.
                VStack(spacing: 0) {
                    Divider()
                    HStack(spacing: 10) {
                        Image("LargeIcon")
                            .resizable()
                            .aspectRatio(contentMode: .fit)
                            .frame(width: 40, height: 40)
                            .clipShape(RoundedRectangle(cornerRadius: 9, style: .continuous))
                        VStack(alignment: .leading, spacing: 1) {
                            Text("GeoSpoof")
                                .font(.custom("Outfit", size: 26).weight(.medium))
                                .foregroundStyle(.primary)
                            Text(AppInfo.version)
                                .font(.system(size: 13))
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 14)
                    .padding(.vertical, 12)
                }
            }
        } detail: {
            switch section ?? .home {
            case .home: MacHomeView(controller: controller)
            case .filters: SiteFiltersView(controller: controller)
            case .details: DetailsTab(controller: controller)
            case .test: MacTestView()
            case .settings: MacSettingsView(controller: controller)
            }
        }
        .tint(.brand)
        .dynamicTypeSize(.xLarge)
        .frame(
            minWidth: 840, idealWidth: 940, maxWidth: 1200,
            minHeight: 680, idealHeight: 820, maxHeight: 1100
        )
        .onAppear { applyAppearance(appearance) }
        .onChange(of: appearance) { newValue in applyAppearance(newValue) }
    }
}

/// macOS navigation sections (sidebar items).
enum MacSection: String, CaseIterable, Identifiable {
    case home = "Home"
    case filters = "Filters"
    case test = "Test"
    case details = "Details"
    case settings = "Settings"

    var id: String { rawValue }
    var icon: String {
        switch self {
        case .home: return "location.circle"
        case .filters: return "line.3.horizontal.decrease.circle"
        case .details: return "list.bullet.rectangle"
        case .test: return "checkmark.shield"
        case .settings: return "gearshape"
        }
    }
}

/// Drives the app's appearance at the `NSApplication` level. `nil` cleanly
/// reverts to following the system — unlike `preferredColorScheme(nil)`, which
/// can leave content stuck on the previously forced scheme.
@MainActor
private func applyAppearance(_ mode: AppearanceMode) {
    switch mode {
    case .system: NSApp.appearance = nil
    case .light: NSApp.appearance = NSAppearance(named: .aqua)
    case .dark: NSApp.appearance = NSAppearance(named: .darkAqua)
    }
}

// MARK: - Menu bar item content

/// Popover shown from the macOS menu bar item. A calm, professional control
/// surface: a quiet location summary up top, clean toggle rows, quick-activate
/// favorites, and footer commands. Backed by the same shared `SpoofController`
/// as the main window.
struct MenuBarContent: View {
    @ObservedObject var controller: SpoofController
    @Environment(\.openWindow) private var openWindow

    var body: some View {
        VStack(spacing: 0) {
            locationSummary
            Divider()
            VStack(spacing: 0) {
                row(
                    icon: "antenna.radiowaves.left.and.right",
                    iconOn: controller.vpnSyncEnabled,
                    title: "Sync with VPN",
                    busy: controller.isSyncing,
                    binding: Binding(get: { controller.vpnSyncEnabled }, set: { controller.setVPNSync($0) })
                )
                row(
                    icon: "shield.lefthalf.filled",
                    iconOn: controller.webrtcProtection,
                    title: "Block WebRTC Leaks",
                    binding: Binding(get: { controller.webrtcProtection }, set: { controller.setWebRTCProtection($0) })
                )
            }
            .padding(.vertical, 4)

            if !controller.favorites.isEmpty {
                Divider()
                favoritesSection
            }

            Divider()
            footer
        }
        .frame(width: 300)
    }

    private var isActive: Bool { controller.enabled && controller.hasLocation }

    // MARK: Location header — green + nude, full-wrapping location

    private var locationSummary: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Eyebrow: state + master protection toggle.
            HStack(spacing: 8) {
                Image(systemName: isActive ? "location.fill" : "location.slash")
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(isActive ? Color.brand : .secondary)
                Text(stateLabel)
                    .font(.system(size: 11, weight: .semibold))
                    .foregroundStyle(isActive ? Color.brand : .secondary)
                    .textCase(.uppercase)
                    .kerning(0.4)
                Spacer(minLength: 8)
                Toggle("", isOn: Binding(
                    get: { controller.enabled },
                    set: { controller.setEnabled($0) }
                ))
                .toggleStyle(.switch)
                .controlSize(.small)
                .labelsHidden()
            }

            // Location — wraps to as many lines as needed, never truncates.
            Text(primaryLine)
                .font(.system(size: 14, weight: .medium))
                .foregroundStyle(.primary)
                .fixedSize(horizontal: false, vertical: true)
                .frame(maxWidth: .infinity, alignment: .leading)

            if let secondary = secondaryLine {
                Text(secondary)
                    .font(.system(size: 11))
                    .foregroundStyle(.secondary)
                    .fixedSize(horizontal: false, vertical: true)
                    .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 14)
        .background(
            LinearGradient(
                colors: [Color.brand.opacity(0.12), Color.nude.opacity(0.16)],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )
        )
    }

    private var stateLabel: String {
        controller.enabled ? "Location Protection" : "Protection Off"
    }

    private var primaryLine: String {
        if !controller.enabled { return "Protection is off" }
        if let name = controller.locationName?.displayName, !name.isEmpty { return name }
        if controller.isSyncing { return "Detecting VPN location…" }
        return "No location set"
    }

    private var secondaryLine: String? {
        if !controller.enabled { return "Your real location is visible to sites" }
        if controller.vpnSyncEnabled, controller.isSyncing { return "Syncing with VPN…" }
        if let tz = controller.timezone { return "\(tz.utcOffsetText) · \(tz.identifier)" }
        if controller.vpnSyncEnabled { return "VPN Sync on" }
        return nil
    }

    // MARK: Toggle row

    private func row(
        icon: String,
        iconOn: Bool,
        title: String,
        busy: Bool = false,
        binding: Binding<Bool>
    ) -> some View {
        HStack(spacing: 11) {
            Image(systemName: icon)
                .font(.system(size: 14))
                .foregroundStyle(iconOn ? Color.brand : .secondary)
                .frame(width: 22)
                .animation(.easeInOut(duration: 0.2), value: iconOn)
            Text(title)
                .font(.system(size: 13))
            Spacer()
            if busy {
                ProgressView().controlSize(.small).scaleEffect(0.7)
            }
            Toggle("", isOn: binding)
                .toggleStyle(.switch)
                .controlSize(.small)
                .labelsHidden()
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 6)
    }

    // MARK: Favorites

    private var favoritesSection: some View {
        VStack(alignment: .leading, spacing: 1) {
            Text("Favorites")
                .font(.system(size: 11, weight: .semibold))
                .foregroundStyle(.secondary)
                .padding(.horizontal, 16)
                .padding(.top, 8)
                .padding(.bottom, 3)

            ForEach(controller.favorites.prefix(6)) { fav in
                let active = controller.activeFavorite?.id == fav.id
                Button { controller.activate(fav) } label: {
                    HStack(spacing: 11) {
                        Image(systemName: active ? "checkmark.circle.fill" : "mappin.circle")
                            .font(.system(size: 14))
                            .foregroundStyle(active ? Color.brand : .secondary)
                            .frame(width: 22)
                        Text(fav.chipTitle)
                            .font(.system(size: 13))
                            .lineLimit(1)
                        Spacer()
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 5)
                    .background(active ? Color.brand.opacity(0.10) : Color.clear)
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
            .padding(.bottom, 6)
        }
    }

    // MARK: Footer

    private var footer: some View {
        HStack {
            Button {
                NSApp.setActivationPolicy(.regular)
                NSApp.activate(ignoringOtherApps: true)
                openWindow(id: "main")
            } label: {
                Text("Open GeoSpoof").font(.system(size: 12))
            }
            .buttonStyle(.borderless)
            .keyboardShortcut("o", modifiers: .command)

            Spacer()

            Button {
                NSApp.terminate(nil)
            } label: {
                Text("Quit").font(.system(size: 12)).foregroundStyle(.secondary)
            }
            .buttonStyle(.borderless)
            .keyboardShortcut("q", modifiers: .command)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
    }
}

// MARK: - Home (native control panel — parity with the extension popup)

struct MacHomeView: View {
    @ObservedObject var controller: SpoofController
    @StateObject private var model = ExtensionStateModel()
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        AdaptiveNavigationStack {
            VStack(spacing: 0) {
                if model.state != .on {
                    ExtensionStatusBanner(model: model)
                        .padding([.horizontal, .top])
                }
                SpoofControlPanel(controller: controller)
            }
            .navigationTitle("Home")
        }
        .onAppear { model.refresh() }
        .onChange(of: scenePhase) { phase in
            if phase == .active {
                model.refresh()
                controller.refreshFromExtension()
            }
        }
        .alert("Couldn’t Open Safari Settings", isPresented: $model.openSettingsFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Open Safari, then choose Settings → Extensions to manage GeoSpoof.")
        }
    }
}

/// macOS Test tab — the external "Test Your Protection" links and Help, moved
/// off the Home screen into their own sidebar section.
struct MacTestView: View {
    var body: some View {
        AdaptiveNavigationStack {
            Form {
                ProtectionTestLinks()
            }
            .groupedFormStyle()
            .tint(.brand)
            .navigationTitle("Test")
        }
    }
}

/// Compact banner shown on macOS when the Safari extension isn't enabled,
/// guiding the user to turn it on (the extension is what actually applies the
/// spoof; the app just configures it).
struct ExtensionStatusBanner: View {
    @ObservedObject var model: ExtensionStateModel

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "puzzlepiece.extension.fill")
                .font(.title3)
                .foregroundStyle(.orange)
            VStack(alignment: .leading, spacing: 2) {
                Text(model.state == .off ? "Extension is turned off" : "Enable the GeoSpoof extension")
                    .font(.subheadline.weight(.semibold))
                Text(model.statusText)
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(3)
                    .fixedSize(horizontal: false, vertical: true)
            }
            Spacer(minLength: 8)
            Button("Open Settings…") { model.openSafariSettings() }
                .glassButtonStyle(prominent: true)
        }
        .glassCard()
    }
}

struct MacSettingsView: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var pro = ProStore.shared
    @AppStorage("appearanceMode") private var appearance: AppearanceMode = .system
    #if DEBUG
    @AppStorage(LogSettingsKey.enabled) private var loggingEnabled = false
    @AppStorage(LogSettingsKey.level) private var logLevelRaw = AppLogLevel.info.rawValue
    #endif

    var body: some View {
        AdaptiveNavigationStack {
            Form {
                Section {
                    AppearancePickerView(selection: $appearance)
                } header: {
                    Text("Appearance")
                }

                Section {
                    AccuracySettingsRows(controller: controller)
                } header: {
                    Text("Advanced")
                }

                // Founding supporters only — see iOS SettingsView for rationale.
                if pro.isFounder {
                    TipJarView()
                }

                Section {
                    Link(
                        destination: URL(
                            string: "https://apps.apple.com/app/id6765719745?action=write-review")!
                    ) {
                        Label("Rate GeoSpoof", systemImage: "star")
                    }
                    Link(destination: URL(string: "https://github.com/anthonysgro/geospoof")!) {
                        Label("View Source on GitHub", systemImage: "chevron.left.forwardslash.chevron.right")
                    }
                }

                Section {
                    Link(destination: URL(string: "https://www.geospoof.com/support")!) {
                        Label("Help & Support", systemImage: "questionmark.circle")
                    }
                    Link(destination: URL(string: "https://www.geospoof.com/privacy")!) {
                        Label("Privacy Policy", systemImage: "hand.raised")
                    }
                    Link(destination: URL(string: "https://www.geospoof.com/terms")!) {
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
                } header: {
                    Text("Debug")
                }
                #endif
            }
            .groupedFormStyle()
            .navigationTitle("Settings")
        }
    }
}

struct AppearancePickerView: View {
    @Binding var selection: AppearanceMode

    private let columns = [GridItem(.adaptive(minimum: 88), spacing: 20)]

    var body: some View {
        LazyVGrid(columns: columns, alignment: .leading, spacing: 24) {
            ForEach(AppearanceMode.allCases) { mode in
                cell(for: mode)
            }
        }
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

// MARK: - Extension state

@MainActor
final class ExtensionStateModel: ObservableObject {
    enum ExtensionState {
        case unknown
        case on
        case off
    }

    @Published var state: ExtensionState = .unknown
    @Published var openSettingsFailed = false

    private let bundleIdentifier = "com.moonloaf.geospoof.Extension"

    private static let logger = Logger(
        subsystem: Bundle.main.bundleIdentifier ?? "com.moonloaf.geospoof",
        category: "ExtensionState"
    )

    private var settingsLocation: String {
        if #available(macOS 13, *) {
            return "the Extensions section of Safari Settings"
        } else {
            return "Safari Extensions preferences"
        }
    }

    var statusText: String {
        switch state {
        case .on:
            return "GeoSpoof’s extension is currently on. You can turn it off in \(settingsLocation)."
        case .off:
            return "GeoSpoof’s extension is currently off. You can turn it on in \(settingsLocation)."
        case .unknown:
            return "You can turn on GeoSpoof’s extension in \(settingsLocation)."
        }
    }

    func refresh() {
        SFSafariExtensionManager.getStateOfSafariExtension(withIdentifier: bundleIdentifier) { [weak self] state, error in
            Task { @MainActor in
                guard let self else { return }
                if let state, error == nil {
                    self.state = state.isEnabled ? .on : .off
                } else {
                    self.state = .unknown
                }
            }
        }
    }

    func openSafariSettings() {
        SFSafariApplication.showPreferencesForExtension(withIdentifier: bundleIdentifier) { error in
            Task { @MainActor in
                if let error {
                    // Couldn't open Safari's settings — keep the window open so
                    // the user isn't left with a vanished app and no Safari, and
                    // surface manual instructions. (showPreferencesForExtension
                    // commonly returns SFErrorDomain error 1 for unsigned/dev
                    // builds even when the extension is installed; signed builds
                    // resolve it.)
                    Self.logger.error("Failed to open Safari extension settings: \(error.localizedDescription, privacy: .public)")
                    self.openSettingsFailed = true
                    return
                }
            }
        }
    }
}
