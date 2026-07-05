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

use std::path::{Path, PathBuf};
use std::time::Duration;

use async_trait::async_trait;

use idevice::afc::opcode::AfcFopenMode;
use idevice::core_device_proxy::CoreDeviceProxy;
use idevice::dvt::location_simulation::LocationSimulationClient;
use idevice::dvt::remote_server::RemoteServerClient;
use idevice::house_arrest::HouseArrestClient;
use idevice::lockdown::LockdownClient;
use idevice::mobile_image_mounter::ImageMounter;
use idevice::provider::{IdeviceProvider, TcpProvider};
use idevice::rsd::RsdHandshake;
use idevice::usbmuxd::{Connection, UsbmuxdAddr, UsbmuxdConnection};
use idevice::{IdeviceService, RsdService};

use crate::controller::{DeviceController, DeviceEvent};
use crate::error::DeviceError;
use crate::types::{Coordinate, DeviceInfo, DeviceStatus};

const LABEL: &str = "geospoof-gps";

/// Time budgets so no device op can ever hang the customer indefinitely (design §10a).
/// Quick reads (status/identity) resolve fast; location set/clear open a fresh tunnel;
/// mounting uploads a ~15 MB image + Apple TSS round-trip, so it gets the most headroom.
const STATUS_TIMEOUT: Duration = Duration::from_secs(15);
const OP_TIMEOUT: Duration = Duration::from_secs(30);
const MOUNT_TIMEOUT: Duration = Duration::from_secs(180);

/// Run `fut` with a deadline, mapping expiry to [`DeviceError::Timeout`] so the caller
/// always gets a definite outcome instead of blocking forever.
async fn with_timeout<T>(
    budget: Duration,
    fut: impl std::future::Future<Output = Result<T, DeviceError>>,
) -> Result<T, DeviceError> {
    match tokio::time::timeout(budget, fut).await {
        Ok(result) => result,
        Err(_elapsed) => Err(DeviceError::Timeout),
    }
}

/// A `DeviceController` for a specific device (by UDID), backed by `idevice`.
pub struct IdeviceController {
    udid: String,
    /// Optional folder holding a user-provided personalized DDI (clean 3-file layout).
    ddi_dir: Option<PathBuf>,
}

enum LocationOp {
    Set(f64, f64),
    Clear,
}

impl IdeviceController {
    /// Target a specific device by UDID.
    pub fn new(udid: impl Into<String>) -> Self {
        Self {
            udid: udid.into(),
            ddi_dir: None,
        }
    }

    /// Point at a folder containing a user-provided DDI (Image.dmg / BuildManifest.plist
    /// / Image.dmg.trustcache) for `mount_ddi` to use.
    pub fn with_ddi_dir(mut self, dir: impl Into<PathBuf>) -> Self {
        self.ddi_dir = Some(dir.into());
        self
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
        // Accept USB *and* network (Wi-Fi) devices so a spoof can hold over Wi-Fi after
        // the cable is unplugged (design: wireless hold). A device paired over USB then
        // reachable over Wi-Fi can appear under both connection types — dedup by UDID,
        // preserving discovery order.
        let mut seen = std::collections::HashSet::new();
        Ok(devices
            .into_iter()
            .filter(|d| matches!(d.connection_type, Connection::Usb | Connection::Network(_)))
            .filter_map(|d| seen.insert(d.udid.clone()).then_some(d.udid))
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

    /// Report trust / Developer Mode / DDI status. `ddi_mounted` is advisory only
    /// (unreliable on betas), so a failure to probe it is not fatal.
    async fn query_status(&self) -> Result<DeviceStatus, DeviceError> {
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

    /// NORTH-STAR EXPERIMENT (temporary): probe whether `lockdownd` answers over an
    /// arbitrary IP (e.g. a Tailscale/overlay address) via `TcpProvider`, bypassing
    /// usbmux entirely. Fetches the pairing record via usbmux (device must be reachable
    /// now), then connects lockdown to `ip:62078` over TCP and reads ProductVersion.
    /// Success ⇒ the remote/off-Wi-Fi control path is viable (design §10j).
    pub async fn tcp_lockdown_probe(&self, ip: std::net::IpAddr) -> Result<String, DeviceError> {
        let usb = self.provider().await?;
        let pairing = usb
            .get_pairing_file()
            .await
            .map_err(|e| DeviceError::Io(format!("get pairing file: {e}")))?;
        let tcp = TcpProvider {
            addr: ip,
            scope_id: None,
            pairing_file: pairing,
            label: LABEL.to_string(),
        };
        let mut lockdown = LockdownClient::connect(&tcp)
            .await
            .map_err(|e| DeviceError::ServiceUnavailable(format!("lockdown connect: {e}")))?;
        // Report whether the *authenticated session* works over TCP (developer services
        // need it), not just the raw connect.
        let session = match tcp.get_pairing_file().await {
            Ok(pairing) => match lockdown.start_session(&pairing).await {
                Ok(_) => "start_session=OK".to_string(),
                Err(e) => format!("start_session=FAILED({e})"),
            },
            Err(e) => format!("pairing=FAILED({e})"),
        };
        let version = lockdown
            .get_value(Some("ProductVersion"), None)
            .await
            .ok()
            .and_then(|v| v.as_string().map(str::to_string))
            .unwrap_or_default();
        let name = lockdown
            .get_value(Some("DeviceName"), None)
            .await
            .ok()
            .and_then(|v| v.as_string().map(str::to_string))
            .unwrap_or_default();
        Ok(format!(
            "{session}; ProductVersion={version:?}; DeviceName={name:?}"
        ))
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
        with_timeout(STATUS_TIMEOUT, self.query_device_info()).await
    }

    async fn status(&self) -> Result<DeviceStatus, DeviceError> {
        with_timeout(STATUS_TIMEOUT, self.query_status()).await
    }

    /// Mount a user-provided DDI on demand. Callers mount only after a spoof attempt
    /// fails with a DDI-shaped error (see the reconciler) — never blindly — so the
    /// already-mounted case never re-mounts (that was the hang). No pre-check here:
    /// `copy_devices` is unreliable on betas and probing it is what stalled.
    async fn mount_ddi(&self) -> Result<(), DeviceError> {
        // Non-Send session types → run on a current-thread runtime inside spawn_blocking
        // (same pattern as location ops).
        let udid = self.udid.clone();
        let ddi_dir = self.ddi_dir.clone();
        let op = async move {
            tokio::task::spawn_blocking(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| DeviceError::Io(e.to_string()))?;
                rt.block_on(mount_ddi_session(&udid, ddi_dir.as_deref()))
            })
            .await
            .map_err(|e| DeviceError::Io(e.to_string()))?
        };
        with_timeout(MOUNT_TIMEOUT, op).await
    }

    async fn set_location(&self, coordinate: Coordinate) -> Result<(), DeviceError> {
        with_timeout(
            OP_TIMEOUT,
            self.run_location_op(LocationOp::Set(coordinate.latitude, coordinate.longitude)),
        )
        .await
    }

    async fn clear_location(&self) -> Result<(), DeviceError> {
        with_timeout(OP_TIMEOUT, self.run_location_op(LocationOp::Clear)).await
    }

    async fn next_event(&self) -> Option<DeviceEvent> {
        // TODO(task follow-up): stream usbmux hotplug events.
        None
    }

    /// Read a file from an installed app's Documents over house_arrest + AFC, using the
    /// same usbmux link (USB or Wi-Fi) as the rest of the controller (design §10i). Runs
    /// on a current-thread runtime inside `spawn_blocking` (the idevice session types are
    /// `!Send`; same pattern as the location/mount ops).
    async fn read_app_file(&self, bundle_id: &str, filename: &str) -> Result<Vec<u8>, DeviceError> {
        let udid = self.udid.clone();
        let bundle_id = bundle_id.to_string();
        let filename = filename.to_string();
        let op = async move {
            tokio::task::spawn_blocking(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| DeviceError::Io(e.to_string()))?;
                rt.block_on(read_app_file_session(&udid, &bundle_id, &filename))
            })
            .await
            .map_err(|e| DeviceError::Io(e.to_string()))?
        };
        with_timeout(OP_TIMEOUT, op).await
    }
}

/// Read `filename` from an app's Documents via house_arrest **VendDocuments** + AFC.
/// This is the ONLY path — the same one App Store builds use (dev/prod parity), so dev
/// testing exercises exactly what customers get. VendDocuments requires the app to set
/// `UIFileSharingEnabled`.
///
/// IMPORTANT (verified on iOS 27): VendDocuments vends the app's **container root**, not
/// Documents directly, so a file at `Documents/<name>` on disk is read at the AFC path
/// `Documents/<name>` (NOT `/<name>`), and listing the root is denied — we open the known
/// path directly rather than enumerate. We do NOT fall back to VendContainer (dev-signed
/// only); that would diverge from prod and mask a missing `UIFileSharingEnabled`.
/// `!Send`; runs inside `spawn_blocking`.
async fn read_app_file_session(
    udid: &str,
    bundle_id: &str,
    filename: &str,
) -> Result<Vec<u8>, DeviceError> {
    let provider = build_provider(udid).await?;
    let house = HouseArrestClient::connect(&*provider)
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?;
    let mut afc = house
        .vend_documents(bundle_id)
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?;
    let mut fd = afc
        .open(format!("Documents/{filename}"), AfcFopenMode::RdOnly)
        .await
        .map_err(|e| DeviceError::Io(e.to_string()))?;
    let bytes = fd
        .read_entire()
        .await
        .map_err(|e| DeviceError::Io(e.to_string()))?;
    let _ = fd.close().await;
    Ok(bytes)
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

/// Mount a user-provided personalized DDI over a fresh software tunnel. idevice does
/// the Apple TSS personalization internally. `!Send`; runs inside `spawn_blocking`.
async fn mount_ddi_session(udid: &str, ddi_dir: Option<&Path>) -> Result<(), DeviceError> {
    // Locate the user-sourced DDI first (guidance error if absent) — no download/host.
    let files = crate::ddi::locate_ddi(ddi_dir)?;

    let provider = build_provider(udid).await?;

    // Device ECID (UniqueChipID) for personalization.
    let mut lockdown = LockdownClient::connect(&*provider)
        .await
        .map_err(|e| DeviceError::Io(e.to_string()))?;
    if let Ok(pairing) = provider.get_pairing_file().await {
        let _ = lockdown.start_session(&pairing).await;
    }
    let unique_chip_id = lockdown
        .get_value(Some("UniqueChipID"), None)
        .await
        .ok()
        .and_then(|v| v.as_unsigned_integer())
        .ok_or_else(|| DeviceError::Io("could not read UniqueChipID".to_string()))?;

    // RSD tunnel.
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

    let mut mounter = ImageMounter::connect_rsd(&mut adapter, &mut handshake)
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?;
    mounter
        .mount_personalized_rsd(
            &mut adapter,
            &mut handshake,
            files.image,
            files.trust_cache,
            &files.build_manifest,
            None,
            unique_chip_id,
        )
        .await
        .map_err(|e| DeviceError::MountFailed(e.to_string()))?;
    Ok(())
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
