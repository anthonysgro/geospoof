/**
 * `installOverride` derives the method-vs-constructor shape from the native it
 * replaces, rather than trusting the caller to pick the right helper.
 *
 * Background: the 2.1.0 regression (GitHub #67/#68/#69) happened because
 * `installOverride` unconditionally stripped `[[Construct]]`, which is correct for
 * the prototype methods it was written for and page-breaking for a constructor.
 * The first fix gave constructors their own entry point,
 * `installConstructorOverride`. That is clearer, but it is still a decision a
 * future caller has to remember to make.
 *
 * So the decision is now inferred. The native being replaced is the ground truth
 * for what shape the replacement must have, and it is available at install time,
 * so `installOverride` reads it. These tests pin that inference — including the
 * case that actually matters, a constructor passed to the *method* helper, which
 * must survive rather than break.
 */

import { describe, test, expect, beforeAll } from "vitest";

type MaskingModule = typeof import("@/content/injected/function-masking");

let installOverride: MaskingModule["installOverride"];
let isConstructible: MaskingModule["isConstructible"];

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
  ({ installOverride, isConstructible } = await import("@/content/injected/function-masking"));
});

describe("isConstructible", () => {
  test("identifies real constructors", () => {
    for (const ctor of [
      Date,
      Intl.PluralRules,
      Intl.Collator,
      Intl.NumberFormat,
      Intl.DateTimeFormat,
      Map,
      Error,
      Function,
      class Cls {},
      function Expr() {},
    ]) {
      expect(isConstructible(ctor), String((ctor as { name?: string }).name)).toBe(true);
    }
  });

  test("identifies non-constructors", () => {
    /* eslint-disable @typescript-eslint/unbound-method */
    const cases: [string, unknown][] = [
      ["arrow", () => undefined],
      ["method shorthand", { m() {} }.m],
      ["Date.prototype.getHours", Date.prototype.getHours],
      ["Math.max", Math.max],
      ["async function", async function () {}],
      ["generator", function* () {}],
      ["bound function of a method", Math.max.bind(Math)],
      [
        "getter",
        Object.getOwnPropertyDescriptor(
          {
            get x() {
              return 1;
            },
          },
          "x"
        )!.get,
      ],
    ];
    /* eslint-enable @typescript-eslint/unbound-method */
    for (const [label, value] of cases) {
      expect(isConstructible(value), label).toBe(false);
    }
  });

  test("rejects non-functions without throwing", () => {
    for (const value of [null, undefined, 0, "", {}, [], Symbol("s")]) {
      expect(isConstructible(value)).toBe(false);
    }
  });

  test("does NOT invoke the function it probes", () => {
    // The whole point of the Proxy approach over `Reflect.construct(fn, [])`:
    // probing a native at document_start must not have side effects.
    let calls = 0;
    function SideEffecting(): void {
      calls += 1;
      throw new Error("must never run");
    }
    expect(isConstructible(SideEffecting)).toBe(true);
    expect(calls).toBe(0);
  });

  test("a throwing constructor is still reported constructible", () => {
    // Distinguishing "has no [[Construct]]" from "constructor body threw" is the
    // subtlety a naive probe gets wrong.
    class AlwaysThrows {
      constructor() {
        throw new Error("nope");
      }
    }
    expect(isConstructible(AlwaysThrows)).toBe(true);
  });
});

describe("installOverride infers the shape from the native", () => {
  test("replacing a METHOD still strips [[Construct]]", () => {
    // The anti-fingerprinting behavior must be unchanged for the ~50 method call
    // sites that depend on it. Note the native here is a REAL prototype method,
    // not a stand-in `function` expression: a function expression is itself
    // constructible, so using one as the fake native would (correctly) make the
    // inference preserve [[Construct]] and the test would be testing nothing.
    /* eslint-disable-next-line @typescript-eslint/unbound-method */
    const target: Record<string, unknown> = { getHours: Date.prototype.getHours };
    installOverride(
      target,
      "getHours",
      function Override(): number {
        return 1;
      },
      0
    );

    expect(isConstructible(target.getHours)).toBe(false);
    expect("prototype" in (target.getHours as object)).toBe(false);
  });

  test("every real native the extension patches is correctly classified", () => {
    // The inference is only sound if genuine natives classify the way we assume.
    // Spot-check across the API families the injected script actually touches.
    /* eslint-disable @typescript-eslint/unbound-method */
    const methods: unknown[] = [
      Date.prototype.getHours,
      Date.prototype.getTimezoneOffset,
      Date.prototype.toLocaleString,
      Number.prototype.toLocaleString,
      String.prototype.localeCompare,
      Array.prototype.toLocaleString,
      Node.prototype.appendChild,
      Element.prototype.insertAdjacentHTML,
      Intl.DateTimeFormat.prototype.resolvedOptions,
      Intl.NumberFormat.supportedLocalesOf,
    ];
    /* eslint-enable @typescript-eslint/unbound-method */
    for (const method of methods) {
      expect(isConstructible(method)).toBe(false);
    }

    for (const ctor of [Date, Intl.DateTimeFormat, Intl.NumberFormat, Intl.Collator]) {
      expect(isConstructible(ctor)).toBe(true);
    }
  });

  test("replacing a CONSTRUCTOR preserves [[Construct]] even via the method helper", () => {
    // The 2.1.0 mistake, made deliberately. It must no longer be fatal.
    const target: Record<string, unknown> = { PluralRules: Intl.PluralRules };
    installOverride(
      target,
      "PluralRules",
      function Override(this: unknown): object {
        const newTarget = (new.target ?? Intl.PluralRules) as unknown as new (l?: string) => object;
        return Reflect.construct(Intl.PluralRules, ["en"], newTarget);
      },
      0
    );

    expect(isConstructible(target.PluralRules)).toBe(true);
    expect(() => new (target.PluralRules as new () => object)()).not.toThrow();
  });

  test("the real reported repro survives the wrong helper", () => {
    // Reproduces the full production pattern from patchIntlConstructor, including
    // the prototype re-pin — without which the instance would inherit the
    // wrapper's prototype and lose `compare`, since `new.target` is the wrapper.
    const target: Record<string, unknown> = { Collator: Intl.Collator };
    installOverride(
      target,
      "Collator",
      function Override(this: unknown): object {
        const newTarget = (new.target ?? Intl.Collator) as unknown as new (l?: string) => object;
        return Reflect.construct(Intl.Collator, [], newTarget);
      },
      0
    );
    Object.defineProperty(target.Collator as object, "prototype", {
      value: Intl.Collator.prototype,
      writable: false,
      configurable: false,
    });

    const Ctor = target.Collator as new () => { compare: (a: string, b: string) => number };
    expect(() => new Ctor()).not.toThrow();
    expect(new Ctor().compare("a", "b")).toBe(new Intl.Collator().compare("a", "b"));
    expect(new Ctor()).toBeInstanceOf(Intl.Collator);
  });

  test("a brand-new property with no native still strips (unchanged default)", () => {
    // Nothing to infer from, so the method-shaped default stands.
    const target: Record<string, unknown> = {};
    installOverride(target, "brandNew", function Override(): void {}, 0);

    expect(isConstructible(target.brandNew)).toBe(false);
  });

  test("an accessor native is treated as a method, not a constructor", () => {
    const target = {};
    Object.defineProperty(target, "thing", {
      get: () => 1,
      configurable: true,
    });
    installOverride(target, "thing", function Override(): number {
      return 2;
    });

    expect(isConstructible(Object.getOwnPropertyDescriptor(target, "thing")?.value)).toBe(false);
  });
});
