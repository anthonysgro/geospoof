/**
 * Iframe geolocation + toString patching.
 *
 * Fingerprinting scripts use two techniques to bypass geolocation spoofing:
 *
 * 1. toString bypass — create an iframe, grab iframeWindow.Function.prototype.toString
 *    to get a "clean" reference and cross-check our overrides.
 *
 * 2. Geolocation bypass — call navigator.geolocation.getCurrentPosition from
 *    inside the iframe's window context (via iframe.contentWindow, window[n],
 *    or frames[n]). The iframe gets its own fresh navigator.geolocation that
 *    has never been patched by our injected script.
 *
 * We fix both by patching the iframe window synchronously on every access path:
 * - contentWindow getter override (catches direct property access)
 * - DOM insertion wrappers (catches appendChild/innerHTML patterns)
 * - window[n] / frames[n] numeric indexing (caught via the same DOM insertion
 *   hooks — the iframe is in the DOM before the index is valid)
 */

import type { AnyFunction, SpoofedLocation } from "./types";
import { overrideRegistry, spoofingEnabled, spoofedLocation, settingsReceived } from "./state";
import {
  registerOverride,
  disguiseAsNative,
  stripConstruct,
  nativeTypeErrorMessage,
} from "./function-masking";
import { waitForSettings } from "./settings-listener";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

// Track which iframe windows have already been patched to avoid re-patching
const patchedIframeWindows = new WeakSet<Window>();

/**
 * Build a spoofed GeolocationPosition from the current shared state.
 * Mirrors the logic in geolocation.ts but is inlined here to avoid a
 * circular import (geolocation.ts → state.ts ← iframe-patching.ts).
 */
function buildSpoofedPosition(location: SpoofedLocation): GeolocationPosition {
  return {
    coords: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy ?? 10,
      altitude: null,
      altitudeAccuracy: null,
      heading: null,
      speed: null,
    },
    timestamp: Date.now(),
  } as unknown as GeolocationPosition;
}

/**
 * Patch an iframe window's geolocation API and Function.prototype.toString
 * to use the shared spoofing state and override registry.
 *
 * Safe to call multiple times — subsequent calls for the same window are no-ops.
 */
export function patchIframeWindow(iframeWindow: Window): void {
  if (patchedIframeWindows.has(iframeWindow)) return;
  patchedIframeWindows.add(iframeWindow);

  // ── 1. toString masking ──────────────────────────────────────────────
  try {
    logger.trace("Patching iframe window toString");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeFnProto = (iframeWindow as any).Function.prototype as {
      toString: AnyFunction;
      call: typeof Function.prototype.call;
    };
    const iframeOrigToString = iframeFnProto.toString;
    const iframeOrigCall = iframeFnProto.call;

    // Use method shorthand so the patched toString has no prototype/[[Construct]]
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: method shorthand destructuring for anti-fingerprint
    iframeFnProto.toString = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toString(this: any): string {
        const nativeName = overrideRegistry.get(this as AnyFunction);
        if (nativeName !== undefined) {
          return `function ${nativeName}() { [native code] }`;
        }
        // Pre-check: throw TypeError directly for non-functions (same
        // reason as the main window override — single stack frame).
        if (typeof this !== "function") {
          throw new TypeError(nativeTypeErrorMessage);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        return (iframeOrigCall as any).call(iframeOrigToString, this) as string;
      },
    }.toString;
  } catch {
    // Cross-origin iframes throw SecurityError — silently ignore
  }

  // ── 2. Geolocation override ──────────────────────────────────────────
  // The iframe has its own navigator.geolocation instance that was never
  // patched by our injected script. We override it here so that calls like
  //   iframe.contentWindow.navigator.geolocation.getCurrentPosition(cb)
  // return the spoofed location instead of the real one.
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeNav = (iframeWindow as any).navigator as Navigator;
    if (!iframeNav?.geolocation) return;

    const iframeGeo = iframeNav.geolocation;

    // Capture the iframe's own originals before we overwrite them

    const iframeOrigGetCurrentPosition = iframeGeo.getCurrentPosition.bind(iframeGeo);

    const iframeOrigWatchPosition = iframeGeo.watchPosition.bind(iframeGeo);

    const iframeOrigClearWatch = iframeGeo.clearWatch.bind(iframeGeo);

    // Shared watch-id tracking for this iframe instance
    const iframeWatchCallbacks = new Map<number, PositionCallback>();
    let iframeWatchIdCounter = 1;

    const iframeGetCurrentPosition = (
      successCallback: PositionCallback,
      errorCallback?: PositionErrorCallback | null,
      options?: PositionOptions
    ): void => {
      const respond = ({ timedOut }: { timedOut: boolean }): void => {
        if (timedOut) {
          logger.warn("iframe getCurrentPosition: settings timed out, returning TIMEOUT error");
          if (errorCallback) {
            errorCallback({
              code: GeolocationPositionError.TIMEOUT,
              message: "Settings not received in time",
              PERMISSION_DENIED: GeolocationPositionError.PERMISSION_DENIED,
              POSITION_UNAVAILABLE: GeolocationPositionError.POSITION_UNAVAILABLE,
              TIMEOUT: GeolocationPositionError.TIMEOUT,
            });
          }
          return;
        }
        if (spoofingEnabled && spoofedLocation) {
          const pos = buildSpoofedPosition(spoofedLocation);
          const delay = 10 + Math.random() * 40;
          logger.debug("iframe getCurrentPosition: returning spoofed coords", {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          });
          setTimeout(() => successCallback(pos), delay);
        } else {
          iframeOrigGetCurrentPosition(successCallback, errorCallback, options);
        }
      };

      if (settingsReceived) {
        respond({ timedOut: false });
      } else {
        void waitForSettings().then(respond);
      }
    };

    const iframeWatchPosition = (
      successCallback: PositionCallback,
      errorCallback?: PositionErrorCallback | null,
      options?: PositionOptions
    ): number => {
      if (spoofingEnabled && spoofedLocation) {
        const watchId = iframeWatchIdCounter++;
        iframeWatchCallbacks.set(watchId, successCallback);
        const pos = buildSpoofedPosition(spoofedLocation);
        const delay = 10 + Math.random() * 40;
        setTimeout(() => successCallback(pos), delay);
        return watchId;
      }
      return iframeOrigWatchPosition(successCallback, errorCallback, options);
    };

    const iframeClearWatch = (watchId: number): void => {
      if (spoofingEnabled) {
        iframeWatchCallbacks.delete(watchId);
      } else {
        iframeOrigClearWatch(watchId);
      }
    };

    // Register for toString masking so the iframe's toString check also passes
    registerOverride(iframeGetCurrentPosition, "getCurrentPosition");
    disguiseAsNative(iframeGetCurrentPosition, "getCurrentPosition", 1);
    registerOverride(iframeWatchPosition, "watchPosition");
    disguiseAsNative(iframeWatchPosition, "watchPosition", 1);
    registerOverride(iframeClearWatch, "clearWatch");
    disguiseAsNative(iframeClearWatch, "clearWatch", 1);

    iframeGeo.getCurrentPosition = iframeGetCurrentPosition;
    iframeGeo.watchPosition = iframeWatchPosition;
    iframeGeo.clearWatch = iframeClearWatch;

    logger.trace("Patched iframe geolocation API");
  } catch {
    // Cross-origin or sandboxed iframes may throw — silently ignore
  }

  // ── 3. Permissions override ──────────────────────────────────────────
  // Also patch navigator.permissions.query in the iframe so that
  // permission checks from within the iframe also return "granted".
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframePerms = (iframeWindow as any).navigator?.permissions as Permissions | undefined;
    if (iframePerms?.query) {
      const iframeOrigQuery = iframePerms.query.bind(iframePerms);

      const iframePermissionsQuery = (
        descriptor: PermissionDescriptor
      ): Promise<PermissionStatus> => {
        if (descriptor?.name === "geolocation" && spoofingEnabled) {
          // Return a minimal PermissionStatus-like object with state "granted"
          const target = new EventTarget();
          Object.defineProperty(target, "state", {
            get: () => "granted" as PermissionState,
            enumerable: true,
            configurable: false,
          });
          Object.defineProperty(target, "onchange", {
            value: null,
            writable: true,
            enumerable: true,
            configurable: true,
          });
          return Promise.resolve(target as unknown as PermissionStatus);
        }
        return iframeOrigQuery(descriptor);
      };

      registerOverride(iframePermissionsQuery, "query");
      disguiseAsNative(iframePermissionsQuery, "query", 1);
      iframePerms.query = iframePermissionsQuery;
    }
  } catch {
    // Silently ignore
  }
}

/** Scan a node (and descendants) for iframes and patch their windows. */
export function scanAndPatchIframes(node: Node): void {
  if (node instanceof HTMLIFrameElement) {
    if (node.contentWindow) {
      try {
        logger.trace("Iframe patching: scanning iframe", { src: node.src || "(no src)" });
        patchIframeWindow(node.contentWindow);
      } catch {
        /* cross-origin */
      }
    }
  }
  if (node instanceof Element) {
    for (const iframe of Array.from(node.querySelectorAll("iframe"))) {
      if (iframe.contentWindow) {
        try {
          logger.trace("Iframe patching: scanning iframe", { src: iframe.src || "(no src)" });
          patchIframeWindow(iframe.contentWindow);
        } catch {
          /* cross-origin */
        }
      }
    }
  }
}

/**
 * Install contentWindow/contentDocument getter overrides on HTMLIFrameElement.prototype.
 * Called by index.ts during initialization.
 */
export function installIframePatching(): void {
  // Override HTMLIFrameElement.prototype.contentWindow getter to patch
  // the iframe's toString synchronously on first access.
  const iframeContentWindowDesc = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    "contentWindow"
  );
  if (iframeContentWindowDesc?.get) {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the wrapper
    const originalContentWindowGet = iframeContentWindowDesc.get;
    // Wrap via stripConstruct so the getter has no prototype/[[Construct]]

    const contentWindowGetter = stripConstruct(function (
      this: HTMLIFrameElement
    ): WindowProxy | null {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const win = originalContentWindowGet.call(this);
      if (win) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          patchIframeWindow(win);
        } catch {
          // Ignore cross-origin errors
        }
      }
      return win;
    });
    registerOverride(contentWindowGetter, "contentWindow");
    disguiseAsNative(contentWindowGetter, "contentWindow", 0);
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      get: contentWindowGetter,
      configurable: iframeContentWindowDesc.configurable,
      enumerable: iframeContentWindowDesc.enumerable,
    });
  }

  // Also intercept contentDocument for completeness — some tests access
  // the iframe's document to get Function.prototype.toString from there.
  const iframeContentDocDesc = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    "contentDocument"
  );
  if (iframeContentDocDesc?.get) {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the wrapper
    const originalContentDocGet = iframeContentDocDesc.get;

    const contentDocGetter = stripConstruct(function (this: HTMLIFrameElement): Document | null {
      // Trigger contentWindow patching first
      const win = this.contentWindow; // uses our patched getter above
      void win; // ensure side-effect
      return originalContentDocGet.call(this);
    });
    registerOverride(contentDocGetter, "contentDocument");
    disguiseAsNative(contentDocGetter, "contentDocument", 0);
    Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
      get: contentDocGetter,
      configurable: iframeContentDocDesc.configurable,
      enumerable: iframeContentDocDesc.enumerable,
    });
  }
}
