import { describe, it, expect } from "vitest";
import { parseCoordinates } from "@/shared/utils/coordinates";
import vectors from "../../fixtures/coordinate-vectors.json";

/**
 * Cross-language parity: `parseCoordinates` (TypeScript) must match every vector
 * in the shared fixture. The same fixture is consumed by the native Swift
 * parser's parity test (safari/GeoSpoofTests/CoordinateParserParityTests.swift),
 * so both the extension and the iOS/macOS app read pasted coordinates
 * identically and cannot silently drift apart.
 *
 * Coordinates are compared with a small epsilon: the parse arithmetic is
 * identical IEEE-754 on both platforms, so this only absorbs any JSON/float
 * formatting differences, not real disagreement.
 */

interface ValidVector {
  input: string;
  latitude: number;
  longitude: number;
}

interface InvalidVector {
  input: string;
  expected: null;
}

const EPSILON = 1e-9;
const validVectors = vectors.valid as ValidVector[];
const invalidVectors = vectors.invalid as InvalidVector[];

describe("parseCoordinates — shared parity fixture (valid)", () => {
  it.each(validVectors)("parseCoordinates($input) → ($latitude, $longitude)", (vector) => {
    const result = parseCoordinates(vector.input);
    expect(result).not.toBeNull();
    expect(Math.abs(result!.latitude - vector.latitude)).toBeLessThan(EPSILON);
    expect(Math.abs(result!.longitude - vector.longitude)).toBeLessThan(EPSILON);
  });
});

describe("parseCoordinates — shared parity fixture (invalid → null)", () => {
  it.each(invalidVectors)("parseCoordinates($input) === null", ({ input, expected }) => {
    expect(expected).toBeNull(); // fixture sanity: invalid entries declare null
    expect(parseCoordinates(input)).toBeNull();
  });
});
