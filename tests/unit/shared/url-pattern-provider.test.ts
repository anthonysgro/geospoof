import { describe, test, expect } from "vitest";
import { getURLPattern } from "@/shared/utils/url-pattern-provider";

describe("url-pattern-provider: getURLPattern", () => {
  test("returns a URLPattern constructor", () => {
    const URLPatternCtor = getURLPattern();
    expect(typeof URLPatternCtor).toBe("function");
  });

  test("the returned constructor matches a known pattern/URL pair", () => {
    const URLPatternCtor = getURLPattern();
    const pattern = new URLPatternCtor({ hostname: "example.com" });

    expect(pattern.test("https://example.com/")).toBe(true);
    expect(pattern.test("https://other.com/")).toBe(false);
  });

  test("supports the wildcard and path components the matcher relies on", () => {
    const URLPatternCtor = getURLPattern();

    // Subdomain wildcard (the `*.host` form) matches subdomains, not the apex.
    const subdomains = new URLPatternCtor({ hostname: "*.example.com" });
    expect(subdomains.test("https://app.example.com/")).toBe(true);
    expect(subdomains.test("https://example.com/")).toBe(false);

    // Path prefix wildcard.
    const path = new URLPatternCtor({ hostname: "example.com", pathname: "/maps/*" });
    expect(path.test("https://example.com/maps/here")).toBe(true);
    expect(path.test("https://example.com/other")).toBe(false);
  });

  test("memoizes the resolved constructor across calls", () => {
    expect(getURLPattern()).toBe(getURLPattern());
  });
});
