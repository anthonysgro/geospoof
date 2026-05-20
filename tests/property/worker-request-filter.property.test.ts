/**
 * Property-Based Tests — Cross-Origin Worker Patch
 *
 * Property 1 (Fix Checking): For any cross-origin (workerUrl, tabPageUrl) pair,
 * classifyRequest' returns "pass".
 *
 * Property 2 (Preservation): For any same-origin (workerUrl, tabPageUrl) pair
 * with a worker Sec-Fetch-Dest, classifyRequest' returns "patch".
 *
 * Property 3 (eTLD+1 symmetry): For any two URLs with the same hostname,
 * getRegistrableDomain returns the same value.
 */

import fc from "fast-check";
import {
  getRegistrableDomain,
  tabPageUrlCache,
  _classifyRequestForTest,
} from "@/background/worker-request-filter";

// ── Arbitraries ───────────────────────────────────────────────────────

/** A realistic-looking hostname: 1–3 labels of lowercase letters. */
const labelArb = fc.stringMatching(/^[a-z]{2,8}$/);

const hostnameArb = fc.oneof(
  // standard: label.tld
  fc.tuple(labelArb, labelArb).map(([a, b]) => `${a}.${b}`),
  // subdomain: sub.label.tld
  fc.tuple(labelArb, labelArb, labelArb).map(([a, b, c]) => `${a}.${b}.${c}`)
);

const httpUrlArb = (hostname: string) => fc.constant(`https://${hostname}/`);

/** Pair of URLs that share the same registrable domain. */
const sameOriginPairArb = hostnameArb.chain((hostname) => {
  // Build a second URL on the same registrable domain (possibly a subdomain).
  const subArb = fc.oneof(
    fc.constant(hostname),
    labelArb.map((sub) => `${sub}.${hostname}`)
  );
  return fc.tuple(
    fc.constant(`https://${hostname}/worker.js`),
    subArb.map((h) => `https://${h}/`)
  );
});

/** Pair of URLs with different registrable domains. */
const crossOriginPairArb = fc
  .tuple(hostnameArb, hostnameArb)
  .filter(([a, b]) => {
    const da = getRegistrableDomain(`https://${a}/`);
    const db = getRegistrableDomain(`https://${b}/`);
    return da !== null && db !== null && da !== db;
  })
  .map(([a, b]) => [`https://${a}/worker.js`, `https://${b}/`] as [string, string]);

const workerDestArb = fc.constantFrom("worker", "sharedworker", "serviceworker");

// ── Property 1: Fix Checking ──────────────────────────────────────────

describe("Property 1 — Fix Checking: cross-origin workers always classified as pass", () => {
  beforeEach(() => tabPageUrlCache.clear());

  test("for all cross-origin (workerUrl, tabPageUrl) pairs with worker Sec-Fetch-Dest → pass", () => {
    fc.assert(
      fc.property(crossOriginPairArb, workerDestArb, ([workerUrl, tabPageUrl], dest) => {
        tabPageUrlCache.set(99, tabPageUrl);
        const result = _classifyRequestForTest({
          requestId: "prop-r1",
          url: workerUrl,
          type: "script",
          method: "GET",
          tabId: 99,
          frameId: 0,
          requestHeaders: [{ name: "Sec-Fetch-Dest", value: dest }],
        });
        tabPageUrlCache.clear();
        return result === "pass";
      }),
      { numRuns: 200 }
    );
  });
});

// ── Property 2: Preservation ──────────────────────────────────────────

describe("Property 2 — Preservation: same-origin workers with worker dest still classified as patch", () => {
  beforeEach(() => tabPageUrlCache.clear());

  test("for all same-origin (workerUrl, tabPageUrl) pairs with worker Sec-Fetch-Dest → patch", () => {
    fc.assert(
      fc.property(sameOriginPairArb, workerDestArb, ([workerUrl, tabPageUrl], dest) => {
        // Only proceed when both URLs resolve to the same non-null domain.
        const wd = getRegistrableDomain(workerUrl);
        const pd = getRegistrableDomain(tabPageUrl);
        if (!wd || !pd || wd !== pd) return true; // skip degenerate cases

        tabPageUrlCache.set(99, tabPageUrl);
        const result = _classifyRequestForTest({
          requestId: "prop-r2",
          url: workerUrl,
          type: "script",
          method: "GET",
          tabId: 99,
          frameId: 0,
          requestHeaders: [{ name: "Sec-Fetch-Dest", value: dest }],
        });
        tabPageUrlCache.clear();
        return result === "patch";
      }),
      { numRuns: 200 }
    );
  });

  test("non-worker Sec-Fetch-Dest (script) always returns pass regardless of origin", () => {
    fc.assert(
      fc.property(sameOriginPairArb, ([workerUrl, tabPageUrl]) => {
        tabPageUrlCache.set(99, tabPageUrl);
        const result = _classifyRequestForTest({
          requestId: "prop-r3",
          url: workerUrl,
          type: "script",
          method: "GET",
          tabId: 99,
          frameId: 0,
          requestHeaders: [{ name: "Sec-Fetch-Dest", value: "script" }],
        });
        tabPageUrlCache.clear();
        return result === "pass";
      }),
      { numRuns: 100 }
    );
  });
});

// ── Property 3: eTLD+1 symmetry ───────────────────────────────────────

describe("Property 3 — eTLD+1 symmetry: same hostname always yields same registrable domain", () => {
  test("two URLs with the same hostname return the same getRegistrableDomain value", () => {
    fc.assert(
      fc.property(hostnameArb, fc.string(), fc.string(), (hostname, pathA, pathB) => {
        const urlA = `https://${hostname}/${pathA}`;
        const urlB = `https://${hostname}/${pathB}`;
        return getRegistrableDomain(urlA) === getRegistrableDomain(urlB);
      }),
      { numRuns: 200 }
    );
  });
});
