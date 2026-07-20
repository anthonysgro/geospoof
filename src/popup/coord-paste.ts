/**
 * Convenient coordinate pasting (manual-coordinates tab).
 *
 * Lets a user paste a location — a "lat, lon" pair, a degrees/minutes/seconds
 * string, or a geohash — straight into the coordinate inputs instead of typing
 * two numbers. This is built on the `paste` event, NOT `navigator.clipboard.
 * readText()`: reading the clipboard programmatically needs the `clipboardRead`
 * permission (which on Chrome adds an install warning and disables the extension
 * for existing users on update), whereas a paste event exposes the pasted text
 * for free and works identically on Chrome, Firefox, and Safari. So there is no
 * "paste button" that reads the clipboard — the field itself accepts the paste,
 * and a subtext hint in the popup advertises the capability.
 *
 * A paste is classified into one of three outcomes (see `classifyCoordinatePaste`):
 *   - "fill"        — a COMPLETE coordinate (pair / DMS / geohash / labelled).
 *                     Fill both inputs and apply, whichever field was focused.
 *   - "passthrough" — a single value (a lone number) or non-coordinate text.
 *                     Do nothing; the field's native paste handles it, so a lone
 *                     latitude or longitude lands in just the focused input and
 *                     the other field is left untouched.
 *   - "error"       — an unambiguous but unreadable pair (a comma with digits, or
 *                     two hemisphere markers). Block the raw paste, flag it.
 */

import { parseCoordinates } from "@/shared/utils/coordinates";
import { t } from "./i18n";

/** Round to 6 decimals (~0.11 m) and drop trailing zeros for a clean field value. */
function normalize(value: number): number {
  return parseFloat(value.toFixed(6));
}

/**
 * True only when a paste UNAMBIGUOUSLY attempted to be a two-value pair yet
 * didn't parse — i.e. it carries the canonical comma separator alongside digits,
 * or two N/S/E/W hemisphere markers. A lone value (one number, or a single
 * hemisphere-tagged value) is deliberately NOT flagged: it must fall through to
 * the field's normal paste so a single latitude or longitude can be pasted into
 * just the focused input.
 */
function looksLikeFailedPair(text: string): boolean {
  // Two hemisphere markers that actually sit next to a number describe both
  // axes. Require digit-adjacency so stray N/S/E/W letters inside ordinary words
  // ("hello world" has an "e" and a "w") don't get mistaken for markers.
  const taggedValues = text.match(/(?:\d\s*[NSEW])|(?:[NSEW]\s*\d)/gi)?.length ?? 0;
  if (taggedValues >= 2) return true;
  // A comma is the canonical lat/lon separator; with digits present it was
  // almost certainly a pair attempt. A lone value (one number, no comma) is
  // intentionally NOT flagged — it falls through to the focused field.
  return text.includes(",") && /\d/.test(text);
}

/** What a given pasted string should do to the coordinate inputs. */
export type CoordinatePasteAction =
  | { kind: "fill"; latitude: number; longitude: number }
  | { kind: "error" }
  | { kind: "passthrough" };

/**
 * Decide how a pasted string should be handled — pure and DOM-free so the policy
 * can be unit-tested directly. A complete coordinate fills both fields; an
 * obvious-but-broken pair is an error; everything else (single values,
 * non-coordinate text) passes through to the field's native paste.
 */
export function classifyCoordinatePaste(text: string): CoordinatePasteAction {
  const parsed = parseCoordinates(text);
  if (parsed) {
    return {
      kind: "fill",
      latitude: normalize(parsed.latitude),
      longitude: normalize(parsed.longitude),
    };
  }
  if (looksLikeFailedPair(text)) return { kind: "error" };
  return { kind: "passthrough" };
}

/**
 * Wire paste handling on the manual-coordinates panel. Listens on the container
 * so a paste into either input is caught (paste events bubble). Safe to call
 * once at startup; no-ops if the panel isn't present.
 */
export function wireCoordinatePaste(
  onCoordinates: (latitude: number, longitude: number) => void
): void {
  const container = document.getElementById("coordsMode");
  const latInput = document.getElementById("latitudeInput") as HTMLInputElement | null;
  const lonInput = document.getElementById("longitudeInput") as HTMLInputElement | null;
  const hint = document.getElementById("coordsPasteHint");
  if (!container || !latInput || !lonInput) return;

  const restoreHint = (): void => {
    if (!hint) return;
    hint.classList.remove("error");
    hint.textContent = t("coords_pasteHint") || "Tip: paste a coordinate pair or a geohash";
  };

  const showPasteError = (): void => {
    if (!hint) return;
    hint.classList.add("error");
    hint.textContent =
      t("coords_pasteFailed") || "Couldn't read coordinates — try a coordinate pair or a geohash";
  };

  // Editing either field clears a lingering error and restores the tip.
  latInput.addEventListener("input", restoreHint);
  lonInput.addEventListener("input", restoreHint);

  container.addEventListener("paste", (event: ClipboardEvent) => {
    const pasted = event.clipboardData?.getData("text") ?? "";
    if (pasted.trim().length === 0) return;

    const action = classifyCoordinatePaste(pasted);

    switch (action.kind) {
      case "fill":
        // A complete coordinate: reflect it in both fields (visible confirmation
        // of what a geohash/DMS resolved to) and apply.
        event.preventDefault();
        restoreHint();
        latInput.value = String(action.latitude);
        lonInput.value = String(action.longitude);
        onCoordinates(action.latitude, action.longitude);
        break;

      case "error":
        event.preventDefault();
        showPasteError();
        break;

      case "passthrough":
        // Single value or non-coordinate text — let the focused field paste it
        // normally, leaving the other field untouched.
        break;
    }
  });
}
