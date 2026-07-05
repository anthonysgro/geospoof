//! LAN discovery of the device's RemotePairing endpoint via mDNS.
//!
//! usbmuxd doesn't reliably re-create a phone's Wi-Fi-sync device after the phone leaves
//! and rejoins the network (design §16), so we can't depend on `list_udids()` to find it.
//! But the phone keeps advertising `_remotepairing._tcp` on the LAN — the endpoint the
//! remote-pairing tunnel connects to by IP — so we browse for that directly. idevice has
//! no mDNS browser, hence the small `mdns-sd` dependency.

use std::net::IpAddr;
use std::time::{Duration, Instant};

use mdns_sd::{ServiceDaemon, ServiceEvent};

/// The Bonjour service the device advertises for wireless developer pairing.
const SERVICE_TYPE: &str = "_remotepairing._tcp.local.";

/// Browse the LAN for a device advertising `_remotepairing._tcp` and return the first
/// resolved `(IPv4, port)`. Blocking (mdns-sd uses a sync channel) — call from
/// `spawn_blocking`. Returns `None` on timeout or if mDNS can't start. Prefers an IPv4
/// address for a straightforward `TcpStream` connect.
pub fn discover_remotepairing(timeout: Duration) -> Option<(IpAddr, u16)> {
    let mdns = ServiceDaemon::new().ok()?;
    let receiver = mdns.browse(SERVICE_TYPE).ok()?;
    let deadline = Instant::now() + timeout;

    let result = loop {
        let now = Instant::now();
        if now >= deadline {
            break None;
        }
        match receiver.recv_timeout(deadline - now) {
            Ok(ServiceEvent::ServiceResolved(info)) => {
                if let Some(ip) = info.get_addresses_v4().into_iter().next() {
                    break Some((IpAddr::V4(ip), info.get_port()));
                }
                // Resolved but no IPv4 yet — keep waiting for a usable address.
            }
            Ok(_) => {}
            Err(_) => break None, // timeout or channel closed
        }
    };

    let _ = mdns.shutdown();
    result
}
