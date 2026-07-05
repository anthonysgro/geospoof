/**
 * Detection batteries for extension-presence surfaces.
 *
 * These overrides are installed to make geolocation spoofing work
 * across iframes and dynamically-created DOM trees. They are not
 * behavior-spoofing overrides — they are stealth infrastructure — but
 * they each add a modification a fingerprinter can detect.
 */

import { buildStandardBattery } from "../helpers/standard-battery"
import { buildAccessorBattery } from "../helpers/accessor-battery"
import type { TestDefinition, TestResult } from "../types"

/**
 * Iframe accessors. `contentWindow` and `contentDocument` are both
 * accessor properties on HTMLIFrameElement.prototype with getters only.
 */
const iframeAccessorBatteries: Array<TestDefinition> = [
  ...buildAccessorBattery({
    idPrefix: "extension-presence.iframe-content-window",
    group: "extension-presence",
    apiLabel: "HTMLIFrameElement.prototype.contentWindow",
    target: HTMLIFrameElement.prototype,
    propertyName: "contentWindow",
    expectGet: true,
    expectSet: false,
  }),
  ...buildAccessorBattery({
    idPrefix: "extension-presence.iframe-content-document",
    group: "extension-presence",
    apiLabel: "HTMLIFrameElement.prototype.contentDocument",
    target: HTMLIFrameElement.prototype,
    propertyName: "contentDocument",
    expectGet: true,
    expectSet: false,
  }),
]

/**
 * Element.prototype.innerHTML — accessor with both getter and setter.
 */
const innerHTMLBattery: ReadonlyArray<TestDefinition> = buildAccessorBattery({
  idPrefix: "extension-presence.element-inner-html",
  group: "extension-presence",
  apiLabel: "Element.prototype.innerHTML",
  target: Element.prototype,
  propertyName: "innerHTML",
  expectGet: true,
  expectSet: true,
})

/**
 * DOM insertion methods wrapped to catch dynamically-inserted iframes.
 * These are all Web IDL methods and inherit the same descriptor shape
 * (writable: true, configurable: true, enumerable: true).
 */
const NATIVE_DOM_DESCRIPTOR = {
  writable: true,
  configurable: true,
  enumerable: true,
}

/**
 * Native arity values come from the DOM specification.
 * - appendChild, insertBefore, replaceChild take node arguments; spec arity 1-2
 * - append, prepend, replaceWith are variadic; spec arity 0
 * - insertAdjacentElement, insertAdjacentHTML take position + value; spec arity 2
 */
const DOM_INSERTION_METHODS: ReadonlyArray<{
  target: object
  prop: string
  length: number
}> = [
  { target: Node.prototype, prop: "appendChild", length: 1 },
  { target: Node.prototype, prop: "insertBefore", length: 2 },
  { target: Node.prototype, prop: "replaceChild", length: 2 },
  { target: Element.prototype, prop: "append", length: 0 },
  { target: Element.prototype, prop: "prepend", length: 0 },
  { target: Element.prototype, prop: "replaceWith", length: 0 },
  { target: Element.prototype, prop: "insertAdjacentElement", length: 2 },
  { target: Element.prototype, prop: "insertAdjacentHTML", length: 2 },
]

const domInsertionBatteries: Array<TestDefinition> =
  DOM_INSERTION_METHODS.flatMap(({ target, prop, length }) =>
    buildStandardBattery({
      idPrefix: `extension-presence.dom-${prop}`,
      group: "extension-presence",
      apiLabel: `${target === Node.prototype ? "Node" : "Element"}.prototype.${prop}`,
      target,
      propertyName: prop,
      expectedLength: length,
      expectedDescriptor: NATIVE_DOM_DESCRIPTOR,
    })
  )

/**
 * Worker-injection support shims.
 *
 * `URL.createObjectURL` / `URL.revokeObjectURL` are overridden so inline
 * (blob/data URL) workers can be intercepted for timezone spoofing, and
 * `navigator.serviceWorker.register` is wrapped to announce the script URL to
 * the background network filter. None of these spoof behavior — they are
 * stealth infrastructure — but each adds a modification a fingerprinter can
 * profile, so each must remain indistinguishable from the native method.
 *
 * Regression guard: these were once installed as bare `function` expressions.
 * Unlike a native static/WebIDL method, a function expression carries an own
 * `prototype` property (non-configurable, so `disguiseAsNative`'s delete is a
 * no-op) and a `[[Construct]]` slot. A page reading
 * `Object.prototype.hasOwnProperty.call(URL.createObjectURL, "prototype")`
 * would see `true` where a clean browser reports `false`. This was a live
 * detection vector that even CreepJS did not probe — the `no-prototype` check
 * in each battery below locks the fix in place.
 *
 * `URL` static methods are own properties on the `URL` constructor natively, so
 * the full battery is safe to run on a clean browser (native `createObjectURL`
 * has no own `prototype`, so every check passes with the extension off too).
 */
const urlObjectUrlBatteries: Array<TestDefinition> = [
  ...buildStandardBattery({
    idPrefix: "extension-presence.url-create-object-url",
    group: "extension-presence",
    apiLabel: "URL.createObjectURL",
    target: URL,
    propertyName: "createObjectURL",
    expectedLength: 1,
    expectedDescriptor: NATIVE_DOM_DESCRIPTOR,
    cleanReferenceTarget: (win) => win.URL,
  }),
  ...buildStandardBattery({
    idPrefix: "extension-presence.url-revoke-object-url",
    group: "extension-presence",
    apiLabel: "URL.revokeObjectURL",
    target: URL,
    propertyName: "revokeObjectURL",
    expectedLength: 1,
    expectedDescriptor: NATIVE_DOM_DESCRIPTOR,
    cleanReferenceTarget: (win) => win.URL,
  }),
]

/**
 * `navigator.serviceWorker.register` regression checks.
 *
 * Unlike the `URL` methods, the override is installed on the
 * `navigator.serviceWorker` *instance*, while natively `register` is inherited
 * from `ServiceWorkerContainer.prototype`. To profile the actual installed
 * function in both cases we resolve it by reference (property access walks the
 * prototype chain when there's no own property) rather than reading an own
 * descriptor — which keeps these checks sane on a clean browser too (native
 * `register` has no own `prototype`, so they pass with the extension off).
 * Skipped entirely when `navigator.serviceWorker` is absent (e.g. insecure
 * contexts), since nothing can be measured.
 */
function buildServiceWorkerRegisterTests(): ReadonlyArray<TestDefinition> {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return []

  const resolveRegister = (): unknown => {
    try {
      return (navigator.serviceWorker as unknown as { register?: unknown })
        .register
    } catch {
      return undefined
    }
  }

  return [
    {
      id: "extension-presence.sw-register.no-prototype",
      group: "extension-presence",
      name: "navigator.serviceWorker.register: no own prototype property",
      description:
        "Native WebIDL methods have no own `prototype` property. A wrapper installed as a bare function expression keeps one, which a fingerprinter can detect.",
      technique:
        "Check Object.prototype.hasOwnProperty.call(navigator.serviceWorker.register, 'prototype').",
      codeSnippet: `!Object.prototype.hasOwnProperty.call(
  navigator.serviceWorker.register,
  "prototype"
)`,

      run: async (): Promise<TestResult> => {
        const fn = resolveRegister()
        if (typeof fn !== "function") {
          return {
            status: "skipped",
            expected: "register to be a function",
            actual: "navigator.serviceWorker.register unavailable",
          }
        }
        const hasPrototype = Object.prototype.hasOwnProperty.call(
          fn,
          "prototype"
        )
        return {
          status: hasPrototype ? "fail" : "pass",
          expected: "no own prototype property",
          actual: hasPrototype
            ? "own prototype property present"
            : "no own prototype property",
        }
      },
    },
    {
      id: "extension-presence.sw-register.tostring-native",
      group: "extension-presence",
      name: "navigator.serviceWorker.register: toString reports [native code]",
      description:
        "Native methods return '[native code]' from Function.prototype.toString. A wrapper must preserve this.",
      technique:
        "Call Function.prototype.toString on navigator.serviceWorker.register and check for the [native code] substring.",
      codeSnippet: `Function.prototype.toString.call(navigator.serviceWorker.register)`,

      run: async (): Promise<TestResult> => {
        const fn = resolveRegister()
        if (typeof fn !== "function") {
          return {
            status: "skipped",
            expected: "register to be a function",
            actual: "navigator.serviceWorker.register unavailable",
          }
        }
        let toStringValue = ""
        try {
          toStringValue = Function.prototype.toString.call(fn)
        } catch {
          toStringValue = "(toString threw)"
        }
        const looksNative = /\[native code\]/.test(toStringValue)
        return {
          status: looksNative ? "pass" : "fail",
          expected: "[native code] marker present",
          actual: toStringValue,
        }
      },
    },
  ]
}

export const extensionPresenceTests: ReadonlyArray<TestDefinition> = [
  ...iframeAccessorBatteries,
  ...innerHTMLBattery,
  ...domInsertionBatteries,
  ...urlObjectUrlBatteries,
  ...buildServiceWorkerRegisterTests(),
]
