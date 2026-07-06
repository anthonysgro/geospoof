import Foundation

/// Owns the headless Rust agent as a child process: mental model is "menu bar icon
/// present = agent running; Quit = agent stopped". Spawns `geospoof-gps-agent run`,
/// relaunches it if it crashes, and terminates it gracefully (SIGTERM → the agent clears
/// the spoof over the tunnel before exiting) on pause/quit.
final class AgentSupervisor {
    /// The controlling iOS app's bundle id — passed so the agent reads `desired.json` /
    /// writes `status.json` over the device link (design §13e). Matches the Rust default.
    private static let iosAppBundleID = "com.moonloaf.geospoof"

    private var process: Process?
    private(set) var paused = false
    private var quitting = false

    /// Called on the main thread whenever the running/paused state changes, so the UI
    /// can refresh promptly (in addition to the periodic poll).
    var onStateChange: (() -> Void)?

    var isRunning: Bool { process?.isRunning ?? false }

    /// Resolve the bundled agent binary: `…/GeoSpoof GPS.app/Contents/Helpers/…`. A
    /// `GEOSPOOF_AGENT_PATH` override supports `swift run` during development.
    private func agentURL() -> URL? {
        if let override = ProcessInfo.processInfo.environment["GEOSPOOF_AGENT_PATH"],
           !override.isEmpty {
            return URL(fileURLWithPath: override)
        }
        let helper = Bundle.main.bundleURL
            .appendingPathComponent("Contents/Helpers/geospoof-gps-agent")
        return FileManager.default.isExecutableFile(atPath: helper.path) ? helper : nil
    }

    func start() {
        paused = false
        spawn()
    }

    func pause() {
        guard !paused else { return }
        paused = true
        terminate(graceful: true, wait: false)
        notify()
    }

    func resume() {
        guard paused else { return }
        paused = false
        spawn()
    }

    /// Terminate for app quit: SIGTERM, wait (bounded) for the agent to clear the spoof
    /// and exit, then call `completion` on the main thread.
    func stopForQuit(completion: @escaping () -> Void) {
        quitting = true
        guard let p = process, p.isRunning else {
            completion()
            return
        }
        p.terminate() // SIGTERM
        DispatchQueue.global(qos: .userInitiated).async {
            let deadline = Date().addingTimeInterval(6)
            while p.isRunning, Date() < deadline { usleep(100_000) }
            if p.isRunning { kill(p.processIdentifier, SIGKILL) }
            DispatchQueue.main.async(execute: completion)
        }
    }

    // MARK: - Internals

    private func spawn() {
        guard !paused, !quitting, process?.isRunning != true else { return }
        guard let url = agentURL() else {
            NSLog("GeoSpoofGPSMenu: agent binary not found; cannot start")
            return
        }
        var env = ProcessInfo.processInfo.environment
        env["GEOSPOOF_APP_BUNDLE_ID"] = Self.iosAppBundleID

        let p = Process()
        p.executableURL = url
        p.arguments = ["run"]
        p.environment = env
        p.terminationHandler = { [weak self] _ in
            // Off-main; hop back and relaunch unless we stopped it on purpose.
            DispatchQueue.main.async {
                guard let self else { return }
                self.notify()
                guard !self.paused, !self.quitting else { return }
                // Crash / unexpected exit — relaunch after a short backoff.
                DispatchQueue.main.asyncAfter(deadline: .now() + 2) { [weak self] in
                    self?.spawn()
                }
            }
        }
        do {
            try p.run()
            process = p
            notify()
        } catch {
            NSLog("GeoSpoofGPSMenu: failed to launch agent: \(error.localizedDescription)")
        }
    }

    private func terminate(graceful: Bool, wait: Bool) {
        guard let p = process, p.isRunning else { return }
        if graceful { p.terminate() } else { kill(p.processIdentifier, SIGKILL) }
        if wait { p.waitUntilExit() }
    }

    private func notify() {
        if Thread.isMainThread {
            onStateChange?()
        } else {
            DispatchQueue.main.async { [weak self] in self?.onStateChange?() }
        }
    }
}
