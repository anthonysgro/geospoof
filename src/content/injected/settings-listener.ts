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
 * Returns a promise that resolves when settings arrive, or rejects if the
 * timeout expires before settings are received.
 *
 * Callers that need to fall through to the real API when spoofing is
 * disabled should check `spoofingEnabled` after the promise resolves.
 * Callers must NOT fall through to the real API on rejection (timeout) —
 * that would leak the user's real location to pages that call the
 * geolocation API early (e.g. in a <head> script) before the content
 * script has had a chance to dispatch settings.
 */
export function waitForSettings(): Promise<{ timedOut: boolean }> {
  if (settingsReceived) return Promise.resolve({ timedOut: false });
  return new Promise<{ timedOut: boolean }>((resolve) => {
    const waitStart = performance.now();
    const onSettings = (): void => {
      window.removeEventListener(EVENT_NAME, onSettings);
      logger.debug(
        `waitForSettings resolved via event after ${(performance.now() - waitStart).toFixed(1)}ms`
      );
      resolve({ timedOut: false });
    };
    window.addEventListener(EVENT_NAME, onSettings);
    setTimeout(() => {
      window.removeEventListener(EVENT_NAME, onSettings);
      logger.warn(
        `waitForSettings timed out after ${(performance.now() - waitStart).toFixed(1)}ms — settings never arrived`
      );
      resolve({ timedOut: true });
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
      logger.debug(
        `Settings event received at ${performance.now().toFixed(1)}ms — enabled:${String(event.detail.enabled)} hasLocation:${String(!!event.detail.location)}`
      );
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
