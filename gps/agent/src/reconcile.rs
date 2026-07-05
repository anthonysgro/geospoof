//! Reconciliation: drive the device toward a [`DesiredState`] and produce a
//! [`StatusReport`] (design §10d). Pure orchestration over the core — fully testable
//! against the mock (tasks 21/22).
//!
//! Readiness policy (per design discussion): we attempt whenever the device is
//! `trusted` + in `developer_mode` — the two signals we can detect reliably. The DDI
//! status (via `copy_devices`) is treated as an ADVISORY hint only, never a hard gate,
//! because it produces false negatives (e.g. on iOS betas). If the attempt genuinely
//! can't reach the developer service, the `set` error surfaces as the remediation.

use std::sync::Arc;

use geospoof_gps_core::{
    Coordinate, DeviceController, DeviceStatus, HoldConfig, SessionState, SpoofSession,
};

use crate::contract::{DesiredState, DeviceSummary, SessionReport, StatusReport, CONTRACT_VERSION};

/// Owns the device controller + spoof session and reconciles desired → actual.
pub struct Reconciler {
    controller: Arc<dyn DeviceController>,
    session: SpoofSession,
    pro: bool,
    agent_version: &'static str,
}

impl Reconciler {
    /// Create a reconciler. `pro` gates the whole feature (entitlement).
    pub fn new(controller: Arc<dyn DeviceController>, config: HoldConfig, pro: bool) -> Self {
        let session = SpoofSession::new(Arc::clone(&controller), config);
        Self {
            controller,
            session,
            pro,
            agent_version: env!("CARGO_PKG_VERSION"),
        }
    }

    /// Reconcile once against `desired`, returning the resulting status.
    pub async fn reconcile(&self, desired: &DesiredState) -> StatusReport {
        // Entitlement gate — no Pro, no spoofing.
        if !self.pro {
            self.session.stop().await;
            return self.report(false, None, "GeoSpoof Pro required".to_string(), None);
        }

        let (status, error) = match self.controller.status().await {
            Ok(status) => (Some(status), None),
            Err(e) => (None, Some(e.to_string())),
        };
        // Attempt whenever trust + Developer Mode are present; DDI is advisory only.
        let attemptable = status.is_some_and(|s| s.trusted && s.developer_mode);

        if desired.enabled {
            if let Some((lat, lon)) = desired.coordinate() {
                if let Ok(coord) = Coordinate::new(lat, lon) {
                    let already =
                        matches!(self.session.state(), SessionState::Spoofing(c) if c == coord);
                    if attemptable && !already {
                        self.session.start(coord).await;
                    }
                }
            }
        } else if !matches!(self.session.state(), SessionState::Idle) {
            self.session.stop().await;
        }

        let device = if status.is_some() {
            self.controller
                .device_info()
                .await
                .ok()
                .map(|i| DeviceSummary {
                    name: i.name,
                    product_type: i.product_type,
                    ios_version: i.ios_version,
                })
        } else {
            None
        };

        let remediation = remediation(status, self.session.state());
        self.report(status.is_some(), device, remediation, error)
    }

    fn report(
        &self,
        connected: bool,
        device: Option<DeviceSummary>,
        remediation: String,
        error: Option<String>,
    ) -> StatusReport {
        StatusReport {
            version: CONTRACT_VERSION,
            agent_version: self.agent_version.to_string(),
            connected,
            device,
            session: session_report(self.session.state()),
            remediation,
            error,
            pro: self.pro,
        }
    }
}

fn session_report(state: SessionState) -> SessionReport {
    match state {
        SessionState::Idle => SessionReport::Idle,
        SessionState::Spoofing(_) => SessionReport::Spoofing,
        SessionState::Lost(_) => SessionReport::Lost,
    }
}

/// Session-aware remediation. Spoofing = nothing to do; Lost = honest "we tried"
/// message; Idle = the first unmet precondition, with DDI as a soft, we'll-try-anyway
/// hint rather than a blocker.
fn remediation(status: Option<DeviceStatus>, session: SessionState) -> String {
    match session {
        SessionState::Spoofing(_) => String::new(),
        SessionState::Lost(_) => "Couldn't hold the location. Your iPhone may be on a beta \
             or have a developer setup we can't detect — we tried anyway. If it didn't take, \
             connect it to Xcode once to mount the developer image."
            .to_string(),
        SessionState::Idle => match status {
            None => "Connect your iPhone".to_string(),
            Some(s) if !s.trusted => "Tap Trust on your iPhone".to_string(),
            Some(s) if !s.developer_mode => {
                "Enable Developer Mode (Settings > Privacy & Security), then restart".to_string()
            }
            Some(s) if !s.ddi_mounted => "Developer image may not be mounted — if spoofing \
                 doesn't take, connect to Xcode once. We'll still try."
                .to_string(),
            Some(_) => String::new(),
        },
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use geospoof_gps_core::mock::MockDeviceController;
    use std::time::Duration;

    fn fast_config() -> HoldConfig {
        HoldConfig {
            reapply_interval: Duration::from_secs(5),
            max_retries: 1,
            backoff_base: Duration::from_millis(5),
        }
    }

    fn status(trusted: bool, developer_mode: bool, ddi_mounted: bool) -> DeviceStatus {
        DeviceStatus {
            trusted,
            developer_mode,
            ddi_mounted,
        }
    }

    #[tokio::test]
    async fn not_pro_refuses_and_reports() {
        let mock = Arc::new(MockDeviceController::ready());
        let r = Reconciler::new(mock, fast_config(), false);
        let report = r.reconcile(&DesiredState::manual(48.0, 2.0)).await;
        assert!(!report.pro);
        assert_eq!(report.session, SessionReport::Idle);
        assert_eq!(report.remediation, "GeoSpoof Pro required");
    }

    #[tokio::test]
    async fn enabled_on_ready_device_starts_spoofing() {
        let mock = Arc::new(MockDeviceController::ready());
        let r = Reconciler::new(mock, fast_config(), true);
        let report = r.reconcile(&DesiredState::manual(48.8584, 2.2945)).await;
        assert!(report.pro && report.connected);
        assert_eq!(report.session, SessionReport::Spoofing);
        assert!(report.device.is_some());
    }

    #[tokio::test]
    async fn beta_ddi_false_still_attempts() {
        // trusted + dev mode, but DDI detection says false (the beta case). We must
        // still attempt — the DDI flag is advisory, not a gate.
        let mock = Arc::new(MockDeviceController::ready().with_status(status(true, true, false)));
        let r = Reconciler::new(mock, fast_config(), true);
        let report = r.reconcile(&DesiredState::manual(48.0, 2.0)).await;
        assert_eq!(report.session, SessionReport::Spoofing);
    }

    #[tokio::test]
    async fn disabled_stops_spoofing() {
        let mock = Arc::new(MockDeviceController::ready());
        let r = Reconciler::new(mock, fast_config(), true);
        r.reconcile(&DesiredState::manual(48.0, 2.0)).await;
        let report = r.reconcile(&DesiredState::disabled()).await;
        assert_eq!(report.session, SessionReport::Idle);
    }

    #[tokio::test]
    async fn untrusted_device_does_not_start() {
        let mock = Arc::new(MockDeviceController::ready().with_status(status(false, false, false)));
        let r = Reconciler::new(mock, fast_config(), true);
        let report = r.reconcile(&DesiredState::manual(48.0, 2.0)).await;
        assert_eq!(report.session, SessionReport::Idle);
        assert_eq!(report.remediation, "Tap Trust on your iPhone");
    }

    #[test]
    fn remediation_is_session_aware() {
        // DDI-false while idle is a soft hint, not a hard "not mounted".
        let hint = remediation(Some(status(true, true, false)), SessionState::Idle);
        assert!(hint.contains("We'll still try"));
        // Lost gives the honest "we tried" message.
        let coord = Coordinate::new(0.0, 0.0).unwrap();
        let lost = remediation(Some(status(true, true, true)), SessionState::Lost(coord));
        assert!(lost.contains("tried anyway"));
    }
}
