# GeoSpoof GPS — FFI / Concurrency Contract

The rules the `geospoof-gps-ffi` C ABI upholds (design §10a.1, Requirement 7.2). Native
hosts (the headless agent now; a Swift app later) rely on these.

## Runtime & threading

- The context owns **one** multi-threaded tokio runtime, created in `gg_init*` and
  dropped in `gg_free`. Never one runtime per call.
- All C entrypoints are **synchronous** and safe to call from any single thread. They
  must NOT be called concurrently on the same context (one owner thread). Different
  contexts are independent.
- Background work (the hold-loop) runs on the runtime's worker threads. Session results
  are observed via **polling** (`gg_poll_session`), not callbacks — this avoids passing
  non-`Send` C function pointers across threads and cross-thread marshaling. (We chose
  the poll model from the two options in §10a.1.)

## Panics & errors

- Every entrypoint wraps its body in `catch_unwind`; a Rust panic never crosses the
  boundary. On panic the call returns `GG_ERR_PANIC` and records a message.
- Fallible calls return a `GgCode` (`0` == `GG_OK`). On error, a human-readable message
  is stored and retrievable via `gg_last_error`.
- `GgCode`: `GG_OK=0`, `GG_ERR_NULL_ARG=1`, `GG_ERR_INVALID_COORDINATE=2`,
  `GG_ERR_DEVICE=3`, `GG_ERR_PANIC=4`.

## Memory ownership

- `gg_init*` returns an opaque `GgContext*` owned by the caller; free EXACTLY once with
  `gg_free`. After `gg_free` the pointer is dangling — do not reuse.
- `gg_last_error` returns a **newly allocated** C string owned by the caller; free it
  with `gg_string_free`. Returns `NULL` when there is no error.
- Out-params (`GgStatus*`, `GgSession*`) are caller-allocated; the callee only writes
  to them on `GG_OK`.
- Null context or null out-param yields `GG_ERR_NULL_ARG` (no deref, no write).

## Lifecycle

- `gg_free` stops any active spoof (cancel + clear) and joins background work before
  dropping the runtime, so no task outlives the context's owned state.
- `gg_spoof_start` validates the coordinate (`GG_ERR_INVALID_COORDINATE` if bad),
  cancels any prior hold, then starts a new hold on the runtime.
- `gg_spoof_stop` cancels the hold, clears the device location, and returns to idle;
  it is idempotent.
- `gg_poll_session` reports `GG_SESSION_IDLE` / `SPOOFING` / `LOST` (the hold-loop sets
  `LOST` if it cannot maintain the fix).

## Generic over the controller

The ABI is implemented over `Arc<dyn DeviceController>`. Production wires the
`IdeviceController` (task 13); tests use `MockDeviceController` via the `mock`-feature
constructors (`gg_init_mock*`), so the entire ABI — including alloc/free and error
paths — is exercised without hardware.

## Header generation

`geospoof_gps.h` is generated from the Rust source by `cbindgen` (see `build.rs` +
`cbindgen.toml`) into `OUT_DIR`, keeping the header in sync with the ABI.
