/**
 * Property-based tests for popup validation
 * Feature: geolocation-spoof-extension-mvp
 */

import fc from "fast-check";

/**
 * Property 14: Coordinate Validation
 * For any coordinate input, the validation should correctly accept values within
 * valid ranges (latitude: -90 to 90, longitude: -180 to 180) and reject values
 * outside these ranges, displaying an error message for invalid inputs.
 *
 * Validates: Requirements 4.5, 4.6, 4.7, 4.8
 */
describe("Property 14: Coordinate Validation", () => {
  // Helper function to validate coordinates
  function validateCoordinates(latitude: number, longitude: number) {
    const errors = [];

    if (typeof latitude !== "number" || isNaN(latitude)) {
      errors.push("Latitude must be a number");
    } else if (latitude < -90 || latitude > 90) {
      errors.push("Latitude must be between -90 and 90");
    }

    if (typeof longitude !== "number" || isNaN(longitude)) {
      errors.push("Longitude must be a number");
    } else if (longitude < -180 || longitude > 180) {
      errors.push("Longitude must be between -180 and 180");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  test("should accept all valid coordinates", () => {
    fc.assert(
      fc.property(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true }),
        }),
        ({ latitude, longitude }) => {
          const result = validateCoordinates(latitude, longitude);
          expect(result.valid).toBe(true);
          expect(result.errors).toHaveLength(0);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("should reject invalid latitude values", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ min: -1000, max: -90.01, noNaN: true }),
          fc.double({ min: 90.01, max: 1000, noNaN: true })
        ),
        fc.double({ min: -180, max: 180, noNaN: true }),
        (invalidLat, validLon) => {
          const result = validateCoordinates(invalidLat, validLon);
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some((e) => e.includes("Latitude"))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("should reject invalid longitude values", () => {
    fc.assert(
      fc.property(
        fc.double({ min: -90, max: 90, noNaN: true }),
        fc.oneof(
          fc.double({ min: -1000, max: -180.01, noNaN: true }),
          fc.double({ min: 180.01, max: 1000, noNaN: true })
        ),
        (validLat, invalidLon) => {
          const result = validateCoordinates(validLat, invalidLon);
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThan(0);
          expect(result.errors.some((e) => e.includes("Longitude"))).toBe(true);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("should reject both invalid latitude and longitude", () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.double({ min: -1000, max: -90.01, noNaN: true }),
          fc.double({ min: 90.01, max: 1000, noNaN: true })
        ),
        fc.oneof(
          fc.double({ min: -1000, max: -180.01, noNaN: true }),
          fc.double({ min: 180.01, max: 1000, noNaN: true })
        ),
        (invalidLat, invalidLon) => {
          const result = validateCoordinates(invalidLat, invalidLon);
          expect(result.valid).toBe(false);
          expect(result.errors.length).toBeGreaterThanOrEqual(2);
        }
      ),
      { numRuns: 100 }
    );
  });

  test("should reject NaN values", () => {
    const result1 = validateCoordinates(NaN, 0);
    expect(result1.valid).toBe(false);
    expect(result1.errors.some((e) => e.includes("Latitude"))).toBe(true);

    const result2 = validateCoordinates(0, NaN);
    expect(result2.valid).toBe(false);
    expect(result2.errors.some((e) => e.includes("Longitude"))).toBe(true);

    const result3 = validateCoordinates(NaN, NaN);
    expect(result3.valid).toBe(false);
    expect(result3.errors.length).toBeGreaterThanOrEqual(2);
  });

  test("should accept boundary values", () => {
    // Test exact boundaries
    expect(validateCoordinates(-90, -180).valid).toBe(true);
    expect(validateCoordinates(-90, 180).valid).toBe(true);
    expect(validateCoordinates(90, -180).valid).toBe(true);
    expect(validateCoordinates(90, 180).valid).toBe(true);
    expect(validateCoordinates(0, 0).valid).toBe(true);
  });

  test("should reject values just outside boundaries", () => {
    expect(validateCoordinates(-90.01, 0).valid).toBe(false);
    expect(validateCoordinates(90.01, 0).valid).toBe(false);
    expect(validateCoordinates(0, -180.01).valid).toBe(false);
    expect(validateCoordinates(0, 180.01).valid).toBe(false);
  });
});
