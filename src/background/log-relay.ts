/**
 * TEMPORARY — background → page log relay (debugging aid).
 *
 * On Safari iOS the background service worker's Web Inspector target is
 * unreliable (torn down aggressively, vanishes before you can read it), so
 * background `[BG]` logs — `[RESYNC]`, `[IP-DETECT]`, `[VPN-SYNC]` — are hard to
 * capture. This installs a logger sink that formats each emitted background log
 * line into a string and broadcasts it to all tabs as a `BG_LOG` message. The
 * content script re-emits it to the page console, inline with the `[CS]`/`[INJ]`
 * logs you already see.
 *
 * Volume is low (background logs only fire on sync events, not per-frame like
 * the injected script), so a tab broadcast per line is fine for debugging.
 *
 * To remove: delete this file, its call in index.ts, the `setLogSink` export
 * usage, the `BG_LOG` handler in content/index.ts, and the sink hook in
 * debug-logger.ts.
 */

import { setLogSink } from "@/shared/utils/debug-logger";

/** Format a single log argument into a page-console-safe string. */
function stringifyArg(arg: unknown): string {
  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean" || typeof arg === "bigint") {
    return String(arg);
  }
  if (arg === null) return "null";
  if (arg === undefined) return "undefined";
  if (arg instanceof Error) return `${arg.name}: ${arg.message}`;
  if (typeof arg === "object") {
    try {
      return JSON.stringify(arg) ?? "[object]";
    } catch {
      return "[unserializable object]";
    }
  }
  // symbol / function — represent without invoking default object stringification.
  return typeof arg;
}

let _installed = false;

/**
 * Register the relay sink. Safe to call multiple times — only the first call
 * installs. The sink itself never logs (it would be re-entrancy-guarded by the
 * logger anyway) and swallows all messaging errors so a tab without a content
 * script can't break logging.
 */
export function installBgLogRelay(): void {
  if (_installed) return;
  _installed = true;

  setLogSink((component, level, args) => {
    // Only relay background-context logs — the page already has its own.
    if (component !== "BG") return;

    const line = `[BG] [${level}] ${args.map(stringifyArg).join(" ")}`;

    // Fire-and-forget broadcast to every tab. Errors (no content script in a
    // tab, restricted page, etc.) are swallowed — must not throw into the
    // logger call site, and must not log (would recurse).
    void browser.tabs
      .query({})
      .then((tabs) => {
        for (const tab of tabs) {
          if (typeof tab.id !== "number") continue;
          void browser.tabs.sendMessage(tab.id, { type: "BG_LOG", payload: { line } }).catch(() => {
            /* tab has no listener / is restricted — ignore */
          });
        }
      })
      .catch(() => {
        /* tabs.query failed — ignore */
      });
  });
}
