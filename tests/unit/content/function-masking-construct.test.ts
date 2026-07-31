/**
 * Contract tests for the construct-slot split between `installOverride` and
 * `installConstructorOverride`.
 *
 * `installOverride` intentionally destroys `[[Construct]]` (a native prototype
 * method has none, and a page can detect one that does). `installConstructorOverride`
 * intentionally keeps it. Getting that pairing backwards is invisible to every
 * surface probe — `typeof`, `name`, `length`, and a `[native code]` `toString()`
 * all still match native — and only shows up when something calls `new`. That is
 * how GitHub #67/#68 escaped into 2.1.0.
 *
 * These tests pin both halves of the contract so the two helpers can't silently
 * converge, and so the "methods here, constructors there" rule is enforced by CI
 * rather than by remembering a doc comment.
 */

import { describe, test, expect, beforeAll } from "vitest";

type MaskingModule = typeof import("@/content/injected/function-masking");

let installOverride: MaskingModule["installOverride"];
let installConstructorOverride: MaskingModule["installConstructorOverride"];
let initFunctionMasking: MaskingModule["initFunctionMasking"];

beforeAll(async () => {
  // function-masking transitively imports state.ts, which captures
  // navigator.geolocation at module scope. jsdom has none, so stub it before the
  // dynamic import below (a static import would be hoisted above this).
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

  ({ installOverride, installConstructorOverride, initFunctionMasking } =
    await import("@/content/injected/function-masking"));
});

/** A function expression: has a non-configurable `prototype`, so it is constructible. */
function makeCtor(): (...args: unknown[]) => void {
  return function Native(this: unknown, ..._args: unknown[]): void {
    /* no-op */
  };
}

function isConstructible(fn: unknown): boolean {
  try {
    Reflect.construct(fn as new () => unknown, []);
    return true;
  } catch (error) {
    // A constructible function whose body throws is still constructible; only
    // the engine's "not a constructor" TypeError means the slot is missing.
    return !(error instanceof TypeError && /not a constructor/i.test(String(error)));
  }
}

describe("installOverride strips [[Construct]] (methods and accessors only)", () => {
  test("a function-expression override loses constructibility", () => {
    const target: Record<string, unknown> = { method: function original(): void {} };
    installOverride(target, "method", makeCtor(), 0);

    expect(typeof target.method).toBe("function");
    expect(isConstructible(target.method)).toBe(false);
    expect(() => new (target.method as new () => unknown)()).toThrow(TypeError);
  });

  test("and loses its `prototype` property, matching a native method", () => {
    const target: Record<string, unknown> = { method: function original(): void {} };
    installOverride(target, "method", makeCtor(), 0);

    expect("prototype" in (target.method as object)).toBe(false);
  });
});

describe("installConstructorOverride preserves [[Construct]]", () => {
  test("the installed override is constructible", () => {
    const target: Record<string, unknown> = { Thing: makeCtor() };
    installConstructorOverride(target, "Thing", makeCtor(), 1);

    expect(isConstructible(target.Thing)).toBe(true);
    expect(() => new (target.Thing as new () => unknown)()).not.toThrow();
  });

  test("`new.target` reaches the override, so subclassing works", () => {
    const target: Record<string, unknown> = { Thing: makeCtor() };
    let sawNewTarget: unknown;
    installConstructorOverride(
      target,
      "Thing",
      function Override(this: unknown): void {
        sawNewTarget = new.target;
      },
      0
    );

    class Sub extends (target.Thing as new () => object) {}
    const instance = new Sub();

    expect(sawNewTarget).toBe(Sub);
    expect(instance).toBeInstanceOf(Sub);
  });

  test("name and length are disguised as the native's", () => {
    const target: Record<string, unknown> = { NumberFormat: makeCtor() };
    installConstructorOverride(target, "NumberFormat", makeCtor(), 2);

    const installed = target.NumberFormat as (...a: unknown[]) => void;
    expect(installed.name).toBe("NumberFormat");
    expect(installed.length).toBe(2);
  });

  test("length falls back to the native's arity when not passed explicitly", () => {
    const target: Record<string, unknown> = {
      Thing: function Thing(_a: unknown, _b: unknown, _c: unknown): void {},
    };
    installConstructorOverride(target, "Thing", makeCtor());

    expect((target.Thing as (...a: unknown[]) => void).length).toBe(3);
  });

  test("the target's original descriptor flags are preserved", () => {
    // Non-default but still redefinable (a non-configurable slot can't be
    // replaced at all, in either helper — that's JS, not a policy of ours).
    const target = {};
    Object.defineProperty(target, "Thing", {
      value: makeCtor(),
      configurable: true,
      enumerable: true,
      writable: false,
    });
    installConstructorOverride(target, "Thing", makeCtor(), 0);

    expect(Object.getOwnPropertyDescriptor(target, "Thing")).toMatchObject({
      configurable: true,
      enumerable: true,
      writable: false,
    });
  });

  test("the real Intl descriptor shape round-trips unchanged", () => {
    // What the override actually has to preserve in production: Intl's own
    // constructors are writable, non-enumerable, configurable. A page that walks
    // Object.keys(Intl) must not suddenly see the patched name appear.
    const nativeDescriptor = Object.getOwnPropertyDescriptor(Intl, "NumberFormat");
    expect(nativeDescriptor).toMatchObject({ enumerable: false });

    const target = {};
    Object.defineProperty(target, "NumberFormat", { ...nativeDescriptor, value: makeCtor() });
    installConstructorOverride(target, "NumberFormat", makeCtor(), 0);

    expect(Object.getOwnPropertyDescriptor(target, "NumberFormat")).toMatchObject({
      configurable: nativeDescriptor!.configurable,
      enumerable: nativeDescriptor!.enumerable,
      writable: nativeDescriptor!.writable,
    });
    expect(Object.keys(target)).not.toContain("NumberFormat");
  });

  test("it is registered for toString masking", () => {
    // initFunctionMasking patches Function.prototype.toString process-wide, so
    // restore it afterwards rather than relying on file-level test isolation.
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const nativeToString = Function.prototype.toString;
    const target: Record<string, unknown> = { PluralRules: makeCtor() };
    installConstructorOverride(target, "PluralRules", makeCtor(), 0);

    try {
      initFunctionMasking();
      expect(String(target.PluralRules)).toBe("function PluralRules() { [native code] }");
    } finally {
      Object.defineProperty(Function.prototype, "toString", {
        value: nativeToString,
        configurable: true,
        writable: true,
      });
    }
  });
});

describe("no override helper leaves a constructor un-constructible by accident", () => {
  // The failure mode is asymmetric: a method that is wrongly constructible is a
  // fingerprinting tell, but a constructor that is wrongly NOT constructible
  // breaks the page outright. Assert the asymmetry directly.
  test("the two helpers disagree about [[Construct]] for the same input", () => {
    const viaMethod: Record<string, unknown> = { x: function original(): void {} };
    const viaCtor: Record<string, unknown> = { x: function original(): void {} };

    installOverride(viaMethod, "x", makeCtor(), 0);
    installConstructorOverride(viaCtor, "x", makeCtor(), 0);

    expect(isConstructible(viaMethod.x)).toBe(false);
    expect(isConstructible(viaCtor.x)).toBe(true);
  });
});
