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

    /// Shared controller backing the main window, so VPN sync / bridge state
    /// stays consistent across the app's views.
    @StateObject private var controller = SpoofController()

    var body: some Scene {
        WindowGroup("GeoSpoof", id: "main") {
            MacRootView(controller: controller)
        }
        .windowResizability(.contentSize)
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {

    // GeoSpoof is a standalone window app (no menu-bar item), so quit normally
    // when the last window closes rather than lingering as a background agent.
    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        true
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
                    Label(item.label, systemImage: item.icon)
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
                            // Version identifier ("v1.19.10"), not copy.
                            Text(verbatim: AppInfo.version)
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
    case details = "Details"
    case settings = "Settings"

    var id: String { rawValue }

    /// Sidebar display text, stated separately from `rawValue`.
    ///
    /// The raw values double as `id` (and as this enum's `Hashable` identity for
    /// the `List` selection), so they must stay stable English regardless of the
    /// display language — a localized identity would change the selection key
    /// per language. They also can't be localized in place: `rawValue` is a
    /// `String`, so `Label(item.rawValue, …)` bound to the `StringProtocol`
    /// overload and rendered verbatim, which is why these four labels were
    /// untranslatable. The literals below are identical to the raw values today;
    /// the point is that they are now free to diverge.
    var label: LocalizedStringKey {
        switch self {
        case .home: return "Home"
        case .filters: return "Filters"
        case .details: return "Details"
        case .settings: return "Settings"
        }
    }

    /// SF Symbol name — never localized.
    var icon: String {
        switch self {
        case .home: return "location.circle"
        case .filters: return "line.3.horizontal.decrease.circle"
        case .details: return "list.bullet.rectangle"
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

// MARK: - Home (native control panel — parity with the extension popup)

struct MacHomeView: View {
    @ObservedObject var controller: SpoofController
    @StateObject private var model = ExtensionStateModel()
    @ObservedObject private var review = ReviewPrompt.shared
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
        // Outside the navigation stack on purpose. macOS has no scene-based
        // StoreKit review call, so the environment action is the only path here
        // and placement is what makes it fire at all.
        .requestReview(on: review.token)
        .onAppear { model.refresh() }
        // A disabled extension is the most visible way GeoSpoof can be broken on
        // macOS, and the banner above is the user seeing it — so keep the review
        // ask quiet for a few days afterwards. Only `.off` counts: `.unknown`
        // just means the state query hasn't landed or failed, and suppressing on
        // that would penalise users whose lookup merely flaked.
        .onChange(of: model.state == .off) { isOff in
            if isOff { ReviewPrompt.shared.noteTrouble() }
        }
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
            // A user staring at a broken extension needs somewhere to go that
            // isn't the App Store. Offered whenever the banner is up, never
            // conditioned on the user telling us how they feel about the app.
            Link(destination: URL(string: "https://www.geospoof.com/support?utm_source=macos-app&utm_medium=app&utm_campaign=extension-off")!) {
                Text("Contact Support")
            }
            .font(.callout)
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
    @State private var showDebugPaywall = false
    @State private var showDebugProPitch = false
    @State private var showDebugFounderWelcome = false
    @State private var showDebugOnboarding = false
    @State private var debugProOverride = ProStore.debugProOverrideSelection()
    @ObservedObject private var review = ReviewPrompt.shared
    #endif

    var body: some View {
        AdaptiveNavigationStack {
            Form {
                ProSettingsSection()

                Section {
                    AppearancePickerView(selection: $appearance)
                } header: {
                    Text("Appearance")
                }

                Section {
                    AccuracySettingsRows(controller: controller)
                    PrecisionSettingsRows(controller: controller)
                    PreservePromptRows(controller: controller)
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
                            string: "https://apps.apple.com/app/id6765719745?action=write-review&pt=128299974&ct=macos-app-settings")!
                    ) {
                        Label("Rate GeoSpoof", systemImage: "star")
                    }
                    Link(destination: URL(string: "https://github.com/anthonysgro/geospoof")!) {
                        Label("View Source on GitHub", systemImage: "chevron.left.forwardslash.chevron.right")
                    }
                }

                Section {
                    Link(destination: URL(string: "https://www.geospoof.com/feedback?utm_source=macos-app&utm_medium=app&utm_campaign=feedback")!) {
                        Label("Give Feedback", systemImage: "text.bubble")
                    }
                    Link(destination: URL(string: "https://www.geospoof.com/support?utm_source=macos-app&utm_medium=app&utm_campaign=support")!) {
                        Label("Help & Support", systemImage: "questionmark.circle")
                    }
                    Link(destination: URL(string: "https://www.geospoof.com/privacy?utm_source=macos-app&utm_medium=app&utm_campaign=privacy")!) {
                        Label("Privacy Policy", systemImage: "hand.raised")
                    }
                    Link(destination: URL(string: "https://www.geospoof.com/terms?utm_source=macos-app&utm_medium=app&utm_campaign=terms")!) {
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
                        showDebugOnboarding = true
                    } label: {
                        Label("Show Onboarding", systemImage: "hand.wave")
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
                    Text("Founder status normally comes from the App Store original-download version, which isn't available in dev builds / the simulator. Force Founder / Not Pro / Subscription to test each tier. (Overrides the app's local Pro gate only — the GPS agent still needs a real signed purchase.)")
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
                #endif
            }
            .groupedFormStyle()
            .navigationTitle("Settings")
            #if DEBUG
            .sheet(isPresented: $showDebugPaywall) { ProPaywallView() }
            .sheet(isPresented: $showDebugProPitch) { ProPitchSheet() }
            .sheet(isPresented: $showDebugFounderWelcome) {
                FounderWelcomeSheet { showDebugFounderWelcome = false }
            }
            .adaptiveModalCover(isPresented: $showDebugOnboarding) {
                OnboardingView { showDebugOnboarding = false }
            }
            #endif
        }
        #if DEBUG
        // Outside the navigation stack, same as the production attachment in
        // `MacHomeView`. This placement is the whole reason the macOS prompt
        // works, so the debug button has to respect it too or it would "fail"
        // for a reason that has nothing to do with the gate.
        .requestReview(on: review.token)
        #endif
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

    /// Whole sentences per state, duplicated across the two Safari settings
    /// names, rather than interpolating a shared `settingsLocation` fragment.
    /// `LocalizedStringKey` cannot be interpolated into another key, and a
    /// translator needs the full sentence anyway to place the clause and
    /// inflect the location name. The rendered English is unchanged: each
    /// literal here is the previous interpolated result, spelled out.
    var statusText: LocalizedStringKey {
        if #available(macOS 13, *) {
            switch state {
            case .on:
                return "GeoSpoof’s extension is currently on. You can turn it off in the Extensions section of Safari Settings."
            case .off:
                return "GeoSpoof’s extension is currently off. You can turn it on in the Extensions section of Safari Settings."
            case .unknown:
                return "You can turn on GeoSpoof’s extension in the Extensions section of Safari Settings."
            }
        } else {
            switch state {
            case .on:
                return "GeoSpoof’s extension is currently on. You can turn it off in Safari Extensions preferences."
            case .off:
                return "GeoSpoof’s extension is currently off. You can turn it on in Safari Extensions preferences."
            case .unknown:
                return "You can turn on GeoSpoof’s extension in Safari Extensions preferences."
            }
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
