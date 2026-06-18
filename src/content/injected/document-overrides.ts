/**
 * Document-level overrides for timezone-derived surfaces.
 *
 * `Document.prototype.lastModified` is a getter that returns a string
 * formatted as `"MM/DD/YYYY HH:MM:SS"` in the real system timezone —
 * it bypasses every `Date` / `Intl` / `Temporal` override because it
 * reads directly from the document metadata layer (HTTP Last-Modified
 * header, or the current time for blank / DOMParser-constructed
 * documents). TZP and similar detectors use this as a ground-truth
 * timezone source to detect spoofing: they compare the offset derived
 * from `lastModified` against `Date.prototype.toString()` etc., and
 * any disagreement flags the extension.
 *
 * We close the leak by overriding the getter to reformat the string
 * in the spoofed timezone. The value's underlying UTC epoch is
 * recovered by parsing the native string back through the REAL system
 * timezone (since that's how the browser produced it), then reformatted
 * using the SPOOFED timezone via `Intl.DateTimeFormat` — reusing the
 * same resolution path every other Date override uses for consistency.
 *
 * Three call sites benefit from this automatically once the prototype
 * getter is patched:
 * - `document.lastModified` (the top-level document)
 * - `new DOMParser().parseFromString('', 'text/html').lastModified`
 * - `Document.parseHTMLUnsafe('').lastModified`
 * - `iframe.contentDocument.lastModified` (via the iframe realm's own
 *   `Document.prototype`, patched by `patchIframeWindow`)
 */

import { OriginalDate, OriginalDateTimeFormat, spoofingEnabled, timezoneData } from "./state";
import { registerOverride, disguiseAsNative } from "./function-masking";
import { seedFromBootstrap } from "./bootstrap";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/**
 * Parse the native `lastModified` string (`"MM/DD/YYYY HH:MM:SS"`)
 * into a UTC epoch in milliseconds.
 *
 * The native string is in the real system local timezone, so we
 * build a Date in local time and read `.getTime()` to get the UTC
 * epoch. Returns `null` when the format doesn't match.
 */
function parseNativeLastModified(str: string): number | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}):(\d{2})$/.exec(str);
  if (!match) return null;
  const month = Number.parseInt(match[1], 10) - 1;
  const day = Number.parseInt(match[2], 10);
  const year = Number.parseInt(match[3], 10);
  const hours = Number.parseInt(match[4], 10);
  const minutes = Number.parseInt(match[5], 10);
  const seconds = Number.parseInt(match[6], 10);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(day) ||
    !Number.isFinite(hours) ||
    !Number.isFinite(minutes) ||
    !Number.isFinite(seconds)
  ) {
    return null;
  }
  // `new Date(year, month, day, h, m, s)` interprets the arguments
  // in the REAL system local timezone, which is exactly what the
  // native `lastModified` emitted. `.getTime()` then returns UTC.
  const d = new OriginalDate(year, month, day, hours, minutes, seconds);
  const epoch = d.getTime();
  if (!Number.isFinite(epoch)) return null;
  return epoch;
}

/**
 * Reformat a UTC epoch into the `"MM/DD/YYYY HH:MM:SS"` string format
 * that `Document.prototype.lastModified` emits, but rendered in the
 * SPOOFED timezone. Uses `Intl.DateTimeFormat` via `formatToParts` so
 * we can assemble the exact format the native getter produces without
 * going through any of our overridden `Date.prototype` methods.
 */
function formatInSpoofedZone(epoch: number, timezoneId: string): string {
  const d = new OriginalDate(epoch);
  const fmt = new OriginalDateTimeFormat("en-US", {
    timeZone: timezoneId,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "00";
  // `en-US` with `hour12: false` can emit "24" for midnight on some
  // engines — normalize to "00" so the output format is stable.
  let hour = get("hour");
  if (hour === "24") hour = "00";
  return `${get("month")}/${get("day")}/${get("year")} ${hour}:${get("minute")}:${get("second")}`;
}

/**
 * Install the `Document.prototype.lastModified` override on the given
 * realm's `Document.prototype`. Exported so `iframe-patching.ts` can
 * call it for each patched iframe realm; the top-level `installDocumentOverrides`
 * calls it with the main window's Document prototype.
 */
export function installLastModifiedOverride(documentProto: object): void {
  const desc = Object.getOwnPropertyDescriptor(documentProto, "lastModified");
  if (!desc?.get) {
    logger.debug("[lastModified-install] getter not found on Document.prototype, skipping", {
      isTopLevel: documentProto === (typeof Document !== "undefined" ? Document.prototype : null),
    });
    return;
  }
  if (desc.configurable === false) {
    // Defensive: WebIDL spec says this is configurable, and all known
    // engines comply, but if a future engine locks it down we'd throw
    // at `Object.defineProperty` and crash the whole injection. Skip
    // the override and let the native value leak rather than breaking
    // every other override.
    logger.warn(
      "[lastModified-install] Document.prototype.lastModified is non-configurable, skipping override"
    );
    return;
  }
  // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the wrapper
  const originalGet = desc.get;

  // Method-shorthand form so the override has no `prototype` /
  // [[Construct]] — matches native accessor shape.
  // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: method shorthand destructuring for anti-fingerprint (no prototype/[[Construct]])
  const spoofedGet = {
    lastModified(this: Document): string {
      // Close the document_start race for `document.lastModified` (and the
      // DOMParser / parseHTMLUnsafe / iframe variants that share this getter):
      // seed from the early bootstrap global if it hasn't been consumed yet.
      seedFromBootstrap();
      const native = originalGet.call(this) as string;
      if (!spoofingEnabled || !timezoneData) {
        logger.debug("[lastModified-get] spoofing disabled, returning native", {
          native,
          spoofingEnabled,
          hasTimezoneData: timezoneData !== null,
        });
        return native;
      }
      try {
        const epoch = parseNativeLastModified(native);
        if (epoch === null) {
          logger.debug("[lastModified-get] parse failed, returning native", {
            native,
          });
          return native;
        }
        const spoofed = formatInSpoofedZone(epoch, timezoneData.identifier);
        logger.debug("[lastModified-get] spoofed", {
          native,
          spoofed,
          zone: timezoneData.identifier,
        });
        return spoofed;
      } catch (err) {
        logger.warn("[lastModified-get] override failed, returning native value:", err);
        return native;
      }
    },
  }.lastModified;

  // Register + disguise the override, then install as an accessor. We
  // drop the "install via installOverride" path because installOverride
  // expects a value descriptor; Document.prototype.lastModified is an
  // accessor and must be defined with `get: ...` to match native shape.
  registerOverride(spoofedGet, "lastModified");
  disguiseAsNative(spoofedGet, "lastModified", 0);

  Object.defineProperty(documentProto, "lastModified", {
    get: spoofedGet,
    configurable: desc.configurable,
    enumerable: desc.enumerable,
  });

  logger.debug("[lastModified-install] override installed on Document.prototype", {
    isTopLevel: documentProto === (typeof Document !== "undefined" ? Document.prototype : null),
  });
}

/**
 * Install all Document-level overrides on the top-level realm. Called
 * by `src/content/injected/index.ts` during initialization.
 */
export function installDocumentOverrides(): void {
  if (typeof Document === "undefined" || !Document.prototype) {
    logger.warn("Document not available, skipping Document overrides");
    return;
  }
  installLastModifiedOverride(Document.prototype);
}
