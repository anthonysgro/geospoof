//! geospoof-gps-ffi
//!
//! C ABI over [`geospoof_gps_core`] for native hosts. Upholds `FFI_CONTRACT.md`:
//! one owned tokio runtime per context, `catch_unwind` on every entrypoint, explicit
//! ownership for returned strings, and a poll model for session state (no callbacks).
//!
//! The ABI is generic over `Arc<dyn DeviceController>`. Production wires
//! `IdeviceController` (task 13); the `mock`-feature constructors back it with the
//! mock so the whole ABI is testable without hardware.

use std::ffi::{CString, c_char};
use std::panic::{AssertUnwindSafe, catch_unwind};
use std::ptr;
use std::sync::{Arc, Mutex};
use std::time::Duration;

use geospoof_gps_core::{Coordinate, DeviceController, HoldConfig, HoldOutcome, hold_location};

/// Result code returned by fallible entrypoints.
#[repr(i32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GgCode {
    /// Success.
    Ok = 0,
    /// A required pointer argument was null.
    NullArg = 1,
    /// The coordinate was out of range / non-finite.
    InvalidCoordinate = 2,
    /// A device operation failed (see `gg_last_error`).
    Device = 3,
    /// A Rust panic was caught at the boundary.
    Panic = 4,
}

/// Device precondition snapshot (out-param for `gg_device_status`).
#[repr(C)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct GgStatus {
    /// The device trusts this computer.
    pub trusted: bool,
    /// Developer Mode is enabled.
    pub developer_mode: bool,
    /// The Developer Disk Image is mounted.
    pub ddi_mounted: bool,
}

/// Current spoofing session state (out-param for `gg_poll_session`).
#[repr(i32)]
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GgSession {
    /// Not spoofing.
    Idle = 0,
    /// Actively holding a simulated location.
    Spoofing = 1,
    /// The hold-loop could not maintain the fix.
    Lost = 2,
}

/// Opaque context: owns the runtime, controller, and session state.
pub struct GgContext {
    runtime: tokio::runtime::Runtime,
    controller: Arc<dyn DeviceController>,
    config: HoldConfig,
    cancel: Mutex<Option<tokio::sync::watch::Sender<bool>>>,
    handle: Mutex<Option<tokio::task::JoinHandle<()>>>,
    session: Arc<Mutex<GgSession>>,
    last_error: Mutex<Option<CString>>,
}

impl GgContext {
    fn set_error(&self, msg: &str) {
        let cs = CString::new(msg).unwrap_or_else(|_| CString::new("error").expect("cstr"));
        *self.last_error.lock().expect("lock") = Some(cs);
    }

    fn status(&self) -> Result<GgStatus, ()> {
        match self.runtime.block_on(self.controller.status()) {
            Ok(s) => Ok(GgStatus {
                trusted: s.trusted,
                developer_mode: s.developer_mode,
                ddi_mounted: s.ddi_mounted,
            }),
            Err(e) => {
                self.set_error(&e.to_string());
                Err(())
            }
        }
    }

    fn start(&self, coord: Coordinate) -> GgCode {
        self.stop_internal();
        let (tx, rx) = tokio::sync::watch::channel(false);
        let controller = Arc::clone(&self.controller);
        let config = self.config.clone();
        let session = Arc::clone(&self.session);

        // Mark spoofing before spawning so the task can only downgrade to Lost.
        *self.session.lock().expect("lock") = GgSession::Spoofing;
        let handle = self.runtime.spawn(async move {
            let mut rx = rx;
            if let HoldOutcome::Lost(_) = hold_location(&*controller, coord, &config, &mut rx).await
            {
                *session.lock().expect("lock") = GgSession::Lost;
            }
        });
        *self.cancel.lock().expect("lock") = Some(tx);
        *self.handle.lock().expect("lock") = Some(handle);
        GgCode::Ok
    }

    fn stop_internal(&self) {
        if let Some(tx) = self.cancel.lock().expect("lock").take() {
            let _ = tx.send(true);
        }
        if let Some(handle) = self.handle.lock().expect("lock").take() {
            let _ = self.runtime.block_on(handle);
        }
        let _ = self.runtime.block_on(self.controller.clear_location());
        *self.session.lock().expect("lock") = GgSession::Idle;
    }
}

fn init_with(controller: Arc<dyn DeviceController>, config: HoldConfig) -> *mut GgContext {
    let runtime = match tokio::runtime::Builder::new_multi_thread()
        .enable_all()
        .build()
    {
        Ok(rt) => rt,
        Err(_) => return ptr::null_mut(),
    };
    let ctx = GgContext {
        runtime,
        controller,
        config,
        cancel: Mutex::new(None),
        handle: Mutex::new(None),
        session: Arc::new(Mutex::new(GgSession::Idle)),
        last_error: Mutex::new(None),
    };
    Box::into_raw(Box::new(ctx))
}

/// Run `f` with a borrowed context, guarding against null and panics.
fn guard<F: FnOnce(&GgContext) -> GgCode>(ptr: *mut GgContext, f: F) -> GgCode {
    if ptr.is_null() {
        return GgCode::NullArg;
    }
    // Safety: non-null per the check; the caller owns a valid context (contract).
    let ctx = unsafe { &*ptr };
    match catch_unwind(AssertUnwindSafe(|| f(ctx))) {
        Ok(code) => code,
        Err(_) => {
            ctx.set_error("internal panic");
            GgCode::Panic
        }
    }
}

/// ABI version. Bump on any incompatible change to the exported interface.
#[unsafe(no_mangle)]
pub extern "C" fn gg_abi_version() -> u32 {
    1
}

/// Create a context backed by a ready mock device. Test/dev only. Returns null on
/// runtime-creation failure; free with [`gg_free`].
#[cfg(feature = "mock")]
#[unsafe(no_mangle)]
pub extern "C" fn gg_init_mock() -> *mut GgContext {
    let controller = Arc::new(geospoof_gps_core::mock::MockDeviceController::ready());
    init_with(controller, test_config())
}

/// Create a context whose device reports errors (exercises the error path). Test only.
#[cfg(feature = "mock")]
#[unsafe(no_mangle)]
pub extern "C" fn gg_init_mock_unavailable() -> *mut GgContext {
    let controller = Arc::new(
        geospoof_gps_core::mock::MockDeviceController::ready()
            .with_status_err(geospoof_gps_core::DeviceError::NotConnected),
    );
    init_with(controller, test_config())
}

#[cfg(feature = "mock")]
fn test_config() -> HoldConfig {
    HoldConfig {
        reapply_interval: Duration::from_millis(50),
        max_retries: 2,
        backoff_base: Duration::from_millis(5),
    }
}

/// Free a context created by a `gg_init*` function. Stops any active spoof first.
/// Safe to call with null. Must be called exactly once per context.
///
/// # Safety
/// `ctx` must be null or a pointer returned by a `gg_init*` function, not yet freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn gg_free(ctx: *mut GgContext) {
    unsafe {
        if ctx.is_null() {
            return;
        }
        let ctx = Box::from_raw(ctx);
        ctx.stop_internal();
        drop(ctx);
    }
}

/// Return the last error message as a newly allocated C string (free with
/// [`gg_string_free`]), or null if there is none.
///
/// # Safety
/// `ctx` must be null or a valid context pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn gg_last_error(ctx: *const GgContext) -> *mut c_char {
    unsafe {
        if ctx.is_null() {
            return ptr::null_mut();
        }
        let ctx = &*ctx;
        match &*ctx.last_error.lock().expect("lock") {
            Some(cs) => cs.clone().into_raw(),
            None => ptr::null_mut(),
        }
    }
}

/// Free a string returned by [`gg_last_error`]. Safe to call with null.
///
/// # Safety
/// `s` must be null or a pointer returned by [`gg_last_error`], not yet freed.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn gg_string_free(s: *mut c_char) {
    unsafe {
        if !s.is_null() {
            drop(CString::from_raw(s));
        }
    }
}

/// Write the device precondition snapshot to `out`.
///
/// # Safety
/// `ctx` must be null or valid; `out` must be null or point to a writable `GgStatus`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn gg_device_status(ctx: *mut GgContext, out: *mut GgStatus) -> GgCode {
    unsafe {
        if out.is_null() {
            return GgCode::NullArg;
        }
        let mut result = None;
        let code = guard(ctx, |c| match c.status() {
            Ok(s) => {
                result = Some(s);
                GgCode::Ok
            }
            Err(()) => GgCode::Device,
        });
        if let Some(s) = result {
            *out = s;
        }
        code
    }
}

/// Start holding a simulated location.
///
/// # Safety
/// `ctx` must be null or a valid context pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn gg_spoof_start(ctx: *mut GgContext, lat: f64, lon: f64) -> GgCode {
    guard(ctx, |c| match Coordinate::new(lat, lon) {
        Ok(coord) => c.start(coord),
        Err(_) => {
            c.set_error("coordinate out of range");
            GgCode::InvalidCoordinate
        }
    })
}

/// Stop spoofing and clear the device location. Idempotent.
///
/// # Safety
/// `ctx` must be null or a valid context pointer.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn gg_spoof_stop(ctx: *mut GgContext) -> GgCode {
    guard(ctx, |c| {
        c.stop_internal();
        GgCode::Ok
    })
}

/// Write the current session state to `out`.
///
/// # Safety
/// `ctx` must be null or valid; `out` must be null or point to a writable `GgSession`.
#[unsafe(no_mangle)]
pub unsafe extern "C" fn gg_poll_session(ctx: *const GgContext, out: *mut GgSession) -> GgCode {
    unsafe {
        if ctx.is_null() || out.is_null() {
            return GgCode::NullArg;
        }
        let session = *(&*ctx).session.lock().expect("lock");
        *out = session;
        GgCode::Ok
    }
}
