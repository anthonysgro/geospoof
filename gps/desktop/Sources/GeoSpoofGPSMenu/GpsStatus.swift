import Foundation

/// Non-PII device identity in the agent's status report.
struct GpsDeviceSummary: Codable, Equatable {
    var name: String
    var productType: String
    var iosVersion: String
    enum CodingKeys: String, CodingKey {
        case name
        case productType = "product_type"
        case iosVersion = "ios_version"
    }
}

/// Mirrors the Rust agent's `StatusReport` (`status.json`). The agent writes this into
/// its data dir every tick; we poll it to drive the menu-bar UI.
struct GpsStatus: Codable, Equatable {
    var version: Int
    var agentVersion: String
    var connected: Bool
    var device: GpsDeviceSummary?
    var session: String // "idle" | "spoofing" | "lost"
    var provenance: String // "vpn-sync" | "manual" | "from-app" | "unknown"
    var remediation: String
    var error: String?
    var pro: Bool
    var updatedAt: Double?

    enum CodingKeys: String, CodingKey {
        case version
        case agentVersion = "agent_version"
        case connected, device, session, provenance, remediation, error, pro
        case updatedAt = "updated_at"
    }

    /// The agent ticks ~every second; treat a report older than this as stale (the agent
    /// can't rewrite it once it loses the device / isn't running).
    static let freshWindow: TimeInterval = 20

    var isStale: Bool {
        guard let updatedAt else { return true }
        return Date().timeIntervalSince1970 - updatedAt > Self.freshWindow
    }
}

/// What the menu bar should show, derived from the agent process state + the latest
/// (fresh) status. Kept deliberately small — the phone is the control surface; this is
/// visibility + lifecycle.
struct MenuState: Equatable {
    enum Kind: Equatable {
        case paused
        case starting
        case notPro
        case searching // running, but no reachable device yet
        case connectedIdle
        case spoofing
        case lost // was spoofing, lost the device mid-session
    }

    var kind: Kind
    var title: String
    var detail: String?

    /// SF Symbol for the status-bar glyph (template image; adapts to light/dark).
    var symbolName: String {
        switch kind {
        case .spoofing: return "location.fill"
        case .connectedIdle: return "location"
        case .searching, .starting: return "location.slash"
        case .notPro: return "lock"
        case .paused: return "pause.circle"
        case .lost: return "exclamationmark.triangle.fill"
        }
    }

    /// Derive the menu state from whether the agent is running/paused and the latest
    /// status report (nil / stale ⇒ we haven't heard from a reachable device).
    static func derive(agentRunning: Bool, paused: Bool, status: GpsStatus?) -> MenuState {
        if paused || !agentRunning {
            return MenuState(kind: .paused, title: "Paused", detail: "GPS syncing is off")
        }
        guard let s = status, !s.isStale else {
            return MenuState(kind: .starting, title: "Starting…",
                             detail: "Waiting for your iPhone")
        }
        if !s.pro {
            return MenuState(kind: .notPro, title: "Not GeoSpoof Pro",
                             detail: "Device GPS is a Pro feature")
        }
        if s.session == "lost" {
            return MenuState(kind: .lost, title: "Lost connection",
                             detail: "Reconnecting to your iPhone…")
        }
        if !s.connected {
            let d = s.remediation.isEmpty ? "Looking for your iPhone" : s.remediation
            return MenuState(kind: .searching, title: "Looking for your iPhone…", detail: d)
        }
        if s.session == "spoofing" {
            return MenuState(kind: .spoofing, title: "GPS active",
                             detail: Self.activeDetail(s))
        }
        return MenuState(kind: .connectedIdle, title: "Connected",
                         detail: s.device?.name ?? "Ready")
    }

    private static func activeDetail(_ s: GpsStatus) -> String {
        let source: String
        switch s.provenance {
        case "vpn-sync": source = "Synced to VPN"
        case "manual": source = "Manual location"
        case "from-app": source = "From app"
        default: source = "Spoofing"
        }
        if let name = s.device?.name { return "\(source) · \(name)" }
        return source
    }
}
