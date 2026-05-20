/**
 * Entry point for the modular injected script.
 *
 * Imports and initializes all override modules in the exact order matching
 * the original monolithic IIFE's top-to-bottom execution sequence.
 * Vite/Rollup bundles this back into a single IIFE for page-context injection.
 */

// ── Known Limitations ────────────────────────────────────────────────
//
// The following detection vectors CANNOT be fully mitigated from a
// content script and are acknowledged as known limitations:
//
// 1. Cross-origin iframe timing side-channels — A cross-origin iframe
//    can compare its own Date/Intl results against the parent frame's
//    postMessage timestamps, revealing discrepancies. Cross-origin
//    iframes throw SecurityError on any property access and are
//    silently skipped (unavoidable without browser-level changes).
//
//    NOTE: Same-origin iframes ARE fully patched — patchIframeWindow()
//    installs overrides for geolocation, permissions, Intl, Date,
//    Temporal, lastModified, and nested-iframe cascades into every
//    same-origin iframe realm synchronously on first access.
//
//    Worker patching, iframe patching, and DOM insertion wrapping are
//    also skipped when the injected script itself runs inside a
//    cross-origin frame (detected via window.top.location access).
//    Installing those overrides inside third-party iframes (e.g.
//    Cloudflare Turnstile) causes those scripts to detect tampering
//    and break. Date/Intl/timezone overrides still run in all frames.
//
// 2. Web Worker timezone leaks — Content scripts cannot inject into
//    Web Worker, SharedWorker, or ServiceWorker contexts. Code running
//    inside a Worker sees the real system timezone via Date and Intl.
//    No public WebExtension API provides Worker-injection access.
//
// 3. SharedArrayBuffer timing attacks — High-resolution timing via
//    SharedArrayBuffer can fingerprint execution patterns introduced
//    by API overrides. Unfixable at the content-script level.
//
// 4. XSLT/EXSLT datetime leak (Firefox only) — XSLTProcessor runs
//    inside a C++ engine that doesn't round-trip through JavaScript.
//    The EXSLT function date:date-time() emits the real system UTC
//    offset, bypassing every Date/Intl/Temporal override. Chromium
//    doesn't ship EXSLT so the leak is Firefox-only. Unpatchable
//    without browser-level changes.
//
// 5. Extension initialization race — Overrides install at
//    document_start, but spoofing settings arrive asynchronously
//    (50-250ms on cold page loads). A fingerprinting script that
//    reads timezone synchronously in <head> can win that race and
//    learn the real zone. Fundamental MV3 limitation.
//
// 6. IP geolocation mismatch — The extension does not mask the
//    user's IP address. Fingerprinting scripts cross-check public
//    IP country/region against browser-reported geolocation. Closing
//    this requires a VPN exit in the spoofed region (hence VPN Sync).
//
// ────────────────────────────────────────────────────────────────────

// 1. Settings listener — MUST be installed first so the window is ready
//    to receive the CustomEvent from the content script as early as
//    possible. Content script and injected script both run at
//    document_start with no ordering guarantee; if the content script
//    dispatches its initial settings event before this listener is
//    installed, the event is lost forever (CustomEvents have no
//    subscription backlog). The content script pairs this with a
//    retry loop that redispatches a few times at short intervals,
//    but moving the listener install to the very top of the injected
//    script's module init gives us the widest possible window to
//    catch the first dispatch on the first try.
import { installSettingsListener } from "./settings-listener";
installSettingsListener();

// 2. Function masking infrastructure — toString masking must be installed
//    before any of the behaviour-modifying overrides so that every
//    subsequent override is indistinguishable from native code.
import { initFunctionMasking } from "./function-masking";
initFunctionMasking();

// 3. State module loads eagerly — original API references are captured at
//    import time, before any overrides replace them.
import "./state";

// 4. Date constructor override — must precede other Date-related overrides
//    so the global Date is replaced before anything else uses it.
import { installDateConstructor } from "./date-constructor";
installDateConstructor();

// 5. Geolocation overrides
import { installGeolocationOverrides } from "./geolocation";
installGeolocationOverrides();

// 6. Permissions override
import { installPermissionsOverride } from "./permissions";
installPermissionsOverride();

// 7. Timezone overrides (getTimezoneOffset and Intl.DateTimeFormat)
import { installTimezoneOverrides } from "./timezone-overrides";
installTimezoneOverrides();

// 8. Date formatting overrides (toString, toDateString, toTimeString, toLocale*)
import { installDateFormattingOverrides } from "./date-formatting";
installDateFormattingOverrides();

// 9. Date getter overrides (getHours, getMinutes, getDate, etc.)
import { installDateGetterOverrides } from "./date-getters";
installDateGetterOverrides();

// 10. Date setter overrides (setHours, setMinutes, setDate, etc.)
//     Installed AFTER the getters so multi-argument setters that
//     preserve omitted components read through the spoofed getters
//     when they fall back to "current" values.
import { installDateSetterOverrides } from "./date-setters";
installDateSetterOverrides();

// 11. Temporal API overrides (feature-detected, no-ops if unavailable)
import { installTemporalOverrides } from "./temporal";
installTemporalOverrides();

// ── Frame context detection ──────────────────────────────────────────
// Determine whether this script is running in a cross-origin frame.
// If window.top.location is inaccessible (throws SecurityError), we are
// inside a cross-origin iframe. Worker patching, iframe patching, and
// DOM insertion wrapping must be skipped in that case — installing them
// in a cross-origin context (e.g. Cloudflare Turnstile) causes those
// third-party scripts to detect tampering and break.
const isCrossOriginFrame = (() => {
  if (window === window.top) return false; // top-level page
  try {
    // Will throw SecurityError if cross-origin
    void window.top?.location.origin;
    return false;
  } catch {
    return true;
  }
})();

// 12. Iframe patching (contentWindow/contentDocument getter overrides)
import { installIframePatching } from "./iframe-patching";
if (!isCrossOriginFrame) installIframePatching();

// 13. DOM insertion wrapping and MutationObserver fallback
import { installDomInsertionWrapping } from "./dom-insertion";
if (!isCrossOriginFrame) installDomInsertionWrapping();

// 14. Document-level overrides (lastModified — ground-truth timezone
//     surface used by TZP and similar fingerprinters)
import { installDocumentOverrides } from "./document-overrides";
installDocumentOverrides();

// 15. Worker constructor interception. Wraps window.Worker and
//     window.SharedWorker so that classic Workers get a timezone
//     spoofing payload prepended to their source. Module Workers
//     pass through unmodified (blob URLs break relative imports).
//     Must run after settings-listener so timezone data is available
//     at Worker construction time.
//     Skipped in cross-origin frames — installing Worker overrides
//     inside third-party iframes (e.g. Cloudflare Turnstile) causes
//     those scripts to detect tampering and break.
import { installWorkerPatching } from "./worker-patching";
if (!isCrossOriginFrame) installWorkerPatching();

// 16. WebRTC IP-leak protection. Wraps RTCPeerConnection so no ICE
//     candidates ever gather when the user enables WebRTC Protection
//     in the popup. Closes the srflx/host/relay leaks that Firefox's
//     `disable_non_proxied_udp` policy misses without a proxy and
//     that Safari can't enforce at all. Flag is read lazily on each
//     constructor/getStats call so toggling the protection in the
//     popup takes effect for new peer connections without a reload.
import { installWebRTCOverride } from "./webrtc";
installWebRTCOverride();

import { createLogger } from "@/shared/utils/debug-logger";
const logger = createLogger("INJ");
logger.info("Geolocation API overrides installed");
