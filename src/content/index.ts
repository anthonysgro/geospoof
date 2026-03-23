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
 * Build-time constant set by the browser target Vite plugin.
 * `true` when building for Chromium-based browsers, `false` for Firefox.
 */
declare const __CHROMIUM__: boolean;

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

// Inject the override script into the page context IMMEDIATELY.
// On Chromium, the injected script is loaded by the manifest as a content script
// with world: "MAIN", so no XHR injection is needed.
// On Firefox, synchronous XHR is intentional: content scripts run at document_start
// and must install API overrides before any page JavaScript executes. Async
// alternatives (fetch, <script src>) create a race window where pages can
// observe the real geolocation API. Sync XHR from a content script does not
// block the browser UI thread — it only blocks this content script's execution,
// which is the desired behavior.
if (!__CHROMIUM__) {
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("GET", browser.runtime.getURL("content/injected.js"), false); // synchronous
    xhr.send();

    if (xhr.status === 200) {
      const script = document.createElement("script");
      script.textContent = xhr.responseText;
      (document.head || document.documentElement).prepend(script);
      script.remove();
      logger.info("Injected script via sync XHR (Firefox)");
    } else {
      logger.error("Failed to load injected script:", xhr.status);
    }
  } catch (e) {
    logger.error("Failed to inject script:", e);
  }
} else {
  logger.info("Injected script loaded via manifest world:MAIN (Chromium)");
}

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
