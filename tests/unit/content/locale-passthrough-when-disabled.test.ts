/**
 * With spoofing OFF, every patched locale surface must be indistinguishable from
 * the native one it replaced.
 *
 * This is a stronger invariant than "the patched constructors are constructible",
 * and it is the one the 2.1.0 reports actually landed on. `installLocaleOverrides()`
 * runs unconditionally at document_start (index.ts), because settings arrive over
 * a message and a surface cannot be patched retroactively once the page has read
 * it. `spoofingEnabled` starts `false` and `localeData` starts `null`, so the
 * wrappers are always installed and the off switch is consulted later, per call.
 *
 * The consequence: a defect in a wrapper breaks pages for users who have
 * protection turned off, and no popup setting, denylist entry, or "not activated"
 * state can route around it. Three separate reports against 2.1.0 hit exactly
 * that — Grafana and ChatGPT failing on `new Intl.Collator()` with the extension
 * disabled in the UI, and Brave Search blanking even with `*.brave.com`
 * denylisted.
 *
 * So the disabled path gets its own suite. A test that only asserts spoofed
 * behavior can pass while the pass-through path is broken, which is precisely
 * what shipped.
 */

import { describe, test, expect, beforeAll } from "vitest";

const INTL_CONSTRUCTORS = [
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
/** Synthetic carriers for the primitive-prototype methods, so real prototypes stay clean. */
let realmNumber: { prototype: Record<string, unknown> };
let realmString: { prototype: Record<string, unknown> };
let spoofingEnabled: boolean;

beforeAll(async () => {
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

  realmIntl = {};
  for (const name of INTL_CONSTRUCTORS) {
    const native = (Intl as unknown as IntlLike)[name];
    if (typeof native === "function") realmIntl[name] = native;
  }

  /* eslint-disable @typescript-eslint/unbound-method */
  realmNumber = { prototype: { toLocaleString: Number.prototype.toLocaleString } };
  realmString = {
    prototype: {
      localeCompare: String.prototype.localeCompare,
      toLocaleUpperCase: String.prototype.toLocaleUpperCase,
      toLocaleLowerCase: String.prototype.toLocaleLowerCase,
    },
  };
  /* eslint-enable @typescript-eslint/unbound-method */

  const state = await import("@/content/injected/state");
  // Assert rather than set: the default must be "off", because that default is
  // what every page gets for the window between document_start and the settings
  // event, and what a user with protection disabled gets permanently.
  spoofingEnabled = state.spoofingEnabled;

  const { installLocaleOverridesOn } = await import("@/content/injected/locale-overrides");
  installLocaleOverridesOn({
    Intl: realmIntl,
    Number: realmNumber,
    String: realmString,
  } as unknown as Window & typeof globalThis);
});

function available(): string[] {
  return INTL_CONSTRUCTORS.filter((n) => typeof realmIntl[n] === "function");
}

function argsFor(name: string): unknown[] {
  return REQUIRES_OPTIONS.has(name) ? [undefined, { type: "region" }] : [];
}

/**
 * Invoke a patched prototype method against an explicit receiver.
 *
 * The synthetic carriers hold the methods detached from their real prototypes, so
 * the receiver has to be supplied — same reason the production code reaches for
 * `Reflect.apply` on its captured natives.
 */
function callPatched<T = string>(
  proto: Record<string, unknown>,
  method: string,
  receiver: unknown,
  ...args: unknown[]
): T {
  const fn = proto[method];
  if (typeof fn !== "function") throw new Error(`${method} was not installed`);
  return Reflect.apply(fn as (...a: unknown[]) => T, receiver, args);
}

describe("the disabled path is the default path", () => {
  test("spoofing is off until settings arrive", () => {
    expect(spoofingEnabled).toBe(false);
  });

  test("the overrides installed anyway (that is the design, and the risk)", () => {
    expect(available().length).toBeGreaterThan(0);
    for (const name of available()) {
      expect(realmIntl[name], name).not.toBe((Intl as unknown as IntlLike)[name]);
    }
  });
});

describe("Intl constructors pass through untouched when spoofing is off", () => {
  test("bare `new X()` works for every patched constructor", () => {
    // The exact shape of all three 2.1.0 reports: extension off, page calls
    // `new Intl.Collator()`, page dies.
    for (const name of available()) {
      const Ctor = realmIntl[name] as new (...a: unknown[]) => object;
      expect(() => new Ctor(...argsFor(name)), name).not.toThrow();
    }
  });

  test("the resolved locale matches the native default exactly", () => {
    for (const name of available()) {
      const Patched = realmIntl[name] as new (...a: unknown[]) => {
        resolvedOptions?: () => { locale?: string };
      };
      const Native = (Intl as unknown as IntlLike)[name] as new (...a: unknown[]) => {
        resolvedOptions?: () => { locale?: string };
      };
      const patched = new Patched(...argsFor(name));
      const native = new Native(...argsFor(name));
      if (typeof patched.resolvedOptions !== "function") continue;
      // A spoofed tag leaking through while disabled would show up right here.
      expect(patched.resolvedOptions().locale, name).toBe(native.resolvedOptions!().locale);
    }
  });

  test("Collator sorts identically to native (the Grafana/ChatGPT report)", () => {
    if (typeof realmIntl.Collator !== "function") return;
    const Patched = realmIntl.Collator as new () => { compare: (a: string, b: string) => number };
    const patchedCollator = new Patched();
    const nativeCollator = new Intl.Collator();
    const words = ["zebra", "äpfel", "Apple", "banana", "Öl", "cherry"];
    const patchedSorted = [...words].sort((a, b) => patchedCollator.compare(a, b));
    const nativeSorted = [...words].sort((a, b) => nativeCollator.compare(a, b));
    expect(patchedSorted).toEqual(nativeSorted);
  });

  test("NumberFormat formats identically to native", () => {
    if (typeof realmIntl.NumberFormat !== "function") return;
    const Patched = realmIntl.NumberFormat as new () => { format: (n: number) => string };
    for (const value of [0, 1234.5, -9876543.21, 1e21]) {
      expect(new Patched().format(value)).toBe(new Intl.NumberFormat().format(value));
    }
  });

  test("PluralRules selects identically to native", () => {
    if (typeof realmIntl.PluralRules !== "function") return;
    const Patched = realmIntl.PluralRules as new () => { select: (n: number) => string };
    for (const value of [0, 1, 2, 5, 100]) {
      expect(new Patched().select(value)).toBe(new Intl.PluralRules().select(value));
    }
  });

  test("subclassing works while disabled too", () => {
    for (const name of available()) {
      const Ctor = realmIntl[name] as new (...a: unknown[]) => object;
      class Sub extends Ctor {}
      let instance: object | undefined;
      expect(() => {
        instance = new Sub(...argsFor(name));
      }, name).not.toThrow();
      expect(instance, name).toBeInstanceOf(Sub);
    }
  });
});

describe("navigator language accessors report the real values when spoofing is off", () => {
  test("navigator.language is unchanged", () => {
    expect(navigator.language).toBe(window.navigator.language);
    expect(typeof navigator.language).toBe("string");
  });

  test("navigator.languages is unchanged", () => {
    expect(Array.from(navigator.languages)).toEqual(Array.from(window.navigator.languages));
  });
});

describe("toLocale* / localeCompare pass through when spoofing is off", () => {
  test("Number.prototype.toLocaleString matches native", () => {
    for (const value of [0, 1234.5, -9876543.21]) {
      expect(callPatched(realmNumber.prototype, "toLocaleString", value)).toBe(
        value.toLocaleString()
      );
    }
  });

  test("String.prototype.localeCompare matches native", () => {
    const pairs: [string, string][] = [
      ["a", "b"],
      ["b", "a"],
      ["a", "a"],
      ["äpfel", "Apple"],
    ];
    for (const [left, right] of pairs) {
      const patched = callPatched<number>(realmString.prototype, "localeCompare", left, right);
      expect(Math.sign(patched)).toBe(Math.sign(left.localeCompare(right)));
    }
  });

  test("locale-sensitive case mapping matches native", () => {
    // "i" is the locale-sensitive one: Turkish maps it to "İ", so a leaked tag
    // would be visible here even though the ASCII cases look boring.
    for (const value of ["i", "istanbul", "Straße", "ÅNGSTRÖM"]) {
      expect(callPatched(realmString.prototype, "toLocaleUpperCase", value)).toBe(
        value.toLocaleUpperCase()
      );
      expect(callPatched(realmString.prototype, "toLocaleLowerCase", value)).toBe(
        value.toLocaleLowerCase()
      );
    }
  });
});
