import { describe, test, expect } from "vitest";
import { classifyCoordinatePaste } from "@/popup/coord-paste";

/**
 * Policy tests for how a pasted string is handled in the two-field coordinate
 * form. `classifyCoordinatePaste` is pure (no DOM), so the branching rules are
 * asserted directly:
 *   - a COMPLETE coordinate fills both fields ("fill"),
 *   - a lone value or non-coordinate text passes through to the focused field's
 *     native paste ("passthrough") — this is what lets a single latitude or
 *     longitude be pasted without disturbing the other field,
 *   - only an unambiguous-but-broken pair is flagged ("error").
 */
describe("classifyCoordinatePaste — complete coordinates fill both fields", () => {
  test("a decimal pair fills both", () => {
    expect(classifyCoordinatePaste("35.22721, -80.84308")).toEqual({
      kind: "fill",
      latitude: 35.22721,
      longitude: -80.84308,
    });
  });

  test("a geohash fills both", () => {
    const action = classifyCoordinatePaste("9q8yy");
    expect(action.kind).toBe("fill");
  });
});

describe("classifyCoordinatePaste — single values pass through to the focused field", () => {
  test.each(["-74.16007768364175", "39.66894", "0", "-90", "180"])(
    "a lone number (%s) passes through",
    (value) => {
      expect(classifyCoordinatePaste(value)).toEqual({ kind: "passthrough" });
    }
  );

  test("a lone value with multiple numeric tokens (no comma) still passes through", () => {
    // Regression: this used to be flagged as an error because it has >1 number.
    // A single value must never error — it belongs in one field.
    expect(classifyCoordinatePaste("40 42 46")).toEqual({ kind: "passthrough" });
  });

  test("non-coordinate prose passes through (no comma+digits, so not a pair attempt)", () => {
    expect(classifyCoordinatePaste("hello world")).toEqual({ kind: "passthrough" });
  });
});

describe("classifyCoordinatePaste — only obvious broken pairs are errors", () => {
  test("a comma-separated pair that is out of range errors", () => {
    expect(classifyCoordinatePaste("120, 45")).toEqual({ kind: "error" });
  });

  test("a comma-separated pair with junk errors", () => {
    expect(classifyCoordinatePaste("40.7, abc")).toEqual({ kind: "error" });
  });

  test("two digit-adjacent hemisphere markers (out of range, no comma) errors", () => {
    expect(classifyCoordinatePaste("N91 W200")).toEqual({ kind: "error" });
  });

  test("a comma with no digits is prose, not a failed pair", () => {
    expect(classifyCoordinatePaste("hello, world")).toEqual({ kind: "passthrough" });
  });
});
