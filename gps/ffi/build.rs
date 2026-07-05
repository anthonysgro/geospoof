//! Generates the C header (`geospoof_gps.h`) from the Rust ABI via cbindgen, keeping
//! the header in sync with the source (design §10a.1). Written to OUT_DIR; a header
//! failure is a warning, not a hard build break.

use std::path::PathBuf;

fn main() {
    println!("cargo:rerun-if-changed=src/lib.rs");
    println!("cargo:rerun-if-changed=cbindgen.toml");

    let crate_dir = match std::env::var("CARGO_MANIFEST_DIR") {
        Ok(d) => d,
        Err(_) => return,
    };
    let out_dir = match std::env::var("OUT_DIR") {
        Ok(d) => d,
        Err(_) => return,
    };
    let header = PathBuf::from(out_dir).join("geospoof_gps.h");

    let config = cbindgen::Config::from_root_or_default(&crate_dir);
    match cbindgen::Builder::new()
        .with_crate(&crate_dir)
        .with_config(config)
        .generate()
    {
        Ok(bindings) => {
            bindings.write_to_file(&header);
            println!("cargo:warning=generated C header at {}", header.display());
        }
        Err(e) => {
            println!("cargo:warning=cbindgen header generation failed: {e}");
        }
    }
}
