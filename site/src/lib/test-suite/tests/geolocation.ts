/**
 * Placeholder geolocation tests.
 *
 * Initial scaffolding to validate the runner and UI end-to-end.
 * Real test coverage will be expanded in follow-up work.
 */

import type { TestDefinition, TestResult } from "../types"

const GEOLOCATION_TIMEOUT_MS = 5000

interface Coords {
  latitude: number
  longitude: number
  accuracy: number
}

/**
 * Promisified wrapper around navigator.geolocation.getCurrentPosition.
 * Rejects on both error callback and timeout.
 */
async function getCurrentCoords(): Promise<Coords> {
  return new Promise<Coords>((resolve, reject) => {
    if (!("geolocation" in navigator)) {
      reject(new Error("navigator.geolocation is not available"))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        })
      },
      (err) => reject(new Error(err.message || `code ${err.code}`)),
      { timeout: GEOLOCATION_TIMEOUT_MS }
    )
  })
}

const getCurrentPositionReturnsCoords: TestDefinition = {
  id: "geolocation.get-current-position-returns-coords",
  group: "geolocation-correctness",
  name: "navigator.geolocation.getCurrentPosition returns coordinates",
  description:
    "Calls the geolocation API and verifies that it returns a valid latitude/longitude pair.",
  technique:
    "Invoke navigator.geolocation.getCurrentPosition and inspect the PositionCoords object it yields.",
  codeSnippet: `navigator.geolocation.getCurrentPosition(
  (pos) => {
    // expect pos.coords.latitude and pos.coords.longitude
    // to be finite numbers within valid ranges
  },
  (err) => { /* error path */ }
)`,
  run: async (): Promise<TestResult> => {
    try {
      const coords = await getCurrentCoords()
      const valid =
        Number.isFinite(coords.latitude) &&
        Number.isFinite(coords.longitude) &&
        coords.latitude >= -90 &&
        coords.latitude <= 90 &&
        coords.longitude >= -180 &&
        coords.longitude <= 180

      return {
        status: valid ? "pass" : "fail",
        expected: "Valid latitude (-90 to 90) and longitude (-180 to 180)",
        actual: `latitude=${coords.latitude}, longitude=${coords.longitude}`,
        details: {
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy,
        },
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      return {
        status: "fail",
        expected: "getCurrentPosition to resolve with valid coords",
        actual: `getCurrentPosition rejected: ${message}`,
        error: message,
      }
    }
  },
}

export const geolocationTests: ReadonlyArray<TestDefinition> = [
  getCurrentPositionReturnsCoords,
]
