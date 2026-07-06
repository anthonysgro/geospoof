//! The bidirectional file contract between the source-of-truth app and the agent
//! (design §10d): desired-state IN, status/health OUT. Versioned JSON.

use serde::{Deserialize, Serialize};

/// Contract schema version. Bump on an incompatible change.
pub const CONTRACT_VERSION: u32 = 1;

/// Where the chosen location came from — the "one consistent location" source that
/// also drives the browser geolocation spoof (design §10b). Metadata only: it lets the
/// source app / UX confirm the device is aligned to (e.g.) the VPN exit; it never
/// changes how the coordinate is applied.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum Provenance {
    /// Matched to this device's VPN/network exit region.
    VpnSync,
    /// Manually chosen (map / search / coordinate entry).
    Manual,
    /// Pushed from the GeoSpoof app (iOS/macOS) as source of truth.
    FromApp,
    /// Unrecognized or unset — also the forward-compatible catch-all so a newer source
    /// writing a future provenance never breaks an older agent.
    #[default]
    #[serde(other)]
    Unknown,
}

/// Desired location — written by the source-of-truth app, read by the agent.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct DesiredState {
    #[serde(default = "default_version")]
    pub version: u32,
    pub enabled: bool,
    pub latitude: Option<f64>,
    pub longitude: Option<f64>,
    #[serde(default)]
    pub provenance: Provenance,
    /// DEPRECATED unsigned entitlement flag. Historically the app passed its StoreKit
    /// `isPro` as a bare bool — but a bare bool in this file is trivially forgeable by
    /// anyone who can write it, so it must NOT be trusted for the real gate. Superseded by
    /// [`DesiredState::entitlement`] (Apple-signed, verified offline on the Mac). Retained
    /// only as a last-resort fallback for the local-file / CLI dev path (`--dev` builds),
    /// never as the production authority. `None` when unset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub pro: Option<bool>,
    /// Signed proof of the app's Pro entitlement — the tamper-resistant replacement for
    /// `pro`. Carries Apple-signed StoreKit JWS blobs that the agent verifies OFFLINE
    /// (signature + X.509 chain to the Apple Root CA + bundle id) before granting Pro, so
    /// a forged `desired.json` can't unlock the feature. `None` on the dev/CLI path or
    /// from an app build that predates signed proofs (agent then falls back to the dev
    /// stub). See [`EntitlementProof`].
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub entitlement: Option<EntitlementProof>,
}

/// Apple-signed StoreKit entitlement material, produced on the iPhone and verified on the
/// Mac. Every field is a JWS (compact JWT) string exactly as StoreKit's
/// `jwsRepresentation` yields it; the agent verifies each against Apple's certificate
/// chain and derives Pro itself. We send BOTH channels because "who is Pro" spans two
/// StoreKit concepts:
///   * `app_transaction` → the signed `AppTransaction`, whose `originalApplicationVersion`
///     determines the **founder** grant (there is no purchase transaction for founders).
///   * `transactions` → the signed current entitlement transactions (the **lifetime**
///     non-consumable and/or an **active subscription**), each carrying product id,
///     expiry, and revocation.
///
/// `isPro = founder(app_transaction) || ownsLifetime(transactions) ||
/// activeSubscription(transactions)` — mirroring the app's own `ProStore` logic, but
/// cryptographically verified rather than asserted.
#[derive(Debug, Clone, PartialEq, Eq, Default, Serialize, Deserialize)]
pub struct EntitlementProof {
    /// Signed `AppTransaction` JWS. Establishes the founder grant (via
    /// `originalApplicationVersion`) and the owning bundle id. `None` if the app couldn't
    /// produce it (e.g. offline first launch); the other channel can still grant Pro.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub app_transaction: Option<String>,
    /// Signed current-entitlement transaction JWSs (lifetime non-consumable and/or the
    /// active auto-renewable subscription). Empty when the user has no purchase (e.g. a
    /// pure founder), which is fine — founder is proven via `app_transaction`.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub transactions: Vec<String>,
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
            provenance: Provenance::Unknown,
            pro: None,
            entitlement: None,
        }
    }

    /// An enabled desired state at `(latitude, longitude)` with the given source.
    pub fn enabled_at(latitude: f64, longitude: f64, provenance: Provenance) -> Self {
        Self {
            version: CONTRACT_VERSION,
            enabled: true,
            latitude: Some(latitude),
            longitude: Some(longitude),
            provenance,
            pro: None,
            entitlement: None,
        }
    }

    /// A manual set at the given coordinate.
    pub fn manual(latitude: f64, longitude: f64) -> Self {
        Self::enabled_at(latitude, longitude, Provenance::Manual)
    }

    /// A set matched to the device's VPN/network exit (the headline sync feature).
    pub fn vpn_sync(latitude: f64, longitude: f64) -> Self {
        Self::enabled_at(latitude, longitude, Provenance::VpnSync)
    }

    /// A set pushed from the GeoSpoof app as source of truth.
    pub fn from_app(latitude: f64, longitude: f64) -> Self {
        Self::enabled_at(latitude, longitude, Provenance::FromApp)
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
    /// The source of the location currently being applied — echoes the desired
    /// `provenance` while active so the source app/UX can confirm the consistency
    /// source (e.g. "GPS synced to VPN"). `Unknown` when idle.
    #[serde(default)]
    pub provenance: Provenance,
    pub remediation: String,
    pub error: Option<String>,
    pub pro: bool,
    /// Unix time (seconds) this report was produced. The source app uses it to detect
    /// a stale report: when the agent loses the device it can no longer publish, so the
    /// last-written status lingers on the phone. Comparing `updated_at` to "now" lets the
    /// app show "disconnected" instead of a false "spoofing" (design §13e / hold-loop).
    #[serde(default)]
    pub updated_at: u64,
}

/// Current Unix time in whole seconds (0 if the clock is before the epoch, which can't
/// happen in practice). Used to stamp `StatusReport.updated_at`.
pub fn now_epoch() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn provenance_serializes_kebab_case() {
        assert_eq!(
            serde_json::to_string(&Provenance::VpnSync).unwrap(),
            "\"vpn-sync\""
        );
        assert_eq!(
            serde_json::to_string(&Provenance::FromApp).unwrap(),
            "\"from-app\""
        );
        assert_eq!(
            serde_json::to_string(&Provenance::Manual).unwrap(),
            "\"manual\""
        );
    }

    #[test]
    fn provenance_round_trips() {
        for p in [
            Provenance::VpnSync,
            Provenance::Manual,
            Provenance::FromApp,
            Provenance::Unknown,
        ] {
            let json = serde_json::to_string(&p).unwrap();
            let back: Provenance = serde_json::from_str(&json).unwrap();
            assert_eq!(p, back);
        }
    }

    #[test]
    fn unknown_provenance_string_is_forward_compatible() {
        // A newer source writing a provenance we don't know must NOT break an older
        // agent — it decodes to Unknown rather than erroring.
        let p: Provenance = serde_json::from_str("\"satellite-uplink\"").unwrap();
        assert_eq!(p, Provenance::Unknown);
    }

    #[test]
    fn desired_state_backward_compatible_and_typed() {
        // Old on-disk form with a known string still decodes to the typed variant.
        let json = r#"{"enabled":true,"latitude":48.0,"longitude":2.0,"provenance":"vpn-sync"}"#;
        let ds: DesiredState = serde_json::from_str(json).unwrap();
        assert_eq!(ds.provenance, Provenance::VpnSync);
        assert_eq!(ds.coordinate(), Some((48.0, 2.0)));

        // Missing provenance defaults to Unknown (no error).
        let json = r#"{"enabled":false}"#;
        let ds: DesiredState = serde_json::from_str(json).unwrap();
        assert_eq!(ds.provenance, Provenance::Unknown);
    }

    #[test]
    fn pro_entitlement_round_trips_and_is_backward_compatible() {
        // The app passes its StoreKit entitlement as `pro`.
        let json = r#"{"enabled":true,"latitude":48.0,"longitude":2.0,"pro":true}"#;
        let ds: DesiredState = serde_json::from_str(json).unwrap();
        assert_eq!(ds.pro, Some(true));

        let json = r#"{"enabled":false,"pro":false}"#;
        let ds: DesiredState = serde_json::from_str(json).unwrap();
        assert_eq!(ds.pro, Some(false));

        // An older app that doesn't send `pro` decodes to None (agent falls back to its
        // dev stub) — never an error.
        let json = r#"{"enabled":false}"#;
        let ds: DesiredState = serde_json::from_str(json).unwrap();
        assert_eq!(ds.pro, None);

        // We omit `pro` when None so we don't imply an entitlement we don't have.
        let out = serde_json::to_string(&DesiredState::disabled()).unwrap();
        assert!(!out.contains("\"pro\""));
    }

    #[test]
    fn entitlement_proof_round_trips_and_is_optional() {
        // Full proof: an AppTransaction JWS plus two entitlement transaction JWSs.
        let json = r#"{
            "enabled": true,
            "latitude": 48.0,
            "longitude": 2.0,
            "entitlement": {
                "app_transaction": "eyJhbGc.appTx.sig",
                "transactions": ["eyJhbGc.sub.sig", "eyJhbGc.lifetime.sig"]
            }
        }"#;
        let ds: DesiredState = serde_json::from_str(json).unwrap();
        let proof = ds.entitlement.expect("proof present");
        assert_eq!(proof.app_transaction.as_deref(), Some("eyJhbGc.appTx.sig"));
        assert_eq!(proof.transactions.len(), 2);

        // Founder-only: an AppTransaction but no purchase transactions.
        let json = r#"{"enabled":false,"entitlement":{"app_transaction":"eyJhbGc.appTx.sig"}}"#;
        let ds: DesiredState = serde_json::from_str(json).unwrap();
        let proof = ds.entitlement.unwrap();
        assert!(proof.app_transaction.is_some());
        assert!(proof.transactions.is_empty());

        // Absent entitlement decodes to None (older app / dev path) — never an error.
        let json = r#"{"enabled":false}"#;
        let ds: DesiredState = serde_json::from_str(json).unwrap();
        assert!(ds.entitlement.is_none());
    }

    #[test]
    fn entitlement_proof_omitted_when_empty() {
        // We never serialize an empty proof (or empty transactions) so we don't imply
        // material we don't have.
        let out = serde_json::to_string(&DesiredState::disabled()).unwrap();
        assert!(!out.contains("\"entitlement\""));

        let mut ds = DesiredState::manual(1.0, 2.0);
        ds.entitlement = Some(EntitlementProof {
            app_transaction: Some("jws".to_string()),
            transactions: vec![],
        });
        let out = serde_json::to_string(&ds).unwrap();
        assert!(out.contains("\"app_transaction\""));
        // Empty transactions vec is omitted.
        assert!(!out.contains("\"transactions\""));
    }

    #[test]
    fn constructors_set_source_and_coordinate() {
        assert_eq!(
            DesiredState::manual(1.0, 2.0).provenance,
            Provenance::Manual
        );
        assert_eq!(
            DesiredState::vpn_sync(1.0, 2.0).provenance,
            Provenance::VpnSync
        );
        assert_eq!(
            DesiredState::from_app(1.0, 2.0).provenance,
            Provenance::FromApp
        );
        assert!(DesiredState::vpn_sync(1.0, 2.0).enabled);
        assert_eq!(DesiredState::disabled().provenance, Provenance::Unknown);
    }
}
