// Import the side-effect-free subpath, NOT the package root. The root entry
// (`urlpattern-polyfill`) runs `if (!globalThis.URLPattern) globalThis.URLPattern
// = URLPattern` as an import side effect; this `/urlpattern` subpath is the pure
// class with no global mutation. See the anti-fingerprinting note below.
import { URLPattern as PolyfillURLPattern } from "urlpattern-polyfill/urlpattern";

/**
 * URLPattern_Provider (Req 5.1, 5.2, 15.5, 16.4).
 *
 * Resolves a `URLPattern` constructor once and memoizes it: the native
 * `globalThis.URLPattern` when the engine ships it (Chrome 95+, Firefox 142+,
 * Safari 26+), otherwise the maintained `urlpattern-polyfill` implementation.
 *
 * The decision is by *feature detection* — `typeof globalThis.URLPattern ===
 * "function"` — not by browser/version sniffing, matching the repo's
 * capability-detection convention (see `safe-time.ts`). GeoSpoof supports
 * Firefox 140+ and a Safari extension targeting iOS 16+ / macOS 13+, so older
 * engines fall back to the polyfill and match identically to native ones.
 *
 * Anti-fingerprinting: this module reads `globalThis.URLPattern` but never
 * writes it. The pure `/urlpattern` subpath is imported precisely so nothing
 * assigns `globalThis.URLPattern` as an import side effect. Today this code runs
 * only in the background and the popup (both invisible to web pages), but the
 * no-write rule is defense-in-depth: if this ever reaches the MAIN-world
 * injected script, installing a polyfilled `URLPattern` on a browser that lacks
 * it natively would be a page-observable signal that the extension is loaded.
 * Keeping the module a pure reader closes that vector by construction.
 *
 * The polyfill is imported statically (not via dynamic `import()`) on purpose:
 * MV3 service workers and the Firefox event page make dynamic-import timing
 * awkward, and the polyfill is small relative to the injected-script payload.
 * As the pre-142 Firefox / pre-26 Safari targets age out, this import can be
 * dropped with no change to the public API.
 */

/**
 * The `URLPattern` constructor type. Derived from the polyfill's typings, which
 * mirror the standard/native constructor — TypeScript's DOM lib does not yet
 * declare a global `URLPattern`, so we anchor the type on the imported value.
 */
type URLPatternCtor = typeof PolyfillURLPattern;

/** Resolves once and memoizes so the polyfill loads at most once per context (Req 15.5). */
let cached: URLPatternCtor | undefined;

/**
 * Return the `URLPattern` constructor: native when available, else the
 * `urlpattern-polyfill`. Resolved lazily on first call and memoized thereafter.
 */
export function getURLPattern(): URLPatternCtor {
  if (cached) {
    return cached;
  }
  // Feature-detect (not browser-detect) the native constructor; fall back to the polyfill.
  const native: URLPatternCtor | undefined = (globalThis as { URLPattern?: URLPatternCtor })
    .URLPattern;
  cached = typeof native === "function" ? native : PolyfillURLPattern;
  return cached;
}
