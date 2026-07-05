//! geospoof-gps-core
//!
//! Host-agnostic core for GeoSpoof GPS. Wraps [`idevice`] to discover devices,
//! establish the userspace tunnel, mount the Developer Disk Image, and apply/clear a
//! simulated location.
//!
//! This is the workspace scaffold (task 2). The real surface arrives in later tasks:
//! the `DeviceController` trait + mock (task 5–6), the state machine and hold-loop
//! (task 7–9), and the `IdeviceController` implementation (task 13).

// Keep `idevice` linked while the real implementation is pending, so the dependency is
// resolved/locked and the target feature set compiles.
use idevice as _;

/// Version of the core, surfaced across the FFI boundary.
pub const CORE_VERSION: &str = env!("CARGO_PKG_VERSION");
