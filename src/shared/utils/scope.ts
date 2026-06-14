import type { ScopeMode } from "@/shared/types/settings";

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
 * Effective_Enabled resolver (Req 6, design §2). The single source of truth for
 * the per-tab spoofing decision. Pure: it derives the hostname from the tab's
 * top-level URL and combines the master switch, scope mode, and lists into one
 * boolean. The allowlist/denylist arrays never leave the background, so this
 * function is the only place that consults them for a given tab.
 */
export function computeEffectiveEnabled(args: {
  masterEnabled: boolean;
  scopeMode: ScopeMode;
  allowlist: string[];
  denylist: string[];
  topLevelUrl: string | undefined;
  isRestricted: (url: string) => boolean;
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

  // Req 6.9: derive the hostname from the top-level URL. An unparseable URL or
  // empty hostname means we cannot make a scoping decision ⇒ do not spoof.
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

  // Req 6.3/6.4/6.5: resolve against the active scope mode.
  switch (scopeMode) {
    case "all":
      return true;
    case "allowlist":
      return matchesDomainList(host, allowlist);
    case "denylist":
      return !matchesDomainList(host, denylist);
  }
}
