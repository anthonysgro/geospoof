/**
 * Property-Based Tests for the Domain_Normalizer (`normalizeDomain`)
 * Feature: site-scoping
 *
 * `normalizeDomain(input: string): string | null` lives in
 * `src/shared/utils/scope.ts` and is implemented in subtask 2.3. These tests
 * are authored ahead of that implementation (test-first) and encode the
 * Requirement 4 acceptance criteria plus the design's named correctness
 * properties:
 *   - Property 4: Normalization is idempotent (Req 4.1, 4.2, 4.3)
 *   - Property 5: Invalid domains are rejected (Req 4.4, 4.5, 4.6)
 */

import fc from "fast-check";
import { normalizeDomain } from "@/shared/utils/scope";

// ───────────────────────────── Arbitraries ─────────────────────────────

const LOWER_ALNUM = "abcdefghijklmnopqrstuvwxyz0123456789";

/** A character valid at the start or end of a DNS label (no hyphen). */
const labelEdgeCharArb = fc.constantFrom(...LOWER_ALNUM.split(""));

/** A character valid in the middle of a DNS label (hyphen allowed). */
const labelMidCharArb = fc.constantFrom(...(LOWER_ALNUM + "-").split(""));

/**
 * A valid DNS label: 1–63 characters of [a-z0-9-] that does not begin or end
 * with a hyphen.
 */
const validLabelArb: fc.Arbitrary<string> = fc.oneof(
  // Single-character label.
  labelEdgeCharArb,
  // Multi-character label: edge + up to 61 middle chars + edge (max 63).
  fc
    .tuple(labelEdgeCharArb, fc.array(labelMidCharArb, { maxLength: 61 }), labelEdgeCharArb)
    .map(([first, mid, last]) => first + mid.join("") + last)
);

/**
 * A valid, already-normalized domain: at least two labels (so it contains a
 * dot), every label valid, total length ≤ 253.
 */
const validDomainArb: fc.Arbitrary<string> = fc
  .array(validLabelArb, { minLength: 2, maxLength: 4 })
  .map((labels) => labels.join("."))
  .filter((domain) => domain.length <= 253);

/** A valid domain whose first label is not `www` (so a single `www.` strip is unambiguous). */
const canonicalDomainArb: fc.Arbitrary<string> = validDomainArb.filter(
  (domain) => !domain.startsWith("www.")
);

/**
 * A "messy" input paired with the canonical hostname it should normalize to.
 * Exercises scheme / single-`www.` / path / port / query / fragment stripping,
 * surrounding whitespace, and case folding (Req 4.1, 4.2).
 */
const messyEquivalentArb: fc.Arbitrary<{ input: string; expected: string }> = fc
  .record({
    domain: canonicalDomainArb,
    scheme: fc.constantFrom("", "http://", "https://", "HTTP://", "HTTPS://"),
    www: fc.constantFrom("", "www.", "WWW."),
    upperHost: fc.boolean(),
    leadPad: fc.constantFrom("", " ", "  ", "\t", "\n"),
    trailPad: fc.constantFrom("", " ", "  ", "\t", "\n"),
    port: fc.option(fc.integer({ min: 1, max: 65535 }), { nil: null }),
    path: fc.option(fc.string(), { nil: null }),
    query: fc.option(fc.string(), { nil: null }),
    fragment: fc.option(fc.string(), { nil: null }),
  })
  .map((parts) => {
    const host = parts.upperHost ? parts.domain.toUpperCase() : parts.domain;
    let s = parts.scheme + parts.www + host;
    // Each separator places the remaining junk strictly after the hostname, so
    // truncating at the first "/", ":", "?" or "#" always leaves the hostname.
    if (parts.port !== null) s += ":" + parts.port;
    if (parts.path !== null) s += "/" + parts.path;
    if (parts.query !== null) s += "?" + parts.query;
    if (parts.fragment !== null) s += "#" + parts.fragment;
    return { input: parts.leadPad + s + parts.trailPad, expected: parts.domain };
  });

/** A broad mix of inputs (valid, messy, URL-ish, and junk) used for idempotence. */
const arbitraryInputArb: fc.Arbitrary<string> = fc.oneof(
  fc.string(),
  fc.webUrl(),
  fc.domain(),
  validDomainArb,
  messyEquivalentArb.map((m) => m.input),
  // Multi-`www.` and mixed-case URLs stress canonicalization idempotence.
  validDomainArb.map((d) => "www.www." + d),
  validDomainArb.map((d) => "https://WWW." + d.toUpperCase() + ":8080/a/b?x=1#frag")
);

/** Wildcard / regex metacharacters that MUST cause rejection (Req 4.5). */
const metacharArb = fc.constantFrom(
  "*",
  "?",
  "+",
  "[",
  "]",
  "(",
  ")",
  "{",
  "}",
  "^",
  "$",
  "|",
  "\\"
);

/**
 * Characters that are not permitted in DNS hostnames and are neither URL
 * separators nor regex metacharacters (so the only reason for rejection is the
 * disallowed character itself).
 */
const disallowedDnsCharArb = fc.constantFrom("_", "~", "!", ",", ";", "=", "&", "'", " ");

// ─────────────────────── Property 4: idempotence ───────────────────────

describe("normalizeDomain — Property 4: normalization is idempotent", () => {
  /**
   * **Validates: Requirements 4.1, 4.2, 4.3**
   *
   * For any input `x` where `normalizeDomain(x)` is non-null (= `y`),
   * `normalizeDomain(y)` SHALL equal `y`.
   */
  it("re-normalizing a non-null result yields the same value", () => {
    fc.assert(
      fc.property(arbitraryInputArb, (input) => {
        const y = normalizeDomain(input);
        if (y !== null) {
          expect(normalizeDomain(y)).toBe(y);
        }
      }),
      { numRuns: 500 }
    );
  });

  /**
   * **Validates: Requirements 4.3**
   *
   * An already-canonical valid domain is returned unchanged (and therefore
   * non-null), which is the base case of idempotence.
   */
  it("returns canonical valid domains unchanged", () => {
    fc.assert(
      fc.property(canonicalDomainArb, (domain) => {
        expect(normalizeDomain(domain)).toBe(domain);
      }),
      { numRuns: 300 }
    );
  });
});

// ─────────────── Canonicalization / stripping (Req 4.1, 4.2) ───────────────

describe("normalizeDomain — canonicalization (Requirements 4.1, 4.2)", () => {
  /**
   * **Validates: Requirements 4.1, 4.2**
   *
   * Trimming, lowercasing, scheme removal, single leading `www.` removal, and
   * path/port/query/fragment stripping all reduce the messy input to the bare
   * hostname.
   */
  it("strips scheme/www/path/port/query/fragment down to the bare hostname", () => {
    fc.assert(
      fc.property(messyEquivalentArb, ({ input, expected }) => {
        expect(normalizeDomain(input)).toBe(expected);
      }),
      { numRuns: 500 }
    );
  });

  it("normalizes the documented canonical example", () => {
    expect(normalizeDomain("https://www.Example.com:8443/x?q=1#h")).toBe("example.com");
  });

  it("handles individual stripping rules", () => {
    expect(normalizeDomain("HTTP://EXAMPLE.COM")).toBe("example.com");
    expect(normalizeDomain("https://example.com")).toBe("example.com");
    expect(normalizeDomain("www.example.com")).toBe("example.com");
    expect(normalizeDomain("  example.com  ")).toBe("example.com");
    expect(normalizeDomain("example.com/some/path")).toBe("example.com");
    expect(normalizeDomain("example.com:8080")).toBe("example.com");
    expect(normalizeDomain("example.com?q=1")).toBe("example.com");
    expect(normalizeDomain("example.com#frag")).toBe("example.com");
    // Only a single leading `www.` is stripped; deeper subdomains are preserved.
    expect(normalizeDomain("sub.example.com")).toBe("sub.example.com");
    expect(normalizeDomain("api.v2.example.com")).toBe("api.v2.example.com");
  });
});

// ──────────────── Property 5: invalid domains are rejected ────────────────

describe("normalizeDomain — Property 5: invalid domains are rejected", () => {
  /** **Validates: Requirements 4.4** */
  it("rejects empty and whitespace-only input", () => {
    expect(normalizeDomain("")).toBeNull();
    expect(normalizeDomain("   ")).toBeNull();
    expect(normalizeDomain("\t\n")).toBeNull();
  });

  /** **Validates: Requirements 4.4** */
  it("rejects single-label hostnames with no dot", () => {
    fc.assert(
      fc.property(validLabelArb, (label) => {
        expect(normalizeDomain(label)).toBeNull();
      }),
      { numRuns: 300 }
    );
  });

  /** **Validates: Requirements 4.6** */
  it("rejects input longer than 2048 characters (before trimming)", () => {
    fc.assert(
      fc.property(validDomainArb, fc.integer({ min: 2049, max: 3000 }), (domain, padLen) => {
        const input = domain + " ".repeat(padLen);
        expect(input.length).toBeGreaterThan(2048);
        expect(normalizeDomain(input)).toBeNull();
      }),
      { numRuns: 100 }
    );
  });

  /** **Validates: Requirements 4.4** */
  it("rejects normalized results longer than 253 characters", () => {
    fc.assert(
      fc.property(fc.integer({ min: 5, max: 8 }), (labelCount) => {
        const label = "a".repeat(63);
        const domain = Array.from({ length: labelCount }, () => label).join(".");
        expect(domain.length).toBeGreaterThan(253);
        expect(domain.length).toBeLessThanOrEqual(2048);
        expect(normalizeDomain(domain)).toBeNull();
      }),
      { numRuns: 4 }
    );
  });

  /** **Validates: Requirements 4.4** */
  it("rejects empty labels (leading, trailing, and interior dots)", () => {
    fc.assert(
      fc.property(
        validDomainArb,
        fc.constantFrom("leading", "trailing", "double"),
        (domain, kind) => {
          let input: string;
          if (kind === "leading") input = "." + domain;
          else if (kind === "trailing") input = domain + ".";
          else input = domain.replace(".", ".."); // first dot doubled → empty interior label
          expect(normalizeDomain(input)).toBeNull();
        }
      ),
      { numRuns: 300 }
    );
  });

  /** **Validates: Requirements 4.4** */
  it("rejects labels longer than 63 characters", () => {
    fc.assert(
      fc.property(fc.integer({ min: 64, max: 200 }), validLabelArb, (len, tld) => {
        const longLabel = "a".repeat(len);
        expect(normalizeDomain(longLabel + "." + tld)).toBeNull();
      }),
      { numRuns: 200 }
    );
  });

  /** **Validates: Requirements 4.4** */
  it("rejects labels that begin or end with a hyphen", () => {
    fc.assert(
      fc.property(validDomainArb, fc.constantFrom("leading", "trailing"), (domain, kind) => {
        const input = kind === "leading" ? "-" + domain : domain + "-";
        expect(normalizeDomain(input)).toBeNull();
      }),
      { numRuns: 300 }
    );
  });

  /** **Validates: Requirements 4.4** */
  it("rejects characters not permitted in DNS hostnames", () => {
    fc.assert(
      fc.property(validDomainArb, disallowedDnsCharArb, (domain, ch) => {
        const input = "ab" + ch + "cd." + domain;
        expect(normalizeDomain(input)).toBeNull();
      }),
      { numRuns: 300 }
    );
  });

  /** **Validates: Requirements 4.5** */
  it("rejects wildcard and regex metacharacters", () => {
    fc.assert(
      fc.property(validDomainArb, metacharArb, (domain, meta) => {
        expect(normalizeDomain(meta + domain)).toBeNull();
        expect(normalizeDomain("ab" + meta + "cd." + domain)).toBeNull();
      }),
      { numRuns: 300 }
    );
  });

  /** **Validates: Requirements 4.5** */
  it("rejects common wildcard syntax", () => {
    expect(normalizeDomain("*.example.com")).toBeNull();
    expect(normalizeDomain("example.*")).toBeNull();
    expect(normalizeDomain("*example.com")).toBeNull();
  });
});
