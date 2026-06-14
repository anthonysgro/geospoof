/**
 * Property-Based Tests for the Domain_Matcher (`matchesDomainList`)
 * Feature: site-scoping
 *
 * `matchesDomainList(hostname: string, list: string[]): boolean` lives in
 * `src/shared/utils/scope.ts` and is implemented in subtask 2.3. These tests
 * are authored ahead of that implementation (test-first) and encode the
 * Requirement 5 acceptance criteria plus the design's §2 matchesDomainList
 * description: a pure, case-insensitive ASCII, exact-or-dot-preceded-suffix
 * literal matcher with no wildcard/regex interpretation.
 */

import fc from "fast-check";
import { matchesDomainList } from "@/shared/utils/scope";

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

/**
 * Randomly recase each character of a string. Used to confirm matching is
 * case-insensitive for both the hostname and the listed entries.
 */
const recasedArb = (source: fc.Arbitrary<string>): fc.Arbitrary<string> =>
  source.chain((value) =>
    fc.array(fc.boolean(), { minLength: value.length, maxLength: value.length }).map((upperFlags) =>
      value
        .split("")
        .map((ch, i) => (upperFlags[i] ? ch.toUpperCase() : ch.toLowerCase()))
        .join("")
    )
  );

/** Wildcard / regex metacharacters that must never gain special meaning. */
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
  "\\",
  "."
);

// ───────────────── Property 6 (Req 5.1): purity / determinism ─────────────────

describe("matchesDomainList — purity (Requirement 5.1)", () => {
  /**
   * **Validates: Requirements 5.1**
   *
   * For the same hostname and the same list, the matcher returns the same
   * boolean. Expressed by calling twice and asserting equality (the function
   * reads/modifies no external state).
   */
  it("returns the same result for the same inputs (referential transparency)", () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.array(fc.oneof(validDomainArb, fc.string()), { maxLength: 6 }),
        (hostname, list) => {
          const first = matchesDomainList(hostname, list);
          const second = matchesDomainList(hostname, list);
          expect(second).toBe(first);
        }
      ),
      { numRuns: 500 }
    );
  });

  /**
   * **Validates: Requirements 5.1**
   *
   * The matcher does not mutate the list it is given.
   */
  it("does not mutate the supplied list", () => {
    fc.assert(
      fc.property(fc.string(), fc.array(validDomainArb, { maxLength: 6 }), (hostname, list) => {
        const snapshot = [...list];
        matchesDomainList(hostname, list);
        expect(list).toEqual(snapshot);
      }),
      { numRuns: 300 }
    );
  });
});

// ───────────────── Exact + case-insensitive match (Req 5.2) ─────────────────

describe("matchesDomainList — exact case-insensitive match (Requirement 5.2)", () => {
  /**
   * **Validates: Requirements 5.2**
   *
   * A hostname that equals a listed entry matches.
   */
  it("matches a hostname equal to a listed entry", () => {
    fc.assert(
      fc.property(validDomainArb, (domain) => {
        expect(matchesDomainList(domain, [domain])).toBe(true);
      }),
      { numRuns: 300 }
    );
  });

  /**
   * **Validates: Requirements 5.2**
   *
   * Mixed-case variants of the hostname and/or the entry still match, because
   * comparison is case-insensitive ASCII.
   */
  it("matches regardless of case of the hostname or the entry", () => {
    fc.assert(
      fc.property(validDomainArb, recasedArb(validDomainArb), (domain, _ignore) => {
        const host = domain.toUpperCase();
        const entry = domain.toLowerCase();
        expect(matchesDomainList(host, [entry])).toBe(true);
        expect(matchesDomainList(entry, [host])).toBe(true);
      }),
      { numRuns: 300 }
    );
  });

  it("matches the documented case-insensitive example", () => {
    expect(matchesDomainList("Example.COM", ["example.com"])).toBe(true);
    expect(matchesDomainList("example.com", ["EXAMPLE.COM"])).toBe(true);
  });
});

// ──────────────── Subdomain inclusion (dot-preceded suffix, Req 5.3) ────────────────

describe("matchesDomainList — subdomain inclusion (Requirement 5.3)", () => {
  /**
   * **Validates: Requirements 5.3**
   *
   * For any subdomain label `s` and valid domain `d`,
   * `matchesDomainList(s + "." + d, [d])` is `true`.
   */
  it("matches any subdomain of a listed entry", () => {
    fc.assert(
      fc.property(validLabelArb, validDomainArb, (sub, domain) => {
        const hostname = sub + "." + domain;
        expect(matchesDomainList(hostname, [domain])).toBe(true);
      }),
      { numRuns: 500 }
    );
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * Multi-level subdomains also match the listed parent.
   */
  it("matches deep (multi-level) subdomains of a listed entry", () => {
    fc.assert(
      fc.property(validLabelArb, validLabelArb, validDomainArb, (a, b, domain) => {
        const hostname = a + "." + b + "." + domain;
        expect(matchesDomainList(hostname, [domain])).toBe(true);
      }),
      { numRuns: 300 }
    );
  });

  /**
   * **Validates: Requirements 5.3**
   *
   * Subdomain inclusion is also case-insensitive.
   */
  it("matches subdomains case-insensitively", () => {
    expect(matchesDomainList("App.Example.com", ["example.com"])).toBe(true);
    expect(matchesDomainList("app.example.com", ["Example.COM"])).toBe(true);
  });
});

// ──────────────── No false suffix match (Req 5.6) ────────────────

describe("matchesDomainList — no false suffix match (Requirement 5.6)", () => {
  /**
   * **Validates: Requirements 5.6**
   *
   * A hostname that ends with the entry text but is NOT dot-preceded does not
   * match (e.g. `notexample.com` against `example.com`).
   */
  it("does not match a non-dot-preceded suffix", () => {
    expect(matchesDomainList("notexample.com", ["example.com"])).toBe(false);
  });

  /**
   * **Validates: Requirements 5.6**
   *
   * Prefixing the listed entry with an extra label character (no dot) never
   * matches.
   */
  it("does not match when an extra label character precedes the entry without a dot", () => {
    fc.assert(
      fc.property(validLabelArb, validDomainArb, (prefix, domain) => {
        // `prefix + domain` ends with `domain` but the boundary is not a dot.
        const hostname = prefix + domain;
        expect(matchesDomainList(hostname, [domain])).toBe(false);
      }),
      { numRuns: 300 }
    );
  });
});

// ──────────────── No match otherwise (Req 5.4) ────────────────

describe("matchesDomainList — no match when neither equal nor dot-suffix (Requirement 5.4)", () => {
  /**
   * **Validates: Requirements 5.4**
   *
   * When no entry equals the hostname and no entry is a dot-preceded suffix of
   * the hostname, the matcher returns `false`. Built by appending an extra,
   * distinct label so the hostname is strictly longer and the entry is NOT a
   * suffix of it.
   */
  it("returns false when no entry is equal to or a dot-preceded suffix of the hostname", () => {
    fc.assert(
      fc.property(validDomainArb, validLabelArb, (domain, extra) => {
        // `domain` shares no suffix relationship with `extra + "." + domain2`.
        // Construct a hostname whose suffix is a different domain.
        const hostname = "host." + extra + "." + "different-" + domain;
        const entry = domain; // not equal to, and not a dot-suffix of, hostname
        // Guard: ensure the entry truly is not a dot-preceded suffix.
        fc.pre(!("." + hostname).endsWith("." + entry));
        expect(matchesDomainList(hostname, [entry])).toBe(false);
      }),
      { numRuns: 300 }
    );
  });

  it("returns false for a clearly unrelated entry", () => {
    expect(matchesDomainList("foo.org", ["example.com"])).toBe(false);
    expect(matchesDomainList("example.com", ["example.org"])).toBe(false);
  });
});

// ──────────────── Empty list / empty hostname (Req 5.5, 5.8) ────────────────

describe("matchesDomainList — empty list and empty hostname (Requirements 5.5, 5.8)", () => {
  /**
   * **Validates: Requirements 5.5**
   *
   * An empty list never matches any hostname.
   */
  it("returns false for any hostname against an empty list", () => {
    fc.assert(
      fc.property(fc.oneof(validDomainArb, fc.string()), (hostname) => {
        expect(matchesDomainList(hostname, [])).toBe(false);
      }),
      { numRuns: 300 }
    );
  });

  /**
   * **Validates: Requirements 5.8**
   *
   * An empty hostname never matches, regardless of list contents.
   */
  it("returns false for an empty hostname against any list", () => {
    fc.assert(
      fc.property(fc.array(validDomainArb, { maxLength: 6 }), (list) => {
        expect(matchesDomainList("", list)).toBe(false);
      }),
      { numRuns: 300 }
    );
  });
});

// ──────────────── Literal-only matching (Req 5.7) ────────────────

describe("matchesDomainList — literal-only matching (Requirement 5.7)", () => {
  /**
   * **Validates: Requirements 5.7**
   *
   * An entry containing a wildcard/regex metacharacter is treated literally.
   * A hostname that would match it only under wildcard/regex semantics (but is
   * not literally equal nor a dot-preceded suffix) must NOT match.
   */
  it("does not interpret a wildcard entry as matching arbitrary subdomains", () => {
    fc.assert(
      fc.property(validLabelArb, validDomainArb, (sub, domain) => {
        const hostname = sub + "." + domain;
        // `*.domain` is a common wildcard syntax; literally it is not equal to
        // nor a dot-preceded suffix of `sub.domain`, so it must not match.
        expect(matchesDomainList(hostname, ["*." + domain])).toBe(false);
      }),
      { numRuns: 300 }
    );
  });

  /**
   * **Validates: Requirements 5.7**
   *
   * Regex metacharacters in an entry are never given regex meaning: a hostname
   * that would only match under regex semantics does not match.
   */
  it("does not interpret regex metacharacters in an entry", () => {
    fc.assert(
      fc.property(validDomainArb, metacharArb, (domain, meta) => {
        // e.g. "exampl.+.com" would match "example.com" as a regex but must
        // not match literally. Insert the metachar inside the domain text.
        const entry = "a" + meta + domain;
        const hostname = "ax" + domain; // a plausible regex match, not a literal one
        // Only assert when the entry is genuinely not a literal match.
        if (hostname !== entry && !("." + hostname).endsWith("." + entry)) {
          expect(matchesDomainList(hostname, [entry])).toBe(false);
        }
      }),
      { numRuns: 300 }
    );
  });

  it("matches a literal entry only by exact or dot-preceded-suffix, never wildcard", () => {
    expect(matchesDomainList("a.example.com", ["*.example.com"])).toBe(false);
    expect(matchesDomainList("example.com", ["example.*"])).toBe(false);
    expect(matchesDomainList("anything.com", [".*"])).toBe(false);
  });
});
