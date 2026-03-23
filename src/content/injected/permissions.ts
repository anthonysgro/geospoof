/**
 * Permissions API override.
 *
 * Overrides `navigator.permissions.query` to return "granted" for
 * geolocation permission when spoofing is enabled.
 */

import { spoofingEnabled, settingsReceived, originalPermissionsQuery } from "./state";
import { registerOverride, disguiseAsNative } from "./function-masking";
import { waitForSettings } from "./settings-listener";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/** Create a spoofed PermissionStatus object with state "granted". */
function createSpoofedPermissionStatus(): PermissionStatus {
  const target = new EventTarget();
  let onchangeHandler: ((this: PermissionStatus, ev: Event) => unknown) | null = null;

  Object.defineProperty(target, "state", {
    get: () => "granted" as PermissionState,
    enumerable: true,
    configurable: false,
  });

  Object.defineProperty(target, "onchange", {
    get: () => onchangeHandler,
    set: (value: ((this: PermissionStatus, ev: Event) => unknown) | null) => {
      onchangeHandler = value;
    },
    enumerable: true,
    configurable: true,
  });

  return target as unknown as PermissionStatus;
}

/**
 * Install the `navigator.permissions.query` override.
 *
 * When spoofing is enabled and the queried permission is "geolocation",
 * returns a spoofed PermissionStatus with state "granted". Falls back
 * to the original API for all other permission types or when spoofing
 * is disabled. No-ops gracefully if `navigator.permissions.query` is
 * unavailable.
 */
export function installPermissionsOverride(): void {
  if (originalPermissionsQuery) {
    const permissionsQueryOverride = (
      descriptor: PermissionDescriptor
    ): Promise<PermissionStatus> => {
      try {
        if (descriptor?.name === "geolocation") {
          logger.debug("permissions.query: intercepted geolocation check", {
            spoofingEnabled,
            settingsReceived,
          });
          if (settingsReceived) {
            if (spoofingEnabled) {
              return Promise.resolve(createSpoofedPermissionStatus());
            }
            return originalPermissionsQuery(descriptor);
          }
          // Defer until settings arrive
          return waitForSettings().then(() => {
            if (spoofingEnabled) {
              return createSpoofedPermissionStatus();
            }
            return originalPermissionsQuery(descriptor);
          });
        }
        return originalPermissionsQuery(descriptor);
      } catch (error) {
        logger.error("Error in permissions.query override:", error);
        return originalPermissionsQuery(descriptor);
      }
    };
    registerOverride(permissionsQueryOverride, "query");
    disguiseAsNative(permissionsQueryOverride, "query", 1);
    navigator.permissions.query = permissionsQueryOverride;
  } else {
    logger.warn("navigator.permissions.query not available, skipping override");
  }
}
