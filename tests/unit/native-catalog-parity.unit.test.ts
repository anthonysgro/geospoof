/**
 * Native String Catalog parity tests.
 *
 * The Safari **app** is localized through an Xcode String Catalog, while the
 * extension **popup** uses `_locales/<lang>/messages.json`. Different format,
 * different runtime, same product — so the language sets must not drift.
 *
 * This runs in vitest rather than as a Swift test on purpose: `.xcstrings` is
 * JSON, and `safari/GeoSpoofTests/` has no target in `project.pbxproj`, so
 * nothing there compiles or runs. A guard that never executes is worse than no
 * guard, because it looks like coverage.
 *
 * Failure policy mirrors `tests/unit/locales.unit.test.ts`:
 *   - a language present on one side but not the other      -> FAIL
 *   - a format specifier that changes kind or count          -> FAIL
 *   - load-bearing leading/trailing whitespace dropped       -> FAIL
 *   - an empty translation for a non-empty source            -> FAIL
 *   - untranslated or stale keys                             -> warn only
 *
 * The warn/fail split is deliberate. Missing translations fall back to the key,
 * which is the English source text, so a partial language still renders. A
 * broken format specifier crashes or prints garbage at runtime, and a dropped
 * space runs two words together, so those are hard failures.
 */

import { describe, test, expect, beforeAll } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import { SUPPORTED_UI_LOCALES, toAppleLocaleCode } from "@/shared/i18n/locales";

const CATALOG = resolve(__dirname, "../../safari/Shared (App)/Resources/Localizable.xcstrings");

/** Minimal shape of the bits of the `.xcstrings` format this test reads. */
type StringUnit = { state?: string; value?: string };
type Localization = {
  stringUnit?: StringUnit;
  variations?: { plural?: Record<string, { stringUnit?: StringUnit }> };
};
type CatalogEntry = {
  extractionState?: string;
  shouldTranslate?: boolean;
  comment?: string;
  localizations?: Record<string, Localization>;
};
type Catalog = {
  sourceLanguage: string;
  version: string;
  strings: Record<string, CatalogEntry>;
};

/** Format specifiers, normalized so `%1$lld` compares equal to `%lld`. */
function specifiers(s: string): string[] {
  const out = (s.match(/%(?:\d+\$)?(?:@|lld|%)/g) ?? []).map((m) => m.replace(/\d+\$/, ""));
  return out.sort();
}

/**
 * Every translated value for a language: a plain `stringUnit`, or each plural
 * category when the entry varies. Plural categories are returned individually
 * because each one is independently capable of dropping a specifier.
 */
function valuesFor(entry: CatalogEntry, lang: string): { label: string; value: string }[] {
  const loc = entry.localizations?.[lang];
  if (!loc) return [];
  if (loc.stringUnit?.value !== undefined) {
    return [{ label: lang, value: loc.stringUnit.value }];
  }
  const plural = loc.variations?.plural;
  if (!plural) return [];
  return Object.entries(plural)
    .filter(([, v]) => v.stringUnit?.value !== undefined)
    .map(([category, v]) => ({ label: `${lang}/${category}`, value: v.stringUnit!.value! }));
}

/** States that mean "a translator still needs to look at this". */
const UNFINISHED = new Set(["new", "needs_review"]);

describe("Native String Catalog parity", () => {
  let catalog: Catalog;
  let keys: string[];
  /** Apple-side codes the catalog is expected to carry (English excluded). */
  let expectedLangs: string[];

  beforeAll(() => {
    catalog = JSON.parse(readFileSync(CATALOG, "utf-8")) as Catalog;
    keys = Object.keys(catalog.strings);
    expectedLangs = SUPPORTED_UI_LOCALES.filter((l) => l.code !== "en")
      .map((l) => toAppleLocaleCode(l.code))
      .sort();
  });

  test("catalog is well-formed and non-empty", () => {
    expect(catalog.sourceLanguage).toBe("en");
    expect(catalog.version).toBe("1.0");
    expect(keys.length).toBeGreaterThan(0);
  });

  test("no empty or whitespace-only keys", () => {
    // An empty key is a translatable row containing nothing; it comes from a
    // bare `""` literal in a LocalizedStringKey position and should be
    // `Text(verbatim: "")` in the Swift source instead.
    expect(keys.filter((k) => k.trim() === "")).toEqual([]);
  });

  test("no stale keys (source no longer references them)", () => {
    const stale = keys.filter((k) => catalog.strings[k].extractionState === "stale");
    if (stale.length > 0) {
      console.warn(
        `[xcstrings] ${stale.length} stale key(s) — the Swift source no longer ` +
          `references these, so they can be deleted: ${stale.slice(0, 5).join(", ")}` +
          (stale.length > 5 ? `, ... (+${stale.length - 5} more)` : "")
      );
    }
    // Informational: stale keys are harmless at runtime, just dead weight.
    expect(Array.isArray(stale)).toBe(true);
  });

  test("catalog languages exactly match SUPPORTED_UI_LOCALES", () => {
    const present = new Set<string>();
    for (const key of keys) {
      for (const lang of Object.keys(catalog.strings[key].localizations ?? {})) {
        if (lang !== "en") present.add(lang);
      }
    }
    const actual = [...present].sort();

    // Reported as two explicit diffs rather than one equality assertion, because
    // "which side is the language missing from" is the whole diagnostic.
    const missingFromCatalog = expectedLangs.filter((l) => !present.has(l));
    const notInSupportedList = actual.filter((l) => !expectedLangs.includes(l));

    expect(
      missingFromCatalog,
      "languages in SUPPORTED_UI_LOCALES but absent from the catalog"
    ).toEqual([]);
    expect(notInSupportedList, "languages in the catalog but not in SUPPORTED_UI_LOCALES").toEqual(
      []
    );
    expect(actual).toEqual(expectedLangs);
  });

  describe("per language", () => {
    // Bound at module scope so `describe.each` can enumerate before `beforeAll`.
    const langs = SUPPORTED_UI_LOCALES.filter((l) => l.code !== "en").map((l) => ({
      appleCode: toAppleLocaleCode(l.code),
      localesCode: l.code,
    }));

    describe.each(langs)("$appleCode", ({ appleCode }) => {
      test("format specifiers match the source key exactly", () => {
        const mismatches: string[] = [];
        for (const key of keys) {
          const want = specifiers(key);
          for (const { label, value } of valuesFor(catalog.strings[key], appleCode)) {
            const got = specifiers(value);
            if (got.join(",") !== want.join(",")) {
              mismatches.push(
                `${label}: "${key.slice(0, 48)}" ` +
                  `expected [${want.join(",")}] got [${got.join(",")}]`
              );
            }
          }
        }
        expect(mismatches).toEqual([]);
      });

      test("load-bearing leading/trailing whitespace is preserved", () => {
        // Four keys are concatenated with an adjacent icon or sentence at
        // runtime, so their padding is significant. CJK full-width punctuation
        // carries its own advance width, so a trailing ASCII space after it is
        // wrong typography and is allowed to be absent.
        const CJK_TAIL = /[：，。、！？]$/;
        const problems: string[] = [];
        for (const key of keys) {
          if (key === key.trim()) continue;
          for (const { label, value } of valuesFor(catalog.strings[key], appleCode)) {
            const leadOK = /^\s/.test(key) === /^\s/.test(value);
            const trailOK = /\s$/.test(key) === /\s$/.test(value) || CJK_TAIL.test(value);
            if (!leadOK || !trailOK) {
              problems.push(`${label}: ${JSON.stringify(key)} -> ${JSON.stringify(value)}`);
            }
          }
        }
        expect(problems).toEqual([]);
      });

      test("no empty translation for a non-empty source key", () => {
        const empties: string[] = [];
        for (const key of keys) {
          if (key.trim() === "") continue;
          for (const { label, value } of valuesFor(catalog.strings[key], appleCode)) {
            if (value.trim() === "") empties.push(`${label}: "${key.slice(0, 48)}"`);
          }
        }
        expect(empties).toEqual([]);
      });

      // Soft, matching the `_locales` missing-key policy: an untranslated key
      // falls back to the source text, so the app still renders.
      test("untranslated / unreviewed keys (reported, not failed)", () => {
        const untranslated: string[] = [];
        const unreviewed: string[] = [];
        for (const key of keys) {
          const vals = valuesFor(catalog.strings[key], appleCode);
          if (vals.length === 0) {
            untranslated.push(key);
            continue;
          }
          const loc = catalog.strings[key].localizations![appleCode];
          const states = [
            loc.stringUnit?.state,
            ...Object.values(loc.variations?.plural ?? {}).map((c) => c.stringUnit?.state),
          ].filter((s): s is string => Boolean(s));
          if (states.some((s) => UNFINISHED.has(s))) unreviewed.push(key);
        }
        if (untranslated.length > 0) {
          console.warn(
            `[xcstrings] ${appleCode} is missing ${untranslated.length} of ${keys.length} ` +
              `key(s) (will fall back to English)`
          );
        }
        if (unreviewed.length > 0) {
          console.warn(
            `[xcstrings] ${appleCode} has ${unreviewed.length} key(s) awaiting native review`
          );
        }
        expect(Array.isArray(untranslated)).toBe(true);
      });
    });
  });
});

describe("locale-code mapping", () => {
  test("maps the two codes that differ between the platforms", () => {
    expect(toAppleLocaleCode("pt_BR")).toBe("pt-BR");
    expect(toAppleLocaleCode("zh_CN")).toBe("zh-Hans");
  });

  test("passes the other ten through unchanged", () => {
    for (const { code } of SUPPORTED_UI_LOCALES) {
      if (code === "pt_BR" || code === "zh_CN") continue;
      expect(toAppleLocaleCode(code)).toBe(code);
    }
  });

  test("produces a unique Apple code per supported locale", () => {
    const mapped = SUPPORTED_UI_LOCALES.map((l) => toAppleLocaleCode(l.code));
    expect(new Set(mapped).size).toBe(mapped.length);
  });
});
