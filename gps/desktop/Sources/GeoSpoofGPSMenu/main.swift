import AppKit

// Menu-bar-only entry point. No storyboard/SwiftUI lifecycle — a plain AppKit app whose
// delegate installs the status item and supervises the agent. main.swift runs on the
// main thread, so we assume main-actor isolation to touch the @MainActor AppKit types.
MainActor.assumeIsolated {
    let app = NSApplication.shared
    let delegate = AppDelegate()
    app.delegate = delegate
    app.run()
}
