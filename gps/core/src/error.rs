//! Error types for device operations.

use thiserror::Error;

/// Errors returned by [`crate::controller::DeviceController`] operations.
///
/// `Clone`/`PartialEq` are derived to make these easy to assert on in tests and to
/// carry inside state-machine states.
#[derive(Debug, Clone, PartialEq, Eq, Error)]
pub enum DeviceError {
    /// No device is connected.
    #[error("no device connected")]
    NotConnected,
    /// The device has not trusted this computer.
    #[error("device is not trusted")]
    NotTrusted,
    /// Developer Mode is disabled on the device.
    #[error("Developer Mode is disabled on the device")]
    DeveloperModeOff,
    /// The Developer Disk Image is not mounted.
    #[error("Developer Disk Image is not mounted")]
    DdiNotMounted,
    /// No Developer Disk Image files are available to mount (carries guidance).
    #[error("{0}")]
    DdiUnavailable(String),
    /// Mounting the Developer Disk Image failed.
    #[error("failed to mount the Developer Disk Image: {0}")]
    MountFailed(String),
    /// Establishing the device tunnel failed.
    #[error("failed to establish the device tunnel: {0}")]
    TunnelFailed(String),
    /// The location service could not be started/used.
    #[error("location service unavailable: {0}")]
    ServiceUnavailable(String),
    /// The device's iOS version is not supported yet (e.g., DDI signing unavailable).
    #[error("iOS version not supported yet: {0}")]
    UnsupportedOs(String),
    /// A lower-level I/O error.
    #[error("device I/O error: {0}")]
    Io(String),
}
