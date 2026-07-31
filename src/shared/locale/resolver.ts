/**
 * Locale_Resolver — the single source of truth for the Reported Language.
 *
 * Every locale-bearing surface derives from ONE invocation of this module:
 * the injected `navigator` / `Intl` / `toLocale*` overrides, and the
 * `Accept-Language` request header. That is deliberate. If the JS-reported
 * language and the HTTP header disagreed, we would have *created* a
 * fingerprinting signal that is worse than not spoofing at all — a browser
 * claiming `fr-FR` in script while sending `Accept-Language: en-US` is
 * obviously tampered with, whereas an untouched English browser in Paris is
 * merely a plausible expat. Resolving in one place makes that class of bug
 * structurally impossible rather than a convention to remember.
 *
 * Everything here is pure and dependency-free apart from the host engine's own
 * `Intl`, so the background, the popup, and the tests all share one
 * implementation.
 *
 * FAIL-CLOSED CONTRACT: `resolveLocale` returns `null` to mean "report the
 * user's real locale". There is no partial-spoof state. A missing timezone, an
 * unmapped zone, or a tag the engine has no data for all resolve to `null`
 * rather than to a half-applied locale, because a half-applied locale is
 * exactly the inconsistency this feature exists to avoid.
 */

import type { LocaleSpoofing } from "@/shared/types/settings";
import { DEFAULT_LOCALE_SPOOFING } from "@/shared/types/settings";
import { countryForTimezone } from "./zone-country";
import { localeForCountry } from "./country-locale";

/**
 * A fully-derived locale, ready to hand to both the page world and the header
 * rewriter. Produced only via {@link resolveLocale} so the three fields are
 * always mutually consistent.
 */
export interface ResolvedLocale {
  /** Canonical BCP47 tag. Equals `navigator.language` and `languages[0]`. */
  tag: string;
  /** Value for `navigator.languages`: the tag plus its bare primary subtag. */
  languages: readonly string[];
  /** `Accept-Language` header value, shaped for the host engine. */
  acceptLanguage: string;
}

/**
 * The page-bound projection of a {@link ResolvedLocale}.
 *
 * Deliberately omits `acceptLanguage`: the header is rewritten in the
 * background, so shipping its value into the page world would hand a site a
 * string it has no business reading from script. The page gets only what it
 * needs to answer `navigator.language` / `navigator.languages` and to seed the
 * `Intl` defaults.
 */
export interface SpoofedLocalePayload {
  tag: string;
  languages: string[];
}

// ── Tag helpers ──────────────────────────────────────────────────────────────

/**
 * Canonicalize a BCP47 tag, or return `null` when it is not well-formed.
 *
 * `Intl.getCanonicalLocales` throws a `RangeError` for a structurally invalid
 * tag, which is precisely the validation we want — no hand-rolled grammar.
 */
export function canonicalizeTag(value: string): string | null {
  try {
    const [canonical] = Intl.getCanonicalLocales(value);
    return canonical ?? null;
  } catch {
    // RangeError (malformed) or any engine quirk — treat as invalid.
    return null;
  }
}

/**
 * The primary language subtag of a tag (`fr-FR` -> `fr`).
 *
 * Prefers `Intl.Locale`, falling back to a textual split so a very old engine
 * without `Intl.Locale` still degrades to correct behavior rather than throwing.
 */
function primarySubtag(tag: string): string {
  try {
    const language = new Intl.Locale(tag).language;
    if (language) return language;
  } catch {
    /* fall through to the textual path */
  }
  const dash = tag.indexOf("-");
  return dash === -1 ? tag : tag.slice(0, dash);
}

/**
 * Whether the host engine can genuinely format in `tag`.
 *
 * Checked by asking the engine to resolve the tag and confirming the language
 * subtag survived. `supportedLocalesOf` is a weaker test: with the default
 * "best fit" matcher an engine may report a tag as supported and then quietly
 * format using a fallback locale. That silent fallback is the failure mode we
 * care about — it would make `navigator.language` claim a language that the
 * formatting behavior contradicts — so we test the thing we actually depend on.
 */
export function engineSupportsLocale(tag: string): boolean {
  try {
    const resolved = new Intl.DateTimeFormat(tag).resolvedOptions().locale;
    return primarySubtag(resolved) === primarySubtag(tag);
  } catch {
    return false;
  }
}

// ── Accept-Language shaping ──────────────────────────────────────────────────

/**
 * The rendering engine whose locale conventions we imitate.
 *
 * Not cosmetic: the shape of what a browser advertises differs per engine, and
 * emitting the wrong engine's shape is itself a fingerprinting tell — the header
 * would contradict the engine the rest of the fingerprint says we are.
 */
export type LocaleEngine = "gecko" | "blink" | "webkit";

/** The engine of the current build. */
export function localeEngine(): LocaleEngine {
  if (__FIREFOX__) return "gecko";
  if (__SAFARI__) return "webkit";
  return "blink";
}

/**
 * Build the language list to advertise, given the single locale the user chose.
 *
 * Engines differ in *how many* entries they expose, which matters as much as the
 * q values — per
 * [MDN](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Accept-Language):
 *
 *   - Chrome and Safari "add language-only fallback tags", e.g.
 *     `en-US,en;q=0.9,zh-CN;q=0.8,zh;q=0.7` for `["en-US", "zh-CN"]`.
 *   - "For privacy purposes (reducing fingerprinting), both Accept-Language and
 *     navigator.languages may not include the full list of user preferences. For
 *     example, in **Safari (always)** and Chrome's incognito mode, only one
 *     language is listed."
 *
 * So Safari advertises exactly ONE tag, while Gecko and Blink advertise the
 * region-qualified tag plus its bare-language fallback. Emitting two entries on
 * Safari would be a giveaway on its own, independent of any q value.
 *
 * Deduplicated, so a language-only choice like `ja` yields `["ja"]` rather than
 * `["ja", "ja"]`.
 */
export function buildLanguageList(tag: string, engine: LocaleEngine = localeEngine()): string[] {
  if (engine === "webkit") return [tag];
  const primary = primarySubtag(tag);
  return primary && primary !== tag ? [tag, primary] : [tag];
}

/**
 * Build the `Accept-Language` header value for a language list.
 *
 * Per-engine q conventions, both VERIFIED against live browsers (spec task 3.2)
 * using `scripts/check-accept-language.mjs`, and corroborated upstream:
 *
 *   - **Gecko** distributes q evenly across the list: the i-th of n entries gets
 *     `1 - i/n` to one decimal, so two entries give `fr-FR,fr;q=0.5`. Confirmed
 *     by capture, and by the Mozilla bug titled "Firefox uses q=0.5 in
 *     Accept-Language header (with two language options), while other browsers
 *     use 0.9" (bugzilla 2000765).
 *   - **Blink** steps down by a flat 0.1: `en-US,en;q=0.9`. Confirmed by capture.
 *   - **WebKit** only ever advertises one language (see
 *     {@link buildLanguageList}), so no q is emitted at all — the leading entry
 *     never carries an explicit q, since it defaults to 1.
 *
 * The conventions coincide at a single entry and diverge at two, which is
 * exactly the shape this resolver emits — so the 2-entry case is the one that
 * had to be measured, and was.
 *
 * Also worth knowing before "fixing" a perceived inconsistency: in Firefox the
 * `Accept-Language` preference (`intl.accept_languages`) is INDEPENDENT of the
 * browser UI locale that `navigator.language` follows. A real, untampered
 * Firefox can therefore send `Accept-Language: fr-FR` while reporting
 * `navigator.language === "en-US"`. Those two disagreeing is not inherently
 * anomalous in the wild; it is the opposite direction — claiming a locale in
 * script that the header contradicts — that reads as tampering. GeoSpoof aligns
 * both anyway, because presenting one coherent identity is the point.
 *
 * `tests/property/locale-resolver.property.test.ts` ("Property 4") pins these
 * exact strings, so an engine changing its convention surfaces as a test failure
 * rather than a silent fingerprint regression.
 */
export function buildAcceptLanguage(
  languages: readonly string[],
  engine: LocaleEngine = localeEngine()
): string {
  if (languages.length === 0) return "";

  const n = languages.length;
  return languages
    .map((tag, i) => {
      if (i === 0) return tag;
      const q = engine === "gecko" ? 1 - i / n : 1 - i * 0.1;
      // One decimal place, clamped into (0, 1) — a q of 0 would mean
      // "unacceptable", which is not what a preference list expresses.
      const clamped = Math.min(0.9, Math.max(0.1, Math.round(q * 10) / 10));
      return `${tag};q=${clamped.toFixed(1)}`;
    })
    .join(",");
}

// ── Resolution ───────────────────────────────────────────────────────────────

/**
 * Build a {@link ResolvedLocale} from a single canonical tag, or `null` when the
 * engine cannot honor it.
 *
 * `languages` is engine-shaped (see {@link buildLanguageList}): the tag plus its
 * bare primary subtag on Gecko/Blink, and the tag alone on WebKit, which only
 * ever advertises one language. Critically it contains nothing from the user's
 * real language list, so enabling the feature cannot leak the original preference
 * through a fallback entry.
 */
function buildResolved(tag: string): ResolvedLocale | null {
  if (!engineSupportsLocale(tag)) return null;

  // Engine-appropriate list length AND q convention, from the one place that
  // knows both — so `navigator.languages` and the header can never advertise
  // different lists.
  const languages = buildLanguageList(tag);

  return {
    tag,
    languages,
    acceptLanguage: buildAcceptLanguage(languages),
  };
}

/**
 * Resolve the effective Reported Language.
 *
 * Pure: the same `(setting, timezoneIdentifier)` always yields the same result,
 * so the two background payload builders, the Firefox document_start bootstrap,
 * and the header rewriter cannot drift apart.
 *
 * @param setting the user's stored (and already Pro-gated) preference
 * @param timezoneIdentifier the spoofed IANA zone, or `null` when none is set
 * @returns the resolved locale, or `null` meaning "report the real locale"
 */
export function resolveLocale(
  setting: LocaleSpoofing,
  timezoneIdentifier: string | null
): ResolvedLocale | null {
  // Defensive: callers pass an already-validated setting, but this function runs
  // inside the per-tab payload builders, where a throw would break settings
  // delivery for the whole tab. A hand-edited storage value or a malformed
  // bridge payload must degrade to "report the real locale", not explode.
  if (!setting || typeof setting !== "object") return null;

  switch (setting.mode) {
    case "off":
      return null;

    case "custom": {
      if (typeof setting.locale !== "string") return null;
      const canonical = canonicalizeTag(setting.locale);
      return canonical ? buildResolved(canonical) : null;
    }

    case "match": {
      // No spoofed timezone means no location to derive from. Note that
      // `handleSetLocation` deliberately persists `null` rather than a
      // longitude-estimated fallback zone, so this is a real and reachable
      // state, not just a first-run one.
      if (!timezoneIdentifier || typeof timezoneIdentifier !== "string") return null;

      const country = countryForTimezone(timezoneIdentifier);
      if (!country) return null;

      const tag = localeForCountry(country);
      if (!tag) return null;

      const canonical = canonicalizeTag(tag);
      return canonical ? buildResolved(canonical) : null;
    }

    default:
      // Unreachable for a validated setting; belt-and-braces for a hand-edited
      // storage value that slipped past validation.
      return null;
  }
}

/**
 * Resolve the page-bound locale for a tab payload: Pro gate, then resolve, then
 * project to the page-safe shape.
 *
 * This exists so the two Payload_Builders (`sendSettingsToTab` and the
 * `GET_SETTINGS` content-script branch) and the Firefox document_start bootstrap
 * all call ONE function. Requirement 12.4 demands a freshly-injected content
 * script and a live one see the same locale; sharing this entry point makes that
 * structural rather than a thing three call sites have to remember.
 *
 * Note the locale is delivered regardless of the tab's `enabled` decision,
 * exactly as `timezone` already is — the injected overrides gate on
 * `spoofingEnabled`, so an out-of-scope tab receives the value and ignores it.
 *
 * @returns the page-bound locale, or `null` to leave the real locale alone
 */
export function resolvePageLocale(
  localeSpoofing: LocaleSpoofing,
  timezoneIdentifier: string | null,
  proFeaturesBlocked?: boolean
): SpoofedLocalePayload | null {
  const effective = computeEffectiveLocaleSpoofing(localeSpoofing, proFeaturesBlocked);
  const resolved = resolveLocale(effective, timezoneIdentifier);
  if (!resolved) return null;
  return { tag: resolved.tag, languages: [...resolved.languages] };
}

// ── Validation ───────────────────────────────────────────────────────────────

/**
 * Repair an arbitrary stored value into a valid {@link LocaleSpoofing}.
 *
 * Total and non-throwing, mirroring `validateAccuracySetting` /
 * `validateLocationPrecision`. Everything unrecognized collapses to
 * `{ mode: "off" }` — the safe direction, since "off" reports the real locale
 * rather than a partially-applied one.
 *
 * A `custom` tag is canonicalized and checked against the host engine's locale
 * data; a malformed or unsupported tag repairs the whole setting to `off`
 * instead of being silently kept, because keeping it would leave the user
 * believing a locale is applied while pages see their real one.
 *
 * This lives beside the resolver rather than in `background/settings.ts` because
 * the popup and the Safari app bridge validate through it too; there must be
 * exactly one repair path. `background/settings.ts` re-exports it so its
 * validation wiring reads consistently with the other settings validators.
 */
export function validateLocaleSpoofing(value: unknown): LocaleSpoofing {
  if (!value || typeof value !== "object") {
    return { mode: "off" };
  }

  const setting = value as { mode?: unknown; locale?: unknown };

  switch (setting.mode) {
    case "off":
      return { mode: "off" };

    case "match":
      return { mode: "match" };

    case "custom": {
      if (typeof setting.locale !== "string" || setting.locale.trim() === "") {
        return { mode: "off" };
      }
      const canonical = canonicalizeTag(setting.locale.trim());
      if (!canonical || !engineSupportsLocale(canonical)) {
        return { mode: "off" };
      }
      return { mode: "custom", locale: canonical };
    }

    default:
      return { mode: "off" };
  }
}

/**
 * Safari Pro gate for locale spoofing.
 *
 * When the containing app signals `proFeaturesBlocked` (a user without a Pro
 * entitlement), the effective setting is forced to `off` so the page world and
 * the outgoing headers are never locale-spoofed, regardless of how the stored
 * value got there (the app, the popup, or a lapsed subscription).
 *
 * Optional + fail-open: `undefined`/`false` leaves the setting untouched, and
 * the `__SAFARI__` guard compiles the gate out of the Chromium and Firefox
 * builds. Mirrors `computeEffectiveLocationPrecision` and must be applied at
 * EVERY page-bound payload builder and at the header-rule builder.
 *
 * Covers iOS and macOS Safari alike through the shared `proFeaturesBlocked`
 * signal. NOTE: the macOS app currently always reports `false`, so macOS is
 * effectively ungated until that app-side change ships (tracked separately).
 */
export function computeEffectiveLocaleSpoofing(
  setting: LocaleSpoofing,
  proFeaturesBlocked?: boolean
): LocaleSpoofing {
  if (__SAFARI__ && proFeaturesBlocked === true) {
    return DEFAULT_LOCALE_SPOOFING;
  }
  return setting;
}
