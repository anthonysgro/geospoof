//! GeoSpoof GPS headless agent (Section F).
//!
//! Reconciles a desired-location file to the connected device and writes a status
//! file (design §10d). No GUI — the source-of-truth app owns the UI. A small CLI
//! (`run` / `set` / `clear` / `status`) drives it for dev/testing.

mod contract;
mod keepawake;
mod reconcile;

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
        "clear" => write_desired(&dir, &DesiredState::disabled()),
        "status" => match read_status(&dir) {
            Some(report) => println!(
                "{}",
                serde_json::to_string_pretty(&report).unwrap_or_default()
            ),
            None => println!("no status yet (is the agent running?)"),
        },
        _ => {
            eprintln!("geospoof-gps-agent <run|set LAT LON|clear|status>");
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
async fn resolve_desired(
    source: &DesiredSource,
    controller: &dyn DeviceController,
    dir: &Path,
    last: &DesiredState,
) -> DesiredState {
    match source {
        DesiredSource::LocalFile => read_desired(dir),
        DesiredSource::IosApp { bundle_id } => {
            match controller.read_app_file(bundle_id, "desired.json").await {
                Ok(bytes) => match serde_json::from_slice::<DesiredState>(&bytes) {
                    Ok(desired) => desired,
                    Err(e) => {
                        tracing::warn!("invalid desired.json from app: {e}");
                        last.clone()
                    }
                },
                Err(e) => {
                    tracing::debug!("app desired read failed ({e}); using cached desired");
                    last.clone()
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
    let source_desc = source.describe();
    tracing::info!(pro, source = %source_desc, "agent started");

    // Last desired state we successfully resolved. Cached so a momentary source read
    // failure doesn't drop the hold, and so a device that leaves and rejoins the
    // network is driven back to the chosen location automatically (design §10i).
    let mut last_desired = DesiredState::disabled();
    let mut current: Option<(String, Arc<dyn DeviceController>, Reconciler)> = None;
    // Prevent idle sleep while actively spoofing so the Wi-Fi hold isn't dropped
    // (design §10h). Released automatically when idle/disconnected and on shutdown.
    let mut keep_awake = KeepAwake::new();
    loop {
        let udid = IdeviceController::list_udids()
            .await
            .ok()
            .and_then(|mut v| v.drain(..).next());

        match udid {
            Some(udid) => {
                let needs_new = !matches!(&current, Some((u, _, _)) if *u == udid);
                if needs_new {
                    tracing::info!("device connected");
                    let controller: Arc<dyn DeviceController> =
                        Arc::new(IdeviceController::new(udid.clone()));
                    let reconciler = Reconciler::new(Arc::clone(&controller), config.clone(), pro);
                    current = Some((udid, controller, reconciler));
                }
                if let Some((_, controller, reconciler)) = &current {
                    let desired =
                        resolve_desired(&source, controller.as_ref(), dir, &last_desired).await;
                    last_desired = desired.clone();
                    let report = reconciler.reconcile(&desired).await;
                    tracing::info!(session = ?report.session, connected = report.connected, "reconciled");
                    write_status(dir, &report);
                    keep_awake.set(should_keep_awake(report.session));
                }
            }
            None => {
                if current.is_some() {
                    tracing::info!("device disconnected");
                    current = None;
                }
                write_status(dir, &disconnected_report(pro));
                keep_awake.set(false);
            }
        }
        tokio::time::sleep(POLL_INTERVAL).await;
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
        let desired = resolve_desired(&ios_source(), &mock, Path::new("/tmp"), &last).await;
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
        let desired = resolve_desired(&ios_source(), &mock, Path::new("/tmp"), &last).await;
        assert_eq!(desired, last);
    }

    #[tokio::test]
    async fn ios_source_invalid_json_falls_back_to_cache() {
        let mock = MockDeviceController::ready().with_app_file(Ok(b"not json".to_vec()));
        let last = DesiredState::manual(1.0, 2.0);
        let desired = resolve_desired(&ios_source(), &mock, Path::new("/tmp"), &last).await;
        assert_eq!(desired, last);
    }
}
