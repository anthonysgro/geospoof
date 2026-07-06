//! Per-user LaunchAgent management for the packaged (DMG) agent.
//!
//! The GeoSpoof GPS desktop deliverable is a near-headless background agent (design
//! §13e): the iOS app is the sole control surface, and the Mac side just needs the
//! agent running so it can drive the device over the link. This module installs the
//! agent as a per-user `launchd` agent so it starts at login and is restarted if it
//! crashes — no root, no privileged helper (consistent with §4's "no root daemon").
//!
//! We manage a plain LaunchAgent via `launchctl bootstrap`/`bootout` (the modern
//! domain-target form). A future native menu-bar app could instead register via
//! `SMAppService` — noted in design §17 as polish; the on-disk plist approach is the
//! dependency-free path that works from the CLI today.

use std::io;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::Duration;

/// launchd job label (also the plist filename stem).
pub const LAUNCH_AGENT_LABEL: &str = "com.moonloaf.geospoof.gps";

/// Bundle id of the controlling iOS app. Passed to the running agent as
/// `GEOSPOOF_APP_BUNDLE_ID` so it reads `desired.json` / writes `status.json` over the
/// device link (design §13e). Kept in sync with the app's bundle id.
pub const IOS_APP_BUNDLE_ID: &str = "com.moonloaf.geospoof";

fn home_dir() -> io::Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| io::Error::other("HOME is not set"))
}

/// `~/Library/LaunchAgents` — the per-user agent directory.
fn launch_agents_dir() -> io::Result<PathBuf> {
    Ok(home_dir()?.join("Library/LaunchAgents"))
}

/// Path to our installed LaunchAgent plist.
pub fn launch_agent_plist_path() -> io::Result<PathBuf> {
    Ok(launch_agents_dir()?.join(format!("{LAUNCH_AGENT_LABEL}.plist")))
}

/// `~/Library/Logs/GeoSpoof GPS` — where the agent's stdout/stderr are written.
pub fn log_dir() -> io::Result<PathBuf> {
    Ok(home_dir()?.join("Library/Logs/GeoSpoof GPS"))
}

/// Minimal XML text escaping for values embedded in the plist (paths can contain `&`).
fn xml_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Render the LaunchAgent plist that runs `<program> run` at login, keeps it alive,
/// and points it at the controlling iOS app. Pure — unit-tested.
pub fn render_launch_agent_plist(program: &Path, app_bundle_id: &str, log_dir: &Path) -> String {
    let program = xml_escape(&program.to_string_lossy());
    let app_bundle_id = xml_escape(app_bundle_id);
    let log = xml_escape(&log_dir.join("agent.log").to_string_lossy());
    format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>{LAUNCH_AGENT_LABEL}</string>
    <key>ProgramArguments</key>
    <array>
        <string>{program}</string>
        <string>run</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>GEOSPOOF_APP_BUNDLE_ID</key>
        <string>{app_bundle_id}</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ProcessType</key>
    <string>Interactive</string>
    <key>StandardOutPath</key>
    <string>{log}</string>
    <key>StandardErrorPath</key>
    <string>{log}</string>
</dict>
</plist>
"#
    )
}

/// Numeric uid of the current user (for the `gui/<uid>` launchd domain target).
fn current_uid() -> io::Result<String> {
    let out = Command::new("id").arg("-u").output()?;
    if !out.status.success() {
        return Err(io::Error::other("`id -u` failed"));
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

fn gui_domain() -> io::Result<String> {
    Ok(format!("gui/{}", current_uid()?))
}

fn launchctl(args: &[&str]) -> io::Result<()> {
    let status = Command::new("launchctl").args(args).status()?;
    if status.success() {
        Ok(())
    } else {
        Err(io::Error::other(format!(
            "`launchctl {}` failed ({status})",
            args.join(" ")
        )))
    }
}

/// Install + start the LaunchAgent for the current executable. Idempotent: an existing
/// job is booted out first, so re-running upgrades the plist in place. Returns the plist
/// path on success.
pub fn install() -> io::Result<PathBuf> {
    // Resolve the real on-disk path of this binary (inside the .app bundle once
    // installed to /Applications) so the plist points at a stable location.
    let program = std::fs::canonicalize(std::env::current_exe()?)?;
    let logs = log_dir()?;
    std::fs::create_dir_all(&logs)?;

    let plist = render_launch_agent_plist(&program, IOS_APP_BUNDLE_ID, &logs);
    let plist_path = launch_agent_plist_path()?;
    if let Some(parent) = plist_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&plist_path, plist)?;

    let domain = gui_domain()?;
    let target = format!("{domain}/{LAUNCH_AGENT_LABEL}");
    let plist_str = plist_path.to_string_lossy().to_string();

    // Reload robustly. Reinstalling over a running agent is the common case (upgrading
    // the DMG), and `bootout` tears the old job down ASYNCHRONOUSLY — our SIGTERM handler
    // clears the spoof over the tunnel before exiting, which takes a beat. A `bootstrap`
    // fired immediately then races the still-exiting job and fails with EIO (exit 5,
    // "service already loaded"). So: boot out, WAIT for it to actually unload, then
    // bootstrap with a short retry as a safety net.
    let _ = launchctl(&["bootout", &target]);
    for _ in 0..20 {
        if !is_installed() {
            break;
        }
        std::thread::sleep(Duration::from_millis(150));
    }

    let mut last_err = None;
    for attempt in 0u64..5 {
        match launchctl(&["bootstrap", &domain, &plist_str]) {
            Ok(()) => {
                last_err = None;
                break;
            }
            Err(e) => {
                last_err = Some(e);
                std::thread::sleep(Duration::from_millis(200 + attempt * 200));
                let _ = launchctl(&["bootout", &target]);
            }
        }
    }
    // A failed bootstrap is only fatal if the service isn't actually loaded — if it ended
    // up loaded despite the error (a benign "already loaded"), treat that as success.
    if let Some(e) = last_err
        && !is_installed()
    {
        return Err(e);
    }

    // Ensure it's running right now with the current binary/plist (bootstrap starts
    // RunAtLoad jobs, but kickstart makes "start now / restart" explicit).
    let _ = launchctl(&["kickstart", "-k", &target]);
    Ok(plist_path)
}

/// Stop + remove the LaunchAgent. Best-effort bootout (fine if not loaded), then delete
/// the plist.
pub fn uninstall() -> io::Result<()> {
    if let Ok(domain) = gui_domain() {
        let _ = launchctl(&["bootout", &format!("{domain}/{LAUNCH_AGENT_LABEL}")]);
    }
    let plist_path = launch_agent_plist_path()?;
    if plist_path.exists() {
        std::fs::remove_file(&plist_path)?;
    }
    Ok(())
}

/// Whether the LaunchAgent is currently loaded (`launchctl list <label>` exits 0).
pub fn is_installed() -> bool {
    Command::new("launchctl")
        .args(["list", LAUNCH_AGENT_LABEL])
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plist_has_required_keys_and_paths() {
        let plist = render_launch_agent_plist(
            Path::new("/Applications/GeoSpoof GPS.app/Contents/MacOS/geospoof-gps-agent"),
            IOS_APP_BUNDLE_ID,
            Path::new("/Users/x/Library/Logs/GeoSpoof GPS"),
        );
        assert!(plist.contains("<string>com.moonloaf.geospoof.gps</string>"));
        assert!(plist.contains(
            "<string>/Applications/GeoSpoof GPS.app/Contents/MacOS/geospoof-gps-agent</string>"
        ));
        assert!(plist.contains("<string>run</string>"));
        assert!(plist.contains("<key>GEOSPOOF_APP_BUNDLE_ID</key>"));
        assert!(plist.contains("<string>com.moonloaf.geospoof</string>"));
        assert!(plist.contains("<key>RunAtLoad</key>"));
        assert!(plist.contains("<key>KeepAlive</key>"));
        assert!(plist.contains("/Users/x/Library/Logs/GeoSpoof GPS/agent.log"));
    }

    #[test]
    fn plist_is_well_formed_prologue() {
        let plist = render_launch_agent_plist(
            Path::new("/tmp/agent"),
            IOS_APP_BUNDLE_ID,
            Path::new("/tmp/logs"),
        );
        assert!(plist.starts_with("<?xml version=\"1.0\" encoding=\"UTF-8\"?>"));
        assert!(plist.trim_end().ends_with("</plist>"));
    }

    #[test]
    fn xml_escape_escapes_markup() {
        assert_eq!(xml_escape("a & b <c>"), "a &amp; b &lt;c&gt;");
    }
}
