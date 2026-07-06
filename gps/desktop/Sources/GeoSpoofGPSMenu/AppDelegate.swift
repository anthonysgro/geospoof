import AppKit
import Foundation
import ServiceManagement

/// The menu-bar-only controller. No Dock icon, no window — the status item is the whole
/// UI (design §19). Supervises the agent, reflects its status, and offers lifecycle
/// controls (Pause/Resume, Open at Login, Quit).
@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate, NSMenuDelegate {
    private let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)
    private let supervisor = AgentSupervisor()
    private let setupWindow = SetupWindowController()
    private let menu = NSMenu()
    private var pollTimer: Timer?
    private var state = MenuState(kind: .starting, title: "Starting…", detail: nil)

    func applicationDidFinishLaunching(_: Notification) {
        // Accessory app: lives only in the menu bar (no Dock icon, no app-switcher entry).
        NSApp.setActivationPolicy(.accessory)

        menu.delegate = self
        statusItem.menu = menu
        supervisor.onStateChange = { [weak self] in self?.refresh() }

        supervisor.start()
        refresh()
        // Poll status.json; the agent rewrites it ~every second.
        pollTimer = Timer.scheduledTimer(withTimeInterval: 3, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.refresh() }
        }
        maybeAutoOpenSetup()
    }

    /// On first run (never paired) open the setup wizard so the user isn't left staring at
    /// "Looking for your iPhone…". `bootstrapped` is a local check (no USB needed), so an
    /// already-set-up user launching wirelessly is NOT nagged.
    private func maybeAutoOpenSetup() {
        DispatchQueue.global(qos: .utility).async {
            let report = AgentControl.doctor()
            DispatchQueue.main.async { [weak self] in
                if report?.bootstrapped != true {
                    self?.setupWindow.show()
                }
            }
        }
    }

    // MARK: - Status polling

    private func refresh() {
        let status = Self.readStatus()
        state = MenuState.derive(agentRunning: supervisor.isRunning,
                                 paused: supervisor.paused,
                                 status: status)
        if let button = statusItem.button {
            if let img = menuBarImage(for: state) {
                button.image = img
                button.title = ""
            } else {
                // Never leave the status item invisible/zero-width: fall back to a short
                // text label so it's always visible and clickable.
                button.image = nil
                button.title = "GPS"
            }
            // Health at a glance: tint the (template) glyph by state — green when
            // spoofing, amber when it needs attention, red when a session dropped, and
            // the default menu-bar color otherwise. nil = adopt the menu bar's own color.
            button.contentTintColor = Self.tintColor(for: state.kind)
            button.toolTip = "GeoSpoof GPS — \(state.title)"
        }
    }

    /// The status-bar glyph: a state-aware SF Symbol (monochrome template that adapts to
    /// the light/dark menu bar and reads cleanly at 18pt). The brand logo is used for the
    /// app icon (Finder/DMG), not the menu bar — a full logo shrunk to menu-bar size looks
    /// muddy and can't reflect state.
    /// Health tint for the menu-bar glyph. `nil` = the menu bar's default color (adapts to
    /// light/dark) for neutral states, so we only add color when it carries meaning.
    private static func tintColor(for kind: MenuState.Kind) -> NSColor? {
        switch kind {
        case .spoofing: return .systemGreen // all good, actively spoofing
        case .searching: return .systemOrange // running but can't reach the phone
        case .lost: return .systemRed // dropped mid-session
        case .connectedIdle, .starting, .notPro, .paused: return nil // neutral
        }
    }

    private func menuBarImage(for state: MenuState) -> NSImage? {
        let img = NSImage(systemSymbolName: state.symbolName,
                          accessibilityDescription: "GeoSpoof GPS")
        img?.isTemplate = true
        return img
    }

    // MARK: - Menu (rebuilt on open for freshest state)

    func menuNeedsUpdate(_ menu: NSMenu) {
        refresh()
        menu.removeAllItems()

        let header = NSMenuItem(title: state.title, action: nil, keyEquivalent: "")
        header.isEnabled = false
        menu.addItem(header)
        if let detail = state.detail {
            let d = NSMenuItem(title: detail, action: nil, keyEquivalent: "")
            d.isEnabled = false
            menu.addItem(d)
        }

        menu.addItem(.separator())

        if supervisor.paused {
            menu.addItem(item("Resume GPS syncing", #selector(resume)))
        } else {
            menu.addItem(item("Pause GPS syncing", #selector(pause)))
        }

        let login = item("Open at Login", #selector(toggleLoginItem))
        login.state = (SMAppService.mainApp.status == .enabled) ? .on : .off
        menu.addItem(login)

        menu.addItem(item("Set Up…", #selector(openSetup)))
        menu.addItem(item("Open Logs", #selector(openLogs)))

        menu.addItem(.separator())
        menu.addItem(item("Quit GeoSpoof GPS", #selector(quit)))
    }

    private func item(_ title: String, _ action: Selector) -> NSMenuItem {
        let it = NSMenuItem(title: title, action: action, keyEquivalent: "")
        it.target = self
        return it
    }

    // MARK: - Actions

    @objc private func pause() { supervisor.pause() }
    @objc private func resume() { supervisor.resume() }
    @objc private func openSetup() { setupWindow.show() }

    @objc private func toggleLoginItem() {
        do {
            if SMAppService.mainApp.status == .enabled {
                try SMAppService.mainApp.unregister()
            } else {
                try SMAppService.mainApp.register()
            }
        } catch {
            NSLog("GeoSpoofGPSMenu: login-item toggle failed: \(error.localizedDescription)")
        }
    }

    @objc private func openLogs() {
        let log = Self.logDir().appendingPathComponent("agent.log")
        let target = FileManager.default.fileExists(atPath: log.path) ? log : Self.logDir()
        NSWorkspace.shared.open(target)
    }

    @objc private func quit() {
        // Stop the agent (which clears the spoofed location over the tunnel) before we go,
        // so quitting reverts the iPhone promptly instead of leaving a dangling session.
        supervisor.stopForQuit {
            NSApp.terminate(nil)
        }
    }

    // MARK: - Paths

    private static func appSupportDir() -> URL {
        let home = FileManager.default.homeDirectoryForCurrentUser
        return home.appendingPathComponent("Library/Application Support/GeoSpoof GPS")
    }

    private static func logDir() -> URL {
        FileManager.default.homeDirectoryForCurrentUser
            .appendingPathComponent("Library/Logs/GeoSpoof GPS")
    }

    private static func readStatus() -> GpsStatus? {
        let url = appSupportDir().appendingPathComponent("status.json")
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(GpsStatus.self, from: data)
    }
}
