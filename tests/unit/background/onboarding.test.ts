/**
 * Unit tests for onboarding functionality
 * Tests onboarding display on first install and completion flag persistence
 * Requirements: 7.1
 */

import { storageData } from "../../setup";
import type { Settings } from "@/shared/types/settings";

const { DEFAULT_SETTINGS, loadSettings, saveSettings, handleCompleteOnboarding } =
  await import("@/background");

describe("Onboarding Functionality", () => {
  describe("First Installation", () => {
    test("should have onboardingCompleted set to false in DEFAULT_SETTINGS", () => {
      expect(DEFAULT_SETTINGS.onboardingCompleted).toBe(false);
    });

    test("should return onboardingCompleted as false when settings are empty", async () => {
      const settings = await loadSettings();

      expect(settings.onboardingCompleted).toBe(false);
    });

    test("should return onboardingCompleted as false on first load", async () => {
      storageData.settings = {
        enabled: false,
        location: null,
        timezone: null,
        locationName: null,
        webrtcProtection: false,
        version: "1.0",
        lastUpdated: Date.now(),
        // onboardingCompleted not present
      };

      const settings = await loadSettings();

      expect(settings.onboardingCompleted).toBe(false);
    });
  });

  describe("Onboarding Completion", () => {
    test("should set onboardingCompleted to true when completed", async () => {
      storageData.settings = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: false,
      };

      await handleCompleteOnboarding();

      const savedSettings = storageData.settings as Settings;
      expect(savedSettings.onboardingCompleted).toBe(true);
    });

    test("should persist onboardingCompleted flag in storage", async () => {
      const settingsWithOnboarding = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: true,
      };

      await saveSettings(settingsWithOnboarding);

      const savedSettings = storageData.settings as Settings;
      expect(savedSettings.onboardingCompleted).toBe(true);
      expect(savedSettings.lastUpdated).toBeDefined();
    });

    test("should load onboardingCompleted flag from storage", async () => {
      storageData.settings = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: true,
      };

      const settings = await loadSettings();

      expect(settings.onboardingCompleted).toBe(true);
    });

    test("should validate onboardingCompleted as boolean", async () => {
      storageData.settings = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: "true", // Invalid type
      };

      const settings = await loadSettings();

      // Should default to false when invalid type
      expect(settings.onboardingCompleted).toBe(false);
    });
  });

  describe("Onboarding State Transitions", () => {
    test("should transition from not completed to completed", async () => {
      // Initial state: not completed
      storageData.settings = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: false,
      };

      const initialSettings = await loadSettings();
      expect(initialSettings.onboardingCompleted).toBe(false);

      // Complete onboarding
      await handleCompleteOnboarding();

      // Verify state changed
      const updatedSettings = await loadSettings();
      expect(updatedSettings.onboardingCompleted).toBe(true);
    });

    test("should remain completed after being set", async () => {
      storageData.settings = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: true,
      };

      // Load multiple times
      const settings1 = await loadSettings();
      const settings2 = await loadSettings();
      const settings3 = await loadSettings();

      expect(settings1.onboardingCompleted).toBe(true);
      expect(settings2.onboardingCompleted).toBe(true);
      expect(settings3.onboardingCompleted).toBe(true);
    });
  });

  describe("Onboarding with Other Settings", () => {
    test("should preserve other settings when completing onboarding", async () => {
      storageData.settings = {
        ...DEFAULT_SETTINGS,
        enabled: true,
        location: { latitude: 37.7749, longitude: -122.4194, accuracy: 10 },
        onboardingCompleted: false,
      };

      await handleCompleteOnboarding();

      const savedSettings = storageData.settings as Settings;
      expect(savedSettings.enabled).toBe(true);
      expect(savedSettings.location).toEqual({
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 10,
      });
      expect(savedSettings.onboardingCompleted).toBe(true);
    });

    test("should not affect onboarding flag when updating other settings", async () => {
      const settings = {
        ...DEFAULT_SETTINGS,
        onboardingCompleted: true,
        enabled: false,
      };

      await saveSettings(settings);

      const savedSettings = storageData.settings as Settings;
      expect(savedSettings.onboardingCompleted).toBe(true);
      expect(savedSettings.enabled).toBe(false);
    });
  });
});
