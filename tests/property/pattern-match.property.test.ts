/**
 * Property-Based Tests for the Pattern_Matcher (`matchesPatternList`)
 * Feature: advanced-filtering
 *
 * `matchesPatternList(url, patterns)` lives in `src/shared/utils/scope.ts` and
 * supersedes `matchesDomainList`, matching a full URL against a list of
 * canonical Patterns via compiled `URLPattern`s. These tests encode the
 * design's named properties:
 *   - Property 1: Bare-host apex + subdomain inclusion (Req 4.2)
 *   - Property 2: `*.` excludes the apex (Req 4.3)
 *   - Property 3: Scheme defaulting (Req 2.3, 4.7)
 *   - Property 4: Port specificity / defaulting (Req 2.4, 4.5)
 *   - Property 5: Path prefix semantics (Req 2.5, 4.6)
 *   - Property 6: Query/fragment are never constrained (Req 2.7, 8.5)
 * plus the empty-input rule (Req 4.8).
 */

import fc from "fast-check";
import { parsePattern, matchesPatternList, __resetPatternCacheForTest } from "@/shared/utils/scope";

beforeEach(() => {
  __resetPatternCacheForTest();
});

// ───────────────────────────── Arbitraries ─────────────────────────────

const LOWER_ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";
const labelEdgeArb = fc.constantFrom(...LOWER_ALNUM.split(""));
const labelMidArb = fc.constantFrom(...(LOWER_ALNUM + "-").split(""));

/** A valid DNS label: [a-z0-9-], 1–13 chars, no leading/trailing hyphen. */
const validLabelArb: fc.Arbitrary<string> = fc.oneof(
  labelEdgeArb,
  fc
    .tuple(labelEdgeArb, fc.array(labelMidArb, { maxLength: 11 }), labelEdgeArb)
    .map(([a, m, z]) => a + m.join("") + z)
);

/**
 * A TLD-like final label: 2–6 letters. The final label must not be all-numeric,
 * otherwise the WHATWG URL parser treats the host as an IPv4 attempt and
 * `new URL()` throws (e.g. `https://a.2/` is not a valid URL).
 */
const tldArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(..."abcdefghijklmnopqrstuvwxyz".split("")), { minLength: 2, maxLength: 6 })
  .map((cs) => cs.join(""));

/** A valid bare-host domain: 1–2 leading labels + an alphabetic TLD. */
const validDomainArb: fc.Arbitrary<string> = fc
  .tuple(fc.array(validLabelArb, { minLength: 1, maxLength: 2 }), tldArb)
  .map(([labels, tld]) => [...labels, tld].join("."))
  .filter((d) => d.length <= 253 && parsePattern(d) !== null);

/** A non-empty subdomain prefix (one or two labels). */
const subLabelsArb: fc.Arbitrary<string> = fc
  .array(validLabelArb, { minLength: 1, maxLength: 2 })
  .map((labels) => labels.join("."));

/** A short path segment of [a-z0-9]. */
const segArb: fc.Arbitrary<string> = fc
  .array(fc.constantFrom(...LOWER_ALNUM.split("")), { minLength: 1, maxLength: 6 })
  .map((cs) => cs.join(""));

// ───────────── Property 1: bare host = apex + subdomains (Req 4.2) ─────────────

describe("matchesPatternList — Property 1: bare host matches apex and subdomains", () => {
  test("apex matches", () => {
    fc.assert(
      fc.property(validDomainArb, (d) => {
        expect(matchesPatternList(`https://${d}/`, [d])).toBe(true);
      })
    );
  });

  test("subdomains match", () => {
    fc.assert(
      fc.property(validDomainArb, subLabelsArb, (d, s) => {
        expect(matchesPatternList(`https://${s}.${d}/`, [d])).toBe(true);
      })
    );
  });

  test("an unrelated host that merely ends with the same text does not match", () => {
    fc.assert(
      fc.property(validDomainArb, (d) => {
        // `notX.com` must not match `X.com` (dot-preceded suffix, not substring).
        expect(matchesPatternList(`https://not${d}/`, [d])).toBe(false);
      })
    );
  });
});

// ───────────── Property 2: `*.` excludes the apex (Req 4.3) ─────────────

describe("matchesPatternList — Property 2: `*.host` excludes the apex", () => {
  test("apex does not match", () => {
    fc.assert(
      fc.property(validDomainArb, (d) => {
        expect(matchesPatternList(`https://${d}/`, [`*.${d}`])).toBe(false);
      })
    );
  });

  test("subdomains match", () => {
    fc.assert(
      fc.property(validDomainArb, subLabelsArb, (d, s) => {
        expect(matchesPatternList(`https://${s}.${d}/`, [`*.${d}`])).toBe(true);
      })
    );
  });
});

// ───────────── Property 3: scheme defaulting (Req 2.3, 4.7) ─────────────

describe("matchesPatternList — Property 3: scheme defaulting", () => {
  test("http and https behave identically for a scheme-less pattern; others do not match", () => {
    fc.assert(
      fc.property(validDomainArb, (d) => {
        const overHttp = matchesPatternList(`http://${d}/`, [d]);
        const overHttps = matchesPatternList(`https://${d}/`, [d]);
        expect(overHttp).toBe(true);
        expect(overHttps).toBe(overHttp);
        expect(matchesPatternList(`ftp://${d}/`, [d])).toBe(false);
      })
    );
  });
});

// ───────────── Property 4: port specificity / defaulting (Req 2.4, 4.5) ─────────────

describe("matchesPatternList — Property 4: port semantics", () => {
  test("a specified port matches only that port", () => {
    fc.assert(
      fc.property(
        validDomainArb,
        fc
          .tuple(fc.integer({ min: 1, max: 65535 }), fc.integer({ min: 1, max: 65535 }))
          .filter(([a, b]) => a !== b),
        (d, [port, otherPort]) => {
          const pattern = `${d}:${port}`;
          expect(matchesPatternList(`http://${d}:${port}/`, [pattern])).toBe(true);
          expect(matchesPatternList(`http://${d}:${otherPort}/`, [pattern])).toBe(false);
        }
      )
    );
  });

  test("a port-less pattern matches any port", () => {
    fc.assert(
      fc.property(validDomainArb, fc.integer({ min: 1, max: 65535 }), (d, port) => {
        expect(matchesPatternList(`http://${d}:${port}/`, [d])).toBe(true);
      })
    );
  });
});

// ───────────── Property 5: path prefix semantics (Req 2.5, 4.6) ─────────────

describe("matchesPatternList — Property 5: path prefix", () => {
  test("`/seg/*` matches `/seg/` and below, not a different path", () => {
    fc.assert(
      fc.property(validDomainArb, segArb, (d, seg) => {
        const pattern = `${d}/${seg}/*`;
        expect(matchesPatternList(`https://${d}/${seg}/x`, [pattern])).toBe(true);
        expect(matchesPatternList(`https://${d}/${seg}/`, [pattern])).toBe(true);
        // `__none__` contains underscores, so it can never equal a [a-z0-9] segment.
        expect(matchesPatternList(`https://${d}/__none__`, [pattern])).toBe(false);
      })
    );
  });

  test("a path-less pattern matches any path", () => {
    fc.assert(
      fc.property(validDomainArb, segArb, (d, seg) => {
        expect(matchesPatternList(`https://${d}/${seg}/deep/here`, [d])).toBe(true);
      })
    );
  });
});

// ───────────── Property 6: query/fragment never constrained (Req 2.7, 8.5) ─────────────

describe("matchesPatternList — Property 6: query/fragment invariance", () => {
  test("appending a query or fragment to a matching URL still matches", () => {
    fc.assert(
      fc.property(validDomainArb, segArb, (d, seg) => {
        const base = `https://${d}/${seg}`;
        expect(matchesPatternList(base, [d])).toBe(true);
        expect(matchesPatternList(`${base}?a=1&b=2`, [d])).toBe(true);
        expect(matchesPatternList(`${base}#frag`, [d])).toBe(true);
        expect(matchesPatternList(`${base}?a=1#frag`, [d])).toBe(true);
      })
    );
  });
});

// ───────────── Empty inputs (Req 4.8) ─────────────

describe("matchesPatternList — empty inputs", () => {
  test("empty URL or empty list returns false", () => {
    expect(matchesPatternList("", ["example.com"])).toBe(false);
    expect(matchesPatternList("https://example.com/", [])).toBe(false);
  });

  test("a Pattern that fails to compile never matches (cached as a non-match)", () => {
    // matchesPatternList compiles whatever it is given; a bogus, non-canonical
    // entry that yields no valid URLPattern must simply not match, not throw.
    expect(matchesPatternList("https://example.com/", ["("])).toBe(false);
  });
});

// ═══════════════════════ IDN Pattern Support (feature: idn-pattern-support) ═══════════════════════
//
//   - Property IDN-3: IDN match equivalence to Punycode (Req 4.1, 4.2, 4.5, 9.4)
//
// A Pattern is stored in Unicode, but a page's host arrives already in A-label
// (Punycode) form (that is what `tab.url` / `new URL().hostname` yields). A
// stored Unicode Pattern must therefore match the Punycode URL exactly as an
// ASCII Pattern matches its own host, for both the apex and subdomains, with the
// `*.` form excluding the apex.

/** Canonical IDN hosts (NFC + lowercase), spanning Latin/CJK/Cyrillic scripts. */
const idnHostArb = fc.constantFrom("münchen.de", "café.fr", "日本.jp", "пример.рф", "köln.example");

/** The A-label (Punycode) host a browser puts in a page URL, via the URL parser. */
const toPunycodeHost = (unicodeHost: string): string => new URL(`https://${unicodeHost}/`).hostname;

describe("matchesPatternList — Property IDN-3: IDN matches its Punycode host", () => {
  test("a bare IDN pattern matches the apex (Punycode and Unicode URL forms)", () => {
    fc.assert(
      fc.property(idnHostArb, (h) => {
        expect(matchesPatternList(`https://${toPunycodeHost(h)}/`, [h])).toBe(true);
        expect(matchesPatternList(`https://${h}/`, [h])).toBe(true);
      })
    );
  });

  test("a bare IDN pattern matches subdomains of the Punycode host", () => {
    fc.assert(
      fc.property(idnHostArb, subLabelsArb, (h, s) => {
        expect(matchesPatternList(`https://${s}.${toPunycodeHost(h)}/`, [h])).toBe(true);
      })
    );
  });

  test("the `*.`-prefixed IDN form matches subdomains but not the apex", () => {
    fc.assert(
      fc.property(idnHostArb, subLabelsArb, (h, s) => {
        const punycodeHost = toPunycodeHost(h);
        expect(matchesPatternList(`https://${punycodeHost}/`, [`*.${h}`])).toBe(false);
        expect(matchesPatternList(`https://${s}.${punycodeHost}/`, [`*.${h}`])).toBe(true);
      })
    );
  });

  test("an IDN pattern does not match an unrelated host", () => {
    fc.assert(
      fc.property(idnHostArb, (h) => {
        expect(matchesPatternList("https://example.com/", [h])).toBe(false);
      })
    );
  });
});
