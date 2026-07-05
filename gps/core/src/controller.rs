//! The `DeviceController` seam: the single abstraction over device I/O (design §10a.2).
//!
//! `idevice` is one implementation (task 13); [`crate::mock::MockDeviceController`] is
//! another for hardware-free tests. Keeping all device I/O behind this trait is what
//! makes the state machine and hold-loop testable without a physical iPhone, and keeps
//! the underlying library swappable (DEPENDENCY_POLICY.md).

use async_trait::async_trait;

use crate::error::DeviceError;
use crate::types::{Coordinate, DeviceInfo, DeviceStatus};

/// Hardware hotplug events, distinct from the state-machine [`crate::state_machine::Event`].
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum DeviceEvent {
    /// A device was connected.
    Connected(DeviceInfo),
    /// The device was disconnected.
    Disconnected,
}

/// Abstraction over a single connected iOS device.
///
/// Methods are `async` (the real implementation performs network/USB I/O). Errors are
/// returned rather than panicking, so a host can surface remediation.
#[async_trait]
pub trait DeviceController: Send + Sync {
    /// Snapshot the current preconditions (trust / Developer Mode / DDI).
    async fn status(&self) -> Result<DeviceStatus, DeviceError>;

    /// Mount the personalized Developer Disk Image. Idempotent. (Requirement 4)
    async fn mount_ddi(&self) -> Result<(), DeviceError>;

    /// Apply a simulated location. (Requirement 1)
    async fn set_location(&self, coordinate: Coordinate) -> Result<(), DeviceError>;

    /// Clear the simulated location, returning the device to real GPS.
    /// Idempotent and safe to call from any state. (Requirement 2)
    async fn clear_location(&self) -> Result<(), DeviceError>;

    /// Await the next hotplug event; `None` when the event source ends.
    async fn next_event(&self) -> Option<DeviceEvent>;
}
