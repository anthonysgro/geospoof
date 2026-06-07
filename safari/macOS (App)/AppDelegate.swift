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

    var body: some Scene {
        WindowGroup("GeoSpoof") {
            MacRootView()
        }
    }
}

class AppDelegate: NSObject, NSApplicationDelegate {

    func applicationShouldTerminateAfterLastWindowClosed(_ sender: NSApplication) -> Bool {
        return true
    }

}

// MARK: - SwiftUI

struct MacRootView: View {
    @AppStorage("appearanceMode") private var appearance: AppearanceMode = .system

    var body: some View {
        TabView {
            MacHomeView()
                .tabItem {
                    Label("Home", systemImage: "house")
                }

            MacSettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
        }
        .frame(minWidth: 520, minHeight: 420)
        .onAppear { applyAppearance(appearance) }
        .onChange(of: appearance) { newValue in applyAppearance(newValue) }
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

struct MacHomeView: View {
    @StateObject private var model = ExtensionStateModel()

    var body: some View {
        VStack(spacing: 20) {
            Image("LargeIcon")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 96, height: 96)
                .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

            Text(model.statusText)
                .multilineTextAlignment(.center)
                .foregroundColor(.secondary)

            Button(model.buttonTitle) {
                model.openSafariSettings()
            }
        }
        .padding(40)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .onAppear {
            model.refresh()
        }
        .alert("Couldn’t Open Safari Settings", isPresented: $model.openSettingsFailed) {
            Button("OK", role: .cancel) {}
        } message: {
            Text("Open Safari, then choose Settings → Extensions to manage GeoSpoof.")
        }
    }
}

struct MacSettingsView: View {
    @AppStorage("appearanceMode") private var appearance: AppearanceMode = .system

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                Text("Appearance")
                    .font(.headline)

                AppearancePickerView(selection: $appearance)

                Text("Sets how this app looks. Doesn’t change websites or the Safari extension.")
                    .font(.footnote)
                    .foregroundColor(.secondary)
            }
            .padding(24)
            .frame(maxWidth: .infinity, alignment: .leading)
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

    var buttonTitle: String {
        if #available(macOS 13, *) {
            return "Quit and Open Safari Settings…"
        } else {
            return "Quit and Open Safari Extensions Preferences…"
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
                // Give Safari a moment to come to the foreground before quitting,
                // otherwise terminating immediately can cut off its activation.
                try? await Task.sleep(nanoseconds: 400_000_000)
                NSApp.terminate(nil)
            }
        }
    }
}
