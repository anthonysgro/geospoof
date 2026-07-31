/**
 * Popup Reported Language control (Advanced accordion, Details tab).
 *
 * Lets the user choose what language websites see. Maps a three-option dropdown
 * onto the {@link LocaleSpoofing} model and persists via `SET_LOCALE_SPOOFING`:
 *
 *   - "Off"               → { mode: "off" }    (default; report the real locale)
 *   - "Match my location" → { mode: "match" }  (derive from the spoofed location)
 *   - "Choose language…"  → { mode: "custom", locale } (revealed text input)
 *
 * NOT the same thing as the "Language" selector further down the accordion, which
 * is `Settings.uiLanguage` and controls GeoSpoof's OWN popup language. This one
 * changes what sites see. The label is "Reported Language" specifically so the
 * two can't be confused.
 *
 * The Custom control reuses the accuracy control's proven edit/display pattern,
 * because it solves the same problem (a preset dropdown revealing a validated
 * free-form value) in the same 350px width:
 *
 *   - Editing state — `[ tag input ][ Set ]`. Commits ONLY on Set or Enter,
 *     never on blur or keystroke. A tag that is malformed or that this engine
 *     has no data for is REJECTED: the input keeps the text, the red outline and
 *     hint appear, and nothing is sent.
 *   - Display state — the committed tag (with a human label when it's one of the
 *     suggestions) plus an Edit button.
 *
 * Why validation is strict rather than best-effort: silently accepting a tag the
 * engine can't honor would leave the user believing a language is applied while
 * ICU quietly formats with a fallback — and `navigator.language` would then
 * contradict the actual formatting behavior, which is the exact inconsistency
 * this feature exists to avoid. Rejecting loudly is the safer failure.
 *
 * The pure mapping helpers are exported so they can be unit-tested without a DOM.
 */

import type { LocaleSpoofing } from "@/shared/types/settings";
import type { Message, SetLocaleSpoofingPayload } from "@/shared/types/messages";
import { canonicalizeTag, engineSupportsLocale } from "@/shared/locale/resolver";
import { LOCALE_SUGGESTIONS, labelForTag } from "./locale-suggestions";

/** The dropdown options, matching the `value` attributes in popup.html. */
export type LocaleOption = "off" | "match" | "custom";

// ── Pure mapping helpers ─────────────────────────────────────────────────────

/**
 * Map a selected option (plus the typed tag when the option is "custom") onto a
 * {@link LocaleSpoofing}.
 *
 * Returns `null` for "custom" with an unusable tag so the caller can withhold
 * the save and surface the hint instead of persisting something that wouldn't
 * take effect.
 */
export function optionToLocaleSpoofing(
  option: LocaleOption,
  customTag?: string
): LocaleSpoofing | null {
  switch (option) {
    case "match":
      return { mode: "match" };
    case "custom": {
      if (!customTag) return null;
      const canonical = canonicalizeTag(customTag.trim());
      if (!canonical || !engineSupportsLocale(canonical)) return null;
      return { mode: "custom", locale: canonical };
    }
    case "off":
    default:
      return { mode: "off" };
  }
}

/**
 * Reverse mapping used to restore the control from a stored
 * {@link LocaleSpoofing}. Anything unrecognized falls back to "off", which is
 * both the default and the safe direction.
 */
export function localeSpoofingToControlState(setting: LocaleSpoofing | undefined | null): {
  option: LocaleOption;
  customTag: string | null;
} {
  if (!setting) return { option: "off", customTag: null };
  switch (setting.mode) {
    case "match":
      return { option: "match", customTag: null };
    case "custom":
      return { option: "custom", customTag: setting.locale };
    case "off":
    default:
      return { option: "off", customTag: null };
  }
}

/**
 * Whether a raw typed tag is usable: well-formed BCP47 AND supported by this
 * engine's locale data.
 */
export function isUsableLocaleTag(raw: string): boolean {
  const canonical = canonicalizeTag(raw.trim());
  return canonical !== null && engineSupportsLocale(canonical);
}

/** Display text for a committed tag: the tag, plus a human label when known. */
export function describeTag(tag: string): string {
  const label = labelForTag(tag);
  return label ? `${tag} — ${label}` : tag;
}

// ── DOM wiring ───────────────────────────────────────────────────────────────

/** The last committed custom tag this popup session, for pre-filling Edit. */
let committedTag: string | null = null;

function getSelect(): HTMLSelectElement | null {
  return document.getElementById("localeSelect") as HTMLSelectElement | null;
}

function getInput(): HTMLInputElement | null {
  return document.getElementById("localeCustomInput") as HTMLInputElement | null;
}

function getEditRow(): HTMLElement | null {
  return document.getElementById("localeCustomEdit");
}

function getDisplayRow(): HTMLElement | null {
  return document.getElementById("localeCustomDisplay");
}

function getValueLabel(): HTMLElement | null {
  return document.getElementById("localeCustomValue");
}

function getHint(): HTMLElement | null {
  return document.getElementById("localeCustomHint");
}

function getWarning(): HTMLElement | null {
  return document.getElementById("localeWarning");
}

/** Toggle the invalid indication on the tag input. */
function setInvalid(invalid: boolean): void {
  const input = getInput();
  const hint = getHint();
  if (input) input.classList.toggle("invalid", invalid);
  if (hint) hint.style.display = invalid ? "block" : "none";
}

/** Hide both custom rows (used for the Off / Match options). */
function hideCustom(): void {
  const editRow = getEditRow();
  const displayRow = getDisplayRow();
  if (editRow) editRow.style.display = "none";
  if (displayRow) displayRow.style.display = "none";
  setInvalid(false);
}

/** Show the editing row, optionally pre-filled, focused and selected. */
function showEditing(prefill: string | null): void {
  setInvalid(false);
  const editRow = getEditRow();
  const displayRow = getDisplayRow();
  if (editRow) editRow.style.display = "flex";
  if (displayRow) displayRow.style.display = "none";

  const input = getInput();
  if (input && prefill) input.value = prefill;
  input?.focus();
  input?.select?.();
}

/** Show the compact display row for a committed tag. */
function showDisplay(tag: string): void {
  setInvalid(false);
  const editRow = getEditRow();
  const displayRow = getDisplayRow();
  if (editRow) editRow.style.display = "none";
  if (displayRow) displayRow.style.display = "flex";

  const label = getValueLabel();
  if (label) label.textContent = describeTag(tag);

  committedTag = tag;
}

/**
 * Show the consequence warning only while a language is actually being reported.
 * There is nothing to warn about in Off mode, and an always-visible warning
 * would be noise the user learns to ignore.
 */
function setWarningVisible(visible: boolean): void {
  const warning = getWarning();
  if (warning) warning.style.display = visible ? "block" : "none";
}

/**
 * Populate the `<datalist>` from the shared suggestion list. Idempotent.
 *
 * Both the English name and the endonym go into the option text so a datalist
 * substring match finds an entry from either — someone typing "French" and
 * someone typing "Français" both land on `fr-FR`.
 */
function populateSuggestions(): void {
  const list = document.getElementById("localeSuggestions");
  if (!list || list.dataset.populated === "true") return;

  for (const suggestion of LOCALE_SUGGESTIONS) {
    const option = document.createElement("option");
    option.value = suggestion.tag;
    option.textContent =
      suggestion.english === suggestion.endonym
        ? suggestion.english
        : `${suggestion.english} — ${suggestion.endonym}`;
    list.appendChild(option);
  }
  list.dataset.populated = "true";
}

/** Persist a LocaleSpoofing via the background. */
async function sendLocaleSpoofing(setting: LocaleSpoofing): Promise<void> {
  const message: Message<SetLocaleSpoofingPayload> = {
    type: "SET_LOCALE_SPOOFING",
    payload: { localeSpoofing: setting },
  };
  try {
    await browser.runtime.sendMessage(message);
  } catch (error: unknown) {
    console.error("Failed to set reported language:", error);
  }
}

/**
 * Read, validate, and (if usable) commit the typed tag.
 *
 * Rejects rather than coerces: an empty, malformed, or engine-unsupported tag
 * keeps the editing state, shows the hint, and sends nothing.
 */
function commitCustom(): void {
  const input = getInput();
  if (!input) return;

  const raw = input.value.trim();
  if (raw === "") {
    setInvalid(true);
    return;
  }

  const setting = optionToLocaleSpoofing("custom", raw);
  if (!setting || setting.mode !== "custom") {
    // Malformed, or this engine has no data for it — surface the hint and keep
    // the text so it can be corrected.
    setInvalid(true);
    return;
  }

  void sendLocaleSpoofing(setting);
  showDisplay(setting.locale);
  setWarningVisible(true);
}

/** Handle a change of the dropdown selection. */
function handleSelectChange(): void {
  const select = getSelect();
  if (!select) return;

  const option = select.value as LocaleOption;

  if (option === "custom") {
    // Switching TO custom: open the editor pre-filled with whatever was
    // committed before (if anything) and send nothing — the value commits only
    // via Set or Enter.
    showEditing(committedTag);
    // The warning stays hidden until a tag is actually committed, since nothing
    // is being reported yet.
    setWarningVisible(false);
    return;
  }

  hideCustom();
  const setting = optionToLocaleSpoofing(option);
  if (setting) void sendLocaleSpoofing(setting);
  setWarningVisible(option === "match");
}

/**
 * Wire the control's listeners. Idempotent: guarded by a data flag so repeated
 * calls (the markup is static) don't stack listeners.
 */
export function initLocaleControl(): void {
  populateSuggestions();

  const select = getSelect();
  if (!select || select.dataset.wired === "1") return;
  select.dataset.wired = "1";

  select.addEventListener("change", handleSelectChange);

  const input = getInput();
  if (input) {
    // Clear the invalid indication while typing; never commit here.
    input.addEventListener("input", () => setInvalid(false));
    input.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Enter") {
        e.preventDefault();
        commitCustom();
      }
    });
  }

  document.getElementById("localeCustomConfirm")?.addEventListener("click", () => commitCustom());
  document
    .getElementById("localeCustomEditBtn")
    ?.addEventListener("click", () => showEditing(committedTag));
}

/**
 * Enable/disable the control for the Pro gate. The background independently
 * forces `off` for a non-entitled user, so this is UI clarity only.
 */
function applyLocaleLock(locked: boolean): void {
  const select = getSelect();
  if (select) select.disabled = locked;

  const input = getInput();
  if (input) input.disabled = locked;

  for (const id of ["localeCustomConfirm", "localeCustomEditBtn"]) {
    const btn = document.getElementById(id) as HTMLButtonElement | null;
    if (btn) btn.disabled = locked;
  }

  const note = document.getElementById("localeProNote");
  if (note) note.style.display = locked ? "block" : "none";
}

/**
 * Restore the control from stored settings. Called from `loadSettings` on every
 * settings (re)load; only sets values and visibility, never persists.
 *
 * `proLocked` (a non-entitled Safari user) disables the control and forces
 * "Off", matching what the background enforces.
 */
export function restoreLocaleControl(
  setting: LocaleSpoofing | undefined | null,
  proLocked = false
): void {
  const select = getSelect();
  if (!select) return;

  populateSuggestions();
  applyLocaleLock(proLocked);

  if (proLocked) {
    select.value = "off";
    hideCustom();
    setWarningVisible(false);
    return;
  }

  const { option, customTag } = localeSpoofingToControlState(setting);
  select.value = option;
  setInvalid(false);

  if (option === "custom" && customTag) {
    // Already committed — open directly in the display state, not the editor.
    showDisplay(customTag);
  } else {
    hideCustom();
  }

  setWarningVisible(option !== "off");
}
