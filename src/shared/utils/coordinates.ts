/**
 * Coordinate & geohash parsing for convenient pasting.
 *
 * Powers the popup's "paste a location" affordance (see src/popup/coord-paste.ts):
 * a user copies a coordinate from Google Maps, a spreadsheet, a geocaching site,
 * etc. and pastes it into the manual-coordinates tab. Rather than force a single
 * rigid format, `parseCoordinates` accepts the shapes people actually paste —
 * signed decimal pairs, hemisphere-tagged decimals, degrees/minutes/seconds, and
 * bare geohashes — and normalizes them to a `{ latitude, longitude }` in signed
 * decimal degrees.
 *
 * Every exported function is PURE and FAIL-SAFE: it returns `null` for anything
 * it can't confidently interpret and never throws. The popup relies on that
 * contract — a `null` simply means "this paste isn't coordinates, let the field
 * handle it normally" — so parsing can't break the input on unexpected text.
 */

export interface ParsedCoordinates {
  latitude: number;
  longitude: number;
}

/**
 * Geohash base-32 alphabet: digits 0-9 and letters b-z with a, i, l, o removed
 * (the standard geohash "no ambiguous characters" set). Index into this gives
 * the 5-bit value each character encodes.
 */
const GEOHASH_BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

const LAT_MIN = -90;
const LAT_MAX = 90;
const LON_MIN = -180;
const LON_MAX = 180;

function isValidLatitude(value: number): boolean {
  return Number.isFinite(value) && value >= LAT_MIN && value <= LAT_MAX;
}

function isValidLongitude(value: number): boolean {
  return Number.isFinite(value) && value >= LON_MIN && value <= LON_MAX;
}

/**
 * Parse pasted text into decimal-degree coordinates, or `null` when it isn't a
 * coordinate we recognize (or is out of range). A decimal/DMS pair takes
 * priority; a bare geohash token is the fallback.
 */
export function parseCoordinates(input: unknown): ParsedCoordinates | null {
  if (typeof input !== "string") return null;
  // Normalize the Unicode MINUS SIGN (U+2212) to an ASCII hyphen-minus so a
  // value copied from formatted text — or from GeoSpoof's own "−90 to 90"
  // labels — parses as negative. Only U+2212 is normalized; en/em dashes are
  // deliberately left alone (ambiguous as minus). The native Swift port applies
  // the same single substitution so both parsers stay in lockstep.
  const text = input.replace(/\u2212/g, "-").trim();
  if (text.length === 0) return null;

  // Explicitly labelled values ("Latitude … Longitude …", "lat: … long: …")
  // are unambiguous: the labels say which number is which, so we can read even
  // noisy, word-heavy strings safely and independent of order. Try this first,
  // since such strings would otherwise be refused by the word-guard below.
  const labelled = parseLabelled(text);
  if (labelled) return labelled;

  // A coordinate pair carries separators, signs, hemisphere letters or DMS
  // symbols that a geohash never has, so try it next — an unambiguous win here
  // means we never misread a pair as a geohash.
  const pair = parseLatLonPair(text);
  if (pair) return pair;

  // Otherwise a single token drawn from the geohash alphabet (with at least one
  // letter, so plain integers like "42" aren't mistaken for a geohash) decodes
  // to the center of its cell.
  if (isLikelyGeohash(text)) {
    const decoded = decodeGeohash(text);
    if (decoded && isValidLatitude(decoded.latitude) && isValidLongitude(decoded.longitude)) {
      return decoded;
    }
  }

  return null;
}

/**
 * Decode a geohash to the center point of the cell it names, or `null` if the
 * string contains any character outside the geohash base-32 alphabet.
 *
 * Standard algorithm: each character contributes 5 bits, most-significant
 * first; bits alternate between refining longitude (even bit positions overall)
 * and latitude, each halving the remaining interval.
 */
export function decodeGeohash(geohash: string): ParsedCoordinates | null {
  const gh = geohash.trim().toLowerCase();
  if (gh.length === 0) return null;

  let refiningLongitude = true;
  let latMin = LAT_MIN;
  let latMax = LAT_MAX;
  let lonMin = LON_MIN;
  let lonMax = LON_MAX;

  for (const char of gh) {
    const value = GEOHASH_BASE32.indexOf(char);
    if (value === -1) return null;

    for (let mask = 0b10000; mask > 0; mask >>= 1) {
      const bitIsSet = (value & mask) !== 0;
      if (refiningLongitude) {
        const mid = (lonMin + lonMax) / 2;
        if (bitIsSet) lonMin = mid;
        else lonMax = mid;
      } else {
        const mid = (latMin + latMax) / 2;
        if (bitIsSet) latMin = mid;
        else latMax = mid;
      }
      refiningLongitude = !refiningLongitude;
    }
  }

  return {
    latitude: (latMin + latMax) / 2,
    longitude: (lonMin + lonMax) / 2,
  };
}

/**
 * True when `text` is a single token that could be a geohash: no whitespace,
 * only base-32 characters, and at least one letter (a purely numeric token is
 * far more likely a stray number than a geohash, so we decline it).
 */
function isLikelyGeohash(text: string): boolean {
  if (/\s/.test(text)) return false;
  const lower = text.toLowerCase();
  for (const char of lower) {
    if (!GEOHASH_BASE32.includes(char)) return false;
  }
  // All characters are base-32; a letter here is necessarily one of the valid
  // geohash letters (a/i/l/o are already excluded by the loop above).
  return /[b-z]/.test(lower);
}

/**
 * Parse text that explicitly labels its values — e.g.
 * `Latitude 39.6689 Longitude -74.1601`, `lat: 39.6689, long: -74.1601`, or the
 * space-mangled `Latitude39.6689 DegreesLongitude-74.1601 Degrees`. Requires
 * BOTH a latitude and a longitude label; the labels (not position) decide which
 * value is which, so it works regardless of order and tolerates surrounding
 * words. Returns `null` if either label is missing or a value is out of range.
 *
 * The label may sit flush against its number (`Latitude39`), so the gap between
 * keyword and value allows any non-letter/non-digit/non-sign characters but
 * stops at a letter — that keeps one label from swallowing the other label's
 * value. Because the geohash alphabet omits a/i/l/o, no geohash can contain
 * "lat"/"lon"/"lng", so this never misfires on a geohash.
 */
function parseLabelled(text: string): ParsedCoordinates | null {
  const latMatch = text.match(/lat(?:itude)?[^a-z\d+-]*([+-]?\d+(?:\.\d+)?)/i);
  const lonMatch = text.match(/(?:lon(?:gitude|g)?|lng)[^a-z\d+-]*([+-]?\d+(?:\.\d+)?)/i);
  if (!latMatch || !lonMatch) return null;

  const latitude = parseFloat(latMatch[1]);
  const longitude = parseFloat(lonMatch[1]);
  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  return { latitude, longitude };
}

/** One coordinate component's parsed value plus the axis its hemisphere pins it to. */
interface AngleComponent {
  value: number;
  /** "lat" for N/S, "lon" for E/W, or null when no hemisphere letter was present. */
  axis: "lat" | "lon" | null;
}

/**
 * Parse a coordinate pair by splitting into two components and assigning each to
 * latitude or longitude. Hemisphere letters, when present, decide the axis (and
 * permit the "lon, lat" ordering some sources emit); otherwise the conventional
 * latitude-first order is assumed.
 */
function parseLatLonPair(text: string): ParsedCoordinates | null {
  // A clean coordinate pair contains only digits, signs, separators, DMS
  // symbols and — at most — N/S/E/W hemisphere markers. If any OTHER letter is
  // present (e.g. "lat:", "geo:", or prose), this isn't something we should
  // risk guessing at: a stray "e" or "n" inside a word would otherwise be
  // misread as a hemisphere and silently swap or flip the result. Refusing is
  // safer than spoofing to the wrong place.
  const letters = text.replace(/[^a-z]/gi, "");
  if (letters.length > 0 && !/^[nsew]+$/i.test(letters)) return null;

  const split = splitPair(text);
  if (!split) return null;

  const first = parseAngle(split[0]);
  const second = parseAngle(split[1]);
  if (!first || !second) return null;

  let latitude: number;
  let longitude: number;

  if (first.axis && second.axis) {
    // Both components name an axis — they must name different ones.
    if (first.axis === second.axis) return null;
    latitude = first.axis === "lat" ? first.value : second.value;
    longitude = first.axis === "lon" ? first.value : second.value;
  } else if (first.axis) {
    // Only the first names its axis; place it, the other takes the remaining slot.
    latitude = first.axis === "lat" ? first.value : second.value;
    longitude = first.axis === "lon" ? first.value : second.value;
  } else if (second.axis) {
    latitude = second.axis === "lat" ? second.value : first.value;
    longitude = second.axis === "lon" ? second.value : first.value;
  } else {
    // No hemispheres: latitude first, longitude second.
    latitude = first.value;
    longitude = second.value;
  }

  if (!isValidLatitude(latitude) || !isValidLongitude(longitude)) return null;
  return { latitude, longitude };
}

/**
 * Split a two-coordinate string into its two component substrings, handling the
 * separators people actually paste: a comma, two hemisphere-delimited groups
 * (covers DMS with internal spaces), or two decimals separated by whitespace.
 * Returns `null` when it can't confidently identify exactly two components.
 */
function splitPair(text: string): [string, string] | null {
  // 1. A comma is the least ambiguous separator. Exactly one is expected.
  const commaIndex = text.indexOf(",");
  if (commaIndex !== -1) {
    if (text.indexOf(",", commaIndex + 1) !== -1) return null;
    return [text.slice(0, commaIndex), text.slice(commaIndex + 1)];
  }

  // 2. Exactly two hemisphere letters delimit the groups, e.g.
  //    `40°42'46"N 74°00'21"W` (trailing) or `N40 W74` (leading).
  const hemispheres = [...text.matchAll(/[NSEW]/gi)];
  if (hemispheres.length === 2) {
    const firstIndex = hemispheres[0].index ?? 0;
    const before = text.slice(0, firstIndex);
    if (/\d/.test(before)) {
      // Trailing style: the first letter closes the first group.
      return [text.slice(0, firstIndex + 1), text.slice(firstIndex + 1)];
    }
    // Leading style: the second letter opens the second group.
    const secondIndex = hemispheres[1].index ?? 0;
    return [text.slice(0, secondIndex), text.slice(secondIndex)];
  }

  // 3. Two plain values separated by whitespace or a punctuation delimiter,
  //    e.g. `40.7128 -74.0060`, `40.7128/-74.0060`, `40.7128 | -74.0060`. The
  //    minus sign is deliberately NOT a delimiter so a negative second value
  //    (`-74.0060`) stays intact; a bare `35.2-74.0` is left ambiguous (null).
  const parts = text.split(/[\s/|;]+/).filter((part) => part.length > 0);
  if (parts.length === 2) return [parts[0], parts[1]];

  return null;
}

/**
 * Parse a single coordinate component: a signed decimal degree, or a
 * degrees[/minutes[/seconds]] group, with an optional N/S/E/W hemisphere on
 * either side. Returns the signed decimal-degree value and the axis its
 * hemisphere names (or null), or `null` if there's no usable number.
 */
function parseAngle(raw: string): AngleComponent | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  // A single hemisphere letter may lead or trail the number; more than one is
  // contradictory for one component.
  const hemispheres = trimmed.match(/[NSEW]/gi);
  let axis: "lat" | "lon" | null = null;
  let hemisphereSign = 1;
  let core = trimmed;
  if (hemispheres) {
    if (hemispheres.length > 1) return null;
    const letter = hemispheres[0].toUpperCase();
    axis = letter === "N" || letter === "S" ? "lat" : "lon";
    if (letter === "S" || letter === "W") hemisphereSign = -1;
    core = trimmed.replace(/[NSEW]/i, " ");
  }

  // Degrees, then optional minutes and seconds.
  const numbers = core.match(/[+-]?\d+(?:\.\d+)?/g);
  if (!numbers || numbers.length === 0 || numbers.length > 3) return null;

  const degrees = parseFloat(numbers[0]);
  const minutes = numbers.length >= 2 ? parseFloat(numbers[1]) : 0;
  const seconds = numbers.length >= 3 ? parseFloat(numbers[2]) : 0;
  if (!Number.isFinite(degrees)) return null;

  // Minutes and seconds are only meaningful in [0, 60).
  if (numbers.length >= 2 && (minutes < 0 || minutes >= 60)) return null;
  if (numbers.length >= 3 && (seconds < 0 || seconds >= 60)) return null;

  const magnitude = Math.abs(degrees) + minutes / 60 + seconds / 3600;
  // A hemisphere letter dictates the sign; otherwise honor a leading minus.
  const sign = axis !== null ? hemisphereSign : degrees < 0 ? -1 : 1;

  return { value: sign * magnitude, axis };
}
