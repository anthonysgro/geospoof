/**
 * Regression tests for function masking on the worker-patching support shims.
 *
 * `URL.createObjectURL`, `URL.revokeObjectURL`, and
 * `navigator.serviceWorker.register` are overridden by the content script so
 * inline workers can be intercepted. Native versions of these methods have NO
 * own `prototype` property and are NOT constructable. An override installed as
 * a bare `function` expression keeps both (the `prototype` is non-configurable
 * and survives `disguiseAsNative`'s delete), which a fingerprinter can detect
 * via `hasOwnProperty(fn, "prototype")`. The install path wraps each in
 * `stripConstruct` (method-shorthand) to match native shape — these tests lock
 * that behavior in so it can't silently regress.
 *
 * jsdom implements neither `URL.createObjectURL` nor `navigator.geolocation`
 * (which `state.ts` reads at module-eval time) nor `navigator.serviceWorker`,
 * so we polyfill native-shaped stand-ins BEFORE dynamically importing the
 * module under test.
 */

/* eslint-disable @typescript-eslint/unbound-method -- these tests deliberately
   inspect method identity/shape without calling the methods. */

import { describe, test, expect, beforeAll } from "vitest";

/** True when `fn` matches the shape of a native method (no own prototype). */
function hasOwnPrototype(fn: unknown): boolean {
  return typeof fn === "function" && Object.prototype.hasOwnProperty.call(fn, "prototype");
}

/** True when `fn` can be constructed with `new` (has a `[[Construct]]` slot). */
function isConstructable(fn: unknown): boolean {
  if (typeof fn !== "function") return false;
  try {
    Reflect.construct(fn as new () => unknown, []);
    return true;
  } catch (err) {
    // A TypeError with the "not a constructor" shape means no [[Construct]].
    // Any other throw (e.g. the override rejecting a bad argument) means the
    // function WAS entered as a constructor, so it IS constructable.
    return !(err instanceof TypeError && /not a constructor/i.test(String(err)));
  }
}

describe("worker-patching function masking", () => {
  beforeAll(async () => {
    // Native-shaped polyfills. Must be in place before the dynamic import
    // below so `state.ts` (imported transitively) can bind the geolocation
    // methods, and so installBlobUrlTracking / installServiceWorkerAnnouncer
    // don't early-return.
    const noop = (): void => {};
    Object.defineProperty(navigator, "geolocation", {
      value: { getCurrentPosition: noop, watchPosition: () => 0, clearWatch: noop },
      configurable: true,
    });
    // Mirror the real ServiceWorkerContainer shape: `register` is inherited
    // from the prototype, NOT an own property of the container instance. The
    // installer resolves the prototype via getPrototypeOf and installs there,
    // so a plain `{ register }` object would make it (correctly) no-op.
    const swProto = {
      register: function register(): Promise<unknown> {
        return Promise.resolve({});
      },
    };
    Object.defineProperty(navigator, "serviceWorker", {
      value: Object.create(swProto),
      configurable: true,
    });
    URL.createObjectURL = function createObjectURL(): string {
      return "blob:test";
    };
    URL.revokeObjectURL = function revokeObjectURL(): void {};

    const mod = await import("@/content/injected/worker-patching");
    mod.installWorkerPatching();
  });

  test("URL.createObjectURL override has no own prototype and is not constructable", () => {
    expect(hasOwnPrototype(URL.createObjectURL)).toBe(false);
    expect(isConstructable(URL.createObjectURL)).toBe(false);
  });

  test("URL.revokeObjectURL override has no own prototype and is not constructable", () => {
    expect(hasOwnPrototype(URL.revokeObjectURL)).toBe(false);
    expect(isConstructable(URL.revokeObjectURL)).toBe(false);
  });

  test("navigator.serviceWorker.register override has no own prototype and is not constructable", () => {
    const register = (navigator.serviceWorker as unknown as { register: unknown }).register;
    expect(hasOwnPrototype(register)).toBe(false);
    expect(isConstructable(register)).toBe(false);
  });

  test("navigator.serviceWorker.register is installed on the prototype, not the instance", () => {
    // Native `register` is inherited from ServiceWorkerContainer.prototype;
    // an own property on the instance is itself a detectable tell.
    const container = navigator.serviceWorker;
    expect(Object.prototype.hasOwnProperty.call(container, "register")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(Object.getPrototypeOf(container), "register")).toBe(
      true
    );
  });
});
