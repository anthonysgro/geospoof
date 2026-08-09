/**
 * Function masking infrastructure for anti-fingerprinting.
 *
 * Provides the override registry, toString masking, and utilities to make
 * overridden JS functions indistinguishable from native functions.
 *
 * Must be initialized (via `initFunctionMasking()`) before any other
 * override module registers functions.
 */

import type { AnyFunction } from "./types";
import { overrideRegistry, originalFunctionToString, originalCall } from "./state";

/**
 * This injected script's own URL, captured once at module load from a throwaway
 * stack. In a `world: "MAIN"` content script this is the
 * `chrome-extension://<id>/…` (or `moz-extension://…` / `safari-web-extension://…`)
 * resource URL. Used by `stripExtensionFramesFromStack` to remove our own frames
 * from thrown-error stacks so a page can't read the extension id off an error a
 * fingerprinter provokes. `null` when it can't be determined (scrubbing then
 * no-ops). Restricted to extension schemes so we never strip a page's own frames.
 */
const SELF_SCRIPT_URL: string | null = (() => {
  try {
    const stack = new Error().stack;
    if (typeof stack !== "string") return null;
    const match = stack.match(
      /((?:chrome-extension|moz-extension|safari-web-extension):\/\/[^\s):]+)/
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
})();

/**
 * Remove any stack frames that reference this injected script from a thrown
 * error, in place. After scrubbing, an error the browser threw from inside one
 * of our overrides looks like the native throw a page would see with no
 * extension present (message + the page's own frames). No-op when the self URL
 * is unknown or the stack isn't a writable string. Blink-relevant: Firefox and
 * Safari already anonymize content-script frames, but scrubbing is harmless there.
 */
export function stripExtensionFramesFromStack(err: unknown): void {
  // Duck-type instead of `instanceof Error`: an error thrown in an iframe realm
  // is an instance of THAT realm's Error, so a top-realm `instanceof Error`
  // check is false for it and would skip scrubbing — leaking the extension id
  // through the iframe cascade. Any object with a writable string `stack`
  // qualifies, which is exactly what we need cross-realm.
  if (!SELF_SCRIPT_URL || err === null || typeof err !== "object") return;
  const e = err as { stack?: unknown };
  if (typeof e.stack !== "string") return;
  const cleaned = e.stack
    .split("\n")
    .filter((line) => !line.includes(SELF_SCRIPT_URL))
    .join("\n");
  try {
    e.stack = cleaned;
  } catch {
    // `stack` is non-configurable on some engines — leave it as-is.
  }
}

/**
 * This injected script's own resource URL (`chrome-extension://<id>/…`), or
 * `null` when it couldn't be determined. Exposed for the error-report
 * sanitizer, which needs to recognize our-origin uncaught errors to scrub the
 * `ErrorEvent.filename` / `window.onerror` `source` channel (which
 * `stripExtensionFramesFromStack` — a `.stack`-only scrub — can't reach).
 */
export function getSelfScriptUrl(): string | null {
  return SELF_SCRIPT_URL;
}

/** Register a function in the override registry for toString masking. */
export function registerOverride(fn: AnyFunction, nativeName: string): void {
  overrideRegistry.set(fn, nativeName);
}

/**
 * Whether this engine's native accessor `toString()` carries the same `get `/`set `
 * prefix that its `.name` carries. Engines disagree, and the difference is visible:
 *
 *   - **V8**: `.name` is `"get size"` and `toString()` is
 *     `"function get size() { [native code] }"` — prefixed in both.
 *   - **SpiderMonkey**: `.name` is `"get size"` but `toString()` is
 *     `"function size() {\n    [native code]\n}"` — prefixed in `name` ONLY.
 *
 * Masking every accessor as `function get <prop>()` therefore matched V8 and stood
 * out on Firefox, where every genuine accessor omits the prefix. Confirmed against
 * live controls: `Navigator.prototype.userAgent`, `vendor` and
 * `hardwareConcurrency` all report `function <prop>()` on Firefox, while our
 * overridden `language` reported `function get language()`.
 *
 * Derived at runtime from `Map.prototype.size` — a native accessor we never
 * override, present on every engine we support — rather than branched on a
 * build-time engine flag, so a future engine or a change in either engine's
 * formatting is picked up automatically. Same approach as the `[native code]`
 * surround derivation in {@link initFunctionMasking}.
 */
const nativeAccessorToStringIsPrefixed: boolean = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: the detached getter is only ever passed to toString, never invoked
    const nativeGet = Object.getOwnPropertyDescriptor(Map.prototype, "size")?.get;
    if (typeof nativeGet !== "function") return true; // assume V8 shape
    // Must use the captured original: our own toString patch may already be live.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    const src: unknown = (originalCall as any).call(originalFunctionToString, nativeGet);
    return typeof src === "string" && src.includes("get size");
  } catch {
    return true;
  }
})();

/**
 * The name an accessor override should be MASKED as, for `toString()` purposes.
 *
 * Not the same as its `.name`, which keeps the `get `/`set ` prefix on every
 * engine — see {@link nativeAccessorToStringIsPrefixed}.
 */
export function accessorMaskName(kind: "get" | "set", prop: string): string {
  return nativeAccessorToStringIsPrefixed ? `${kind} ${prop}` : prop;
}

/**
 * Make a JS function indistinguishable from a native function by:
 * - Setting name/length to match the original
 * - Deleting the prototype property (native functions don't have one)
 * - Ensuring ownKeys returns only ["length", "name"]
 */
export function disguiseAsNative(
  fn: AnyFunction,
  nativeName: string,
  expectedLength: number
): void {
  // `length` BEFORE `name`: native functions enumerate as ["length","name"] on
  // both V8 and SpiderMonkey, and SpiderMonkey reifies these lazily — so the
  // order we define them in becomes the order `Reflect.ownKeys` reports. Defining
  // `name` first produced ["name","length"], which differs from every native and
  // is trivially enumerable. V8 is unaffected (both are already own properties by
  // then, and redefining preserves position), so this is correct on both.
  Object.defineProperty(fn, "length", {
    value: expectedLength,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  // Set name to match the native function
  Object.defineProperty(fn, "name", {
    value: nativeName,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  // Native non-constructor functions don't have a prototype property.
  // Arrow functions already lack prototype (no-op). Function expressions
  // need it deleted. Do NOT call this on DateOverride — Date is a constructor.
  // Guard: only delete if the property is configurable. In strict mode,
  // deleting a non-configurable property throws TypeError.
  if ("prototype" in fn) {
    const desc = Object.getOwnPropertyDescriptor(fn, "prototype");
    if (desc?.configurable) {
      delete (fn as { prototype?: unknown }).prototype;
    }
  }
}

/**
 * Wrap a function expression in a method-shorthand wrapper so that
 * the result has no `prototype` property and no `[[Construct]]` internal
 * slot, matching native method behaviour. Unlike Proxy, method shorthand
 * is not detectable by Firefox's "incompatible Proxy" error checks.
 *
 * The wrapper preserves `this` binding from the caller.
 */
/**
 * Whether `fn` has an internal `[[Construct]]` method — i.e. whether `new fn()`
 * is legal — determined WITHOUT running it.
 *
 * A Proxy is given a `[[Construct]]` slot only when its target has one, and a
 * `construct` trap intercepts the call before the target's body ever executes. So
 * wrapping and constructing the proxy is a pure query: no side effects, no real
 * instance allocated, safe to run against arbitrary natives at document_start.
 *
 * The obvious alternatives don't work. `"prototype" in fn` is false for arrow
 * functions but true for plenty of non-constructors, `typeof` can't see the
 * distinction at all, and `fn.toString()` is unreliable on natives (and on
 * anything we've already masked). The internal slot is not otherwise reflectable,
 * so the Proxy probe is the only accurate check.
 */
export function isConstructible(fn: unknown): boolean {
  if (typeof fn !== "function") return false;
  try {
    Reflect.construct(
      new Proxy(fn as AnyFunction, { construct: () => ({}) }) as unknown as new () => object,
      []
    );
    return true;
  } catch {
    return false;
  }
}

export function stripConstruct(fn: AnyFunction): AnyFunction {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: method shorthand destructuring for anti-fingerprint (no prototype/[[Construct]])
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    method(this: any) {
      // Use Reflect.apply instead of fn.apply — Chrome's stack trace
      // leaks "Object.apply" which fails the arkenfox validScope check.
      // Reflect.apply doesn't appear as "Object.apply" in the stack.
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, prefer-rest-params
        const result = Reflect.apply(fn, this, Array.prototype.slice.call(arguments) as unknown[]);
        // Async twin of the catch below: a Promise-returning WebIDL op
        // (permissions.query, RTCPeerConnection.getStats, serviceWorker.register)
        // does NOT throw on a foreign `this` — it REJECTS, and the rejection's
        // Error carries our injected frame. A synchronous try/catch can't see
        // that, so if the override returned a thenable we attach a rejection
        // scrub. This closes the async stack leak for every method routed
        // through here — present and future — instead of each Promise-returning
        // override having to hand-roll its own `.catch` scrub.
        if (result != null && typeof (result as { then?: unknown }).then === "function") {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          return (result as Promise<any>).then(undefined, (err: unknown) => {
            stripExtensionFramesFromStack(err);
            throw err;
          });
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return
        return result;
      } catch (err) {
        // Single choke point for every installOverride-wrapped method: when the
        // wrapped override throws (its own brand/arg error, or the native error
        // it delegates to on a foreign `this`), strip our injected-script frames
        // from the stack so a page can't read the extension id off it (Blink
        // shows a chrome-extension:// frame; Firefox/Safari already anonymize).
        // The scrub early-returns when there's no stack/URL, so the success path
        // and non-leaking engines pay nothing.
        stripExtensionFramesFromStack(err);
        throw err;
      }
    },
  }.method;
}

/**
 * Install an override on a target object's property, preserving the
 * original property descriptor flags and registering the function for
 * toString masking. The override function is disguised as a native function.
 *
 * If the override is a `function` expression (has non-configurable
 * `prototype`), it is automatically wrapped in a method-shorthand so
 * that fingerprinting checks for `prototype`, `[[Construct]]`, class
 * extends, descriptor enumeration, etc. all pass.
 *
 * That wrap is skipped when the value being replaced is itself constructible, so
 * a constructor passed here keeps its `[[Construct]]` rather than being quietly
 * broken. Prefer {@link installConstructorOverride} for constructors anyway —
 * it says so at the call site and handles the statics — and
 * {@link installScrubbedAccessor} for accessors. But the shape is derived from
 * the native, not from which helper you picked, so choosing wrong is no longer
 * fatal. See {@link isConstructible} and GitHub #67/#68/#69.
 */
export function installOverride(
  target: object,
  prop: string,
  overrideFn: AnyFunction,
  nativeLength?: number
): void {
  const originalDescriptor = Object.getOwnPropertyDescriptor(target, prop);

  // Determine the expected length from the original function if not specified
  let expectedLength = nativeLength ?? 0;
  if (nativeLength === undefined) {
    if (originalDescriptor && typeof originalDescriptor.value === "function") {
      expectedLength = (originalDescriptor.value as AnyFunction).length;
    } else if (originalDescriptor && typeof originalDescriptor.get === "function") {
      expectedLength = (originalDescriptor.get as AnyFunction).length;
    }
  }

  // If the function has a non-configurable prototype (i.e. it's a function
  // expression), wrap it in a Proxy-over-arrow to strip [[Construct]] and
  // the prototype property. This makes it indistinguishable from a native
  // method under fingerprinting checks (f, i, j, k, l, m, n tests).
  //
  // Skipped when the value being REPLACED is itself constructible. The native is
  // the ground truth for the shape the replacement must have, and it is sitting
  // right there in `target[prop]` — so derive the method-vs-constructor decision
  // instead of trusting the caller to remember it. Getting it wrong in this
  // direction is not a fingerprinting tell, it breaks the page outright:
  // `new Intl.PluralRules()` throws while every surface probe still looks native.
  // That is what shipped in 2.1.0 (GitHub #67/#68/#69). Constructors should still
  // use `installConstructorOverride` so the call site reads clearly; this check is
  // what makes forgetting to non-fatal.
  let finalFn = overrideFn;
  if ("prototype" in overrideFn && !isConstructible(originalDescriptor?.value)) {
    const protoDesc = Object.getOwnPropertyDescriptor(overrideFn, "prototype");
    if (protoDesc && !protoDesc.configurable) {
      finalFn = stripConstruct(overrideFn);
    }
  }

  // Disguise the override as native BEFORE installing it on the target
  registerOverride(finalFn, prop);
  disguiseAsNative(finalFn, prop, expectedLength);

  if (originalDescriptor) {
    Object.defineProperty(target, prop, {
      value: finalFn,
      configurable: originalDescriptor.configurable,
      enumerable: originalDescriptor.enumerable,
      writable: originalDescriptor.writable,
    });
  } else {
    Object.defineProperty(target, prop, {
      value: finalFn,
      configurable: true,
      enumerable: false,
      writable: true,
    });
  }
}

/**
 * Install an override for a native **constructor** — the constructor twin of
 * {@link installOverride}.
 *
 * Preserves `[[Construct]]` unconditionally, where {@link installOverride}
 * decides by inspecting the value being replaced. Two reasons to prefer this at a
 * constructor call site: it states the intent where a reader will see it, and it
 * does not depend on the native already being installed at `target[prop]` for the
 * inference to have anything to go on.
 *
 * Background on why the distinction matters: {@link stripConstruct} returns a
 * method-shorthand function with no `[[Construct]]` slot, which is exactly right
 * for the prototype *methods* it was written for and exactly wrong for a
 * constructor — the result still reports `typeof "function"` and a `[native code]`
 * `toString()`, but `new X()` throws "is not a constructor". That combination
 * shipped in 2.1.0 and broke real sites (GitHub #67/#68/#69); every surface probe
 * looked native, so only an actual `new` call revealed it.
 *
 * Note that re-pinning `.prototype` afterwards does NOT undo the damage: a
 * function's visible `prototype` property and its internal `[[Construct]]` slot
 * are independent, and the latter can't be restored with `defineProperty`.
 *
 * What this does keep from `installOverride`: registration for `toString`
 * masking, the native `name`/`length` disguise, and the target's original
 * property-descriptor flags. `disguiseAsNative` is safe to use here — it only
 * deletes `prototype` when that property is configurable, which it never is on a
 * function expression.
 *
 * Callers remain responsible for constructor-specific fidelity that varies per
 * API: re-pinning `prototype` to the native one (so `instanceof` and brand checks
 * hold) and copying statics such as `supportedLocalesOf`.
 */
export function installConstructorOverride(
  target: object,
  prop: string,
  overrideCtor: AnyFunction,
  nativeLength?: number
): void {
  let expectedLength = nativeLength ?? 0;
  if (nativeLength === undefined) {
    const originalDescriptor = Object.getOwnPropertyDescriptor(target, prop);
    if (originalDescriptor && typeof originalDescriptor.value === "function") {
      expectedLength = (originalDescriptor.value as AnyFunction).length;
    }
  }

  // No stripConstruct: [[Construct]] is the whole point.
  registerOverride(overrideCtor, prop);
  disguiseAsNative(overrideCtor, prop, expectedLength);

  const originalDescriptor = Object.getOwnPropertyDescriptor(target, prop);
  Object.defineProperty(target, prop, {
    value: overrideCtor,
    configurable: originalDescriptor?.configurable ?? true,
    enumerable: originalDescriptor?.enumerable ?? false,
    writable: originalDescriptor?.writable ?? true,
  });
}

/**
 * Install an accessor (getter and/or setter) override — the accessor twin of
 * {@link installOverride}.
 *
 * Both the getter and setter are wrapped with {@link stripConstruct}, exactly
 * like method overrides, so:
 *  - they share the one wrapper implementation (no second copy of the
 *    `Reflect.apply` + stack-scrub logic to keep in sync), and
 *  - a foreign-`this` call that makes the native fallback throw has our
 *    injected-script frames stripped from the error — closing the extension-id
 *    stack leak for accessors the same way it's closed for methods.
 *
 * The wrapper is method-shorthand, so the installed accessor has no `prototype`
 * and no `[[Construct]]` — matching a native accessor's shape (an improvement
 * over a bare function-expression getter, which carries a `prototype`).
 *
 * Descriptor flags are copied from the target's existing descriptor so the
 * result matches the native WebIDL shape without hardcoding it. Every override
 * installed through this path is scrubbed by construction — there is no list to
 * keep up to date.
 */
export function installScrubbedAccessor(
  target: object,
  prop: string,
  accessors: { get?: AnyFunction; set?: AnyFunction }
): void {
  const originalDescriptor = Object.getOwnPropertyDescriptor(target, prop);
  const descriptor: PropertyDescriptor = {
    configurable: originalDescriptor?.configurable ?? true,
    enumerable: originalDescriptor?.enumerable ?? true,
  };
  if (accessors.get) {
    const wrappedGet = stripConstruct(accessors.get);
    // The MASK name drops the `get ` prefix on engines whose native accessors do
    // (SpiderMonkey); the `.name` keeps it on every engine. See accessorMaskName.
    registerOverride(wrappedGet, accessorMaskName("get", prop));
    disguiseAsNative(wrappedGet, `get ${prop}`, 0);
    descriptor.get = wrappedGet as () => unknown;
  }
  if (accessors.set) {
    const wrappedSet = stripConstruct(accessors.set);
    registerOverride(wrappedSet, accessorMaskName("set", prop));
    disguiseAsNative(wrappedSet, `set ${prop}`, 1);
    descriptor.set = wrappedSet as (value: unknown) => void;
  }
  Object.defineProperty(target, prop, descriptor);
}

/**
 * Install the `Function.prototype.toString` override.
 *
 * Must be called before any other module registers overrides, so that
 * all subsequent `registerOverride` calls are masked by the patched toString.
 */
export function initFunctionMasking(): void {
  // Derive the engine-specific "[native code]" surround format by
  // splitting a known-native function's toString output. Chrome/V8
  // returns "function Number() { [native code] }" (single line) and
  // Firefox/SpiderMonkey returns "function Number() {\n    [native
  // code]\n}" (multi-line, 4-space indent). CreepJS's getClientCode
  // reconstructs the expected string using this same split, so our
  // mask must match whatever shape the host engine produces or we
  // get flagged as "non-native code" in their "code:" worker hash.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-assignment
  const numberSrc: string = (originalCall as any).call(originalFunctionToString, Number);
  const splitParts = numberSrc.split("Number");
  const nativeP1 = splitParts[0] ?? "function ";
  const nativeP2 = splitParts[1] ?? "() { [native code] }";

  // Method shorthand has no `prototype`, no `[[Construct]]`, and
  // `.arguments`/`.caller` throw TypeError — matching native methods
  // without using Proxy (which Firefox detects).
  // All logic is inlined to avoid extra stack frames in Chrome's TypeError
  // traces (arkenfox getNewObjectToStringTypeErrorLie / test "o").
  // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: method shorthand destructuring for anti-fingerprint (no prototype/[[Construct]])
  const toStringMethod = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toString(this: any): string {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const nativeName = overrideRegistry.get(this);
      if (nativeName !== undefined) {
        return nativeP1 + nativeName + nativeP2;
      }
      // Delegate every non-masked receiver to the original native toString.
      // For a valid function this returns its native source string; for a
      // receiver the native toString rejects (e.g. a non-function `this` — the
      // `const f = x.toString; f()` detach pattern a fingerprinter uses) the
      // engine throws its genuine TypeError, carrying the authentic
      // `at Object.toString (<anonymous>)` builtin frame and per-engine message.
      // We then scrub only our injected-script frame from that error's stack so
      // a page can't read the extension id off it.
      //
      // Delegating — rather than throwing our own `new TypeError` — is the whole
      // point: a hand-thrown error has NO native builtin frame, so scrubbing our
      // frame would leave the stack one frame short of what a clean browser
      // produces, which is itself a tell. Delegate + scrub reproduces the native
      // stack exactly (verified against the extension-off stack). This mirrors
      // the delegate-then-scrub pattern every other override path already uses
      // (see reproduceNativeGeoError, the permissions query override, and the
      // stripConstruct wrapper).
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        return (originalCall as any).call(originalFunctionToString, this);
      } catch (err) {
        stripExtensionFramesFromStack(err);
        throw err;
      }
    },
  }.toString;
  registerOverride(toStringMethod, "toString");
  disguiseAsNative(toStringMethod, "toString", 0);
  Function.prototype.toString = toStringMethod;
}
