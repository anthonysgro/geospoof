//
//  AppDelegate.swift
//  macOS (App)
//
//  Created by Anthony on 5/1/26.
//

import AppKit
import Combine
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
        .frame(minWidth: 420, minHeight: 300)
        .onAppear {
            model.refresh()
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

    private let bundleIdentifier = "com.moonloaf.geospoof.Extension"

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
        SFSafariApplication.showPreferencesForExtension(withIdentifier: bundleIdentifier) { _ in
            Task { @MainActor in
                NSApp.terminate(nil)
            }
        }
    }
}
