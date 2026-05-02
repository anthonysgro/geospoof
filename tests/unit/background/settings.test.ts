/**
 * Unit Tests for Settings Management
 * Feature: geolocation-spoof-extension-mvp
 */

import { storageData } from "../../setup";
import { importBackground } from "../../helpers/import-background";

beforeEach(() => {
  // Override storage.set to simulate quota exceeded for large data
  browser.storage.local.set.mockImplementation((obj: Record<string, unknown>) => {
    if (obj.settings) {
      const dataSize = JSON.stringify(obj.settings).length;
      if (dataSize > 100000) {
        return Promise.reject(new Error("QuotaExceededError: Storage quota exceeded"));
      }
      storageData.settings = obj.settings;
    }
    return Promise.resolve();
  });
});

describe("Settings Edge Cases", () => {
  /**
   * Test corrupted settings data recovery
   * Validates: Requirements 6.7
   */
  test("should recover from corrupted settings data", async () => {
    const { loadSettings, DEFAULT_SETTINGS } = await importBackground();

    // Set corrupted data in storage
    storageData.settings = {
      enabled: "not a boolean", // Invalid type
      location: {
        latitude: 200, // Out of range
        longitude: -500, // Out of range
        accuracy: "invalid",
      },
      timezone: "not an object", // Invalid type
      webrtcProtection: null, // Invalid type
      version: 123, // Invalid type
    };

    // Load settings should return defaults for invalid fields
    const settings = await loadSettings();

    expect(settings.enabled).toBe(DEFAULT_SETTINGS.enabled);
    expect(settings.location).toBeNull(); // Invalid coordinates should be reset
    expect(settings.timezone).toBeNull(); // Invalid timezone should be reset
    expect(settings.webrtcProtection).toBe(DEFAULT_SETTINGS.webrtcProtection);
    expect(settings.version).toBe(DEFAULT_SETTINGS.version);
  });

  /**
   * Test storage quota exceeded handling
   * Validates: Requirements 6.7
   */
  test("should handle storage quota exceeded error", async () => {
    const { saveSettings, DEFAULT_SETTINGS } = await importBackground();

    // Create settings with very large data that will exceed quota
    const largeSettings = {
      ...DEFAULT_SETTINGS,
      enabled: true,
      location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
      timezone: { identifier: "America/Los_Angeles", offset: 480, dstOffset: 60 },
      locationName: {
        city: "A".repeat(50000), // Very large string
        country: "B".repeat(50000),
        displayName: "C".repeat(50000),
      },
      webrtcProtection: false,
    };

    // Attempt to save should throw error
    await expect(saveSettings(largeSettings)).rejects.toThrow("Storage quota exceeded");
  });

  /**
   * Test default values when storage is empty
   * Validates: Requirements 6.7
   */
  test("should return default values when storage is empty", async () => {
    const { loadSettings, DEFAULT_SETTINGS } = await importBackground();

    // Ensure storage is empty
    await browser.storage.local.clear();

    const settings = await loadSettings();

    expect(settings.enabled).toBe(DEFAULT_SETTINGS.enabled);
    expect(settings.location).toBeNull();
    expect(settings.timezone).toBeNull();
    expect(settings.locationName).toBeNull();
    expect(settings.webrtcProtection).toBe(DEFAULT_SETTINGS.webrtcProtection);
    expect(settings.version).toBe(DEFAULT_SETTINGS.version);
  });

  /**
   * Test partial corruption recovery
   */
  test("should recover valid fields from partially corrupted settings", async () => {
    const { loadSettings } = await importBackground();

    // Set partially corrupted data
    storageData.settings = {
      enabled: true, // Valid
      location: {
        latitude: 37.7749, // Valid
        longitude: -122.4194, // Valid
        accuracy: 10, // Valid
      },
      timezone: "invalid", // Invalid - should be reset
      locationName: {
        city: "San Francisco", // Valid
        country: "USA", // Valid
        displayName: "San Francisco, CA, USA", // Valid
      },
      webrtcProtection: "yes", // Invalid - should be reset
      version: "1.0", // Valid
    };

    const settings = await loadSettings();

    // Valid fields should be preserved
    expect(settings.enabled).toBe(true);
    expect(settings.location).not.toBeNull();
    expect(settings.location!.latitude).toBe(37.7749);
    expect(settings.location!.longitude).toBe(-122.4194);
    expect(settings.locationName).not.toBeNull();
    expect(settings.locationName!.city).toBe("San Francisco");
    expect(settings.version).toBe("1.0");

    // Invalid fields should be reset to defaults
    expect(settings.timezone).toBeNull();
    expect(settings.webrtcProtection).toBe(false);
  });

  /**
   * Test coordinate boundary validation
   */
  test("should reject coordinates outside valid ranges", async () => {
    const { loadSettings } = await importBackground();

    // Test latitude out of range
    storageData.settings = {
      enabled: true,
      location: {
        latitude: 91, // Out of range
        longitude: 0,
        accuracy: 10,
      },
    };

    let settings = await loadSettings();
    expect(settings.location).toBeNull();

    // Test longitude out of range
    storageData.settings = {
      enabled: true,
      location: {
        latitude: 0,
        longitude: -181, // Out of range
        accuracy: 10,
      },
    };

    settings = await loadSettings();
    expect(settings.location).toBeNull();
  });

  /**
   * Test settings with missing required fields
   */
  test("should handle settings with missing fields", async () => {
    const { loadSettings, DEFAULT_SETTINGS } = await importBackground();

    // Set incomplete settings
    storageData.settings = {
      enabled: true,
      // Missing all other fields
    };

    const settings = await loadSettings();

    expect(settings.enabled).toBe(true);
    expect(settings.location).toBeNull();
    expect(settings.timezone).toBeNull();
    expect(settings.locationName).toBeNull();
    expect(settings.webrtcProtection).toBe(DEFAULT_SETTINGS.webrtcProtection);
    expect(settings.version).toBe(DEFAULT_SETTINGS.version);
  });
});
