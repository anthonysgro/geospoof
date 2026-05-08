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
  originalGetCurrentPosition,
  originalWatchPosition,
  originalClearWatch,
} from "./state";
import { installOverride, registerOverride, disguiseAsNative } from "./function-masking";
import { waitForSettings } from "./settings-listener";
import { createLogger } from "@/shared/utils/debug-logger";

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
    // Native desktop geolocation (Wi-Fi / MLS / Google) returns an integer
    // accuracy in metres that stays stable across back-to-back calls from
    // a stationary device. See `jitterAccuracy` for the matching behaviour.
    accuracy: jitterAccuracy(location.accuracy),
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

/**
 * Produce a realistic geolocation accuracy value.
 *
 * On desktop, native geolocation is served by Wi-Fi / Mozilla Location
 * Service / Google Location Services — all of which return an **integer**
 * accuracy in metres that is stable across back-to-back calls from a
 * stationary device (e.g. two consecutive `getCurrentPosition` calls
 * both report `36`). A spoofer that emits fractional values like
 * `12.347m`, or that jitters the value call-to-call, visibly stands out
 * against that native baseline.
 *
 * We therefore match native: round to an integer, and hold the value
 * stable for the lifetime of the content-script context (re-generated
 * only when the configured accuracy or location changes). A small
 * ±2m randomisation on first use stops every GeoSpoof install from
 * emitting the exact same default value, but once picked it stays put.
 */
const DEFAULT_ACCURACY_M = 20;
let accuracyCache: { configured: number; value: number } | null = null;

function jitterAccuracy(configured?: number): number {
  const base = configured && configured > 0 ? configured : DEFAULT_ACCURACY_M;
  if (accuracyCache && accuracyCache.configured === base) {
    return accuracyCache.value;
  }
  // ±2m session-initial randomisation, then stable. Clamp to a sensible
  // lower bound so a tiny configured value doesn't round to 0.
  const jitter = Math.round((Math.random() - 0.5) * 4);
  const value = Math.max(1, Math.round(base + jitter));
  accuracyCache = { configured: base, value };
  return value;
}

/**
 * Enforce the WebIDL brand check that native methods perform. Native
 * `Geolocation.prototype.getCurrentPosition.call({}, ...)` throws
 * `TypeError` because `{}` doesn't implement the Geolocation interface.
 * Without this guard, a fingerprinter can run exactly that call, see it
 * succeed, and detect that the method has been overridden.
 *
 * We check `this instanceof Geolocation` (matching the prototype chain
 * we install the override on). The thrown message mirrors Firefox's
 * native text so the error is indistinguishable under casual inspection.
 */
function assertGeolocationBrand(self: unknown, method: string): void {
  if (!(self instanceof Geolocation)) {
    throw new TypeError(
      `'${method}' called on an object that does not implement interface Geolocation.`
    );
  }
}

/** Override for `navigator.geolocation.getCurrentPosition`. */
function getCurrentPositionOverride(
  this: unknown,
  successCallback: PositionCallback,
  errorCallback?: PositionErrorCallback | null,
  options?: PositionOptions
): void {
  assertGeolocationBrand(this, "getCurrentPosition");
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
      const position = createGeolocationPosition(spoofedLocation);
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
    } else {
      logger.debug("getCurrentPosition: spoofing disabled, using original");
      originalGetCurrentPosition(successCallback, errorCallback, options);
    }
  } else {
    // Settings not yet received — wait for them before responding
    logger.debug("getCurrentPosition: deferring until settings arrive");
    void waitForSettings().then(({ timedOut }) => {
      if (timedOut) {
        // Settings never arrived within the timeout window. We don't know
        // whether spoofing should be on or off, so we cannot safely fall
        // through to the real API (that would leak the user's real location
        // if spoofing was meant to be active). Fire the error callback instead.
        logger.warn("getCurrentPosition: settings timed out, returning TIMEOUT error");
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
        const position = createGeolocationPosition(spoofedLocation);
        rememberPosition(position);
        const delay = 10 + Math.random() * 40;
        logger.debug("getCurrentPosition (deferred): returning spoofed coords", {
          coords: { lat: position.coords.latitude, lon: position.coords.longitude },
          delay: `${delay.toFixed(1)}ms`,
        });
        setTimeout(() => {
          if (successCallback) {
            successCallback(position as GeolocationPosition);
          }
        }, delay);
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
  assertGeolocationBrand(this, "watchPosition");
  if (spoofingEnabled && spoofedLocation) {
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
  assertGeolocationBrand(this, "clearWatch");
  if (spoofingEnabled) {
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
      const coordsJSON = cSlots
        ? {
            latitude: cSlots.latitude,
            longitude: cSlots.longitude,
            accuracy: cSlots.accuracy,
            altitude: cSlots.altitude,
            altitudeAccuracy: cSlots.altitudeAccuracy,
            heading: cSlots.heading,
            speed: cSlots.speed,
          }
        : slots.coords;
      return {
        coords: coordsJSON,
        timestamp: slots.timestamp,
      };
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
      return {
        latitude: slots.latitude,
        longitude: slots.longitude,
        accuracy: slots.accuracy,
        altitude: slots.altitude,
        altitudeAccuracy: slots.altitudeAccuracy,
        heading: slots.heading,
        speed: slots.speed,
      };
    }
    if (typeof originalToJSON === "function") {
      return originalToJSON.call(this);
    }
    return {};
  }

  installOverride(proto, "toJSON", spoofedToJSON, 0);
}
