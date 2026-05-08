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
// 1. Iframe timing side-channels — A cross-origin iframe can compare
//    its own Date/Intl results against the parent frame's postMessage
//    timestamps, revealing discrepancies that content-script overrides
//    cannot prevent.
//
//    NOTE: Same-origin iframe geolocation IS patched — patchIframeWindow()
//    overrides navigator.geolocation in every same-origin iframe window
//    synchronously on insertion. Cross-origin iframes throw SecurityError
//    and are silently skipped (unavoidable without browser-level changes).
//
// 2. Web Worker timezone leaks — Content scripts cannot inject into
//    Web Worker or SharedWorker contexts. Code running inside a Worker
//    will see the real system timezone via Date and Intl APIs.
//
// 3. SharedArrayBuffer timing attacks — High-resolution timing via
//    SharedArrayBuffer can be used to fingerprint execution patterns
//    introduced by API overrides, which cannot be masked at the
//    content-script level.
//
// 4. Proxy/engine-internal detection — Some fingerprinting techniques
//    rely on engine-internal checks (e.g., brand checks, internal
//    slots) that can distinguish overridden functions from true native
//    implementations. These require browser-level changes to mitigate.
//
// Content-script-based API overrides cannot prevent all fingerprinting
// techniques. Some detection vectors require browser-level changes.
// This extension does NOT attempt to override APIs in Web Worker
// contexts, as content scripts cannot inject into workers.
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

// 10. Temporal API overrides (feature-detected, no-ops if unavailable)
import { installTemporalOverrides } from "./temporal";
installTemporalOverrides();

// 11. Iframe patching (contentWindow/contentDocument getter overrides)
import { installIframePatching } from "./iframe-patching";
installIframePatching();

// 12. DOM insertion wrapping and MutationObserver fallback
import { installDomInsertionWrapping } from "./dom-insertion";
installDomInsertionWrapping();

// 13. Document-level overrides (lastModified — ground-truth timezone
//     surface used by TZP and similar fingerprinters)
import { installDocumentOverrides } from "./document-overrides";
installDocumentOverrides();

import { createLogger } from "@/shared/utils/debug-logger";
const logger = createLogger("INJ");
logger.info("Geolocation API overrides installed");
