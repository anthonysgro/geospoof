/**
 * Regression: an accessor override must be shape-identical to a native accessor.
 *
 * arkenfox TZP reported `Navigator.language` and `Navigator.languages` as lies
 * while their VALUES were correct, so the tell was in the accessor itself. A
 * console battery against three untouched controls on the same prototype
 * (`userAgent`, `vendor`, `hardwareConcurrency`) found our overridden `language`
 * getter differing on three counts:
 *
 *   1. **Brand check.** `desc.get.call({})` returned `"ja-JP"`. Every native
 *      accessor throws `TypeError: 'get userAgent' called on an object that does
 *      not implement interface Navigator`. Fixed by delegating to the native
 *      getter FIRST, so it performs the check before we substitute — the shape
 *      `document.lastModified` already used.
 *   2. **`toString()` prefix.** Ours reported `function get language()`; Firefox
 *      natives report `function language()`. SpiderMonkey puts the `get ` prefix
 *      in `.name` only, while V8 puts it in both — so the mask has to be derived
 *      per engine rather than hardcoded.
 *   3. **Own-key order.** Ours enumerated `["name","length"]` against every
 *      native's `["length","name"]`, because SpiderMonkey reifies both lazily and
 *      `disguiseAsNative` defined `name` first.
 *
 * These assertions compare against a native control accessor obtained in the same
 * realm, so they hold on any engine instead of pinning one engine's strings.
 */
/* eslint-disable @typescript-eslint/unbound-method -- the whole point of this
   suite is to inspect DETACHED accessor functions and invoke them with explicit
   receivers, which is exactly what a fingerprinter does. */
import { describe, test, expect, beforeAll } from "vitest";

/** A native accessor we never override, present on every engine. */
function nativeControl(): { get: () => unknown; name: string; toStringSrc: string } {
  const get = Object.getOwnPropertyDescriptor(Map.prototype, "size")?.get;
  if (typeof get !== "function") throw new Error("no native control accessor available");
  return { get, name: get.name, toStringSrc: get.toString() };
}

let installScrubbedAccessor: typeof import("@/content/injected/function-masking").installScrubbedAccessor;

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
  const masking = await import("@/content/injected/function-masking");
  masking.initFunctionMasking();
  installScrubbedAccessor = masking.installScrubbedAccessor;
});

/** Install a getter on a throwaway object and hand back its descriptor. */
function installed(prop: string, get: (this: unknown) => unknown): PropertyDescriptor {
  const target: Record<string, unknown> = {};
  Object.defineProperty(target, prop, { get: () => "native", configurable: true });
  installScrubbedAccessor(target, prop, { get });
  const desc = Object.getOwnPropertyDescriptor(target, prop);
  if (!desc) throw new Error("descriptor missing after install");
  return desc;
}

describe("installScrubbedAccessor produces a native-shaped accessor", () => {
  test("own keys enumerate in the same order as a COLD native accessor", () => {
    // Read the control's keys before anything touches `name` or `length`.
    // SpiderMonkey reifies both lazily and the enumeration order is
    // access-sensitive: verified in Firefox that touching `.name` first can flip
    // a getter to ["name","length"], while a cold `Reflect.ownKeys` and a
    // `length`-first read both give ["length","name"]. The cold order is the one
    // a fingerprinter enumerating keys observes, so it is the one to match — and
    // it is why `disguiseAsNative` must define `length` before `name`.
    // `nativeControl()` is deliberately NOT used here: it reads `.name`.
    const coldControl = Object.getOwnPropertyDescriptor(Map.prototype, "size")?.get;
    if (typeof coldControl !== "function") throw new Error("no native control accessor");
    const control = Reflect.ownKeys(coldControl);

    const ours = Reflect.ownKeys(installed("probe", () => "x").get!);
    expect(ours).toEqual(control);
    // Pin the expected order too: if an engine ever changed it, matching the
    // control would still pass and silently hide the change.
    expect(ours).toEqual(["length", "name"]);
  });

  test("`name` carries the `get ` prefix, matching native", () => {
    const control = nativeControl();
    expect(control.name).toBe("get size"); // sanity: the control is what we think
    expect(installed("probe", () => "x").get!.name).toBe("get probe");
  });

  test("toString() carries the prefix only if the engine's natives do", () => {
    const control = nativeControl();
    // Does this engine put "get " in an accessor's toString? V8 yes, SpiderMonkey no.
    const enginePrefixes = control.toStringSrc.includes("get size");
    const ourSrc = installed("probe", () => "x").get!.toString();
    expect(ourSrc.includes("get probe")).toBe(enginePrefixes);
    if (!enginePrefixes) {
      // SpiderMonkey shape: bare property name, no prefix.
      expect(ourSrc).toContain("probe");
      expect(ourSrc).not.toContain("get probe");
    }
    expect(ourSrc).toContain("[native code]");
  });

  test("a getter that delegates to the native propagates its brand-check error", () => {
    // The pattern locale-overrides.ts now uses: call the native first so its
    // receiver check runs, then substitute. A foreign `this` must throw, not
    // return a spoofed value.
    const nativeSize = nativeControl().get;
    const desc = installed("probe", function (this: unknown) {
      Reflect.apply(nativeSize, this, []); // brand check — throws on a foreign this
      return "spoofed";
    });

    // Valid receiver: substitution happens.
    expect(Reflect.apply(desc.get!, new Map(), [])).toBe("spoofed");
    // Foreign receiver: the native's TypeError wins, no value leaks.
    expect(() => Reflect.apply(desc.get!, {}, [])).toThrow(TypeError);
  });

  test("a getter that substitutes BEFORE delegating leaks on a foreign `this`", () => {
    // The shipped bug, kept as a contrast so the fix above can't silently regress
    // back into this shape.
    const desc = installed("probe", function (this: unknown) {
      // Never consults `this`, so the receiver check never runs — the shipped shape.
      void this;
      return "spoofed";
    });
    expect(Reflect.apply(desc.get!, {}, [])).toBe("spoofed");
  });

  test("the accessor has no prototype and no [[Construct]]", () => {
    const get = installed("probe", () => "x").get!;
    expect(Object.prototype.hasOwnProperty.call(get, "prototype")).toBe(false);
    expect(() => Reflect.construct(get as unknown as new () => object, [])).toThrow();
  });
});
