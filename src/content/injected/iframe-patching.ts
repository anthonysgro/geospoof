/**
 * Iframe geolocation + toString + timezone patching.
 *
 * Fingerprinting scripts bypass top-level overrides by reading from
 * inside a same-origin iframe's realm — the iframe gets its own fresh
 * globals that never passed through our injected script:
 *
 * 1. toString bypass — `iframeWindow.Function.prototype.toString` gives
 *    a clean reference for cross-checking our overrides.
 *
 * 2. Geolocation bypass — `iframe.contentWindow.navigator.geolocation`
 *    is a fresh instance with unpatched methods.
 *
 * 3. Timezone bypass — `iframe.contentWindow.Intl.DateTimeFormat` and
 *    `iframe.contentWindow.Date` see the real system timezone, because
 *    each iframe realm has its own Intl/Date globals.
 *
 * 4. Temporal bypass — `iframe.contentWindow.Temporal.Now.timeZoneId()`
 *    returns the real zone for the same reason.
 *
 * We fix all four by patching the iframe window synchronously on every
 * access path:
 * - contentWindow getter override (catches direct property access)
 * - DOM insertion wrappers (catches appendChild/innerHTML patterns)
 * - window[n] / frames[n] numeric indexing (caught via the same DOM
 *   insertion hooks — the iframe is in the DOM before the index is
 *   valid)
 *
 * Known limitation: this module currently patches the iframe's
 * `Intl.DateTimeFormat` constructor/`resolvedOptions`, its `Date`
 * constructor, and `Temporal.Now.*`. It does NOT install iframe-realm
 * copies of the full `Date.prototype` method overrides (toString,
 * getHours, etc.). The iframe's Date constructor reuses the iframe's
 * own `Date.prototype`, so methods called on a Date produced by our
 * iframe-realm constructor still hit the iframe's unpatched prototype
 * methods. A future PR can port the per-method overrides into this
 * realm-patcher if the need arises.
 */

import type { AnyFunction, SpoofedLocation } from "./types";
import {
  overrideRegistry,
  spoofingEnabled,
  spoofedLocation,
  settingsReceived,
  timezoneData,
  explicitTimezoneInstances,
} from "./state";
import {
  installOverride,
  stripConstruct,
  registerOverride,
  disguiseAsNative,
  nativeTypeErrorMessage,
} from "./function-masking";
import { isAmbiguousDateString, computeEpochAdjustment } from "./timezone-helpers";
import { getPaddedCoords } from "./geolocation";
import { installLastModifiedOverride } from "./document-overrides";
import { waitForSettings } from "./settings-listener";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

// Track which iframe windows have already been patched to avoid re-patching
const patchedIframeWindows = new WeakSet<Window>();

/**
 * Build a spoofed GeolocationPosition from the current shared state.
 * Mirrors the logic in geolocation.ts but is inlined here to avoid a
 * circular import (geolocation.ts → state.ts ← iframe-patching.ts).
 *
 * The `targetWindow` parameter is the window whose `GeolocationPosition`
 * / `GeolocationCoordinates` prototypes we should use. For the iframe
 * patcher this is the iframe's own window, so that page-side checks
 * like `pos instanceof iframeWindow.GeolocationPosition` (or the
 * equivalent in-iframe code) pass. Falls back to a plain object literal
 * when the prototypes are unavailable.
 *
 * See geolocation.ts for the full explanation of why we use
 * `defineOwnFields` (own data properties) rather than `Object.assign`
 * (which would invoke the WebIDL brand-checked setters on the prototype
 * and throw).
 */
function buildSpoofedPosition(
  targetWindow: Window,
  location: SpoofedLocation
): GeolocationPosition {
  // Share the top-level padding cache so a page reading through an
  // iframe sees identical coords to a page reading through
  // `navigator.geolocation` directly. See `getPaddedCoords` in
  // geolocation.ts for the rationale.
  const padded = getPaddedCoords(location);
  const coordsFields = {
    latitude: padded.latitude,
    longitude: padded.longitude,
    accuracy: location.accuracy ?? 10,
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  const targetCoordsCtor = (targetWindow as any).GeolocationCoordinates as
    | { prototype: object }
    | undefined;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
  const targetPosCtor = (targetWindow as any).GeolocationPosition as
    | { prototype: object }
    | undefined;

  let coords: GeolocationCoordinates;
  try {
    if (targetCoordsCtor?.prototype) {
      coords = defineOwnFields(
        Object.create(targetCoordsCtor.prototype) as object,
        coordsFields
      ) as unknown as GeolocationCoordinates;
    } else {
      coords = coordsFields as unknown as GeolocationCoordinates;
    }
  } catch {
    coords = coordsFields as unknown as GeolocationCoordinates;
  }

  const positionFields = {
    coords,
    timestamp: Date.now(),
  };

  try {
    if (targetPosCtor?.prototype) {
      return defineOwnFields(
        Object.create(targetPosCtor.prototype) as object,
        positionFields
      ) as unknown as GeolocationPosition;
    }
  } catch {
    // fall through to plain object
  }
  return positionFields as unknown as GeolocationPosition;
}

/**
 * Install each key/value of `fields` as an own enumerable, non-writable,
 * non-configurable data property on `target`. Bypasses any inherited
 * accessor setters (e.g. WebIDL brand-checked setters on
 * GeolocationCoordinates.prototype).
 */
function defineOwnFields<T extends Record<string, unknown>>(target: object, fields: T): object {
  for (const key of Object.keys(fields)) {
    Object.defineProperty(target, key, {
      value: fields[key],
      writable: false,
      enumerable: true,
      configurable: false,
    });
  }
  return target;
}

/**
 * Patch an iframe window's geolocation API and Function.prototype.toString
 * to use the shared spoofing state and override registry.
 *
 * Safe to call multiple times — subsequent calls for the same window are no-ops.
 */
export function patchIframeWindow(iframeWindow: Window): void {
  if (patchedIframeWindows.has(iframeWindow)) {
    logger.debug("[patchIframeWindow] already patched, skipping");
    return;
  }
  patchedIframeWindows.add(iframeWindow);
  logger.debug("[patchIframeWindow] entering", {
    hasDocument: (() => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        return !!(iframeWindow as any).document;
      } catch (err) {
        return `threw: ${err instanceof Error ? err.message : String(err)}`;
      }
    })(),
  });

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
    logger.debug("[patchIframeWindow] section 1 (toString) complete");
  } catch (err) {
    logger.debug(
      "[patchIframeWindow] section 1 (toString) threw:",
      err instanceof Error ? err.message : String(err)
    );
    // Cross-origin iframes throw SecurityError — silently ignore
  }

  // ── 2. Geolocation override ──────────────────────────────────────────
  // Install overrides on the iframe's own `Geolocation.prototype`, not
  // on the per-iframe `navigator.geolocation` instance. That matches
  // native layout (where `getCurrentPosition` is inherited from the
  // prototype, not an own property of the instance), so descriptor
  // checks like `Object.getOwnPropertyDescriptor(iframe.contentWindow.
  // navigator.geolocation, "getCurrentPosition")` correctly return
  // `undefined`.
  //
  // Each iframe has its own realm with its own `Geolocation.prototype`
  // object; we patch each one exactly once (guarded by
  // `patchedIframeWindows`) and use the iframe's own `navigator.
  // geolocation` instance only to capture pristine originals for
  // pass-through when spoofing is disabled.
  //
  // Wrapped in a labeled block so the early-bailout `break` statements
  // below skip only this section, not the rest of patchIframeWindow —
  // a bare `return` here would also skip sections 3..8, leaking every
  // downstream surface whenever the iframe lacks a Geolocation realm.
  geolocationSection: try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeNav = (iframeWindow as any).navigator as Navigator;
    if (!iframeNav?.geolocation) break geolocationSection;

    const iframeGeo = iframeNav.geolocation;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeGeolocationCtor = (iframeWindow as any).Geolocation as
      | { prototype: object }
      | undefined;
    if (!iframeGeolocationCtor?.prototype) break geolocationSection;

    // Capture the iframe's own originals before we install the override,
    // so pass-through mode (spoofing disabled) hits the real API.
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
          const pos = buildSpoofedPosition(iframeWindow, spoofedLocation);
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
        const pos = buildSpoofedPosition(iframeWindow, spoofedLocation);
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

    // Install on the iframe's own `Geolocation.prototype`. `installOverride`
    // reads the target's descriptor and preserves its flags, so the
    // spec-matching `{writable:true, configurable:true, enumerable:true}`
    // shape is kept without hardcoding here.
    installOverride(
      iframeGeolocationCtor.prototype,
      "getCurrentPosition",
      iframeGetCurrentPosition,
      1
    );
    installOverride(iframeGeolocationCtor.prototype, "watchPosition", iframeWatchPosition, 1);
    installOverride(iframeGeolocationCtor.prototype, "clearWatch", iframeClearWatch, 1);

    logger.debug("[patchIframeWindow] section 2 (geolocation) complete");
  } catch (err) {
    logger.debug(
      "[patchIframeWindow] section 2 (geolocation) threw:",
      err instanceof Error ? err.message : String(err)
    );
    // Cross-origin or sandboxed iframes may throw — silently ignore
  }

  // ── 3. Permissions override ──────────────────────────────────────────
  // Also patch the iframe's `Permissions.prototype.query` so that
  // permission checks from within the iframe (or from the parent via
  // `iframe.contentWindow.navigator.permissions.query(...)`) return
  // "granted" for geolocation.
  //
  // Wrapped in a labeled block for the same reason as section 2 — a
  // bare `return` on missing Permissions realm would skip sections
  // 4..8 and leak Intl/Date/Temporal/DOM-insertion/lastModified.
  permissionsSection: try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframePerms = (iframeWindow as any).navigator?.permissions as Permissions | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframePermsCtor = (iframeWindow as any).Permissions as { prototype: object } | undefined;
    if (!iframePerms?.query || !iframePermsCtor?.prototype) break permissionsSection;

    const iframeOrigQuery = iframePerms.query.bind(iframePerms);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframePermissionStatusCtor = (iframeWindow as any).PermissionStatus as
      | { prototype: object }
      | undefined;

    const iframePermissionsQuery = (
      descriptor: PermissionDescriptor
    ): Promise<PermissionStatus> => {
      if (descriptor?.name === "geolocation" && spoofingEnabled) {
        // Return a PermissionStatus whose prototype matches the iframe's
        // own `PermissionStatus.prototype`, so brand checks via
        // `Object.prototype.toString.call(status)` (yielding
        // `"[object PermissionStatus]"`) and `status instanceof
        // iframeWindow.PermissionStatus` both pass.
        const target: PermissionStatus = iframePermissionStatusCtor?.prototype
          ? (Object.create(iframePermissionStatusCtor.prototype) as PermissionStatus)
          : (new EventTarget() as unknown as PermissionStatus);
        Object.defineProperty(target, "state", {
          value: "granted",
          writable: false,
          enumerable: true,
          configurable: false,
        });
        Object.defineProperty(target, "name", {
          value: "geolocation",
          writable: false,
          enumerable: true,
          configurable: false,
        });
        Object.defineProperty(target, "onchange", {
          value: null,
          writable: true,
          enumerable: true,
          configurable: true,
        });
        return Promise.resolve(target);
      }
      return iframeOrigQuery(descriptor);
    };

    installOverride(iframePermsCtor.prototype, "query", iframePermissionsQuery, 1);
    logger.debug("[patchIframeWindow] section 3 (permissions) complete");
  } catch (err) {
    logger.debug(
      "[patchIframeWindow] section 3 (permissions) threw:",
      err instanceof Error ? err.message : String(err)
    );
    // Silently ignore
  }

  // ── 4. Intl.DateTimeFormat override ──────────────────────────────────
  // The iframe has its own Intl realm. Without patching, a page that
  // reads `iframe.contentWindow.Intl.DateTimeFormat().resolvedOptions()
  // .timeZone` gets the real system zone, trivially bypassing timezone
  // spoofing. Same rationale as the top-level override in
  // timezone-overrides.ts — we inject the spoofed identifier when the
  // caller doesn't supply an explicit timeZone, and leave explicit
  // zones untouched.
  //
  // Labeled block so a missing Intl realm skips only this section,
  // not the downstream Date / Temporal / cascade / lastModified
  // installs.
  intlSection: try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeIntl = (iframeWindow as any).Intl as typeof Intl | undefined;
    if (!iframeIntl?.DateTimeFormat) break intlSection;

    const IframeOriginalDTF = iframeIntl.DateTimeFormat;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the resolvedOptions override
    const iframeOrigResolvedOptions = IframeOriginalDTF.prototype.resolvedOptions;

    const IframeDTFOverride = function (
      this: Intl.DateTimeFormat | void,
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ): Intl.DateTimeFormat {
      try {
        const hasExplicitTimezone = options?.timeZone != null;
        const matchesSpoofedTz =
          hasExplicitTimezone &&
          spoofingEnabled &&
          timezoneData &&
          options.timeZone!.toLowerCase() === timezoneData.identifier.toLowerCase();

        if (spoofingEnabled && timezoneData && (!hasExplicitTimezone || matchesSpoofedTz)) {
          const opts: Intl.DateTimeFormatOptions = {
            ...options,
            timeZone: timezoneData.identifier,
          };
          return new IframeOriginalDTF(locales, opts);
        }

        const instance = new IframeOriginalDTF(locales, options);
        if (hasExplicitTimezone) {
          // Track on the shared WeakSet so resolvedOptions treats it
          // consistently with top-level instances.
          explicitTimezoneInstances.add(instance);
        }
        return instance;
      } catch {
        return new IframeOriginalDTF(locales, options);
      }
    } as unknown as typeof Intl.DateTimeFormat;

    registerOverride(IframeDTFOverride, "DateTimeFormat");
    disguiseAsNative(IframeDTFOverride, "DateTimeFormat", 0);
    iframeIntl.DateTimeFormat = IframeDTFOverride;

    Object.defineProperty(iframeIntl.DateTimeFormat, "prototype", {
      value: IframeOriginalDTF.prototype,
      writable: false,
      configurable: false,
    });

    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: reassigning the static method by reference matches the top-level override
    iframeIntl.DateTimeFormat.supportedLocalesOf = IframeOriginalDTF.supportedLocalesOf;

    // resolvedOptions pass-through — the constructor already injected
    // the spoofed zone for non-explicit instances, so native resolved
    // options returns the engine-normalized identifier.
    installOverride(
      iframeIntl.DateTimeFormat.prototype,
      "resolvedOptions",
      function (this: Intl.DateTimeFormat): Intl.ResolvedDateTimeFormatOptions {
        try {
          return iframeOrigResolvedOptions.call(this);
        } catch {
          return iframeOrigResolvedOptions.call(this);
        }
      }
    );

    logger.debug("[patchIframeWindow] section 4 (Intl) complete");
  } catch (err) {
    logger.debug(
      "[patchIframeWindow] section 4 (Intl) threw:",
      err instanceof Error ? err.message : String(err)
    );
    // Cross-origin or missing Intl — silently ignore
  }

  // ── 5. Date constructor override ─────────────────────────────────────
  // Each iframe realm has its own Date global. Without patching,
  // `new iframe.contentWindow.Date("2024-01-01T12:00:00")` (ambiguous
  // local-time string) parses in the REAL system zone rather than the
  // spoofed zone, leaking both. Same adjustment logic as the top-level
  // override in date-constructor.ts. Intentionally reuses the top-level
  // `OriginalDate` (captured at module load before any overrides) as
  // the numeric epoch source — iframe and parent share the same UTC
  // clock, so this produces identical epoch values.
  //
  // Labeled block so a missing Date realm skips only this section,
  // not the downstream Temporal / cascade / lastModified installs.
  dateSection: try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const IframeOriginalDate = (iframeWindow as any).Date as DateConstructor | undefined;
    if (!IframeOriginalDate) break dateSection;

    const IframeOriginalDateParse = IframeOriginalDate.parse.bind(IframeOriginalDate);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    function IframeDateOverride(this: any, ...args: any[]): any {
      // Called as function (without new) — return current time string.
      if (!new.target) {
        return IframeOriginalDate!();
      }

      if (!spoofingEnabled || !timezoneData) {
        if (args.length === 0) return new IframeOriginalDate!();
        if (args.length === 1) return new IframeOriginalDate!(args[0] as number | string);
        return new IframeOriginalDate!(
          args[0] as number,
          args[1] as number,
          (args[2] ?? 1) as number,
          (args[3] ?? 0) as number,
          (args[4] ?? 0) as number,
          (args[5] ?? 0) as number,
          (args[6] ?? 0) as number
        );
      }

      if (args.length === 0) {
        return new IframeOriginalDate!();
      }

      if (args.length === 1) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        const arg = args[0];

        if (typeof arg === "number") {
          return new IframeOriginalDate!(arg);
        }

        if (typeof arg === "string") {
          try {
            const parsed = new IframeOriginalDate!(arg);
            if (isNaN(parsed.getTime())) {
              return parsed;
            }
            if (isAmbiguousDateString(arg)) {
              const adjustment = computeEpochAdjustment(
                parsed,
                timezoneData.identifier,
                timezoneData.offset
              );
              return new IframeOriginalDate!(parsed.getTime() + adjustment);
            }
            return parsed;
          } catch {
            return new IframeOriginalDate!(arg);
          }
        }

        return new IframeOriginalDate!(arg as number | string);
      }

      // Multi-argument (year, month, ...): ambiguous local time, adjust.
      try {
        const parsed = new IframeOriginalDate!(
          args[0] as number,
          args[1] as number,
          (args[2] ?? 1) as number,
          (args[3] ?? 0) as number,
          (args[4] ?? 0) as number,
          (args[5] ?? 0) as number,
          (args[6] ?? 0) as number
        );
        const adjustment = computeEpochAdjustment(
          parsed,
          timezoneData.identifier,
          timezoneData.offset
        );
        return new IframeOriginalDate!(parsed.getTime() + adjustment);
      } catch {
        return new IframeOriginalDate!(
          args[0] as number,
          args[1] as number,
          (args[2] ?? 1) as number,
          (args[3] ?? 0) as number,
          (args[4] ?? 0) as number,
          (args[5] ?? 0) as number,
          (args[6] ?? 0) as number
        );
      }
    }

    const iframeDateParseOverride = (str: string): number => {
      if (!spoofingEnabled || !timezoneData) {
        return IframeOriginalDateParse(str);
      }
      try {
        const epoch = IframeOriginalDateParse(str);
        if (isNaN(epoch)) return NaN;
        if (isAmbiguousDateString(str)) {
          const parsed = new IframeOriginalDate(epoch);
          const adjustment = computeEpochAdjustment(
            parsed,
            timezoneData.identifier,
            timezoneData.offset
          );
          return epoch + adjustment;
        }
        return epoch;
      } catch {
        return IframeOriginalDateParse(str);
      }
    };

    // Wire up the replacement constructor: preserve prototype, copy
    // statics, install Date.parse override, and swap into the iframe's
    // globalThis. Mirrors the top-level installDateConstructor flow.
    IframeDateOverride.prototype = IframeOriginalDate.prototype;

    Object.defineProperty(IframeDateOverride, "name", {
      value: "Date",
      configurable: true,
      enumerable: false,
      writable: false,
    });
    Object.defineProperty(IframeDateOverride, "length", {
      value: 7,
      configurable: true,
      enumerable: false,
      writable: false,
    });

    const skipProps = new Set(["prototype", "name", "length", "parse"]);
    for (const prop of Object.getOwnPropertyNames(IframeOriginalDate)) {
      if (skipProps.has(prop)) continue;
      const desc = Object.getOwnPropertyDescriptor(IframeOriginalDate, prop);
      if (desc) {
        Object.defineProperty(IframeDateOverride, prop, desc);
      }
    }

    registerOverride(iframeDateParseOverride, "parse");
    disguiseAsNative(iframeDateParseOverride, "parse", 1);
    Object.defineProperty(IframeDateOverride, "parse", {
      value: iframeDateParseOverride,
      configurable: true,
      enumerable: false,
      writable: true,
    });

    // Match Function.prototype chain so `Object.getPrototypeOf(Date)`
    // returns the iframe's Function.prototype (matching native).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeFunctionProto = (iframeWindow as any).Function.prototype as object;
    Object.setPrototypeOf(IframeDateOverride, iframeFunctionProto);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    (iframeWindow as any).Date = IframeDateOverride;

    Object.defineProperty(IframeOriginalDate.prototype, "constructor", {
      value: IframeDateOverride,
      configurable: true,
      enumerable: false,
      writable: true,
    });

    registerOverride(IframeDateOverride, "Date");
    registerOverride((IframeDateOverride as unknown as DateConstructor).now, "now");
    registerOverride((IframeDateOverride as unknown as DateConstructor).UTC, "UTC");

    logger.debug("[patchIframeWindow] section 5 (Date) complete");
  } catch (err) {
    logger.debug(
      "[patchIframeWindow] section 5 (Date) threw:",
      err instanceof Error ? err.message : String(err)
    );
    // Cross-origin or missing Date — silently ignore
  }

  // ── 6. Temporal.Now override ─────────────────────────────────────────
  // Temporal is feature-detected; skip when unavailable in the iframe's
  // realm. Same override pattern as the top-level temporal.ts:
  // `timeZoneId()` returns the spoofed identifier, and every
  // `plain*ISO` / `zonedDateTimeISO` method substitutes the spoofed zone
  // only when no explicit timezone argument was provided.
  //
  // Labeled block so a missing Temporal realm skips only this section,
  // not the downstream cascade / lastModified installs. This was the
  // root cause of a Safari-only `iframe.contentDocument.lastModified`
  // leak: Safari doesn't ship Temporal, so a bare `return` here
  // aborted patchIframeWindow before section 8 could run and patched
  // Document.prototype never got the spoofed getter.
  temporalSection: try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeTemporal = (iframeWindow as any).Temporal as
      | {
          Now: {
            timeZoneId: () => string;
            plainDateTimeISO: (tz?: string) => unknown;
            plainDateISO: (tz?: string) => unknown;
            plainTimeISO: (tz?: string) => unknown;
            zonedDateTimeISO: (tz?: string) => unknown;
          };
        }
      | undefined;
    if (!iframeTemporal?.Now) break temporalSection;

    const iframeNow = iframeTemporal.Now;
    const iframeOrigTimeZoneId = iframeNow.timeZoneId.bind(iframeNow);
    const iframeOrigPlainDateTimeISO = iframeNow.plainDateTimeISO.bind(iframeNow);
    const iframeOrigPlainDateISO = iframeNow.plainDateISO.bind(iframeNow);
    const iframeOrigPlainTimeISO = iframeNow.plainTimeISO.bind(iframeNow);
    const iframeOrigZonedDateTimeISO = iframeNow.zonedDateTimeISO.bind(iframeNow);

    const iframeNowObj = iframeNow as unknown as object;

    installOverride(iframeNowObj, "timeZoneId", function (): string {
      if (spoofingEnabled && timezoneData) {
        return timezoneData.identifier;
      }
      return iframeOrigTimeZoneId();
    });

    installOverride(iframeNowObj, "plainDateTimeISO", function (tzLike?: string): unknown {
      if (spoofingEnabled && timezoneData && tzLike === undefined) {
        return iframeOrigPlainDateTimeISO(timezoneData.identifier);
      }
      return iframeOrigPlainDateTimeISO(tzLike);
    });

    installOverride(iframeNowObj, "plainDateISO", function (tzLike?: string): unknown {
      if (spoofingEnabled && timezoneData && tzLike === undefined) {
        return iframeOrigPlainDateISO(timezoneData.identifier);
      }
      return iframeOrigPlainDateISO(tzLike);
    });

    installOverride(iframeNowObj, "plainTimeISO", function (tzLike?: string): unknown {
      if (spoofingEnabled && timezoneData && tzLike === undefined) {
        return iframeOrigPlainTimeISO(timezoneData.identifier);
      }
      return iframeOrigPlainTimeISO(tzLike);
    });

    installOverride(iframeNowObj, "zonedDateTimeISO", function (tzLike?: string): unknown {
      if (spoofingEnabled && timezoneData && tzLike === undefined) {
        return iframeOrigZonedDateTimeISO(timezoneData.identifier);
      }
      return iframeOrigZonedDateTimeISO(tzLike);
    });

    logger.debug("[patchIframeWindow] section 6 (Temporal) complete");
  } catch (err) {
    logger.debug(
      "[patchIframeWindow] section 6 (Temporal) threw:",
      err instanceof Error ? err.message : String(err)
    );
    // Temporal unavailable or cross-origin — silently ignore
  }

  // ── 7. Nested-iframe cascade ─────────────────────────────────────────
  // A same-origin iframe's document has its own HTMLIFrameElement
  // prototype, its own Node/Element prototypes, and its own document
  // tree that the top-level MutationObserver cannot see. Without
  // patching these, a nested iframe created from inside the outer
  // iframe — via `outerDoc.write("<iframe>")`, `innerHTML`, or any DOM
  // method called on the outer iframe's own Node.prototype — escapes
  // every patching vector and leaks real geolocation when
  // `nested.contentWindow.navigator.geolocation` is read.
  //
  // We mirror the top-level `installIframePatching` and
  // `installDomInsertionWrapping` onto the iframe's own realm so the
  // patching cascades recursively: a nested iframe gets the same
  // treatment, and a grand-nested iframe gets it too.
  //
  // All shape/descriptor checks must use tag-name / duck-typing rather
  // than `instanceof` — elements created in the iframe's realm are NOT
  // instances of the top-level `HTMLIFrameElement` constructor, so
  // `node instanceof HTMLIFrameElement` (and similar) is always false
  // across realm boundaries.
  try {
    /** Cross-realm-safe iframe detection: check tag name rather than instanceof. */
    const isIframe = (node: unknown): node is HTMLIFrameElement => {
      return (
        node !== null &&
        typeof node === "object" &&
        (node as { nodeType?: number }).nodeType === 1 &&
        (node as { tagName?: string }).tagName === "IFRAME"
      );
    };

    /**
     * Scan a node and its descendants for iframes and patch their
     * contentWindows. Equivalent to top-level `scanAndPatchIframes`
     * but realm-agnostic — safe to call with nodes from any realm.
     */
    const scanAndPatchIframesHere = (node: Node | null | undefined): void => {
      if (!node) return;
      try {
        if (isIframe(node) && node.contentWindow) {
          patchIframeWindow(node.contentWindow);
        }
        // Descendants: use querySelectorAll if available (Element /
        // DocumentFragment / Document all have it). Returns an empty
        // NodeList when no iframes match, so this is safe on nodes that
        // aren't themselves iframes.
        const queryable = node as unknown as {
          querySelectorAll?: (sel: string) => NodeList;
        };
        if (typeof queryable.querySelectorAll === "function") {
          const nested = queryable.querySelectorAll("iframe");
          for (let i = 0; i < nested.length; i += 1) {
            const ifr = nested[i] as unknown as HTMLIFrameElement;
            if (ifr.contentWindow) {
              try {
                patchIframeWindow(ifr.contentWindow);
              } catch {
                // cross-origin
              }
            }
          }
        }
      } catch {
        // cross-origin or detached node — silently skip
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeHTMLIFrameElementCtor = (iframeWindow as any).HTMLIFrameElement as
      | { prototype: object }
      | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeNodeCtor = (iframeWindow as any).Node as { prototype: object } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeElementCtor = (iframeWindow as any).Element as { prototype: object } | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeMutationObserverCtor = (iframeWindow as any).MutationObserver as
      | (new (cb: MutationCallback) => MutationObserver)
      | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeDocumentFragmentCtor = (iframeWindow as any).DocumentFragment as
      | (new () => DocumentFragment)
      | undefined;

    // ── 7a. HTMLIFrameElement.prototype accessors ──────────────────────
    // So `nested.contentWindow` (read from inside the outer iframe)
    // triggers patchIframeWindow on the nested window before the caller
    // sees it.
    if (iframeHTMLIFrameElementCtor?.prototype) {
      const proto = iframeHTMLIFrameElementCtor.prototype;

      const cwDesc = Object.getOwnPropertyDescriptor(proto, "contentWindow");
      if (cwDesc?.get) {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the wrapper
        const origCWGet = cwDesc.get;
        const cwGetter = stripConstruct(function (this: HTMLIFrameElement): WindowProxy | null {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
          const win = origCWGet.call(this);
          if (win) {
            try {
              // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
              patchIframeWindow(win);
            } catch {
              // cross-origin
            }
          }
          return win;
        });
        registerOverride(cwGetter, "contentWindow");
        disguiseAsNative(cwGetter, "contentWindow", 0);
        Object.defineProperty(proto, "contentWindow", {
          get: cwGetter,
          configurable: cwDesc.configurable,
          enumerable: cwDesc.enumerable,
        });
      }

      const cdDesc = Object.getOwnPropertyDescriptor(proto, "contentDocument");
      if (cdDesc?.get) {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the wrapper
        const origCDGet = cdDesc.get;
        const cdGetter = stripConstruct(function (this: HTMLIFrameElement): Document | null {
          // Access contentWindow via our patched getter to cascade
          // patching, then return the original contentDocument.
          const win = this.contentWindow;
          void win;

          return origCDGet.call(this) as Document | null;
        });
        registerOverride(cdGetter, "contentDocument");
        disguiseAsNative(cdGetter, "contentDocument", 0);
        Object.defineProperty(proto, "contentDocument", {
          get: cdGetter,
          configurable: cdDesc.configurable,
          enumerable: cdDesc.enumerable,
        });
      }
    }

    // ── 7b. Node.prototype / Element.prototype insertion wrappers ──────
    // Same wrappers `installDomInsertionWrapping` installs at the top
    // level, but on the iframe's own realm. Synchronously scans
    // inserted subtrees for iframes and patches them before the next
    // line of JS runs (arkenfox's `window[n]` race).
    if (iframeNodeCtor?.prototype) {
      const nodeProto = iframeNodeCtor.prototype as unknown as {
        appendChild: (n: Node) => Node;
        insertBefore: (n: Node, r: Node | null) => Node;
        replaceChild: (n: Node, o: Node) => Node;
      };

      const origAppendChild = nodeProto.appendChild;

      const origInsertBefore = nodeProto.insertBefore;

      const origReplaceChild = nodeProto.replaceChild;

      installOverride(nodeProto, "appendChild", function <T extends Node>(this: Node, node: T): T {
        const isFrag =
          iframeDocumentFragmentCtor !== undefined && node instanceof iframeDocumentFragmentCtor;
        const children: Array<Node> = isFrag
          ? Array.from((node as unknown as { childNodes: NodeList }).childNodes)
          : [];
        const result = origAppendChild.call(this, node) as T;
        if (isFrag) {
          for (const c of children) scanAndPatchIframesHere(c);
        } else {
          scanAndPatchIframesHere(node);
        }
        return result;
      });

      installOverride(nodeProto, "insertBefore", function <
        T extends Node,
      >(this: Node, node: T, ref: Node | null): T {
        const isFrag =
          iframeDocumentFragmentCtor !== undefined && node instanceof iframeDocumentFragmentCtor;
        const children: Array<Node> = isFrag
          ? Array.from((node as unknown as { childNodes: NodeList }).childNodes)
          : [];
        const result = origInsertBefore.call(this, node, ref) as T;
        if (isFrag) {
          for (const c of children) scanAndPatchIframesHere(c);
        } else {
          scanAndPatchIframesHere(node);
        }
        return result;
      });

      installOverride(nodeProto, "replaceChild", function <
        T extends Node,
      >(this: Node, node: Node, old: T): T {
        const isFrag =
          iframeDocumentFragmentCtor !== undefined && node instanceof iframeDocumentFragmentCtor;
        const children: Array<Node> = isFrag
          ? Array.from((node as unknown as { childNodes: NodeList }).childNodes)
          : [];
        const result = origReplaceChild.call(this, node, old) as T;
        if (isFrag) {
          for (const c of children) scanAndPatchIframesHere(c);
        } else {
          scanAndPatchIframesHere(node);
        }
        return result;
      });
    }

    if (iframeElementCtor?.prototype) {
      const elProto = iframeElementCtor.prototype as unknown as {
        append: (...nodes: Array<Node | string>) => void;
        prepend: (...nodes: Array<Node | string>) => void;
        replaceWith: (...nodes: Array<Node | string>) => void;
        insertAdjacentElement: (pos: InsertPosition, el: Element) => Element | null;
        insertAdjacentHTML: (pos: InsertPosition, html: string) => void;
      };

      const origAppend = elProto.append;

      const origPrepend = elProto.prepend;

      const origReplaceWith = elProto.replaceWith;

      const origInsertAdjacentElement = elProto.insertAdjacentElement;

      const origInsertAdjacentHTML = elProto.insertAdjacentHTML;

      installOverride(
        elProto,
        "append",
        function (this: Element, ...nodes: Array<Node | string>): void {
          origAppend.apply(this, nodes);
          for (const n of nodes) {
            if (typeof n !== "string") scanAndPatchIframesHere(n);
          }
        }
      );

      installOverride(
        elProto,
        "prepend",
        function (this: Element, ...nodes: Array<Node | string>): void {
          origPrepend.apply(this, nodes);
          for (const n of nodes) {
            if (typeof n !== "string") scanAndPatchIframesHere(n);
          }
        }
      );

      installOverride(
        elProto,
        "replaceWith",
        function (this: Element, ...nodes: Array<Node | string>): void {
          origReplaceWith.apply(this, nodes);
          for (const n of nodes) {
            if (typeof n !== "string") scanAndPatchIframesHere(n);
          }
        }
      );

      installOverride(
        elProto,
        "insertAdjacentElement",
        function (this: Element, position: InsertPosition, element: Element): Element | null {
          const result = origInsertAdjacentElement.call(this, position, element);
          scanAndPatchIframesHere(element);
          return result;
        }
      );

      installOverride(
        elProto,
        "insertAdjacentHTML",
        function (this: Element, position: InsertPosition, text: string): void {
          origInsertAdjacentHTML.call(this, position, text);
          scanAndPatchIframesHere(this.parentElement ?? this);
        }
      );

      // innerHTML setter — catches the `div.innerHTML = "<iframe>"`
      // arkenfox pattern from inside the iframe's realm.
      const innerHTMLDesc = Object.getOwnPropertyDescriptor(elProto, "innerHTML");
      if (innerHTMLDesc?.set) {
        // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the wrapper
        const origInnerHTMLSet = innerHTMLDesc.set;
        const innerHTMLSetter = stripConstruct(function (this: Element, value: string) {
          origInnerHTMLSet.call(this, value);
          scanAndPatchIframesHere(this);
        });
        registerOverride(innerHTMLSetter, "innerHTML");
        disguiseAsNative(innerHTMLSetter, "innerHTML", 1);
        Object.defineProperty(elProto, "innerHTML", {
          // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: passing original getter descriptor to Object.defineProperty
          get: innerHTMLDesc.get,
          set: innerHTMLSetter,
          configurable: innerHTMLDesc.configurable,
          enumerable: innerHTMLDesc.enumerable,
        });
      }
    }

    // ── 7c. MutationObserver fallback on the iframe's document ─────────
    // Same fallback as the top level — catches anything the wrappers
    // miss (most notably iframes the HTML parser materializes via
    // `document.write`, which goes through neither our DOM wrappers
    // nor the contentWindow getter until something touches the node).
    if (iframeMutationObserverCtor) {
      const iframeObserver = new iframeMutationObserverCtor((mutations) => {
        for (const mutation of mutations) {
          for (const addedNode of Array.from(mutation.addedNodes)) {
            scanAndPatchIframesHere(addedNode);
          }
        }
      });
      const iframeDoc = iframeWindow.document;
      if (iframeDoc.documentElement) {
        iframeObserver.observe(iframeDoc.documentElement, {
          childList: true,
          subtree: true,
        });
      } else {
        // documentElement isn't created yet (rare for about:blank; more
        // common when patching happens before DOMContentLoaded). Defer
        // until it exists.
        iframeDoc.addEventListener(
          "DOMContentLoaded",
          () => {
            if (iframeDoc.documentElement) {
              iframeObserver.observe(iframeDoc.documentElement, {
                childList: true,
                subtree: true,
              });
            }
          },
          { once: true }
        );
      }
    }

    // Scan whatever iframes the outer iframe already contains at patch
    // time — the MutationObserver only fires for future insertions, so
    // without this we'd miss iframes that were materialized before the
    // outer iframe's contentWindow was first accessed.
    try {
      if (iframeWindow.document.documentElement) {
        scanAndPatchIframesHere(iframeWindow.document.documentElement);
      }
    } catch {
      // cross-origin or detached — silently skip
    }

    logger.debug("[patchIframeWindow] section 7 (nested-iframe cascade) complete");
  } catch (err) {
    logger.debug(
      "[patchIframeWindow] section 7 (nested-iframe cascade) threw:",
      err instanceof Error ? err.message : String(err)
    );
    // Cross-origin or missing constructors — silently ignore
  }

  // ── 8. Document.prototype.lastModified ───────────────────────────────
  // Each iframe realm has its own `Document.prototype`, which means
  // `iframe.contentDocument.lastModified` reads through the iframe's
  // un-patched accessor and leaks the real system timezone. This is
  // one of TZP's primary ground-truth sources for detecting spoofing —
  // closing it removes the single highest-signal cross-surface leak.
  //
  // Safari quirk: WebKit treats about:blank iframes as cross-origin
  // relative to their parent, so `(iframeWindow as any).Document`
  // throws SecurityError. But `iframe.contentDocument.lastModified`
  // itself still succeeds when read from the parent — leaking the
  // real-zone string. To cover that case, we reach into the iframe's
  // `Document.prototype` through the Document *instance* rather than
  // through the iframe's window global, which sidesteps Safari's
  // realm-access gating.
  try {
    let iframeDocumentProto: object | null = null;
    let pathTaken: "window.Document" | "window.document" | "none" = "none";
    let windowDocErr: string | null = null;
    let windowDocumentErr: string | null = null;

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      const iframeDocumentCtor = (iframeWindow as any).Document as
        | { prototype: object }
        | undefined;
      if (iframeDocumentCtor?.prototype) {
        iframeDocumentProto = iframeDocumentCtor.prototype;
        pathTaken = "window.Document";
      }
    } catch (err) {
      windowDocErr = err instanceof Error ? err.message : String(err);
      // Safari gates Document access on the iframe window global —
      // fall through to the instance-based path below.
    }
    if (iframeDocumentProto === null) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
        const doc = (iframeWindow as any).document as Document | null | undefined;
        if (doc) {
          iframeDocumentProto = Object.getPrototypeOf(doc) as object | null;
          pathTaken = "window.document";
        }
      } catch (err) {
        windowDocumentErr = err instanceof Error ? err.message : String(err);
        // If even this access throws, the iframe is genuinely
        // inaccessible — nothing more we can do from the content script.
      }
    }

    logger.debug("[lastModified-patch] iframe realm access result", {
      pathTaken,
      windowDocErr,
      windowDocumentErr,
      hasProto: iframeDocumentProto !== null,
    });

    if (iframeDocumentProto) {
      installLastModifiedOverride(iframeDocumentProto);
      logger.debug("[lastModified-patch] installed on iframe Document.prototype", {
        pathTaken,
      });
    } else {
      logger.debug(
        "[lastModified-patch] could not reach iframe Document.prototype — iframe.contentDocument.lastModified will leak real zone"
      );
    }
  } catch (err) {
    logger.debug(
      "[lastModified-patch] outer try caught error (cross-origin or missing Document):",
      err instanceof Error ? err.message : String(err)
    );
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
