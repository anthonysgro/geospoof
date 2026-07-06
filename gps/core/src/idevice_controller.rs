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

use std::net::IpAddr;
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
use idevice::remote_pairing::{
    RemotePairingClient, RpPairingFile, RpPairingSocket, connect_tls_psk_tunnel_native,
};
use idevice::rsd::RsdHandshake;
use idevice::tcp::adapter::Adapter;
use idevice::tcp::handle::AdapterHandle;
use idevice::usbmuxd::{Connection, UsbmuxdAddr, UsbmuxdConnection};
use idevice::{IdeviceService, RsdService};
use tokio::sync::{Mutex, mpsc, oneshot};

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
/// Bounds the whole overlay-tunnel establishment (RemotePairing connect + pair-verify +
/// tunnel-listener connect + TLS-PSK). On a firewalled network (corporate/public Wi-Fi
/// blocking device-to-device traffic) the raw `TcpStream::connect` can hang on the OS
/// default for minutes; this makes a blocked attempt fail fast so the run loop can report
/// "can't reach your iPhone" and retry (or the caller can fall back to USB).
const TUNNEL_CONNECT_TIMEOUT: Duration = Duration::from_secs(12);

/// The device's `_remotepairing._tcp` port (used for the overlay/remote transport, §10j).
const REMOTEPAIRING_PORT: u16 = 49152;

/// Overlay (off-usbmux) transport target for location ops: the device's IP on an overlay
/// network (e.g. a mesh VPN) plus the path to the RemotePairing record minted over USB by
/// [`IdeviceController::bootstrap_remote_pairing`] (§10j). When set, location set/clear
/// run over the RemotePairing → TLS-PSK → RSD → DVT chain instead of usbmux/CoreDeviceProxy.
#[derive(Clone)]
struct OverlayTarget {
    host: IpAddr,
    pairing_path: PathBuf,
}

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
    /// When set, location set/clear run over the overlay (remote) transport rather than
    /// usbmux (§10j). Identity/status/mount/bootstrap remain usbmux (setup-time, USB).
    overlay: Option<OverlayTarget>,
    /// Lazily-started persistent DVT location session. Held across set/clear so the
    /// tunnel + LocationSimulation stay alive between the hold-loop's re-applies — the
    /// simulated location never lapses into the real one (unlike a fresh tunnel per call).
    /// Dropped on error so the next attempt rebuilds (self-heal). In overlay mode it also
    /// carries desired/status file I/O (AFC) so the whole hold needs no usbmux (§16).
    location_session: Mutex<Option<PersistentSession>>,
}

#[derive(Clone, Copy)]
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
            overlay: None,
            location_session: Mutex::new(None),
        }
    }

    /// Point at a folder containing a user-provided DDI (Image.dmg / BuildManifest.plist
    /// / Image.dmg.trustcache) for `mount_ddi` to use.
    pub fn with_ddi_dir(mut self, dir: impl Into<PathBuf>) -> Self {
        self.ddi_dir = Some(dir.into());
        self
    }

    /// Route location set/clear over the overlay (remote) transport: the device at `host`
    /// on an overlay network, authenticated with the RemotePairing record at `pairing_path`
    /// (minted once over USB by [`Self::bootstrap_remote_pairing`]). This is the §10j
    /// "spoof on the go" path — establish while the phone is reachable, then it rides
    /// cellular roams for the life of the session. Identity/status/mount stay on usbmux.
    pub fn with_overlay(mut self, host: IpAddr, pairing_path: impl Into<PathBuf>) -> Self {
        self.overlay = Some(OverlayTarget {
            host,
            pairing_path: pairing_path.into(),
        });
        self
    }

    /// Mint and persist the RemotePairing record over the USB lockdown control service
    /// `com.apple.dt.remotepairingdeviced.lockdown` (§10j). Promptless (the device is
    /// already USB-trusted, and pairing is pinless). This is the one-time USB setup that
    /// unlocks the overlay transport: the network `_remotepairing._tcp` endpoint only
    /// pair-VERIFIES (`allowsPairSetup: false`), so the record MUST originate here.
    /// `pairing_path` is where the record is written (reuse it in [`Self::with_overlay`]).
    pub async fn bootstrap_remote_pairing(
        &self,
        pairing_path: impl AsRef<Path>,
    ) -> Result<(), DeviceError> {
        let udid = self.udid.clone();
        let path = pairing_path.as_ref().to_path_buf();
        // Non-Send session types → current-thread runtime inside spawn_blocking (same
        // pattern as the location/mount ops).
        let op = async move {
            tokio::task::spawn_blocking(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| DeviceError::Io(e.to_string()))?;
                rt.block_on(bootstrap_remote_pairing_session(&udid, &path))
            })
            .await
            .map_err(|e| DeviceError::Io(e.to_string()))?
        };
        with_timeout(OP_TIMEOUT, op).await
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

    /// UDIDs of devices connected by a USB **cable** only (excludes usbmuxd Wi-Fi-sync,
    /// `Connection::Network`). Used to prefer a physical cable over the wireless path: a
    /// cable is the most reliable transport and works on networks that block
    /// device-to-device traffic. Wireless is intentionally left to the RemotePairing
    /// tunnel, which survives the phone roaming better than usbmux Wi-Fi sync (§16).
    pub async fn list_cable_udids() -> Result<Vec<String>, DeviceError> {
        let mut usbmuxd = UsbmuxdConnection::default()
            .await
            .map_err(|e| DeviceError::Io(e.to_string()))?;
        let devices = usbmuxd
            .get_devices()
            .await
            .map_err(|e| DeviceError::Io(e.to_string()))?;
        Ok(devices
            .into_iter()
            .filter(|d| matches!(d.connection_type, Connection::Usb))
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
    /// Apply a location op over the persistent DVT session, starting it lazily. The
    /// session keeps the tunnel + LocationSimulation alive between calls, so the hold
    /// loop's re-applies never leave a gap where the real location resurfaces. On any
    /// error the session is dropped so the next attempt rebuilds it (self-healing after a
    /// device disconnect); a successful clear also releases it (stop = back to real GPS).
    async fn apply_location(&self, op: LocationOp) -> Result<(), DeviceError> {
        let mut guard = self.location_session.lock().await;
        if guard.is_none() {
            if matches!(op, LocationOp::Clear) {
                // Nothing live to clear — the device is already on its real location.
                return Ok(());
            }
            *guard = Some(PersistentSession::start(
                self.udid.clone(),
                self.overlay.clone(),
            ));
        }
        let session = guard.as_ref().expect("session present");
        let result = match op {
            LocationOp::Set(lat, lon) => session.set(lat, lon).await,
            LocationOp::Clear => session.clear().await,
        };
        // Drop on failure so the next attempt rebuilds (self-heal). We keep the session on
        // a successful clear — the tunnel stays open for desired/status I/O while idle.
        if result.is_err() {
            *guard = None;
        }
        result
    }

    /// Read a file from an app's Documents over the persistent session's tunnel (AFC over
    /// RSD). Used only in overlay mode; drops the session on error so it rebuilds.
    async fn session_read_file(
        &self,
        bundle_id: &str,
        filename: &str,
    ) -> Result<Vec<u8>, DeviceError> {
        let mut guard = self.location_session.lock().await;
        if guard.is_none() {
            *guard = Some(PersistentSession::start(
                self.udid.clone(),
                self.overlay.clone(),
            ));
        }
        let result = guard
            .as_ref()
            .expect("session present")
            .read_file(bundle_id, filename)
            .await;
        if result.is_err() {
            *guard = None;
        }
        result
    }

    /// Write a file to an app's Documents over the persistent session's tunnel (AFC over
    /// RSD). Used only in overlay mode; drops the session on error so it rebuilds.
    async fn session_write_file(
        &self,
        bundle_id: &str,
        filename: &str,
        bytes: Vec<u8>,
    ) -> Result<(), DeviceError> {
        let mut guard = self.location_session.lock().await;
        if guard.is_none() {
            *guard = Some(PersistentSession::start(
                self.udid.clone(),
                self.overlay.clone(),
            ));
        }
        let result = guard
            .as_ref()
            .expect("session present")
            .write_file(bundle_id, filename, bytes)
            .await;
        if result.is_err() {
            *guard = None;
        }
        result
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
            self.apply_location(LocationOp::Set(coordinate.latitude, coordinate.longitude)),
        )
        .await
    }

    async fn clear_location(&self) -> Result<(), DeviceError> {
        with_timeout(OP_TIMEOUT, self.apply_location(LocationOp::Clear)).await
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
        // Overlay/tunnel mode: read over the persistent tunnel (AFC over RSD) — no usbmux,
        // so it works after the phone rejoins Wi-Fi (§16).
        if self.overlay.is_some() {
            return with_timeout(OP_TIMEOUT, self.session_read_file(bundle_id, filename)).await;
        }
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

    /// Write a file into an installed app's Documents over house_arrest + AFC — the
    /// reverse of `read_app_file`, used to publish `status.json` back to the controlling
    /// iOS app (design §13e). `!Send` session types → `spawn_blocking` + current-thread rt.
    async fn write_app_file(
        &self,
        bundle_id: &str,
        filename: &str,
        bytes: &[u8],
    ) -> Result<(), DeviceError> {
        // Overlay/tunnel mode: write over the persistent tunnel (AFC over RSD) — no usbmux.
        if self.overlay.is_some() {
            return with_timeout(
                OP_TIMEOUT,
                self.session_write_file(bundle_id, filename, bytes.to_vec()),
            )
            .await;
        }
        let udid = self.udid.clone();
        let bundle_id = bundle_id.to_string();
        let filename = filename.to_string();
        let bytes = bytes.to_vec();
        let op = async move {
            tokio::task::spawn_blocking(move || {
                let rt = tokio::runtime::Builder::new_current_thread()
                    .enable_all()
                    .build()
                    .map_err(|e| DeviceError::Io(e.to_string()))?;
                rt.block_on(write_app_file_session(&udid, &bundle_id, &filename, &bytes))
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
    // idevice PANICS if an AFC file descriptor is dropped without `.close().await`
    // (afc/inner_file.rs). A read error — e.g. racing the app's ATOMIC rewrite of
    // desired.json when the user toggles sync off — must still close the fd, or the panic
    // crashes the session thread and tears down the DVT tunnel before we can clear the
    // spoof (the device then reverts only on its ~1–2 min timeout). Capture the result,
    // always close, then propagate.
    let read = fd
        .read_entire()
        .await
        .map_err(|e| DeviceError::Io(e.to_string()));
    let _ = fd.close().await;
    let bytes = read?;
    Ok(bytes)
}

/// Write `bytes` to `filename` in an app's Documents via house_arrest **VendDocuments** +
/// AFC (the write counterpart of [`read_app_file_session`]). Opens `Documents/<filename>`
/// `WrOnly` (O_WRONLY|O_CREAT|O_TRUNC) and writes the whole payload. Same VendDocuments path
/// as reads (dev/prod parity; requires the app's `UIFileSharingEnabled`). `!Send`; runs
/// inside `spawn_blocking`.
async fn write_app_file_session(
    udid: &str,
    bundle_id: &str,
    filename: &str,
    bytes: &[u8],
) -> Result<(), DeviceError> {
    let provider = build_provider(udid).await?;
    let house = HouseArrestClient::connect(&*provider)
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?;
    let mut afc = house
        .vend_documents(bundle_id)
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?;
    let mut fd = afc
        .open(format!("Documents/{filename}"), AfcFopenMode::WrOnly)
        .await
        .map_err(|e| DeviceError::Io(e.to_string()))?;
    // Always close the fd, even on write error — see the read helper: a dropped-unclosed
    // AFC descriptor panics idevice and kills the session thread.
    let written = fd
        .write_entire(bytes)
        .await
        .map_err(|e| DeviceError::Io(e.to_string()));
    let _ = fd.close().await;
    written?;
    Ok(())
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

/// A command sent to the live device-session thread.
enum SessionCmd {
    Set {
        lat: f64,
        lon: f64,
        reply: oneshot::Sender<Result<(), DeviceError>>,
    },
    Clear {
        reply: oneshot::Sender<Result<(), DeviceError>>,
    },
    /// Read a file from an app's Documents over house_arrest+AFC on the tunnel's RSD.
    ReadFile {
        bundle_id: String,
        filename: String,
        reply: oneshot::Sender<Result<Vec<u8>, DeviceError>>,
    },
    /// Write a file to an app's Documents over house_arrest+AFC on the tunnel's RSD.
    WriteFile {
        bundle_id: String,
        filename: String,
        bytes: Vec<u8>,
        reply: oneshot::Sender<Result<(), DeviceError>>,
    },
}

/// A persistent device session running on its own OS thread.
///
/// The idevice tunnel / RSD / DVT session types are `!Send` and borrow each other, so
/// they can't be held directly in the async controller. A dedicated thread runs a
/// current-thread runtime that establishes the RSD tunnel ONCE (tunnel → RSD →
/// RemoteServer → LocationSimulation) and then serves commands over a channel while
/// keeping the tunnel open:
/// - **Set/Clear** drive the held `LocationSimulation`, so the location holds continuously
///   with no revert window between re-applies (fresh-tunnel-per-call had that gap).
/// - **ReadFile/WriteFile** run house_arrest+AFC over the SAME RSD tunnel (the DVT client
///   owns its stream, so the adapter+handshake stay free for transient AFC connects). This
///   lets the agent read `desired.json` / write `status.json` over the tunnel too — the
///   whole hold works with NO usbmux, which is what survives the phone leaving and
///   rejoining Wi-Fi (usbmux doesn't re-arm its Wi-Fi-sync device; design §16).
struct PersistentSession {
    tx: mpsc::UnboundedSender<SessionCmd>,
    /// Kept only so the thread is joined on drop; it exits when `tx` (the channel) drops.
    _thread: std::thread::JoinHandle<()>,
}

impl PersistentSession {
    /// Spawn the session thread. Returns immediately — establishment happens on the
    /// thread. If it fails, the thread exits and the first command's reply errors
    /// (channel closed), prompting the controller to drop and rebuild.
    fn start(udid: String, overlay: Option<OverlayTarget>) -> Self {
        let (tx, rx) = mpsc::unbounded_channel::<SessionCmd>();
        let thread = std::thread::spawn(move || {
            let Ok(rt) = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
            else {
                return;
            };
            rt.block_on(session_loop(udid, overlay, rx));
        });
        Self {
            tx,
            _thread: thread,
        }
    }

    async fn set(&self, lat: f64, lon: f64) -> Result<(), DeviceError> {
        let (reply, rx) = oneshot::channel();
        self.tx
            .send(SessionCmd::Set { lat, lon, reply })
            .map_err(|_| DeviceError::NotConnected)?;
        rx.await.map_err(|_| DeviceError::NotConnected)?
    }

    async fn clear(&self) -> Result<(), DeviceError> {
        let (reply, rx) = oneshot::channel();
        self.tx
            .send(SessionCmd::Clear { reply })
            .map_err(|_| DeviceError::NotConnected)?;
        rx.await.map_err(|_| DeviceError::NotConnected)?
    }

    async fn read_file(&self, bundle_id: &str, filename: &str) -> Result<Vec<u8>, DeviceError> {
        let (reply, rx) = oneshot::channel();
        self.tx
            .send(SessionCmd::ReadFile {
                bundle_id: bundle_id.to_string(),
                filename: filename.to_string(),
                reply,
            })
            .map_err(|_| DeviceError::NotConnected)?;
        rx.await.map_err(|_| DeviceError::NotConnected)?
    }

    async fn write_file(
        &self,
        bundle_id: &str,
        filename: &str,
        bytes: Vec<u8>,
    ) -> Result<(), DeviceError> {
        let (reply, rx) = oneshot::channel();
        self.tx
            .send(SessionCmd::WriteFile {
                bundle_id: bundle_id.to_string(),
                filename: filename.to_string(),
                bytes,
                reply,
            })
            .map_err(|_| DeviceError::NotConnected)?;
        rx.await.map_err(|_| DeviceError::NotConnected)?
    }
}

/// Session-thread body: establish the RSD tunnel + DVT `LocationSimulation` once via the
/// selected transport — usbmux (`CoreDeviceProxy`) or overlay (`RemotePairing` → TLS-PSK
/// `CdTunnel`, §10j) — then serve `Set`/`Clear` over `rx`, keeping the tunnel alive so the
/// location holds. Exits (closing the tunnel) when establishment fails or the channel
/// closes (the controller dropped the session). All types here are `!Send`; this runs on
/// the session thread's own current-thread runtime.
async fn session_loop(
    udid: String,
    overlay: Option<OverlayTarget>,
    mut rx: mpsc::UnboundedReceiver<SessionCmd>,
) {
    // Establish once. On any failure, return — queued/next commands error via dropped
    // reply channels, and the controller rebuilds on the next attempt.
    let built = match &overlay {
        // Bound the overlay establishment so a firewalled network fails fast instead of
        // hanging on a dropped TCP connect (see TUNNEL_CONNECT_TIMEOUT).
        Some(target) => with_timeout(TUNNEL_CONNECT_TIMEOUT, overlay_adapter(target)).await,
        None => usbmux_adapter(&udid).await,
    };
    let Ok((mut adapter, rsd_port)) = built else {
        return;
    };
    let Ok(stream) = adapter.connect(rsd_port).await else {
        return;
    };
    let Ok(mut handshake) = RsdHandshake::new(stream).await else {
        return;
    };
    let Ok(mut server) = RemoteServerClient::connect_rsd(&mut adapter, &mut handshake).await else {
        return;
    };
    if server.read_message(0).await.is_err() {
        return;
    }
    let Ok(mut client) = LocationSimulationClient::new(&mut server).await else {
        return;
    };

    // Serve commands over the live session until the controller drops us (channel close).
    // `client` borrows `server` (which owns its stream), so `adapter`/`handshake` stay free
    // for transient house_arrest+AFC connects on the same tunnel (ReadFile/WriteFile).
    while let Some(cmd) = rx.recv().await {
        match cmd {
            SessionCmd::Set { lat, lon, reply } => {
                let r = client
                    .set(lat, lon)
                    .await
                    .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()));
                let _ = reply.send(r);
            }
            SessionCmd::Clear { reply } => {
                let r = client
                    .clear()
                    .await
                    .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()));
                let _ = reply.send(r);
            }
            SessionCmd::ReadFile {
                bundle_id,
                filename,
                reply,
            } => {
                let r = afc_read_rsd(&mut adapter, &mut handshake, &bundle_id, &filename).await;
                let _ = reply.send(r);
            }
            SessionCmd::WriteFile {
                bundle_id,
                filename,
                bytes,
                reply,
            } => {
                let r = afc_write_rsd(&mut adapter, &mut handshake, &bundle_id, &filename, &bytes)
                    .await;
                let _ = reply.send(r);
            }
        }
    }
}

/// Read `Documents/<filename>` from an app over house_arrest **VendDocuments** + AFC on the
/// tunnel's RSD (design §16). Mirrors the usbmux `read_app_file_session`, but connects the
/// service over the live tunnel adapter instead of a fresh usbmux link. `!Send`.
async fn afc_read_rsd(
    adapter: &mut AdapterHandle,
    handshake: &mut RsdHandshake,
    bundle_id: &str,
    filename: &str,
) -> Result<Vec<u8>, DeviceError> {
    let house = HouseArrestClient::connect_rsd(adapter, handshake)
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
    // idevice PANICS if an AFC file descriptor is dropped without `.close().await`
    // (afc/inner_file.rs). A read error — e.g. racing the app's ATOMIC rewrite of
    // desired.json when the user toggles sync off — must still close the fd, or the panic
    // crashes the session thread and tears down the DVT tunnel before we can clear the
    // spoof (the device then reverts only on its ~1–2 min timeout). Capture the result,
    // always close, then propagate.
    let read = fd
        .read_entire()
        .await
        .map_err(|e| DeviceError::Io(e.to_string()));
    let _ = fd.close().await;
    let bytes = read?;
    Ok(bytes)
}

/// Write `Documents/<filename>` to an app over house_arrest **VendDocuments** + AFC on the
/// tunnel's RSD (design §16). Mirrors the usbmux `write_app_file_session`. `!Send`.
async fn afc_write_rsd(
    adapter: &mut AdapterHandle,
    handshake: &mut RsdHandshake,
    bundle_id: &str,
    filename: &str,
    bytes: &[u8],
) -> Result<(), DeviceError> {
    let house = HouseArrestClient::connect_rsd(adapter, handshake)
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?;
    let mut afc = house
        .vend_documents(bundle_id)
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?;
    let mut fd = afc
        .open(format!("Documents/{filename}"), AfcFopenMode::WrOnly)
        .await
        .map_err(|e| DeviceError::Io(e.to_string()))?;
    // Always close the fd, even on write error — see the read helper: a dropped-unclosed
    // AFC descriptor panics idevice and kills the session thread.
    let written = fd
        .write_entire(bytes)
        .await
        .map_err(|e| DeviceError::Io(e.to_string()));
    let _ = fd.close().await;
    written?;
    Ok(())
}

/// Build an RSD-capable jktcp adapter over usbmux via `CoreDeviceProxy`'s software tunnel.
/// Returns the adapter handle plus the device's RSD port.
async fn usbmux_adapter(udid: &str) -> Result<(AdapterHandle, u16), DeviceError> {
    let provider = build_provider(udid).await?;
    let proxy = CoreDeviceProxy::connect(&*provider)
        .await
        .map_err(|e| DeviceError::TunnelFailed(e.to_string()))?;
    let rsd_port = proxy.tunnel_info().server_rsd_port;
    let adapter = proxy
        .create_software_tunnel()
        .map_err(|e| DeviceError::TunnelFailed(e.to_string()))?
        .to_async_handle();
    Ok((adapter, rsd_port))
}

/// Build an RSD-capable jktcp adapter over the overlay (§10j): network RemotePairing
/// pair-verify (using the USB-bootstrapped record) → `create_tcp_listener` → TLS-PSK
/// `CdTunnel` → jktcp adapter (same recipe as `CoreDeviceProxy::create_software_tunnel`,
/// no root/utun). Returns the adapter handle plus the tunnel's RSD port.
async fn overlay_adapter(target: &OverlayTarget) -> Result<(AdapterHandle, u16), DeviceError> {
    let host = target.host;

    // The network endpoint only pair-VERIFIES, so the record must already exist (bootstrap).
    let mut pairing_file = RpPairingFile::read_from_file(&target.pairing_path)
        .await
        .map_err(|e| {
            DeviceError::ServiceUnavailable(format!(
                "no RemotePairing record at {} (run bootstrap_remote_pairing over USB first): {e}",
                target.pairing_path.display()
            ))
        })?;

    // 1. Pair-verify over RPPairing framing.
    let control = tokio::net::TcpStream::connect((host, REMOTEPAIRING_PORT))
        .await
        .map_err(|e| DeviceError::Io(format!("connect {host}:{REMOTEPAIRING_PORT}: {e}")))?;
    let mut client = RemotePairingClient::new(RpPairingSocket::new(control), LABEL);
    client
        .connect(&mut pairing_file, || async { "000000".to_string() })
        .await
        .map_err(|e| DeviceError::TunnelFailed(format!("remote pair-verify: {e}")))?;

    // 2. Ask the device to open a tunnel listener, then TLS-PSK + CDTunnel to it.
    let listener_port = client
        .create_tcp_listener()
        .await
        .map_err(|e| DeviceError::TunnelFailed(format!("create_tcp_listener: {e}")))?;
    let key = client.encryption_key().to_vec();
    let tunnel = tokio::net::TcpStream::connect((host, listener_port))
        .await
        .map_err(|e| DeviceError::Io(format!("connect tunnel {host}:{listener_port}: {e}")))?;
    let cdt = connect_tls_psk_tunnel_native(tunnel, &key)
        .await
        .map_err(|e| DeviceError::TunnelFailed(format!("TLS-PSK/CDTunnel: {e}")))?;

    // 3. jktcp userspace adapter over the CDTunnel (mirrors create_software_tunnel).
    let our_ip = cdt
        .info
        .client_address
        .parse::<IpAddr>()
        .map_err(|e| DeviceError::TunnelFailed(format!("bad client address: {e}")))?;
    let their_ip = cdt
        .info
        .server_address
        .parse::<IpAddr>()
        .map_err(|e| DeviceError::TunnelFailed(format!("bad server address: {e}")))?;
    let mtu = cdt.info.mtu as usize;
    let rsd_port = cdt.info.server_rsd_port;
    let mut adapter = Adapter::new(Box::new(cdt.into_inner()), our_ip, their_ip);
    adapter.set_mss(mtu.saturating_sub(60));
    Ok((adapter.to_async_handle(), rsd_port))
}

/// Mint + persist the RemotePairing record over the USB lockdown control service (§10j).
/// `!Send`; runs inside `spawn_blocking` (see [`IdeviceController::bootstrap_remote_pairing`]).
async fn bootstrap_remote_pairing_session(
    udid: &str,
    pairing_path: &Path,
) -> Result<(), DeviceError> {
    const RP_LOCKDOWN_SERVICE: &str = "com.apple.dt.remotepairingdeviced.lockdown";

    let provider = build_provider(udid).await?;
    let mut lockdown = LockdownClient::connect(&*provider)
        .await
        .map_err(|e| DeviceError::Io(e.to_string()))?;
    let pairing = provider
        .get_pairing_file()
        .await
        .map_err(|_| DeviceError::NotTrusted)?;
    let legacy = lockdown
        .start_session(&pairing)
        .await
        .map_err(|e| DeviceError::Io(e.to_string()))?;
    let (port, ssl) = lockdown
        .start_service(RP_LOCKDOWN_SERVICE)
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(e.to_string()))?;
    let mut idev = provider
        .connect(port)
        .await
        .map_err(|e| DeviceError::Io(e.to_string()))?;
    if ssl && let Err(e) = idev.start_session(&pairing, legacy).await {
        return Err(DeviceError::Io(e.to_string()));
    }
    let sock = idev
        .get_socket()
        .ok_or_else(|| DeviceError::Io("remotepairing service had no socket".to_string()))?;

    // Reuse an existing record's host identity if present, else mint a fresh one.
    let mut pairing_file = match RpPairingFile::read_from_file(pairing_path).await {
        Ok(p) => p,
        Err(_) => RpPairingFile::generate(LABEL),
    };
    let mut client = RemotePairingClient::new(RpPairingSocket::new(sock), LABEL);
    // Pinless pairing (allowsPinlessPairing) uses the fixed code "000000"; idevice only
    // auto-fills it on the awaitingUserConsent branch, so supply it via the callback.
    client
        .connect(&mut pairing_file, || async { "000000".to_string() })
        .await
        .map_err(|e| DeviceError::ServiceUnavailable(format!("remote pairing setup: {e}")))?;
    pairing_file
        .write_to_file(pairing_path)
        .await
        .map_err(|e| DeviceError::Io(e.to_string()))?;
    Ok(())
}
