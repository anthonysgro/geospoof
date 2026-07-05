//! Pure device state machine (task 7) and remediation mapping.
//!
//! [`transition`] is a pure function of `(state, event)` — no I/O — which makes every
//! transition unit-testable without hardware (task 8). A driver (later) performs the
//! device I/O and feeds the resulting events in.

use crate::error::DeviceError;
use crate::types::{Coordinate, DeviceState, DeviceStatus};

/// Inputs that drive the device [`DeviceState`] machine.
#[derive(Debug, Clone, PartialEq)]
pub enum Event {
    /// A device connected; carries its precondition snapshot.
    Connected(DeviceStatus),
    /// The device disconnected.
    Disconnected,
    /// The precondition snapshot changed while in a precondition state.
    StatusUpdated(DeviceStatus),
    /// The Developer Disk Image mounted successfully.
    Mounted,
    /// Mounting the Developer Disk Image failed.
    MountFailed(DeviceError),
    /// Spoofing started at the given coordinate.
    SpoofStarted(Coordinate),
    /// Spoofing stopped (user requested / cleared).
    SpoofStopped,
    /// The active spoof was lost (hold-loop could not maintain it).
    SpoofLost,
    /// A general failure occurred.
    Failed(DeviceError),
}

/// Map a precondition snapshot to its readiness state (ordered by setup step).
fn state_for_status(status: DeviceStatus) -> DeviceState {
    if !status.trusted {
        DeviceState::NotTrusted
    } else if !status.developer_mode {
        DeviceState::DeveloperModeOff
    } else if !status.ddi_mounted {
        DeviceState::DdiNotMounted
    } else {
        DeviceState::Ready
    }
}

/// Pure state transition (design §6). Irrelevant events leave the state unchanged.
pub fn transition(state: &DeviceState, event: Event) -> DeviceState {
    use DeviceState as S;
    use Event as E;

    match (state, event) {
        // Global transitions (apply from any state).
        (_, E::Disconnected) => S::Disconnected,
        (_, E::Failed(e)) => S::Error(e),
        (_, E::Connected(status)) => state_for_status(status),

        // Precondition refinement.
        (
            S::NotTrusted | S::DeveloperModeOff | S::DdiNotMounted | S::Ready,
            E::StatusUpdated(status),
        ) => state_for_status(status),

        // DDI mounting.
        (S::DdiNotMounted, E::Mounted) => S::Ready,
        (S::DdiNotMounted, E::MountFailed(e)) => S::Error(e),

        // Spoofing lifecycle.
        (S::Ready, E::SpoofStarted(c)) => S::Spoofing(c),
        (S::Spoofing(_), E::SpoofStopped) => S::Ready,
        (S::Spoofing(c), E::SpoofLost) => S::SpoofLost(*c),
        (S::SpoofLost(_), E::SpoofStarted(c)) => S::Spoofing(c),
        (S::SpoofLost(_), E::SpoofStopped) => S::Ready,

        // Anything else: unchanged.
        (s, _) => s.clone(),
    }
}

/// User-facing remediation guidance for a state (Requirement 3.2). A headless host
/// forwards this to the source-of-truth app to render (design §10d).
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Remediation {
    /// Nothing to do.
    None,
    /// Connect a device.
    ConnectDevice,
    /// Tap "Trust" on the device.
    TrustComputer,
    /// Enable Developer Mode (requires a restart).
    EnableDeveloperMode,
    /// Mounting the developer image (informational, in progress).
    MountingImage,
    /// The spoof was lost; reconnect to re-apply.
    Reconnect,
    /// Surface an error message.
    ShowError(String),
}

/// Map a [`DeviceState`] to its [`Remediation`].
pub fn remediation_for(state: &DeviceState) -> Remediation {
    match state {
        DeviceState::Disconnected => Remediation::ConnectDevice,
        DeviceState::NotTrusted => Remediation::TrustComputer,
        DeviceState::DeveloperModeOff => Remediation::EnableDeveloperMode,
        DeviceState::DdiNotMounted => Remediation::MountingImage,
        DeviceState::Ready | DeviceState::Spoofing(_) => Remediation::None,
        DeviceState::SpoofLost(_) => Remediation::Reconnect,
        DeviceState::Error(e) => Remediation::ShowError(e.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn ready_status() -> DeviceStatus {
        DeviceStatus {
            trusted: true,
            developer_mode: true,
            ddi_mounted: true,
        }
    }

    fn coord() -> Coordinate {
        Coordinate::new(48.8584, 2.2945).unwrap()
    }

    #[test]
    fn status_maps_to_first_unmet_precondition() {
        let untrusted = DeviceStatus {
            trusted: false,
            developer_mode: false,
            ddi_mounted: false,
        };
        assert_eq!(state_for_status(untrusted), DeviceState::NotTrusted);

        let devmode = DeviceStatus {
            trusted: true,
            developer_mode: false,
            ddi_mounted: false,
        };
        assert_eq!(state_for_status(devmode), DeviceState::DeveloperModeOff);

        let ddi = DeviceStatus {
            trusted: true,
            developer_mode: true,
            ddi_mounted: false,
        };
        assert_eq!(state_for_status(ddi), DeviceState::DdiNotMounted);

        assert_eq!(state_for_status(ready_status()), DeviceState::Ready);
    }

    #[test]
    fn connect_evaluates_preconditions() {
        let s = transition(&DeviceState::Disconnected, Event::Connected(ready_status()));
        assert_eq!(s, DeviceState::Ready);
    }

    #[test]
    fn disconnect_and_failure_apply_from_any_state() {
        assert_eq!(
            transition(&DeviceState::Spoofing(coord()), Event::Disconnected),
            DeviceState::Disconnected
        );
        assert_eq!(
            transition(
                &DeviceState::Ready,
                Event::Failed(DeviceError::NotConnected)
            ),
            DeviceState::Error(DeviceError::NotConnected)
        );
    }

    #[test]
    fn mount_success_and_failure() {
        assert_eq!(
            transition(&DeviceState::DdiNotMounted, Event::Mounted),
            DeviceState::Ready
        );
        let err = DeviceError::MountFailed("tss 94".into());
        assert_eq!(
            transition(&DeviceState::DdiNotMounted, Event::MountFailed(err.clone())),
            DeviceState::Error(err)
        );
    }

    #[test]
    fn spoof_lifecycle_and_recovery() {
        let spoofing = transition(&DeviceState::Ready, Event::SpoofStarted(coord()));
        assert_eq!(spoofing, DeviceState::Spoofing(coord()));

        let lost = transition(&spoofing, Event::SpoofLost);
        assert_eq!(lost, DeviceState::SpoofLost(coord()));

        // Recover from SpoofLost by re-applying.
        let recovered = transition(&lost, Event::SpoofStarted(coord()));
        assert_eq!(recovered, DeviceState::Spoofing(coord()));

        // Or stop.
        assert_eq!(transition(&lost, Event::SpoofStopped), DeviceState::Ready);
    }

    #[test]
    fn irrelevant_events_are_ignored() {
        // Can't start spoofing before Ready.
        assert_eq!(
            transition(&DeviceState::NotTrusted, Event::SpoofStarted(coord())),
            DeviceState::NotTrusted
        );
    }

    #[test]
    fn remediation_matches_state() {
        assert_eq!(
            remediation_for(&DeviceState::Disconnected),
            Remediation::ConnectDevice
        );
        assert_eq!(
            remediation_for(&DeviceState::NotTrusted),
            Remediation::TrustComputer
        );
        assert_eq!(
            remediation_for(&DeviceState::DeveloperModeOff),
            Remediation::EnableDeveloperMode
        );
        assert_eq!(
            remediation_for(&DeviceState::DdiNotMounted),
            Remediation::MountingImage
        );
        assert_eq!(remediation_for(&DeviceState::Ready), Remediation::None);
        assert_eq!(
            remediation_for(&DeviceState::SpoofLost(coord())),
            Remediation::Reconnect
        );
        assert_eq!(
            remediation_for(&DeviceState::Error(DeviceError::NotConnected)),
            Remediation::ShowError(DeviceError::NotConnected.to_string())
        );
    }

    #[test]
    fn invalid_coordinates_rejected() {
        assert!(Coordinate::new(91.0, 0.0).is_err());
        assert!(Coordinate::new(0.0, 181.0).is_err());
        assert!(Coordinate::new(f64::NAN, 0.0).is_err());
        assert!(Coordinate::new(48.85, 2.29).is_ok());
    }
}
