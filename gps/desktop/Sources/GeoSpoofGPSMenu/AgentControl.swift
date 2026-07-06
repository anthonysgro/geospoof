import Foundation

/// Locates the bundled Rust agent binary (shared by the supervisor and the setup wizard).
enum AgentBinary {
    /// `…/GeoSpoof GPS.app/Contents/Helpers/geospoof-gps-agent`, or a
    /// `GEOSPOOF_AGENT_PATH` override for `swift run` during development.
    static func url() -> URL? {
        if let override = ProcessInfo.processInfo.environment["GEOSPOOF_AGENT_PATH"],
           !override.isEmpty {
            return URL(fileURLWithPath: override)
        }
        let helper = Bundle.main.bundleURL
            .appendingPathComponent("Contents/Helpers/geospoof-gps-agent")
        return FileManager.default.isExecutableFile(atPath: helper.path) ? helper : nil
    }
}

/// Device setup health, mirroring the agent's `doctor` JSON. Probed over USB, so it
/// reflects the plugged-in device (all false when nothing is connected).
struct DoctorReport: Codable, Equatable {
    var usbConnected: Bool
    var deviceName: String?
    var trusted: Bool
    var developerMode: Bool
    var ddiMounted: Bool
    var bootstrapped: Bool
    var ready: Bool

    enum CodingKeys: String, CodingKey {
        case usbConnected = "usb_connected"
        case deviceName = "device_name"
        case trusted
        case developerMode = "developer_mode"
        case ddiMounted = "ddi_mounted"
        case bootstrapped
        case ready
    }
}

/// Runs one-shot agent subcommands (doctor / bootstrap / mount-ddi) for the wizard.
/// These are short-lived and small-output, so a synchronous run + read is fine (call off
/// the main thread).
enum AgentControl {
    struct Output {
        let code: Int32
        let stdout: String
        let stderr: String
        var ok: Bool { code == 0 }
    }

    static func run(_ args: [String]) -> Output {
        guard let url = AgentBinary.url() else {
            return Output(code: -1, stdout: "", stderr: "GeoSpoof GPS agent not found in the app bundle.")
        }
        let process = Process()
        process.executableURL = url
        process.arguments = args
        let out = Pipe()
        let err = Pipe()
        process.standardOutput = out
        process.standardError = err
        do {
            try process.run()
        } catch {
            return Output(code: -1, stdout: "", stderr: error.localizedDescription)
        }
        let outData = out.fileHandleForReading.readDataToEndOfFile()
        let errData = err.fileHandleForReading.readDataToEndOfFile()
        process.waitUntilExit()
        return Output(
            code: process.terminationStatus,
            stdout: String(data: outData, encoding: .utf8) ?? "",
            stderr: String(data: errData, encoding: .utf8) ?? ""
        )
    }

    /// Current setup health, or nil if the agent couldn't be run / parsed.
    static func doctor() -> DoctorReport? {
        let result = run(["doctor"])
        guard let data = result.stdout.data(using: .utf8) else { return nil }
        return try? JSONDecoder().decode(DoctorReport.self, from: data)
    }
}
