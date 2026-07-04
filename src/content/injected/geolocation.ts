/**
 * Geolocation API overrides.
 *
 * Overrides `getCurrentPosition`, `watchPosition`, and `clearWatch` to
 * return the spoofed location when protection is enabled.
 */

import type { SpoofedLocation, SpoofedGeolocationPosition } from "./types";
import {
  spoofingEnabled,
  spoofedLocation,
  settingsReceived,
  preserveGeolocationPrompt,
  originalGetCurrentPosition,
  originalWatchPosition,
  originalClearWatch,
  nativeGetCurrentPosition,
  nativeWatchPosition,
  nativeClearWatch,
} from "./state";
import { installOverride, registerOverride, disguiseAsNative } from "./function-masking";
import { waitForSettings } from "./settings-listener";
import { createLogger } from "@/shared/utils/debug-logger";
import { now } from "@/shared/utils/safe-time";
import { resolveAccuracy } from "@/shared/accuracy/resolver";
import { detectDeviceClass } from "@/shared/accuracy/device-class";
import { DEFAULT_ACCURACY_SETTING } from "@/shared/types/settings";

const logger = createLogger("INJ");

const watchCallbacks = new Map<number, PositionCallback>();
let watchIdCounter = 1;

/**
 * Per-spoofed-instance state for GeolocationCoordinates.
 *
 * The WebIDL spec defines `latitude`, `longitude`, `accuracy`,
 * `altitude`, `altitudeAccuracy`, `heading`, and `speed` as getters on
 * `GeolocationCoordinates.prototype` — they are NOT own data properties
 * on the instance. `Object.keys(coords)` returns `[]` on native, and
 * `getOwnPropertyDescriptor(coords, "latitude")` returns `undefined`.
 * An override that installs own data properties on the instance leaks
 * this layout difference.
 *
 * To match native, we store the actual coordinate values in a WeakMap
 * keyed by the spoofed instance, and install our own getters on
 * `GeolocationCoordinates.prototype`. The getters check the WeakMap
 * first; if the instance is one of ours, return the stored value;
 * otherwise fall back to the native getter so real browser-allocated
 * coords objects (which the page might obtain via some other path)
 * continue to work.
 */
interface CoordsSlots {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude: number | null;
  altitudeAccuracy: number | null;
  heading: number | null;
  speed: number | null;
}
const coordsSlots = new WeakMap<object, CoordsSlots>();

/**
 * Per-spoofed-instance state for GeolocationPosition.
 * Same pattern as `coordsSlots`, but for the outer position object.
 */
interface PositionSlots {
  coords: GeolocationCoordinates;
  timestamp: number;
}
const positionSlots = new WeakMap<object, PositionSlots>();

/**
 * Stable per-session cache for padded coordinates.
 *
 * Real GPS/Wi-Fi readings produce 7-8 significant fractional digits (~1cm
 * precision internally, even when the reported `accuracy` is 10m). A user
 * who configures `37.7749` as their spoofed location emits exactly that
 * string with 4 decimals — a single line of page-side inspection
 * (`lat.toString().split('.')[1].length`) flags the low precision as
 * non-native. To close the detection vector without surfacing a "add
 * more decimals" UI requirement to the user, we pad the configured
 * coordinate with deterministic-per-session random digits the first
 * time we build a position for it, then reuse the padded pair for
 * every subsequent call in this content context.
 *
 * Stability matters: a page that calls `getCurrentPosition` twice must
 * see the same coordinates, or the variance itself becomes a fingerprint.
 * The cache is keyed by the raw (unpadded) lat/lon pair, so a fresh
 * settings update with different coordinates naturally triggers
 * re-padding — and each new browser session / page load starts with a
 * fresh random seed, avoiding cross-session fingerprinting.
 *
 * The added random offset is bounded at ±0.00000005 degrees (~5mm at the
 * equator), well below any accuracy value a user might configure, so the
 * reported position stays semantically "the location the user chose" to
 * every practical degree of resolution.
 */
interface PaddedCoords {
  rawLatitude: number;
  rawLongitude: number;
  paddedLatitude: number;
  paddedLongitude: number;
}
let paddedCoordCache: PaddedCoords | null = null;

/**
 * Count decimal places on a number's default string representation.
 * Scientific-notation values (very large / very small) return 0, which
 * correctly triggers the pad path for any configured coordinate.
 */
function decimalPlaces(n: number): number {
  const s = n.toString();
  const dot = s.indexOf(".");
  if (dot === -1) return 0;
  // Rule out scientific notation — `1e-7` would report as 4 decimals below
  // if we naively counted past the dot, but the value string contains `e`.
  if (s.indexOf("e") !== -1 || s.indexOf("E") !== -1) return 0;
  return s.length - dot - 1;
}

/**
 * Pad a coordinate to at least 7 decimal places by appending random
 * digits. Values already at ≥7 decimals are returned unchanged.
 *
 * The padding is a small additive offset in the low-order digits rather
 * than an append-to-string concatenation, so the result stays a normal
 * IEEE-754 double and round-trips cleanly through JSON / toString.
 */
function padCoordinate(raw: number): number {
  if (decimalPlaces(raw) >= 7) return raw;
  // ±0.00000005 degrees ≈ ±5mm at the equator. Well below any GPS/Wi-Fi
  // accuracy value a user might set, so the reported position is
  // indistinguishable from the configured one to any practical consumer.
  const jitter = (Math.random() - 0.5) * 1e-7;
  // Round to 8 decimals so the stringified form has a stable,
  // realistic-looking length (7-8 digits is the native range).
  return Math.round((raw + jitter) * 1e8) / 1e8;
}

/**
 * Retrieve the padded coordinates for the given raw spoofed location,
 * generating them once per unique (latitude, longitude) pair.
 *
 * Exported so iframe-patching.ts can reuse the same cache, guaranteeing
 * that a page reading `iframe.contentWindow.navigator.geolocation` and
 * the top-level `navigator.geolocation` sees identical coordinates.
 */
export function getPaddedCoords(location: SpoofedLocation): {
  latitude: number;
  longitude: number;
} {
  if (
    paddedCoordCache &&
    paddedCoordCache.rawLatitude === location.latitude &&
    paddedCoordCache.rawLongitude === location.longitude
  ) {
    return {
      latitude: paddedCoordCache.paddedLatitude,
      longitude: paddedCoordCache.paddedLongitude,
    };
  }
  const paddedLatitude = padCoordinate(location.latitude);
  const paddedLongitude = padCoordinate(location.longitude);
  paddedCoordCache = {
    rawLatitude: location.latitude,
    rawLongitude: location.longitude,
    paddedLatitude,
    paddedLongitude,
  };
  return { latitude: paddedLatitude, longitude: paddedLongitude };
}

/**
 * Per-call result cache used to satisfy `maximumAge` semantics. Native
 * geolocation caches the last fix and returns it synchronously when
 * `maximumAge` covers the elapsed time since the last call. A spoofing
 * implementation that always runs its artificial delay — even when the
 * caller explicitly opted into a cached read — is detectable: the call
 * with `maximumAge: 60_000` should complete in sub-millisecond time
 * after a fresh prime, but an unconditioned override runs its full
 * 10-50ms delay every time.
 *
 * We store the last successfully-emitted position here (keyed by
 * nothing — there is exactly one implicit cache slot per content
 * context) and consult it on entry to `getCurrentPositionOverride`.
 */
interface PositionCacheEntry {
  position: SpoofedGeolocationPosition;
  capturedAt: number;
}
let cachedPosition: PositionCacheEntry | null = null;

/**
 * Check whether the cached position can satisfy the caller's
 * `maximumAge` request. Returns the cached position or `null`.
 */
function consumeCachedPosition(options?: PositionOptions): SpoofedGeolocationPosition | null {
  if (!cachedPosition) return null;
  const maxAge = options?.maximumAge ?? 0;
  if (maxAge <= 0) return null;
  const age = Date.now() - cachedPosition.capturedAt;
  if (age > maxAge) return null;
  return cachedPosition.position;
}

/** Record a newly-emitted position so subsequent `maximumAge` reads can hit it. */
function rememberPosition(position: SpoofedGeolocationPosition): void {
  cachedPosition = { position, capturedAt: Date.now() };
}

/**
 * Create a W3C-compliant GeolocationPosition from spoofed location.
 *
 * The object's `[[Prototype]]` chain points at `GeolocationPosition.
 * prototype`, and all coordinate/timestamp data is stored in the
 * `positionSlots` / `coordsSlots` WeakMaps — NOT as own data properties.
 * That matches native layout exactly:
 *
 *   - `instanceof GeolocationPosition` → true
 *   - `Object.keys(pos)` → `[]`
 *   - `Object.keys(pos.coords)` → `[]`
 *   - `Object.getOwnPropertyDescriptor(pos.coords, "latitude")` → `undefined`
 *   - `pos.coords.latitude` → our spoofed value (via the prototype getter
 *     we installed in `installCoordinateAccessors`, which consults the
 *     WeakMap)
 *
 * `toJSON` is installed on the prototype (see `installPositionToJSON` /
 * `installCoordsToJSON`), not as an own property on each instance, so
 * `Object.getOwnPropertyNames(pos)` returns `[]` just like native. The
 * prototype override checks the slots WeakMap and falls through to the
 * native `toJSON` for pristine browser-allocated instances.
 *
 * When the `GeolocationPosition` / `GeolocationCoordinates` globals
 * aren't exposed (very old engines or unusual contexts) we fall back
 * to a plain object literal so the call path still succeeds.
 */
function createGeolocationPosition(location: SpoofedLocation): SpoofedGeolocationPosition {
  const padded = getPaddedCoords(location);
  const coordsFields: CoordsSlots = {
    latitude: padded.latitude,
    longitude: padded.longitude,
    // Resolve a realistic, stable integer accuracy via the shared Resolver.
    // Determinism (seed + coarsely-quantized location) keeps the value stable
    // across back-to-back calls and page loads — matching how a stationary
    // native device reports a steady integer — without the old per-context
    // cache. Device class is detected page-side so the band is plausible for
    // the running device.
    accuracy: resolveAccuracy({
      setting: location.accuracySetting ?? DEFAULT_ACCURACY_SETTING,
      deviceClass: detectDeviceClass(navigator),
      seed: location.accuracySeed ?? 0,
      latitude: location.latitude,
      longitude: location.longitude,
    }),
    altitude: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  };

  // Build the coords instance — prototype-linked, WeakMap-backed, no own props.
  let coords: GeolocationCoordinates;
  try {
    if (typeof GeolocationCoordinates !== "undefined" && GeolocationCoordinates.prototype) {
      const coordsInstance = Object.create(GeolocationCoordinates.prototype) as object;
      coordsSlots.set(coordsInstance, coordsFields);
      coords = coordsInstance as unknown as GeolocationCoordinates;
    } else {
      coords = coordsFields as unknown as GeolocationCoordinates;
    }
  } catch {
    coords = coordsFields as unknown as GeolocationCoordinates;
  }

  const timestamp = Date.now();

  // Build the position instance — prototype-linked, WeakMap-backed, zero
  // own properties. `toJSON` lives on the prototype (see
  // `installPositionToJSON`), matching native layout so
  // `Object.getOwnPropertyNames(pos)` returns [].
  try {
    if (typeof GeolocationPosition !== "undefined" && GeolocationPosition.prototype) {
      const positionInstance = Object.create(GeolocationPosition.prototype) as object;
      positionSlots.set(positionInstance, { coords, timestamp });
      return positionInstance as unknown as SpoofedGeolocationPosition;
    }
  } catch {
    // fall through to plain object
  }
  return { coords: coordsFields as unknown as SpoofedGeolocationPosition["coords"], timestamp };
}

/** A native geolocation method invoked with loose args during delegation. */
type NativeGeoMethod = (...args: Array<unknown>) => unknown;

/**
 * This injected script's own URL, captured at module-load time from a
 * throwaway stack. In a `world: "MAIN"` content script this is the
 * `chrome-extension://<id>/…` (or `moz-extension://…`) resource URL. We use it
 * to strip our own frames out of thrown-error stacks (see
 * `stripExtensionFramesFromStack`) so a page can't read the extension id off an
 * error a fingerprinter deliberately provokes. `null` when it can't be
 * determined (then scrubbing is a no-op and we simply don't make things worse).
 */
const SELF_SCRIPT_URL: string | null = (() => {
  try {
    const stack = new Error().stack;
    if (typeof stack !== "string") return null;
    // Frames look like "  at fn (chrome-extension://id/injected.js:1:2)" or
    // "  at chrome-extension://id/injected.js:1:2". Match ONLY extension-scheme
    // URLs (a world:MAIN content script is always served from one) and trim the
    // trailing :line:col so it matches every frame from this file. Restricting
    // to extension schemes means we can never accidentally scrub a page's own
    // https frames — if no extension frame is found we return null and the
    // scrubber no-ops rather than risk over-trimming a real stack.
    const match = stack.match(
      /((?:chrome-extension|moz-extension|safari-web-extension):\/\/[^\s):]+)/
    );
    return match ? match[1] : null;
  } catch {
    return null;
  }
})();

/**
 * Remove any stack frames that reference this injected script from a thrown
 * error, in place. After scrubbing, an error the browser threw from inside one
 * of our overrides looks like the native throw a page would see with no
 * extension present: the native (URL-less) frame plus the page's own frames.
 * No-op when the self URL is unknown or the stack isn't a writable string.
 */
function stripExtensionFramesFromStack(err: unknown): void {
  if (!SELF_SCRIPT_URL || !(err instanceof Error) || typeof err.stack !== "string") return;
  const cleaned = err.stack
    .split("\n")
    .filter((line) => !line.includes(SELF_SCRIPT_URL))
    .join("\n");
  try {
    err.stack = cleaned;
  } catch {
    // `stack` is non-configurable on some engines — leave it as-is.
  }
}

/** No-op used when substituting a *valid* callback during native delegation. */
const GEO_NOOP = (): void => {};

/**
 * Whether a geolocation call's `this` and arguments are valid per WebIDL, so
 * the override can proceed. Mirrors the checks the native methods perform:
 *   - `this` must implement the Geolocation interface,
 *   - `successCallback` (arg 0) must be callable,
 *   - `errorCallback` (arg 1), when present, must be callable,
 *   - `options` (arg 2), when present, must be an object (dictionaries reject
 *     non-null primitives; functions are objects and are accepted).
 */
function geoArgsValid(
  self: unknown,
  successCallback: unknown,
  errorCallback: unknown,
  options: unknown
): boolean {
  if (!(self instanceof Geolocation)) return false;
  if (typeof successCallback !== "function") return false;
  if (errorCallback != null && typeof errorCallback !== "function") return false;
  if (options != null && Object(options) !== options) return false;
  return true;
}

/**
 * Reproduce the browser's own error for an invalid geolocation call.
 *
 * Called only once `geoArgsValid` has determined the call is invalid. Invoking
 * the unbound native method with the same receiver and arguments makes the
 * browser throw its genuine `TypeError` — correct type, exact per-engine
 * message, and a native stack — instead of a hand-rolled error whose message
 * and stack (bearing the extension's own URL) betray the override. We then
 * strip our injected-script frames from that stack so the extension id can't be
 * read off it.
 *
 * Defense in depth: any *valid* success/error callback is swapped for a no-op
 * before delegating, so in the (spec-impossible) event the native call fails to
 * throw, the page's real callbacks never receive a real position. The original
 * argument count is preserved so the native error message (which distinguishes
 * "1 argument required, but only 0 present" from a type error) matches exactly.
 */
function reproduceNativeGeoError(
  self: unknown,
  nativeMethod: (...args: Array<unknown>) => unknown,
  args: IArguments
): void {
  const argv = Array.prototype.slice.call(args) as Array<unknown>;
  if (typeof argv[0] === "function") argv[0] = GEO_NOOP;
  if (typeof argv[1] === "function") argv[1] = GEO_NOOP;
  try {
    Reflect.apply(nativeMethod, self, argv);
  } catch (err) {
    stripExtensionFramesFromStack(err);
    throw err;
  }
}

/**
 * Emit a freshly-built spoofed position to the success callback with a
 * realistic 10-50ms delay (mirrors a native fresh-fix latency). This is the
 * seamless, prompt-free path used when "preserve permission prompts" is off.
 */
function emitSpoofedPosition(successCallback: PositionCallback): void {
  const position = createGeolocationPosition(spoofedLocation!);
  rememberPosition(position);
  const delay = 10 + Math.random() * 40;
  logger.debug("getCurrentPosition: returning spoofed coords", {
    coords: { lat: position.coords.latitude, lon: position.coords.longitude },
    delay: `${delay.toFixed(1)}ms`,
  });
  setTimeout(() => {
    if (successCallback) {
      successCallback(position as GeolocationPosition);
    }
  }, delay);
}

/**
 * "Preserve permission prompts" path: invoke the real geolocation API so the
 * browser surfaces its native permission prompt. On grant, discard the real
 * coordinates and hand back spoofed ones (the page still never learns the real
 * location); on denial / unavailable / timeout, forward the native error
 * unchanged. The real position is requested only to drive the genuine
 * permission flow — the user keeps per-site control over which sites get any
 * location at all, and a denied site is indistinguishable from a normal
 * browser.
 */
function respondViaNativePrompt(
  successCallback: PositionCallback,
  errorCallback: PositionErrorCallback | null | undefined,
  options: PositionOptions | undefined
): void {
  logger.debug("getCurrentPosition: preserve-prompt mode, calling real API for native prompt");
  originalGetCurrentPosition(
    (realPosition) => {
      // We momentarily hold a genuine native position — learn the engine's true
      // toJSON key order from it before discarding, then hand back spoofed coords.
      sampleNativeToJsonOrder(realPosition);
      const position = createGeolocationPosition(spoofedLocation!);
      rememberPosition(position);
      logger.debug("getCurrentPosition: prompt granted, substituting spoofed coords");
      if (successCallback) {
        successCallback(position as GeolocationPosition);
      }
    },
    errorCallback,
    options
  );
}

/** Override for `navigator.geolocation.getCurrentPosition`. */
function getCurrentPositionOverride(
  this: unknown,
  successCallback: PositionCallback,
  errorCallback?: PositionErrorCallback | null,
  options?: PositionOptions
): void {
  if (!geoArgsValid(this, successCallback, errorCallback, options)) {
    // eslint-disable-next-line prefer-rest-params
    reproduceNativeGeoError(this, nativeGetCurrentPosition as NativeGeoMethod, arguments);
    return;
  }
  logger.debug(
    "getCurrentPosition called — settingsReceived:",
    settingsReceived,
    "spoofingEnabled:",
    spoofingEnabled,
    "hasLocation:",
    !!spoofedLocation
  );

  // Satisfy `maximumAge`: if the caller accepts a cached position and
  // one is still fresh, return it synchronously (via queueMicrotask so
  // the callback still fires asynchronously, as native does). This
  // mirrors the observable timing of a cache hit — sub-millisecond —
  // which a real implementation produces but a naive spoof does not.
  if (settingsReceived && spoofingEnabled && spoofedLocation) {
    const cached = consumeCachedPosition(options);
    if (cached) {
      logger.debug("getCurrentPosition: cache hit, returning immediately");
      queueMicrotask(() => {
        successCallback(cached as GeolocationPosition);
      });
      return;
    }
  }

  if (settingsReceived) {
    // Settings already loaded — respond immediately
    if (spoofingEnabled && spoofedLocation) {
      if (preserveGeolocationPrompt) {
        respondViaNativePrompt(successCallback, errorCallback, options);
      } else {
        emitSpoofedPosition(successCallback);
      }
    } else {
      logger.debug("getCurrentPosition: spoofing disabled, using original");
      originalGetCurrentPosition(successCallback, errorCallback, options);
    }
  } else {
    // Settings not yet received — wait for them before responding
    logger.debug("getCurrentPosition: deferring until settings arrive");
    const deferStart = now();
    void waitForSettings().then(({ timedOut }) => {
      const waited = now() - deferStart;
      if (timedOut) {
        // Settings never arrived within the timeout window. We don't know
        // whether spoofing should be on or off, so we cannot safely fall
        // through to the real API (that would leak the user's real location
        // if spoofing was meant to be active). Fire the error callback instead.
        logger.warn(
          `getCurrentPosition: settings timed out after ${waited.toFixed(1)}ms, returning TIMEOUT error`
        );
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
      logger.debug(`getCurrentPosition: waitForSettings resolved after ${waited.toFixed(1)}ms`);
      if (spoofingEnabled && spoofedLocation) {
        if (preserveGeolocationPrompt) {
          respondViaNativePrompt(successCallback, errorCallback, options);
        } else {
          emitSpoofedPosition(successCallback);
        }
      } else {
        logger.debug("getCurrentPosition (deferred): spoofing disabled, using original");
        originalGetCurrentPosition(successCallback, errorCallback, options);
      }
    });
  }
}

/**
 * Override for `navigator.geolocation.watchPosition`.
 *
 * Native watchPosition fires its callback repeatedly as the device
 * moves, and on a stationary device it still emits updates every few
 * seconds as GPS/Wi-Fi estimates refine. A spoofing implementation that
 * fires once and falls silent is trivially detectable — a fingerprinter
 * can count callbacks over a 5-second window. We emit an initial
 * callback then schedule periodic re-fires with the same spoofed
 * position until the caller clears the watch.
 */
function watchPositionOverride(
  this: unknown,
  successCallback: PositionCallback,
  errorCallback?: PositionErrorCallback | null,
  options?: PositionOptions
): number {
  if (!geoArgsValid(this, successCallback, errorCallback, options)) {
    // eslint-disable-next-line prefer-rest-params
    reproduceNativeGeoError(this, nativeWatchPosition as NativeGeoMethod, arguments);
    // `reproduceNativeGeoError` always throws (the native call rejects the
    // invalid input); this return only satisfies the number return type.
    return 0;
  }
  if (spoofingEnabled && spoofedLocation) {
    if (preserveGeolocationPrompt) {
      // Preserve-prompt mode: let the real API drive both the native permission
      // prompt and the native re-fire cadence, but substitute spoofed coords on
      // every update so the real location never reaches the page. Denials/errors
      // flow through untouched. The returned id is the real watch id, so
      // clearWatch routes it back to the native clearWatch (see below).
      logger.debug("watchPosition: preserve-prompt mode, delegating to real API");
      return originalWatchPosition(
        (realPosition) => {
          if (!spoofingEnabled || !spoofedLocation) return;
          sampleNativeToJsonOrder(realPosition);
          const position = createGeolocationPosition(spoofedLocation);
          successCallback(position as GeolocationPosition);
        },
        errorCallback,
        options
      );
    }

    const watchId = watchIdCounter++;
    watchCallbacks.set(watchId, successCallback);

    const initialDelay = 10 + Math.random() * 40;
    logger.debug("watchPosition: returning spoofed coords", {
      watchId,
      coords: {
        lat: spoofedLocation.latitude,
        lon: spoofedLocation.longitude,
      },
      delay: `${initialDelay.toFixed(1)}ms`,
    });

    const emit = (): void => {
      if (!watchCallbacks.has(watchId)) return;
      if (!spoofingEnabled || !spoofedLocation) return;
      const position = createGeolocationPosition(spoofedLocation);
      successCallback(position as GeolocationPosition);
    };

    // Initial callback — mirrors the timing of a first fresh fix.
    setTimeout(emit, initialDelay);

    // Periodic re-fires matching native behavior. We cap the interval
    // at 2s so worst-case RNG still produces at least two callbacks
    // inside a 3-second observation window (first callback up to 50ms
    // + one re-fire at up to 2000ms = 2050ms, well under 3000ms). A
    // wider upper bound made the cadence test flaky.
    const schedule = (): void => {
      if (!watchCallbacks.has(watchId)) return;
      const interval = 1_000 + Math.random() * 1_000;
      setTimeout(() => {
        emit();
        schedule();
      }, interval);
    };
    schedule();

    return watchId;
  } else {
    return originalWatchPosition(successCallback, errorCallback, options);
  }
}

/** Override for `navigator.geolocation.clearWatch`. */
function clearWatchOverride(this: unknown, watchId: number): void {
  // clearWatch takes only a `this` brand check natively (the numeric watchId
  // coerces without throwing), so validate the receiver and delegate a foreign
  // `this` to the native method for a faithful, non-leaking TypeError.
  if (!(this instanceof Geolocation)) {
    // eslint-disable-next-line prefer-rest-params
    reproduceNativeGeoError(this, nativeClearWatch as NativeGeoMethod, arguments);
    return;
  }
  // A synthetic (spoofed) watch lives in `watchCallbacks`; clear it locally.
  // Anything else is a real native watch — either spoofing is off, or we're in
  // preserve-prompt mode where watchPosition delegates to the real API — so
  // route it to the native clearWatch.
  if (watchCallbacks.has(watchId)) {
    watchCallbacks.delete(watchId);
  } else {
    originalClearWatch(watchId);
  }
}

/**
 * Install geolocation API overrides on `Geolocation.prototype`.
 *
 * Overrides `getCurrentPosition`, `watchPosition`, and `clearWatch` on
 * the interface prototype — this is where native methods live, so a
 * fingerprinting check like `Object.getOwnPropertyDescriptor(
 *   navigator.geolocation, "getCurrentPosition")` correctly returns
 * `undefined` (the method is inherited, not own), and the descriptor on
 * the prototype (`writable: true, configurable: true, enumerable: true`)
 * matches the WebIDL-specified native shape.
 *
 * We also install accessor overrides on `GeolocationCoordinates.prototype`
 * and `GeolocationPosition.prototype` so our spoofed coords/position
 * objects have zero own properties — matching the native layout where
 * `Object.keys(coords)` returns `[]`. See `coordsSlots` /
 * `positionSlots` WeakMaps above for details.
 *
 * We deliberately do NOT install a second copy on `navigator.geolocation`
 * itself. A page that wants to shadow on the instance is fighting
 * itself — they don't gain a pristine reference that way.
 *
 * `installOverride` reads the target's existing descriptor and preserves
 * its flags, so we automatically match the native shape without
 * hardcoding it here.
 */
export function installGeolocationOverrides(): void {
  installOverride(Geolocation.prototype, "getCurrentPosition", getCurrentPositionOverride, 1);
  installOverride(Geolocation.prototype, "watchPosition", watchPositionOverride, 1);
  installOverride(Geolocation.prototype, "clearWatch", clearWatchOverride, 1);
  installCoordinateAccessors();
  installPositionAccessors();
  installPositionToJSON();
  installCoordsToJSON();
}

/**
 * Install the seven WebIDL-spec'd attribute accessors on
 * `GeolocationCoordinates.prototype`. Each getter first checks the
 * `coordsSlots` WeakMap (for our spoofed instances); if the instance
 * isn't one of ours, it falls through to the original native getter
 * so pristine browser-allocated coords keep working.
 */
function installCoordinateAccessors(): void {
  if (typeof GeolocationCoordinates === "undefined" || !GeolocationCoordinates.prototype) return;
  const proto = GeolocationCoordinates.prototype;
  const keys: ReadonlyArray<keyof CoordsSlots> = [
    "latitude",
    "longitude",
    "accuracy",
    "altitude",
    "altitudeAccuracy",
    "heading",
    "speed",
  ];
  for (const key of keys) {
    const originalDesc = Object.getOwnPropertyDescriptor(proto, key);
    if (!originalDesc?.get) continue;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the spoofed getter
    const originalGet = originalDesc.get;
    // Use an explicit `this`-typed function so TS knows the getter
    // accesses `this`. The getter is installed on the prototype via
    // Object.defineProperty and invoked with the calling instance as
    // `this`, so this usage is intentional and correct.

    function spoofedGet(this: object): unknown {
      const slots = coordsSlots.get(this);
      if (slots) return slots[key];
      return originalGet.call(this);
    }

    registerOverride(spoofedGet, `get ${key}`);
    disguiseAsNative(spoofedGet, `get ${key}`, 0);
    Object.defineProperty(proto, key, {
      get: spoofedGet,
      configurable: originalDesc.configurable,
      enumerable: originalDesc.enumerable,
    });
  }
}

/**
 * Install the two WebIDL-spec'd attribute accessors on
 * `GeolocationPosition.prototype`: `coords` and `timestamp`. Same
 * pattern as `installCoordinateAccessors`.
 */
function installPositionAccessors(): void {
  if (typeof GeolocationPosition === "undefined" || !GeolocationPosition.prototype) return;
  const proto = GeolocationPosition.prototype;
  const keys: ReadonlyArray<keyof PositionSlots> = ["coords", "timestamp"];
  for (const key of keys) {
    const originalDesc = Object.getOwnPropertyDescriptor(proto, key);
    if (!originalDesc?.get) continue;
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the spoofed getter
    const originalGet = originalDesc.get;

    function spoofedGet(this: object): unknown {
      const slots = positionSlots.get(this);
      if (slots) return slots[key];
      return originalGet.call(this);
    }

    registerOverride(spoofedGet, `get ${key}`);
    disguiseAsNative(spoofedGet, `get ${key}`, 0);
    Object.defineProperty(proto, key, {
      get: spoofedGet,
      configurable: originalDesc.configurable,
      enumerable: originalDesc.enumerable,
    });
  }
}

/**
 * The native key order that the `[Default] toJSON()` serializer emits, per
 * engine. The serializer walks the interface's Web IDL attribute-declaration
 * order — which is NOT the prototype's own-property order (Blink installs the
 * getters in one order but serializes in another) and CANNOT be sampled from a
 * spoofed instance (native `toJSON` brand-checks and throws on our
 * `Object.create`-d objects). So we encode the two known native orders and
 * select by build target:
 *
 *   - Blink / Chromium: `accuracy` leads coords, `timestamp` leads position
 *     (confirmed empirically on Chrome 149 and documented on MDN).
 *   - Gecko (Firefox) and WebKit (Safari): the W3C-origin IDL order — coords
 *     lead with `latitude` (with `altitude` before `accuracy`), position leads
 *     with `coords` (verified against the Gecko and WebKit IDL sources, which
 *     are byte-identical in attribute order).
 *
 * Each build ships to exactly one engine family, so a compile-time constant is
 * correct and has zero runtime cost or detection surface. It is also the
 * fallback for the runtime-sampled order (see `sampleNativeToJsonOrder`).
 *
 * Sources (the `[Default] object toJSON()` serializer walks IDL attribute
 * order):
 *   - Spec + serializer definition: https://www.w3.org/TR/geolocation/#coordinates_interface
 *     and the commit that added it: https://github.com/w3c/geolocation/commit/09b48e6
 *   - MDN (documents the observed Blink output order):
 *     https://developer.mozilla.org/en-US/docs/Web/API/GeolocationCoordinates/toJSON
 *     https://developer.mozilla.org/en-US/docs/Web/API/GeolocationPosition/toJSON
 *   - Gecko IDL: https://github.com/mozilla/gecko-dev/blob/master/dom/webidl/GeolocationCoordinates.webidl
 *     https://github.com/mozilla/gecko-dev/blob/master/dom/webidl/GeolocationPosition.webidl
 *   - WebKit IDL: https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/geolocation/GeolocationCoordinates.idl
 *     https://github.com/WebKit/WebKit/blob/main/Source/WebCore/Modules/geolocation/GeolocationPosition.idl
 *   - Blink intent-to-ship discussion: https://groups.google.com/a/chromium.org/g/blink-dev/c/JQkvFd0oXUI
 */
const COORDS_JSON_ORDER: ReadonlyArray<keyof CoordsSlots> = __CHROMIUM__
  ? ["accuracy", "latitude", "longitude", "altitude", "altitudeAccuracy", "heading", "speed"]
  : ["latitude", "longitude", "altitude", "accuracy", "altitudeAccuracy", "heading", "speed"];

const POSITION_JSON_ORDER: ReadonlyArray<keyof PositionSlots> = __CHROMIUM__
  ? ["timestamp", "coords"]
  : ["coords", "timestamp"];

/**
 * Runtime-learned native key orders. Populated by `sampleNativeToJsonOrder`
 * the first time we hold a genuine browser-allocated position (preserve-prompt
 * mode calls the real API). When set, they take precedence over the hardcoded
 * build-flag defaults — so if an engine ever changes its serializer order, a
 * preserve-prompt user's spoofed output tracks it automatically. `null` until
 * sampled, which is the common case (default prompt-free mode never sees a real
 * position), and then the verified defaults apply.
 */
let sampledCoordsOrder: ReadonlyArray<keyof CoordsSlots> | null = null;
let sampledPositionOrder: ReadonlyArray<keyof PositionSlots> | null = null;

/** The coords key order to emit: runtime-sampled if known, else the default. */
function effectiveCoordsOrder(): ReadonlyArray<keyof CoordsSlots> {
  return sampledCoordsOrder ?? COORDS_JSON_ORDER;
}

/** The position key order to emit: runtime-sampled if known, else the default. */
function effectivePositionOrder(): ReadonlyArray<keyof PositionSlots> {
  return sampledPositionOrder ?? POSITION_JSON_ORDER;
}

/**
 * Learn the engine's true `toJSON()` key order from a genuine, browser-
 * allocated `GeolocationPosition` (available only in preserve-prompt mode,
 * where we call the real geolocation API). Calling `.toJSON()` on a real
 * instance routes through our prototype override, which delegates non-spoofed
 * instances to the native serializer — so the returned key order is the true
 * native order for this exact engine build. We cache it once; failures are
 * swallowed and simply leave the verified hardcoded defaults in place.
 */
function sampleNativeToJsonOrder(realPosition: GeolocationPosition): void {
  try {
    const coordKeys = new Set<string>([
      "accuracy",
      "altitude",
      "altitudeAccuracy",
      "heading",
      "latitude",
      "longitude",
      "speed",
    ]);
    const withToJson = realPosition as unknown as { toJSON?: () => unknown };
    if (sampledPositionOrder === null && typeof withToJson.toJSON === "function") {
      const posJson = withToJson.toJSON();
      if (posJson && typeof posJson === "object") {
        const keys = Object.keys(posJson as Record<string, unknown>).filter(
          (k) => k === "coords" || k === "timestamp"
        );
        if (keys.length === 2) sampledPositionOrder = keys;
      }
    }
    const coords = realPosition.coords as unknown as { toJSON?: () => unknown };
    if (sampledCoordsOrder === null && coords && typeof coords.toJSON === "function") {
      const cJson = coords.toJSON();
      if (cJson && typeof cJson === "object") {
        const keys = Object.keys(cJson as Record<string, unknown>).filter((k) => coordKeys.has(k));
        if (keys.length === coordKeys.size) sampledCoordsOrder = keys as Array<keyof CoordsSlots>;
      }
    }
  } catch {
    // Sampling is best-effort; the hardcoded defaults remain in effect.
  }
}

/** Build the coords JSON object with keys inserted in native order. */
function buildCoordsJSON(
  cSlots: CoordsSlots,
  order: ReadonlyArray<keyof CoordsSlots>
): Record<string, number | null> {
  const out: Record<string, number | null> = {};
  for (const key of order) {
    out[key] = cSlots[key];
  }
  return out;
}

/**
 * Install a `toJSON` override on `GeolocationPosition.prototype`.
 *
 * Native `GeolocationPosition.prototype.toJSON` is a brand-checked
 * method — invoking it on a non-browser-allocated object (like our
 * `Object.create(GeolocationPosition.prototype)` instance) throws. So
 * we install our own `toJSON` on the prototype: for our spoofed
 * instances (identified via the `positionSlots` WeakMap) we build the
 * JSON shape ourselves; for any pristine browser-allocated position
 * that happens to reach this prototype, we fall through to the native
 * method.
 *
 * Installing on the prototype rather than as an own property on each
 * instance means `Object.getOwnPropertyNames(pos)` returns `[]` —
 * matching native layout and closing the detection vector where a
 * page can inspect non-enumerable own keys.
 */
function installPositionToJSON(): void {
  if (typeof GeolocationPosition === "undefined" || !GeolocationPosition.prototype) return;
  const proto = GeolocationPosition.prototype as unknown as {
    toJSON?: () => unknown;
  };

  const originalToJSON = proto.toJSON;

  function spoofedToJSON(this: object): unknown {
    const slots = positionSlots.get(this);
    if (slots) {
      const cSlots = coordsSlots.get(slots.coords);
      const coordsJSON: unknown = cSlots
        ? buildCoordsJSON(cSlots, effectiveCoordsOrder())
        : slots.coords;
      // Assemble the position object with keys in native order (engine-specific
      // — Blink emits `timestamp` before `coords`; Gecko/WebKit the reverse).
      const out: Record<string, unknown> = {};
      for (const key of effectivePositionOrder()) {
        out[key] = key === "coords" ? coordsJSON : slots.timestamp;
      }
      return out;
    }
    // Pristine browser-allocated instance — fall through to native.
    if (typeof originalToJSON === "function") {
      return originalToJSON.call(this);
    }
    // No native toJSON to fall through to (very old engines) — return
    // an empty object rather than throwing so JSON.stringify doesn't
    // propagate an error up the call stack.
    return {};
  }

  installOverride(proto, "toJSON", spoofedToJSON, 0);
}

/**
 * Install a `toJSON` override on `GeolocationCoordinates.prototype`.
 *
 * Same rationale as `installPositionToJSON`, but for the coords
 * sub-object. Spoofed instances return their stored fields; pristine
 * browser-allocated instances fall through to the native method.
 */
function installCoordsToJSON(): void {
  if (typeof GeolocationCoordinates === "undefined" || !GeolocationCoordinates.prototype) return;
  const proto = GeolocationCoordinates.prototype as unknown as {
    toJSON?: () => unknown;
  };

  const originalToJSON = proto.toJSON;

  function spoofedToJSON(this: object): unknown {
    const slots = coordsSlots.get(this);
    if (slots) {
      return buildCoordsJSON(slots, effectiveCoordsOrder());
    }
    if (typeof originalToJSON === "function") {
      return originalToJSON.call(this);
    }
    return {};
  }

  installOverride(proto, "toJSON", spoofedToJSON, 0);
}
