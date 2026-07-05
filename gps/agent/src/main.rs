//! GeoSpoof GPS headless agent (Section F).
//!
//! Reconciles a desired-location file to the connected device and writes a status
//! file (design §10d). No GUI — the source-of-truth app owns the UI. A small CLI
//! (`run` / `set` / `clear` / `status`) drives it for dev/testing.

mod contract;
mod reconcile;

use std::path::{Path, PathBuf};
use std::sync::Arc;
use std::time::Duration;

use geospoof_gps_core::{DeviceController, HoldConfig, IdeviceController};
use tracing_subscriber::EnvFilter;

use contract::{DesiredState, SessionReport, StatusReport, CONTRACT_VERSION};
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
            match (lat, lon) {
                (Some(lat), Some(lon)) => write_desired(&dir, &DesiredState::manual(lat, lon)),
                _ => eprintln!("usage: geospoof-gps-agent set <lat> <lon>"),
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

/// The reconciliation loop: poll the desired file, reconcile, write status.
async fn run(dir: &Path) {
    let pro = check_pro(dir);
    let config = HoldConfig::default();
    tracing::info!(pro, "agent started");

    let mut current: Option<(String, Reconciler)> = None;
    loop {
        let desired = read_desired(dir);
        let udid = IdeviceController::list_udids()
            .await
            .ok()
            .and_then(|mut v| v.drain(..).next());

        match udid {
            Some(udid) => {
                let needs_new = !matches!(&current, Some((u, _)) if *u == udid);
                if needs_new {
                    tracing::info!("device connected");
                    let controller: Arc<dyn DeviceController> =
                        Arc::new(IdeviceController::new(udid.clone()));
                    current = Some((udid, Reconciler::new(controller, config.clone(), pro)));
                }
                if let Some((_, reconciler)) = &current {
                    let report = reconciler.reconcile(&desired).await;
                    tracing::info!(session = ?report.session, connected = report.connected, "reconciled");
                    write_status(dir, &report);
                }
            }
            None => {
                if current.is_some() {
                    tracing::info!("device disconnected");
                    current = None;
                }
                write_status(dir, &disconnected_report(pro));
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
    if let Ok(json) = serde_json::to_string_pretty(report) {
        if let Err(e) = std::fs::write(status_path(dir), json) {
            tracing::warn!("cannot write status.json: {e}");
        }
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
        remediation: "Connect your iPhone".to_string(),
        error: None,
        pro,
    }
}
