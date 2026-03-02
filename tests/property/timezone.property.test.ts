/**
 * Property-Based Tests for Timezone Functionality
 * Feature: geolocation-spoof-extension-mvp
 */

import fc from "fast-check";
import { importBackground } from "../helpers/import-background";

/**
 * Property 8: IANA Timezone Identifier Format
 *
 * Validates: Requirements 2.6
 *
 * For any timezone override, the timezone identifier should be a valid
 * IANA timezone database identifier (e.g., "America/Los_Angeles", "Europe/London").
 */
test("Property 8: IANA Timezone Identifier Format", async () => {
  const { getTimezoneForCoordinates, isValidIANATimezone } = await importBackground();

  await fc.assert(
    fc.asyncProperty(
      fc.record({
        latitude: fc.double({ min: -90, max: 90, noNaN: true }),
        longitude: fc.double({ min: -180, max: 180, noNaN: true }),
      }),
      async ({ latitude, longitude }) => {
        // Mock successful GeoNames API response
        vi.mocked(fetch).mockImplementation(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                timezoneId: "America/Los_Angeles",
                rawOffset: -8,
                dstOffset: -7,
              }),
          } as Response)
        );

        const timezone = await getTimezoneForCoordinates(latitude, longitude);

        // Timezone identifier should be valid IANA format
        return isValidIANATimezone(timezone.identifier);
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Property 6: Timezone Recalculation Responsiveness
 *
 * Validates: Requirements 2.4
 *
 * For any location change, the timezone should be recalculated and updated
 * within 100ms to maintain consistency between coordinates and timezone.
 */
test("Property 6: Timezone Recalculation Responsiveness", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        latitude: fc.double({ min: -90, max: 90, noNaN: true }),
        longitude: fc.double({ min: -180, max: 180, noNaN: true }),
      }),
      async ({ latitude, longitude }) => {
        const { getTimezoneForCoordinates } = await importBackground();

        // Mock successful GeoNames API response
        vi.mocked(fetch).mockImplementation(() =>
          Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                timezoneId: "America/Los_Angeles",
                rawOffset: -8,
                dstOffset: -7,
              }),
          } as Response)
        );

        const startTime = Date.now();
        await getTimezoneForCoordinates(latitude, longitude);
        const endTime = Date.now();

        const responseTime = endTime - startTime;

        // Should complete within 100ms (being generous with network mock)
        return responseTime < 100;
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Test timezone fallback when API fails
 */
test("Timezone fallback when API fails", async () => {
  await fc.assert(
    fc.asyncProperty(
      fc.record({
        // Use unique coordinates that won't collide with other tests
        latitude: fc.double({ min: -89, max: -80, noNaN: true }),
        longitude: fc.double({ min: 170, max: 180, noNaN: true }),
      }),
      async ({ latitude, longitude }) => {
        const { getTimezoneForCoordinates } = await importBackground();

        // Mock API failure
        vi.mocked(fetch).mockImplementation(() => Promise.reject(new Error("API unavailable")));

        const timezone = await getTimezoneForCoordinates(latitude, longitude);

        // Should return fallback timezone
        if (!timezone) return false;

        // Identifier should be in Etc/GMT format
        if (!timezone.identifier.startsWith("Etc/GMT")) return false;

        if (typeof timezone.offset !== "number") return false;
        if (typeof timezone.dstOffset !== "number") return false;
        if (timezone.dstOffset !== 0) return false;
        if (timezone.fallback !== true) return false;

        // Fallback offset should be based on longitude
        const expectedOffset = Math.round(longitude / 15) * 60;
        return timezone.offset === expectedOffset;
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Test IANA timezone identifier validation
 */
test("IANA timezone identifier validation", async () => {
  const { isValidIANATimezone } = await importBackground();

  fc.assert(
    fc.property(
      fc.constantFrom(
        "America/Los_Angeles",
        "America/New_York",
        "Europe/London",
        "Asia/Tokyo",
        "Australia/Sydney",
        "America/Argentina/Buenos_Aires",
        "UTC"
      ),
      (validTimezone) => {
        return isValidIANATimezone(validTimezone) === true;
      }
    ),
    { numRuns: 100 }
  );
});

/**
 * Test invalid timezone identifiers are rejected
 */
test("Invalid timezone identifiers are rejected", async () => {
  const { isValidIANATimezone } = await importBackground();

  fc.assert(
    fc.property(
      fc.constantFrom(
        "",
        "invalid",
        "america/los_angeles", // lowercase
        "America/", // incomplete
        "/Los_Angeles", // missing area
        "123/456", // numbers
        null,
        undefined
      ),
      (invalidTimezone) => {
        return isValidIANATimezone(invalidTimezone) === false;
      }
    ),
    { numRuns: 100 }
  );
});
