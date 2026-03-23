/**
 * Settings event listener and waitForSettings utility.
 *
 * Registers a CustomEvent listener on `window` that receives spoofing
 * settings from the content script and updates shared state accordingly.
 * Also provides `waitForSettings()` for modules that need to defer
 * until settings have arrived.
 */

import type { SettingsEventDetail } from "./types";
import {
  EVENT_NAME,
  SETTINGS_WAIT_TIMEOUT,
  settingsReceived,
  setSpoofingEnabled,
  setSpoofedLocation,
  setTimezoneData,
  setSettingsReceived,
  setDebugEnabled as setStateDebugEnabled,
} from "./state";
import { validateTimezoneData } from "./timezone-helpers";
import {
  setDebugEnabled as setLoggerDebugEnabled,
  setVerbosityLevel as setLoggerVerbosityLevel,
  createLogger,
} from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/**
 * Returns a promise that resolves when settings arrive or timeout expires.
 * Used by geolocation/permissions overrides to defer rather than leaking
 * the user's real location before settings are received.
 */
export function waitForSettings(): Promise<void> {
  if (settingsReceived) return Promise.resolve();
  return new Promise<void>((resolve) => {
    const onSettings = (): void => {
      window.removeEventListener(EVENT_NAME, onSettings);
      resolve();
    };
    window.addEventListener(EVENT_NAME, onSettings);
    setTimeout(() => {
      window.removeEventListener(EVENT_NAME, onSettings);
      resolve();
    }, SETTINGS_WAIT_TIMEOUT);
  });
}

/**
 * Install the settings event listener on `window`.
 *
 * Listens for the CustomEvent dispatched by the content script, updates
 * shared spoofing state, and validates timezone data before applying it.
 */
export function installSettingsListener(): void {
  window.addEventListener(EVENT_NAME, ((event: CustomEvent<SettingsEventDetail>) => {
    if (event.detail) {
      setSpoofingEnabled(event.detail.enabled);
      setSpoofedLocation(event.detail.location);
      setSettingsReceived(true);

      const debugFlag = event.detail.debugLogging ?? false;
      setStateDebugEnabled(debugFlag);
      setLoggerDebugEnabled(debugFlag);

      const verbosity = event.detail.verbosityLevel ?? "INFO";
      setLoggerVerbosityLevel(verbosity);

      if (event.detail.timezone) {
        if (validateTimezoneData(event.detail.timezone)) {
          setTimezoneData(event.detail.timezone);
          logger.debug("Timezone data updated:", event.detail.timezone);
        } else {
          logger.error("Invalid timezone data received, timezone spoofing disabled");
          setTimezoneData(null);
        }
      } else {
        setTimezoneData(null);
      }

      logger.info("Settings updated via event:", {
        enabled: event.detail.enabled,
        location: event.detail.location,
        timezone: event.detail.timezone,
        debugLogging: debugFlag,
      });
    }
  }) as EventListener);
}
