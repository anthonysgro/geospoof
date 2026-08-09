/**
 * Regression: every `Intl` constructor must report the SAME `resolvedOptions().locale`.
 *
 * This is the exact check arkenfox TZP performs. Its `get_language_locale()`
 * collects `resolvedOptions().locale` from nine constructors — Collator,
 * DateTimeFormat, DisplayNames, DurationFormat, ListFormat, NumberFormat,
 * PluralRules, RelativeTimeFormat, Segmenter — dedupes them, and reports
 * `locale: mixed` as a detected LIE when more than one distinct value survives.
 *
 * Why injecting a tag broke it: ECMA-402 `ResolveLocale` takes a different branch
 * depending on whether the caller requested a locale.
 *
 *   - Nothing requested → the matcher finds no candidate and the spec falls back
 *     to `DefaultLocale()`, reported VERBATIM with no availability lookup. So a
 *     real browser whose default locale is `ja-JP` reports `ja-JP` from all nine.
 *   - A tag requested → `BestAvailableLocale` strips trailing subtags until it
 *     hits a bundle in *that service's* available-locale set. Collation and
 *     plural-rules data are keyed by language, so `ja-JP` collapses to `ja` for
 *     Collator and PluralRules while NumberFormat and friends keep `ja-JP`.
 *
 * Substituting the spoofed tag turned the first branch into the second, so the
 * nine values disagreed — for 236 of the 247 tags `COUNTRY_LOCALE` can produce.
 * A browser cannot disagree with itself this way, which is exactly why TZP
 * flags it.
 *
 * The suite installs onto a synthetic realm holding copies of the native
 * constructors, so the global `Intl` is untouched and no other test is affected.
 */
import { describe, test, expect, beforeAll } from "vitest";

/** The tag under test. Region-qualified, like every tag `COUNTRY_LOCALE` yields. */
const TAG = "ja-JP";

type IntlLike = Record<string, unknown>;

/**
 * The nine probes TZP runs, expressed the same way it expresses them — including
 * the explicit `undefined` first argument for `DisplayNames`, which the spec
 * treats as "caller passed nothing" just like omitting it.
 */
const PROBES: Record<string, (intl: IntlLike) => string> = {
  collator: (i) => call(i, "Collator"),
  datetimeformat: (i) => call(i, "DateTimeFormat"),
  displaynames: (i) => call(i, "DisplayNames", { type: "region" }),
  durationformat: (i) => call(i, "DurationFormat"),
  listformat: (i) => call(i, "ListFormat"),
  numberformat: (i) => call(i, "NumberFormat"),
  pluralrules: (i) => call(i, "PluralRules"),
  relativetimeformat: (i) => call(i, "RelativeTimeFormat"),
  segmenter: (i) => call(i, "Segmenter"),
};

function call(intl: IntlLike, name: string, options?: unknown): string {
  const Ctor = intl[name] as new (l?: unknown, o?: unknown) => { resolvedOptions: () => unknown };
  const resolved = new Ctor(undefined, options).resolvedOptions() as { locale: string };
  return resolved.locale;
}

/** Constructors implemented by the host engine, so the suite degrades rather than fails. */
function availableProbes(intl: IntlLike): string[] {
  return Object.keys(PROBES).filter((k) => {
    const name = Object.keys(intl).find((n) => n.toLowerCase() === k);
    return name !== undefined && typeof intl[name] === "function";
  });
}

/** Build a realm carrying copies of the natives, with locale + timezone installed. */
async function buildRealm(): Promise<IntlLike> {
  const intl: IntlLike = {};
  for (const name of [
    "Collator",
    "DateTimeFormat",
    "DisplayNames",
    "DurationFormat",
    "ListFormat",
    "NumberFormat",
    "PluralRules",
    "RelativeTimeFormat",
    "Segmenter",
  ]) {
    const native = (Intl as unknown as IntlLike)[name];
    if (typeof native === "function") intl[name] = native;
  }

  const { installLocaleOverridesOn } = await import("@/content/injected/locale-overrides");
  const { installDateTimeFormatOverridesOn } =
    await import("@/content/injected/timezone-overrides");
  // Only `Intl` is supplied, so the installer cannot reach this process's real
  // Navigator or primitive prototypes.
  installLocaleOverridesOn({ Intl: intl } as unknown as Window & typeof globalThis);
  // DateTimeFormat's locale injection lives in the timezone wrapper, so the
  // agreement check is only meaningful with both installed — mirroring the real
  // init order in `index.ts`.
  installDateTimeFormatOverridesOn(intl as unknown as typeof Intl);
  return intl;
}

let realmIntl: IntlLike;

beforeAll(async () => {
  // `state.ts` captures navigator.geolocation at import time and jsdom has none.
  if (!("geolocation" in navigator)) {
    Object.defineProperty(navigator, "geolocation", {
      value: {
        getCurrentPosition: () => undefined,
        watchPosition: () => 0,
        clearWatch: () => undefined,
      },
      configurable: true,
    });
  }
  const { setSpoofingEnabled, setLocaleData, setSettingsReceived } =
    await import("@/content/injected/state");
  setSettingsReceived(true);
  setSpoofingEnabled(true);
  setLocaleData({ tag: TAG, languages: [TAG, "ja"] });
  realmIntl = await buildRealm();
});

describe("resolvedOptions().locale agrees across every Intl constructor", () => {
  test("the natives really do disagree for this tag (guards a vacuous suite)", () => {
    // If ICU ever stopped truncating, the regression under test would be
    // unreproducible and the assertions below would pass trivially. Assert the
    // precondition so that becomes a visible signal rather than silent rot.
    const nativeValues = new Set<string>();
    for (const name of ["Collator", "PluralRules", "NumberFormat"]) {
      const Ctor = (Intl as unknown as IntlLike)[name] as new (l: string) => {
        resolvedOptions: () => { locale: string };
      };
      nativeValues.add(new Ctor(TAG).resolvedOptions().locale);
    }
    expect(nativeValues.size, `explicitly requesting ${TAG} should truncate somewhere`).toBe(2);
  });

  test("all nine report the spoofed tag — TZP's dedupe yields one value", () => {
    const probes = availableProbes(realmIntl);
    expect(probes.length).toBeGreaterThan(1);

    const reported: Record<string, string> = {};
    for (const key of probes) reported[key] = PROBES[key](realmIntl);

    // TZP's own reduction: dedupe, and anything but a single value is "mixed".
    const distinct = [...new Set(Object.values(reported))];
    expect(distinct, JSON.stringify(reported)).toEqual([TAG]);
  });

  // Regression: `[]` is NOT an explicit request. ECMA-402 CanonicalizeLocaleList
  // builds a list, and an empty list selects the default locale — so `[]`,
  // `{length:0}` and a `Set` all mean exactly what `undefined` means. Gating
  // injection on `undefined` alone leaked the REAL locale through every one of
  // them. TZP hits this directly: `get_locale_intl` passes `[]` for DisplayNames
  // (`let locIntl = undefined == locTest ? [] : locTest`), which is what made its
  // locale cross-check fail while the nine-constructor agreement check passed.
  test("empty array-likes are default requests, not explicit ones", () => {
    if (typeof realmIntl.DisplayNames !== "function") return;
    const DisplayNames = realmIntl.DisplayNames as new (
      l: unknown,
      o: unknown
    ) => { of: (c: string) => string; resolvedOptions: () => { locale: string } };

    const expected = new Intl.DisplayNames(TAG, { type: "region" }).of("US");
    for (const form of [undefined, [], { length: 0 }, new Set(["ignored"])]) {
      const instance = new DisplayNames(form, { type: "region" });
      expect(instance.of("US"), `locales = ${JSON.stringify(form)}`).toBe(expected);
      expect(instance.resolvedOptions().locale).toBe(TAG);
    }
  });

  test("a non-empty array is still an explicit request", () => {
    if (typeof realmIntl.NumberFormat !== "function") return;
    const NumberFormat = realmIntl.NumberFormat as new (l: unknown) => {
      resolvedOptions: () => { locale: string };
    };
    expect(new NumberFormat(["de-DE"]).resolvedOptions().locale).toBe("de-DE");
  });

  test("an Intl.Locale instance is an explicit request despite having no length", () => {
    // It carries [[InitializedLocale]] and counts as one tag, so treating it as
    // an empty array-like would silently override a deliberate choice.
    if (typeof realmIntl.NumberFormat !== "function" || typeof Intl.Locale !== "function") return;
    const NumberFormat = realmIntl.NumberFormat as new (l: unknown) => {
      resolvedOptions: () => { locale: string };
    };
    expect(new NumberFormat(new Intl.Locale("de-DE")).resolvedOptions().locale).toBe("de-DE");
  });

  test("an explicit caller locale still reports the engine's genuine resolution", () => {
    // Explicit requests must NOT be rewritten: a page asking for `ja-JP`
    // collation is entitled to know it got `ja` data. Only the default —
    // the branch we hijacked — is replayed.
    if (typeof realmIntl.Collator !== "function") return;
    const Collator = realmIntl.Collator as new (l: string) => {
      resolvedOptions: () => { locale: string };
    };
    expect(new Collator(TAG).resolvedOptions().locale).toBe(
      new Intl.Collator(TAG).resolvedOptions().locale
    );
  });

  test("only `locale` is rewritten; the rest of resolvedOptions is the engine's", () => {
    if (typeof realmIntl.PluralRules !== "function") return;
    const PluralRules = realmIntl.PluralRules as new () => {
      resolvedOptions: () => { locale: string; pluralCategories: string[] };
    };
    const spoofed = new PluralRules().resolvedOptions();
    // The categories describe the data actually in use (`ja`), exactly as they
    // would in a native browser defaulted to ja-JP. Reporting the tag while
    // behaving as the resolved bundle IS the native contract.
    expect(spoofed.locale).toBe(TAG);
    expect(spoofed.pluralCategories).toEqual(
      new Intl.PluralRules(TAG).resolvedOptions().pluralCategories
    );
  });

  test("formatting output is unchanged — the tag is reported, not simulated", () => {
    if (typeof realmIntl.NumberFormat !== "function") return;
    const NumberFormat = realmIntl.NumberFormat as new () => { format: (n: number) => string };
    expect(new NumberFormat().format(1234.5)).toBe(new Intl.NumberFormat(TAG).format(1234.5));
  });
});

describe("with locale spoofing off", () => {
  test("nothing is rewritten", async () => {
    const { setLocaleData } = await import("@/content/injected/state");
    setLocaleData(null);
    try {
      const intl = await buildRealm();
      for (const key of availableProbes(intl)) {
        // Falls through to the engine's own default locale.
        expect(PROBES[key](intl), key).toBe(PROBES[key](Intl as unknown as IntlLike));
      }
    } finally {
      setLocaleData({ tag: TAG, languages: [TAG, "ja"] });
    }
  });
});
