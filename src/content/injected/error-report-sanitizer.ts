/**
 * Global error-report sanitizer — closes the extension-id leak on the UNCAUGHT
 * error path.
 *
 * `stripExtensionFramesFromStack` scrubs `Error.stack`, which covers the caught
 * path (a page's `try/catch` reading `err.stack`). But when an error thrown from
 * our injected script goes UNCAUGHT, the browser reports it via `window.onerror`
 * and the `error` event with a `filename` / `source` field that names the script
 * where the throw executed — i.e. `chrome-extension://<id>/…/injected.js`. That
 * field is derived by the engine from the throw site; it is NOT the `.stack`
 * string, so scrubbing the stack doesn't touch it. Native APIs throw from C++,
 * which has no JS URL, so a clean browser reports the page's own frame there.
 *
 * We can't make our JS appear to throw from C++. The only way to close this is
 * to intercept the error-report pipeline: a capture-phase `error` listener that,
 * for our-origin errors, suppresses the id-bearing original and re-emits an
 * otherwise-identical `ErrorEvent` whose `filename`/`lineno`/`colno` are rebuilt
 * from the page's own call frame. The page's `onerror` and `addEventListener`
 * handlers still fire (native behaviour), just without our resource URL.
 *
 * Two details keep the re-emit indistinguishable from a genuine uncaught error:
 *
 * Synthetic events are tracked in an internal `WeakSet`, NOT tagged with an own
 * property. A property (even non-enumerable) would be readable by the page off
 * the event we hand it — and its name would identify the extension. The WeakSet
 * is invisible to page code, so our clone's own-property shape (`['isTrusted']`)
 * is identical to a genuine event's.
 *
 * ACCEPTED, IRREDUCIBLE RESIDUAL — `isTrusted`: a `dispatchEvent`-ed event has
 * `isTrusted === false`, whereas a genuine uncaught error is `true`. Every event
 * carries `isTrusted` as an OWN, `configurable: false` accessor backed by an
 * internal slot that is `true` only for browser-generated events. It can't be
 * redefined per-event (non-configurable), can't be shadowed via the prototype
 * (own wins), and there's no API to forge a trusted event — so this one bit is
 * unavoidable for any re-dispatch. It is NON-IDENTIFYING (reveals "an error was
 * re-dispatched," never which extension), visible only to
 * `addEventListener('error')` handlers that trigger one of our overrides
 * uncaught AND inspect `isTrusted` (never `window.onerror`, which gets positional
 * args). We accept it because closing `window.onerror`'s `source` channel — the
 * one that leaks the actual id — requires re-dispatch, and the exact id is far
 * worse than a non-identifying bit.
 *
 * Promise rejections have no `filename` channel, so `unhandledrejection` only
 * needs its `reason.stack` scrubbed in place — no re-emit.
 *
 * NOTE: this is the UNCAUGHT-path layer only. The caught path (a page's
 * `try/catch` reading `err.stack`) never fires these events and is covered by
 * the per-site `.stack` scrubs (`stripConstruct`, the constructor scrubs, the
 * toString delegate). Both layers are required.
 */

import { stripExtensionFramesFromStack, getSelfScriptUrl } from "./function-masking";

/**
 * Events we re-emitted, tracked out-of-band so nothing is observable on the
 * event object itself. Used to (a) skip our own re-emit in the listener and
 * (b) report `isTrusted === true` for them. Module-level and keyed by object
 * identity, so it works across realms.
 */
const syntheticErrorEvents = new WeakSet<object>();

interface SourceLocation {
  filename: string;
  lineno: number;
  colno: number;
}

const EMPTY_LOCATION: SourceLocation = { filename: "", lineno: 0, colno: 0 };

/**
 * Extract the location of the first stack frame that is NOT our injected
 * script — i.e. the page's own call site, which is what a native
 * (C++-dispatched) throw reports as `filename`/`lineno`/`colno`. Returns an
 * empty location when no foreign frame is present (e.g. an error from one of
 * our own timers with no page caller) — matching native errors that carry an
 * empty filename.
 */
function firstForeignFrame(stack: string, selfUrl: string): SourceLocation {
  const lines = stack.split("\n");
  for (const line of lines) {
    if (line.includes(selfUrl)) continue;
    // Match a trailing "url:line:col" (optionally wrapped in parens), where url
    // is any scheme we might see for a page/native frame.
    const match =
      /((?:https?|file|blob|data|chrome-extension|moz-extension|safari-web-extension):[^\s()]+?):(\d+):(\d+)\)?\s*$/.exec(
        line
      );
    if (match && !match[1].includes(selfUrl)) {
      return {
        filename: match[1],
        lineno: Number(match[2]) || 0,
        colno: Number(match[3]) || 0,
      };
    }
  }
  return EMPTY_LOCATION;
}

/**
 * Install the error-report sanitizer on a realm's window. No-op when the self
 * URL is unknown — on engines where we can't identify our own frames
 * (Firefox/Safari anonymize content-script frames), there is no filename leak
 * to close.
 */
export function installErrorReportSanitizerOn(win: Window & typeof globalThis): void {
  const selfUrl = getSelfScriptUrl();
  if (!selfUrl) return;

  // Realm-correct ErrorEvent so `clone instanceof win.ErrorEvent` holds for a
  // page reading it. Bail if the constructor isn't exposed (very old engines).
  const ErrorEventCtor = win.ErrorEvent;
  if (typeof ErrorEventCtor !== "function") return;

  win.addEventListener(
    "error",
    (ev: ErrorEvent) => {
      // Our own re-emitted event — let it through to the page's handlers.
      if (syntheticErrorEvents.has(ev)) return;

      // Only touch errors whose reported location is ours. Native/page errors
      // pass through completely untouched.
      if (typeof ev.filename !== "string" || !ev.filename.includes(selfUrl)) return;

      const err = ev.error as unknown;
      // Defence: scrub the error's own stack too (the throw-site scrubs already
      // cover most paths, but an uncaught error from one of our own async
      // callbacks might not have passed through one).
      if (err) stripExtensionFramesFromStack(err);

      const loc =
        err && typeof (err as { stack?: unknown }).stack === "string"
          ? firstForeignFrame((err as { stack: string }).stack, selfUrl)
          : EMPTY_LOCATION;

      // Suppress the id-bearing original, re-emit a sanitized twin.
      ev.stopImmediatePropagation();
      ev.preventDefault();

      try {
        const clone = new ErrorEventCtor("error", {
          message: ev.message,
          filename: loc.filename,
          lineno: loc.lineno,
          colno: loc.colno,
          error: err,
          bubbles: ev.bubbles,
          cancelable: ev.cancelable,
          composed: ev.composed,
        }) as ErrorEvent;
        // Track out-of-band (WeakSet) — never as a property on the event, which
        // the page could read to identify the extension.
        syntheticErrorEvents.add(clone);
        win.dispatchEvent(clone);
      } catch {
        // If we somehow can't build/dispatch the clone, we've already suppressed
        // the leaky original — better to drop the event than to re-expose the id.
      }
    },
    true // capture: run before the page's target/bubble listeners and onerror
  );

  // Promise rejections: no filename channel — only `reason.stack` can carry our
  // frames. Scrub it in place (capture phase, before the page's handler reads
  // it). No re-emit needed.
  win.addEventListener(
    "unhandledrejection",
    (ev: PromiseRejectionEvent) => {
      const reason: unknown = ev.reason;
      if (reason !== null && typeof reason === "object") {
        const stack = (reason as { stack?: unknown }).stack;
        if (typeof stack === "string" && stack.includes(selfUrl)) {
          stripExtensionFramesFromStack(reason);
        }
      }
    },
    true
  );
}

/** Install the sanitizer on the top-level realm. */
export function installErrorReportSanitizer(): void {
  installErrorReportSanitizerOn(window);
}
