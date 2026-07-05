//! The location hold-loop (task 9, design §10a.4).
//!
//! DVT location simulation must be re-applied to stay active, and each apply can fail
//! transiently (tunnel drop, device lock/sleep). This loop applies the coordinate,
//! then re-applies on an interval, retrying with backoff. If it cannot recover it
//! reports [`HoldOutcome::Lost`] (the caller surfaces `SpoofLost`); if cancelled it
//! reports [`HoldOutcome::Stopped`] (the caller then clears). Generic over
//! [`DeviceController`], so it is fully testable against the mock.

use std::time::Duration;

use tokio::sync::watch;

use crate::controller::DeviceController;
use crate::error::DeviceError;
use crate::types::Coordinate;

/// Tuning for [`hold_location`].
#[derive(Debug, Clone)]
pub struct HoldConfig {
    /// How often to re-apply the location to keep the session alive.
    pub reapply_interval: Duration,
    /// Consecutive failed attempts within a single apply before giving up.
    pub max_retries: u32,
    /// Base backoff between retries (doubles each attempt).
    pub backoff_base: Duration,
}

impl Default for HoldConfig {
    fn default() -> Self {
        Self {
            reapply_interval: Duration::from_secs(5),
            max_retries: 3,
            backoff_base: Duration::from_millis(500),
        }
    }
}

/// Why the hold-loop ended.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum HoldOutcome {
    /// Cancelled by the caller; the caller should now `clear_location`.
    Stopped,
    /// The location could not be maintained; surface `SpoofLost`.
    Lost(DeviceError),
}

/// Apply `coordinate` once, retrying up to `max_retries` with exponential backoff.
async fn apply_with_retry<C: DeviceController + ?Sized>(
    controller: &C,
    coordinate: Coordinate,
    config: &HoldConfig,
) -> Result<(), DeviceError> {
    let mut attempt: u32 = 0;
    loop {
        match controller.set_location(coordinate).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                if attempt >= config.max_retries {
                    return Err(e);
                }
                let backoff = config.backoff_base * 2u32.saturating_pow(attempt);
                tokio::time::sleep(backoff).await;
                attempt = attempt.saturating_add(1);
            }
        }
    }
}

/// Hold the simulated location until cancelled or unrecoverable.
///
/// Applies immediately (with retry); on failure returns [`HoldOutcome::Lost`]. Then
/// re-applies every `reapply_interval`, watching `cancel` (a `true` value, or a dropped
/// sender, stops the loop and returns [`HoldOutcome::Stopped`]).
pub async fn hold_location<C: DeviceController + ?Sized>(
    controller: &C,
    coordinate: Coordinate,
    config: &HoldConfig,
    cancel: &mut watch::Receiver<bool>,
) -> HoldOutcome {
    if *cancel.borrow() {
        return HoldOutcome::Stopped;
    }
    if let Err(e) = apply_with_retry(controller, coordinate, config).await {
        return HoldOutcome::Lost(e);
    }
    loop {
        tokio::select! {
            changed = cancel.changed() => {
                // Sender dropped (Err) or cancel requested -> stop.
                if changed.is_err() || *cancel.borrow() {
                    return HoldOutcome::Stopped;
                }
            }
            () = tokio::time::sleep(config.reapply_interval) => {
                if let Err(e) = apply_with_retry(controller, coordinate, config).await {
                    return HoldOutcome::Lost(e);
                }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::mock::MockDeviceController;

    fn coord() -> Coordinate {
        Coordinate::new(35.6762, 139.6503).unwrap()
    }

    fn fast_config() -> HoldConfig {
        HoldConfig {
            reapply_interval: Duration::from_secs(5),
            max_retries: 3,
            backoff_base: Duration::from_millis(10),
        }
    }

    #[tokio::test(start_paused = true)]
    async fn already_cancelled_returns_stopped_without_applying() {
        let mock = MockDeviceController::ready();
        let (_tx, mut rx) = watch::channel(true);
        let outcome = hold_location(&mock, coord(), &fast_config(), &mut rx).await;
        assert_eq!(outcome, HoldOutcome::Stopped);
        assert_eq!(mock.set_calls(), 0);
    }

    #[tokio::test(start_paused = true)]
    async fn persistent_failure_returns_lost_after_retries() {
        let mock = MockDeviceController::ready()
            .with_set_default(Err(DeviceError::ServiceUnavailable("invalid".into())));
        let (_tx, mut rx) = watch::channel(false);
        let outcome = hold_location(&mock, coord(), &fast_config(), &mut rx).await;
        assert!(matches!(outcome, HoldOutcome::Lost(_)));
        // Initial apply: 1 + max_retries attempts = 4.
        assert_eq!(mock.set_calls(), 4);
    }

    #[tokio::test(start_paused = true)]
    async fn recovers_from_transient_failures_on_initial_apply() {
        // Fail twice, then succeed — within the retry budget.
        let mock = MockDeviceController::ready().with_set_results(vec![
            Err(DeviceError::ServiceUnavailable("blip".into())),
            Err(DeviceError::ServiceUnavailable("blip".into())),
            Ok(()),
        ]);
        let (tx, mut rx) = watch::channel(false);
        // Cancel right after the initial apply succeeds (before the first re-apply).
        let cfg = fast_config();
        let hold = hold_location(&mock, coord(), &cfg, &mut rx);
        let canceller = async {
            tokio::time::sleep(Duration::from_secs(1)).await;
            tx.send(true).expect("send cancel");
        };
        let (outcome, ()) = tokio::join!(hold, canceller);
        assert_eq!(outcome, HoldOutcome::Stopped);
        // 3 attempts on the initial apply (2 fail, 1 succeeds); no re-apply yet.
        assert_eq!(mock.set_calls(), 3);
    }

    #[tokio::test(start_paused = true)]
    async fn reapply_failure_after_success_is_lost() {
        // Initial apply succeeds; subsequent re-applies fail.
        let mock = MockDeviceController::ready()
            .with_set_results(vec![Ok(())])
            .with_set_default(Err(DeviceError::ServiceUnavailable("dropped".into())));
        let (_tx, mut rx) = watch::channel(false);
        let outcome = hold_location(&mock, coord(), &fast_config(), &mut rx).await;
        assert!(matches!(outcome, HoldOutcome::Lost(_)));
        // 1 initial success + (1 + max_retries) failed re-apply attempts = 1 + 4 = 5.
        assert_eq!(mock.set_calls(), 5);
    }

    #[tokio::test(start_paused = true)]
    async fn cancellation_stops_and_holds_meanwhile() {
        let mock = MockDeviceController::ready();
        let (tx, mut rx) = watch::channel(false);
        let cfg = fast_config();
        let hold = hold_location(&mock, coord(), &cfg, &mut rx);
        let canceller = async {
            // Let a couple of re-apply intervals pass, then cancel.
            tokio::time::sleep(Duration::from_secs(12)).await;
            tx.send(true).expect("send cancel");
        };
        let (outcome, ()) = tokio::join!(hold, canceller);
        assert_eq!(outcome, HoldOutcome::Stopped);
        // Initial apply plus at least one re-apply happened while holding.
        assert!(mock.set_calls() >= 2);
    }
}
