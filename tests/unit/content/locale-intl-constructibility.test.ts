/**
 * Regression: the overridden `Intl` constructors must stay constructible.
 *
 * Reported as GitHub #67 / #68 against 2.1.0 — `new Intl.PluralRules(...)` threw
 * "is not a constructor", which broke ChatGPT and Brave Search outright.
 *
 * Cause: `patchIntlConstructor` built a properly constructible wrapper (it honors
 * `new.target` and forwards through `Reflect.construct`), then handed it to
 * `installOverride`. That helper sees a function expression's non-configurable
 * `prototype` and routes it through `stripConstruct`, which returns a
 * method-shorthand function — deliberately WITHOUT `[[Construct]]`, because that
 * is exactly right for the methods it was designed for and exactly wrong for a
 * constructor. Re-pinning `.prototype` afterwards doesn't help: the visible
 * `prototype` property and the internal `[[Construct]]` slot are separate things,
 * and the latter cannot be restored with `defineProperty`.
 *
 * The shipped symptom was especially nasty because every surface probe still
 * looked native — `typeof` reported "function" and `toString()` reported
 * "[native code]" — so only an actual `new` call revealed it.
 *
 * These tests construct for real, against the real module, rather than asserting
 * on source text. The overrides are installed onto a synthetic realm holding
 * copies of the native constructors, so the global `Intl` is left untouched and
 * no other test can be affected.
 */

import { describe, test, expect, beforeAll } from "vitest";

/** The constructors `locale-overrides.ts` patches (DateTimeFormat is handled elsewhere). */
const PATCHED = [
  "NumberFormat",
  "Collator",
  "RelativeTimeFormat",
  "ListFormat",
  "PluralRules",
  "DisplayNames",
  "Segmenter",
  "DurationFormat",
] as const;

/** Constructors that require an options bag, so a bare `new X()` legitimately throws. */
const REQUIRES_OPTIONS = new Set(["DisplayNames"]);

type IntlLike = Record<string, unknown>;

let realmIntl: IntlLike;

beforeAll(async () => {
  // `state.ts` captures navigator.geolocation at import time and jsdom has none,
  // so stub it before importing anything from the injected script.
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

  // A synthetic realm carrying copies of the native Intl constructors. Only
  // `Intl` is supplied: omitting Number/String/Array keeps the installer from
  // touching this process's real primitive prototypes.
  realmIntl = {};
  for (const name of PATCHED) {
    const native = (Intl as unknown as IntlLike)[name];
    if (typeof native === "function") realmIntl[name] = native;
  }

  const { installLocaleOverridesOn } = await import("@/content/injected/locale-overrides");
  installLocaleOverridesOn({ Intl: realmIntl } as unknown as Window & typeof globalThis);
});

/** Only the constructors this engine actually implements. */
function available(): string[] {
  return PATCHED.filter((n) => typeof realmIntl[n] === "function");
}

describe("overridden Intl constructors remain constructible", () => {
  test("the installer actually replaced something (guards a vacuous suite)", () => {
    expect(available().length).toBeGreaterThan(0);
    // If the wrapper were never installed, every assertion below would pass
    // trivially against the untouched natives. Identity is the right check here:
    // `[native code]` masking comes from initFunctionMasking(), which patches
    // Function.prototype.toString globally and is deliberately not invoked in
    // this isolated realm.
    for (const name of available()) {
      expect(realmIntl[name], name).not.toBe((Intl as unknown as IntlLike)[name]);
    }
  });

  test("`new X()` works for every patched constructor", () => {
    for (const name of available()) {
      const Ctor = realmIntl[name] as new (...a: unknown[]) => object;
      const args = REQUIRES_OPTIONS.has(name) ? ["en", { type: "region" }] : ["en"];
      expect(() => new Ctor(...args), name).not.toThrow();
    }
  });

  test("Reflect.construct works for every patched constructor", () => {
    for (const name of available()) {
      const Ctor = realmIntl[name] as new (...a: unknown[]) => object;
      const args = REQUIRES_OPTIONS.has(name) ? ["en", { type: "region" }] : ["en"];
      expect(() => Reflect.construct(Ctor, args), name).not.toThrow();
    }
  });

  test("subclassing works and preserves the subclass prototype", () => {
    for (const name of available()) {
      const Ctor = realmIntl[name] as new (...a: unknown[]) => object;
      const args = REQUIRES_OPTIONS.has(name) ? ["en", { type: "region" }] : ["en"];
      class Sub extends Ctor {}
      let instance: object | undefined;
      expect(() => {
        instance = new Sub(...args);
      }, name).not.toThrow();
      // new.target must be honored, or `instanceof` breaks for the subclass.
      expect(instance, name).toBeInstanceOf(Sub);
    }
  });

  test("the exact reported reproduction now works", () => {
    // From GitHub #67.
    if (typeof realmIntl.PluralRules !== "function") return; // not on this engine
    const PluralRules = realmIntl.PluralRules as new (l: string) => {
      select: (n: number) => string;
    };
    expect(new PluralRules("fr-FR").select(2)).toBe("other");
  });

  test("instances still behave like the natives they wrap", () => {
    if (typeof realmIntl.NumberFormat !== "function") return;
    const NumberFormat = realmIntl.NumberFormat as new (l?: string) => {
      format: (n: number) => string;
    };
    // Sanity: the wrapper forwards through to real ICU behavior.
    expect(new NumberFormat("de-DE").format(1234.5)).toBe(
      new Intl.NumberFormat("de-DE").format(1234.5)
    );
  });

  test("instanceof against the patched constructor still holds", () => {
    for (const name of available()) {
      const Ctor = realmIntl[name] as new (...a: unknown[]) => object;
      const args = REQUIRES_OPTIONS.has(name) ? ["en", { type: "region" }] : ["en"];
      expect(new Ctor(...args), name).toBeInstanceOf(Ctor);
    }
  });

  test("supportedLocalesOf survives the override", () => {
    for (const name of available()) {
      const Ctor = realmIntl[name] as { supportedLocalesOf?: (l: string[]) => string[] };
      // Not every constructor exposes it (Segmenter/DurationFormat may not).
      if (typeof Ctor.supportedLocalesOf !== "function") continue;
      expect(() => Ctor.supportedLocalesOf!(["en"]), name).not.toThrow();
    }
  });

  test("calling without `new` still returns an instance where the spec allows it", () => {
    // Intl.NumberFormat and Collator are callable as plain functions.
    for (const name of ["NumberFormat", "Collator"]) {
      const Ctor = realmIntl[name] as ((l?: string) => object) | undefined;
      if (typeof Ctor !== "function") continue;
      expect(() => Ctor("en"), name).not.toThrow();
    }
  });
});
