//! geospoof-gps-ffi
//!
//! C ABI over [`geospoof_gps_core`] for embedding in native hosts (the headless agent
//! now; a Swift app later). The full ABI — device ops, reconciliation, and the error /
//! ownership model — is defined in a later task per design §10a.1. This is the
//! workspace scaffold (task 2): it establishes the C boundary and the static/dynamic
//! crate types, and proves the ffi -> core link compiles.

use geospoof_gps_core::CORE_VERSION;

/// C ABI version. Bump when the exported C interface changes.
#[no_mangle]
pub extern "C" fn gg_abi_version() -> u32 {
    1
}

/// Byte length of the core version string. Placeholder that references the core so the
/// ffi -> core dependency is exercised until the real ABI lands.
#[no_mangle]
pub extern "C" fn gg_core_version_len() -> usize {
    CORE_VERSION.len()
}
