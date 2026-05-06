/**
 * Standard detection battery generator.
 *
 * Produces eight TestDefinitions for a single overridden function-valued
 * property: toString masking, name, length, absence of own prototype,
 * non-constructability, descriptor flags, strict-mode .caller and
 * .arguments. These are the checks a typical fingerprinter combines to
 * distinguish an overridden function from a native one.
 *
 * Each battery is self-contained so we can mount as many as we want
 * across different APIs without runtime coupling between them.
 */

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
  /** Expected native arity (fn.length). */
  expectedLength: number
  /**
   * Expected property descriptor flags. Defaults to the ECMAScript
   * standard-library convention: writable, configurable, non-enumerable.
   * Override for APIs where the native descriptor differs (e.g. Web IDL
   * DOM methods, which are writable/configurable/enumerable).
   */
  expectedDescriptor?: {
    writable: boolean
    configurable: boolean
    enumerable: boolean
  }
}

const DEFAULT_DESCRIPTOR = {
  writable: true,
  configurable: true,
  enumerable: false,
}

export function buildStandardBattery(
  options: StandardBatteryOptions
): ReadonlyArray<TestDefinition> {
  const {
    idPrefix,
    group,
    apiLabel,
    target,
    propertyName,
    expectedLength,
    expectedDescriptor = DEFAULT_DESCRIPTOR,
  } = options

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
        "A method's own `length` should match the formally-specified native arity.",
      technique: "Read fn.length and compare to the expected number.",
      codeSnippet: `${apiLabel}.length === ${String(expectedLength)}`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        return {
          status: p.length === expectedLength ? "pass" : "fail",
          expected: String(expectedLength),
          actual: String(p.length ?? "(no length)"),
        }
      },
    },
    {
      id: `${idPrefix}.no-prototype`,
      group,
      name: `${apiLabel}: no own prototype property`,
      description:
        "Native methods do not have an own `prototype` property. Function expressions do.",
      technique:
        "Check Object.prototype.hasOwnProperty.call(fn, 'prototype').",
      codeSnippet: `!Object.prototype.hasOwnProperty.call(
  ${apiLabel},
  "prototype"
)`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        return {
          status: p.hasPrototype ? "fail" : "pass",
          expected: "no own prototype property",
          actual: p.hasPrototype
            ? "own prototype property present"
            : "no own prototype property",
        }
      },
    },
    {
      id: `${idPrefix}.not-constructable`,
      group,
      name: `${apiLabel}: not constructable`,
      description:
        "Native methods throw TypeError when invoked with `new`. Function expressions do not.",
      technique: "Call Reflect.construct on the method and check for TypeError.",
      codeSnippet: `try {
  Reflect.construct(${apiLabel}, [])
  // fail
} catch (err) {
  // pass
}`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        return {
          status: p.isNonConstructable ? "pass" : "fail",
          expected: "TypeError when called with new",
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
        "Property descriptor attributes must match the native defaults for this kind of API.",
      technique:
        "Read Object.getOwnPropertyDescriptor and compare flags to the expected values.",
      codeSnippet: `Object.getOwnPropertyDescriptor(target, "${propertyName}")
// Expected: ${JSON.stringify(expectedDescriptor)}`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        const d = p.descriptor
        if (!d) {
          return {
            status: "fail",
            expected: JSON.stringify(expectedDescriptor),
            actual: "(no descriptor)",
          }
        }
        const actual = {
          writable: d.writable,
          configurable: d.configurable,
          enumerable: d.enumerable,
        }
        const matches =
          actual.writable === expectedDescriptor.writable &&
          actual.configurable === expectedDescriptor.configurable &&
          actual.enumerable === expectedDescriptor.enumerable
        return {
          status: matches ? "pass" : "fail",
          expected: JSON.stringify(expectedDescriptor),
          actual: JSON.stringify(actual),
          details: { expected: expectedDescriptor, actual, fullDescriptor: d },
        }
      },
    },
    {
      id: `${idPrefix}.caller-throws`,
      group,
      name: `${apiLabel}: .caller throws in strict mode`,
      description:
        "Native methods throw TypeError when `.caller` is read; non-strict functions return null or the caller.",
      technique:
        "Access fn.caller and observe whether it throws.",
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
      technique:
        "Access fn.arguments and observe whether it throws.",
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
