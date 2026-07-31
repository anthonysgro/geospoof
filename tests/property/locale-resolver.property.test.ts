/**
 * Property-based tests for the Locale_Resolver.
 * Feature: locale-spoofing (Tasks 3.3, 4.3)
 *
 *   Property 1: Cross-surface consistency  — the executable form of Req 5
 *   Property 2: Determinism
 *   Property 3: Fail-closed resolution
 *   Property 4: Accept-Language shape (pinned per engine)
 *   Property 5: Validation repairs every malformed setting
 *   Property 6: Settings round-trip
 *
 * Property 1 is the highest-value test in this feature. The whole point of
 * routing every surface through one resolver is that the JS-reported language
 * and the HTTP header can never disagree; a disagreement would be a worse
 * fingerprint than not spoofing at all. This encodes that invariant so it
 * cannot regress silently.
 */

import fc from "fast-check";
import type { LocaleSpoofing } from "@/shared/types/settings";
import {
  buildAcceptLanguage,
  buildLanguageList,
  canonicalizeTag,
  computeEffectiveLocaleSpoofing,
  engineSupportsLocale,
  localeEngine,
  resolveLocale,
  validateLocaleSpoofing,
} from "@/shared/locale/resolver";
import { countryForTimezone } from "@/shared/locale/zone-country";
import { localeForCountry } from "@/shared/locale/country-locale";
import { importBackground } from "../helpers/import-background";

/** Tags the test engine is known to have real data for. */
const SUPPORTED_TAGS = ["fr-FR", "de-DE", "ja-JP", "pt-BR", "es-MX", "en-US", "it-IT", "nl-NL"];

/** Zones that must map, spanning single- and multi-zone countries. */
const KNOWN_ZONES = [
  "Europe/Paris",
  "Europe/Berlin",
  "Asia/Tokyo",
  "America/Sao_Paulo",
  "America/New_York",
  "Australia/Sydney",
];

describe("Property 1: cross-surface consistency", () => {
  test("tag, navigator.languages, and Accept-Language always agree", () => {
    const settingArb: fc.Arbitrary<LocaleSpoofing> = fc.oneof(
      fc.constant<LocaleSpoofing>({ mode: "match" }),
      fc.constantFrom(...SUPPORTED_TAGS).map((locale) => ({ mode: "custom" as const, locale }))
    );

    fc.assert(
      fc.property(settingArb, fc.constantFrom(...KNOWN_ZONES), (setting, zone) => {
        const resolved = resolveLocale(setting, zone);
        if (resolved === null) return; // fail-closed is covered by Property 3

        // navigator.language must be the head of navigator.languages.
        expect(resolved.languages[0]).toBe(resolved.tag);

        // The header must lead with the same tag, so a server-side read and a
        // client-side read cannot disagree.
        expect(resolved.acceptLanguage.startsWith(resolved.tag)).toBe(true);

        // Every advertised language must appear in the header, in order.
        const headerTags = resolved.acceptLanguage.split(",").map((p) => p.split(";")[0]);
        expect(headerTags).toEqual([...resolved.languages]);

        // No duplicates in the advertised list.
        expect(new Set(resolved.languages).size).toBe(resolved.languages.length);
      }),
      { numRuns: 300 }
    );
  });

  test("the real locale never leaks into the advertised list", () => {
    // A French spoof must not retain an English fallback entry, which would
    // disclose the user's actual preference despite the override. Asserted
    // against the build's own engine shape rather than a hardcoded list, since
    // WebKit advertises one entry where Gecko/Blink advertise two.
    const resolved = resolveLocale({ mode: "custom", locale: "fr-FR" }, "Europe/Paris");
    expect(resolved).not.toBeNull();
    expect(resolved!.languages).toEqual(buildLanguageList("fr-FR", localeEngine()));
    expect(resolved!.languages.every((l) => l.startsWith("fr"))).toBe(true);
    expect(resolved!.acceptLanguage).not.toMatch(/en/i);
  });

  test("a language-only tag advertises a single entry", () => {
    const resolved = resolveLocale({ mode: "custom", locale: "ja" }, null);
    expect(resolved).not.toBeNull();
    expect(resolved!.languages).toEqual(["ja"]);
    expect(resolved!.acceptLanguage).toBe("ja");
  });

  test("the resolver's output is shaped for the build's own engine", () => {
    // Guards against the resolver and the engine model drifting apart: whatever
    // engine this build targets, resolveLocale must emit that engine's list.
    const resolved = resolveLocale({ mode: "custom", locale: "fr-FR" }, null);
    expect(resolved).not.toBeNull();
    expect(resolved!.languages).toEqual(buildLanguageList("fr-FR", localeEngine()));
    expect(resolved!.acceptLanguage).toBe(
      buildAcceptLanguage(buildLanguageList("fr-FR", localeEngine()), localeEngine())
    );
  });
});

describe("Property 2: determinism", () => {
  test("the same input always resolves to the same output", () => {
    const settingArb: fc.Arbitrary<LocaleSpoofing> = fc.oneof(
      fc.constant<LocaleSpoofing>({ mode: "off" }),
      fc.constant<LocaleSpoofing>({ mode: "match" }),
      fc.constantFrom(...SUPPORTED_TAGS).map((locale) => ({ mode: "custom" as const, locale }))
    );

    fc.assert(
      fc.property(
        settingArb,
        fc.oneof(fc.constantFrom(...KNOWN_ZONES), fc.constant(null)),
        (setting, zone) => {
          expect(resolveLocale(setting, zone)).toEqual(resolveLocale(setting, zone));
        }
      ),
      { numRuns: 300 }
    );
  });

  test("match mode is a pure function of the timezone", () => {
    // Same country via two different zones of that country resolves identically.
    const a = resolveLocale({ mode: "match" }, "America/New_York");
    const b = resolveLocale({ mode: "match" }, "America/Chicago");
    expect(a).toEqual(b);
  });
});

describe("Property 3: fail-closed resolution", () => {
  test("off mode never resolves a locale", () => {
    fc.assert(
      fc.property(fc.oneof(fc.constantFrom(...KNOWN_ZONES), fc.constant(null)), (zone) => {
        expect(resolveLocale({ mode: "off" }, zone)).toBeNull();
      }),
      { numRuns: 50 }
    );
  });

  test("match mode with no timezone resolves to null", () => {
    expect(resolveLocale({ mode: "match" }, null)).toBeNull();
    expect(resolveLocale({ mode: "match" }, "")).toBeNull();
  });

  test("match mode with an unmapped zone resolves to null rather than guessing", () => {
    expect(resolveLocale({ mode: "match" }, "Mars/Olympus_Mons")).toBeNull();
    expect(resolveLocale({ mode: "match" }, "Not/AZone")).toBeNull();
  });

  test("custom mode with a malformed tag resolves to null", () => {
    for (const bad of ["", "   ", "!!!", "e", "toolongsubtagvalue", "en_US"]) {
      expect(resolveLocale({ mode: "custom", locale: bad }, null)).toBeNull();
    }
  });

  test("custom mode with a well-formed but unsupported tag resolves to null", () => {
    // Structurally valid, no engine data — must not be reported, because a
    // silent ICU fallback would contradict the claimed tag.
    const tag = "xx-ZZ";
    expect(canonicalizeTag(tag)).not.toBeNull();
    expect(engineSupportsLocale(tag)).toBe(false);
    expect(resolveLocale({ mode: "custom", locale: tag }, null)).toBeNull();
  });

  test("never throws for arbitrary input", () => {
    fc.assert(
      fc.property(fc.anything(), fc.anything(), (setting, zone) => {
        expect(() => resolveLocale(setting as LocaleSpoofing, zone as string | null)).not.toThrow();
      }),
      { numRuns: 300 }
    );
  });
});

describe("Property 4: engine-shaped advertising (list length + q values)", () => {
  // Pinned against LIVE BROWSER CAPTURES plus upstream documentation, not
  // guesses (spec task 3.2, measured with scripts/check-accept-language.mjs):
  //
  //   Firefox, page language French (France) → sent `fr-FR,fr;q=0.5`
  //   Chrome, default en-US                  → sent `en-US,en;q=0.9`
  //
  // Corroborated by Mozilla bug 2000765, titled "Firefox uses q=0.5 in
  // Accept-Language header (with two language options), while other browsers use
  // 0.9", and by MDN's Accept-Language page for the list-length differences.
  //
  // If a browser changes its convention these fail loudly, rather than letting a
  // wrong-engine header ship as a silent fingerprinting tell.

  describe("list length differs by engine", () => {
    test("gecko and blink advertise the tag plus its bare-language fallback", () => {
      // MDN: Chrome and Safari "add language-only fallback tags"; Firefox lists
      // the same locales as navigator.languages.
      expect(buildLanguageList("fr-FR", "gecko")).toEqual(["fr-FR", "fr"]);
      expect(buildLanguageList("fr-FR", "blink")).toEqual(["fr-FR", "fr"]);
    });

    test("webkit advertises exactly ONE language", () => {
      // MDN: "in Safari (always) and Chrome's incognito mode, only one language
      // is listed." Emitting two on Safari would be a giveaway by itself,
      // independent of any q value.
      expect(buildLanguageList("fr-FR", "webkit")).toEqual(["fr-FR"]);
      expect(buildLanguageList("pt-BR", "webkit")).toEqual(["pt-BR"]);
    });

    test("a language-only tag never duplicates itself on any engine", () => {
      for (const engine of ["gecko", "blink", "webkit"] as const) {
        expect(buildLanguageList("ja", engine), engine).toEqual(["ja"]);
      }
    });
  });

  describe("q conventions", () => {
    test("gecko distributes q evenly across the list (captured from Firefox)", () => {
      expect(buildAcceptLanguage(["fr-FR", "fr"], "gecko")).toBe("fr-FR,fr;q=0.5");
      expect(buildAcceptLanguage(["de-DE", "de"], "gecko")).toBe("de-DE,de;q=0.5");
    });

    test("blink steps q down by 0.1 (captured from Chrome)", () => {
      expect(buildAcceptLanguage(["fr-FR", "fr"], "blink")).toBe("fr-FR,fr;q=0.9");
      // The exact captured string, verbatim.
      expect(buildAcceptLanguage(["en-US", "en"], "blink")).toBe("en-US,en;q=0.9");
    });

    test("webkit emits a bare tag with no q at all", () => {
      // Falls out of the single-entry list: the leading entry never carries an
      // explicit q, since q defaults to 1.
      expect(buildAcceptLanguage(buildLanguageList("fr-FR", "webkit"), "webkit")).toBe("fr-FR");
      expect(buildAcceptLanguage(buildLanguageList("ja", "webkit"), "webkit")).toBe("ja");
    });

    test("the conventions diverge at two entries and coincide at one", () => {
      // Documents why the 2-entry case is the one worth measuring.
      expect(buildAcceptLanguage(["fr-FR", "fr"], "gecko")).not.toBe(
        buildAcceptLanguage(["fr-FR", "fr"], "blink")
      );
      expect(buildAcceptLanguage(["ja"], "gecko")).toBe(buildAcceptLanguage(["ja"], "blink"));
    });
  });

  describe("end-to-end per-engine output", () => {
    // The full string each engine would actually send for the same user choice.
    test("fr-FR renders correctly on every engine", () => {
      const cases = {
        gecko: "fr-FR,fr;q=0.5",
        blink: "fr-FR,fr;q=0.9",
        webkit: "fr-FR",
      } as const;
      for (const [engine, expected] of Object.entries(cases)) {
        const e = engine as "gecko" | "blink" | "webkit";
        expect(buildAcceptLanguage(buildLanguageList("fr-FR", e), e), engine).toBe(expected);
      }
    });

    test("the advertised list and the header always agree, on every engine", () => {
      // The invariant that makes the feature safe rather than harmful, checked
      // per engine rather than only for the build under test.
      for (const engine of ["gecko", "blink", "webkit"] as const) {
        for (const tag of ["fr-FR", "ja", "pt-BR", "en-GB"]) {
          const languages = buildLanguageList(tag, engine);
          const header = buildAcceptLanguage(languages, engine);
          expect(languages[0], `${engine}/${tag}`).toBe(tag);
          expect(header.startsWith(tag), `${engine}/${tag}`).toBe(true);
          expect(
            header.split(",").map((p) => p.split(";")[0]),
            `${engine}/${tag}`
          ).toEqual(languages);
        }
      }
    });
  });

  test("a single entry carries no explicit q on either engine", () => {
    expect(buildAcceptLanguage(["ja"], "gecko")).toBe("ja");
    expect(buildAcceptLanguage(["ja"], "blink")).toBe("ja");
  });

  test("an empty list yields an empty header", () => {
    expect(buildAcceptLanguage([], "gecko")).toBe("");
  });

  test("q values stay within (0,1) for any list length", () => {
    fc.assert(
      fc.property(
        fc.array(fc.constantFrom("fr", "de", "ja", "en"), { minLength: 1, maxLength: 12 }),
        fc.constantFrom("gecko" as const, "blink" as const),
        (langs, engine) => {
          for (const part of buildAcceptLanguage(langs, engine).split(",").slice(1)) {
            const q = Number(part.split(";q=")[1]);
            expect(q).toBeGreaterThan(0);
            expect(q).toBeLessThan(1);
          }
        }
      ),
      { numRuns: 200 }
    );
  });
});

describe("Property 5: validation repairs every malformed localeSpoofing", () => {
  test("any junk yields a valid shape and never throws", () => {
    fc.assert(
      fc.property(fc.anything(), (junk) => {
        const ls = validateLocaleSpoofing(junk);
        if (ls.mode === "off" || ls.mode === "match") {
          expect(Object.keys(ls)).toEqual(["mode"]);
        } else if (ls.mode === "custom") {
          expect(typeof ls.locale).toBe("string");
          expect(ls.locale.length).toBeGreaterThan(0);
          // A retained custom tag is always canonical and engine-supported.
          expect(canonicalizeTag(ls.locale)).toBe(ls.locale);
          expect(engineSupportsLocale(ls.locale)).toBe(true);
        } else {
          throw new Error(`unexpected mode: ${String((ls as { mode: unknown }).mode)}`);
        }
      }),
      { numRuns: 300 }
    );
  });

  test("targeted repair cases", () => {
    const ls = validateLocaleSpoofing;
    expect(ls(undefined)).toEqual({ mode: "off" });
    expect(ls(null)).toEqual({ mode: "off" });
    expect(ls({})).toEqual({ mode: "off" });
    expect(ls({ mode: "wobble" })).toEqual({ mode: "off" });
    expect(ls({ mode: "match" })).toEqual({ mode: "match" });
    expect(ls({ mode: "off" })).toEqual({ mode: "off" });
    // custom with unusable locale -> off
    expect(ls({ mode: "custom" })).toEqual({ mode: "off" });
    expect(ls({ mode: "custom", locale: "" })).toEqual({ mode: "off" });
    expect(ls({ mode: "custom", locale: "   " })).toEqual({ mode: "off" });
    expect(ls({ mode: "custom", locale: 42 })).toEqual({ mode: "off" });
    expect(ls({ mode: "custom", locale: "not a tag!" })).toEqual({ mode: "off" });
    expect(ls({ mode: "custom", locale: "xx-ZZ" })).toEqual({ mode: "off" });
    // custom with a good locale is kept and canonicalized
    expect(ls({ mode: "custom", locale: "fr-FR" })).toEqual({ mode: "custom", locale: "fr-FR" });
    expect(ls({ mode: "custom", locale: "  fr-fr  " })).toEqual({
      mode: "custom",
      locale: "fr-FR",
    });
    // extra properties are dropped
    expect(ls({ mode: "match", locale: "fr-FR", junk: 1 })).toEqual({ mode: "match" });
  });
});

describe("Property 6: settings round-trip", () => {
  test("a valid localeSpoofing survives validateSettings unchanged", async () => {
    const { validateSettings } = await importBackground();

    const validArb: fc.Arbitrary<LocaleSpoofing> = fc.oneof(
      fc.constant<LocaleSpoofing>({ mode: "off" }),
      fc.constant<LocaleSpoofing>({ mode: "match" }),
      fc.constantFrom(...SUPPORTED_TAGS).map((locale) => ({ mode: "custom" as const, locale }))
    );

    fc.assert(
      fc.property(validArb, (localeSpoofing) => {
        expect(validateSettings({ localeSpoofing }).localeSpoofing).toEqual(localeSpoofing);
      }),
      { numRuns: 200 }
    );
  });

  test("an absent localeSpoofing defaults to off (no schema bump needed)", async () => {
    const { validateSettings } = await importBackground();
    expect(validateSettings({}).localeSpoofing).toEqual({ mode: "off" });
  });

  test("junk in the localeSpoofing slot is repaired on reload", async () => {
    const { validateSettings } = await importBackground();
    fc.assert(
      fc.property(fc.anything(), (junk) => {
        const ls = validateSettings({ localeSpoofing: junk as LocaleSpoofing }).localeSpoofing;
        expect(["off", "match", "custom"]).toContain(ls.mode);
      }),
      { numRuns: 200 }
    );
  });

  test("localeSpoofing is independent of uiLanguage", async () => {
    const { validateSettings } = await importBackground();
    const validated = validateSettings({
      uiLanguage: "ru",
      localeSpoofing: { mode: "custom", locale: "fr-FR" },
    });
    expect(validated.uiLanguage).toBe("ru");
    expect(validated.localeSpoofing).toEqual({ mode: "custom", locale: "fr-FR" });
  });
});

describe("Pro gate", () => {
  test("forces off when proFeaturesBlocked, fail-open otherwise", () => {
    const setting: LocaleSpoofing = { mode: "custom", locale: "fr-FR" };
    // __SAFARI__ is false in the test build, so the gate compiles to a passthrough.
    expect(computeEffectiveLocaleSpoofing(setting, undefined)).toEqual(setting);
    expect(computeEffectiveLocaleSpoofing(setting, false)).toEqual(setting);
    expect(computeEffectiveLocaleSpoofing(setting, true)).toEqual(
      __SAFARI__ ? { mode: "off" } : setting
    );
  });
});

describe("mapping data sanity", () => {
  test("known zones map to the expected country and locale", () => {
    expect(countryForTimezone("Europe/Paris")).toBe("FR");
    expect(countryForTimezone("Asia/Tokyo")).toBe("JP");
    expect(countryForTimezone("America/Sao_Paulo")).toBe("BR");
    expect(localeForCountry("FR")).toBe("fr-FR");
    expect(localeForCountry("JP")).toBe("ja-JP");
    expect(localeForCountry("BR")).toBe("pt-BR");
  });

  test("legacy zone aliases resolve to the same country as their canonical zone", () => {
    // Third-party geo APIs still return these older names.
    expect(countryForTimezone("Asia/Calcutta")).toBe(countryForTimezone("Asia/Kolkata"));
    expect(countryForTimezone("Europe/Kiev")).toBe(countryForTimezone("Europe/Kyiv"));
  });

  test("unknown lookups return null rather than throwing", () => {
    expect(countryForTimezone("Nowhere/Nothing")).toBeNull();
    expect(countryForTimezone("")).toBeNull();
    expect(localeForCountry("ZZ")).toBeNull();
    expect(localeForCountry("")).toBeNull();
  });

  test("match mode resolves a real locale end-to-end for a mapped zone", () => {
    const resolved = resolveLocale({ mode: "match" }, "Europe/Paris");
    expect(resolved).not.toBeNull();
    expect(resolved!.tag).toBe("fr-FR");
    // Engine-shaped, not hardcoded: WebKit advertises one entry, Gecko/Blink two.
    expect(resolved!.languages).toEqual(buildLanguageList("fr-FR", localeEngine()));
  });
});
