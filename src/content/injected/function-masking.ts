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
 * The native TypeError message thrown when toString is called on a non-function.
 * Captured during `initFunctionMasking()` and exported so iframe-patching can
 * throw the same message for consistency.
 */
export let nativeTypeErrorMessage =
  "Function.prototype.toString requires that 'this' be a Function";

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

/** Register a function in the override registry for toString masking. */
export function registerOverride(fn: AnyFunction, nativeName: string): void {
  overrideRegistry.set(fn, nativeName);
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
  // Set name to match the native function
  Object.defineProperty(fn, "name", {
    value: nativeName,
    configurable: true,
    enumerable: false,
    writable: false,
  });
  // Set length to match the native function's arity
  Object.defineProperty(fn, "length", {
    value: expectedLength,
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
export function stripConstruct(fn: AnyFunction): AnyFunction {
  // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: method shorthand destructuring for anti-fingerprint (no prototype/[[Construct]])
  return {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    method(this: any) {
      // Use Reflect.apply instead of fn.apply — Chrome's stack trace
      // leaks "Object.apply" which fails the arkenfox validScope check.
      // Reflect.apply doesn't appear as "Object.apply" in the stack.
      try {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, prefer-rest-params
        return Reflect.apply(fn, this, Array.prototype.slice.call(arguments) as unknown[]);
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
 */
export function installOverride(
  target: object,
  prop: string,
  overrideFn: AnyFunction,
  nativeLength?: number
): void {
  // Determine the expected length from the original function if not specified
  let expectedLength = nativeLength ?? 0;
  if (nativeLength === undefined) {
    const originalDescriptor = Object.getOwnPropertyDescriptor(target, prop);
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
  let finalFn = overrideFn;
  if ("prototype" in overrideFn) {
    const protoDesc = Object.getOwnPropertyDescriptor(overrideFn, "prototype");
    if (protoDesc && !protoDesc.configurable) {
      finalFn = stripConstruct(overrideFn);
    }
  }

  // Disguise the override as native BEFORE installing it on the target
  registerOverride(finalFn, prop);
  disguiseAsNative(finalFn, prop, expectedLength);

  const originalDescriptor = Object.getOwnPropertyDescriptor(target, prop);
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
    registerOverride(wrappedGet, `get ${prop}`);
    disguiseAsNative(wrappedGet, `get ${prop}`, 0);
    descriptor.get = wrappedGet as () => unknown;
  }
  if (accessors.set) {
    const wrappedSet = stripConstruct(accessors.set);
    registerOverride(wrappedSet, `set ${prop}`);
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
  // Capture the native TypeError message thrown when toString is called on
  // a non-function. We throw this ourselves in the pre-check below so that
  // only ONE "Function.toString" frame appears in Chrome's stack trace.
  // Without this, delegating to the original toString creates a second
  // native frame, shifting the caller frames and failing arkenfox test "o".
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    (originalCall as any).call(originalFunctionToString, Object.create(Function));
  } catch (e: unknown) {
    if (e instanceof TypeError) {
      nativeTypeErrorMessage = e.message;
    }
  }

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
      // Pre-check: throw TypeError directly for non-functions so only one
      // "Function.toString" frame appears in Chrome's stack trace. Without
      // this, the native toString adds a second frame that shifts the
      // caller chain and fails arkenfox's stack validation.
      if (typeof this !== "function") {
        throw new TypeError(nativeTypeErrorMessage);
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      return (originalCall as any).call(originalFunctionToString, this);
    },
  }.toString;
  registerOverride(toStringMethod, "toString");
  disguiseAsNative(toStringMethod, "toString", 0);
  Function.prototype.toString = toStringMethod;
}
