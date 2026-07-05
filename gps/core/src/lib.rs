//! geospoof-gps-core
//!
//! Host-agnostic core for GeoSpoof GPS. Wraps [`idevice`] to discover devices,
//! establish the userspace tunnel, mount the Developer Disk Image, and apply/clear a
//! simulated location.
//!
//! Section B (this scaffold's substance) provides the hardware-independent pieces:
//! the [`DeviceController`] seam (task 5), a scriptable [`mock`] (task 6), the pure
//! device [`state_machine`] (task 7), and the async [`hold`] loop (task 9). The real
//! `IdeviceController` implementation lands in a later task (13).

pub mod controller;
pub mod ddi;
pub mod error;
pub mod hold;
pub mod idevice_controller;
pub mod session;
pub mod state_machine;
pub mod types;

#[cfg(any(test, feature = "mock"))]
pub mod mock;

pub use controller::{DeviceController, DeviceEvent};
pub use error::DeviceError;
pub use hold::{HoldConfig, HoldOutcome, hold_location};
pub use idevice_controller::IdeviceController;
pub use session::{SessionState, SpoofSession};
pub use state_machine::{Event, Remediation, remediation_for, transition};
pub use types::{Coordinate, DeviceInfo, DeviceState, DeviceStatus, InvalidCoordinate};

/// Version of the core, surfaced across the FFI boundary.
pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");
