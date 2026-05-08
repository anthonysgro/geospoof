/**
 * WebRTC IP-leak protection (content-script layer).
 *
 * The extension's background script sets
 * `browser.privacy.network.webRTCIPHandlingPolicy` to
 * `"disable_non_proxied_udp"` when WebRTC Protection is enabled.
 * That's the "official" path. But it has real gaps:
 *
 *   - Firefox only honours the policy when a proxy is actively
 *     configured. Without a proxy, srflx candidates still leak the
 *     real public IP (verified in the verification-dashboard WebRTC
 *     battery on a fresh Firefox 150 profile).
 *   - Safari doesn't expose `browser.privacy` at all, so the
 *     background-script call throws silently and no protection
 *     ever activates.
 *
 * This module closes both gaps by wrapping `RTCPeerConnection` at
 * the content-script level. When `webrtcProtectionEnabled` is true:
 *
 *   - The constructor builds a connection that can never gather
 *     any candidates. We do this by forcing `iceTransportPolicy:
 *     "relay"` AND stripping the `iceServers` list so there's no
 *     TURN server — the browser's ICE agent has no way to produce
 *     any candidate type (host, srflx, or relay) and gathering
 *     settles immediately with an empty candidate set.
 *   - `getStats()` is wrapped to strip the `address` / `ip` /
 *     `relatedAddress` fields from every `local-candidate` report.
 *     The candidate-emission path is already neutered by the above
 *     but the stats surface is a separate reach that some detection
 *     scripts use as a backup; a belt-and-suspenders scrub here
 *     guarantees the leak is closed at every reported surface.
 *
 * When `webrtcProtectionEnabled` is false we pass through to the
 * real constructor with zero modifications — Chromium's strict
 * implementation of `disable_non_proxied_udp` still works at the
 * browser layer there, and a user with protection off expects
 * native WebRTC behaviour.
 *
 * ### Toggle semantics
 *
 * The flag is read lazily on every `new RTCPeerConnection(...)` and
 * on every `getStats()` call. Flipping the toggle in the popup
 * therefore takes effect for the NEXT peer connection a page
 * creates — existing live connections keep whatever behaviour they
 * started with. This matches how the browser-level policy flip
 * behaves too (existing connections are unaffected), so there's no
 * behaviour change at the boundary.
 *
 * ### Brand check preservation
 *
 * Pages commonly check `pc instanceof RTCPeerConnection` or
 * `Object.prototype.toString.call(pc) === "[object RTCPeerConnection]"`.
 * Our wrapper's prototype is the real `RTCPeerConnection.prototype`
 * (via `Object.setPrototypeOf`), and the wrapped instance is still
 * a true RTCPeerConnection underneath — we just pre-process the
 * config before forwarding to the native constructor and post-
 * process the stats on the way out. All brand checks continue to
 * return the right answer.
 *
 * ### Iframe patching
 *
 * Same-origin iframes have their own `window.RTCPeerConnection` —
 * a page can call `iframe.contentWindow.RTCPeerConnection(...)` to
 * bypass any override installed only on the top-level window. We
 * install the wrapper in each iframe realm via the existing
 * `iframe-patching.ts` cascade (new section added there so the
 * override travels with the cascade's usual coverage).
 */

import { OriginalRTCPeerConnection, webrtcProtectionEnabled, overrideRegistry } from "./state";
import { registerOverride, disguiseAsNative } from "./function-masking";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/**
 * Sanitize an `RTCConfiguration` so the resulting connection cannot
 * gather any candidate type.
 *
 * - `iceServers: []` — no STUN means no srflx, no TURN means no
 *   relay.
 * - `iceTransportPolicy: "relay"` — forces the browser to only
 *   consider relay candidates; combined with no TURN server, nothing
 *   to relay through → zero candidates emitted.
 *
 * We preserve every other field (bundlePolicy, rtcpMuxPolicy,
 * certificates, etc.) so the pc object still behaves like a normal
 * RTCPeerConnection for anything that doesn't involve the wire.
 */
function buildBlockingConfig(original: RTCConfiguration | undefined): RTCConfiguration {
  const cleaned: RTCConfiguration = { ...(original ?? {}) };
  cleaned.iceServers = [];
  cleaned.iceTransportPolicy = "relay";
  return cleaned;
}

/**
 * Strip the address fields from `local-candidate` reports returned
 * by `pc.getStats()`. The underlying stats report comes back as a
 * `Map`-like object; we copy every entry through, rewriting only
 * the local-candidate entries. Everything else is returned verbatim.
 *
 * The returned value is the original `RTCStatsReport` with mutated
 * entries — we mutate in place rather than synthesising a new
 * `RTCStatsReport` because its constructor is not exposed to
 * content contexts and a plain `Map` would fail any instanceof
 * check the page performs.
 */
function scrubLocalCandidateAddresses(report: RTCStatsReport): RTCStatsReport {
  report.forEach((entry) => {
    if (!entry || typeof entry !== "object") return;
    const e = entry as unknown as {
      type?: string;
      address?: unknown;
      ip?: unknown;
      relatedAddress?: unknown;
      port?: unknown;
    };
    if (e.type !== "local-candidate") return;
    try {
      // Clear both the current-spec field (`address`) and the legacy
      // Chromium/Firefox field (`ip`). `relatedAddress` can also
      // carry the raw address for reflexive candidates, so strip
      // that too. Leave port alone — port is fingerprint noise but
      // not a geolocation signal.
      if ("address" in e) e.address = undefined;
      if ("ip" in e) e.ip = undefined;
      if ("relatedAddress" in e) e.relatedAddress = undefined;
    } catch {
      // Some engines freeze stat entries — if the write throws,
      // fall through. The outer candidate emission was already
      // blocked by `buildBlockingConfig`, so this is just
      // defence-in-depth.
    }
  });
  return report;
}

/**
 * Build a wrapped `RTCPeerConnection` constructor.
 *
 * The wrapper:
 *   1. Reads `webrtcProtectionEnabled` lazily on each `new` call.
 *      Protection off → behaves identically to native.
 *   2. Passes through `setLocalDescription` / `createOffer` /
 *      `createAnswer` / `addIceCandidate` etc. — the native
 *      methods are inherited from the original prototype via
 *      subclassing, so we don't need to re-declare them.
 *   3. Wraps `getStats` on the prototype so the scrubbing applies
 *      to every protected instance without needing to shim each
 *      instance at construction time.
 *
 * Exported as a factory because `iframe-patching.ts` needs to
 * build a version that points at an iframe realm's own
 * `RTCPeerConnection`, not the top-level one.
 */
export function buildRTCPeerConnectionWrapper(
  NativeCtor: typeof RTCPeerConnection
): typeof RTCPeerConnection {
  // `class X extends NativeCtor` is the cleanest way to preserve
  // every descriptor/brand/instance relationship. The wrapper
  // forwards to the native constructor with a sanitized config
  // when protection is active.
  class WrappedRTCPeerConnection extends NativeCtor {
    constructor(configuration?: RTCConfiguration) {
      if (webrtcProtectionEnabled) {
        const blocked = buildBlockingConfig(configuration);
        logger.debug(
          "[webrtc] RTCPeerConnection constructed with protection active — ICE gathering will produce zero candidates",
          {
            originalConfig: configuration,
            blockedConfig: blocked,
          }
        );
        super(blocked);
      } else {
        super(configuration);
      }
    }
  }

  // Disguise the class as `function RTCPeerConnection() { [native code] }`.
  // We register the wrapper in the toString registry so any page
  // reading `Function.prototype.toString.call(RTCPeerConnection)`
  // gets the native-looking string.
  registerOverride(
    WrappedRTCPeerConnection as unknown as (...args: unknown[]) => unknown,
    "RTCPeerConnection"
  );
  try {
    disguiseAsNative(
      WrappedRTCPeerConnection as unknown as (...args: unknown[]) => unknown,
      "RTCPeerConnection",
      0
    );
  } catch {
    // Some engines disallow `name`/`length` redefinition on a class
    // constructor. That's OK — the registerOverride covers the
    // toString path, which is the most sensitive fingerprint surface.
  }

  return WrappedRTCPeerConnection;
}

/**
 * Wrap the `getStats` method on a given `RTCPeerConnection.prototype`
 * so local-candidate addresses are scrubbed when protection is on.
 *
 * Installed as a prototype-level override: every instance (even
 * those constructed through an un-wrapped reference a page might
 * have cached before our wrapper was installed) picks this up
 * automatically. No `hasOwn` branching needed — `pc.getStats`
 * resolves to this override via the prototype chain.
 *
 * Exported so `iframe-patching.ts` can install it on each iframe
 * realm's prototype.
 */
export function installRTCGetStatsOverride(proto: RTCPeerConnection): void {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: we re-bind via .call(this) inside the wrapper
  const originalGetStats = proto.getStats;
  if (typeof originalGetStats !== "function") return;

  async function wrappedGetStats(
    this: RTCPeerConnection,
    selector?: MediaStreamTrack | null
  ): Promise<RTCStatsReport> {
    const report = await originalGetStats.call(this, selector);
    if (!webrtcProtectionEnabled) return report;
    return scrubLocalCandidateAddresses(report);
  }

  registerOverride(wrappedGetStats, "getStats");
  try {
    disguiseAsNative(wrappedGetStats, "getStats", 0);
  } catch {
    // As above — don't fail the install if name/length redefinition
    // is blocked on this engine.
  }

  // Mirror the native descriptor flags so
  // `Object.getOwnPropertyDescriptor(RTCPeerConnection.prototype, "getStats")`
  // returns the same shape before and after our install.
  const existingDesc = Object.getOwnPropertyDescriptor(proto, "getStats");
  const cfg = existingDesc
    ? {
        configurable: existingDesc.configurable,
        enumerable: existingDesc.enumerable,
        writable: existingDesc.writable !== false,
      }
    : { configurable: true, enumerable: true, writable: true };
  Object.defineProperty(proto, "getStats", {
    value: wrappedGetStats,
    ...cfg,
  });
}

/**
 * Install the WebRTC overrides on the top-level window.
 *
 * Called from `src/content/injected/index.ts` during initialization.
 * Safely no-ops when `RTCPeerConnection` is not exposed in this
 * runtime (e.g. old mobile browsers).
 */
export function installWebRTCOverride(): void {
  if (!OriginalRTCPeerConnection) {
    logger.debug("[webrtc] RTCPeerConnection not available — skipping override");
    return;
  }

  // Install the getStats scrubber on the prototype first. Any
  // instance created before or after the wrapper swap picks this
  // up via the prototype chain.
  installRTCGetStatsOverride(OriginalRTCPeerConnection.prototype);

  const Wrapped = buildRTCPeerConnectionWrapper(OriginalRTCPeerConnection);

  // Swap the global. Defensive try/catch in case some page has
  // already frozen `window` — if we can't install, pass-through
  // behaviour (identical to not being installed at all).
  try {
    Object.defineProperty(globalThis, "RTCPeerConnection", {
      value: Wrapped,
      configurable: true,
      enumerable: false,
      writable: true,
    });
    logger.debug("[webrtc] RTCPeerConnection wrapper installed on window");
  } catch (err) {
    logger.warn("[webrtc] failed to swap global RTCPeerConnection, leaving native in place:", err);
  }

  // Register the original class so toString on the original (if a
  // page cached a reference pre-install) still reports native-
  // looking text. The wrapped class is already registered in
  // `buildRTCPeerConnectionWrapper`.
  if (!overrideRegistry.has(OriginalRTCPeerConnection as unknown as (...a: unknown[]) => unknown)) {
    registerOverride(
      OriginalRTCPeerConnection as unknown as (...args: unknown[]) => unknown,
      "RTCPeerConnection"
    );
  }
}
