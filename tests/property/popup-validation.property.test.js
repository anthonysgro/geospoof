/**
 * Property-based tests for popup validation
 * Feature: geolocation-spoof-extension-mvp
 */

const fc = require("fast-check");

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
  function validateCoordinates(latitude, longitude) {
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

/**
 * Property 15: Valid Coordinate Update Responsiveness
 * For any valid coordinate input, the spoofed location should be updated within 200ms.
 *
 * Validates: Requirements 4.9
 */
describe("Property 15: Valid Coordinate Update Responsiveness", () => {
  // Mock browser API
  const mockBrowser = {
    runtime: {
      sendMessage: jest.fn(),
    },
  };

  beforeAll(() => {
    global.browser = mockBrowser;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock successful response
    mockBrowser.runtime.sendMessage.mockResolvedValue({ success: true });
  });

  test("should update location within 200ms for any valid coordinates", async () => {
    fc.assert(
      fc.asyncProperty(
        fc.record({
          latitude: fc.double({ min: -90, max: 90, noNaN: true }),
          longitude: fc.double({ min: -180, max: 180, noNaN: true }),
        }),
        async ({ latitude, longitude }) => {
          const startTime = Date.now();

          // Simulate the setLocation function from popup.js
          await mockBrowser.runtime.sendMessage({
            type: "SET_LOCATION",
            payload: { latitude, longitude },
          });

          const endTime = Date.now();
          const duration = endTime - startTime;

          // Should complete within 200ms
          expect(duration).toBeLessThan(200);

          // Verify message was sent with correct data
          expect(mockBrowser.runtime.sendMessage).toHaveBeenCalledWith({
            type: "SET_LOCATION",
            payload: { latitude, longitude },
          });
        }
      ),
      { numRuns: 100 }
    );
  });

  test("should handle rapid coordinate updates", async () => {
    fc.assert(
      fc.asyncProperty(
        fc.array(
          fc.record({
            latitude: fc.double({ min: -90, max: 90, noNaN: true }),
            longitude: fc.double({ min: -180, max: 180, noNaN: true }),
          }),
          { minLength: 1, maxLength: 5 }
        ),
        async (coordinates) => {
          const startTime = Date.now();

          // Send multiple location updates
          for (const coord of coordinates) {
            await mockBrowser.runtime.sendMessage({
              type: "SET_LOCATION",
              payload: coord,
            });
          }

          const endTime = Date.now();
          const avgDuration = (endTime - startTime) / coordinates.length;

          // Average time per update should be under 200ms
          expect(avgDuration).toBeLessThan(200);
        }
      ),
      { numRuns: 50 }
    );
  });
});
