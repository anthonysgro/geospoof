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
 * Outcomes of a paste:
 *   - Parses cleanly  → fill both inputs and apply (via `onCoordinates`).
 *   - Fails but clearly WAS a coordinate attempt (two or more numbers) → block
 *     the raw paste and show an inline "couldn't read that" message in the hint.
 *   - Anything else (e.g. a single number dropped into one field, or non-numeric
 *     text) → left entirely alone so the field behaves normally.
 */

import { parseCoordinates } from "@/shared/utils/coordinates";
import { t } from "./i18n";

/** Round to 6 decimals (~0.11 m) and drop trailing zeros for a clean field value. */
function normalize(value: number): number {
  return parseFloat(value.toFixed(6));
}

/**
 * Heuristic for "the user was trying to paste a coordinate." Two or more numeric
 * runs means it wasn't a single stray value, so a parse failure is worth
 * flagging; a single number (or none) is left silent to avoid nagging a
 * legitimate single-field paste.
 */
function looksLikeCoordinateAttempt(text: string): boolean {
  const numbers = text.match(/-?\d+(?:\.\d+)?/g);
  return (numbers?.length ?? 0) >= 2;
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

    const parsed = parseCoordinates(pasted);

    if (parsed) {
      event.preventDefault();
      restoreHint();

      const latitude = normalize(parsed.latitude);
      const longitude = normalize(parsed.longitude);

      // Reflect the parsed values in both fields, then apply. Filling both is
      // the visible confirmation of what a single paste resolved to (a geohash,
      // say, becomes a readable lat/lon).
      latInput.value = String(latitude);
      lonInput.value = String(longitude);

      onCoordinates(latitude, longitude);
      return;
    }

    // Parse failed. Only surface an error when the paste looked like a
    // coordinate attempt; otherwise let the field handle the paste normally.
    if (looksLikeCoordinateAttempt(pasted)) {
      event.preventDefault();
      showPasteError();
    }
  });
}
