//! FFI contract / behavior tests (task 12).
//!
//! Exercises the C ABI through the mock-backed constructors: happy path, error path,
//! invalid input, null handling, and the alloc/free ownership model (every `gg_free` /
//! `gg_string_free` here also validates that freeing owned pointers is sound). Run with
//! `--features mock` (CI uses `--all-features`). For true leak detection these can be
//! run under ASan/`leaks`; see FFI_CONTRACT.md.
#![cfg(feature = "mock")]

use std::ptr;

use geospoof_gps_ffi::{
    GgCode, GgSession, GgStatus, gg_abi_version, gg_device_status, gg_free, gg_init_mock,
    gg_init_mock_unavailable, gg_last_error, gg_poll_session, gg_spoof_start, gg_spoof_stop,
    gg_string_free,
};

fn blank_status() -> GgStatus {
    GgStatus {
        trusted: false,
        developer_mode: false,
        ddi_mounted: false,
    }
}

#[test]
fn abi_version_is_stable() {
    assert_eq!(gg_abi_version(), 1);
}

#[test]
fn null_pointers_are_rejected_safely() {
    unsafe {
        let mut status = blank_status();
        assert_eq!(
            gg_device_status(ptr::null_mut(), &mut status),
            GgCode::NullArg
        );
        assert_eq!(gg_spoof_start(ptr::null_mut(), 0.0, 0.0), GgCode::NullArg);
        assert_eq!(gg_spoof_stop(ptr::null_mut()), GgCode::NullArg);

        let mut session = GgSession::Idle;
        assert_eq!(gg_poll_session(ptr::null(), &mut session), GgCode::NullArg);
        // No crash / null result for these:
        assert!(gg_last_error(ptr::null()).is_null());
        gg_free(ptr::null_mut());
    }
}

#[test]
fn happy_path_start_and_stop() {
    unsafe {
        let ctx = gg_init_mock();
        assert!(!ctx.is_null());

        let mut status = blank_status();
        assert_eq!(gg_device_status(ctx, &mut status), GgCode::Ok);
        assert!(status.trusted && status.developer_mode && status.ddi_mounted);

        assert_eq!(gg_spoof_start(ctx, 48.8584, 2.2945), GgCode::Ok);
        let mut session = GgSession::Idle;
        assert_eq!(gg_poll_session(ctx, &mut session), GgCode::Ok);
        assert_eq!(session, GgSession::Spoofing);

        assert_eq!(gg_spoof_stop(ctx), GgCode::Ok);
        assert_eq!(gg_poll_session(ctx, &mut session), GgCode::Ok);
        assert_eq!(session, GgSession::Idle);

        gg_free(ctx);
    }
}

#[test]
fn invalid_coordinate_is_rejected() {
    unsafe {
        let ctx = gg_init_mock();
        assert_eq!(gg_spoof_start(ctx, 91.0, 0.0), GgCode::InvalidCoordinate);
        let msg = gg_last_error(ctx);
        assert!(!msg.is_null());
        gg_string_free(msg);
        gg_free(ctx);
    }
}

#[test]
fn device_error_sets_last_error() {
    unsafe {
        let ctx = gg_init_mock_unavailable();
        let mut status = blank_status();
        assert_eq!(gg_device_status(ctx, &mut status), GgCode::Device);
        let msg = gg_last_error(ctx);
        assert!(!msg.is_null());
        gg_string_free(msg);
        gg_free(ctx);
    }
}

#[test]
fn null_out_param_is_rejected() {
    unsafe {
        let ctx = gg_init_mock();
        assert_eq!(gg_device_status(ctx, ptr::null_mut()), GgCode::NullArg);
        gg_free(ctx);
    }
}
