/**
 * Standard detection battery for accessor (getter/setter) properties.
 *
 * Used for HTMLIFrameElement.prototype.contentWindow / contentDocument
 * (getter only) and Element.prototype.innerHTML (getter and setter).
 * The outer descriptor is checked for accessor-specific flags, then the
 * getter/setter functions themselves are profiled like regular methods.
 */

import { describeAccessor } from "./describe"
import type { TestDefinition, TestGroupId, TestResult } from "../types"

export interface AccessorBatteryOptions {
  /** Stable test id prefix. */
  idPrefix: string
  /** Group these tests belong to. */
  group: TestGroupId
  /** Human-readable reference (e.g. "HTMLIFrameElement.prototype.contentWindow"). */
  apiLabel: string
  /** The target object to probe (e.g. HTMLIFrameElement.prototype). */
  target: object
  /** The property name on target to profile. */
  propertyName: string
  /** Should the descriptor have a getter? */
  expectGet: boolean
  /** Should the descriptor have a setter? */
  expectSet: boolean
  /**
   * Expected outer descriptor flags for the accessor.
   * Web IDL DOM accessors are typically configurable, enumerable.
   */
  expectedDescriptor?: {
    configurable: boolean
    enumerable: boolean
  }
}

const DEFAULT_ACCESSOR_DESCRIPTOR = {
  configurable: true,
  enumerable: true,
}

export function buildAccessorBattery(
  options: AccessorBatteryOptions
): ReadonlyArray<TestDefinition> {
  const {
    idPrefix,
    group,
    apiLabel,
    target,
    propertyName,
    expectGet,
    expectSet,
    expectedDescriptor = DEFAULT_ACCESSOR_DESCRIPTOR,
  } = options

  const profile = (): ReturnType<typeof describeAccessor> =>
    describeAccessor(target, propertyName)

  const tests: Array<TestDefinition> = [
    {
      id: `${idPrefix}.descriptor-shape`,
      group,
      name: `${apiLabel}: accessor descriptor shape matches native`,
      description:
        "The accessor should have the expected getter/setter combination and descriptor flags.",
      technique:
        "Read Object.getOwnPropertyDescriptor and compare has-getter/has-setter and flags.",
      codeSnippet: `const d = Object.getOwnPropertyDescriptor(target, "${propertyName}")
// Expected shape: { get: ${String(expectGet)}, set: ${String(expectSet)}, ${JSON.stringify(expectedDescriptor)} }`,
      // eslint-disable-next-line @typescript-eslint/require-await
      run: async (): Promise<TestResult> => {
        const p = profile()
        if (!p.exists) {
          return {
            status: "fail",
            expected: "property to exist",
            actual: "property not found",
          }
        }
        const d = p.descriptor
        if (!d) {
          return {
            status: "fail",
            expected: "accessor descriptor",
            actual: "data descriptor (or no descriptor)",
          }
        }
        const matches =
          d.hasGet === expectGet &&
          d.hasSet === expectSet &&
          d.configurable === expectedDescriptor.configurable &&
          d.enumerable === expectedDescriptor.enumerable
        return {
          status: matches ? "pass" : "fail",
          expected: JSON.stringify({
            hasGet: expectGet,
            hasSet: expectSet,
            ...expectedDescriptor,
          }),
          actual: JSON.stringify({
            hasGet: d.hasGet,
            hasSet: d.hasSet,
            configurable: d.configurable,
            enumerable: d.enumerable,
          }),
          details: { descriptor: d },
        }
      },
    },
  ]

  if (expectGet) {
    tests.push(
      {
        id: `${idPrefix}.getter-tostring-native`,
        group,
        name: `${apiLabel}: getter toString reports [native code]`,
        description:
          "The getter function must look like a native accessor when stringified.",
        technique:
          "Extract the getter from the descriptor, call Function.prototype.toString on it.",
        codeSnippet: `const { get } = Object.getOwnPropertyDescriptor(
  target,
  "${propertyName}"
)
Function.prototype.toString.call(get)`,
        // eslint-disable-next-line @typescript-eslint/require-await
        run: async (): Promise<TestResult> => {
          const p = profile()
          const getter = p.getter
          return {
            status: getter?.looksNative ? "pass" : "fail",
            expected: "[native code] marker present",
            actual: getter?.toStringValue ?? "(no getter)",
          }
        },
      },
      {
        id: `${idPrefix}.getter-no-prototype`,
        group,
        name: `${apiLabel}: getter has no own prototype`,
        description:
          "Native accessor getters have no own prototype property.",
        technique:
          "Check Object.prototype.hasOwnProperty.call(getter, 'prototype').",
        codeSnippet: `!Object.prototype.hasOwnProperty.call(get, "prototype")`,
        // eslint-disable-next-line @typescript-eslint/require-await
        run: async (): Promise<TestResult> => {
          const p = profile()
          const getter = p.getter
          return {
            status: getter && !getter.hasPrototype ? "pass" : "fail",
            expected: "no own prototype",
            actual: getter?.hasPrototype
              ? "own prototype present"
              : "no own prototype",
          }
        },
      },
      {
        id: `${idPrefix}.getter-not-constructable`,
        group,
        name: `${apiLabel}: getter is not constructable`,
        description:
          "Native accessor getters throw TypeError when invoked with `new`.",
        technique:
          "Call Reflect.construct on the getter function.",
        codeSnippet: `try { Reflect.construct(get, []); /* fail */ } catch { /* pass */ }`,
        // eslint-disable-next-line @typescript-eslint/require-await
        run: async (): Promise<TestResult> => {
          const p = profile()
          const getter = p.getter
          return {
            status: getter?.isNonConstructable ? "pass" : "fail",
            expected: "TypeError when called with new",
            actual: getter?.isNonConstructable
              ? "TypeError thrown"
              : "construction succeeded",
          }
        },
      }
    )
  }

  if (expectSet) {
    tests.push(
      {
        id: `${idPrefix}.setter-tostring-native`,
        group,
        name: `${apiLabel}: setter toString reports [native code]`,
        description:
          "The setter function must look like a native accessor when stringified.",
        technique:
          "Extract the setter from the descriptor, call Function.prototype.toString on it.",
        codeSnippet: `const { set } = Object.getOwnPropertyDescriptor(
  target,
  "${propertyName}"
)
Function.prototype.toString.call(set)`,
        // eslint-disable-next-line @typescript-eslint/require-await
        run: async (): Promise<TestResult> => {
          const p = profile()
          const setter = p.setter
          return {
            status: setter?.looksNative ? "pass" : "fail",
            expected: "[native code] marker present",
            actual: setter?.toStringValue ?? "(no setter)",
          }
        },
      },
      {
        id: `${idPrefix}.setter-no-prototype`,
        group,
        name: `${apiLabel}: setter has no own prototype`,
        description:
          "Native accessor setters have no own prototype property.",
        technique:
          "Check Object.prototype.hasOwnProperty.call(setter, 'prototype').",
        codeSnippet: `!Object.prototype.hasOwnProperty.call(set, "prototype")`,
        // eslint-disable-next-line @typescript-eslint/require-await
        run: async (): Promise<TestResult> => {
          const p = profile()
          const setter = p.setter
          return {
            status: setter && !setter.hasPrototype ? "pass" : "fail",
            expected: "no own prototype",
            actual: setter?.hasPrototype
              ? "own prototype present"
              : "no own prototype",
          }
        },
      }
    )
  }

  return tests
}
