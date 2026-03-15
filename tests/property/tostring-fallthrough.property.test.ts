/**
 * Property-Based Tests for ToString Fallthrough Identity
 * Feature: prototype-lie-detection-fix, Property 6
 *
 * Validates: Requirements 6.5, 9.7
 *
 * For any function NOT in the override registry, calling
 * Function.prototype.toString.call(fn) returns the exact same string
 * as the original (pre-override) Function.prototype.toString.call(fn).
 * No observable side effects, altered exceptions, or behavioral differences.
 */

"use strict";

import fc from "fast-check";

describe("Prototype Lie Detection Fix — ToString Fallthrough Properties", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyFunction = (...args: any[]) => any;

  let overrideRegistry: Map<AnyFunction, string>;
  let originalFunctionToString: typeof Function.prototype.toString;
  let originalCall: typeof Function.prototype.call;

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeToString = Function.prototype.toString;

  beforeEach(() => {
    overrideRegistry = new Map();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalFunctionToString = Function.prototype.toString;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalCall = Function.prototype.call;

    // Install toString override matching injected.ts logic
    const toStringOverride = function (this: AnyFunction): string {
      const nativeName = overrideRegistry.get(this);
      if (nativeName !== undefined) {
        return `function ${nativeName}() { [native code] }`;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-return
      return (originalCall as any).call(originalFunctionToString, this);
    };
    Function.prototype.toString = toStringOverride;
    overrideRegistry.set(toStringOverride, "toString");
  });

  afterEach(() => {
    Function.prototype.toString = nativeToString;
  });

  /**
   * Property 6: ToString Fallthrough Identity — arrow functions
   *
   * For any arrow function NOT in the override registry,
   * the overridden toString returns the same string as the original.
   */
  test("Feature: prototype-lie-detection-fix, Property 6: ToString Fallthrough Identity — arrow functions", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (_n) => {
        // Create a fresh arrow function not in the registry
        const fn: AnyFunction = (..._args: unknown[]) => undefined;

        const overrideResult = Function.prototype.toString.call(fn);
        const originalResult = nativeToString.call(fn);

        expect(overrideResult).toBe(originalResult);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: ToString Fallthrough Identity — function expressions
   *
   * For any function expression NOT in the override registry,
   * the overridden toString returns the same string as the original.
   */
  test("Feature: prototype-lie-detection-fix, Property 6: ToString Fallthrough Identity — function expressions", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (_n) => {
        const fn: AnyFunction = function (..._args: unknown[]) {
          return undefined;
        };

        const overrideResult = Function.prototype.toString.call(fn);
        const originalResult = nativeToString.call(fn);

        expect(overrideResult).toBe(originalResult);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: ToString Fallthrough Identity — async functions
   *
   * For any async function NOT in the override registry,
   * the overridden toString returns the same string as the original.
   */
  test("Feature: prototype-lie-detection-fix, Property 6: ToString Fallthrough Identity — async functions", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (_n) => {
        // eslint-disable-next-line @typescript-eslint/require-await
        const fn: AnyFunction = async function (..._args: unknown[]) {
          return undefined;
        };

        const overrideResult = Function.prototype.toString.call(fn);
        const originalResult = nativeToString.call(fn);

        expect(overrideResult).toBe(originalResult);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: ToString Fallthrough Identity — generator functions
   *
   * For any generator function NOT in the override registry,
   * the overridden toString returns the same string as the original.
   */
  test("Feature: prototype-lie-detection-fix, Property 6: ToString Fallthrough Identity — generator functions", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (_n) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fn: any = function* (..._args: unknown[]) {
          yield undefined;
        };

        const overrideResult = Function.prototype.toString.call(fn);

        const originalResult = nativeToString.call(fn);

        expect(overrideResult).toBe(originalResult);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: ToString Fallthrough Identity — async arrow functions
   *
   * For any async arrow function NOT in the override registry,
   * the overridden toString returns the same string as the original.
   */
  test("Feature: prototype-lie-detection-fix, Property 6: ToString Fallthrough Identity — async arrow functions", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (_n) => {
        // eslint-disable-next-line @typescript-eslint/require-await
        const fn: AnyFunction = async (..._args: unknown[]) => undefined;

        const overrideResult = Function.prototype.toString.call(fn);
        const originalResult = nativeToString.call(fn);

        expect(overrideResult).toBe(originalResult);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: ToString Fallthrough Identity — class constructors
   *
   * For any class constructor NOT in the override registry,
   * the overridden toString returns the same string as the original.
   */
  test("Feature: prototype-lie-detection-fix, Property 6: ToString Fallthrough Identity — class constructors", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 100 }), (_n) => {
        class TestClass {
          value = 0;
        }

        const overrideResult = Function.prototype.toString.call(TestClass);
        const originalResult = nativeToString.call(TestClass);

        expect(overrideResult).toBe(originalResult);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: ToString Fallthrough Identity — native built-in functions
   *
   * For native built-in functions (Array.isArray, Object.keys, etc.),
   * the overridden toString returns the same string as the original.
   */
  test("Feature: prototype-lie-detection-fix, Property 6: ToString Fallthrough Identity — native built-ins", () => {
    const builtins: AnyFunction[] = [
      Array.isArray,
      Object.keys,
      Object.values,
      Object.entries,
      Object.assign,
      Object.freeze,
      JSON.stringify,
      JSON.parse,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      Math.max,
      Math.min,
      Math.floor,
      Math.ceil,
      Math.round,
      Math.random,
    ];

    fc.assert(
      fc.property(fc.integer({ min: 0, max: builtins.length - 1 }), (idx) => {
        const fn = builtins[idx];

        const overrideResult = Function.prototype.toString.call(fn);
        const originalResult = nativeToString.call(fn);

        expect(overrideResult).toBe(originalResult);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: ToString Fallthrough Identity — non-function this throws same error
   *
   * For non-function values, both the override and original toString throw
   * the same TypeError.
   */
  test("Feature: prototype-lie-detection-fix, Property 6: ToString Fallthrough Identity — non-function this throws TypeError", () => {
    const nonFunctions: unknown[] = [
      null,
      undefined,
      42,
      "hello",
      true,
      { key: "value" },
      [1, 2, 3],
      Symbol("test"),
    ];

    fc.assert(
      fc.property(fc.integer({ min: 0, max: nonFunctions.length - 1 }), (idx) => {
        const value = nonFunctions[idx];

        let originalError: Error | null = null;
        let overrideError: Error | null = null;

        try {
          nativeToString.call(value);
        } catch (e) {
          originalError = e as Error;
        }

        try {
          Function.prototype.toString.call(value);
        } catch (e) {
          overrideError = e as Error;
        }

        // Both should throw TypeError
        expect(originalError).toBeInstanceOf(TypeError);
        expect(overrideError).toBeInstanceOf(TypeError);
        expect(overrideError!.constructor).toBe(originalError!.constructor);
      }),
      { numRuns: 100 }
    );
  });
});
