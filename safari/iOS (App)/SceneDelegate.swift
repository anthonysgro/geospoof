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
    }

}

// MARK: - SwiftUI

struct RootView: View {
    @AppStorage("appearanceMode") private var appearance: AppearanceMode = .system

    var body: some View {
        TabView {
            HomeView()
                .tabItem {
                    Label("Home", systemImage: "house")
                }

            SettingsView()
                .tabItem {
                    Label("Settings", systemImage: "gearshape")
                }
        }
        .onAppear { applyInterfaceStyle(appearance) }
        .onChange(of: appearance) { newValue in applyInterfaceStyle(newValue) }
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

struct HomeView: View {
    var body: some View {
        NavigationView {
            VStack(spacing: 20) {
                Image("LargeIcon")
                    .resizable()
                    .aspectRatio(contentMode: .fit)
                    .frame(width: 96, height: 96)
                    .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                Text("You can turn on GeoSpoof’s Safari extension in Settings.")
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                    .padding(.horizontal)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("GeoSpoof")
        }
        .navigationViewStyle(.stack)
    }
}

struct SettingsView: View {
    @StateObject private var iconModel = AppIconModel()
    @AppStorage("appearanceMode") private var appearance: AppearanceMode = .system

    var body: some View {
        NavigationView {
            Form {
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
                } header: {
                    Text("Display")
                } footer: {
                    Text("Sets how this app looks. Doesn’t change websites or the Safari extension.")
                }

                Section {
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
                    Text("App Icon")
                } footer: {
                    Text("Choose GeoSpoof’s Home Screen icon.")
                }
            }
            .navigationTitle("Settings")
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
