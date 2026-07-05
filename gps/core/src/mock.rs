//! A scriptable [`DeviceController`] test double (task 6).
//!
//! Available in unit tests and to other crates via the `mock` feature (design §10a.2),
//! so the FFI/agent can be exercised without hardware. Supports injectable failures and
//! per-call result sequences (for retry/backoff tests) plus call counting.

use std::collections::VecDeque;
use std::sync::Mutex;
use std::sync::atomic::{AtomicUsize, Ordering};

use async_trait::async_trait;

use crate::controller::{DeviceController, DeviceEvent};
use crate::error::DeviceError;
use crate::types::{Coordinate, DeviceInfo, DeviceStatus};

/// Configurable, observable fake device.
pub struct MockDeviceController {
    info: DeviceInfo,
    status: DeviceStatus,
    status_err: Option<DeviceError>,
    mount: Mutex<VecDeque<Result<(), DeviceError>>>,
    mount_default: Result<(), DeviceError>,
    set: Mutex<VecDeque<Result<(), DeviceError>>>,
    set_default: Result<(), DeviceError>,
    clear_default: Result<(), DeviceError>,
    events: Mutex<VecDeque<DeviceEvent>>,
    /// Scripted result for `read_app_file` (the AFC desired-state source).
    app_file: Mutex<Option<Result<Vec<u8>, DeviceError>>>,
    /// Files written via `write_app_file` (the status back-channel): (filename, bytes).
    written_app_files: Mutex<Vec<(String, Vec<u8>)>>,
    /// Optional forced error for `write_app_file`.
    write_app_file_err: Option<DeviceError>,
    set_calls: AtomicUsize,
    clear_calls: AtomicUsize,
    mount_calls: AtomicUsize,
}

impl MockDeviceController {
    /// A device with all preconditions satisfied and every operation succeeding.
    pub fn ready() -> Self {
        Self {
            info: DeviceInfo {
                udid: "MOCK-UDID".to_string(),
                name: "Mock iPhone".to_string(),
                product_type: "iPhone0,0".to_string(),
                ios_version: "26.0".to_string(),
            },
            status: DeviceStatus {
                trusted: true,
                developer_mode: true,
                ddi_mounted: true,
            },
            status_err: None,
            mount: Mutex::new(VecDeque::new()),
            mount_default: Ok(()),
            set: Mutex::new(VecDeque::new()),
            set_default: Ok(()),
            clear_default: Ok(()),
            events: Mutex::new(VecDeque::new()),
            app_file: Mutex::new(None),
            written_app_files: Mutex::new(Vec::new()),
            write_app_file_err: None,
            set_calls: AtomicUsize::new(0),
            clear_calls: AtomicUsize::new(0),
            mount_calls: AtomicUsize::new(0),
        }
    }

    /// Override the reported precondition status.
    pub fn with_status(mut self, status: DeviceStatus) -> Self {
        self.status = status;
        self
    }

    /// Make `status()` fail.
    pub fn with_status_err(mut self, err: DeviceError) -> Self {
        self.status_err = Some(err);
        self
    }

    /// Queue explicit results for successive `set_location` calls (retry tests).
    pub fn with_set_results(self, results: Vec<Result<(), DeviceError>>) -> Self {
        *self.set.lock().expect("mock lock") = results.into();
        self
    }

    /// Result used once queued `set_location` results are exhausted.
    pub fn with_set_default(mut self, result: Result<(), DeviceError>) -> Self {
        self.set_default = result;
        self
    }

    /// Queue explicit results for successive `mount_ddi` calls.
    pub fn with_mount_results(self, results: Vec<Result<(), DeviceError>>) -> Self {
        *self.mount.lock().expect("mock lock") = results.into();
        self
    }

    /// Script hotplug events returned by `next_event`.
    pub fn with_events(self, events: Vec<DeviceEvent>) -> Self {
        *self.events.lock().expect("mock lock") = events.into();
        self
    }

    /// Script the bytes (or error) returned by `read_app_file` — the AFC desired-state
    /// source. Set the desired.json the agent should read from the "app".
    pub fn with_app_file(self, result: Result<Vec<u8>, DeviceError>) -> Self {
        *self.app_file.lock().expect("mock lock") = Some(result);
        self
    }

    /// Make `write_app_file` fail (status back-channel failure test).
    pub fn with_write_app_file_err(mut self, err: DeviceError) -> Self {
        self.write_app_file_err = Some(err);
        self
    }

    /// Snapshot of files written via `write_app_file` — `(filename, bytes)` in call order.
    pub fn written_app_files(&self) -> Vec<(String, Vec<u8>)> {
        self.written_app_files.lock().expect("mock lock").clone()
    }

    /// Number of `set_location` calls observed.
    pub fn set_calls(&self) -> usize {
        self.set_calls.load(Ordering::SeqCst)
    }

    /// Number of `clear_location` calls observed.
    pub fn clear_calls(&self) -> usize {
        self.clear_calls.load(Ordering::SeqCst)
    }

    /// Number of `mount_ddi` calls observed.
    pub fn mount_calls(&self) -> usize {
        self.mount_calls.load(Ordering::SeqCst)
    }
}

#[async_trait]
impl DeviceController for MockDeviceController {
    async fn device_info(&self) -> Result<DeviceInfo, DeviceError> {
        Ok(self.info.clone())
    }

    async fn status(&self) -> Result<DeviceStatus, DeviceError> {
        match &self.status_err {
            Some(err) => Err(err.clone()),
            None => Ok(self.status),
        }
    }

    async fn mount_ddi(&self) -> Result<(), DeviceError> {
        self.mount_calls.fetch_add(1, Ordering::SeqCst);
        let next = self.mount.lock().expect("mock lock").pop_front();
        next.unwrap_or_else(|| self.mount_default.clone())
    }

    async fn set_location(&self, _coordinate: Coordinate) -> Result<(), DeviceError> {
        self.set_calls.fetch_add(1, Ordering::SeqCst);
        let next = self.set.lock().expect("mock lock").pop_front();
        next.unwrap_or_else(|| self.set_default.clone())
    }

    async fn clear_location(&self) -> Result<(), DeviceError> {
        self.clear_calls.fetch_add(1, Ordering::SeqCst);
        self.clear_default.clone()
    }

    async fn next_event(&self) -> Option<DeviceEvent> {
        self.events.lock().expect("mock lock").pop_front()
    }

    async fn read_app_file(
        &self,
        _bundle_id: &str,
        _filename: &str,
    ) -> Result<Vec<u8>, DeviceError> {
        match &*self.app_file.lock().expect("mock lock") {
            Some(Ok(bytes)) => Ok(bytes.clone()),
            Some(Err(e)) => Err(e.clone()),
            None => Err(DeviceError::ServiceUnavailable(
                "no app file scripted".to_string(),
            )),
        }
    }

    async fn write_app_file(
        &self,
        _bundle_id: &str,
        filename: &str,
        bytes: &[u8],
    ) -> Result<(), DeviceError> {
        if let Some(err) = &self.write_app_file_err {
            return Err(err.clone());
        }
        self.written_app_files
            .lock()
            .expect("mock lock")
            .push((filename.to_string(), bytes.to_vec()));
        Ok(())
    }
}
