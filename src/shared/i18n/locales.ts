/**
 * Supported popup UI locales — the single source of truth shared by the popup
 * (language picker + override loader in src/popup/i18n.ts) and the background
 * settings validator (src/background/settings.ts).
 *
 * `code` is the `_locales/<code>/messages.json` directory name, using the
 * WebExtension convention of underscore region tags (e.g. `pt_BR`, `zh_CN`).
 * `endonym` is the language's own name, shown verbatim in the picker and
 * intentionally never translated (a Russian option reads "Русский" in every
 * UI language).
 *
 * Keep this list in sync with the directories under `_locales/`. The
 * locale-parity unit test guards message-key parity; this constant governs
 * which locales the popup actually offers as an override.
 */
export interface SupportedLocale {
  /** `_locales/<code>` directory name (WebExtension locale code). */
  code: string;
  /** The language's own name, displayed as-is in the picker. */
  endonym: string;
}

export const SUPPORTED_UI_LOCALES: readonly SupportedLocale[] = [
  { code: "en", endonym: "English" },
  { code: "de", endonym: "Deutsch" },
  { code: "es", endonym: "Español" },
  { code: "fr", endonym: "Français" },
  { code: "id", endonym: "Bahasa Indonesia" },
  { code: "ja", endonym: "日本語" },
  { code: "nl", endonym: "Nederlands" },
  { code: "pt_BR", endonym: "Português (Brasil)" },
  { code: "ru", endonym: "Русский" },
  { code: "sv", endonym: "Svenska" },
  { code: "vi", endonym: "Tiếng Việt" },
  { code: "zh_CN", endonym: "简体中文" },
] as const;

const LOCALE_CODES: readonly string[] = SUPPORTED_UI_LOCALES.map((l) => l.code);

/** Whether `code` is a supported `_locales` directory code. */
export function isSupportedLocale(code: string): boolean {
  return LOCALE_CODES.includes(code);
}

/**
 * Map an arbitrary language tag (e.g. `"pt-BR"`, `"en_US"`, `"ru"`,
 * `"zh-Hans-CN"`) to a supported `_locales` code, or `null` when none applies.
 *
 * Tries a region-qualified match first (so `"pt-BR"` → `"pt_BR"`), then falls
 * back to the base language (so `"pt"` and `"pt-PT"` also resolve to `"pt_BR"`,
 * the only Portuguese we ship). Case- and separator-insensitive.
 */
export function normalizeToSupportedLocale(tag: string | null | undefined): string | null {
  if (!tag) return null;

  // Canonicalize to the `_locales` separator/casing space: "pt-BR" -> "pt_br".
  const canonical = tag.replace(/-/g, "_").toLowerCase();

  const exact = LOCALE_CODES.find((code) => code.toLowerCase() === canonical);
  if (exact) return exact;

  // Base-language fallback: compare the primary subtag on both sides so
  // "en_US" -> "en", "zh_hans_cn" -> "zh" -> "zh_CN".
  const base = canonical.split("_")[0];
  return LOCALE_CODES.find((code) => code.toLowerCase().split("_")[0] === base) ?? null;
}

/**
 * Resolve the effective popup UI locale. An explicit, still-supported user
 * override wins; otherwise fall back to the browser UI language; otherwise
 * English. Always returns a supported code.
 *
 * @param override    The user's stored `uiLanguage` (`""`/unset means "follow
 *                    the browser").
 * @param browserTag  The browser UI language (e.g. `browser.i18n.getUILanguage()`).
 */
export function resolveUiLocale(
  override: string | null | undefined,
  browserTag: string | null | undefined
): string {
  return normalizeToSupportedLocale(override) ?? normalizeToSupportedLocale(browserTag) ?? "en";
}
