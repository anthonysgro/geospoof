/**
 * Detection batteries for geolocation and permissions overrides.
 *
 * The overrides are installed on `Geolocation.prototype` and
 * `Permissions.prototype` — where the native methods live — so that
 * `Object.getOwnPropertyDescriptor(navigator.geolocation, "…")` returns
 * `undefined` (matching native inheritance behavior) and the prototype
 * descriptor matches the WebIDL `{writable:true, configurable:true,
 * enumerable:true}` shape.
 *
 * Each battery uses `cleanReferenceTarget` to harvest the descriptor /
 * arity from a pristine same-origin iframe's prototype, so the expected
 * values come from the user's own browser rather than a hardcoded guess.
 * The spec-based fallback is still present in case the clean reference
 * isn't available.
 */

import { buildStandardBattery } from "../helpers/standard-battery"
import type { TestDefinition } from "../types"

const NATIVE_DOM_DESCRIPTOR = {
  writable: true,
  configurable: true,
  enumerable: true,
}

const geolocationMethods: Array<TestDefinition> = [
  ...buildStandardBattery({
    idPrefix: "geolocation-stealth.get-current-position",
    group: "geolocation-stealth",
    apiLabel: "Geolocation.prototype.getCurrentPosition",
    target: Geolocation.prototype,
    propertyName: "getCurrentPosition",
    expectedLength: 1,
    expectedDescriptor: NATIVE_DOM_DESCRIPTOR,
    cleanReferenceTarget: (win) => win.Geolocation.prototype,
  }),
  ...buildStandardBattery({
    idPrefix: "geolocation-stealth.watch-position",
    group: "geolocation-stealth",
    apiLabel: "Geolocation.prototype.watchPosition",
    target: Geolocation.prototype,
    propertyName: "watchPosition",
    expectedLength: 1,
    expectedDescriptor: NATIVE_DOM_DESCRIPTOR,
    cleanReferenceTarget: (win) => win.Geolocation.prototype,
  }),
  ...buildStandardBattery({
    idPrefix: "geolocation-stealth.clear-watch",
    group: "geolocation-stealth",
    apiLabel: "Geolocation.prototype.clearWatch",
    target: Geolocation.prototype,
    propertyName: "clearWatch",
    expectedLength: 1,
    expectedDescriptor: NATIVE_DOM_DESCRIPTOR,
    cleanReferenceTarget: (win) => win.Geolocation.prototype,
  }),
]

const permissionsBattery: ReadonlyArray<TestDefinition> =
  typeof Permissions !== "undefined" && Permissions.prototype
    ? buildStandardBattery({
        idPrefix: "geolocation-stealth.permissions-query",
        group: "geolocation-stealth",
        apiLabel: "Permissions.prototype.query",
        target: Permissions.prototype,
        propertyName: "query",
        expectedLength: 1,
        expectedDescriptor: NATIVE_DOM_DESCRIPTOR,
        cleanReferenceTarget: (win) => win.Permissions?.prototype ?? null,
      })
    : []

export const geolocationStealthTests: ReadonlyArray<TestDefinition> = [
  ...geolocationMethods,
  ...permissionsBattery,
]
