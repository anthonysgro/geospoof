/**
 * Property-Based Tests for GeoNames Error Message
 * Feature: extension-hardening, Property 5: GeoNames Error Message Contains Configured Username
 *
 * For any non-empty username string, the rate-limit error message contains that username.
 *
 * Validates: Requirements 4.1, 4.2
 */

import fc from "fast-check";
import { importBackground } from "../helpers/import-background";

/** Generate realistic GeoNames usernames (alphanumeric, 1-30 chars). */
const usernameArb = fc
  .stringOf(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz0123456789_"), {
    minLength: 1,
    maxLength: 30,
  })
  .filter((s) => s.length > 0);

describe("GeoNames Error Message Properties", () => {
  /**
   * Property 5: GeoNames Error Message Contains Configured Username
   *
   * For any non-empty username string stored in settings.geonamesUsername,
   * when the GeoNames API returns a rate-limit error, the logged error
   * message contains that username string.
   */
  test("Property 5: GeoNames Error Message Contains Configured Username", async () => {
    await fc.assert(
      fc.asyncProperty(usernameArb, async (username: string) => {
        vi.clearAllMocks();

        // Store settings with the generated username
        const local = browser.storage.local as unknown as Record<string, unknown>;
        const storageGetMock = local["get"] as ReturnType<typeof vi.fn>;
        storageGetMock.mockResolvedValue({
          settings: {
            enabled: true,
            location: { latitude: 35, longitude: 139, accuracy: 10 },
            timezone: null,
            locationName: null,
            webrtcProtection: false,
            geonamesUsername: username,
            onboardingCompleted: true,
            version: "1.0",
            lastUpdated: Date.now(),
          },
        });

        // Mock fetch to return a rate-limit error from GeoNames
        const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
        fetchMock.mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              status: {
                message: "the daily limit of 1000 credits has been exceeded",
                value: 18,
              },
            }),
        });

        // Capture console.error calls
        const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
        // Suppress console.warn from fallback path
        vi.spyOn(console, "warn").mockImplementation(() => {});

        const bg = await importBackground();
        bg.clearTimezoneCache();

        // Call getTimezoneForCoordinates — it will hit the rate-limit path
        await bg.getTimezoneForCoordinates(35.6762, 139.6503);

        // Find the console.error call that contains the rate-limit message
        const rateLimitCall = errorSpy.mock.calls.find(
          (args) => typeof args[0] === "string" && args[0].includes("has hit its daily limit")
        );

        expect(rateLimitCall).toBeDefined();
        const errorMessage = rateLimitCall![0] as string;

        // The error message must contain the configured username
        expect(errorMessage).toContain(username);
        // The error message must NOT contain the hardcoded 'demo' reference
        expect(errorMessage).not.toContain("shared 'demo'");

        errorSpy.mockRestore();
      }),
      { numRuns: 100 }
    );
  });
});
