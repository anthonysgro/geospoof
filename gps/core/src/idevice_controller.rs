//! Real [`DeviceController`] backed by the `idevice` crate (task 13).
//!
//! Adapted from idevice's own (proven-compiling) CLI tools. **Compile-verified only** —
//! hardware verification is task 15 and the DDI-mount gate is task 16; behavior on a
//! real device is unconfirmed.
//!
//! Known follow-ups (need hardware to finalize):
//! - `set`/`clear` open a fresh CoreDeviceProxy software tunnel per call. Correct but
//!   heavy for the 5s hold re-apply — hold a persistent session later (perf).
//! - `status.developer_mode` is best-effort (proper detection needs the amfi service).
//! - `mount_ddi` cannot auto-source the personalized DDI yet (design §8 / task 16).
//! - `next_event` (usbmux hotplug streaming) is not implemented yet.

use async_trait::async_trait;

use idevice::core_device_proxy::CoreDeviceProxy;
use idevice::dvt::location_simulation::LocationSimulationClient;
use idevice::dvt::remote_server::RemoteServerClient;
use idevice::lockdown::LockdownClient;
use idevice::mobile_image_mounter::ImageMounter;
use idevice::provider::IdeviceProvider;
use idevice::rsd::RsdHandshake;
use idevice::usbmuxd::{Connection, UsbmuxdAddr, UsbmuxdConnection};
use idevice::{IdeviceService, RsdService};

use crate::controller::{DeviceController, DeviceEvent};
use crate::error::DeviceError;
use crate::types::{Coordinate, DeviceInfo, DeviceStatus};

const LABEL: &str = "geospoof-gps";

/// A `DeviceController` for a specific device (by UDID), backed by `idevice`.
pub struct IdeviceController {
    udid: String,
}

enum LocationOp {
    Set(f64, f64),
    Clear,
}

impl IdeviceController {
    /// Target a specific device by UDID.
    pub fn new(udid: impl Into<String>) -> Self {
        Self { udid: udid.into() }
    }

    /// List the UDIDs of USB-connected devices (usbmux discovery).
    pub async fn list_udids() -> Result<Vec<String>, DeviceError> {
        let mut usbmuxd = UsbmuxdConnection::default()
            .await
            .map_err(|e| DeviceError::Io(e.to_string()))?;
        let devices = usbmuxd
            .get_devices()
            .await
            .map_err(|e| DeviceError::Io(e.to_string()))?;
        Ok(devices
            .into_iter()
            .filter(|d| d.connection_type == Connection::Usb)
            .map(|d| d.udid)
            .collect())
    }

    async fn provider(&self) -> Result<Box<dyn IdeviceProvider>, DeviceError> {
        build_provider(&self.udid).await
    }

    /// Report basic, non-PII device identity (name / model / iOS). (Requirement 8)
    async fn query_device_info(&self) -> Result<DeviceInfo, DeviceError> {
        let provider = self.provider().await?;
        let mut lockdown = LockdownClient::connect(&*provider)
            .await
            .map_err(|e| DeviceError::Io(e.to_string()))?;
        if let Ok(pairing) = provider.get_pairing_file().await {
            let _ = lockdown.start_session(&pairing).await;
        }
        // Value type is inferred (plist::Value) so we don't need a direct plist dep.
        let name = lockdown
            .get_value(Some("DeviceName"), None)
            .await
            .ok()
            .and_then(|v| v.as_string().map(str::to_string))
            .unwrap_or_default();
        let product_type = lockdown
            .get_value(Some("ProductType"), None)
            .await
            .ok()
            .and_then(|v| v.as_string().map(str::to_string))
            .unwrap_or_default();
        let ios_version = lockdown
            .get_value(Some("ProductVersion"), None)
            .await
            .ok()
            .and_then(|v| v.as_string().map(str::to_string))
            .unwrap_or_default();
        Ok(DeviceInfo {
            udid: self.udid.clone(),
            name,
            product_type,
            ios_version,
        })
    }

    /// Open a DVT location-simulation session and run one op.
    ///
    /// The idevice RemoteServer session types are `!Send` across arbitrary lifetimes,
    /// which conflicts with `async_trait`'s Send-boxed futures (the hold-loop spawns
    /// `set_location`). So we run the session on a dedicated current-thread runtime
    /// inside `spawn_blocking`: the non-Send types stay on that thread and only a
    /// `Send` `Result` crosses back out. (A persistent session is a perf follow-up.)
    async fn run_location_op(&self, op: LocationOp) -> Result<(), DeviceError> {
        let udid = self.udid.clone();
        tokio::task::spawn_blocking(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .map_err(|e| DeviceError::Io(e.to_string()))?;
            rt.block_on(location_session(&udid, op))
        })
        .await
        .map_err(|e| DeviceError::Io(e.to_string()))?
    }

    async fn ddi_mounted(&self) -> bool {
        let Ok(provider) = self.provider().await else {
            return false;
        };
        let Ok(mut mounter) = ImageMounter::connect(&*provider).await else {
            return false;
        };
        mounter
            .copy_devices()
            .await
            .map(|images| !images.is_empty())
            .unwrap_or(false)
    }
}

#[async_trait]
impl DeviceController for IdeviceController {
    async fn device_info(&self) -> Result<DeviceInfo, DeviceError> {
        self.query_device_info().await
    }

    async fn status(&self) -> Result<DeviceStatus, DeviceError> {
        let provider = self.provider().await?;
        let mut lockdown = LockdownClient::connect(&*provider)
            .await
            .map_err(|_| DeviceError::NotConnected)?;
        let trusted = match provider.get_pairing_file().await {
            Ok(pairing) => lockdown.start_session(&pairing).await.is_ok(),
            Err(_) => false,
        };
        let ddi_mounted = self.ddi_mounted().await;
        Ok(DeviceStatus {
            trusted,
            // TODO(task follow-up): detect Developer Mode via the amfi service.
            developer_mode: trusted,
            ddi_mounted,
        })
    }

    async fn mount_ddi(&self) -> Result<(), DeviceError> {
        if self.ddi_mounted().await {
            return Ok(());
        }
        // Auto-mounting the personalized DDI needs a DDI source (image + build manifest
        // + trust cache). Sourcing/provenance is unresolved (design §8) and is exactly
        // what the Phase-0 gate (task 16) probes on stable iOS 26.
        Err(DeviceError::UnsupportedOs(
            "developer image not mounted; auto-mount needs a DDI source (Phase-0/task 16)".into(),
        ))
    }

    async fn set_location(&self, coordinate: Coordinate) -> Result<(), DeviceError> {
        self.run_location_op(LocationOp::Set(coordinate.latitude, coordinate.longitude))
            .await
    }

    async fn clear_location(&self) -> Result<(), DeviceError> {
        self.run_location_op(LocationOp::Clear).await
    }

    async fn next_event(&self) -> Option<DeviceEvent> {
        // TODO(task follow-up): stream usbmux hotplug events.
        None
    }
}

/// Build a usbmux provider for a specific device UDID.
async fn build_provider(udid: &str) -> Result<Box<dyn IdeviceProvider>, DeviceError> {
    let mut usbmuxd = UsbmuxdConnection::default()
        .await
        .map_err(|e| DeviceError::Io(e.to_string()))?;
    let dev = usbmuxd
        .get_device(udid)
        .await
        .map_err(|_| DeviceError::NotConnected)?;
    let addr = UsbmuxdAddr::from_env_var().map_err(|e| DeviceError::Io(e.to_string()))?;
    Ok(Box::new(dev.to_provider(addr, LABEL)))
}

/// Run one DVT location op over a fresh software tunnel. The session types are `!Send`,
/// so this runs on a current-thread runtime inside `spawn_blocking` (see caller).
async fn location_session(udid: &str, op: LocationOp) -> Result<(), DeviceError> {
    let provider = build_provider(udid).await?;
    let proxy = CoreDeviceProxy::connect(&*provider)
        .await
        .map_err(|e| DeviceError::TunnelFailed(e.to_string()))?;
    let rsd_port = proxy.tunnel_info().server_rsd_port;
    let mut adapter = proxy
        .create_software_tunnel()
        .map_err(|e| DeviceError::TunnelFailed(e.to_string()))?
        .to_async_handle();
    let stream = adapter
        .connect(rsd_port)
        .await
        .map_err(|e| DeviceError::TunnelFailed(e.to_string()))?;
    let mut handshake = RsdHandshake::new(stream)
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?;
    let mut server = RemoteServerClient::connect_rsd(&mut adapter, &mut handshake)
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?;
    server
        .read_message(0)
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?;
    let mut client = LocationSimulationClient::new(&mut server)
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?;
    match op {
        LocationOp::Set(lat, lon) => client
            .set(lat, lon)
            .await
            .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?,
        LocationOp::Clear => client
            .clear()
            .await
            .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?,
    }
    Ok(())
}
