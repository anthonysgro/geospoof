/**
 * Permissions API override.
 *
 * Overrides `navigator.permissions.query` to return "granted" for
 * geolocation permission when spoofing is enabled.
 */

import {
  spoofingEnabled,
  settingsReceived,
  preserveGeolocationPrompt,
  originalPermissionsQuery,
  nativePermissionsQuery,
} from "./state";
import { installOverride, stripExtensionFramesFromStack } from "./function-masking";
import { waitForSettings } from "./settings-listener";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

/**
 * Create a W3C-compliant PermissionStatus object with state "granted".
 *
 * We return an object whose prototype chain points at `PermissionStatus.
 * prototype`, so page-side checks like `status instanceof PermissionStatus`
 * and `Object.prototype.toString.call(status)` (which reads
 * `Symbol.toStringTag` off the prototype, yielding
 * `"[object PermissionStatus]"`) match native. A plain EventTarget — which
 * is what the previous implementation returned — brands as
 * `"[object EventTarget]"`, which is a direct detection vector.
 *
 * `state`, `name`, and `onchange` are installed as own data properties
 * so that the prototype's brand-checked accessors are bypassed (the
 * same trick we use for GeolocationCoordinates.latitude in geolocation.ts).
 */
function createSpoofedPermissionStatus(name: PermissionName = "geolocation"): PermissionStatus {
  const target =
    typeof PermissionStatus !== "undefined" && PermissionStatus.prototype
      ? (Object.create(PermissionStatus.prototype) as PermissionStatus)
      : (new EventTarget() as unknown as PermissionStatus);

  let onchangeHandler: ((this: PermissionStatus, ev: Event) => unknown) | null = null;

  Object.defineProperty(target, "state", {
    value: "granted",
    writable: false,
    enumerable: true,
    configurable: false,
  });

  Object.defineProperty(target, "name", {
    value: name,
    writable: false,
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

  return target;
}

/**
 * Install the `Permissions.prototype.query` override.
 *
 * When spoofing is enabled and the queried permission is "geolocation",
 * returns a spoofed PermissionStatus with state "granted". Falls back
 * to the original API for all other permission types or when spoofing
 * is disabled. No-ops gracefully if `navigator.permissions.query` is
 * unavailable.
 *
 * Installed on `Permissions.prototype` — not on `navigator.permissions`
 * — so `Object.getOwnPropertyDescriptor(navigator.permissions, "query")`
 * correctly returns `undefined` (the method is inherited), and the
 * prototype descriptor matches the WebIDL-specified native shape.
 *
 * `installOverride` reads the target's existing descriptor and preserves
 * its flags, so we automatically match the native shape without
 * hardcoding it here.
 */
export function installPermissionsOverride(): void {
  if (!originalPermissionsQuery) {
    logger.warn("navigator.permissions.query not available, skipping override");
    return;
  }
  if (typeof Permissions === "undefined" || !Permissions.prototype) {
    logger.warn("Permissions interface not exposed, skipping override");
    return;
  }

  const permissionsQueryOverride = function (
    this: unknown,
    descriptor: PermissionDescriptor
  ): Promise<PermissionStatus> {
    // WebIDL brand check: native `Permissions.prototype.query.call(notPermissions, …)`
    // throws `TypeError` synchronously ("Illegal invocation" / "does not implement
    // interface Permissions") before returning a promise. Our override must do the
    // same, or a page can detect it with one line:
    //   Permissions.prototype.query.call({}, { name: "geolocation" })
    // We reproduce the genuine error by invoking the unbound native method with the
    // foreign `this`, then strip our injected-script frames from the stack so the
    // extension id can't be read off it (Blink shows a chrome-extension:// frame).
    if (
      nativePermissionsQuery &&
      typeof Permissions !== "undefined" &&
      !(this instanceof Permissions)
    ) {
      try {
        // Cast the foreign `this` to Permissions deliberately — we WANT the
        // native method to reject it. `.call` keeps this fully typed (returns
        // Promise<PermissionStatus>), unlike Reflect.apply's `any`.
        return nativePermissionsQuery.call(this, descriptor);
      } catch (err) {
        stripExtensionFramesFromStack(err);
        throw err;
      }
    }
    try {
      if (descriptor?.name === "geolocation") {
        logger.debug("permissions.query: intercepted geolocation check", {
          spoofingEnabled,
          settingsReceived,
          preserveGeolocationPrompt,
        });
        if (settingsReceived) {
          // In preserve-prompt mode we never fake "granted" — the page should
          // see the genuine permission state so a yet-to-be-prompted site reads
          // "prompt" (and a denied site "denied"), matching a normal browser and
          // shedding the always-granted fingerprinting signal.
          if (spoofingEnabled && !preserveGeolocationPrompt) {
            return Promise.resolve(createSpoofedPermissionStatus());
          }
          return originalPermissionsQuery(descriptor);
        }
        // Defer until settings arrive
        return waitForSettings().then(() => {
          if (spoofingEnabled && !preserveGeolocationPrompt) {
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

  installOverride(Permissions.prototype, "query", permissionsQueryOverride, 1);
}
