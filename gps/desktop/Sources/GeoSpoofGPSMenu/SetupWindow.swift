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
    /// User self-attestations for the steps we can't verify programmatically (see
    /// `CheckState.unknown`). Only consulted while the matching field is `nil`; a later
    /// real confirmation supersedes them.
    @Published var userConfirmedDevMode = false
    @Published var userConfirmedDDI = false
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

    /// Let the user point us at a folder holding a developer image (for people without
    /// Xcode, or using a legitimately-sourced image). Persists the choice via the agent so
    /// the background agent uses it too, then refreshes.
    func pickDDIFolder() {
        let panel = NSOpenPanel()
        panel.canChooseDirectories = true
        panel.canChooseFiles = false
        panel.allowsMultipleSelection = false
        panel.prompt = "Use This Folder"
        panel.message = "Choose the folder that contains the iOS developer image (DDI)."
        // Start at the current location (custom folder, else the resolved source) so
        // changing it begins where the image lives today.
        if let start = report?.ddiCustomDir ?? report?.ddiSourceDir {
            panel.directoryURL = URL(fileURLWithPath: start)
        }
        guard panel.runModal() == .OK, let url = panel.url else { return }
        let path = url.path
        busy = true
        lastError = nil
        DispatchQueue.global(qos: .userInitiated).async {
            let result = AgentControl.setDDIDir(path)
            DispatchQueue.main.async { [weak self] in
                guard let self else { return }
                self.busy = false
                if !result.ok {
                    let msg = result.stderr.trimmingCharacters(in: .whitespacesAndNewlines)
                    self.lastError = msg.isEmpty ? "Couldn't use that folder." : msg
                }
                self.refresh()
            }
        }
    }

    /// Forget the custom folder and go back to Xcode's on-disk copy.
    func resetDDIFolder() {
        busy = true
        lastError = nil
        DispatchQueue.global(qos: .userInitiated).async {
            _ = AgentControl.clearDDIDir()
            DispatchQueue.main.async { [weak self] in
                self?.busy = false
                self?.refresh()
            }
        }
    }

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

/// Whether a setup step is verified, known-incomplete, or simply not verifiable by us.
private enum CheckState {
    /// We programmatically confirmed this is done (green check).
    case confirmed
    /// We confirmed it is NOT done — actionable (open circle + hint/action).
    case failed
    /// We can't verify it (e.g. amfi unavailable, or DDI negatives are unreliable). We
    /// refuse to show a green we can't back up — instead we ask the user to confirm.
    case unknown
}

/// One checklist row. Confirmed → green check; failed → open circle with hint/action;
/// unknown → a question mark plus a "you confirm" checkbox, so we never render a green
/// we couldn't actually verify. A user-attested unknown shows a hollow (not filled) check
/// to keep "you told us" visually distinct from "we verified".
private struct StepRow: View {
    let title: String
    let subtitle: String
    let state: CheckState
    /// Remediation shown while the step isn't satisfied.
    var hint: String?
    var actionTitle: String?
    var action: (() -> Void)?
    var enabled: Bool = true
    /// For `.unknown` steps only: the user's self-attestation ("I've done this").
    var userConfirmed: Binding<Bool>?

    private var attested: Bool { userConfirmed?.wrappedValue ?? false }

    /// Whether the row reads as satisfied (verified, or user-attested for an unknown).
    private var satisfied: Bool {
        switch state {
        case .confirmed: return true
        case .failed: return false
        case .unknown: return attested
        }
    }

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            icon
            VStack(alignment: .leading, spacing: 2) {
                Text(title).font(.headline)
                Text(subtitle).font(.subheadline).foregroundColor(.secondary)
                if !satisfied, let hint {
                    Text(hint)
                        .font(.footnote)
                        .foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                        .padding(.top, 1)
                }
                if state == .unknown, let userConfirmed {
                    Toggle("I've done this on my iPhone", isOn: userConfirmed)
                        .font(.footnote)
                        .padding(.top, 3)
                }
            }
            Spacer()
            if let actionTitle, let action {
                Button(actionTitle, action: action).disabled(!enabled)
            }
        }
    }

    @ViewBuilder private var icon: some View {
        switch state {
        case .confirmed:
            Image(systemName: "checkmark.circle.fill").foregroundColor(.green).font(.title3)
        case .failed:
            Image(systemName: "circle").foregroundColor(.secondary).font(.title3)
        case .unknown:
            Image(systemName: attested ? "checkmark.circle" : "questionmark.circle")
                .foregroundColor(attested ? .green : .orange)
                .font(.title3)
        }
    }
}

struct SetupView: View {
    @ObservedObject var model: SetupModel

    private var report: DoctorReport? { model.report }
    private var connected: Bool { report?.usbConnected ?? false }

    /// Developer Mode row state. Only meaningful once connected; `nil` from the agent
    /// (amfi couldn't answer) becomes `.unknown` so the user confirms rather than us
    /// faking a green.
    private var devModeState: CheckState {
        guard connected else { return .failed }
        switch report?.developerMode {
        case .some(true): return .confirmed
        case .some(false): return .failed
        case .none: return .unknown
        }
    }

    /// Mac App Store page for Xcode (which provisions the developer image).
    private var xcodeURL: URL { URL(string: "https://apps.apple.com/app/xcode/id497799835")! }

    /// Where the developer image will come from, including the actual folder path.
    private var ddiSourceLine: String {
        let path = report?.ddiSourceDir ?? report?.ddiCustomDir
        if report?.ddiSource == "custom" {
            return "Using your folder:\n\(path ?? "")"
        }
        if let path {
            return "Using Xcode's developer image:\n\(path)"
        }
        return "Using Xcode's developer image."
    }

    /// The "Prepare developer image" row. Richer than a plain `StepRow`: it shows where the
    /// image comes from and offers Prepare / change-folder, or — when none is found —
    /// Install Xcode + choose-folder, so a user without Xcode is never stuck.
    @ViewBuilder
    private var ddiRow: some View {
        let mounted = report?.ddiMounted == true
        let sourceFound = report?.ddiSourceFound ?? false
        let isCustom = report?.ddiSource == "custom"
        HStack(alignment: .top, spacing: 12) {
            ddiIcon(mounted: mounted, sourceFound: sourceFound)
            VStack(alignment: .leading, spacing: 2) {
                Text("Prepare developer image").font(.headline)
                Text("Lets us move the iPhone's real system location.")
                    .font(.subheadline).foregroundColor(.secondary)

                if mounted {
                    // Prepared — but always keep the folder controls available so the user
                    // can point us elsewhere (affects the next mount, e.g. after a reboot).
                    Text(ddiSourceLine)
                        .font(.footnote).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        Button("Change Folder…", action: model.pickDDIFolder).disabled(model.busy)
                        if isCustom {
                            Button("Use Xcode's", action: model.resetDDIFolder).disabled(model.busy)
                        }
                    }
                    .padding(.top, 2)
                } else if sourceFound {
                    Text(ddiSourceLine)
                        .font(.footnote).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        Button("Prepare", action: model.mountDDI)
                            .disabled(!(report?.trusted ?? false) || model.busy)
                        Button("Change Folder…", action: model.pickDDIFolder).disabled(model.busy)
                        if isCustom {
                            Button("Use Xcode's", action: model.resetDDIFolder).disabled(model.busy)
                        }
                    }
                    .padding(.top, 2)
                    Toggle("I've already prepared it on my iPhone", isOn: $model.userConfirmedDDI)
                        .font(.footnote).padding(.top, 3)
                } else {
                    Text("No developer image found. Install Xcode from the Mac App Store and open it once with your iPhone connected, or choose a folder that already has one.")
                        .font(.footnote).foregroundColor(.secondary)
                        .fixedSize(horizontal: false, vertical: true)
                    HStack(spacing: 8) {
                        Link("Install Xcode", destination: xcodeURL)
                        Button("Choose Folder…", action: model.pickDDIFolder).disabled(model.busy)
                    }
                    .padding(.top, 2)
                }
            }
            Spacer()
        }
    }

    @ViewBuilder
    private func ddiIcon(mounted: Bool, sourceFound: Bool) -> some View {
        if mounted {
            Image(systemName: "checkmark.circle.fill").foregroundColor(.green).font(.title3)
        } else if model.userConfirmedDDI {
            Image(systemName: "checkmark.circle").foregroundColor(.green).font(.title3)
        } else if sourceFound {
            Image(systemName: "questionmark.circle").foregroundColor(.orange).font(.title3)
        } else {
            Image(systemName: "exclamationmark.triangle").foregroundColor(.orange).font(.title3)
        }
    }

    /// Developer Mode satisfied: confirmed on, or (when unknown) user-attested.
    private var devOK: Bool {
        switch report?.developerMode {
        case .some(let on): return on
        case .none: return model.userConfirmedDevMode
        }
    }

    /// DDI satisfied: confirmed mounted, or user-attested when unconfirmed.
    private var ddiOK: Bool {
        report?.ddiMounted == true || model.userConfirmedDDI
    }

    /// Every step verified by us — we can honestly say "verified".
    private var systemReady: Bool { report?.ready ?? false }

    /// The reliably-detectable prerequisites are confirmed and the unverifiable ones are
    /// user-attested — good to go, but we didn't verify everything ourselves.
    private var userReady: Bool {
        connected && (report?.trusted ?? false) && (report?.bootstrapped ?? false)
            && devOK && ddiOK
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            Text("Set up GeoSpoof GPS").font(.title2).bold()
            Text("Connect your iPhone with a cable to finish setup. Once it's done, it works over Wi-Fi.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .fixedSize(horizontal: false, vertical: true)

            VStack(alignment: .leading, spacing: 14) {
                StepRow(title: "Connect your iPhone",
                        subtitle: "Plug it into this Mac with a USB cable.",
                        state: connected ? .confirmed : .failed,
                        hint: "Unlock your iPhone. If it doesn't appear, try another cable or USB port.")
                StepRow(title: "Trust this computer",
                        subtitle: "Tap Trust on your iPhone when it asks.",
                        state: (report?.trusted ?? false) ? .confirmed : .failed,
                        hint: "No prompt, or tapped Don't Trust? On your iPhone: Settings ▸ General ▸ Transfer or Reset iPhone ▸ Reset ▸ Reset Location & Privacy, then reconnect.")
                StepRow(title: "Enable Developer Mode on your iPhone",
                        subtitle: "On your iPhone: Settings ▸ Privacy & Security ▸ Developer Mode, then restart.",
                        state: devModeState,
                        hint: "Don't see Developer Mode? Connect your iPhone to this Mac once and it appears in Settings. Turning it on requires an iPhone restart.",
                        userConfirmed: $model.userConfirmedDevMode)
                StepRow(title: "Pair with this Mac",
                        subtitle: "A one-time secure handshake so this Mac can drive GPS.",
                        state: (report?.bootstrapped ?? false) ? .confirmed : .failed,
                        hint: "Keep your iPhone unlocked and connected while pairing.",
                        actionTitle: (report?.bootstrapped ?? false) ? nil : "Pair",
                        action: model.pair,
                        enabled: connected && !model.busy)
                ddiRow
            }

            if let err = model.lastError, !err.isEmpty {
                Text(err).font(.footnote).foregroundColor(.red)
                    .fixedSize(horizontal: false, vertical: true)
            }

            if systemReady {
                Label("All set — verified. Your iPhone's GPS will follow your GeoSpoof location.",
                      systemImage: "checkmark.seal.fill")
                    .foregroundColor(.green)
                    .font(.subheadline)
                    .fixedSize(horizontal: false, vertical: true)
            } else if userReady {
                Label("Looks ready. We couldn't automatically verify the steps you checked off, so if your GPS doesn't move, revisit those.",
                      systemImage: "checkmark.circle")
                    .foregroundColor(.orange)
                    .font(.subheadline)
                    .fixedSize(horizontal: false, vertical: true)
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
