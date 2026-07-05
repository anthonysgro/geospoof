//! Core value types: coordinates, device identity/status, and device state.

use crate::error::DeviceError;

/// A geographic coordinate to simulate on the device.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Coordinate {
    /// Latitude in degrees, `-90.0..=90.0`.
    pub latitude: f64,
    /// Longitude in degrees, `-180.0..=180.0`.
    pub longitude: f64,
}

/// Returned when coordinate values are out of range or non-finite.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct InvalidCoordinate;

impl std::fmt::Display for InvalidCoordinate {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "coordinate out of range (lat -90..=90, lon -180..=180)")
    }
}

impl std::error::Error for InvalidCoordinate {}

impl Coordinate {
    /// Create a validated coordinate, rejecting out-of-range/non-finite input.
    /// (Requirement 1.4)
    pub fn new(latitude: f64, longitude: f64) -> Result<Self, InvalidCoordinate> {
        if latitude.is_finite()
            && longitude.is_finite()
            && (-90.0..=90.0).contains(&latitude)
            && (-180.0..=180.0).contains(&longitude)
        {
            Ok(Self {
                latitude,
                longitude,
            })
        } else {
            Err(InvalidCoordinate)
        }
    }
}

/// Identity of a connected device. Intentionally limited — no PII beyond what the UI
/// needs (design §10, Requirement 8).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceInfo {
    /// Unique device identifier.
    pub udid: String,
    /// User-visible device name.
    pub name: String,
    /// Marketing/product type (e.g., `iPhone18,3`).
    pub product_type: String,
    /// iOS version string (e.g., `26.5`).
    pub ios_version: String,
}

/// Snapshot of the device preconditions required before spoofing.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DeviceStatus {
    /// The device trusts this computer.
    pub trusted: bool,
    /// Developer Mode is enabled on the device.
    pub developer_mode: bool,
    /// The Developer Disk Image is mounted.
    pub ddi_mounted: bool,
}

impl DeviceStatus {
    /// All preconditions satisfied — the device is ready to spoof.
    pub fn is_ready(&self) -> bool {
        self.trusted && self.developer_mode && self.ddi_mounted
    }
}

/// Device/session state (design §6).
#[derive(Debug, Clone, PartialEq)]
pub enum DeviceState {
    /// No device connected.
    Disconnected,
    /// Connected but the computer is not trusted.
    NotTrusted,
    /// Connected and trusted, but Developer Mode is off.
    DeveloperModeOff,
    /// Trusted with Developer Mode on, but the DDI is not mounted.
    DdiNotMounted,
    /// All preconditions met; ready to spoof.
    Ready,
    /// Actively spoofing the given coordinate.
    Spoofing(Coordinate),
    /// Was spoofing but lost the fix; the coordinate is retained for recovery.
    SpoofLost(Coordinate),
    /// An error occurred; carries the cause for remediation display.
    Error(DeviceError),
}
