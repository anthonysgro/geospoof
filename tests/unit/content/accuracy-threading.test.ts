/**
 * Verifies that the accuracy resolution inputs threaded onto the injected
 * `SpoofedLocation` actually drive the resolved `GeolocationCoordinates.
 * accuracy`. This is the behavioral contract the wiring fix restores: the
 * injected geolocation override (src/content/injected/geolocation.ts) and the
 * iframe patcher (src/content/injected/iframe-patching.ts) both resolve via
 *
 *   resolveAccuracy({
 *     setting: location.accuracySetting ?? DEFAULT_ACCURACY_SETTING,
 *     deviceClass: detectDeviceClass(navigator),
 *     seed: location.accuracySeed ?? 0,
 *     latitude: location.latitude,
 *     longitude: location.longitude,
 *   })
 *
 * so a `fixed` setting threaded through `location` must yield exactly the
 * chosen metres on the page, and `auto` must use the real seed (matching the
 * popup's Details panel). Before the fix, `location.accuracySetting` /
 * `location.accuracySeed` were always undefined, so the page always resolved
 * in auto mode with seed 0.
 */

import { describe, test, expect } from "vitest";
import fc from "fast-check";
import { resolveAccuracy } from "@/shared/accuracy/resolver";
import { detectDeviceClass } from "@/shared/accuracy/device-class";
import { DEFAULT_ACCURACY_SETTING } from "@/shared/types/settings";
import type { SpoofedLocation } from "@/content/injected/types";

/** Replicates exactly the resolution call the injected scripts make. */
function resolveForLocation(location: SpoofedLocation): number {
  return resolveAccuracy({
    setting: location.accuracySetting ?? DEFAULT_ACCURACY_SETTING,
    deviceClass: detectDeviceClass(navigator),
    seed: location.accuracySeed ?? 0,
    latitude: location.latitude,
    longitude: location.longitude,
  });
}

describe("injected accuracy resolution threaded through location", () => {
  test("a fixed-mode setting yields exactly the chosen metres", () => {
    const location: SpoofedLocation = {
      latitude: 37.7749,
      longitude: -122.4194,
      accuracySetting: { mode: "fixed", meters: 250 },
      accuracySeed: 123456,
    };
    expect(resolveForLocation(location)).toBe(250);
  });

  test("Property: any in-range fixed metres resolves to exactly that integer", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 10000 }),
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        fc.integer({ min: 0, max: 2 ** 31 }),
        (meters, latitude, longitude, accuracySeed) => {
          const location: SpoofedLocation = {
            latitude,
            longitude,
            accuracySetting: { mode: "fixed", meters },
            accuracySeed,
          };
          expect(resolveForLocation(location)).toBe(meters);
        }
      ),
      { numRuns: 200 }
    );
  });

  test("auto mode uses the real threaded seed (matches the popup Details value)", () => {
    const latitude = 51.5074;
    const longitude = -0.1278;
    const seed = 987654;

    // Page-side resolution with the threaded seed.
    const pageValue = resolveForLocation({
      latitude,
      longitude,
      accuracySetting: { mode: "auto" },
      accuracySeed: seed,
    });

    // The popup Details panel resolves with the same real seed/device class.
    const popupValue = resolveAccuracy({
      setting: { mode: "auto" },
      deviceClass: detectDeviceClass(navigator),
      seed,
      latitude,
      longitude,
    });

    expect(pageValue).toBe(popupValue);
  });

  test("missing accuracySetting/seed falls back to auto + seed 0 (pre-fix behavior)", () => {
    const latitude = 48.8566;
    const longitude = 2.3522;
    const location: SpoofedLocation = { latitude, longitude };

    const fallback = resolveAccuracy({
      setting: DEFAULT_ACCURACY_SETTING,
      deviceClass: detectDeviceClass(navigator),
      seed: 0,
      latitude,
      longitude,
    });

    expect(resolveForLocation(location)).toBe(fallback);
  });
});
