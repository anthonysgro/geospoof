/**
 * Property-Based Tests for Fingerprint Regression Fix
 * Feature: fingerprint-regression-fix
 */

import fc from "fast-check";

describe("Fingerprint Regression Fix Properties", () => {
  // ── Shared infrastructure replicating injected.ts registry logic ──

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyFunction = (...args: any[]) => any;
  let overrideRegistry: Map<AnyFunction, string>;
  let originalFunctionToString: typeof Function.prototype.toString;
  let originalCall: typeof Function.prototype.call;
  let toStringOverride: AnyFunction;

  // Store native references for cleanup
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const nativeToString = Function.prototype.toString;
  const NativeDate = Date;

  beforeEach(() => {
    overrideRegistry = new Map();
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalFunctionToString = Function.prototype.toString;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    originalCall = Function.prototype.call;

    // Install toString override using the fixed calling convention
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
    // Restore native Date
    globalThis.Date = NativeDate;
  });

  /**
   * Property 4: toString Override Correctness
   *
   * For any function f:
   * (a) If f is in the override registry with name N, toString returns
   *     "function N() { [native code] }"
   * (b) If f is NOT in the override registry, toString returns the exact
   *     same string as the original Function.prototype.toString
   * For any non-function value v, toString throws the same TypeError as
   * the original.
   *
   * **Validates: Requirements 3.1, 3.2, 3.3, 3.4, 8.5, 9.1, 9.2**
   */
  test("Feature: fingerprint-regression-fix, Property 4: toString Override Correctness", () => {
    fc.assert(
      fc.property(
        fc.stringMatching(/^[a-zA-Z_][a-zA-Z0-9_]{0,20}$/),
        fc.boolean(),
        (nativeName, shouldRegister) => {
          // Create a random function
          const fn: AnyFunction = function () {
            return 42;
          };

          if (shouldRegister) {
            // (a) Registered functions return native-looking string
            overrideRegistry.set(fn, nativeName);
            const result = Function.prototype.toString.call(fn);
            expect(result).toBe(`function ${nativeName}() { [native code] }`);
            // Cleanup for next iteration
            overrideRegistry.delete(fn);
          } else {
            // (b) Unregistered functions return the same as original toString
            const overrideResult = Function.prototype.toString.call(fn);
            const originalResult = nativeToString.call(fn);
            expect(overrideResult).toBe(originalResult);
          }
        }
      ),
      { numRuns: 100 }
    );
  });

  test("Feature: fingerprint-regression-fix, Property 4: toString Override Correctness - non-function this throws TypeError", () => {
    // Non-function this values should throw the same TypeError as the original
    const nonFunctionValues: unknown[] = [null, undefined, 42, "hello", { key: "value" }, true];

    for (const value of nonFunctionValues) {
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

      // Both should throw
      expect(originalError).toBeInstanceOf(TypeError);
      expect(overrideError).toBeInstanceOf(TypeError);
      // Both should be TypeErrors with matching constructor
      expect(overrideError!.constructor).toBe(originalError!.constructor);
    }
  });

  // ── Date constructor override helpers ──

  /**
   * Install the Date constructor override replicating injected.ts logic.
   * Returns the OriginalDate reference for assertions.
   */
  function installDateOverride(): DateConstructor {
    const OriginalDate = Date;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function DateOverride(this: any, ...args: any[]): any {
      if (!new.target) {
        return OriginalDate();
      }
      if (args.length === 0) return new OriginalDate();
      if (args.length === 1) return new OriginalDate(args[0] as number | string);
      return new OriginalDate(
        args[0] as number,
        args[1] as number,
        (args[2] ?? 1) as number,
        (args[3] ?? 0) as number,
        (args[4] ?? 0) as number,
        (args[5] ?? 0) as number,
        (args[6] ?? 0) as number
      );
    }

    DateOverride.prototype = OriginalDate.prototype;

    Object.defineProperty(DateOverride, "name", {
      value: "Date",
      configurable: true,
      enumerable: false,
      writable: false,
    });

    Object.defineProperty(DateOverride, "length", {
      value: 7,
      configurable: true,
      enumerable: false,
      writable: false,
    });

    const skipProps = new Set(["prototype", "name", "length", "parse"]);
    for (const prop of Object.getOwnPropertyNames(OriginalDate)) {
      if (skipProps.has(prop)) continue;
      const desc = Object.getOwnPropertyDescriptor(OriginalDate, prop);
      if (desc) {
        Object.defineProperty(DateOverride, prop, desc);
      }
    }

    Object.defineProperty(DateOverride, "parse", {
      value: OriginalDate.parse,
      configurable: true,
      enumerable: false,
      writable: true,
    });

    Object.setPrototypeOf(DateOverride, Function.prototype);

    globalThis.Date = DateOverride as unknown as DateConstructor;

    Object.defineProperty(OriginalDate.prototype, "constructor", {
      value: DateOverride,
      configurable: true,
      enumerable: false,
      writable: true,
    });

    overrideRegistry.set(DateOverride as AnyFunction, "Date");
    overrideRegistry.set((DateOverride as unknown as DateConstructor).now, "now");
    overrideRegistry.set((DateOverride as unknown as DateConstructor).UTC, "UTC");

    return OriginalDate;
  }

  /**
   * Property 1: Date Constructor Identity Descriptors
   *
   * Date.name === "Date" with {configurable: true, enumerable: false, writable: false}
   * Date.length === 7 with {configurable: true, enumerable: false, writable: false}
   *
   * **Validates: Requirements 1.1, 1.2, 1.3, 6.3**
   */
  test("Feature: fingerprint-regression-fix, Property 1: Date Constructor Identity Descriptors", () => {
    installDateOverride();

    fc.assert(
      fc.property(fc.constant(null), () => {
        // Verify Date.name
        expect(Date.name).toBe("Date");
        const nameDesc = Object.getOwnPropertyDescriptor(Date, "name");
        expect(nameDesc).toBeDefined();
        expect(nameDesc!.value).toBe("Date");
        expect(nameDesc!.configurable).toBe(true);
        expect(nameDesc!.enumerable).toBe(false);
        expect(nameDesc!.writable).toBe(false);

        // Verify Date.length
        expect(Date.length).toBe(7);
        const lengthDesc = Object.getOwnPropertyDescriptor(Date, "length");
        expect(lengthDesc).toBeDefined();
        expect(lengthDesc!.value).toBe(7);
        expect(lengthDesc!.configurable).toBe(true);
        expect(lengthDesc!.enumerable).toBe(false);
        expect(lengthDesc!.writable).toBe(false);

        // Verify Date.prototype.constructor.name (Requirement 6.3)
        expect(Date.prototype.constructor.name).toBe("Date");
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 2: Date Constructor Prototype Chain Integrity
   *
   * For any Date instance created via new Date(...):
   * - Date.prototype === OriginalDate.prototype
   * - Date.prototype.constructor === Date
   * - new Date() instanceof Date === true
   * - Object.getPrototypeOf(Date) === Function.prototype
   *
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4, 6.1**
   */
  test("Feature: fingerprint-regression-fix, Property 2: Date Constructor Prototype Chain Integrity", () => {
    const OriginalDate = installDateOverride();

    // Generator for various Date constructor argument patterns
    const dateArgsArb = fc.oneof(
      // No args
      fc.constant([] as unknown[]),
      // Single number (epoch ms)
      fc.integer({ min: -8640000000000000, max: 8640000000000000 }).map((n) => [n]),
      // Single string
      fc.constant(["2024-06-15T12:00:00Z"]),
      // Multi-arg: year, month
      fc
        .tuple(fc.integer({ min: 1970, max: 2100 }), fc.integer({ min: 0, max: 11 }))
        .map(([y, m]) => [y, m]),
      // Multi-arg: year, month, day, hours, minutes, seconds
      fc
        .tuple(
          fc.integer({ min: 1970, max: 2100 }),
          fc.integer({ min: 0, max: 11 }),
          fc.integer({ min: 1, max: 28 }),
          fc.integer({ min: 0, max: 23 }),
          fc.integer({ min: 0, max: 59 }),
          fc.integer({ min: 0, max: 59 })
        )
        .map(([y, mo, d, h, mi, s]) => [y, mo, d, h, mi, s])
    );

    fc.assert(
      fc.property(dateArgsArb, (args) => {
        // Prototype chain invariants
        expect(Date.prototype).toBe(OriginalDate.prototype);
        expect(Date.prototype.constructor).toBe(Date);
        expect(Object.getPrototypeOf(Date)).toBe(Function.prototype);

        // instanceof check with constructed instance
        const instance = new (Date as unknown as new (...a: unknown[]) => Date)(...args);
        expect(instance instanceof Date).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 3: Date Static Property Completeness
   *
   * For any own property name on the native Date constructor, the replacement
   * Date constructor also has that property with the same typeof.
   *
   * **Validates: Requirements 2.5**
   */
  test("Feature: fingerprint-regression-fix, Property 3: Date Static Property Completeness", () => {
    const OriginalDate = installDateOverride();

    fc.assert(
      fc.property(fc.constant(null), () => {
        const originalProps = Object.getOwnPropertyNames(OriginalDate);
        for (const prop of originalProps) {
          expect(Date).toHaveProperty(prop);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          const origType = typeof (OriginalDate as any)[prop];
          // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
          const replType = typeof (Date as any)[prop];
          expect(replType).toBe(origType);
        }
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 5: Date Static Method toString Masking
   *
   * For each of the Date static methods (Date.parse, Date.now, Date.UTC)
   * and the constructor itself (Date, Date.prototype.constructor), calling
   * .toString() returns the corresponding native function string.
   *
   * **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 6.2**
   */
  test("Feature: fingerprint-regression-fix, Property 5: Date Static Method toString Masking", () => {
    installDateOverride();

    fc.assert(
      fc.property(fc.constant(null), () => {
        // Date.toString() → "function Date() { [native code] }"
        expect(Date.toString()).toBe("function Date() { [native code] }");

        // Date.parse.toString() → "function parse() { [native code] }"
        expect(Date.parse.toString()).toBe("function parse() { [native code] }");

        // Date.now.toString() → "function now() { [native code] }"
        expect(Date.now.toString()).toBe("function now() { [native code] }");

        // Date.UTC.toString() → "function UTC() { [native code] }"
        expect(Date.UTC.toString()).toBe("function UTC() { [native code] }");

        // Date.prototype.constructor.toString() → "function Date() { [native code] }"
        expect(Date.prototype.constructor.toString()).toBe("function Date() { [native code] }");

        // Date.prototype.constructor === Date (consistency check)
        expect(Date.prototype.constructor).toBe(Date);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 6: valueOf and toPrimitive Numeric Consistency
   *
   * For any Date instance created by the replacement constructor,
   * valueOf() === getTime() and [Symbol.toPrimitive]("number") === getTime().
   *
   * **Validates: Requirements 7.1, 7.2**
   */
  test("Feature: fingerprint-regression-fix, Property 6: valueOf and toPrimitive Numeric Consistency", () => {
    installDateOverride();

    const epochArb = fc.integer({ min: -8640000000000000, max: 8640000000000000 });

    fc.assert(
      fc.property(epochArb, (epoch) => {
        const d = new Date(epoch);
        const time = d.getTime();

        // valueOf must equal getTime
        expect(d.valueOf()).toBe(time);

        // Symbol.toPrimitive with "number" hint must equal getTime
        expect(d[Symbol.toPrimitive]("number")).toBe(time);
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 7: toPrimitive String Hint Consistency
   *
   * For any Date instance created by the replacement constructor,
   * [Symbol.toPrimitive]("string") === toString().
   *
   * **Validates: Requirements 7.3**
   */
  test("Feature: fingerprint-regression-fix, Property 7: toPrimitive String Hint Consistency", () => {
    installDateOverride();

    const epochArb = fc.integer({ min: -8640000000000000, max: 8640000000000000 });

    fc.assert(
      fc.property(epochArb, (epoch) => {
        const d = new Date(epoch);

        // Symbol.toPrimitive with "string" hint must equal toString()
        expect(d[Symbol.toPrimitive]("string")).toBe(d.toString());
      }),
      { numRuns: 100 }
    );
  });

  /**
   * Property 8: Minimal Override Surface
   *
   * Function.prototype.call, .apply, .bind, Object.getOwnPropertyDescriptor,
   * Object.defineProperty, and Object.prototype are unmodified by the override
   * installation.
   *
   * **Validates: Requirements 8.1, 8.2, 8.3**
   */
  test("Feature: fingerprint-regression-fix, Property 8: Minimal Override Surface", () => {
    // Capture native references BEFORE installing overrides
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const nativeCall = Function.prototype.call;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const nativeApply = Function.prototype.apply;
    // eslint-disable-next-line @typescript-eslint/unbound-method
    const nativeBind = Function.prototype.bind;
    const nativeGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor;
    const nativeDefineProperty = Object.defineProperty;
    const nativeObjectPrototype = Object.prototype;

    installDateOverride();

    fc.assert(
      fc.property(fc.constant(null), () => {
        // Function.prototype methods other than toString must be unmodified
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(Function.prototype.call).toBe(nativeCall);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(Function.prototype.apply).toBe(nativeApply);
        // eslint-disable-next-line @typescript-eslint/unbound-method
        expect(Function.prototype.bind).toBe(nativeBind);

        // Object reflection APIs must be unmodified
        expect(Object.getOwnPropertyDescriptor).toBe(nativeGetOwnPropertyDescriptor);
        expect(Object.defineProperty).toBe(nativeDefineProperty);

        // Object.prototype must be unmodified
        expect(Object.prototype).toBe(nativeObjectPrototype);
      }),
      { numRuns: 100 }
    );
  });
});
