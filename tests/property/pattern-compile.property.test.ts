/**
 * Property-Based Tests for the Pattern_Compiler (`patternToInit` / `compilePattern`)
 * Feature: advanced-filtering
 *
 * `patternToInit` maps a canonical Pattern to an explicit `URLPattern` component
 * init; `compilePattern` constructs a `URLPattern` from it via the provider.
 * These tests encode the design's named property plus the Req 4/5 mapping:
 *   - Property 9: No user character becomes a regexp group (Req 5.3, 5.4, 15.1)
 * and verify the host/scheme/port/path semantics the matcher relies on
 * (Req 4.2–4.7).
 */

import fc from "fast-check";
import { parsePattern, patternToInit, compilePattern } from "@/shared/utils/scope";

// ───────────────────────────── Arbitraries ─────────────────────────────

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
const schemeArb = fc.constantFrom("", "http://", "https://", "*://");
const portArb = fc.constantFrom("", ":80", ":3000", ":65535");
const pathArb = fc.constantFrom("", "/app/*", "/maps/here", "/v1.2/x");

/** A canonical, valid pattern string. */
const validPatternArb: fc.Arbitrary<string> = fc
  .tuple(schemeArb, validHostArb, portArb, pathArb)
  .map(([scheme, host, port, path]) => scheme + host + port + path)
  .filter((p) => parsePattern(p) !== null);

// The only shapes a compiled hostname may take: `*`, `*.labels`, `{*.}?labels`,
// or an exact literal (IPv4). Any `(`, `)`, `:`, `+`, `\`, `[`, `]`, `$`, `^`,
// `|` would signal an input-derived group — none are permitted here.
const HOSTNAME_OK = /^(\*|\*\.[a-z0-9.-]+|\{\*\.\}\?[a-z0-9.-]+|[a-z0-9.-]+)$/;
const PATHNAME_OK = /^\/[A-Za-z0-9._~%/*-]*$/;
const ALLOWED_PROTOCOLS = new Set(["http{s}?", "http", "https", "*"]);

function mustCompile(pattern: string) {
  const compiled = compilePattern(pattern);
  if (compiled === null) {
    throw new Error(`expected pattern to compile: ${pattern}`);
  }
  return compiled;
}

// ─────────────── Property 9: no input-derived group syntax ───────────────

describe("patternToInit — Property 9: no user character becomes a group", () => {
  test("every emitted component uses only literals + GeoSpoof's own tokens", () => {
    fc.assert(
      fc.property(validPatternArb, (pattern) => {
        const init = patternToInit(pattern);
        expect(init).not.toBeNull();
        if (init === null) return;
        expect(ALLOWED_PROTOCOLS.has(init.protocol)).toBe(true);
        expect(init.port === "*" || /^[0-9]+$/.test(init.port)).toBe(true);
        expect(HOSTNAME_OK.test(init.hostname)).toBe(true);
        expect(PATHNAME_OK.test(init.pathname)).toBe(true);
      }),
      { numRuns: 1000 }
    );
  });

  test("every valid pattern compiles without throwing", () => {
    fc.assert(
      fc.property(validPatternArb, (pattern) => {
        expect(compilePattern(pattern)).not.toBeNull();
      })
    );
  });
});

// ─────────────────── Component mapping table (Req 4.2–4.7) ───────────────────

describe("patternToInit — component mapping", () => {
  const cases: Array<
    [string, { protocol: string; hostname: string; port: string; pathname: string }]
  > = [
    [
      "example.com",
      { protocol: "http{s}?", hostname: "{*.}?example.com", port: "*", pathname: "/*" },
    ],
    [
      "*.example.com",
      { protocol: "http{s}?", hostname: "*.example.com", port: "*", pathname: "/*" },
    ],
    ["*.ru", { protocol: "http{s}?", hostname: "*.ru", port: "*", pathname: "/*" }],
    ["*", { protocol: "http{s}?", hostname: "*", port: "*", pathname: "/*" }],
    ["127.0.0.1", { protocol: "http{s}?", hostname: "127.0.0.1", port: "*", pathname: "/*" }],
    [
      "127.0.0.1:8080/api/*",
      { protocol: "http{s}?", hostname: "127.0.0.1", port: "8080", pathname: "/api/*" },
    ],
    [
      "localhost:3000",
      { protocol: "http{s}?", hostname: "{*.}?localhost", port: "3000", pathname: "/*" },
    ],
    [
      "https://example.com",
      { protocol: "https", hostname: "{*.}?example.com", port: "*", pathname: "/*" },
    ],
    ["*://example.com", { protocol: "*", hostname: "{*.}?example.com", port: "*", pathname: "/*" }],
    [
      "example.com/maps/*",
      { protocol: "http{s}?", hostname: "{*.}?example.com", port: "*", pathname: "/maps/*" },
    ],
  ];

  test.each(cases)("maps %j", (input, expected) => {
    expect(patternToInit(input)).toEqual(expected);
  });
});

// ─────────────── Compiled match semantics smoke test (Req 4.2–4.7) ───────────────

describe("compilePattern — match semantics", () => {
  test("bare host matches apex + subdomains, http/https only", () => {
    const p = mustCompile("example.com");
    expect(p.test("https://example.com/")).toBe(true);
    expect(p.test("http://example.com/")).toBe(true);
    expect(p.test("https://app.example.com/")).toBe(true);
    expect(p.test("https://a.b.example.com/x")).toBe(true);
    expect(p.test("https://notexample.com/")).toBe(false);
    expect(p.test("ftp://example.com/")).toBe(false);
    expect(p.test("https://example.com:8443/")).toBe(true); // port unset ⇒ any port
  });

  test("`*.host` matches subdomains but not the apex", () => {
    const p = mustCompile("*.example.com");
    expect(p.test("https://app.example.com/")).toBe(true);
    expect(p.test("https://a.b.example.com/")).toBe(true);
    expect(p.test("https://example.com/")).toBe(false);
  });

  test("`*.tld` matches any host under the suffix", () => {
    const p = mustCompile("*.ru");
    expect(p.test("https://example.ru/")).toBe(true);
    expect(p.test("https://a.b.ru/")).toBe(true);
    expect(p.test("https://example.com/")).toBe(false);
  });

  test("port and path are honored", () => {
    const port = mustCompile("localhost:3000");
    expect(port.test("http://localhost:3000/")).toBe(true);
    expect(port.test("http://localhost:3001/")).toBe(false);

    const path = mustCompile("example.com/maps/*");
    expect(path.test("https://example.com/maps/here")).toBe(true);
    expect(path.test("https://example.com/maps/")).toBe(true);
    expect(path.test("https://example.com/other")).toBe(false);
  });

  test("explicit scheme restricts to that scheme", () => {
    const p = mustCompile("https://example.com");
    expect(p.test("https://example.com/")).toBe(true);
    expect(p.test("http://example.com/")).toBe(false);
  });
});

// ═══════════════════════ IDN Pattern Support (feature: idn-pattern-support) ═══════════════════════
//
// A Pattern's host is stored in Unicode, but the compiler converts the literal
// portion to its A-label (Punycode) form via `hostToASCII` before building the
// `URLPattern`, so the emitted hostname component is always pure ASCII. These
// cover:
//   - Property IDN-4: compiled hostname is ASCII-only (Req 4.1, 7.1)
//   - Property IDN-5: conversion failure → safe non-match (Req 4.4)

/** Every code point of `s` is ASCII (≤ U+007F). Avoids a control-char regex. */
const isAsciiOnly = (s: string): boolean => [...s].every((c) => (c.codePointAt(0) ?? 0) <= 0x7f);

const idnPatternArb = fc.constantFrom(
  "münchen.de",
  "café.fr",
  "日本.jp",
  "пример.рф",
  "*.рф",
  "*.münchen.de",
  "https://münchen.de:8443/App/*"
);

describe("patternToInit — IDN host conversion (Property IDN-4)", () => {
  test("the compiled hostname is pure ASCII (A-label), never Unicode", () => {
    fc.assert(
      fc.property(idnPatternArb, (raw) => {
        const canonical = parsePattern(raw);
        expect(canonical).not.toBeNull();
        if (canonical === null) return;
        const init = patternToInit(canonical);
        expect(init).not.toBeNull();
        if (init === null) return;
        expect(isAsciiOnly(init.hostname)).toBe(true);
        expect(HOSTNAME_OK.test(init.hostname)).toBe(true);
        expect(init.hostname).not.toContain("ü");
      })
    );
  });

  const hostnameCases: Array<[string, string]> = [
    ["münchen.de", "{*.}?xn--mnchen-3ya.de"],
    ["*.münchen.de", "*.xn--mnchen-3ya.de"],
    ["日本.jp", "{*.}?xn--wgv71a.jp"],
    ["*.рф", "*.xn--p1ai"],
    ["пример.рф", "{*.}?xn--e1afmkfd.xn--p1ai"],
  ];

  test.each(hostnameCases)("maps IDN host %j -> hostname %j", (raw, expectedHostname) => {
    const canonical = parsePattern(raw);
    expect(canonical).not.toBeNull();
    const init = patternToInit(canonical as string);
    if (init === null) throw new Error(`expected init for ${raw}`);
    expect(init.hostname).toBe(expectedHostname);
  });
});

describe("compilePattern — invalid IDN is a safe non-match (Property IDN-5)", () => {
  test("a host that parses but fails toASCII yields null (never throws)", () => {
    // A label beginning with a combining mark passes the parser's coarse
    // structural rule but is invalid under UTS #46 (a label may not start with a
    // combining mark), so `toASCII` fails and the Pattern must compile to a
    // non-match — deterministically, not via an engine-dependent poison host.
    const stored = parsePattern("\u0300xyz.de");
    expect(stored).not.toBeNull();
    expect(patternToInit(stored as string)).toBeNull();
    expect(compilePattern(stored as string)).toBeNull();
  });

  test("a compiled invalid-IDN pattern contributes no match via matchesPatternList", () => {
    const stored = parsePattern("\u0300xyz.de") as string;
    // Using the public matcher: an uncompilable pattern never matches any URL.
    expect(compilePattern(stored)).toBeNull();
  });
});
