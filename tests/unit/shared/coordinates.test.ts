import { describe, test, expect } from "vitest";
import { parseCoordinates, decodeGeohash } from "@/shared/utils/coordinates";

/**
 * Unit coverage for the paste-a-location parser (FR: convenient coordinate
 * pasting). `parseCoordinates` must accept the shapes people actually paste —
 * decimal pairs, hemisphere-tagged values, DMS, and geohashes — normalize them
 * to signed decimal degrees, and fail safe (return `null`, never throw) on
 * anything else. `decodeGeohash` is checked against an external reference point
 * (Wikipedia's canonical geohash example) so the test isn't merely self-consistent.
 */
describe("coordinates: parseCoordinates — decimal pairs", () => {
  test("parses a comma-separated signed decimal pair (Google Maps style)", () => {
    expect(parseCoordinates("35.22721, -80.84308")).toEqual({
      latitude: 35.22721,
      longitude: -80.84308,
    });
  });

  test("parses a whitespace-separated decimal pair", () => {
    expect(parseCoordinates("40.7128 -74.006")).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
    });
  });

  test("tolerates surrounding whitespace and no space after the comma", () => {
    expect(parseCoordinates("  48.8584,2.2945  ")).toEqual({
      latitude: 48.8584,
      longitude: 2.2945,
    });
  });

  test("parses an explicitly positive-signed pair", () => {
    expect(parseCoordinates("+51.5074, +0.1278")).toEqual({
      latitude: 51.5074,
      longitude: 0.1278,
    });
  });
});

describe("coordinates: parseCoordinates — hemisphere & DMS", () => {
  test("parses hemisphere-tagged decimals", () => {
    const result = parseCoordinates("35.22721 N, 80.84308 W");
    expect(result?.latitude).toBeCloseTo(35.22721, 5);
    expect(result?.longitude).toBeCloseTo(-80.84308, 5);
  });

  test("honors hemisphere letters to reorder a lon,lat pair", () => {
    const result = parseCoordinates("80.84308 W, 35.22721 N");
    expect(result?.latitude).toBeCloseTo(35.22721, 5);
    expect(result?.longitude).toBeCloseTo(-80.84308, 5);
  });

  test("parses degrees/minutes/seconds with trailing hemispheres", () => {
    const result = parseCoordinates("40°42'46\"N 74°00'21\"W");
    expect(result?.latitude).toBeCloseTo(40.712778, 5);
    expect(result?.longitude).toBeCloseTo(-74.005833, 5);
  });

  test("parses leading-hemisphere decimals", () => {
    const result = parseCoordinates("N40.7128 W74.006");
    expect(result?.latitude).toBeCloseTo(40.7128, 5);
    expect(result?.longitude).toBeCloseTo(-74.006, 5);
  });
});

describe("coordinates: parseCoordinates — geohash", () => {
  test("decodes a geohash token to its cell center", () => {
    // Wikipedia's canonical example: 57.64911, 10.40744 encodes to u4pruydqqvj0.
    const result = parseCoordinates("u4pruydqqvj");
    expect(result?.latitude).toBeCloseTo(57.64911, 4);
    expect(result?.longitude).toBeCloseTo(10.40744, 4);
  });

  test("is case-insensitive for geohashes", () => {
    const lower = parseCoordinates("u4pruydqqvj");
    const upper = parseCoordinates("U4PRUYDQQVJ");
    expect(upper).toEqual(lower);
  });

  test("rejects a token containing geohash-invalid letters (a, i, l, o)", () => {
    expect(parseCoordinates("ailuo")).toBeNull();
  });
});

describe("coordinates: parseCoordinates — separator tolerance", () => {
  test.each([
    ["slash", "35.22721/-80.84308"],
    ["slash with spaces", "35.22721 / -80.84308"],
    ["pipe", "35.22721|-80.84308"],
    ["semicolon", "35.22721;-80.84308"],
    ["semicolon with space", "35.22721; -80.84308"],
    ["tab", "35.22721\t-80.84308"],
    ["surrounding parentheses", "(35.22721, -80.84308)"],
    ["degree symbols without hemisphere", "35.22721°, -80.84308°"],
    ["trailing newline", "35.22721,-80.84308\n"],
    ["padded whitespace", "   35.22721 , -80.84308   "],
  ])("accepts a %s separator/decoration", (_label, input) => {
    const result = parseCoordinates(input);
    expect(result?.latitude).toBeCloseTo(35.22721, 5);
    expect(result?.longitude).toBeCloseTo(-80.84308, 5);
  });
});

describe("coordinates: parseCoordinates — explicitly labelled values", () => {
  test("parses a space-mangled 'Latitude … Degrees Longitude … Degrees' string", () => {
    // Real paste that motivated label support (labels flush against values, a
    // missing space gluing "DegreesLongitude", trailing unit words).
    const result = parseCoordinates(
      "Latitude39.66894050786413 DegreesLongitude-74.16007768364175 Degrees"
    );
    expect(result?.latitude).toBeCloseTo(39.66894, 5);
    expect(result?.longitude).toBeCloseTo(-74.160078, 5);
  });

  test("parses spaced-out labels", () => {
    expect(parseCoordinates("Latitude 39.6689 Longitude -74.1601")).toEqual({
      latitude: 39.6689,
      longitude: -74.1601,
    });
  });

  test("parses abbreviated 'lat:/long:' labels", () => {
    expect(parseCoordinates("lat: 39.6689, long: -74.1601")).toEqual({
      latitude: 39.6689,
      longitude: -74.1601,
    });
  });

  test("uses labels to read values regardless of order", () => {
    expect(parseCoordinates("Lng -74.16, Lat 39.66")).toEqual({
      latitude: 39.66,
      longitude: -74.16,
    });
  });

  test("rejects labelled values that are out of range", () => {
    expect(parseCoordinates("Latitude 200 Longitude 40")).toBeNull();
  });

  test("does not fabricate a pair from unlabelled prose with numbers", () => {
    // No lat/lon labels to anchor on: must NOT grab "5" and "39".
    expect(parseCoordinates("meet at building 5, room 39")).toBeNull();
  });
});

describe("coordinates: parseCoordinates — refuses to guess (no silent wrong answers)", () => {
  // A stray letter inside a word must NOT be read as a hemisphere marker and
  // silently swap/flip the coordinate. Labelled input is now read via its
  // labels (correct, never swapped); unlabelled letter-junk fails cleanly.
  test("reads labelled 'lat:/lon:' input correctly, never swapping axes", () => {
    expect(parseCoordinates("lat: 35.2, lon: -80.8")).toEqual({
      latitude: 35.2,
      longitude: -80.8,
    });
  });

  test("rejects a geo: URI rather than misreading its letters", () => {
    expect(parseCoordinates("geo:35.22721,-80.84308")).toBeNull();
  });

  test("rejects a triple (e.g. lat,lon,altitude)", () => {
    expect(parseCoordinates("35.22721,-80.84308,100")).toBeNull();
  });

  test("rejects an empty component between two commas", () => {
    expect(parseCoordinates("35.22721,,-80.84308")).toBeNull();
  });
});

describe("coordinates: parseCoordinates — rejects non-coordinates", () => {
  test("rejects an empty or whitespace-only string", () => {
    expect(parseCoordinates("")).toBeNull();
    expect(parseCoordinates("   ")).toBeNull();
  });

  test("rejects a bare single number (not a geohash, not a pair)", () => {
    expect(parseCoordinates("42")).toBeNull();
    expect(parseCoordinates("40.7128")).toBeNull();
  });

  test("rejects out-of-range values", () => {
    expect(parseCoordinates("120, 45")).toBeNull(); // latitude > 90
    expect(parseCoordinates("45, 200")).toBeNull(); // longitude > 180
  });

  test("rejects arbitrary prose", () => {
    expect(parseCoordinates("hello world")).toBeNull();
    expect(parseCoordinates("not a coordinate")).toBeNull();
  });

  test("rejects non-string input without throwing", () => {
    expect(parseCoordinates(undefined)).toBeNull();
    expect(parseCoordinates(null)).toBeNull();
    expect(parseCoordinates(42)).toBeNull();
  });
});

describe("coordinates: decodeGeohash", () => {
  test("returns null for characters outside the base-32 alphabet", () => {
    expect(decodeGeohash("abc")).toBeNull(); // 'a' is not a geohash character
    expect(decodeGeohash("")).toBeNull();
  });

  test("a shorter geohash yields a coarser cell around the same area", () => {
    const short = decodeGeohash("ezs42");
    expect(short?.latitude).toBeCloseTo(42.6, 1);
    expect(short?.longitude).toBeCloseTo(-5.6, 1);
  });
});
