//! Spoof session manager: owns the hold-loop task lifecycle (start / stop / state).
//!
//! Shared by hosts (the headless agent; the FFI can adopt it too) so the
//! spawn/cancel/clear logic lives in one tested place. Runs on the ambient tokio
//! runtime.

use std::sync::{Arc, Mutex};

use tokio::sync::watch;
use tokio::task::JoinHandle;

use crate::controller::DeviceController;
use crate::hold::{hold_location, HoldConfig, HoldOutcome};
use crate::types::Coordinate;

/// Current session state.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum SessionState {
    /// Not spoofing.
    Idle,
    /// Actively holding the given coordinate.
    Spoofing(Coordinate),
    /// Was spoofing but the hold-loop could not maintain the fix.
    Lost(Coordinate),
}

/// Manages a single spoof hold-loop over a [`DeviceController`].
pub struct SpoofSession {
    controller: Arc<dyn DeviceController>,
    config: HoldConfig,
    cancel: Mutex<Option<watch::Sender<bool>>>,
    handle: Mutex<Option<JoinHandle<()>>>,
    state: Arc<Mutex<SessionState>>,
}

impl SpoofSession {
    /// Create an idle session over `controller`.
    pub fn new(controller: Arc<dyn DeviceController>, config: HoldConfig) -> Self {
        Self {
            controller,
            config,
            cancel: Mutex::new(None),
            handle: Mutex::new(None),
            state: Arc::new(Mutex::new(SessionState::Idle)),
        }
    }

    /// Snapshot the current state.
    pub fn state(&self) -> SessionState {
        *self.state.lock().expect("lock")
    }

    /// Start (or restart) holding `coordinate`. Cancels any prior hold first.
    pub async fn start(&self, coordinate: Coordinate) {
        self.stop().await;
        let (tx, rx) = watch::channel(false);
        let controller = Arc::clone(&self.controller);
        let config = self.config.clone();
        let state = Arc::clone(&self.state);

        // Mark spoofing before spawning so the task can only downgrade to Lost.
        *self.state.lock().expect("lock") = SessionState::Spoofing(coordinate);
        let handle = tokio::spawn(async move {
            let mut rx = rx;
            if let HoldOutcome::Lost(_) =
                hold_location(&*controller, coordinate, &config, &mut rx).await
            {
                *state.lock().expect("lock") = SessionState::Lost(coordinate);
            }
        });
        *self.cancel.lock().expect("lock") = Some(tx);
        *self.handle.lock().expect("lock") = Some(handle);
    }

    /// Stop holding: cancel the loop, join it, clear the device, return to idle.
    /// Idempotent.
    pub async fn stop(&self) {
        // Take handles out under the lock, then await OUTSIDE the lock (no std Mutex
        // guard held across `.await`).
        let cancel = self.cancel.lock().expect("lock").take();
        if let Some(tx) = cancel {
            let _ = tx.send(true);
        }
        let handle = self.handle.lock().expect("lock").take();
        let was_running = handle.is_some();
        if let Some(handle) = handle {
            let _ = handle.await;
        }
        // Only clear when a hold was actually running — avoids a redundant device
        // call (and a double-clear when start() calls stop() first).
        if was_running {
            let _ = self.controller.clear_location().await;
        }
        *self.state.lock().expect("lock") = SessionState::Idle;
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::DeviceError;
    use crate::mock::MockDeviceController;
    use std::time::Duration;

    fn coord() -> Coordinate {
        Coordinate::new(35.6762, 139.6503).unwrap()
    }

    fn fast_config() -> HoldConfig {
        HoldConfig {
            reapply_interval: Duration::from_secs(5),
            max_retries: 2,
            backoff_base: Duration::from_millis(5),
        }
    }

    #[tokio::test(start_paused = true)]
    async fn start_then_stop_cycles_state_and_clears() {
        let mock = Arc::new(MockDeviceController::ready());
        let session = SpoofSession::new(mock.clone(), fast_config());
        assert_eq!(session.state(), SessionState::Idle);

        session.start(coord()).await;
        assert_eq!(session.state(), SessionState::Spoofing(coord()));
        // Let the spawned hold-loop run its initial apply before we stop.
        for _ in 0..50 {
            if mock.set_calls() >= 1 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
            tokio::task::yield_now().await;
        }
        assert!(mock.set_calls() >= 1);

        session.stop().await;
        assert_eq!(session.state(), SessionState::Idle);
        assert_eq!(mock.clear_calls(), 1);
    }

    #[tokio::test(start_paused = true)]
    async fn transitions_to_lost_when_holds_fail() {
        let mock = Arc::new(
            MockDeviceController::ready()
                .with_set_default(Err(DeviceError::ServiceUnavailable("down".into()))),
        );
        let session = SpoofSession::new(mock.clone(), fast_config());
        session.start(coord()).await;

        // Let the spawned hold-loop exhaust its retries and downgrade to Lost.
        for _ in 0..50 {
            if matches!(session.state(), SessionState::Lost(_)) {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
            tokio::task::yield_now().await;
        }
        assert_eq!(session.state(), SessionState::Lost(coord()));
    }
}
