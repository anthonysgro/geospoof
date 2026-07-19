/**
 * Cross-engine equivalence for the Pattern_Compiler
 * Feature: advanced-filtering
 *
 * The matcher runs on the native `URLPattern` where the engine ships it and on
 * `urlpattern-polyfill` otherwise (Firefox < 142, Safari < 26). For the
 * cross-browser guarantee to hold, both must return the same `test` result for
 * the component inits GeoSpoof generates.
 *   - Property 15: Cross-engine equivalence (Req 5.7, 16.2, 16.4)
 *   - Property IDN-8: cross-engine equivalence over IDN (idn-pattern-support Req 8.1, 8.4)
 *
 * The arbitraries include IDN patterns/URLs; because the compiler converts the
 * host to its A-label form, both engines receive an ASCII hostname and must
 * agree. When the test runtime lacks a native `URLPattern`, the suite is skipped
 * (the polyfill path is already covered by the other pattern tests).
 */

import fc from "fast-check";
import { URLPattern as PolyfillURLPattern } from "urlpattern-polyfill/urlpattern";
import { patternToInit } from "@/shared/utils/scope";

type URLPatternCtor = typeof PolyfillURLPattern;
const NativeURLPattern = (globalThis as { URLPattern?: URLPatternCtor }).URLPattern;
const hasNative = typeof NativeURLPattern === "function";

/** Construct + test with a given engine, treating any throw as a non-match. */
function testWith(Ctor: URLPatternCtor, pattern: string, url: string): boolean {
  const init = patternToInit(pattern);
  if (init === null) {
    return false;
  }
  try {
    return new Ctor(init).test(url);
  } catch {
    return false;
  }
}

const patternArb = fc.constantFrom(
  "example.com",
  "*.example.com",
  "*.ru",
  "*",
  "localhost",
  "localhost:3000",
  "127.0.0.1:8080",
  "example.com/maps/*",
  "https://example.com",
  "*://example.com",
  "example.com:8443",
  // IDN patterns (stored Unicode; the compiler converts the host to A-labels).
  "münchen.de",
  "*.рф",
  "日本.jp"
);

const urlArb = fc.constantFrom(
  "https://example.com/",
  "http://example.com/",
  "https://app.example.com/",
  "https://a.b.example.com/x/y",
  "https://example.ru/",
  "https://notexample.com/",
  "http://localhost:3000/",
  "http://localhost:3001/",
  "http://127.0.0.1:8080/api/v1",
  "https://example.com:8443/maps/here",
  "ftp://example.com/",
  "https://example.com/search?q=1#frag",
  "https://other.org/path",
  // IDN URLs: the Punycode (A-label) form a browser produces, plus a Unicode form.
  "https://xn--mnchen-3ya.de/",
  "https://app.xn--mnchen-3ya.de/",
  "https://shop.xn--p1ai/",
  "https://xn--wgv71a.jp/x",
  "https://münchen.de/"
);

(hasNative ? describe : describe.skip)("Property 15: native vs polyfill URLPattern parity", () => {
  test("both engines return the same match result for every pattern/URL pair", () => {
    fc.assert(
      fc.property(patternArb, urlArb, (pattern, url) => {
        const native = testWith(NativeURLPattern as URLPatternCtor, pattern, url);
        const poly = testWith(PolyfillURLPattern, pattern, url);
        expect(native).toBe(poly);
      }),
      { numRuns: 500 }
    );
  });
});
