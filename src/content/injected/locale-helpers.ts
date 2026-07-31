/**
 * Locale helpers shared by the injected modules.
 *
 * Exists as a neutral module for the same reason `timezone-helpers.ts` does: the
 * early bootstrap (`bootstrap.ts`) needs to validate incoming locale data, and
 * the locale overrides need the bootstrap's lazy seed. Putting the validator in
 * `locale-overrides.ts` would make those two import each other, so the piece both
 * need lives here instead.
 */

import type { LocaleData } from "./types";

/**
 * Structural check on locale data arriving from the content script or from the
 * document_start bootstrap global.
 *
 * The background already validated the tag and confirmed the engine supports it,
 * so this guards only against a malformed or truncated message — but it must be
 * strict, because a `languages` array whose head disagreed with `tag` would make
 * `navigator.language` and `navigator.languages` contradict each other, which is
 * worse than not spoofing at all.
 */
export function validateLocaleData(value: unknown): value is LocaleData {
  if (!value || typeof value !== "object") return false;
  const data = value as { tag?: unknown; languages?: unknown };
  if (typeof data.tag !== "string" || data.tag === "") return false;
  if (!Array.isArray(data.languages) || data.languages.length === 0) return false;
  if (!data.languages.every((l) => typeof l === "string" && l !== "")) return false;
  // The invariant every consumer relies on.
  if (data.languages[0] !== data.tag) return false;
  return true;
}
