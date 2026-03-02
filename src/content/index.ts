/**
 * Content Script
 * Injects override code into page context and manages settings.
 *
 * Communicates with the background script via browser.runtime messaging
 * and with the injected page-context script via CustomEvent (CSP-safe).
 */

import type { Location, Timezone } from "@/shared/types/settings";
import type { UpdateSettingsPayload } from "@/shared/types/messages";

// Settings received from background script
let spoofingEnabled = false;
let spoofedLocation: Location | null = null;
let timezoneOverride: Timezone | null = null;

// Event name for settings updates (configurable for stealth)
const EVENT_NAME: string = process.env.EVENT_NAME || "__geospoof_settings_update";

/** Data dispatched to the injected script via CustomEvent. */
interface SettingsEventDetail {
  enabled: boolean;
  location: Location | null;
  timezone: Timezone | null;
}

/**
 * Declare Firefox-specific `cloneInto` helper that makes objects accessible
 * across content-script / page-context boundaries.
 */
declare function cloneInto<T>(obj: T, targetScope: typeof globalThis): T;

/**
 * Dispatch current spoofing settings to the injected page-context script
 * using a CustomEvent (CSP-safe communication channel).
 */
function updateInjectedScript(): void {
  const settingsData: SettingsEventDetail = {
    enabled: spoofingEnabled,
    location: spoofedLocation,
    timezone: timezoneOverride,
  };

  // For Firefox, use cloneInto to make the object accessible in page context
  const detail = typeof cloneInto !== "undefined" ? cloneInto(settingsData, window) : settingsData;

  const event = new CustomEvent(EVENT_NAME, { detail });

  try {
    window.dispatchEvent(event);
    console.log("[GeoSpoof Content] Dispatched settings update event:", {
      spoofingEnabled,
      spoofedLocation,
      timezoneOverride,
    });
  } catch (error) {
    console.error("[GeoSpoof Content] Failed to dispatch settings update:", error);
    // Retry once after 100ms delay
    setTimeout(() => {
      try {
        window.dispatchEvent(event);
        console.log("[GeoSpoof Content] Retry successful: Dispatched settings update event");
      } catch (retryError) {
        console.error("[GeoSpoof Content] Retry failed to dispatch settings update:", retryError);
      }
    }, 100);
  }
}

// Inject the override script into the page context IMMEDIATELY.
// Use synchronous XHR to fetch the script content so it executes inline
// via textContent — this guarantees the event listener is registered
// before any page JS or settings dispatch runs.
try {
  const xhr = new XMLHttpRequest();
  xhr.open("GET", browser.runtime.getURL("content/injected.js"), false); // synchronous
  xhr.send();

  if (xhr.status === 200) {
    const script = document.createElement("script");
    script.textContent = xhr.responseText;
    (document.head || document.documentElement).prepend(script);
    script.remove();
  } else {
    console.error("[GeoSpoof Content] Failed to load injected script:", xhr.status);
  }
} catch (e) {
  console.error("[GeoSpoof Content] Failed to inject script:", e);
}

// Send initial settings after script is injected
updateInjectedScript();

// Listen for settings updates from background script
browser.runtime.onMessage.addListener(
  (message: { type: string; payload?: UpdateSettingsPayload }) => {
    console.log("[GeoSpoof Content] Received message:", message);

    if (message.type === "UPDATE_SETTINGS" && message.payload) {
      spoofingEnabled = message.payload.enabled;
      spoofedLocation = message.payload.location;
      timezoneOverride = message.payload.timezone;
      console.log(
        "[GeoSpoof Content] Settings updated. Enabled:",
        spoofingEnabled,
        "Location:",
        spoofedLocation
      );
      updateInjectedScript();
    } else if (message.type === "PING") {
      // Respond to ping to confirm content script is injected
      return Promise.resolve({ pong: true });
    }
  }
);

// Request initial settings on load
console.log("[GeoSpoof Content] Content script loaded, requesting initial settings");
browser.runtime
  .sendMessage({ type: "GET_SETTINGS" })
  .then((settings: { enabled: boolean; location: Location | null; timezone: Timezone | null }) => {
    spoofingEnabled = settings.enabled;
    spoofedLocation = settings.location;
    timezoneOverride = settings.timezone;
    console.log(
      "[GeoSpoof Content] Initial settings loaded. Enabled:",
      spoofingEnabled,
      "Location:",
      spoofedLocation
    );
    updateInjectedScript();
  })
  .catch((error: unknown) => {
    console.error("[GeoSpoof Content] Failed to get initial settings:", error);
  });
