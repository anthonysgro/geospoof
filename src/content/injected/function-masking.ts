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
      // eslint-disable-next-line @typescript-eslint/no-unsafe-return, prefer-rest-params
      return Reflect.apply(fn, this, Array.prototype.slice.call(arguments) as unknown[]);
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
        return `function ${nativeName}() { [native code] }`;
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
