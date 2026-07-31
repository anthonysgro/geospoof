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
/** The production probe. Its own correctness is pinned in construct-autodetect.test.ts. */
let isConstructible: MaskingModule["isConstructible"];

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

  ({ installOverride, installConstructorOverride, initFunctionMasking, isConstructible } =
    await import("@/content/injected/function-masking"));
});

/** A function expression: has a non-configurable `prototype`, so it is constructible. */
function makeCtor(): (...args: unknown[]) => void {
  return function Native(this: unknown, ..._args: unknown[]): void {
    /* no-op */
  };
}

/**
 * A stand-in for a native prototype method.
 *
 * Must be method-shorthand, not a `function` expression. `installOverride` now
 * infers whether to strip `[[Construct]]` from the value it is replacing, so a
 * constructible stand-in would make it preserve construct — correctly — and the
 * method-path assertions would be testing the constructor path by accident.
 */
function makeMethod(): () => void {
  return {
    // `this: void` is a type-only annotation; the emitted function is still
    // method-shorthand, so it still has no `[[Construct]]`.
    method(this: void): void {
      /* no-op */
    },
  }.method;
}

describe("installOverride strips [[Construct]] when replacing a method", () => {
  test("a function-expression override loses constructibility", () => {
    const target: Record<string, unknown> = { method: makeMethod() };
    installOverride(target, "method", makeCtor(), 0);

    expect(typeof target.method).toBe("function");
    expect(isConstructible(target.method)).toBe(false);
    expect(() => new (target.method as new () => unknown)()).toThrow(TypeError);
  });

  test("and loses its `prototype` property, matching a native method", () => {
    const target: Record<string, unknown> = { method: makeMethod() };
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

describe("the two helpers differ in how they decide", () => {
  // `installOverride` infers from the value being replaced; this one is
  // unconditional. The difference is observable when there is nothing useful to
  // infer from, which is the case this pins.
  test("installConstructorOverride preserves construct even over a method native", () => {
    const viaMethod: Record<string, unknown> = { x: makeMethod() };
    const viaCtor: Record<string, unknown> = { x: makeMethod() };

    installOverride(viaMethod, "x", makeCtor(), 0);
    installConstructorOverride(viaCtor, "x", makeCtor(), 0);

    expect(isConstructible(viaMethod.x)).toBe(false);
    expect(isConstructible(viaCtor.x)).toBe(true);
  });

  test("installConstructorOverride works on a target with no existing native", () => {
    // The inference has nothing to read here, so the explicit helper is the only
    // way to get a constructible override onto a fresh property.
    const target: Record<string, unknown> = {};
    installConstructorOverride(target, "Fresh", makeCtor(), 0);

    expect(isConstructible(target.Fresh)).toBe(true);
  });
});
