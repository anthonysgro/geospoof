/**
 * Unit tests for the popup precision control's pure mapping helpers.
 * Feature: location-precision (Task 8.3). DOM-free.
 */

import { describe, test, expect } from "vitest";
import {
  optionToLocationPrecision,
  locationPrecisionToOption,
  type PrecisionOption,
} from "@/popup/precision";
import type { LocationPrecision } from "@/shared/types/settings";

describe("optionToLocationPrecision", () => {
  test("exact maps to { mode: 'exact' }", () => {
    expect(optionToLocationPrecision("exact")).toEqual({ mode: "exact" });
  });

  test("approximate options map to their preset radii", () => {
    expect(optionToLocationPrecision("street")).toEqual({
      mode: "approximate",
      radiusMeters: 500,
    });
    expect(optionToLocationPrecision("neighborhood")).toEqual({
      mode: "approximate",
      radiusMeters: 2000,
    });
    expect(optionToLocationPrecision("city")).toEqual({
      mode: "approximate",
      radiusMeters: 10000,
    });
  });
});

describe("locationPrecisionToOption", () => {
  test("exact / missing / unknown → 'exact'", () => {
    expect(locationPrecisionToOption({ mode: "exact" })).toBe("exact");
    expect(locationPrecisionToOption(undefined)).toBe("exact");
    expect(locationPrecisionToOption(null)).toBe("exact");
  });

  test("exact preset radii map back to their option", () => {
    expect(locationPrecisionToOption({ mode: "approximate", radiusMeters: 500 })).toBe("street");
    expect(locationPrecisionToOption({ mode: "approximate", radiusMeters: 2000 })).toBe(
      "neighborhood"
    );
    expect(locationPrecisionToOption({ mode: "approximate", radiusMeters: 10000 })).toBe("city");
  });

  test("off-preset radii snap to the nearest option", () => {
    expect(locationPrecisionToOption({ mode: "approximate", radiusMeters: 700 })).toBe("street");
    expect(locationPrecisionToOption({ mode: "approximate", radiusMeters: 1500 })).toBe(
      "neighborhood"
    );
    expect(locationPrecisionToOption({ mode: "approximate", radiusMeters: 8000 })).toBe("city");
  });
});

describe("round-trip", () => {
  test("every option survives option → setting → option", () => {
    const options: PrecisionOption[] = ["exact", "street", "neighborhood", "city"];
    for (const option of options) {
      const setting: LocationPrecision = optionToLocationPrecision(option);
      expect(locationPrecisionToOption(setting)).toBe(option);
    }
  });
});
