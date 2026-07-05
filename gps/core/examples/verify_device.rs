//! Manual hardware-verification harness for `IdeviceController` (task 15).
//!
//! This is a dev tool, not shipped. It exercises the REAL device path (usbmux →
//! CoreDeviceProxy userspace tunnel → DVT). No `sudo` tunnel is needed — idevice builds
//! its own userspace tunnel.
//!
//! Usage (device connected via USB, unlocked, Developer Mode on, trusted):
//!   cargo run -p geospoof-gps-core --example verify_device -- status
//!   cargo run -p geospoof-gps-core --example verify_device -- set 48.8584 2.2945
//!   cargo run -p geospoof-gps-core --example verify_device -- clear

use std::env;

use geospoof_gps_core::{Coordinate, DeviceController, IdeviceController};

#[tokio::main(flavor = "current_thread")]
async fn main() {
    let args: Vec<String> = env::args().collect();
    let cmd = args.get(1).map(String::as_str).unwrap_or("status");

    let udids = match IdeviceController::list_udids().await {
        Ok(u) => u,
        Err(e) => {
            eprintln!("device discovery failed: {e}");
            std::process::exit(1);
        }
    };
    let Some(udid) = udids.into_iter().next() else {
        eprintln!("no USB device found (connect + trust the device)");
        std::process::exit(1);
    };
    println!("device: {udid}");
    let controller = IdeviceController::new(udid.clone());

    match controller.device_info().await {
        Ok(info) => println!(
            "info:   {} / {} / iOS {}",
            info.name, info.product_type, info.ios_version
        ),
        Err(e) => eprintln!("device_info: {e}"),
    }
    match controller.status().await {
        Ok(s) => println!(
            "status: trusted={} developer_mode={} ddi_mounted={}",
            s.trusted, s.developer_mode, s.ddi_mounted
        ),
        Err(e) => eprintln!("status: {e}"),
    }

    match cmd {
        "status" => {}
        "set" => {
            let lat = args.get(2).and_then(|s| s.parse::<f64>().ok());
            let lon = args.get(3).and_then(|s| s.parse::<f64>().ok());
            match (lat, lon) {
                (Some(lat), Some(lon)) => match Coordinate::new(lat, lon) {
                    Ok(coord) => match controller.set_location(coord).await {
                        Ok(()) => println!("set OK  -> check Maps / Find My on the device"),
                        Err(e) => eprintln!("set FAILED: {e}"),
                    },
                    Err(_) => eprintln!("invalid coordinate"),
                },
                _ => eprintln!("usage: verify_device set <lat> <lon>"),
            }
        }
        "clear" => match controller.clear_location().await {
            Ok(()) => println!("clear OK -> location should revert to real GPS"),
            Err(e) => eprintln!("clear FAILED: {e}"),
        },
        "read-app" => {
            let bundle_id = args.get(2).map(String::as_str);
            let filename = args.get(3).map(String::as_str).unwrap_or("desired.json");
            match bundle_id {
                Some(bundle_id) => match controller.read_app_file(bundle_id, filename).await {
                    Ok(bytes) => {
                        println!(
                            "--- {bundle_id} Documents/{filename} ({} bytes) ---",
                            bytes.len()
                        );
                        println!("{}", String::from_utf8_lossy(&bytes));
                    }
                    Err(e) => eprintln!("read-app FAILED: {e}"),
                },
                None => eprintln!("usage: verify_device read-app <bundle-id> [filename]"),
            }
        }

        "mount" => match args.get(2) {
            Some(dir) => {
                let controller = IdeviceController::new(udid).with_ddi_dir(dir.clone());
                match controller.mount_ddi().await {
                    Ok(()) => println!("mount OK -> developer image mounted"),
                    Err(e) => eprintln!("mount FAILED: {e}"),
                }
            }
            None => eprintln!("usage: verify_device mount <ddi_dir>"),
        },
        other => {
            eprintln!(
                "unknown command '{other}' (use: status | set <lat> <lon> | clear | mount <ddi_dir>)"
            )
        }
    }
}
