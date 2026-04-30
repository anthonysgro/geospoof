/**
 * Content Script
 * Injects override code into page context and manages settings.
 *
 * Communicates with the background script via browser.runtime messaging
 * and with the injected page-context script via CustomEvent (CSP-safe).
 */

import type { Location, Timezone } from "@/shared/types/settings";
import type { UpdateSettingsPayload } from "@/shared/types/messages";
import { createLogger, setDebugEnabled, setVerbosityLevel } from "@/shared/utils/debug-logger";

const logger = createLogger("CS");

// Settings received from background script
let spoofingEnabled = false;
let spoofedLocation: Location | null = null;
let timezoneOverride: Timezone | null = null;
let debugLogging = false;
let verbosityLevel = "INFO";

// Event name for settings updates (configurable for stealth)
const EVENT_NAME: string = process.env.EVENT_NAME || "__x_evt";

/** Data dispatched to the injected script via CustomEvent. */
interface SettingsEventDetail {
  enabled: boolean;
  location: Location | null;
  timezone: Timezone | null;
  debugLogging: boolean;
  verbosityLevel: string;
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
    debugLogging,
    verbosityLevel,
  };

  // For Firefox, use cloneInto to make the object accessible in page context
  const detail = typeof cloneInto !== "undefined" ? cloneInto(settingsData, window) : settingsData;

  const event = new CustomEvent(EVENT_NAME, { detail });

  try {
    window.dispatchEvent(event);
    logger.info("Dispatched settings to injected script:", settingsData);
  } catch (error) {
    logger.error("Failed to dispatch settings update:", error);
    // Retry once after 100ms delay
    setTimeout(() => {
      try {
        window.dispatchEvent(event);
        logger.info("Retry successful: Dispatched settings to injected script");
      } catch (retryError) {
        logger.error("Retry failed to dispatch settings update:", retryError);
      }
    }, 100);
  }
}

// On both Firefox and Chromium, the injected script is loaded by the manifest
// as a content script with world: "MAIN" and run_at: "document_start", so it
// runs synchronously before any page scripts — no XHR injection needed.
// Firefox 128+ supports world: "MAIN"; our minimum is Firefox 140.
logger.info("Injected script loaded via manifest world:MAIN");

// Send initial settings after script is injected
updateInjectedScript();

// Listen for settings updates from background script
browser.runtime.onMessage.addListener(
  (message: { type: string; payload?: UpdateSettingsPayload }) => {
    logger.debug("Received message from background:", {
      type: message.type,
      payload: message.payload,
    });

    if (message.type === "UPDATE_SETTINGS" && message.payload) {
      spoofingEnabled = message.payload.enabled;
      spoofedLocation = message.payload.location;
      timezoneOverride = message.payload.timezone;
      debugLogging = message.payload.debugLogging;
      verbosityLevel = message.payload.verbosityLevel ?? "INFO";
      setDebugEnabled(debugLogging);
      setVerbosityLevel(verbosityLevel);
      logger.debug("Settings updated:", {
        enabled: spoofingEnabled,
        location: spoofedLocation,
        timezone: timezoneOverride,
        debugLogging,
        verbosityLevel,
      });
      updateInjectedScript();
    } else if (message.type === "PING") {
      // Respond to ping to confirm content script is injected
      return Promise.resolve({ pong: true });
    }
  }
);

// Request initial settings on load
logger.info("Content script loaded, requesting initial settings");
browser.runtime
  .sendMessage({ type: "GET_SETTINGS" })
  .then(
    (settings: {
      enabled: boolean;
      location: Location | null;
      timezone: Timezone | null;
      debugLogging: boolean;
      verbosityLevel: string;
    }) => {
      spoofingEnabled = settings.enabled;
      spoofedLocation = settings.location;
      timezoneOverride = settings.timezone;
      debugLogging = settings.debugLogging;
      verbosityLevel = settings.verbosityLevel ?? "INFO";
      setDebugEnabled(debugLogging);
      setVerbosityLevel(verbosityLevel);
      logger.debug("Initial settings loaded:", {
        enabled: spoofingEnabled,
        location: spoofedLocation,
        timezone: timezoneOverride,
        debugLogging,
        verbosityLevel,
      });
      updateInjectedScript();
    }
  )
  .catch((error: unknown) => {
    logger.error("Failed to get initial settings:", error);
  });
