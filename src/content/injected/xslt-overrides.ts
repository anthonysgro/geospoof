/**
 * XSLT / EXSLT date-time override.
 *
 * EXSLT's `date:date-time()` (`http://exslt.org/dates-and-times`) returns the
 * CURRENT date-time as an ISO 8601 string carrying the REAL system UTC offset,
 * e.g. `"2026-06-17T23:13:38.058-04:00"`. It's computed inside the engine's
 * native XSLT processor (libxslt on Gecko), so it bypasses every
 * `Date` / `Intl` / `Temporal` override — exactly the ground-truth surface
 * arkenfox's TZP uses to catch incomplete timezone spoofing.
 *
 * We can't reach into libxslt, but the result is delivered back through the
 * JS `XSLTProcessor` API. So we wrap `transformToFragment` and
 * `transformToDocument`, walk the produced text nodes, and rewrite any
 * ISO datetime that is within a few seconds of "now" — i.e. a freshly emitted
 * `date:date-time()` value — into the equivalent instant rendered in the
 * spoofed timezone. The tight "is it now?" gate means we never touch
 * legitimate datetimes that happen to appear in transformed content.
 *
 * EXSLT is Gecko-only in practice (Chromium/WebKit don't ship the date
 * extension), so on other engines the wrapper finds nothing to rewrite and is
 * a harmless passthrough. Firefox is winding XSLT down behind
 * `dom.xslt.enabled` (FF151+); when it's off, `XSLTProcessor` still exists but
 * produces no EXSLT date, so this stays a no-op there too.
 */

import { OriginalDate, spoofingEnabled, timezoneData } from "./state";
import { getIntlBasedOffset, resolvePartsForDate } from "./timezone-helpers";
import { installOverride } from "./function-masking";
import { seedFromBootstrap } from "./bootstrap";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/**
 * How close to the real current instant an ISO datetime must be for us to
 * treat it as a freshly minted `date:date-time()` value worth rewriting.
 * `date:date-time()` is always "now"; the slack only absorbs clock drift
 * between the transform running and our post-processing.
 */
const NOW_THRESHOLD_MS = 10_000;

/**
 * Matches ISO 8601 datetimes that carry an explicit offset (or Z), with an
 * optional fractional-seconds part. Only offset-bearing datetimes are EXSLT
 * date-time candidates; bare local datetimes can't leak a zone.
 */
const ISO_DATETIME = /(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(\.\d+)?(Z|[+-]\d{2}:\d{2})/g;

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Format an offset (minutes east of UTC) as an ISO `±HH:MM` string. */
function isoOffset(offsetMinutes: number): string {
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const abs = Math.abs(offsetMinutes);
  const hours = Math.floor(abs / 60);
  const minutes = Math.round(abs % 60);
  return `${sign}${pad2(hours)}:${pad2(minutes)}`;
}

/**
 * Rewrite a single ISO datetime string into the spoofed timezone, but only
 * when it represents the current instant (a `date:date-time()` value).
 * Returns the original string unchanged otherwise.
 */
function rewriteIsoDatetime(match: string, fractional: string | undefined): string {
  if (!timezoneData) return match;

  // Parse the full ISO string (with its real offset) to an absolute instant.
  const instant = new OriginalDate(match);
  const epoch = instant.getTime();
  if (!Number.isFinite(epoch)) return match;

  // Gate: only rewrite values that are "now". Legitimate content datetimes
  // are astronomically unlikely to sit within 10s of the current instant AND
  // carry an offset, so this avoids corrupting real transformed data.
  if (Math.abs(epoch - new OriginalDate().getTime()) > NOW_THRESHOLD_MS) {
    return match;
  }

  const parts = resolvePartsForDate(instant, timezoneData.identifier);
  if (!parts) return match;

  const spoofedOffset = getIntlBasedOffset(instant, timezoneData.identifier, timezoneData.offset);

  // Milliseconds are timezone-independent, so preserve the original fractional
  // part verbatim rather than recomputing it.
  const frac = fractional ?? "";
  return (
    `${String(parts.year).padStart(4, "0")}-${pad2(parts.month)}-${pad2(parts.day)}` +
    `T${pad2(parts.hour)}:${pad2(parts.minute)}:${pad2(parts.second)}${frac}` +
    isoOffset(spoofedOffset)
  );
}

/** Walk a transform result's text nodes and rewrite any EXSLT "now" datetimes. */
function rewriteResultDates(node: Node): void {
  if (node.nodeType === 3 /* TEXT_NODE */) {
    const text = node.nodeValue;
    if (text && text.indexOf("T") !== -1) {
      ISO_DATETIME.lastIndex = 0;
      if (ISO_DATETIME.test(text)) {
        ISO_DATETIME.lastIndex = 0;
        node.nodeValue = text.replace(ISO_DATETIME, (m, _y, _mo, _d, _h, _mi, _s, frac) =>
          rewriteIsoDatetime(m, frac as string | undefined)
        );
      }
    }
    return;
  }
  for (let child = node.firstChild; child; child = child.nextSibling) {
    rewriteResultDates(child);
  }
}

/**
 * Install the XSLT/EXSLT date-time overrides on the current realm's
 * `XSLTProcessor.prototype`. No-op when XSLTProcessor is unavailable.
 */
export function installXsltOverrides(): void {
  if (typeof XSLTProcessor === "undefined" || !XSLTProcessor.prototype) {
    logger.debug("XSLTProcessor unavailable, skipping XSLT overrides");
    return;
  }
  installXsltOverridesOn(XSLTProcessor);
}

/**
 * Install the XSLT/EXSLT date-time overrides on a specific realm's
 * `XSLTProcessor` constructor. Exported so `iframe-patching.ts` can patch
 * each same-origin iframe realm's own `XSLTProcessor.prototype` (an iframe
 * has its own, and reading the EXSLT date through it would otherwise bypass
 * the top-level override).
 */
export function installXsltOverridesOn(ProcessorCtor: typeof XSLTProcessor): void {
  try {
    const proto = ProcessorCtor?.prototype;
    if (!proto) return;

    // eslint-disable-next-line @typescript-eslint/unbound-method -- detached, re-bound via .call(this)
    const originalTransformToFragment = proto.transformToFragment;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- detached, re-bound via .call(this)
    const originalTransformToDocument = proto.transformToDocument;

    installOverride(
      proto,
      "transformToFragment",
      function (this: XSLTProcessor, source: Node, output: Document): DocumentFragment {
        seedFromBootstrap();
        const result = originalTransformToFragment.call(this, source, output);
        try {
          if (spoofingEnabled && timezoneData && result) rewriteResultDates(result);
        } catch (err) {
          logger.warn("transformToFragment EXSLT rewrite failed:", err);
        }
        return result;
      }
    );

    installOverride(
      proto,
      "transformToDocument",
      function (this: XSLTProcessor, source: Node): Document {
        seedFromBootstrap();
        const result = originalTransformToDocument.call(this, source);
        try {
          if (spoofingEnabled && timezoneData && result) rewriteResultDates(result);
        } catch (err) {
          logger.warn("transformToDocument EXSLT rewrite failed:", err);
        }
        return result;
      }
    );

    logger.debug("XSLT/EXSLT date-time overrides installed");
  } catch (error) {
    logger.error("Failed to install XSLT overrides:", error);
  }
}
