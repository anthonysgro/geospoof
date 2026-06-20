/**
 * Deterministic accuracy Resolver for the spoofed `GeolocationCoordinates`.
 *
 * Given an {@link AccuracySetting}, the running {@link DeviceClass}, a stable
 * per-install seed, and the current spoofed coordinates, this module resolves a
 * single plausible accuracy value (in metres). The function is pure and
 * deterministic: identical inputs always yield the same output, so route
 * playback and repeated reads stay stable rather than re-rolling on every call.
 *
 * Design notes:
 *  - `fixed` short-circuits to the requested value (normalized).
 *  - `range`/`auto` pick a value inside an ordered, clamped Band, where the
 *    position within the Band is derived from a deterministic hash of the seed
 *    plus the coarsely-quantized coordinates. Coarse quantization (see
 *    {@link ACCURACY_GRID_DP}) means fine movement within a grid cell keeps the
 *    same value, while a meaningfully different place lands in a new cell.
 *  - Every path funnels through {@link normalizeAccuracy} so the output is
 *    always a valid integer in `[1, 10000]` — never 0, negative, fractional,
 *    NaN, or infinite.
 */

import type { AccuracySetting } from "@/shared/types/settings";
import { DEFAULT_ACCURACY_M, ACCURACY_GRID_DP } from "@/shared/types/settings";
import type { DeviceClass } from "@/shared/accuracy/device-class";
import { BANDS } from "@/shared/accuracy/device-class";

/** Inclusive bounds for a valid accuracy value, in metres. */
const MIN_ACCURACY_M = 1;
const MAX_ACCURACY_M = 10000;

/**
 * Context required to resolve an accuracy value.
 */
export interface ResolveContext {
  /** How the accuracy value should be produced. */
  setting: AccuracySetting;
  /** Detected device class, used to select the Band in `auto` mode. */
  deviceClass: DeviceClass;
  /** Per-install stable seed; keeps derived values consistent across reads. */
  seed: number;
  /** Current spoofed latitude in decimal degrees. */
  latitude: number;
  /** Current spoofed longitude in decimal degrees. */
  longitude: number;
}

/**
 * Coerce an arbitrary number into a valid accuracy value: round to the nearest
 * integer and clamp into `[1, 10000]`. Non-finite input (NaN/Infinity) falls
 * back to the canonical {@link DEFAULT_ACCURACY_M}, itself clamped for safety.
 *
 * Guarantees the result is always a positive integer within bounds — never 0,
 * negative, fractional, NaN, or infinite.
 *
 * @param value Raw accuracy candidate in metres.
 * @returns A valid integer accuracy in `[1, 10000]`.
 */
export function normalizeAccuracy(value: number): number {
  // Guard non-finite input by falling back to the canonical default.
  const safe = Number.isFinite(value) ? value : DEFAULT_ACCURACY_M;
  const rounded = Math.round(safe);
  return Math.min(MAX_ACCURACY_M, Math.max(MIN_ACCURACY_M, rounded));
}

/**
 * Snap a coordinate onto the coarse accuracy grid (~11km at `ACCURACY_GRID_DP`
 * = 1 decimal place). Used so continuous movement within a grid cell resolves
 * to the same accuracy value rather than re-rolling every few metres.
 *
 * @param coord A latitude or longitude in decimal degrees.
 * @returns The coordinate rounded to the grid resolution.
 */
export function quantize(coord: number): number {
  const factor = 10 ** ACCURACY_GRID_DP;
  return Math.round(coord * factor) / factor;
}

/**
 * Dependency-free deterministic hash of `(seed, quantize(lat), quantize(lon))`
 * producing a float in `[0, 1)`. Uses an xmur3-style string hash to seed a
 * mulberry32 PRNG step, which is fast, well-distributed, and stable across
 * runs. Coordinates are quantized internally so fine movement within a grid
 * cell yields the same value.
 *
 * @param seed Per-install stable seed.
 * @param lat Latitude in decimal degrees (quantized internally).
 * @param lon Longitude in decimal degrees (quantized internally).
 * @returns A deterministic float in `[0, 1)`.
 */
export function hash01(seed: number, lat: number, lon: number): number {
  // Build a stable string key from the seed and quantized coordinates. The
  // quantized values are normalized to fixed precision so equivalent grid
  // cells produce identical keys regardless of floating-point representation.
  const qLat = quantize(lat).toFixed(ACCURACY_GRID_DP);
  const qLon = quantize(lon).toFixed(ACCURACY_GRID_DP);
  const key = `${seed}|${qLat}|${qLon}`;

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

/**
 * Pick a normalized accuracy value within the inclusive Band `[lo, hi]`. When
 * the Band collapses (`lo >= hi`) the lower bound is returned. Otherwise the
 * position is derived deterministically from the context's seed and location.
 */
function pickInBand(lo: number, hi: number, ctx: ResolveContext): number {
  if (lo >= hi) {
    return normalizeAccuracy(lo);
  }
  const t = hash01(ctx.seed, quantize(ctx.latitude), quantize(ctx.longitude));
  return normalizeAccuracy(lo + t * (hi - lo));
}

/**
 * Resolve a plausible accuracy value (in metres) for the given context.
 *
 * - `fixed`: returns the configured value, normalized into bounds.
 * - `range`: picks within the user's ordered, clamped `[min, max]` Band.
 * - `auto`: picks within the device class's {@link BANDS} entry.
 *
 * Pure and deterministic for identical inputs.
 *
 * @param ctx Resolution context.
 * @returns A valid integer accuracy in `[1, 10000]`.
 */
export function resolveAccuracy(ctx: ResolveContext): number {
  const { setting } = ctx;

  switch (setting.mode) {
    case "fixed":
      return normalizeAccuracy(setting.meters);

    case "range": {
      const lo = Math.min(setting.min, setting.max);
      const hi = Math.max(setting.min, setting.max);
      return pickInBand(lo, hi, ctx);
    }

    case "auto":
    default: {
      const band = BANDS[ctx.deviceClass];
      return pickInBand(band.min, band.max, ctx);
    }
  }
}
