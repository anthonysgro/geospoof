/**
 * Popup Accuracy Control (Advanced accordion, Details tab)
 *
 * Renders and wires the accuracy dropdown (+ conditional Custom numeric input)
 * that lets the user choose how the spoofed `GeolocationCoordinates.accuracy`
 * value is produced. The control maps a small set of presets onto the
 * `AccuracySetting` model and persists the choice by sending `SET_ACCURACY` to
 * the background (Requirements 9.2, 9.3):
 *
 *   - "Realistic" → { mode: "auto" }
 *   - "Custom"    → { mode: "fixed", meters } (revealed numeric input)
 *
 * The older "Tight" / "Loose" range presets were retired — "Realistic" already
 * picks a device-appropriate band automatically, so the manual range options
 * mostly added noise. The `range` mode still exists in the model/Resolver for
 * backward compatibility (a value saved before removal keeps resolving), but the
 * picker no longer offers it and collapses any stored range to "Realistic".
 *
 * Selecting "Realistic" applies immediately and hides the whole Custom wrapper.
 * The Custom control, by contrast, is a small inline
 * edit/display toggle with two visual states:
 *
 *   - Editing state — a single inline row `[ numeric input ][ Set ]`. The value
 *     commits ONLY when the user clicks "Set" or presses Enter — never on blur
 *     and never on every keystroke. On commit a finite, in-range value is
 *     rounded to an integer, sent via `SET_ACCURACY` as `{ mode: "fixed",
 *     meters }`, and the control switches to the display state. An empty,
 *     non-finite, or out-of-range entry is rejected: it stays in the editing
 *     state and surfaces the red-outline invalid indication + hint (sends
 *     nothing — out-of-range values are NOT clamped/saved).
 *   - Display state — a compact inline row `±{meters}m  [ Edit ]` showing the
 *     committed value. Clicking "Edit" returns to the editing state, pre-filled
 *     with the committed meters.
 *
 * Selecting "Custom" from the dropdown (coming from another option) opens the
 * editing state pre-filled with the currently-resolved accuracy (the ±Nm in
 * effect) and sends nothing. Restoring a stored `fixed` setting opens directly
 * in the display state (already committed; the editor is not opened).
 *
 * No controls for distribution, per-call jitter, or fractional precision are
 * exposed (Requirement 9.4); the Custom input must be a finite value within
 * `[1, 10000]` to commit — out-of-range entries are rejected rather than
 * clamped (Requirement 9.3).
 *
 * The pure mapping/clamping helpers are exported so they can be unit-tested
 * without a DOM.
 */

import type { AccuracySetting } from "@/shared/types/settings";
import type { SetAccuracyPayload } from "@/shared/types/messages";

/** Inclusive bounds for a valid custom accuracy value, in metres. */
export const MIN_ACCURACY_M = 1;
export const MAX_ACCURACY_M = 10000;

/** The dropdown options, matching the `value` attributes in popup.html. */
export type AccuracyOption = "realistic" | "custom";

/**
 * Round and clamp an arbitrary number into the valid custom accuracy range
 * `[1, 10000]`. Non-finite input falls back to the lower bound so the result
 * is always a valid integer.
 */
export function clampAccuracyMeters(value: number): number {
  if (!Number.isFinite(value)) {
    return MIN_ACCURACY_M;
  }
  const rounded = Math.round(value);
  return Math.min(MAX_ACCURACY_M, Math.max(MIN_ACCURACY_M, rounded));
}

/**
 * Whether a raw numeric value is a finite number already inside the inclusive
 * `[1, 10000]` range. Used to decide whether to flag the input as out-of-range
 * before clamping (Requirement 9.3).
 */
export function isAccuracyMetersInRange(value: number): boolean {
  return Number.isFinite(value) && value >= MIN_ACCURACY_M && value <= MAX_ACCURACY_M;
}

/**
 * Map a selected dropdown option (plus the custom meters value when the option
 * is "custom") onto an {@link AccuracySetting}.
 *
 * For "custom" the provided meters value is clamped into `[1, 10000]`; a
 * non-finite/undefined value yields `null` so the caller can withhold a save
 * until the user enters something usable.
 */
export function optionToAccuracySetting(
  option: AccuracyOption,
  customMeters?: number
): AccuracySetting | null {
  switch (option) {
    case "custom":
      if (customMeters === undefined || !Number.isFinite(customMeters)) {
        return null;
      }
      return { mode: "fixed", meters: clampAccuracyMeters(customMeters) };
    case "realistic":
    default:
      return { mode: "auto" };
  }
}

/**
 * Reverse mapping used to restore the control from a stored
 * {@link AccuracySetting}:
 *   - { mode: "fixed", meters }   → "custom" (meters populated)
 *   - { mode: "auto" }            → "realistic"
 *   - { mode: "range", … }        → "realistic"
 *
 * The Tight/Loose range presets were retired, so the control now models only
 * "realistic" and "custom". Any stored `range` — including a legacy Tight
 * (5–15) or Loose (35–100) value saved before the presets were removed — has no
 * dedicated control, so it collapses to "realistic" (the safest,
 * least-surprising default) and is normalized to `auto` the next time the user
 * changes the setting. The value still resolves correctly in the meantime (the
 * Resolver and validators retain `range` support); only the picker no longer
 * offers it. `customMeters` is only non-null for the fixed/"custom" case.
 */
export function accuracySettingToControlState(setting: AccuracySetting): {
  option: AccuracyOption;
  customMeters: number | null;
} {
  switch (setting.mode) {
    case "fixed":
      return { option: "custom", customMeters: clampAccuracyMeters(setting.meters) };
    case "range":
    case "auto":
    default:
      return { option: "realistic", customMeters: null };
  }
}

// ── DOM wiring ───────────────────────────────────────────────────────────────

/**
 * The most recently resolved accuracy value (the ±Nm currently in effect),
 * supplied by `restoreAccuracyControl`. Used to pre-fill the Custom input when
 * the user selects "Custom" so the field opens showing the value in effect.
 */
let lastResolvedAccuracy: number | null = null;

/**
 * The last successfully-committed custom value (metres), or `null` if no custom
 * value has been committed in this popup session. Used to pre-fill the editor
 * when the user clicks "Edit" from the display state.
 */
let committedMeters: number | null = null;

function getSelect(): HTMLSelectElement | null {
  return document.getElementById("accuracySelect") as HTMLSelectElement | null;
}

function getCustomInput(): HTMLInputElement | null {
  return document.getElementById("accuracyCustomInput") as HTMLInputElement | null;
}

function getCustomHint(): HTMLElement | null {
  return document.getElementById("accuracyCustomHint");
}

function getCustomConfirm(): HTMLButtonElement | null {
  return document.getElementById("accuracyCustomConfirm") as HTMLButtonElement | null;
}

function getCustomEditRow(): HTMLElement | null {
  return document.getElementById("accuracyCustomEdit");
}

function getCustomDisplayRow(): HTMLElement | null {
  return document.getElementById("accuracyCustomDisplay");
}

function getCustomValueLabel(): HTMLElement | null {
  return document.getElementById("accuracyCustomValue");
}

function getCustomEditBtn(): HTMLButtonElement | null {
  return document.getElementById("accuracyCustomEditBtn") as HTMLButtonElement | null;
}

/** Hide both inline Custom groups (used when a preset is selected). */
function hideCustom(): void {
  const editRow = getCustomEditRow();
  const displayRow = getCustomDisplayRow();
  if (editRow) editRow.style.display = "none";
  if (displayRow) displayRow.style.display = "none";
  setCustomInvalid(false);
}

/**
 * Switch the Custom control into its editing state: the inline
 * `[ input ][ Set ]` group is shown, the display group hidden, and the input
 * pre-filled (when `prefill` is provided), focused, and selected.
 */
function showCustomEditing(prefill: number | null): void {
  setCustomInvalid(false);

  const editRow = getCustomEditRow();
  const displayRow = getCustomDisplayRow();
  if (editRow) editRow.style.display = "flex";
  if (displayRow) displayRow.style.display = "none";

  const input = getCustomInput();
  if (input && prefill != null) {
    input.value = String(prefill);
  }
  input?.focus();
  input?.select?.();
}

/**
 * Switch the Custom control into its display state: the compact
 * `±{meters}m  [ Edit ]` group is shown, the editing group and hint hidden, and
 * the committed value recorded.
 */
function showCustomDisplay(meters: number): void {
  setCustomInvalid(false);

  const editRow = getCustomEditRow();
  const displayRow = getCustomDisplayRow();
  if (editRow) editRow.style.display = "none";
  if (displayRow) displayRow.style.display = "flex";

  const label = getCustomValueLabel();
  if (label) label.textContent = `±${meters}m`;

  committedMeters = meters;
}

/** Toggle the out-of-range indication on the custom input. */
function setCustomInvalid(invalid: boolean): void {
  const input = getCustomInput();
  const hint = getCustomHint();
  if (input) input.classList.toggle("invalid", invalid);
  if (hint) hint.style.display = invalid ? "block" : "none";
}

/** Persist an AccuracySetting via the background. */
async function sendAccuracy(accuracySetting: AccuracySetting): Promise<void> {
  const payload: SetAccuracyPayload = { accuracySetting };
  try {
    await browser.runtime.sendMessage({ type: "SET_ACCURACY", payload });
  } catch (error: unknown) {
    console.error("Failed to set accuracy:", error);
  }
}

/**
 * Read, validate, and (if usable) commit the Custom numeric input.
 *
 * Only a finite, in-range value commits and switches to the display state.
 * Every other entry is rejected: the input keeps the user's text, the
 * red-outline invalid indication + hint are surfaced, and the control stays in
 * the editing state so the value can be corrected (nothing is sent).
 *
 *   - Empty/blank        → invalid indication, stay editing, send nothing.
 *   - Non-finite         → invalid indication, stay editing, send nothing.
 *   - Out of range       → invalid indication, stay editing, send nothing. The
 *     value is NOT clamped/saved (the user must enter a value in `[1, 10000]`).
 *   - In range           → round to an integer, send `SET_ACCURACY` with
 *     `{ mode: "fixed", meters }`, and switch to the display state showing
 *     `±{meters}m` (Requirement 9.3).
 */
function commitCustom(): void {
  const input = getCustomInput();
  if (!input) return;

  const raw = input.value.trim();
  if (raw === "") {
    // Nothing entered yet — surface the hint, stay editing, send nothing.
    setCustomInvalid(true);
    return;
  }

  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    setCustomInvalid(true);
    return;
  }

  if (!isAccuracyMetersInRange(parsed)) {
    // Out of range — reject with the red outline + hint, keep the entered
    // value, stay editing, and send nothing (no silent clamping/saving).
    setCustomInvalid(true);
    return;
  }

  // In range — round to an integer (clampAccuracyMeters just rounds here),
  // commit, and switch to the display state.
  const meters = clampAccuracyMeters(parsed);
  void sendAccuracy({ mode: "fixed", meters });
  showCustomDisplay(meters);
}

/** Handle a change of the dropdown selection. */
function handleSelectChange(): void {
  const select = getSelect();
  if (!select) return;

  const option = select.value as AccuracyOption;

  if (option === "custom") {
    // This fires when switching TO custom from another option, so there is no
    // committed custom value yet — open the editing state pre-filled with the
    // currently-resolved accuracy (the ±Nm in effect). Sends nothing; the
    // value commits only via Set or Enter.
    showCustomEditing(lastResolvedAccuracy);
    return;
  }

  // Presets apply immediately and hide the inline Custom groups.
  hideCustom();
  const setting = optionToAccuracySetting(option);
  if (setting) void sendAccuracy(setting);
}

/**
 * Wire the accuracy control's listeners. Idempotent: guarded by a data flag so
 * repeated calls (the control's markup is static) don't stack listeners.
 */
export function initAccuracyControl(): void {
  const select = getSelect();
  if (!select || select.dataset.wired === "1") return;
  select.dataset.wired = "1";

  select.addEventListener("change", handleSelectChange);

  const input = getCustomInput();
  if (input) {
    // Clear the out-of-range indication while typing; do NOT commit here.
    input.addEventListener("input", () => setCustomInvalid(false));
    // Commit on Enter only (in addition to the Set button below).
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitCustom();
      }
    });
  }

  // The Custom value commits only via the Set button (or Enter above) —
  // never on blur or on every keystroke.
  const confirm = getCustomConfirm();
  if (confirm) {
    confirm.addEventListener("click", () => commitCustom());
  }

  // The Edit button reopens the editing state pre-filled with the committed
  // value (falling back to the resolved accuracy when nothing is committed yet).
  const editBtn = getCustomEditBtn();
  if (editBtn) {
    editBtn.addEventListener("click", () =>
      showCustomEditing(committedMeters ?? lastResolvedAccuracy)
    );
  }
}

/**
 * Restore the control's state from a stored {@link AccuracySetting}. Called
 * from `loadSettings` each time settings are (re)loaded; only sets values and
 * visibility, never persists.
 *
 * `resolvedAccuracy` is the ±Nm value currently in effect (as computed by the
 * shared Resolver); it is stored so selecting "Custom" can pre-fill the input
 * with the value the user currently sees.
 */
export function restoreAccuracyControl(
  setting: AccuracySetting | undefined | null,
  resolvedAccuracy?: number
): void {
  const select = getSelect();
  if (!select) return;

  if (typeof resolvedAccuracy === "number" && Number.isFinite(resolvedAccuracy)) {
    lastResolvedAccuracy = clampAccuracyMeters(resolvedAccuracy);
  }

  const { option, customMeters } = accuracySettingToControlState(setting ?? { mode: "auto" });

  select.value = option;
  setCustomInvalid(false);

  if (option === "custom" && customMeters !== null) {
    // Stored fixed setting — already committed, so open directly in the display
    // state showing ±{meters}m. Do NOT open the editor.
    showCustomDisplay(customMeters);
  } else {
    // Preset (or fallback) — hide the inline Custom groups.
    hideCustom();
  }
}
