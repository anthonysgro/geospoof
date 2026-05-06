/**
 * Standard detection battery generator.
 *
 * Produces eight TestDefinitions for a single overridden function-valued
 * property: toString masking, name, length, absence of own prototype,
 * non-constructability, descriptor flags, strict-mode .caller and
 * .arguments. These are the checks a typical fingerprinter combines to
 * distinguish an overridden function from a native one.
 *
 * Expected values come from one of two sources, in order of preference:
 *
 *   1. A clean same-origin iframe reference (via `cleanReferenceTarget`).
 *      For APIs the extension does NOT patch inside iframes — Date,
 *      Intl, Temporal, DOM mutation methods, iframe accessors — the
 *      iframe's copies are pristine and reveal the browser's true
 *      engine-specific defaults (length, descriptor flags). Using the
 *      iframe means the test's "expected" value is the user's own
 *      browser saying what native looks like, not a hardcoded guess.
 *
 *   2. Hardcoded fallbacks from the ECMAScript / WebIDL specifications.
 *      Used when no clean reference is available (e.g., for
 *      Function.prototype.toString, which the extension DOES patch
 *      inside iframes, so the iframe's copy is not clean).
 */

import { getCleanReference } from "./clean-reference"
import { describeProperty } from "./describe"
import type { TestDefinition, TestGroupId, TestResult } from "../types"

export interface StandardBatteryOptions {
  /** Stable test id prefix, e.g. "timezone-stealth.get-timezone-offset" */
  idPrefix: string
  /** Group these tests belong to. */
  group: TestGroupId
  /** Human-readable reference to the API (e.g. "Date.prototype.getTimezoneOffset"). */
  apiLabel: string
  /** The target object to probe (e.g. Date.prototype). */
  target: object
  /** The property name on target to profile. */
  propertyName: string
  /**
   * Expected native arity (fn.length). Used as a spec-based fallback when
   * no clean reference is available or the reference lookup fails.
   */
  expectedLength: number
  /**
   * When true, the subject is a constructor (e.g. Intl.DateTimeFormat,
   * the Date global). Constructors have an own `prototype` property and
   * ARE constructable, so the relevant tests flip their expectations.
   * Default: false (treats the subject as a plain method).
   */
  isConstructor?: boolean
  /**
   * Expected property descriptor flags. Used as a spec-based fallback
   * when no clean reference is available. Defaults to the ECMAScript
   * standard-library convention: writable, configurable, non-enumerable.
   * Override for APIs where the native descriptor differs (e.g. Web IDL
   * DOM methods, which are writable/configurable/enumerable).
   */
  expectedDescriptor?: {
    writable: boolean
    configurable: boolean
    enumerable: boolean
  }
  /**
   * Optional accessor for a clean reference target. When provided,
   * expected values for `length` and descriptor flags are harvested
   * from the iframe's equivalent property at test time rather than
   * using the hardcoded fallbacks. Example:
   *
   *   cleanReferenceTarget: (win) => win.Date.prototype
   *
   * When the iframe is unavailable or the property doesn't exist there,
   * the hardcoded fallbacks are used.
   */
  cleanReferenceTarget?: (win: Window & typeof globalThis) => object | null | undefined
}

const DEFAULT_DESCRIPTOR = {
  writable: true,
  configurable: true,
  enumerable: false,
}

/**
 * Resolve expected values for `length` and descriptor flags, preferring
 * the clean iframe reference when one is available. Returns the chosen
 * values plus a label explaining where they came from — so the test
 * report can cite its source.
 */
function resolveExpectations(
  options: StandardBatteryOptions
): {
  length: number
  descriptor: NonNullable<StandardBatteryOptions["expectedDescriptor"]>
  source: "clean-iframe" | "spec-fallback"
} {
  const fallback = {
    length: options.expectedLength,
    descriptor: options.expectedDescriptor ?? DEFAULT_DESCRIPTOR,
    source: "spec-fallback" as const,
  }

  if (!options.cleanReferenceTarget) return fallback

  const cleanTarget = getCleanReference(options.cleanReferenceTarget)
  if (!cleanTarget || typeof cleanTarget !== "object") return fallback

  const cleanProfile = describeProperty(
    cleanTarget,
    options.propertyName
  )
  if (!cleanProfile.exists || cleanProfile.length === null) return fallback

  const d = cleanProfile.descriptor
  if (!d || d.writable === null) return fallback

  return {
    length: cleanProfile.length,
    descriptor: {
      writable: d.writable,
      configurable: d.configurable,
      enumerable: d.enumerable,
    },
    source: "clean-iframe",
  }
}

export function buildStandardBattery(
  options: StandardBatteryOptions
): ReadonlyArray<TestDefinition> {
  const { idPrefix, group, apiLabel, target, propertyName } = options
  const isConstructor = options.isConstructor === true

  const profile = (): ReturnType<typeof describeProperty> =>
    describeProperty(target, propertyName)

  const tests: Array<TestDefinition> = [
    {
      id: `${idPrefix}.tostring-native`,
      group,
      name: `${apiLabel}: toString reports [native code]`,
      description:
        "Native methods return '[native code]' from Function.prototype.toString. Overrides must preserve this.",
      technique:
        "Call Function.prototype.toString on the method and check for the [native code] substring.",
      codeSnippet: `Function.prototype.toString.call(${apiLabel})
// Expected: "function ${propertyName}() { [native code] }"`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        return {
          status: p.looksNative ? "pass" : "fail",
          expected: "[native code] marker present",
          actual: p.toStringValue ?? "(no toString value)",
        }
      },
    },
    {
      id: `${idPrefix}.name-matches`,
      group,
      name: `${apiLabel}: name matches property`,
      description:
        "A method's own `name` should equal the property name on its host object.",
      technique: "Read fn.name and compare to the expected string.",
      codeSnippet: `${apiLabel}.name === "${propertyName}"`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        return {
          status: p.name === propertyName ? "pass" : "fail",
          expected: `"${propertyName}"`,
          actual: p.name === null ? "(no name)" : `"${p.name}"`,
        }
      },
    },
    {
      id: `${idPrefix}.length-matches`,
      group,
      name: `${apiLabel}: length matches native arity`,
      description:
        "A method's own `length` should match the native arity.",
      technique:
        "Read fn.length and compare to the value reported by the same method in a clean reference iframe (or a hardcoded spec value when the reference is unavailable).",
      codeSnippet: `${apiLabel}.length`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        const expectations = resolveExpectations(options)
        return {
          status: p.length === expectations.length ? "pass" : "fail",
          expected: String(expectations.length),
          actual: String(p.length ?? "(no length)"),
          details: {
            expectedFrom: expectations.source,
            expected: expectations.length,
            observed: p.length,
          },
        }
      },
    },
    {
      id: `${idPrefix}.no-prototype`,
      group,
      name: isConstructor
        ? `${apiLabel}: has own prototype property (constructor)`
        : `${apiLabel}: no own prototype property`,
      description: isConstructor
        ? "Native constructors have an own `prototype` property. An override that lacks one has been restructured."
        : "Native methods do not have an own `prototype` property. Function expressions do.",
      technique:
        "Check Object.prototype.hasOwnProperty.call(fn, 'prototype').",
      codeSnippet: isConstructor
        ? `Object.prototype.hasOwnProperty.call(
  ${apiLabel},
  "prototype"
)`
        : `!Object.prototype.hasOwnProperty.call(
  ${apiLabel},
  "prototype"
)`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        const passes = isConstructor ? p.hasPrototype : !p.hasPrototype
        return {
          status: passes ? "pass" : "fail",
          expected: isConstructor
            ? "own prototype property present"
            : "no own prototype property",
          actual: p.hasPrototype
            ? "own prototype property present"
            : "no own prototype property",
        }
      },
    },
    {
      id: `${idPrefix}.not-constructable`,
      group,
      name: isConstructor
        ? `${apiLabel}: constructable (constructor)`
        : `${apiLabel}: not constructable`,
      description: isConstructor
        ? "Native constructors can be invoked with `new`. A constructor that throws has been stripped."
        : "Native methods throw TypeError when invoked with `new`. Function expressions do not.",
      technique: "Call Reflect.construct on the method and check for TypeError.",
      codeSnippet: isConstructor
        ? `Reflect.construct(${apiLabel}, [])  // should succeed`
        : `try {
  Reflect.construct(${apiLabel}, [])
  // fail
} catch (err) {
  // pass
}`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        const passes = isConstructor
          ? !p.isNonConstructable
          : p.isNonConstructable
        return {
          status: passes ? "pass" : "fail",
          expected: isConstructor
            ? "construction succeeds"
            : "TypeError when called with new",
          actual: p.isNonConstructable
            ? "TypeError thrown"
            : "construction succeeded",
        }
      },
    },
    {
      id: `${idPrefix}.descriptor-flags`,
      group,
      name: `${apiLabel}: descriptor flags match native`,
      description:
        "Property descriptor attributes must match the browser's native defaults for this kind of API.",
      technique:
        "Read Object.getOwnPropertyDescriptor and compare flags to the descriptor on the same property in a clean reference iframe (or a hardcoded spec value when the reference is unavailable).",
      codeSnippet: `Object.getOwnPropertyDescriptor(target, "${propertyName}")`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        const d = p.descriptor
        const expectations = resolveExpectations(options)

        if (!d) {
          return {
            status: "fail",
            expected: JSON.stringify(expectations.descriptor),
            actual: "(no descriptor)",
            details: { expectedFrom: expectations.source },
          }
        }
        const actual = {
          writable: d.writable,
          configurable: d.configurable,
          enumerable: d.enumerable,
        }
        const matches =
          actual.writable === expectations.descriptor.writable &&
          actual.configurable === expectations.descriptor.configurable &&
          actual.enumerable === expectations.descriptor.enumerable
        return {
          status: matches ? "pass" : "fail",
          expected: JSON.stringify(expectations.descriptor),
          actual: JSON.stringify(actual),
          details: {
            expectedFrom: expectations.source,
            expected: expectations.descriptor,
            actual,
            fullDescriptor: d,
          },
        }
      },
    },
    {
      id: `${idPrefix}.caller-throws`,
      group,
      name: `${apiLabel}: .caller throws in strict mode`,
      description:
        "Native methods throw TypeError when `.caller` is read; non-strict functions return null or the caller.",
      technique: "Access fn.caller and observe whether it throws.",
      codeSnippet: `try {
  void ${apiLabel}.caller
  // fail
} catch {
  // pass
}`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        return {
          status: p.callerThrowsInStrict ? "pass" : "fail",
          expected: "TypeError on access",
          actual: p.callerThrowsInStrict
            ? "threw TypeError"
            : "access did not throw",
        }
      },
    },
    {
      id: `${idPrefix}.arguments-throws`,
      group,
      name: `${apiLabel}: .arguments throws in strict mode`,
      description:
        "Native methods throw TypeError when `.arguments` is read; non-strict functions return arguments or null.",
      technique: "Access fn.arguments and observe whether it throws.",
      codeSnippet: `try {
  void ${apiLabel}.arguments
  // fail
} catch {
  // pass
}`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        return {
          status: p.argumentsThrowsInStrict ? "pass" : "fail",
          expected: "TypeError on access",
          actual: p.argumentsThrowsInStrict
            ? "threw TypeError"
            : "access did not throw",
        }
      },
    },
  ]

  return tests
}
