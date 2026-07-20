/**
 * Location-precision offset resolver.
 *
 * Turns the user's chosen location (the Anchor, `Settings.location`) into the
 * coordinates actually delivered to a page. In `exact` mode that is the Anchor
 * verbatim; in `approximate` mode it is a deterministic random point within the
 * configured radius — the browser analogue of a phone's coarse-location mode.
 *
 * This is a DIFFERENT concept from the accuracy resolver
 * (`src/shared/accuracy/resolver.ts`): accuracy sets the reported
 * `GeolocationCoordinates.accuracy` *number* while the point stays exact; this
 * moves the *point*. The two are independent — different settings, different
 * seeds, and this module intentionally shares no code with the accuracy
 * resolver (it has its own hash so it can key on full-precision coordinates
 * rather than the accuracy resolver's coarse ~11km grid).
 *
 * Every export is PURE and DETERMINISTIC: identical `(anchor, precision, seed)`
 * always yields the identical point, so the offset is stable across repeated
 * `getCurrentPosition` calls and page loads (no per-call jitter, no "teleport"
 * tell) and re-derives only when the Anchor or the setting changes. Nothing
 * throws; the result is always a valid coordinate.
 */

import type { Location, LocationPrecision } from "@/shared/types/settings";
import {
  DEFAULT_LOCATION_PRECISION,
  MIN_PRECISION_RADIUS_M,
  MAX_PRECISION_RADIUS_M,
} from "@/shared/types/settings";

/** A coordinate pair delivered to the page. */
export interface ReportedCoordinates {
  latitude: number;
  longitude: number;
}

/** Mean Earth radius in meters, for the small-distance planar offset. */
const EARTH_RADIUS_M = 6_371_000;

/**
 * Distinct salts so a single `(seed, lat, lon)` yields two independent draws —
 * one for the offset distance, one for the bearing. Any two distinct values
 * work; these are arbitrary mixing constants.
 */
const SALT_DISTANCE = 0x9e3779b9;
const SALT_BEARING = 0x85ebca6b;

const DEG_PER_RAD = 180 / Math.PI;
const RAD_PER_DEG = Math.PI / 180;

/**
 * Deterministic float in `[0, 1)` derived from `(seed, lat, lon, salt)`.
 *
 * Uses the xmur3 string-hash → mulberry32 mixing technique (the same family the
 * accuracy resolver uses) but keys on the FULL-precision coordinates — no
 * coarse quantization — so two distinct Anchors produce distinct offsets. The
 * `salt` lets one Anchor produce several independent draws. Fast, dependency-
 * free, and stable across runs.
 */
export function offsetHash01(seed: number, lat: number, lon: number, salt: number): number {
  // Full-precision key: Number#toString round-trips a double exactly, so
  // equivalent inputs always produce the same key.
  const key = `${seed}|${salt}|${lat}|${lon}`;

  // xmur3: derive a 32-bit hash from the string key.
  let h = 1779033703 ^ key.length;
  for (let i = 0; i < key.length; i++) {
    h = Math.imul(h ^ key.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  h ^= h >>> 16;

  // mulberry32 mixing step → a uniform float in [0, 1).
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Clamp latitude into the valid `[-90, 90]` range; non-finite → 0. */
function clampLatitude(lat: number): number {
  if (!Number.isFinite(lat)) return 0;
  return Math.min(90, Math.max(-90, lat));
}

/** Wrap longitude into the valid `[-180, 180)` range; non-finite → 0. */
function wrapLongitude(lon: number): number {
  if (!Number.isFinite(lon)) return 0;
  // Fast path: an already-valid longitude is returned bit-for-bit unchanged,
  // avoiding the ULP drift the modulo arithmetic would otherwise introduce.
  if (lon >= -180 && lon < 180) return lon;
  const shifted = (((lon + 180) % 360) + 360) % 360; // [0, 360)
  return shifted - 180;
}

/** Round and clamp a radius into `[MIN, MAX]`; non-finite → 0 (treated as no offset). */
function clampRadiusMeters(radiusMeters: number): number {
  if (!Number.isFinite(radiusMeters)) return 0;
  return Math.min(MAX_PRECISION_RADIUS_M, Math.max(MIN_PRECISION_RADIUS_M, radiusMeters));
}

/**
 * Resolve the coordinates delivered to a page from the Anchor and the precision
 * setting.
 *
 *   - `exact` (or any non-`approximate` mode) → the Anchor, unchanged.
 *   - `approximate` → a point uniformly distributed over the disk of the
 *     configured radius around the Anchor, derived deterministically from the
 *     seed so it is stable per Anchor/setting and differs between installs.
 *
 * Pure and total: never throws, always returns a valid coordinate.
 *
 * @param anchor    The user-chosen location (`Settings.location`).
 * @param precision How tightly the reported point sits on the Anchor.
 * @param seed      Per-install stable seed (`Settings.precisionSeed`).
 */
export function resolveReportedLocation(
  anchor: ReportedCoordinates,
  precision: LocationPrecision,
  seed: number
): ReportedCoordinates {
  const anchorLat = clampLatitude(anchor.latitude);
  const anchorLon = wrapLongitude(anchor.longitude);

  // Exact (or any unexpected mode) reports the Anchor verbatim.
  if (precision.mode !== "approximate") {
    return { latitude: anchorLat, longitude: anchorLon };
  }

  const radius = clampRadiusMeters(precision.radiusMeters);
  if (!(radius > 0)) {
    // Non-finite radius collapses to no offset (defensive; validation normally
    // prevents this reaching us).
    return { latitude: anchorLat, longitude: anchorLon };
  }

  // Two independent deterministic draws in [0, 1).
  const u1 = offsetHash01(seed, anchorLat, anchorLon, SALT_DISTANCE);
  const u2 = offsetHash01(seed, anchorLat, anchorLon, SALT_BEARING);

  // sqrt(u1) makes the point UNIFORM over the disk area (not clustered toward
  // the center); the bearing is uniform over the full circle.
  const distance = radius * Math.sqrt(u1); // meters, in [0, radius)
  const bearing = 2 * Math.PI * u2; // radians

  const north = distance * Math.cos(bearing); // meters
  const east = distance * Math.sin(bearing); // meters

  // Project the local north/east offset (meters) to degrees. Longitude scales
  // by cos(latitude); guard against the poles where cos → 0.
  const dLatDeg = (north / EARTH_RADIUS_M) * DEG_PER_RAD;
  const cosLat = Math.cos(anchorLat * RAD_PER_DEG);
  const dLonDeg = Math.abs(cosLat) < 1e-12 ? 0 : (east / (EARTH_RADIUS_M * cosLat)) * DEG_PER_RAD;

  return {
    latitude: clampLatitude(anchorLat + dLatDeg),
    longitude: wrapLongitude(anchorLon + dLonDeg),
  };
}

/**
 * Apply the precision offset to a stored `Location`, preserving every field
 * other than the coordinates (notably `accuracy`), and returning `null`
 * unchanged so callers can pass `Settings.location` directly.
 *
 * This is the single entry point every page-bound builder uses (the per-tab
 * broadcast, the content-script `GET_SETTINGS` reply, and the Firefox
 * document_start bootstrap), so they all emit the identical Reported_Location
 * for the same settings — the determinism of {@link resolveReportedLocation}
 * guarantees the early bootstrap value and the authoritative async value match.
 */
export function applyPrecisionOffset(
  location: Location | null,
  precision: LocationPrecision,
  seed: number
): Location | null {
  if (!location) return null;
  const { latitude, longitude } = resolveReportedLocation(location, precision, seed);
  return { ...location, latitude, longitude };
}

/**
 * Safari/iOS Pro gate for approximate location. When the iOS app signals
 * `proFeaturesBlocked` (a non-Pro user), the precision setting is forced back
 * to `exact` so a free user can't offset their location — regardless of how the
 * setting got there (the app, the popup, or a stale value after a lapsed
 * subscription).
 *
 * Optional + fail-open: `undefined`/`false` leaves the setting untouched, and
 * the `__SAFARI__` guard compiles the gate out on Chrome/Firefox. macOS sends
 * `proFeaturesBlocked=false`, so macOS Safari is unaffected — only iOS Safari
 * free users are gated. Mirrors `computeEffectiveAccuracySetting`; applied in
 * the background at every point that builds a tab-bound payload, so the location
 * delivered to a page is always exact for a free user.
 */
export function computeEffectiveLocationPrecision(
  setting: LocationPrecision,
  proFeaturesBlocked?: boolean
): LocationPrecision {
  if (__SAFARI__ && proFeaturesBlocked === true) {
    return DEFAULT_LOCATION_PRECISION;
  }
  return setting;
}
