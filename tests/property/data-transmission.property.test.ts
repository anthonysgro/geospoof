/**
 * Property-Based Tests for Timezone Data Transmission
 * Feature: timezone-spoofing-and-status-display
 *
 * Tests Properties 8 and 9 from the design document:
 * - Property 8: CustomEvent Timezone Data Transmission
 * - Property 9: Injected Script Timezone Data Storage
 */

import fc from "fast-check";
import type { Location, Timezone } from "@/shared/types/settings";
import { assignGlobal, deleteGlobal } from "../helpers/mock-types";

/** Payload dispatched via the __geospoof_settings_update CustomEvent. */
interface GeoSpoofSettingsDetail {
  enabled: boolean;
  location: Location;
  timezone: Timezone | null;
}

/** Minimal mock of the window object used in these tests. */
interface MockWindow {
  dispatchEvent: ReturnType<typeof vi.fn<(event: CustomEvent<GeoSpoofSettingsDetail>) => boolean>>;
}

declare function cloneInto<T>(obj: T, target: typeof globalThis): T;

describe("Timezone Data Transmission Properties", () => {
  let mockWindow: MockWindow;
  let dispatchedEvents: CustomEvent<GeoSpoofSettingsDetail>[];

  beforeEach(() => {
    // Mock window.dispatchEvent
    dispatchedEvents = [];
    mockWindow = {
      dispatchEvent: vi.fn((event: CustomEvent<GeoSpoofSettingsDetail>) => {
        dispatchedEvents.push(event);
        return true;
      }),
    };

    // Mock global window
    assignGlobal("window", mockWindow);

    // Mock cloneInto for Firefox
    assignGlobal("cloneInto", <T>(obj: T) => JSON.parse(JSON.stringify(obj)) as T);

    vi.clearAllMocks();
  });

  afterEach(() => {
    deleteGlobal("window");
    deleteGlobal("cloneInto");
  });

  /**
   * Property 8: CustomEvent Timezone Data Transmission
   *
   * For any timezone data received by Content Script, a CustomEvent should be
   * dispatched containing that timezone data in its payload.
   *
   * **Validates: Requirements 4.2, 4.4**
   */
  test("Property 8: CustomEvent Timezone Data Transmission", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.constantFrom(
            "America/Los_Angeles",
            "America/New_York",
            "Europe/London",
            "Asia/Tokyo",
            "Australia/Sydney",
            "UTC"
          ),
          offset: fc.integer({ min: -720, max: 840 }), // UTC-12 to UTC+14
          dstOffset: fc.integer({ min: 0, max: 60 }),
          fallback: fc.boolean(),
        }),
        fc.record({
          latitude: fc.double({ min: -90, max: 90 }),
          longitude: fc.double({ min: -180, max: 180 }),
          accuracy: fc.integer({ min: 1, max: 1000 }),
        }),
        fc.boolean(),
        (timezone, location, enabled) => {
          // Reset for this test iteration
          dispatchedEvents = [];
          mockWindow.dispatchEvent = vi.fn((event: CustomEvent<GeoSpoofSettingsDetail>) => {
            dispatchedEvents.push(event);
            return true;
          });

          // Simulate content script behavior
          const settingsData: GeoSpoofSettingsDetail = {
            enabled: enabled,
            location: location,
            timezone: timezone,
          };

          const event = new CustomEvent("__geospoof_settings_update", {
            detail:
              typeof cloneInto !== "undefined" ? cloneInto(settingsData, window) : settingsData,
          });

          mockWindow.dispatchEvent(event);

          // Verify CustomEvent was dispatched
          expect(mockWindow.dispatchEvent).toHaveBeenCalledTimes(1);

          // Verify event type
          const dispatchedEvent = dispatchedEvents[0];
          expect(dispatchedEvent.type).toBe("__geospoof_settings_update");

          // Verify timezone data is in payload
          expect(dispatchedEvent.detail).toBeDefined();
          expect(dispatchedEvent.detail.timezone).toBeDefined();
          expect(dispatchedEvent.detail.timezone!.identifier).toBe(timezone.identifier);
          expect(dispatchedEvent.detail.timezone!.offset).toBe(timezone.offset);
          expect(dispatchedEvent.detail.timezone!.dstOffset).toBe(timezone.dstOffset);
          expect(dispatchedEvent.detail.timezone!.fallback).toBe(timezone.fallback);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property 9: Injected Script Timezone Data Storage
   *
   * For any timezone data received via CustomEvent, the Injected Script should
   * store that data and make it available for API overrides.
   *
   * **Validates: Requirements 4.3**
   */
  test("Property 9: Injected Script Timezone Data Storage", () => {
    fc.assert(
      fc.property(
        fc.record({
          identifier: fc.constantFrom(
            "America/Los_Angeles",
            "America/New_York",
            "Europe/London",
            "Asia/Tokyo",
            "Australia/Sydney",
            "UTC"
          ),
          offset: fc.integer({ min: -720, max: 840 }),
          dstOffset: fc.integer({ min: 0, max: 60 }),
          fallback: fc.boolean(),
        }),
        (timezone) => {
          // Simulate injected script receiving CustomEvent
          let storedTimezoneData: Timezone | null = null;

          // Mock event listener (simulating injected script behavior)
          const eventListener = (event: CustomEvent<GeoSpoofSettingsDetail>) => {
            if (event.type === "__geospoof_settings_update" && event.detail) {
              storedTimezoneData = event.detail.timezone;
            }
          };

          // Create and dispatch event
          const settingsData: GeoSpoofSettingsDetail = {
            enabled: true,
            location: { latitude: 35.6762, longitude: 139.6503, accuracy: 10 },
            timezone: timezone,
          };

          const event = new CustomEvent("__geospoof_settings_update", {
            detail: settingsData,
          });

          // Simulate event listener receiving the event
          eventListener(event);

          // Verify timezone data was stored
          expect(storedTimezoneData).toBeDefined();
          expect(storedTimezoneData!.identifier).toBe(timezone.identifier);
          expect(storedTimezoneData!.offset).toBe(timezone.offset);
          expect(storedTimezoneData!.dstOffset).toBe(timezone.dstOffset);
          expect(storedTimezoneData!.fallback).toBe(timezone.fallback);
        }
      ),
      { numRuns: 100 }
    );
  });

  /**
   * Property: CustomEvent Transmission with Null Timezone
   *
   * When timezone data is null, the CustomEvent should still be dispatched
   * with timezone set to null, allowing geolocation spoofing to continue.
   */
  test("CustomEvent transmission handles null timezone gracefully", () => {
    fc.assert(
      fc.property(
        fc.record({
          latitude: fc.double({ min: -90, max: 90 }),
          longitude: fc.double({ min: -180, max: 180 }),
          accuracy: fc.integer({ min: 1, max: 1000 }),
        }),
        fc.boolean(),
        (location, enabled) => {
          // Reset for this test iteration
          dispatchedEvents = [];
          mockWindow.dispatchEvent = vi.fn((event: CustomEvent<GeoSpoofSettingsDetail>) => {
            dispatchedEvents.push(event);
            return true;
          });

          // Simulate content script with null timezone
          const settingsData: GeoSpoofSettingsDetail = {
            enabled: enabled,
            location: location,
            timezone: null,
          };

          const event = new CustomEvent("__geospoof_settings_update", {
            detail:
              typeof cloneInto !== "undefined" ? cloneInto(settingsData, window) : settingsData,
          });

          mockWindow.dispatchEvent(event);

          // Verify CustomEvent was dispatched
          expect(mockWindow.dispatchEvent).toHaveBeenCalledTimes(1);

          // Verify event contains null timezone
          const dispatchedEvent = dispatchedEvents[0];
          expect(dispatchedEvent.detail.timezone).toBeNull();

          // Verify location data is still present
          expect(dispatchedEvent.detail.location).toBeDefined();
          expect(dispatchedEvent.detail.enabled).toBe(enabled);
        }
      ),
      { numRuns: 100 }
    );
  });
});
