import { describe, it, expect } from "vitest";
import { parsePattern } from "@/shared/utils/scope";
import vectors from "../../fixtures/pattern-vectors.json";

/**
 * Cross-language parity: `parsePattern` (the TypeScript Pattern_Parser) must
 * match every vector in the shared fixture (Req 2, 3). The same fixture is
 * consumed by the native Swift parser's parity test
 * (safari/GeoSpoofTests/PatternParserParityTests.swift), so both parsers are
 * pinned to one hand-authored contract and cannot silently drift apart — a
 * requirement because scope lists round-trip across the App Group bridge and
 * are deduped against each other's canonical form.
 *
 * Expected values in the fixture are authored independently of the parser, so
 * this also guards `parsePattern` against regressions.
 */

interface Vector {
  input: string;
  expected: string | null;
}

const validVectors = vectors.valid as Vector[];
const invalidVectors = vectors.invalid as Vector[];

describe("parsePattern — shared parity fixture (valid)", () => {
  it.each(validVectors)("parsePattern($input) === $expected", ({ input, expected }) => {
    expect(parsePattern(input)).toBe(expected);
  });
});

describe("parsePattern — shared parity fixture (invalid → null)", () => {
  it.each(invalidVectors)("parsePattern($input) === null", ({ input, expected }) => {
    expect(expected).toBeNull(); // fixture sanity: invalid entries declare null
    expect(parsePattern(input)).toBeNull();
  });
});

describe("parsePattern — over-length guard (Req 3.5 / 15.2)", () => {
  it("rejects input longer than 2048 characters", () => {
    // Not encoded in the JSON fixture (to keep it readable); asserted here and
    // mirrored in the Swift parity test.
    const tooLong = "a.".repeat(1025) + "com"; // > 2048 chars
    expect(tooLong.length).toBeGreaterThan(2048);
    expect(parsePattern(tooLong)).toBeNull();
  });
});
