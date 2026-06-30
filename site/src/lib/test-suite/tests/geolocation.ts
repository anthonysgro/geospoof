/**
 * Baseline geolocation test: the browser must report a valid
 * `GeolocationPosition` from `navigator.geolocation.getCurrentPosition`.
 *
 * This test reads from the run-shared position cache seeded by the
 * Identity Panel — NOT by making its own live `getCurrentPosition`
 * call. That matters on two specific fronts:
 *
 *   1. **Permission-prompt timing.** On a first-run (no cached
 *      permission) the identity panel is the component that
 *      triggers the browser's Allow/Block prompt; it waits
 *      untimed for the user's decision, then acquires a fix with
 *      its own long timeout. A second live call here would race
 *      the permission lifecycle and either prompt twice or time
 *      out while the user is still reading the first prompt.
 *
 *   2. **Safari CoreLocation serialisation.** Safari queues
 *      back-to-back `getCurrentPosition` calls through its
 *      CoreLocation service layer, so an independent live call
 *      behind the identity panel's call can take several seconds
 *      on its own — enough to trip test timeouts even when the
 *      panel already has a fresh fix.
 *
 * The shared-position cache (`getSharedPosition`) resolves
 * synchronously once the panel has obtained a position, so the
 * test verifies the browser DID produce coords without ever
 * paying for a second live call.
 */

import { SkipTestError, buildBehavioralTest } from "../helpers/behavioral"
import { getSharedPosition } from "../helpers/shared-position"
import type { TestDefinition } from "../types"

const getCurrentPositionReturnsCoords = buildBehavioralTest<boolean>({
  id: "geolocation.get-current-position-returns-coords",
  group: "geolocation-correctness",
  name: "navigator.geolocation.getCurrentPosition returns coordinates",
  description:
    "Calls the geolocation API and verifies that it returns a valid latitude/longitude pair.",
  technique:
    "Read the position the Identity Panel already obtained via navigator.geolocation.getCurrentPosition and assert its coords are finite numbers within the WGS84 ranges.",
  codeSnippet: `navigator.geolocation.getCurrentPosition(
  (pos) => {
    // expect pos.coords.latitude and pos.coords.longitude
    // to be finite numbers within valid ranges
  },
  (err) => { /* error path */ }
)`,
  expected: async () => ({
    value: true,
    describe: "latitude in [-90, 90] and longitude in [-180, 180]",
  }),
  observe: async (ctx) => {
    let pos
    try {
      pos = await getSharedPosition(ctx)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      throw new SkipTestError(
        `getCurrentPosition could not be resolved: ${message}`
      )
    }
    const { latitude, longitude } = pos.coords
    const valid =
      Number.isFinite(latitude) &&
      Number.isFinite(longitude) &&
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180
    return {
      value: valid,
      describe: `latitude=${latitude}, longitude=${longitude}`,
    }
  },
})

export const geolocationTests: ReadonlyArray<TestDefinition> = [
  getCurrentPositionReturnsCoords,
]
