/**
 * Property-Based Tests for the Pattern_Parser (`parsePattern`)
 * Feature: advanced-filtering
 *
 * `parsePattern(input: string): string | null` lives in
 * `src/shared/utils/scope.ts` and supersedes `normalizeDomain`. It parses a
 * glob-style URL pattern `[scheme://]host[:port][/path]` into a canonical
 * string, or `null` when invalid. These tests encode the Requirement 2/3
 * acceptance criteria and the design's named properties:
 *   - Property 7: Parser idempotence (Req 3.6)
 *   - Property 8: Invalid input is rejected (Req 3.5, 15.1, 15.2)
 * plus canonicalization, `localhost`/IPv4/`:port` acceptance, and the
 * no-`www.`-stripping rule (Req 3.1–3.4, 3.7, 3.8).
 */

import fc from "fast-check";
import { parsePattern } from "@/shared/utils/scope";

// ───────────────────────────── Arbitraries ─────────────────────────────

/** Host forms spanning every accepted category (Req 2.1). */
const validHostArb = fc.constantFrom(
  "example.com",
  "sub.example.com",
  "a.b.c.example.com",
  "*.example.com",
  "*.ru",
  "*.co.uk",
  "localhost",
  "127.0.0.1",
  "10.0.0.1",
  "*"
);

/** Already-canonical optional components (lowercase, no leading zeros, not `:*`). */
const schemeArb = fc.constantFrom("", "http://", "https://", "*://");
const portArb = fc.constantFrom("", ":80", ":3000", ":8443", ":65535");
const pathArb = fc.constantFrom("", "/app/*", "/maps/here", "/v1.2/x", "/a-b_c/");

/** A pattern string that is already in canonical form (parse should be a no-op). */
const canonicalPatternArb: fc.Arbitrary<string> = fc
  .tuple(schemeArb, validHostArb, portArb, pathArb)
  .map(([scheme, host, port, path]) => scheme + host + port + path);

/** A broad mix of inputs (junk, URLs, and constructed patterns) for idempotence. */
const arbitraryInputArb: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.webUrl(),
  fc.domain(),
  canonicalPatternArb,
  canonicalPatternArb.map((p) => "  " + p.toUpperCase() + "  ")
);

/** URLPattern/regex group metacharacters that must invalidate a host (Req 2.6). */
const metacharArb = fc.constantFrom("(", ")", "{", "}", "+", "^", "$", "|", "\\", "[", "]");

// ─────────────────────── Property 7: idempotence (Req 3.6) ───────────────────────

describe("parsePattern — Property 7: idempotence", () => {
  test("re-parsing a canonical result yields the identical string", () => {
    fc.assert(
      fc.property(arbitraryInputArb, (input) => {
        const once = parsePattern(input);
        if (once === null) return; // invalid inputs are covered by Property 8
        expect(parsePattern(once)).toBe(once);
      }),
      { numRuns: 1000 }
    );
  });

  test("an already-canonical pattern parses to itself", () => {
    fc.assert(
      fc.property(canonicalPatternArb, (pattern) => {
        expect(parsePattern(pattern)).toBe(pattern);
      })
    );
  });
});

// ─────────────────── Property 8: invalid input is rejected ───────────────────

describe("parsePattern — Property 8: invalid input is rejected", () => {
  test("a host containing a group metacharacter is rejected", () => {
    fc.assert(
      fc.property(metacharArb, (meta) => {
        expect(parsePattern(`exa${meta}mple.com`)).toBeNull();
      })
    );
  });

  test("a `*` anywhere other than the whole host or a leading `*.` is rejected", () => {
    expect(parsePattern("ex*ample.com")).toBeNull();
    expect(parsePattern("*example.com")).toBeNull();
    expect(parsePattern("example.*")).toBeNull();
  });

  test("out-of-range or non-numeric ports are rejected", () => {
    fc.assert(
      fc.property(fc.integer({ min: 65536, max: 999999 }), (port) => {
        expect(parsePattern(`example.com:${port}`)).toBeNull();
      })
    );
    expect(parsePattern("example.com:abc")).toBeNull();
    expect(parsePattern("example.com:-1")).toBeNull();
    expect(parsePattern("example.com:")).toBeNull();
  });

  test("input longer than 2048 characters is rejected", () => {
    expect(parsePattern("a".repeat(2049) + ".com")).toBeNull();
  });

  test("malformed hosts, labels, and IPv4 literals are rejected", () => {
    for (const bad of [
      "",
      "   ",
      "com", // single-label bare host (not localhost)
      "-example.com", // leading hyphen
      "example-.com", // trailing hyphen
      "exa mple.com", // space
      "999.1.1.1", // IPv4 octet > 255
      "1.2.3", // not a 4-octet IPv4, all-numeric
      "a".repeat(64) + ".com", // label > 63
    ]) {
      expect(parsePattern(bad)).toBeNull();
    }
  });

  test("a path with a disallowed character (incl. `:`) is rejected", () => {
    expect(parsePattern("example.com/a(b)")).toBeNull();
    expect(parsePattern("example.com/a:b")).toBeNull();
    expect(parsePattern("example.com/a b")).toBeNull();
  });
});

// ──────── Canonicalization, localhost/IPv4/port acceptance, no www-strip ────────

describe("parsePattern — canonicalization (Req 3.1–3.4, 3.7, 3.8)", () => {
  const cases: Array<[string, string]> = [
    ["Example.com", "example.com"],
    ["  https://WWW.Example.COM/Path  ", "https://www.example.com/Path"], // no www strip, path case kept
    ["www.example.com", "www.example.com"], // Req 3.8: www is NOT stripped
    ["*.RU", "*.ru"],
    ["localhost", "localhost"],
    ["localhost:3000", "localhost:3000"],
    ["127.0.0.1:8080/api/*", "127.0.0.1:8080/api/*"],
    ["example.com:080", "example.com:80"], // leading-zero port normalized
    ["example.com:*", "example.com"], // `:*` (any port) collapses to no port
    ["example.com/", "example.com"], // bare "/" collapses to no path
    ["HTTP://Example.com", "http://example.com"], // scheme lowercased
    ["*://example.com", "*://example.com"], // `*` scheme kept (distinct from default)
    ["*", "*"],
    ["*.example.com", "*.example.com"],
  ];

  test.each(cases)("normalizes %j -> %j", (input, expected) => {
    expect(parsePattern(input)).toBe(expected);
  });
});

// ═══════════════════════ IDN Pattern Support (feature: idn-pattern-support) ═══════════════════════
//
// `parsePattern` accepts non-ASCII host labels (Internationalized Domain Names)
// and stores them in their Unicode form (NFC-normalized + locale-independent
// lowercase), NOT their Punycode (`xn--`) form — the `toASCII` conversion lives
// only in the compiler. These cover:
//   - Property IDN-1: IDN acceptance + Unicode storage (Req 1.2, 2.1, 2.2)
//   - Property IDN-2: idempotence over Unicode (Req 2.4)
//   - NFC + lowercase canonicalization (Req 2.2, 3.1)

/**
 * U-labels chosen to be already NFC + locale-independent-lowercase stable
 * (Latin-diacritic, CJK, Cyrillic, Greek), so a well-formed IDN host built from
 * them is its own canonical form. Verified stable in the design's analysis.
 */
const idnLabelArb = fc.constantFrom(
  "münchen",
  "café",
  "bücher",
  "köln",
  "españa",
  "smörgås",
  "日本",
  "例",
  "пример",
  "мир",
  "δοκιμή",
  "αβγ"
);

/** An IDN host `label.tld`, where the TLD may itself be an IDN (e.g. `.рф`). */
const idnHostArb: fc.Arbitrary<string> = fc
  .tuple(idnLabelArb, fc.constantFrom("de", "jp", "com", "org", "рф"))
  .map(([label, tld]) => `${label}.${tld}`);

describe("parsePattern — IDN acceptance and Unicode storage (Property IDN-1)", () => {
  test("a well-formed IDN host is accepted and stored in Unicode (never xn--)", () => {
    fc.assert(
      fc.property(idnHostArb, (host) => {
        const out = parsePattern(host);
        expect(out).not.toBeNull();
        // Already NFC + lowercase, so the canonical form is the input itself.
        expect(out).toBe(host);
        // Stored as Unicode, not Punycode — conversion happens only at compile time.
        expect(out).not.toContain("xn--");
      })
    );
  });

  test("the `*.`-prefixed IDN form is accepted and keeps the leading `*.`", () => {
    fc.assert(
      fc.property(idnHostArb, (host) => {
        expect(parsePattern(`*.${host}`)).toBe(`*.${host}`);
      })
    );
  });

  test("an IDN host with scheme/port/path is accepted", () => {
    fc.assert(
      fc.property(idnHostArb, (host) => {
        expect(parsePattern(`https://${host}:8443/App/*`)).toBe(`https://${host}:8443/App/*`);
      })
    );
  });
});

describe("parsePattern — idempotence over Unicode (Property IDN-2)", () => {
  const idnInputArb: fc.Arbitrary<string> = fc.oneof(
    idnHostArb,
    idnHostArb.map((h) => `*.${h}`),
    idnHostArb.map((h) => `HTTPS://${h.toUpperCase()}/Path/*`),
    idnHostArb.map((h) => `  ${h}:8443  `)
  );

  test("re-parsing an accepted IDN pattern yields the identical string", () => {
    fc.assert(
      fc.property(idnInputArb, (input) => {
        const once = parsePattern(input);
        if (once === null) return;
        expect(parsePattern(once)).toBe(once);
      }),
      { numRuns: 500 }
    );
  });
});

describe("parsePattern — IDN canonicalization (NFC + lowercase)", () => {
  const cases: Array<[string, string]> = [
    ["MÜNCHEN.de", "münchen.de"],
    ["ÜBER.example.com", "über.example.com"],
    ["*.РФ", "*.рф"], // Cyrillic uppercase TLD lowercased
    ["日本.JP", "日本.jp"], // CJK unchanged; ASCII TLD lowercased
    ["café.fr", "café.fr"], // already precomposed + lowercase
    ["ПРИМЕР.рф", "пример.рф"],
    // Decomposed input (a + combining grave U+0300) → precomposed à (U+00E0).
    ["exa\u0300mple.de", "ex\u00e0mple.de"],
    // NFD input normalized to NFC (e + U+0301 → é U+00E9).
    ["cafe\u0301.fr", "caf\u00e9.fr"],
  ];

  test.each(cases)("normalizes %j -> %j", (input, expected) => {
    expect(parsePattern(input)).toBe(expected);
  });

  test("an IDN pattern never yields a Punycode (xn--) canonical form", () => {
    expect(parsePattern("münchen.de")).toBe("münchen.de");
    expect(parsePattern("münchen.de")).not.toContain("xn--");
  });
});

// ─────────────── ASCII backward compatibility (Property IDN-7) ───────────────
//
// IDN support must not change the canonical form (or accept/reject decision) of
// any ASCII pattern. The NFC + lowercase host step is a no-op on ASCII, and the
// structural label rule still restricts ASCII to `[a-z0-9-]`. These pin
// representative pre-IDN outputs as a regression guard (Req 9.1).

describe("parsePattern — ASCII backward compatibility (Property IDN-7)", () => {
  const asciiCases: Array<[string, string | null]> = [
    ["Example.com", "example.com"],
    ["www.example.com", "www.example.com"],
    ["*.ru", "*.ru"],
    ["localhost:3000", "localhost:3000"],
    ["127.0.0.1:8080/api/*", "127.0.0.1:8080/api/*"],
    ["HTTPS://Shop.Example.com/Cart/*", "https://shop.example.com/Cart/*"],
    ["com", null], // bare single-label host
    ["foo_bar.com", null], // underscore is disallowed ASCII
    ["ex*ample.com", null], // mid-host wildcard
  ];

  test.each(asciiCases)("ASCII %j is unchanged -> %j", (input, expected) => {
    expect(parsePattern(input)).toBe(expected);
  });
});
