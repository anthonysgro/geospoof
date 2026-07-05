//! The bidirectional file contract between the source-of-truth app and the agent
//! (design §10d): desired-state IN, status/health OUT. Versioned JSON.

use serde::{Deserialize, Serialize};

/// Contract schema version. Bump on an incompatible change.
pub const CONTRACT_VERSION: u32 = 1;

/// Desired location — written by the source-of-truth app, read by the agent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DesiredState {
    #[serde(default = "default_version")]
    pub version: u32,
    pub enabled: bool,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    /// "vpn-sync" | "manual" | "from-app"
    #[serde(default)]
    pub provenance: String,
}

fn default_version() -> u32 {
    CONTRACT_VERSION
}

impl DesiredState {
    /// A disabled (stop-spoofing) desired state.
    pub fn disabled() -> Self {
        Self {
            version: CONTRACT_VERSION,
            enabled: false,
            latitude: None,
            longitude: None,
            provenance: String::new(),
        }
    }

    /// A manual set at the given coordinate.
    pub fn manual(latitude: f64, longitude: f64) -> Self {
        Self {
            version: CONTRACT_VERSION,
            enabled: true,
            latitude: Some(latitude),
            longitude: Some(longitude),
            provenance: "manual".to_string(),
        }
    }

    /// The coordinate pair, if both are present.
    pub fn coordinate(&self) -> Option<(f64, f64)> {
        match (self.latitude, self.longitude) {
            (Some(lat), Some(lon)) => Some((lat, lon)),
            _ => None,
        }
    }
}

/// Session state in the status report.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionReport {
    Idle,
    Spoofing,
    Lost,
}

/// Non-PII device identity for the status report.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct DeviceSummary {
    pub name: String,
    pub product_type: String,
    pub ios_version: String,
}

/// Status / health — written by the agent, read by the source app. Doubles as the
/// redacted diagnostics report (Requirement 8). Carries no PII beyond the
/// user-assigned device name.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct StatusReport {
    pub version: u32,
    pub agent_version: String,
    pub connected: bool,
    pub device: Option<DeviceSummary>,
    pub session: SessionReport,
    pub remediation: String,
    pub error: Option<String>,
    pub pro: bool,
}
