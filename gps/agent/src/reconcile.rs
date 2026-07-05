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
    Coordinate, DeviceController, DeviceError, DeviceStatus, HoldConfig, SessionState, SpoofSession,
};

use crate::contract::{
    CONTRACT_VERSION, DesiredState, DeviceSummary, Provenance, SessionReport, StatusReport,
};

/// Owns the device controller + spoof session and reconciles desired → actual.
pub struct Reconciler {
    controller: Arc<dyn DeviceController>,
    session: SpoofSession,
    pro: bool,
    agent_version: &'static str,
    /// When true, the controller reaches the device over the remote-pairing tunnel (not
    /// usbmux), so we skip the usbmux `status()`/`device_info()` gate and just try — a
    /// live tunnel IS the readiness proof (design §16 / CX try-first).
    tunnel_mode: bool,
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
            tunnel_mode: false,
        }
    }

    /// Mark this reconciler as driving the device over the remote-pairing tunnel (§16),
    /// which skips the usbmux precondition probes.
    pub fn tunnel_mode(mut self, on: bool) -> Self {
        self.tunnel_mode = on;
        self
    }

    /// Reconcile once against `desired`, returning the resulting status.
    pub async fn reconcile(&self, desired: &DesiredState) -> StatusReport {
        // Entitlement gate — no Pro, no spoofing.
        if !self.pro {
            self.session.stop().await;
            return self.report(
                false,
                None,
                Provenance::Unknown,
                "GeoSpoof Pro required".to_string(),
                None,
            );
        }

        // Tunnel transport: no usbmux status/identity available — try directly (§16).
        if self.tunnel_mode {
            return self.reconcile_over_tunnel(desired).await;
        }

        let (status, status_error) = match self.controller.status().await {
            Ok(status) => (Some(status), None),
            Err(e) => (None, Some(e)),
        };
        // Attempt whenever trust + Developer Mode are present; DDI is advisory only.
        let attemptable = status.is_some_and(|s| s.trusted && s.developer_mode);

        // The most specific signal for remediation: a concrete failure from actually
        // trying to spoof (incl. an on-demand mount). Preferred over status heuristics.
        let mut attempt_error: Option<DeviceError> = None;

        if desired.enabled {
            // let-chain (edition 2024): both the coordinate pair and a valid Coordinate
            // must be present to attempt.
            if let Some((lat, lon)) = desired.coordinate()
                && let Ok(coord) = Coordinate::new(lat, lon)
            {
                let already =
                    matches!(self.session.state(), SessionState::Spoofing(c) if c == coord);
                if attemptable && !already {
                    attempt_error = self.ensure_and_start(coord).await.err();
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

        let remediation = remediation(status, self.session.state(), attempt_error.as_ref());
        // Surface the concrete attempt failure if we have one; else any status error.
        let error = attempt_error
            .map(|e| e.to_string())
            .or_else(|| status_error.map(|e| e.to_string()));
        // Echo the requested source while enabled so the app can confirm alignment
        // (e.g. "GPS synced to VPN"); Unknown once the user has turned spoofing off.
        let provenance = if desired.enabled {
            desired.provenance
        } else {
            Provenance::Unknown
        };
        self.report(status.is_some(), device, provenance, remediation, error)
    }

    /// Reconcile over the remote-pairing tunnel (§16): no usbmux, so we can't probe
    /// trust/Developer Mode/identity — we just attempt (a live tunnel is the readiness
    /// proof) and let a concrete failure surface the remediation. `connected` is derived
    /// from the session/attempt rather than a usbmux status call.
    async fn reconcile_over_tunnel(&self, desired: &DesiredState) -> StatusReport {
        let mut attempt_error: Option<DeviceError> = None;

        if desired.enabled {
            if let Some((lat, lon)) = desired.coordinate()
                && let Ok(coord) = Coordinate::new(lat, lon)
            {
                let already =
                    matches!(self.session.state(), SessionState::Spoofing(c) if c == coord);
                if !already {
                    attempt_error = self.ensure_and_start(coord).await.err();
                }
            }
        } else if !matches!(self.session.state(), SessionState::Idle) {
            self.session.stop().await;
        }

        let spoofing = matches!(self.session.state(), SessionState::Spoofing(_));
        // A live spoof, or a successful attempt this tick, proves we reached the device.
        let connected = spoofing
            || (desired.enabled && desired.coordinate().is_some() && attempt_error.is_none());
        let remediation = match (&attempt_error, self.session.state()) {
            (Some(e), _) => remediation_for_error(e),
            (None, SessionState::Lost(_)) => {
                "Couldn't hold the location — reconnecting when your device is reachable."
                    .to_string()
            }
            _ => String::new(),
        };
        let provenance = if desired.enabled {
            desired.provenance
        } else {
            Provenance::Unknown
        };
        // Device summary comes from usbmux identity we don't have over the tunnel; omit it.
        self.report(
            connected,
            None,
            provenance,
            remediation,
            attempt_error.map(|e| e.to_string()),
        )
    }

    /// Bring the device to spoofing, mounting the Developer Disk Image on demand.
    ///
    /// The CX-driven flow (design §10a): **try to spoof first**. If the location
    /// service is reachable — the DDI is already mounted, whether by us, a prior run,
    /// or Xcode — it just works, and we never re-mount (that re-mount is what hung).
    /// Only if the attempt fails in a DDI-shaped way do we mount on demand (bounded by
    /// [`MOUNT_TIMEOUT`](geospoof_gps_core) in the controller) and retry once. Any
    /// error is returned so the caller can surface a specific, honest remediation.
    async fn ensure_and_start(&self, coord: Coordinate) -> Result<(), DeviceError> {
        match self.controller.set_location(coord).await {
            Ok(()) => {
                self.session.start(coord).await;
                Ok(())
            }
            Err(e) if e.suggests_missing_ddi() => {
                // Mount on demand (never blindly), then retry the spoof once.
                self.controller.mount_ddi().await?;
                self.controller.set_location(coord).await?;
                self.session.start(coord).await;
                Ok(())
            }
            Err(e) => Err(e),
        }
    }

    fn report(
        &self,
        connected: bool,
        device: Option<DeviceSummary>,
        provenance: Provenance,
        remediation: String,
        error: Option<String>,
    ) -> StatusReport {
        StatusReport {
            version: CONTRACT_VERSION,
            agent_version: self.agent_version.to_string(),
            connected,
            device,
            session: session_report(self.session.state()),
            provenance,
            remediation,
            error,
            pro: self.pro,
            updated_at: crate::contract::now_epoch(),
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

/// Turn a concrete attempt failure into a specific, actionable, honest message. This
/// is the most trustworthy signal because it comes from actually trying the operation
/// (including an on-demand mount), not from status heuristics.
fn remediation_for_error(e: &DeviceError) -> String {
    match e {
        // Guidance string is already customer-ready ("connect to Xcode once…").
        DeviceError::DdiUnavailable(msg) => msg.clone(),
        DeviceError::Timeout => "This is taking longer than expected. Make sure your iPhone is \
             unlocked and connected, then try again."
            .to_string(),
        DeviceError::MountFailed(m) if m.to_lowercase().contains("lock") => {
            "Unlock your iPhone so we can prepare the developer image.".to_string()
        }
        DeviceError::MountFailed(_) => "We couldn't prepare the developer image. Reconnect your \
             iPhone and try again — if it persists, connect it to Xcode once."
            .to_string(),
        DeviceError::NotTrusted => "Tap Trust on your iPhone".to_string(),
        DeviceError::DeveloperModeOff => {
            "Enable Developer Mode (Settings > Privacy & Security), then restart".to_string()
        }
        DeviceError::NotConnected => "Connect your iPhone".to_string(),
        _ => "We couldn't set your location. Reconnect your iPhone and try again.".to_string(),
    }
}

/// Session-aware remediation. A concrete `attempt_error` wins (most specific). Else:
/// Spoofing = nothing to do; Lost = honest "we tried" message; Idle = the first unmet
/// precondition, with DDI as a soft, we'll-try-anyway hint rather than a blocker.
fn remediation(
    status: Option<DeviceStatus>,
    session: SessionState,
    attempt_error: Option<&DeviceError>,
) -> String {
    if let Some(e) = attempt_error {
        return remediation_for_error(e);
    }
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
    async fn echoes_vpn_sync_provenance_while_enabled() {
        // The consistency signal: status reflects the location source so the app can
        // confirm "GPS synced to VPN".
        let mock = Arc::new(MockDeviceController::ready());
        let r = Reconciler::new(mock, fast_config(), true);
        let report = r.reconcile(&DesiredState::vpn_sync(48.8584, 2.2945)).await;
        assert_eq!(report.session, SessionReport::Spoofing);
        assert_eq!(report.provenance, Provenance::VpnSync);
    }

    #[tokio::test]
    async fn provenance_clears_to_unknown_when_disabled() {
        let mock = Arc::new(MockDeviceController::ready());
        let r = Reconciler::new(mock, fast_config(), true);
        r.reconcile(&DesiredState::vpn_sync(48.0, 2.0)).await;
        let report = r.reconcile(&DesiredState::disabled()).await;
        assert_eq!(report.session, SessionReport::Idle);
        assert_eq!(report.provenance, Provenance::Unknown);
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
    async fn mounts_on_demand_when_set_fails_with_ddi_error() {
        // First spoof probe fails DDI-shaped; we mount on demand, then retry succeeds.
        let mock = Arc::new(
            MockDeviceController::ready()
                .with_set_results(vec![Err(DeviceError::DdiNotMounted)])
                .with_mount_results(vec![Ok(())]),
        );
        let r = Reconciler::new(mock.clone(), fast_config(), true);
        let report = r.reconcile(&DesiredState::manual(48.0, 2.0)).await;
        assert_eq!(
            mock.mount_calls(),
            1,
            "should mount on demand after DDI failure"
        );
        assert_eq!(report.session, SessionReport::Spoofing);
    }

    #[tokio::test]
    async fn already_working_never_mounts() {
        // The already-mounted happy path: set succeeds immediately, so we never mount
        // (this is the re-mount that used to hang).
        let mock = Arc::new(MockDeviceController::ready());
        let r = Reconciler::new(mock.clone(), fast_config(), true);
        let report = r.reconcile(&DesiredState::manual(48.0, 2.0)).await;
        assert_eq!(
            mock.mount_calls(),
            0,
            "must not mount when spoofing just works"
        );
        assert_eq!(report.session, SessionReport::Spoofing);
    }

    #[tokio::test]
    async fn non_ddi_failure_does_not_mount_and_surfaces_error() {
        let mock = Arc::new(
            MockDeviceController::ready().with_set_default(Err(DeviceError::NotConnected)),
        );
        let r = Reconciler::new(mock.clone(), fast_config(), true);
        let report = r.reconcile(&DesiredState::manual(48.0, 2.0)).await;
        assert_eq!(
            mock.mount_calls(),
            0,
            "non-DDI errors must not trigger a mount"
        );
        assert_eq!(report.session, SessionReport::Idle);
        assert!(report.error.is_some());
    }

    #[tokio::test]
    async fn mount_failure_surfaces_specific_remediation() {
        // Set fails DDI-shaped, and the on-demand mount fails because device is locked.
        let mock = Arc::new(
            MockDeviceController::ready()
                .with_set_default(Err(DeviceError::DdiNotMounted))
                .with_mount_results(vec![Err(DeviceError::MountFailed("device locked".into()))]),
        );
        let r = Reconciler::new(mock.clone(), fast_config(), true);
        let report = r.reconcile(&DesiredState::manual(48.0, 2.0)).await;
        assert_eq!(mock.mount_calls(), 1);
        assert_eq!(report.session, SessionReport::Idle);
        assert!(report.remediation.contains("Unlock your iPhone"));
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
        let hint = remediation(Some(status(true, true, false)), SessionState::Idle, None);
        assert!(hint.contains("We'll still try"));
        // Lost gives the honest "we tried" message.
        let coord = Coordinate::new(0.0, 0.0).unwrap();
        let lost = remediation(
            Some(status(true, true, true)),
            SessionState::Lost(coord),
            None,
        );
        assert!(lost.contains("tried anyway"));
        // A concrete attempt error wins over session heuristics.
        let unavailable = DeviceError::DdiUnavailable("connect to Xcode once".to_string());
        let specific = remediation(
            Some(status(true, true, false)),
            SessionState::Idle,
            Some(&unavailable),
        );
        assert_eq!(specific, "connect to Xcode once");
        let locked = DeviceError::MountFailed("device locked".to_string());
        let locked_msg = remediation(
            Some(status(true, true, true)),
            SessionState::Idle,
            Some(&locked),
        );
        assert!(locked_msg.contains("Unlock your iPhone"));
    }
}
