/**
 * Property-Based Tests for Prototype Lie Detection Fix
 * Feature: prototype-lie-detection-fix
 */

"use strict";

import fc from "fast-check";

describe("Prototype Lie Detection Fix Properties", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyFunction = (...args: any[]) => any;
  let overrideRegistry: Map<AnyFunction, string>;
  let originalFunctionToString: typeof Function.prototype.toString;
  let originalCall: typeof Function.prototype.call;
  let toStringOverride: AnyFunction;

  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeToString = Function.prototype.toString;

  beforeEach(() => {
    overrideRegistry = new Map();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalFunctionToString = Function.prototype.toString;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalCall = Function.prototype.call;

    // Install toString override (function expression — uses `this`)
    toStringOverride = function (this: AnyFunction): string {
      const nativeName = overrideRegistry.get(this);
      if (nativeName !== undefined) {
        return `function ${nativeName}() { [native code] }`;
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      return (originalCall as any).call(originalFunctionToString, this);
    };
    Function.prototype.toString = toStringOverride;
    overrideRegistry.set(toStringOverride, "toString");
  });

  afterEach(() => {
    Function.prototype.toString = nativeToString;
  });

  /**
   * Helper: create an arrow-function override registered with a given name.
   */
  function createArrowOverride(name: string): AnyFunction {
    const fn: AnyFunction = (..._args: unknown[]) => undefined;
    Object.defineProperty(fn, "name", { value: name, configurable: true });
    overrideRegistry.set(fn, name);
    return fn;
  }

  /**
   * Helper: create a function-expression override registered with a given name.
   */
  function createFunctionExprOverride(name: string): AnyFunction {
    const fn: AnyFunction = function (..._args: unknown[]) {
      return undefined;
    };
    Object.defineProperty(fn, "name", { value: name, configurable: true });
    overrideRegistry.set(fn, name);
    return fn;
  }

  // Valid JS identifier generator for function names
  const identifierArb = fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,20}$/);

  /**
   * Property 1: Arguments and Caller Throw TypeError
   *
   * For any override function (arrow or function expression) defined inside
   * a "use strict" context:
   * - Accessing fn.arguments throws TypeError
   * - Accessing fn.caller throws TypeError
   * - Accessing fn.toString.arguments throws TypeError (transitive)
   * - Accessing fn.toString.caller throws TypeError (transitive)
   *
   * This is the critical fix: without strict mode, these return undefined
   * instead of throwing, causing arkenfox tests p and q to flag every
   * function on the page.
   *
   * Validates: Requirements 1.2, 1.3, 5.1, 5.2, 5.3, 5.4, 6.1, 6.2
   */
  test("Feature: prototype-lie-detection-fix, Property 1: Arguments and Caller Throw TypeError — arrow functions", () => {
    fc.assert(
      fc.property(identifierArb, (name) => {
        const fn = createArrowOverride(name);

        // Direct .arguments access must throw TypeError
        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          void (fn as any).arguments;
        }).toThrow(TypeError);

        // Direct .caller access must throw TypeError
        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          void (fn as any).caller;
        }).toThrow(TypeError);

        // Transitive: fn.toString resolves to our toString override via
        // the prototype chain. Accessing .arguments on it must throw.
        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          void (fn.toString as any).arguments;
        }).toThrow(TypeError);

        // Transitive: fn.toString.caller must also throw
        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          void (fn.toString as any).caller;
        }).toThrow(TypeError);

        overrideRegistry.delete(fn);
      }),
      { numRuns: 100 }
    );
  });

  test("Feature: prototype-lie-detection-fix, Property 1: Arguments and Caller Throw TypeError — function expressions", () => {
    fc.assert(
      fc.property(identifierArb, (name) => {
        const fn = createFunctionExprOverride(name);

        // Direct .arguments access must throw TypeError
        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          void (fn as any).arguments;
        }).toThrow(TypeError);

        // Direct .caller access must throw TypeError
        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          void (fn as any).caller;
        }).toThrow(TypeError);

        // Transitive: fn.toString.arguments must throw
        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          void (fn.toString as any).arguments;
        }).toThrow(TypeError);

        // Transitive: fn.toString.caller must throw
        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          void (fn.toString as any).caller;
        }).toThrow(TypeError);

        overrideRegistry.delete(fn);
      }),
      { numRuns: 100 }
    );
  });

  test("Feature: prototype-lie-detection-fix, Property 1: Arguments and Caller Throw TypeError — toString override itself", () => {
    fc.assert(
      fc.property(fc.constant(null), () => {
        // The toString override is the most critical case: if it fails
        // test q, EVERY function on the page gets flagged.
        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          void (Function.prototype.toString as any).arguments;
        }).toThrow(TypeError);

        expect(() => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          void (Function.prototype.toString as any).caller;
        }).toThrow(TypeError);
      }),
      { numRuns: 100 }
    );
  });
});
