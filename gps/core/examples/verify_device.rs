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
    // Dev diagnostics: `RUST_LOG=idevice=trace cargo run ... -- rp-pair ...` surfaces the
    // exact remotepairing wire exchange (sent frames + device responses) on stderr.
    let _ = tracing_subscriber::fmt()
        .with_env_filter(tracing_subscriber::EnvFilter::from_default_env())
        .with_writer(std::io::stderr)
        .try_init();

    let args: Vec<String> = env::args().collect();
    let cmd = args.get(1).map(String::as_str).unwrap_or("status");

    // Network-only north-star spike (§10j): RemotePairing handshake over TCP — no usbmux,
    // so it works over the Tailscale overlay. Handle before usbmux discovery.
    if cmd == "rp-pair" {
        rp_pair(&args).await;
        return;
    }

    // Full overlay chain (§10j Tasks 3-5): network pair-verify -> TLS-PSK CdTunnel -> RSD
    // -> DVT LocationSimulation, all over the overlay IP. Requires `rp-bootstrap` first.
    if cmd == "rp-set" || cmd == "rp-clear" || cmd == "rp-services" {
        rp_drive(&args).await;
        return;
    }

    // Bootstrap the RemotePairing record over the USB lockdown control service
    // `com.apple.dt.remotepairingdeviced.lockdown` (§10j Task 2). The NETWORK endpoint
    // reports `allowsPairSetup: false` (verified) — it only pair-VERIFIES — so pair-SETUP
    // must happen here over USB, where the device allows it promptlessly (already trusted).
    // Persists the same RpPairingFile that `rp-pair` reuses for network verify.
    if cmd == "rp-bootstrap" {
        rp_bootstrap().await;
        return;
    }

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
        "tcp-lockdown" => match args.get(2).and_then(|s| s.parse::<std::net::IpAddr>().ok()) {
            Some(ip) => match controller.tcp_lockdown_probe(ip).await {
                Ok(ver) => println!(
                    "SUCCESS: lockdownd answered over TCP at {ip}:62078 (ProductVersion={ver}) \
                     -> off-usbmux / overlay control path is VIABLE"
                ),
                Err(e) => eprintln!(
                    "lockdownd NOT reachable at {ip}:62078 over TCP: {e}\n\
                     (if this is a Tailscale IP, lockdownd may not bind the tunnel interface)"
                ),
            },
            None => eprintln!("usage: verify_device tcp-lockdown <ip>"),
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

/// North-star spike (§10j): drive the RemotePairing handshake over TCP to the device's
/// `_remotepairing._tcp` endpoint (default port 49152, discover via `dns-sd`). Works over
/// the Tailscale overlay since it's pure network (no usbmux). Persists our host pairing
/// record so subsequent runs pair-verify instead of re-pairing.
async fn rp_pair(args: &[String]) {
    use idevice::remote_pairing::{RemotePairingClient, RpPairingSocket};

    let ip = match args.get(2).and_then(|s| s.parse::<std::net::IpAddr>().ok()) {
        Some(ip) => ip,
        None => {
            eprintln!("usage: verify_device rp-pair <ip> [port]");
            return;
        }
    };
    let port: u16 = args.get(3).and_then(|s| s.parse().ok()).unwrap_or(49152);
    let host = "geospoof-gps";
    let pairing_path = "/tmp/geospoof-rp-pairing.plist";

    // `raw` (RpPairingSocket) is the CORRECT transport for the network `_remotepairing._tcp`
    // endpoint: idevice's RpPairingSocket frames exactly like pmd3's RemotePairingTunnelService
    // (RPPairing magic + u16-BE len + JSON envelope, base64 byte fields). The earlier spike
    // defaulted to `xpc` (RemoteXPC/HTTP-2), which is the wrong layer for this endpoint and is
    // what failed with "device socket io failed". Override with a 4th arg to compare.
    let transport = args.get(4).map(String::as_str).unwrap_or("raw");

    let stream = match tokio::net::TcpStream::connect((ip, port)).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("connect {ip}:{port} failed: {e}");
            return;
        }
    };
    println!("connected to remotepairing {ip}:{port} (transport={transport})");

    // Two possible transports for the network remotepairing endpoint: raw RPPairing
    // framing, or RemoteXPC (HTTP/2). Dispatch to a generic driver (the two produce
    // different RemotePairingClient<R> types, so we can't unify into one variable).
    if transport == "raw" {
        drive_pair(
            RemotePairingClient::new(RpPairingSocket::new(stream), host),
            pairing_path,
            host,
        )
        .await;
    } else {
        let mut xpc = match idevice::RemoteXpcClient::new(stream).await {
            Ok(x) => x,
            Err(e) => {
                eprintln!("RemoteXPC new FAILED: {e}");
                return;
            }
        };
        if let Err(e) = xpc.do_handshake().await {
            eprintln!("RemoteXPC do_handshake FAILED: {e} (endpoint may not be HTTP/2)");
            return;
        }
        if let Err(e) = xpc.send_device_handshake().await {
            eprintln!("RemoteXPC send_device_handshake FAILED: {e}");
            return;
        }
        println!("RemoteXPC handshake OK (incl. device handshake)");
        drive_pair(RemotePairingClient::new(xpc, host), pairing_path, host).await;
    }
}

/// Full overlay chain (§10j Tasks 3-5), pure Rust/idevice, no usbmux, no sudo:
///   network pair-verify (using the USB-bootstrapped record)
///   -> `create_tcp_listener` -> TLS-PSK -> `CdTunnel`
///   -> jktcp userspace adapter -> RSD handshake
///   -> DVT `LocationSimulationClient` set/clear.
///
/// Usage (device on Wi-Fi/overlay; run `rp-bootstrap` over USB once first):
///   rp-services <ip>                 enumerate RSD services (confirm dtservicehub)
///   rp-set <ip> <lat> <lon> [hold_s] move the phone, hold, then auto-clear (default 30s)
///   rp-clear <ip>                    stop simulating
async fn rp_drive(args: &[String]) {
    use std::net::IpAddr;

    use idevice::RsdService;
    use idevice::dvt::location_simulation::LocationSimulationClient;
    use idevice::dvt::remote_server::RemoteServerClient;
    use idevice::remote_pairing::{
        RemotePairingClient, RpPairingFile, RpPairingSocket, connect_tls_psk_tunnel_native,
    };
    use idevice::rsd::RsdHandshake;
    use idevice::tcp::adapter::Adapter;

    const DVT_SERVICE: &str = "com.apple.instruments.dtservicehub";
    let host = "geospoof-gps";
    let pairing_path = "/tmp/geospoof-rp-pairing.plist";
    let port = 49152u16;

    let op = args[1].as_str();
    let Some(ip) = args.get(2).and_then(|s| s.parse::<IpAddr>().ok()) else {
        eprintln!("usage: {op} <ip> [...]");
        return;
    };
    // rp-set <ip> <lat> <lon> [hold_s]
    let (lat, lon, hold_s) = if op == "rp-set" {
        match (
            args.get(3).and_then(|s| s.parse::<f64>().ok()),
            args.get(4).and_then(|s| s.parse::<f64>().ok()),
        ) {
            (Some(lat), Some(lon)) => (
                lat,
                lon,
                args.get(5)
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(30),
            ),
            _ => {
                eprintln!("usage: rp-set <ip> <lat> <lon> [hold_s]");
                return;
            }
        }
    } else {
        (0.0, 0.0, 0)
    };

    // Load the USB-bootstrapped record (network endpoint only pair-VERIFIES).
    let mut pairing_file = match RpPairingFile::read_from_file(pairing_path).await {
        Ok(p) => p,
        Err(_) => {
            eprintln!("no pairing record at {pairing_path}; run `rp-bootstrap` over USB first");
            return;
        }
    };

    // 1. Network pair-verify over RPPairing framing.
    let stream = match tokio::net::TcpStream::connect((ip, port)).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("connect {ip}:{port} failed: {e}");
            return;
        }
    };
    let mut client = RemotePairingClient::new(RpPairingSocket::new(stream), host);
    let pin_cb = || async { "000000".to_string() };
    if let Err(e) = client.connect(&mut pairing_file, pin_cb).await {
        eprintln!("pair-verify failed: {e}");
        return;
    }
    println!(
        "pair-verify OK (key {} bytes)",
        client.encryption_key().len()
    );

    // 2. Ask the device to open a TCP tunnel listener, then TLS-PSK + CDTunnel to it.
    let listener_port = match client.create_tcp_listener().await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("create_tcp_listener failed: {e}");
            return;
        }
    };
    let key = client.encryption_key().to_vec();
    let tstream = match tokio::net::TcpStream::connect((ip, listener_port)).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("connect tunnel {ip}:{listener_port} failed: {e}");
            return;
        }
    };
    let cdt = match connect_tls_psk_tunnel_native(tstream, &key).await {
        Ok(t) => t,
        Err(e) => {
            eprintln!("TLS-PSK / CDTunnel failed: {e}");
            return;
        }
    };
    let (Ok(our_ip), Ok(their_ip)) = (
        cdt.info.client_address.parse::<IpAddr>(),
        cdt.info.server_address.parse::<IpAddr>(),
    ) else {
        eprintln!("bad tunnel addresses: {:?}", cdt.info);
        return;
    };
    let mtu = cdt.info.mtu as usize;
    let rsd_port = cdt.info.server_rsd_port;
    println!("tunnel up: {our_ip} -> {their_ip} rsd_port={rsd_port} mtu={mtu}");

    // 3. jktcp userspace adapter over the CDTunnel (same recipe as CoreDeviceProxy).
    let mut adapter = Adapter::new(Box::new(cdt.into_inner()), our_ip, their_ip);
    adapter.set_mss(mtu.saturating_sub(60));
    let mut handle = adapter.to_async_handle();

    // 4. RSD handshake -> enumerate services.
    let rsd_stream = match handle.connect(rsd_port).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("connect RSD port {rsd_port} failed: {e}");
            return;
        }
    };
    let mut handshake = match RsdHandshake::new(rsd_stream).await {
        Ok(h) => h,
        Err(e) => {
            eprintln!("RSD handshake failed: {e}");
            return;
        }
    };
    let has_dvt = handshake.services.contains_key(DVT_SERVICE);
    println!(
        "RSD OK: {} services; dtservicehub={}",
        handshake.services.len(),
        has_dvt
    );
    if op == "rp-services" {
        let mut names: Vec<&String> = handshake.services.keys().collect();
        names.sort();
        for n in names {
            println!("  {n}");
        }
        return;
    }
    if !has_dvt {
        eprintln!("dtservicehub not advertised — is the DDI mounted?");
        return;
    }

    // 5. DVT LocationSimulation set/clear (same as the usbmux location_session).
    let mut server = match RemoteServerClient::connect_rsd(&mut handle, &mut handshake).await {
        Ok(s) => s,
        Err(e) => {
            eprintln!("connect dtservicehub failed: {e}");
            return;
        }
    };
    if let Err(e) = server.read_message(0).await {
        eprintln!("DVT read_message failed: {e}");
        return;
    }
    let mut loc = match LocationSimulationClient::new(&mut server).await {
        Ok(c) => c,
        Err(e) => {
            eprintln!("LocationSimulation open failed: {e}");
            return;
        }
    };
    match op {
        "rp-clear" => match loc.clear().await {
            Ok(()) => println!("clear OK -> real GPS restored"),
            Err(e) => eprintln!("clear failed: {e}"),
        },
        "rp-set" => match loc.set(lat, lon).await {
            Ok(()) => {
                println!("set OK -> phone at {lat}, {lon}; holding {hold_s}s (check Maps/Find My)");
                tokio::time::sleep(std::time::Duration::from_secs(hold_s)).await;
                match loc.clear().await {
                    Ok(()) => println!("cleared -> real GPS restored"),
                    Err(e) => eprintln!("clear failed: {e}"),
                }
            }
            Err(e) => eprintln!("set failed: {e}"),
        },
        _ => {}
    }
}

/// Bootstrap the RemotePairing record over the USB lockdown control service
/// `com.apple.dt.remotepairingdeviced.lockdown` (§10j Task 2). The network
/// `_remotepairing._tcp` endpoint reports `allowsPairSetup: false` and only pair-VERIFIES,
/// so pair-SETUP must be done here over the already-trusted USB lockdown transport, where
/// it's promptless. Persists the SAME `RpPairingFile` that `rp-pair` reuses over the
/// network — the device recognizes our host identity minted here when we later verify.
async fn rp_bootstrap() {
    use geospoof_gps_core::IdeviceController;
    use idevice::IdeviceService;
    use idevice::lockdown::LockdownClient;
    use idevice::provider::IdeviceProvider;
    use idevice::remote_pairing::{RemotePairingClient, RpPairingSocket};
    use idevice::usbmuxd::{UsbmuxdAddr, UsbmuxdConnection};

    const RP_LOCKDOWN_SERVICE: &str = "com.apple.dt.remotepairingdeviced.lockdown";
    let host = "geospoof-gps";
    let pairing_path = "/tmp/geospoof-rp-pairing.plist";

    // USB (usbmux) device discovery + provider.
    let udid = match IdeviceController::list_udids().await {
        Ok(mut u) => match u.drain(..).next() {
            Some(udid) => udid,
            None => {
                eprintln!("no USB device found (connect + trust the device)");
                return;
            }
        },
        Err(e) => {
            eprintln!("device discovery failed: {e}");
            return;
        }
    };
    let mut usbmuxd = match UsbmuxdConnection::default().await {
        Ok(u) => u,
        Err(e) => {
            eprintln!("usbmuxd connect failed: {e}");
            return;
        }
    };
    let dev = match usbmuxd.get_device(&udid).await {
        Ok(d) => d,
        Err(e) => {
            eprintln!("get_device failed: {e}");
            return;
        }
    };
    let addr = match UsbmuxdAddr::from_env_var() {
        Ok(a) => a,
        Err(e) => {
            eprintln!("usbmux addr: {e}");
            return;
        }
    };
    let provider: Box<dyn IdeviceProvider> = Box::new(dev.to_provider(addr, host));

    // Lockdown session, then start the remotepairing control service and connect to it.
    let mut lockdown = match LockdownClient::connect(&*provider).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("lockdown connect failed: {e}");
            return;
        }
    };
    let pairing = match provider.get_pairing_file().await {
        Ok(p) => p,
        Err(e) => {
            eprintln!("get_pairing_file failed: {e} (is the device trusted?)");
            return;
        }
    };
    let legacy = match lockdown.start_session(&pairing).await {
        Ok(l) => l,
        Err(e) => {
            eprintln!("lockdown start_session failed: {e}");
            return;
        }
    };
    let (port, ssl) = match lockdown.start_service(RP_LOCKDOWN_SERVICE).await {
        Ok(x) => x,
        Err(e) => {
            eprintln!("start_service {RP_LOCKDOWN_SERVICE} failed: {e}");
            return;
        }
    };
    let mut idev = match provider.connect(port).await {
        Ok(i) => i,
        Err(e) => {
            eprintln!("connect to service port {port} failed: {e}");
            return;
        }
    };
    if ssl && let Err(e) = idev.start_session(&pairing, legacy).await {
        eprintln!("service SSL start_session failed: {e}");
        return;
    }
    let sock = match idev.get_socket() {
        Some(s) => s,
        None => {
            eprintln!("service connection had no socket");
            return;
        }
    };
    println!(
        "connected to {RP_LOCKDOWN_SERVICE} over USB (ssl={ssl}) — pair-setup should be promptless"
    );

    drive_pair(
        RemotePairingClient::new(RpPairingSocket::new(sock), host),
        pairing_path,
        host,
    )
    .await;
}

/// Drive the pair-verify / pair handshake to completion, generic over the transport.
async fn drive_pair<R: idevice::remote_pairing::RpPairingSocketProvider>(
    mut client: idevice::remote_pairing::RemotePairingClient<R>,
    pairing_path: &str,
    host: &str,
) {
    use idevice::remote_pairing::RpPairingFile;

    let mut pairing_file = match RpPairingFile::read_from_file(pairing_path).await {
        Ok(p) => {
            println!("loaded existing rp pairing file ({pairing_path})");
            p
        }
        Err(_) => {
            println!("no rp pairing file yet — generating a new host identity");
            RpPairingFile::generate(host)
        }
    };

    // Pinless devices (allowsPinlessPairing) return pairing data immediately and expect
    // the fixed code "000000". idevice only auto-fills that on the awaitingUserConsent
    // branch, so default an empty entry to "000000" here (and allow a real code if shown).
    let pin_callback = || async {
        println!(
            ">>> If the phone shows a pairing CODE, type it + Enter; otherwise just Enter for pinless (000000):"
        );
        let line = read_line().await;
        if line.is_empty() {
            "000000".to_string()
        } else {
            line
        }
    };

    match client.connect(&mut pairing_file, pin_callback).await {
        Ok(()) => {
            let _ = pairing_file.write_to_file(pairing_path).await;
            println!(
                "RP-PAIR SUCCESS: authenticated over the network. encryption_key = {} bytes. \
                 pairing saved to {pairing_path} -> the TLS-PSK tunnel is now possible.",
                client.encryption_key().len()
            );
        }
        Err(e) => eprintln!("RP-PAIR FAILED: {e}"),
    }
}

async fn read_line() -> String {
    tokio::task::spawn_blocking(|| {
        let mut line = String::new();
        let _ = std::io::stdin().read_line(&mut line);
        line.trim().to_string()
    })
    .await
    .unwrap_or_default()
}
