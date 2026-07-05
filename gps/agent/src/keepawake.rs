//! Keep the host awake while actively spoofing, so an idle system sleep doesn't break
//! the (Wi-Fi) hold. See design §10h.
//!
//! macOS: manages a `caffeinate` child process — first-party and always present, so no
//! new dependency and no `unsafe` FFI. Other platforms: no-op for now (Windows gets its
//! own mechanism in a later phase).
//!
//! Honest limit: this prevents *idle* system sleep, NOT lid-close-on-battery, which
//! macOS enforces regardless. When the host does sleep and later wakes, the reconciler
//! self-heals by re-applying the desired location. A native IOKit power assertion
//! (`IOPMAssertionCreateWithName`) is a possible future refinement over `caffeinate`.

use crate::contract::SessionReport;

/// Whether the host should stay awake for this session state. Pure and unit-tested;
/// the platform side effect lives in [`KeepAwake`].
pub fn should_keep_awake(session: SessionReport) -> bool {
    matches!(session, SessionReport::Spoofing)
}

/// Holds a host "stay awake" assertion, toggled to match the session state.
#[derive(Default)]
pub struct KeepAwake {
    #[cfg(target_os = "macos")]
    child: Option<std::process::Child>,
}

impl KeepAwake {
    /// Create a released (no assertion held) keep-awake handle.
    pub fn new() -> Self {
        Self::default()
    }

    /// Ensure the assertion is held iff `active`. Idempotent — safe to call every tick.
    pub fn set(&mut self, active: bool) {
        #[cfg(target_os = "macos")]
        self.set_macos(active);
        #[cfg(not(target_os = "macos"))]
        {
            // No-op on non-macOS hosts; kept as a stable API surface.
            let _ = active;
        }
    }

    #[cfg(target_os = "macos")]
    fn set_macos(&mut self, active: bool) {
        use std::process::{Command, Stdio};
        match (active, self.child.is_some()) {
            (true, false) => {
                // -i: prevent idle system sleep; -m: prevent disk idle; -s: prevent
                // system sleep on AC power. (Not -d: no need to force the display on.)
                match Command::new("caffeinate")
                    .args(["-i", "-m", "-s"])
                    .stdin(Stdio::null())
                    .stdout(Stdio::null())
                    .stderr(Stdio::null())
                    .spawn()
                {
                    Ok(child) => {
                        tracing::info!("keep-awake engaged");
                        self.child = Some(child);
                    }
                    // Best-effort: if caffeinate can't start, log and carry on — the
                    // hold still works while the Mac stays awake on its own.
                    Err(e) => tracing::warn!("keep-awake unavailable: {e}"),
                }
            }
            (false, true) => self.release_macos(),
            _ => {}
        }
    }

    #[cfg(target_os = "macos")]
    fn release_macos(&mut self) {
        if let Some(mut child) = self.child.take() {
            let _ = child.kill();
            let _ = child.wait();
            tracing::info!("keep-awake released");
        }
    }
}

impl Drop for KeepAwake {
    fn drop(&mut self) {
        #[cfg(target_os = "macos")]
        self.release_macos();
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_awake_only_while_spoofing() {
        assert!(should_keep_awake(SessionReport::Spoofing));
        assert!(!should_keep_awake(SessionReport::Idle));
        assert!(!should_keep_awake(SessionReport::Lost));
    }
}
