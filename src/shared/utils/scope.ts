import type { ScopeMode } from "@/shared/types/settings";
import { getURLPattern } from "./url-pattern-provider";

/** Maximum accepted raw input length before any trimming (Req 4.6). */
const MAX_INPUT_LENGTH = 2048;
/** Maximum total length of a normalized DNS hostname (Req 4.3/4.4). */
const MAX_HOSTNAME_LENGTH = 253;
/** Maximum length of a single DNS label (Req 4.3/4.4). */
const MAX_LABEL_LENGTH = 63;

/** Characters that delimit the hostname from the rest of a URL-ish string. */
const HOSTNAME_DELIMITERS = ["/", ":", "?", "#"];

/** Wildcard / regex metacharacters that invalidate a candidate domain (Req 4.5). */
const METACHARACTERS = ["*", "?", "+", "[", "]", "(", ")", "{", "}", "^", "$", "|", "\\"];

/** A DNS label may contain only lowercase letters, digits, and hyphens. */
const LABEL_PATTERN = /^[a-z0-9-]+$/;

/**
 * Domain_Normalizer (Req 4). Normalize a user-entered domain/URL into a
 * canonical stored form, or return `null` when the input is invalid.
 */
export function normalizeDomain(input: string): string | null {
  // Req 4.6: reject overly long input before any other processing.
  if (input.length > MAX_INPUT_LENGTH) {
    return null;
  }

  // Req 4.1: trim surrounding whitespace and lowercase.
  let candidate = input.trim().toLowerCase();

  // Req 4.1: strip a leading http:// or https:// scheme.
  if (candidate.startsWith("https://")) {
    candidate = candidate.slice("https://".length);
  } else if (candidate.startsWith("http://")) {
    candidate = candidate.slice("http://".length);
  }

  // Req 4.1: strip leading `www.` label(s). Collapse repeatedly so the result
  // never begins with `www.`, which keeps normalization idempotent.
  while (candidate.startsWith("www.")) {
    candidate = candidate.slice("www.".length);
  }

  // Req 4.1/4.2: truncate at the first path/port/query/fragment delimiter so
  // only the hostname remains.
  let cutIndex = candidate.length;
  for (const delimiter of HOSTNAME_DELIMITERS) {
    const index = candidate.indexOf(delimiter);
    if (index !== -1 && index < cutIndex) {
      cutIndex = index;
    }
  }
  candidate = candidate.slice(0, cutIndex);

  // Req 4.5: reject any remaining wildcard/regex metacharacter.
  for (const meta of METACHARACTERS) {
    if (candidate.includes(meta)) {
      return null;
    }
  }

  // Req 4.3/4.4: validate as a DNS hostname.
  if (candidate.length === 0 || candidate.length > MAX_HOSTNAME_LENGTH) {
    return null;
  }
  if (!candidate.includes(".")) {
    return null;
  }

  const labels = candidate.split(".");
  for (const label of labels) {
    if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
      return null;
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      return null;
    }
    if (!LABEL_PATTERN.test(label)) {
      return null;
    }
  }

  return candidate;
}

// ───────────────────── Advanced Filtering: Pattern_Parser (Req 2, 3) ─────────────────────
//
// `parsePattern` supersedes `normalizeDomain` for the Advanced Filtering
// feature. It parses a glob-style URL pattern — `[scheme://]host[:port][/path]`
// — into a canonical stored string, or returns `null` when the input does not
// conform to the grammar (Req 2.1). `*` is the only wildcard; every other
// character is literal, and regex/URLPattern group metacharacters are rejected
// (Req 2.2, 2.6) so no user input can inject a group into the compiled matcher.
// Pure: same input → same output, with no external state.

/** A numeric port token is 1–5 digits; the value range is checked separately. */
const PORT_DIGITS_PATTERN = /^[0-9]{1,5}$/;

/**
 * A pattern path may contain only URL-path characters and the `*` wildcard
 * (Req 2.5, 2.6). This deliberately excludes `:` (reserved for the host/port
 * separator), `?`/`#` (query/fragment, already stripped), and every URLPattern
 * group metacharacter, so a stored path can never introduce a named group or
 * regexp into the compiled matcher.
 */
const PATH_ALLOWED_PATTERN = /^\/[A-Za-z0-9._~%/*-]*$/;

/** Scheme prefix: `http`, `https`, or `*`, followed by `://` (case-insensitive). */
const SCHEME_PREFIX_PATTERN = /^(https?|\*):\/\//i;

/**
 * True when `host` is a sequence of one or more valid DNS labels (`[a-z0-9-]`,
 * 1–63 chars, no leading/trailing hyphen) within the total hostname length cap.
 * Used for both the bare-host and `*.`-prefixed forms.
 */
function isValidLabelSequence(host: string): boolean {
  if (host.length === 0 || host.length > MAX_HOSTNAME_LENGTH) {
    return false;
  }
  for (const label of host.split(".")) {
    if (label.length === 0 || label.length > MAX_LABEL_LENGTH) {
      return false;
    }
    if (label.startsWith("-") || label.endsWith("-")) {
      return false;
    }
    if (!LABEL_PATTERN.test(label)) {
      return false;
    }
  }
  return true;
}

/** True when `host` is a dotted IPv4 literal with four octets, each 0–255. */
function isValidIpv4(host: string): boolean {
  const octets = host.split(".");
  if (octets.length !== 4) {
    return false;
  }
  for (const octet of octets) {
    if (!/^[0-9]{1,3}$/.test(octet) || Number(octet) > 255) {
      return false;
    }
  }
  return true;
}

/**
 * Validate the (already-lowercased) host component of a pattern (Req 2.1, 3.3,
 * 3.4). Accepts:
 *   - `*`                      — any host
 *   - `*.` + valid labels      — subdomains/suffix (e.g. `*.example.com`, `*.ru`)
 *   - a valid IPv4 literal     — e.g. `127.0.0.1`
 *   - `localhost`              — the one accepted dotless name (dev servers)
 *   - valid labels with ≥1 dot — apex + subdomains (e.g. `example.com`)
 *
 * A single-label bare host other than `localhost` is rejected so a bare TLD
 * (e.g. `com`) cannot silently match an entire suffix; use `*.com` for that.
 * `*` is accepted only as the whole host or a leading `*.`, never mid-host.
 */
function isValidHost(host: string): boolean {
  if (host === "*") {
    return true;
  }
  if (host.startsWith("*.")) {
    const rest = host.slice(2);
    return !rest.includes("*") && isValidLabelSequence(rest);
  }
  if (host.includes("*")) {
    return false;
  }
  if (host === "localhost") {
    return true;
  }
  if (/^[0-9.]+$/.test(host)) {
    return isValidIpv4(host);
  }
  if (!host.includes(".")) {
    return false;
  }
  return isValidLabelSequence(host);
}

/**
 * Pattern_Parser (Req 2, 3). Parse and canonicalize a user-entered glob-style
 * URL pattern, or return `null` when it does not conform to the grammar. Pure
 * and idempotent: for any `x` where `parsePattern(x)` is non-null,
 * `parsePattern(parsePattern(x)) === parsePattern(x)` (Req 3.6).
 */
export function parsePattern(input: string): string | null {
  // Req 3.5 / 15.2: reject over-length input before any other work.
  if (input.length > MAX_INPUT_LENGTH) {
    return null;
  }

  const trimmed = input.trim();
  if (trimmed.length === 0) {
    return null;
  }

  // Req 3.2: split an optional scheme (`http` / `https` / `*`), matched
  // case-insensitively and lowercased in the canonical form.
  let scheme = "";
  let remainder = trimmed;
  const schemeMatch = SCHEME_PREFIX_PATTERN.exec(trimmed);
  if (schemeMatch) {
    scheme = schemeMatch[1].toLowerCase();
    remainder = trimmed.slice(schemeMatch[0].length);
  }

  // Req 2.7 / 8.5: the query and fragment are never matched — drop everything
  // from the first `?` or `#`.
  const queryIndex = remainder.search(/[?#]/);
  if (queryIndex !== -1) {
    remainder = remainder.slice(0, queryIndex);
  }

  // Split the authority (`host[:port]`) from the path at the first `/`.
  const slashIndex = remainder.indexOf("/");
  const authority = slashIndex === -1 ? remainder : remainder.slice(0, slashIndex);
  let path = slashIndex === -1 ? "" : remainder.slice(slashIndex);

  // Split the host from an optional port at the first `:`.
  const colonIndex = authority.indexOf(":");
  const hasPort = colonIndex !== -1;
  const host = (hasPort ? authority.slice(0, colonIndex) : authority).toLowerCase();
  const port = hasPort ? authority.slice(colonIndex + 1) : "";

  // Req 2.1 / 3.3 / 3.4: validate the host.
  if (!isValidHost(host)) {
    return null;
  }

  // Req 2.4 / 3.4: validate + normalize the port into a canonical suffix. `*`
  // (any port) collapses to no suffix — identical in meaning to omitting the
  // port — and a numeric port is range-checked and stripped of leading zeros.
  let portPart = "";
  if (hasPort && port !== "*") {
    if (!PORT_DIGITS_PATTERN.test(port) || Number(port) > 65535) {
      return null;
    }
    portPart = `:${Number(port)}`;
  }

  // A bare "/" path means "the whole site" — treat it as no path so
  // `example.com/` matches every path and stays idempotent (Req 2.5).
  if (path === "/") {
    path = "";
  }
  // Req 2.5 / 2.6: a present path may contain only URL-path characters and `*`.
  if (path.length > 0 && !PATH_ALLOWED_PATTERN.test(path)) {
    return null;
  }

  // Req 3.6 / 3.7 / 3.8: emit the canonical form. The scheme is kept only when
  // explicitly given, a leading `*.` is preserved, `www.` is NOT stripped, and
  // the path keeps its original case.
  const schemePart = scheme ? `${scheme}://` : "";
  return `${schemePart}${host}${portPart}${path}`;
}

// ─────────────────── Advanced Filtering: Pattern_Compiler (Req 4, 5) ───────────────────
//
// Compile a canonical Pattern (from `parsePattern`) into a `URLPattern`. The
// mapping (`patternToInit`) is a pure, dependency-free transform so it is
// directly testable; `compilePattern` wraps it with the engine constructor and
// a fail-safe `try/catch`.

/**
 * The explicit `URLPattern` component init GeoSpoof builds. All four components
 * are always set (never defaulted) so matching is unambiguous and identical
 * across the native and polyfilled engines.
 */
interface CompiledPatternInit {
  protocol: string;
  hostname: string;
  port: string;
  pathname: string;
}

/** The instance type produced by the resolved `URLPattern` constructor. */
type CompiledURLPattern = InstanceType<ReturnType<typeof getURLPattern>>;

/**
 * Decompose a canonical Pattern (already validated + normalized by
 * `parsePattern`) into its scheme/host/port/path pieces. No validation — the
 * input is trusted to be canonical.
 */
function decomposePattern(pattern: string): {
  scheme: string;
  host: string;
  port: string;
  path: string;
} {
  let scheme = "";
  let remainder = pattern;
  const schemeMatch = SCHEME_PREFIX_PATTERN.exec(pattern);
  if (schemeMatch) {
    scheme = schemeMatch[1];
    remainder = pattern.slice(schemeMatch[0].length);
  }
  const slashIndex = remainder.indexOf("/");
  const authority = slashIndex === -1 ? remainder : remainder.slice(0, slashIndex);
  const path = slashIndex === -1 ? "" : remainder.slice(slashIndex);
  const colonIndex = authority.indexOf(":");
  const host = colonIndex === -1 ? authority : authority.slice(0, colonIndex);
  const port = colonIndex === -1 ? "" : authority.slice(colonIndex + 1);
  return { scheme, host, port, path };
}

/**
 * Pattern_Compiler mapping (Req 4.2–4.7). Convert a canonical Pattern into an
 * explicit `URLPattern` component init, applying GeoSpoof's host semantics. Pure
 * and dependency-free (it constructs no `URLPattern`), so it is directly
 * assertable: every emitted component contains only literal characters plus
 * GeoSpoof's own `{*.}?` / `http{s}?` / `*` tokens — never any group syntax
 * derived from user input (Req 5.3, 5.4, 15.1). The remaining host text is
 * `[a-z0-9.-]`-only and the path is `[A-Za-z0-9._~%/*-]`-only, both guaranteed
 * by `parsePattern`, so no user character can open a URLPattern group.
 */
export function patternToInit(pattern: string): CompiledPatternInit {
  const { scheme, host, port, path } = decomposePattern(pattern);

  // protocol (Req 4.7): unset ⇒ http + https only; explicit ⇒ that scheme; `*` ⇒ any.
  const protocol = scheme === "" ? "http{s}?" : scheme;

  // hostname (Req 4.2/4.3/4.4): `*` ⇒ any host; `*.labels` ⇒ subdomains only; an
  // IPv4 literal ⇒ exact; any other bare host ⇒ apex + subdomains via the
  // optional `{*.}?` group (which URLPattern treats as "zero-or-one <label>.").
  let hostname: string;
  if (host === "*" || host.startsWith("*.") || isValidIpv4(host)) {
    hostname = host;
  } else {
    hostname = `{*.}?${host}`;
  }

  // port (Req 4.5): unset ⇒ any port.
  const portComponent = port === "" ? "*" : port;

  // pathname (Req 4.6): unset ⇒ any path; otherwise the path with `*` wildcards.
  const pathname = path === "" ? "/*" : path;

  return { protocol, hostname, port: portComponent, pathname };
}

/**
 * Pattern_Compiler (Req 5). Compile a canonical Pattern into a `URLPattern`, or
 * return `null` if construction throws (Req 5.6) so one malformed entry can
 * never break matching for the rest of the list. The `URLPattern` is always
 * built from the explicit component init (`patternToInit`), never from the raw
 * single-string constructor, so no user character can inject a group (Req 5.3,
 * 5.4).
 */
export function compilePattern(pattern: string): CompiledURLPattern | null {
  try {
    const URLPatternCtor = getURLPattern();
    return new URLPatternCtor(patternToInit(pattern));
  } catch {
    return null;
  }
}

// ─────────────────── Advanced Filtering: Pattern_Matcher (Req 4, 5, 15) ───────────────────

/**
 * Compiled-`URLPattern` cache, keyed by canonical Pattern string (Req 5.5,
 * 15.3). A cached `null` records a Pattern that failed to compile so it is not
 * retried. The cache affects only cost, never the match result, so
 * `matchesPatternList` stays a pure function of `(url, patterns)` (Req 4.1).
 */
const compiledPatternCache = new Map<string, CompiledURLPattern | null>();

/** Return the compiled `URLPattern` for a canonical Pattern, memoized (Req 5.5). */
function getCompiledPattern(pattern: string): CompiledURLPattern | null {
  const cached = compiledPatternCache.get(pattern);
  if (cached !== undefined) {
    return cached;
  }
  const compiled = compilePattern(pattern);
  compiledPatternCache.set(pattern, compiled);
  return compiled;
}

/** Run `URLPattern.test`, treating any throw as a non-match (Req 5.6). */
function safeTest(compiled: CompiledURLPattern, url: string): boolean {
  try {
    return compiled.test(url);
  } catch {
    return false;
  }
}

/**
 * Pattern_Matcher (Req 4, 5, 15). Return `true` when `url` matches any Pattern
 * in `patterns` under the compiled `URLPattern` semantics. Pure with respect to
 * its inputs — the compile cache never changes the result (Req 4.1); returns
 * `false` for an empty URL or empty list (Req 4.8); short-circuits on the first
 * match (Req 15.4). Supersedes `matchesDomainList`, taking the full URL rather
 * than a bare hostname.
 */
export function matchesPatternList(url: string, patterns: string[]): boolean {
  if (url.length === 0 || patterns.length === 0) {
    return false;
  }
  for (const pattern of patterns) {
    const compiled = getCompiledPattern(pattern);
    if (compiled !== null && safeTest(compiled, url)) {
      return true;
    }
  }
  return false;
}

/**
 * Test-only: clear the compiled-pattern cache so tests stay isolated. Not
 * referenced by production code.
 */
export function __resetPatternCacheForTest(): void {
  compiledPatternCache.clear();
}

/**
 * Domain_Matcher (Req 5). Pure, case-insensitive ASCII subdomain-inclusive
 * literal match. No wildcard/regex interpretation, and the input list is never
 * mutated.
 */
export function matchesDomainList(hostname: string, list: string[]): boolean {
  const host = hostname.toLowerCase();
  if (host.length === 0 || list.length === 0) {
    return false;
  }

  for (const rawEntry of list) {
    const entry = rawEntry.toLowerCase();
    if (entry.length === 0) {
      continue;
    }
    if (host === entry || host.endsWith("." + entry)) {
      return true;
    }
  }

  return false;
}

/**
 * Preserve-geolocation-prompt Pro gate. "Preserve location prompts" is a
 * Pro-only config feature on iOS Safari (parity with per-site filtering and
 * custom accuracy). When the iOS app signals `proFeaturesBlocked` (non-Pro),
 * force the flag off so a free user always gets the prompt-free, auto-granted
 * spoofed location — the free behavior — regardless of how it was set (app,
 * popup, or a stale value after a lapsed subscription). Optional + fail-open:
 * undefined/false passes the value through, and the `__SAFARI__` guard compiles
 * out on other engines, so macOS Safari / Chrome / Firefox are unaffected.
 *
 * Applied in the background at every point that builds a tab-bound payload, so
 * the value the content script receives is always the safe default for a free
 * user. Mirrors `computeEffectiveEnabled`'s scope gate and
 * `computeEffectiveAccuracySetting` so all three Pro-only config features share
 * one flag and the same enforcement shape.
 */
export function computeEffectivePreserveGeoPrompt(
  preserveGeolocationPrompt: boolean,
  proFeaturesBlocked?: boolean
): boolean {
  if (__SAFARI__ && proFeaturesBlocked === true) {
    return false;
  }
  return preserveGeolocationPrompt;
}

/**
 * Effective_Enabled resolver (Req 6). The single source of truth for the
 * per-tab spoofing decision. Pure: it matches the tab's top-level URL against
 * the active pattern list via `matchesPatternList` and combines the master
 * switch, scope mode, and lists into one boolean. The hostname is still derived
 * from the URL, but only to guard against an unparseable or host-less URL — the
 * pattern match itself runs against the full top-level URL (scheme, host, port,
 * and path), which is what enables wildcard, port, and sub-route filtering. The
 * allowlist/denylist arrays never leave the background, so this function is the
 * only place that consults them for a given tab.
 */
export function computeEffectiveEnabled(args: {
  masterEnabled: boolean;
  scopeMode: ScopeMode;
  allowlist: string[];
  denylist: string[];
  topLevelUrl: string | undefined;
  isRestricted: (url: string) => boolean;
  /**
   * Safari/iOS Pro gate. When true (set by the iOS app for non-Pro users), the
   * scope mode is forced to "all" so a free user spoofs everywhere and can't
   * use the Pro-only allowlist/denylist — regardless of how scope was set (app,
   * popup, or a stale value after a lapsed subscription). Optional + fail-open:
   * undefined/false leaves scoping untouched, and the `__SAFARI__` guard
   * compiles out on other engines, so macOS Safari / Chrome / Firefox / Android
   * Firefox are unaffected.
   */
  proFeaturesBlocked?: boolean;
}): boolean {
  const { masterEnabled, scopeMode, allowlist, denylist, topLevelUrl, isRestricted } = args;

  // Req 6.2: master switch off ⇒ never spoof, regardless of mode or lists.
  if (!masterEnabled) {
    return false;
  }

  // Req 6.9 / 8.6: no top-level URL ⇒ cannot scope, so do not spoof.
  if (!topLevelUrl) {
    return false;
  }

  // Req 6.9: an unparseable URL or a URL with no derivable hostname means we
  // cannot make a scoping decision ⇒ do not spoof. (Pattern matching runs
  // against the full URL below; the hostname is derived here only as a guard.)
  let host: string;
  try {
    host = new URL(topLevelUrl).hostname;
  } catch {
    return false;
  }
  if (host.length === 0) {
    return false;
  }

  // Req 6.8: restricted URLs (browser-internal pages, etc.) are never spoofed.
  if (isRestricted(topLevelUrl)) {
    return false;
  }

  // Per-site filtering (allowlist/denylist) is Pro-gated on iOS Safari. When
  // the app signals proFeaturesBlocked, force "all" so a free user always
  // spoofs everywhere and can't narrow scope. Fail-open + Safari-only.
  const effectiveMode: ScopeMode =
    __SAFARI__ && args.proFeaturesBlocked === true ? "all" : scopeMode;
  // Req 6.3/6.4/6.5: resolve against the active scope mode, matching the full
  // top-level URL against the active pattern list (Req 6.1, 6.4, 6.5).
  switch (effectiveMode) {
    case "all":
      return true;
    case "allowlist":
      return matchesPatternList(topLevelUrl, allowlist);
    case "denylist":
      return !matchesPatternList(topLevelUrl, denylist);
  }
}
