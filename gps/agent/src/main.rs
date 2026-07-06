//! GeoSpoof GPS headless agent (Section F).
//!
//! Reconciles a desired-location file to the connected device and writes a status
//! file (design §10d). No GUI — the source-of-truth app owns the UI. A small CLI
//! (`run` / `set` / `clear` / `status`) drives it for dev/testing.

mod contract;
mod discovery;
mod keepawake;
mod reconcile;
mod service;

use std::net::IpAddr;
use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use geospoof_gps_core::{DeviceController, HoldConfig, IdeviceController};
use tracing_subscriber::EnvFilter;

use contract::{CONTRACT_VERSION, DesiredState, SessionReport, StatusReport};
use keepawake::{KeepAwake, should_keep_awake};
use reconcile::Reconciler;

const AGENT_VERSION: &str = env!("CARGO_PKG_VERSION");
const POLL_INTERVAL: Duration = Duration::from_secs(1);

#[tokio::main]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    let cmd = args.get(1).map(String::as_str).unwrap_or("help");
    let dir = data_dir();

    match cmd {
        "run" => {
            init_logging();
            if let Err(e) = std::fs::create_dir_all(&dir) {
                eprintln!("cannot create data dir {}: {e}", dir.display());
                std::process::exit(1);
            }
            run(&dir).await;
        }
        "set" => {
            let lat = args.get(2).and_then(|s| s.parse::<f64>().ok());
            let lon = args.get(3).and_then(|s| s.parse::<f64>().ok());
            // Optional source (default manual) so the sync flow can be driven for
            // testing: `set <lat> <lon> vpn-sync` mirrors "match my VPN".
            let source = args.get(4).map(String::as_str);
            let desired = match (lat, lon, source) {
                (Some(lat), Some(lon), Some("vpn-sync")) => Some(DesiredState::vpn_sync(lat, lon)),
                (Some(lat), Some(lon), Some("from-app")) => Some(DesiredState::from_app(lat, lon)),
                (Some(lat), Some(lon), Some("manual") | None) => {
                    Some(DesiredState::manual(lat, lon))
                }
                (Some(_), Some(_), Some(other)) => {
                    eprintln!("unknown source '{other}' (use: manual | vpn-sync | from-app)");
                    None
                }
                _ => {
                    eprintln!(
                        "usage: geospoof-gps-agent set <lat> <lon> [manual|vpn-sync|from-app]"
                    );
                    None
                }
            };
            if let Some(desired) = desired {
                write_desired(&dir, &desired);
            }
        }
        "bootstrap" => {
            init_logging();
            bootstrap(&dir).await;
        }
        "discover" => {
            init_logging();
            let found = tokio::task::spawn_blocking(|| {
                discovery::discover_remotepairing(Duration::from_secs(5))
            })
            .await
            .ok()
            .flatten();
            match found {
                Some((ip, port)) => println!("found device at {ip}:{port}"),
                None => println!("no device found on the LAN (mDNS _remotepairing._tcp)"),
            }
        }
        "clear" => write_desired(&dir, &DesiredState::disabled()),
        "status" => match read_status(&dir) {
            Some(report) => println!(
                "{}",
                serde_json::to_string_pretty(&report).unwrap_or_default()
            ),
            None => println!("no status yet (is the agent running?)"),
        },
        "doctor" => {
            init_logging();
            doctor(&dir).await;
        }
        "mount-ddi" => {
            init_logging();
            mount_ddi_cmd().await;
        }
        "install-service" => install_service(),
        "uninstall-service" => uninstall_service(),
        "service-status" => {
            if service::is_installed() {
                println!("GeoSpoof GPS background agent is installed and running");
            } else {
                println!("GeoSpoof GPS background agent is not installed");
            }
        }
        // No subcommand: if we were double-clicked inside the .app bundle (LaunchServices
        // runs the executable with no args), treat that as "set me up" — install + start
        // the background agent and confirm with a dialog. Otherwise print usage.
        "help" if running_from_app_bundle() => install_service(),
        _ => {
            eprintln!(
                "geospoof-gps-agent <run|bootstrap|doctor|mount-ddi|set LAT LON|clear|status|\
                 install-service|uninstall-service|service-status>"
            );
        }
    }
}

/// Print device setup health as JSON for the setup wizard (menu app). Probes over USB
/// (usbmux/lockdown), so it reflects the plugged-in device; every field is the "not yet"
/// state when nothing is connected. `ready` means all setup steps are complete.
///
/// Honest limits (idevice): Developer Mode isn't separately detectable yet (mirrors
/// `trusted`), and DDI detection is unreliable on betas — so the wizard treats those two
/// as best-effort hints and confirms by actually trying to spoof.
async fn doctor(dir: &Path) {
    // Testing hook: GEOSPOOF_DOCTOR_FAKE=<json object> makes doctor echo that state
    // verbatim, so the setup wizard's every state (missing device, untrusted, no DDI, …)
    // can be previewed without device gymnastics. Unset in normal use.
    if let Ok(fake) = std::env::var("GEOSPOOF_DOCTOR_FAKE")
        && !fake.trim().is_empty()
    {
        println!("{fake}");
        return;
    }

    let bootstrapped = rp_pairing_path(dir).exists();
    let mut usb_connected = false;
    let mut device_name: Option<String> = None;
    let mut trusted = false;
    let mut developer_mode = false;
    let mut ddi_mounted = false;

    if let Ok(mut udids) = IdeviceController::list_udids().await
        && let Some(udid) = udids.drain(..).next()
    {
        usb_connected = true;
        let controller = IdeviceController::new(udid);
        if let Ok(info) = controller.device_info().await {
            device_name = Some(info.name);
        }
        if let Ok(status) = controller.status().await {
            trusted = status.trusted;
            developer_mode = status.developer_mode;
            ddi_mounted = status.ddi_mounted;
        }
    }

    let ready = trusted && developer_mode && ddi_mounted && bootstrapped;
    let report = serde_json::json!({
        "usb_connected": usb_connected,
        "device_name": device_name,
        "trusted": trusted,
        "developer_mode": developer_mode,
        "ddi_mounted": ddi_mounted,
        "bootstrapped": bootstrapped,
        "ready": ready,
    });
    println!(
        "{}",
        serde_json::to_string_pretty(&report).unwrap_or_default()
    );
}

/// Mount the Developer Disk Image over USB (the setup wizard's "Prepare developer image"
/// button). Exits non-zero with a message on failure so the wizard can surface it.
async fn mount_ddi_cmd() {
    let udid = match IdeviceController::list_udids().await {
        Ok(mut v) => v.drain(..).next(),
        Err(e) => {
            eprintln!("device discovery failed: {e}");
            std::process::exit(1);
        }
    };
    let Some(udid) = udid else {
        eprintln!("no iPhone found over USB — connect it, unlock, and tap Trust");
        std::process::exit(1);
    };
    match IdeviceController::new(udid).mount_ddi().await {
        Ok(()) => println!("developer image mounted"),
        Err(e) => {
            eprintln!("mount failed: {e}");
            std::process::exit(1);
        }
    }
}

/// True when this executable lives inside a macOS `.app` bundle (…/GeoSpoof
/// GPS.app/Contents/MacOS/…), i.e. it was launched from /Applications rather than run
/// directly from a build dir.
fn running_from_app_bundle() -> bool {
    std::env::current_exe()
        .ok()
        .and_then(|p| p.to_str().map(|s| s.contains(".app/Contents/MacOS/")))
        .unwrap_or(false)
}

/// Install + start the per-user LaunchAgent, reporting the outcome. When launched
/// interactively from the bundle, also surface a native dialog so the user gets
/// feedback (a headless agent shows nothing otherwise).
fn install_service() {
    match service::install() {
        Ok(path) => {
            println!(
                "GeoSpoof GPS is now running in the background (LaunchAgent: {}).",
                path.display()
            );
            notify_dialog(
                "GeoSpoof GPS is now running in the background.\n\nControl it from the GeoSpoof app on your iPhone.",
            );
        }
        Err(e) => {
            // Keep the technical detail in the log/stderr; show the user something
            // actionable rather than a raw launchctl error.
            eprintln!("could not install the background agent: {e}");
            notify_dialog(
                "GeoSpoof GPS couldn't start its background service.\n\nQuit GeoSpoof GPS and open it again. If it keeps happening, reinstall from the DMG.",
            );
        }
    }
}

fn uninstall_service() {
    match service::uninstall() {
        Ok(()) => println!("GeoSpoof GPS background agent removed."),
        Err(e) => eprintln!("could not remove the background agent: {e}"),
    }
}

/// Best-effort native dialog (only meaningful when launched from the bundle). Never
/// fatal — a missing/blocked `osascript` just means no popup.
fn notify_dialog(message: &str) {
    if !running_from_app_bundle() {
        return;
    }
    let script = format!(
        "display dialog {} with title \"GeoSpoof GPS\" buttons {{\"OK\"}} default button \"OK\"",
        applescript_quote(message)
    );
    let _ = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .status();
}

/// Quote a string as an AppleScript string literal (escape `\` and `"`).
fn applescript_quote(s: &str) -> String {
    format!("\"{}\"", s.replace('\\', "\\\\").replace('"', "\\\""))
}

/// One-time USB setup for the overlay (remote) transport (§10j): mint + persist the
/// RemotePairing record so the agent can later drive the device over an overlay network
/// while it's on any Wi-Fi. Promptless (the device is already USB-trusted). Run once with
/// the iPhone connected via USB, unlocked, and trusted.
async fn bootstrap(dir: &Path) {
    let udid = match IdeviceController::list_udids().await {
        Ok(mut v) => match v.drain(..).next() {
            Some(u) => u,
            None => {
                eprintln!(
                    "no iPhone found over USB — connect it, unlock, and tap Trust, then retry"
                );
                std::process::exit(1);
            }
        },
        Err(e) => {
            eprintln!("device discovery failed: {e}");
            std::process::exit(1);
        }
    };
    if let Err(e) = std::fs::create_dir_all(dir) {
        eprintln!("cannot create data dir {}: {e}", dir.display());
        std::process::exit(1);
    }
    let path = rp_pairing_path(dir);
    match IdeviceController::new(udid)
        .bootstrap_remote_pairing(&path)
        .await
    {
        Ok(()) => println!("remote pairing ready -> {}", path.display()),
        Err(e) => {
            eprintln!("bootstrap failed: {e}");
            std::process::exit(1);
        }
    }
}

fn init_logging() {
    // Local, PII-redacted logging (task 14b). We log states/errors only — never
    // device serials, phone numbers, or coordinates.
    let filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));
    tracing_subscriber::fmt()
        .with_env_filter(filter)
        .with_writer(std::io::stderr)
        .init();
}

/// Where the desired state comes from.
enum DesiredSource {
    /// Read `desired.json` from the local data dir (macOS App Group container, or CLI
    /// `set`/`clear` for testing).
    LocalFile,
    /// Read `desired.json` from the GeoSpoof iOS app's Documents over the device link
    /// (house_arrest + AFC), so the phone controls the spoof over Wi-Fi (design §10i).
    IosApp { bundle_id: String },
}

impl DesiredSource {
    /// `GEOSPOOF_APP_BUNDLE_ID=<id>` selects the iOS-app source; otherwise local file.
    fn from_env() -> Self {
        match std::env::var("GEOSPOOF_APP_BUNDLE_ID") {
            Ok(id) if !id.trim().is_empty() => DesiredSource::IosApp { bundle_id: id },
            _ => DesiredSource::LocalFile,
        }
    }

    fn describe(&self) -> String {
        match self {
            DesiredSource::LocalFile => "local-file".to_string(),
            DesiredSource::IosApp { bundle_id } => format!("ios-app:{bundle_id}"),
        }
    }
}

/// Resolve the desired state from the configured source. On any read/parse failure
/// return the cached `last` state, so a transient source hiccup (e.g. an AFC blip while
/// the phone is still reachable) never drops the hold.
///
/// Returns `(desired, reached)` where `reached` is whether we actually read the state
/// from the device this tick — proof the device is reachable, used to report `connected`
/// honestly (design §18). For the local-file dev path there's no device read, so
/// `reached` is reported `true` (the tunnel `connected` logic that uses it doesn't apply
/// to the usbmux/local path).
async fn resolve_desired(
    source: &DesiredSource,
    controller: &dyn DeviceController,
    dir: &Path,
    last: &DesiredState,
) -> (DesiredState, bool) {
    match source {
        DesiredSource::LocalFile => (read_desired(dir), true),
        DesiredSource::IosApp { bundle_id } => {
            match controller.read_app_file(bundle_id, "desired.json").await {
                // A successful read means we reached the device (`reached = true`), even
                // if the bytes don't parse — that's a content problem, not connectivity.
                Ok(bytes) => match serde_json::from_slice::<DesiredState>(&bytes) {
                    Ok(desired) => (desired, true),
                    Err(e) => {
                        tracing::warn!("invalid desired.json from app: {e}");
                        (last.clone(), true)
                    }
                },
                Err(e) => {
                    tracing::debug!("app desired read failed ({e}); using cached desired");
                    (last.clone(), false)
                }
            }
        }
    }
}

/// The reconciliation loop: resolve desired (local file or iOS app over Wi-Fi),
/// reconcile, write status. Caches the last desired state so it re-drives on reconnect.
async fn run(dir: &Path) {
    let pro = check_pro(dir);
    let config = HoldConfig::default();
    let source = DesiredSource::from_env();
    let rp_path = rp_pairing_path(dir);

    // Transport selection: an explicit overlay host (remote), or a bootstrapped
    // RemotePairing record (LAN, discovered via mDNS), routes over the remote-pairing
    // tunnel — usbmux-independent, so it survives the phone leaving and rejoining Wi-Fi
    // (usbmux won't re-arm its Wi-Fi-sync device; design §16). Otherwise legacy usbmux.
    let overlay_host: Option<IpAddr> = std::env::var("GEOSPOOF_OVERLAY_HOST")
        .ok()
        .and_then(|s| s.trim().parse().ok());
    let tunnel = overlay_host.is_some() || rp_path.exists();
    tracing::info!(
        pro,
        source = %source.describe(),
        transport = if tunnel { "tunnel" } else { "usbmux" },
        "agent started"
    );

    // Last desired state we successfully resolved. Cached so a momentary source read
    // failure doesn't drop the hold (design §10i).
    let mut last_desired = DesiredState::disabled();
    let mut current: Option<(Arc<dyn DeviceController>, Reconciler)> = None;
    // Last (session, connected, pro) we logged at info. The loop ticks ~1/s; logging
    // every tick floods the log (92 MB after a day). Log at info only on a state change;
    // everything else stays at debug (opt-in via RUST_LOG).
    let mut last_logged: Option<(SessionReport, bool, bool)> = None;
    // Prevent idle sleep while actively spoofing so the Wi-Fi hold isn't dropped
    // (design §10h). Released automatically when idle/disconnected and on shutdown.
    let mut keep_awake = KeepAwake::new();
    // Resolves on SIGTERM/SIGINT so we can clear the spoof before exiting (see below).
    let mut shutdown = std::pin::pin!(shutdown_signal());

    loop {
        // (Re)connect whenever we have no live controller. In tunnel mode this
        // rediscovers the device (possibly at a new IP) after a drop — the key to
        // resuming when the phone rejoins Wi-Fi.
        if current.is_none() {
            let controller = connect_controller(overlay_host, tunnel, &rp_path).await;
            if let Some(controller) = controller {
                tracing::info!(
                    transport = if tunnel { "tunnel" } else { "usbmux" },
                    "device connected"
                );
                let reconciler = Reconciler::new(Arc::clone(&controller), config.clone(), pro)
                    .tunnel_mode(tunnel);
                current = Some((controller, reconciler));
            }
        }

        if let Some((controller, reconciler)) = &current {
            let (desired, reached) =
                resolve_desired(&source, controller.as_ref(), dir, &last_desired).await;
            last_desired = desired.clone();
            let report = reconciler.reconcile(&desired, reached).await;
            let summary = (report.session, report.connected, report.pro);
            if last_logged != Some(summary) {
                tracing::info!(
                    session = ?report.session,
                    connected = report.connected,
                    pro = report.pro,
                    "reconciled"
                );
                last_logged = Some(summary);
            } else {
                tracing::debug!(session = ?report.session, "reconciled (unchanged)");
            }
            write_status(dir, &report);
            // Publish status back to the controlling iOS app (over the same transport) so
            // the phone can show state + remediation (design §13e).
            publish_status_to_app(&source, controller.as_ref(), &report).await;
            keep_awake.set(should_keep_awake(report.session));
            // Reconnect (rediscover) only on a genuine reachability problem: either we
            // failed to read the device this tick (`!reached` — it may have moved/left, so
            // keep searching), or we're actively spoofing (Pro + a location) but the
            // attempt didn't land. When the device IS reachable but we're idle by choice —
            // not entitled, or spoofing toggled off in the app — `connected` is false yet
            // nothing is wrong; reconnecting then would just thrash mDNS discovery. Keep
            // the controller and idle quietly (design §18).
            let lost_device = !reached || (report.pro && desired.enabled && !report.connected);
            if lost_device {
                tracing::info!("device unreachable; will reconnect");
                current = None;
                keep_awake.set(false);
            }
        } else {
            write_status(dir, &disconnected_report(pro));
            keep_awake.set(false);
        }

        tokio::select! {
            _ = tokio::time::sleep(POLL_INTERVAL) => {}
            _ = &mut shutdown => {
                tracing::info!("shutdown signal — clearing location before exit");
                break;
            }
        }
    }

    // Graceful shutdown: clear the spoof over the live tunnel so the device reverts to its
    // REAL location immediately. Without this, killing the agent leaves the persistent
    // session dangling and the device keeps the spoof until its side times out the tunnel
    // (a minute+). The in-app "stop" path already clears; this covers the app being quit
    // (or the machine shutting down) while a spoof is active.
    if let Some((controller, _)) = &current {
        let _ = controller.clear_location().await;
    }
    keep_awake.set(false);
}

/// Resolve when the process is asked to stop (SIGTERM/SIGINT), so `run` can clear the spoof
/// before exiting rather than leaving the device to time out a dangling tunnel session.
async fn shutdown_signal() {
    #[cfg(unix)]
    {
        use tokio::signal::unix::{SignalKind, signal};
        if let (Ok(mut term), Ok(mut int)) = (
            signal(SignalKind::terminate()),
            signal(SignalKind::interrupt()),
        ) {
            tokio::select! {
                _ = term.recv() => {}
                _ = int.recv() => {}
            }
            return;
        }
    }
    let _ = tokio::signal::ctrl_c().await;
}

/// Find and construct a controller for the current transport: an explicit overlay host, a
/// mDNS-discovered LAN device over the remote-pairing tunnel, or (legacy) usbmux. Returns
/// `None` when no device is reachable this tick.
async fn connect_controller(
    overlay_host: Option<IpAddr>,
    tunnel: bool,
    rp_path: &Path,
) -> Option<Arc<dyn DeviceController>> {
    if let Some(ip) = overlay_host {
        return Some(Arc::new(
            IdeviceController::new("overlay").with_overlay(ip, rp_path.to_path_buf()),
        ));
    }
    if tunnel {
        // Discover the phone's `_remotepairing._tcp` endpoint on the LAN (mDNS browse is
        // blocking, so run it off the async runtime).
        let found = tokio::task::spawn_blocking(|| {
            discovery::discover_remotepairing(Duration::from_secs(3))
        })
        .await
        .ok()
        .flatten();
        return found.map(|(ip, _port)| {
            Arc::new(IdeviceController::new("overlay").with_overlay(ip, rp_path.to_path_buf()))
                as Arc<dyn DeviceController>
        });
    }
    // Legacy usbmux.
    let udid = IdeviceController::list_udids()
        .await
        .ok()
        .and_then(|mut v| v.drain(..).next());
    udid.map(|u| Arc::new(IdeviceController::new(u)) as Arc<dyn DeviceController>)
}

/// Publish the status report back to the controlling iOS app's Documents over the device
/// link (§13e), so the phone can display connected/spoofing state + remediation. Only in
/// `IosApp` mode; best-effort — a write failure (e.g. an AFC blip) is logged, never fatal.
async fn publish_status_to_app(
    source: &DesiredSource,
    controller: &dyn DeviceController,
    report: &StatusReport,
) {
    let DesiredSource::IosApp { bundle_id } = source else {
        return;
    };
    match serde_json::to_vec_pretty(report) {
        Ok(json) => {
            if let Err(e) = controller
                .write_app_file(bundle_id, "status.json", &json)
                .await
            {
                tracing::debug!("status write-back to app failed: {e}");
            }
        }
        Err(e) => tracing::warn!("cannot serialize status for app: {e}"),
    }
}

/// STUB entitlement check (real licensing is a later task list): Pro if the
/// `GEOSPOOF_PRO=1` env is set or a `pro.license` file exists in the data dir.
fn check_pro(dir: &Path) -> bool {
    std::env::var("GEOSPOOF_PRO")
        .map(|v| v == "1")
        .unwrap_or(false)
        || dir.join("pro.license").exists()
}

fn data_dir() -> PathBuf {
    if let Ok(d) = std::env::var("GEOSPOOF_GPS_DIR") {
        return PathBuf::from(d);
    }
    let home = std::env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home).join("Library/Application Support/GeoSpoof GPS")
}

fn desired_path(dir: &Path) -> PathBuf {
    dir.join("desired.json")
}

/// Path to the persisted RemotePairing record used by the overlay transport (§10j).
fn rp_pairing_path(dir: &Path) -> PathBuf {
    dir.join("rp-pairing.plist")
}

fn status_path(dir: &Path) -> PathBuf {
    dir.join("status.json")
}

fn read_desired(dir: &Path) -> DesiredState {
    match std::fs::read_to_string(desired_path(dir)) {
        Ok(s) => serde_json::from_str(&s).unwrap_or_else(|e| {
            tracing::warn!("invalid desired.json: {e}");
            DesiredState::disabled()
        }),
        Err(_) => DesiredState::disabled(),
    }
}

fn write_desired(dir: &Path, desired: &DesiredState) {
    if let Err(e) = std::fs::create_dir_all(dir) {
        eprintln!("cannot create data dir: {e}");
        return;
    }
    match serde_json::to_string_pretty(desired) {
        Ok(json) => {
            if let Err(e) = std::fs::write(desired_path(dir), json) {
                eprintln!("cannot write desired.json: {e}");
            }
        }
        Err(e) => eprintln!("cannot serialize desired state: {e}"),
    }
}

fn write_status(dir: &Path, report: &StatusReport) {
    if let Ok(json) = serde_json::to_string_pretty(report)
        && let Err(e) = std::fs::write(status_path(dir), json)
    {
        tracing::warn!("cannot write status.json: {e}");
    }
}

fn read_status(dir: &Path) -> Option<StatusReport> {
    let s = std::fs::read_to_string(status_path(dir)).ok()?;
    serde_json::from_str(&s).ok()
}

fn disconnected_report(pro: bool) -> StatusReport {
    StatusReport {
        version: CONTRACT_VERSION,
        agent_version: AGENT_VERSION.to_string(),
        connected: false,
        device: None,
        session: SessionReport::Idle,
        provenance: contract::Provenance::Unknown,
        remediation: "Connect your iPhone".to_string(),
        error: None,
        pro,
        updated_at: contract::now_epoch(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use geospoof_gps_core::DeviceError;
    use geospoof_gps_core::mock::MockDeviceController;

    fn ios_source() -> DesiredSource {
        DesiredSource::IosApp {
            bundle_id: "com.moonloaf.geospoof".to_string(),
        }
    }

    #[tokio::test]
    async fn ios_source_reads_and_parses_desired() {
        let json = br#"{"version":1,"enabled":true,"latitude":48.0,"longitude":2.0,"provenance":"vpn-sync"}"#.to_vec();
        let mock = MockDeviceController::ready().with_app_file(Ok(json));
        let last = DesiredState::disabled();
        let (desired, reached) =
            resolve_desired(&ios_source(), &mock, Path::new("/tmp"), &last).await;
        assert!(reached, "a successful read means the device was reached");
        assert!(desired.enabled);
        assert_eq!(desired.coordinate(), Some((48.0, 2.0)));
        assert_eq!(desired.provenance, contract::Provenance::VpnSync);
    }

    #[tokio::test]
    async fn ios_source_read_error_falls_back_to_cache() {
        // A transient AFC failure must NOT drop the hold — we reuse the cached desired.
        let mock =
            MockDeviceController::ready().with_app_file(Err(DeviceError::Io("blip".to_string())));
        let last = DesiredState::vpn_sync(35.0, 139.0);
        let (desired, reached) =
            resolve_desired(&ios_source(), &mock, Path::new("/tmp"), &last).await;
        assert!(!reached, "a read failure means the device was not reached");
        assert_eq!(desired, last);
    }

    #[tokio::test]
    async fn ios_source_invalid_json_falls_back_to_cache() {
        let mock = MockDeviceController::ready().with_app_file(Ok(b"not json".to_vec()));
        let last = DesiredState::manual(1.0, 2.0);
        let (desired, reached) =
            resolve_desired(&ios_source(), &mock, Path::new("/tmp"), &last).await;
        // Bytes arrived (device reached) but didn't parse → keep cache, still reached.
        assert!(reached);
        assert_eq!(desired, last);
    }

    #[tokio::test]
    async fn publishes_status_to_app_in_ios_mode() {
        // In IosApp mode the agent writes status.json back to the phone (§13e).
        let mock = MockDeviceController::ready();
        let report = disconnected_report(true);
        publish_status_to_app(&ios_source(), &mock, &report).await;

        let written = mock.written_app_files();
        assert_eq!(written.len(), 1);
        assert_eq!(written[0].0, "status.json");
        // Round-trips as a StatusReport the phone can parse.
        let back: StatusReport = serde_json::from_slice(&written[0].1).unwrap();
        assert!(back.pro);
    }

    #[tokio::test]
    async fn local_file_mode_does_not_publish_to_app() {
        // Local-file (CLI/testing) mode has no phone to publish to — must not write.
        let mock = MockDeviceController::ready();
        publish_status_to_app(&DesiredSource::LocalFile, &mock, &disconnected_report(true)).await;
        assert!(mock.written_app_files().is_empty());
    }

    #[tokio::test]
    async fn status_write_back_failure_is_non_fatal() {
        // An AFC write blip must be swallowed (best-effort), never propagate/panic.
        let mock =
            MockDeviceController::ready().with_write_app_file_err(DeviceError::Io("blip".into()));
        publish_status_to_app(&ios_source(), &mock, &disconnected_report(true)).await;
        assert!(mock.written_app_files().is_empty());
    }
}
