/**
 * Detection batteries for geolocation and permissions overrides.
 *
 * Geolocation methods are installed with `writable: false, configurable: false`
 * as a restoration-attack defense. Native descriptors on Web IDL DOM
 * interfaces are `writable: true, configurable: true, enumerable: true`,
 * so the descriptor-flags test is expected to fail — that's the cost of
 * the lockdown and it's worth measuring honestly.
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
    apiLabel: "navigator.geolocation.getCurrentPosition",
    target: navigator.geolocation,
    propertyName: "getCurrentPosition",
    expectedLength: 1,
    expectedDescriptor: NATIVE_DOM_DESCRIPTOR,
  }),
  ...buildStandardBattery({
    idPrefix: "geolocation-stealth.watch-position",
    group: "geolocation-stealth",
    apiLabel: "navigator.geolocation.watchPosition",
    target: navigator.geolocation,
    propertyName: "watchPosition",
    expectedLength: 1,
    expectedDescriptor: NATIVE_DOM_DESCRIPTOR,
  }),
  ...buildStandardBattery({
    idPrefix: "geolocation-stealth.clear-watch",
    group: "geolocation-stealth",
    apiLabel: "navigator.geolocation.clearWatch",
    target: navigator.geolocation,
    propertyName: "clearWatch",
    expectedLength: 1,
    expectedDescriptor: NATIVE_DOM_DESCRIPTOR,
  }),
]

// eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
const permissionsBattery: ReadonlyArray<TestDefinition> = navigator.permissions
  ? buildStandardBattery({
      idPrefix: "geolocation-stealth.permissions-query",
      group: "geolocation-stealth",
      apiLabel: "navigator.permissions.query",
      target: navigator.permissions,
      propertyName: "query",
      expectedLength: 1,
      expectedDescriptor: NATIVE_DOM_DESCRIPTOR,
    })
  : []

export const geolocationStealthTests: ReadonlyArray<TestDefinition> = [
  ...geolocationMethods,
  ...permissionsBattery,
]
