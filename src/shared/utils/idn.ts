import { toASCII } from "tr46";

// ───────────────────── IDN Pattern Support: host → A-label (Req 4) ─────────────────────
//
// The single import site for `tr46` (UTS #46 / IDNA). GeoSpoof stores a
// site-filter Pattern's host in its *Unicode* form (NFC + lowercased, produced
// by the parser in both TypeScript and Swift with only native string ops), and
// converts it to its ASCII (A-label / `xn--`) form *only here*, at compile time,
// when building the `URLPattern`. Keeping conversion in one place means:
//   - the `URLPattern` engine only ever sees ASCII (no user character can open a
//     `URLPattern` group — the injection/ReDoS invariant), and
//   - the Swift companion app never needs an IDNA library (it validates and
//     displays Patterns but never matches URLs).

/**
 * UTS #46 options fixed to match the WHATWG URL Standard's "domain to ASCII"
 * operation — the exact processing browsers use to produce the host of a page
 * URL. Matching these means a Unicode Pattern's converted host lines up with the
 * already-`xn--`-encoded host the matcher tests against:
 *   CheckHyphens=false, CheckBidi=true, CheckJoiners=true,
 *   UseSTD3ASCIIRules=false, TransitionalProcessing=false, VerifyDnsLength=false.
 * `verifyDNSLength` stays off because the parser already caps host/label length
 * structurally and a `*.`-prefixed pattern is not a complete DNS name; match
 * correctness does not depend on DNS-length rejection here.
 */
const URL_TO_ASCII_OPTIONS = {
  checkHyphens: false,
  checkBidi: true,
  checkJoiners: true,
  useSTD3ASCIIRules: false,
  transitionalProcessing: false,
  verifyDNSLength: false,
} as const;

/**
 * Convert a host's Unicode label sequence to its ASCII (A-label / Punycode) form
 * per UTS #46 (non-transitional), or return `null` when conversion fails.
 *
 * Pure and total: never throws, so a caller in the compile path can treat a
 * `null` result as a non-matching Pattern (fail-safe) rather than letting an
 * error escape into the matcher. A pure-ASCII host (including `localhost` and an
 * already-`xn--` host) round-trips unchanged.
 *
 * Only the *literal* portion of a host should be passed here. The Pattern's
 * wildcard tokens — a whole-host `*` or a leading `*.` — are not valid IDNA
 * input and are handled by the caller (`patternToInit`), which strips the
 * leading `*.`, converts the remainder, and re-attaches it.
 */
export function hostToASCII(host: string): string | null {
  let result: string | null;
  try {
    result = toASCII(host, URL_TO_ASCII_OPTIONS);
  } catch {
    return null;
  }
  return typeof result === "string" && result.length > 0 ? result : null;
}
