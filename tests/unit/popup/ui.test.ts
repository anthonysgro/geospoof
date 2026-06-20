/**
 * Unit tests for popup `renderLocationDetails` accuracy display.
 *
 * The accuracy row must show a value computed LIVE by the shared Resolver using
 * the popup's own detected device class — NOT the stored `Location.accuracy`.
 * Validates: Requirements 10.1, 10.2, 10.3
 */

import { describe, it, expect, beforeEach } from "vitest";
import fc from "fast-check";
import { renderLocationDetails } from "@/popup/ui";
import { resolveAccuracy } from "@/shared/accuracy/resolver";
import { detectDeviceClass, BANDS } from "@/shared/accuracy/device-class";
import type { Location, LocationName, AccuracySetting } from "@/shared/types/settings";

/** A stored accuracy sentinel that must NOT leak into the displayed value. */
const STORED_SENTINEL = 9999;

function makeLocation(latitude: number, longitude: number): Location {
  // accuracy is intentionally a sentinel: the popup must ignore it (Req 10.3).
  return { latitude, longitude, accuracy: STORED_SENTINEL };
}

/** Pull the rendered "Accuracy" row value text (e.g. "±45m") from the container. */
function readAccuracyText(container: HTMLElement): string | null {
  const rows = container.querySelectorAll(".detail-row");
  for (const row of Array.from(rows)) {
    const label = row.querySelector(".detail-row-label")?.textContent ?? "";
    if (label === "Accuracy") {
      return row.querySelector(".detail-row-value")?.textContent ?? null;
    }
  }
  return null;
}

describe("renderLocationDetails accuracy display", () => {
  let container: HTMLElement;
  const noName: LocationName | null = null;

  beforeEach(() => {
    container = document.createElement("div");
  });

  it('renders "Not configured" and no accuracy row when location is null', () => {
    renderLocationDetails(container, null, noName, { mode: "auto" }, 12345);
    expect(container.textContent).toBe("Not configured");
    expect(readAccuracyText(container)).toBeNull();
  });

  it("fixed mode displays exactly the configured meters value", () => {
    const setting: AccuracySetting = { mode: "fixed", meters: 137 };
    renderLocationDetails(container, makeLocation(40.7128, -74.006), noName, setting, 0);
    expect(readAccuracyText(container)).toBe("±137m");
  });

  it("does not display the stored Location.accuracy value", () => {
    const setting: AccuracySetting = { mode: "fixed", meters: 50 };
    renderLocationDetails(container, makeLocation(51.5074, -0.1278), noName, setting, 777);
    const text = readAccuracyText(container);
    expect(text).toBe("±50m");
    expect(text).not.toContain(String(STORED_SENTINEL));
  });

  it("auto mode displays a value within the detected device band", () => {
    const setting: AccuracySetting = { mode: "auto" };
    const lat = 35.6762;
    const lon = 139.6503;
    renderLocationDetails(container, makeLocation(lat, lon), noName, setting, 999);

    const band = BANDS[detectDeviceClass(navigator)];
    const text = readAccuracyText(container);
    expect(text).not.toBeNull();
    const meters = Number(text!.replace(/[±m]/g, ""));
    expect(Number.isInteger(meters)).toBe(true);
    expect(meters).toBeGreaterThanOrEqual(band.min);
    expect(meters).toBeLessThanOrEqual(band.max);
  });

  it("range mode displays a value within the requested range", () => {
    const setting: AccuracySetting = { mode: "range", min: 20, max: 60 };
    renderLocationDetails(container, makeLocation(48.8566, 2.3522), noName, setting, 4242);
    const meters = Number((readAccuracyText(container) ?? "").replace(/[±m]/g, ""));
    expect(meters).toBeGreaterThanOrEqual(20);
    expect(meters).toBeLessThanOrEqual(60);
  });

  it("displays exactly what the shared Resolver returns for the popup's device class", () => {
    fc.assert(
      fc.property(
        fc.constantFrom<AccuracySetting>(
          { mode: "auto" },
          { mode: "range", min: 5, max: 15 },
          { mode: "range", min: 35, max: 100 },
          { mode: "fixed", meters: 250 }
        ),
        fc.integer({ min: 0, max: 2 ** 31 - 1 }),
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.double({ min: -180, max: 180, noNaN: true }),
        (setting, seed, latitude, longitude) => {
          const el = document.createElement("div");
          renderLocationDetails(
            el,
            { latitude, longitude, accuracy: STORED_SENTINEL },
            noName,
            setting,
            seed
          );

          const expected = resolveAccuracy({
            setting,
            deviceClass: detectDeviceClass(navigator),
            seed,
            latitude,
            longitude,
          });
          expect(readAccuracyText(el)).toBe(`±${expected}m`);
        }
      ),
      { numRuns: 100 }
    );
  });
});
