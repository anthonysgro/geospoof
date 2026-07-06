import AppKit
import SwiftUI

/// Drives the setup wizard: polls the agent's `doctor` health over USB and runs the
/// one-time pairing / developer-image actions. All agent calls happen off the main
/// thread; published state updates back on main.
@MainActor
final class SetupModel: ObservableObject {
    @Published var report: DoctorReport?
    @Published var busy = false
    @Published var lastError: String?
    /// Set by the window controller so the "Done" button can close the window.
    var onClose: (() -> Void)?

    private var timer: Timer?

    func startPolling() {
        refresh()
        timer?.invalidate()
        timer = Timer.scheduledTimer(withTimeInterval: 2, repeats: true) { [weak self] _ in
            MainActor.assumeIsolated { self?.refresh() }
        }
    }

    func stopPolling() {
        timer?.invalidate()
        timer = nil
    }

    func refresh() {
        DispatchQueue.global(qos: .userInitiated).async {
            let report = AgentControl.doctor()
            DispatchQueue.main.async { [weak self] in self?.report = report }
        }
    }

    func pair() { runAction(["bootstrap"]) }
    func mountDDI() { runAction(["mount-ddi"]) }

    private func runAction(_ args: [String]) {
        guard !busy else { return }
        busy = true
        lastError = nil
        DispatchQueue.global(qos: .userInitiated).async {
            let result = AgentControl.run(args)
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.busy = false
                if !result.ok {
                    let msg = result.stderr.trimmingCharacters(in: .whitespacesAndNewlines)
                    self.lastError = msg.isEmpty
                        ? "Something went wrong. Make sure your iPhone is unlocked and connected."
                        : msg
                }
                self.refresh()
            }
        }
    }
}

/// One checklist row: a status dot, title/subtitle, and an optional action button.
private struct StepRow: View {
    let title: String
    let subtitle: String
    let done: Bool
    /// Remediation shown only while the step is unfinished ("if this won't turn green…").
    var hint: String?
    var actionTitle: String?
    var action: (() -> Void)?
    var enabled: Bool = true

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: done ? "checkmark.circle.fill" : "circle")
                .foregroundColor(done ? .green : .secondary)
                .font(.title3)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(subtitle).font(.subheadline).foregroundColor(.secondary)
                if !done, let hint {
                    Text(hint)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 1)
                }
            }
            Spacer()
            if let actionTitle, let action {
                Button(actionTitle, action: action).disabled(!enabled)
            }
        }
    }
}

struct SetupView: View {
    @ObservedObject var model: SetupModel

    var body: some View {
        let r = model.report
        VStack(alignment: .leading, spacing: 16) {
            Text("Set up GeoSpoof GPS").font(.title2).bold()
            Text("Connect your iPhone with a cable to finish setup. Once it's done, it works over Wi-Fi.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 14) {
                StepRow(title: "Connect your iPhone",
                        subtitle: "Plug it into this Mac with a USB cable.",
                        done: r?.usbConnected ?? false,
                        hint: "Unlock your iPhone. If it doesn't appear, try another cable or USB port.")
                StepRow(title: "Trust this computer",
                        subtitle: "Tap Trust on your iPhone when it asks.",
                        done: r?.trusted ?? false,
                        hint: "No prompt, or tapped Don't Trust? On your iPhone: Settings ▸ General ▸ Transfer or Reset iPhone ▸ Reset ▸ Reset Location & Privacy, then reconnect.")
                StepRow(title: "Enable Developer Mode on your iPhone",
                        subtitle: "On your iPhone: Settings ▸ Privacy & Security ▸ Developer Mode, then restart.",
                        done: r?.developerMode ?? false,
                        hint: "Don't see Developer Mode? Connect your iPhone to this Mac once and it appears in Settings. Turning it on requires an iPhone restart.")
                StepRow(title: "Pair with this Mac",
                        subtitle: "A one-time secure handshake so this Mac can drive GPS.",
                        done: r?.bootstrapped ?? false,
                        hint: "Keep your iPhone unlocked and connected while pairing.",
                        actionTitle: (r?.bootstrapped ?? false) ? nil : "Pair",
                        action: model.pair,
                        enabled: (r?.usbConnected ?? false) && !model.busy)
                StepRow(title: "Prepare developer image",
                        subtitle: "Lets us move the iPhone's real system location.",
                        done: r?.ddiMounted ?? false,
                        hint: "If this fails, connect your iPhone to Xcode once (it installs the developer image), then try Prepare again.",
                        actionTitle: (r?.ddiMounted ?? false) ? nil : "Prepare",
                        action: model.mountDDI,
                        enabled: (r?.trusted ?? false) && !model.busy)
            }

            if let err = model.lastError, !err.isEmpty {
                Text(err).font(.footnote).foregroundColor(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if r?.ready == true {
                Label("All set — your iPhone's GPS will follow your GeoSpoof location.",
                      systemImage: "checkmark.seal.fill")
                    .foregroundColor(.green)
                    .font(.subheadline)
            }

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                if model.busy {
                    ProgressView().controlSize(.small)
                    Text("Working…").font(.subheadline).foregroundColor(.secondary)
                }
                Spacer()
                Button("Done") { model.onClose?() }
                    .keyboardShortcut(.defaultAction)
            }
        }
        .padding(20)
        .frame(minWidth: 460, idealWidth: 500, maxWidth: 700,
               minHeight: 600, idealHeight: 620, maxHeight: 900)
        .onAppear { model.startPolling() }
        .onDisappear { model.stopPolling() }
    }
}

/// Hosts the SwiftUI wizard in a normal window (opened on demand; the app stays a
/// menu-bar accessory otherwise).
@MainActor
final class SetupWindowController {
    private var window: NSWindow?
    private let model = SetupModel()

    func show() {
        if window == nil {
            model.onClose = { [weak self] in self?.window?.close() }
            let hosting = NSHostingController(rootView: SetupView(model: model))
            let win = NSWindow(contentViewController: hosting)
            win.title = "GeoSpoof GPS Setup"
            win.styleMask = [.titled, .closable, .resizable]
            win.isReleasedWhenClosed = false
            win.setContentSize(NSSize(width: 500, height: 620))
            window = win
        }
        // Bring the accessory app's window to the front.
        NSApp.activate(ignoringOtherApps: true)
        window?.center()
        window?.makeKeyAndOrderFront(nil)
    }
}
