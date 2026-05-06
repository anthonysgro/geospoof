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
import type { TestDefinition } from "../types"

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

const domInsertionBatteries: Array<TestDefinition> = DOM_INSERTION_METHODS.flatMap(
  ({ target, prop, length }) =>
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

export const extensionPresenceTests: ReadonlyArray<TestDefinition> = [
  ...iframeAccessorBatteries,
  ...innerHTMLBattery,
  ...domInsertionBatteries,
]
