/**
 * Cross-bridge contract for the Safari app ↔ extension `localeSpoofing`
 * (Reported Language) passthrough.
 * Feature: locale-spoofing (Task 19.2) — Requirements 11.1–11.5, 15.1, 15.2
 *
 * The setting rides through the App Group store as a compact JSON string,
 * alongside `accuracySetting` and `locationPrecision`. On adoption
 * (`adoptPendingSettingsFromApp` in src/background/app-bridge.ts) the extension
 * does:
 *
 *     const parsed = JSON.parse(pending.localeSpoofing);
 *     const validated = validateLocaleSpoofing(parsed);
 *     if (JSON.stringify(validated) !== JSON.stringify(latest.localeSpoofing)) { … }
 *
 * The Safari-only branch is compiled out under the test harness (`__SAFARI__` is
 * a build-time `false`), so this verifies the reusable core it depends on: the
 * JSON shapes the app can emit round-trip to canonical TS values, and the
 * change-detection / ignore-on-malformed semantics hold.
 *
 * The important asymmetry versus accuracy/precision: only the raw PREFERENCE
 * crosses the bridge. The resolved locale (tag, languages, Accept-Language) is
 * derived per payload in the background, so the app cannot put the page world and
 * the HTTP header out of step with one another.
 */

import { describe, test, expect } from "vitest";
import { validateLocaleSpoofing } from "@/background/settings";
import type { LocaleSpoofing } from "@/shared/types/settings";

/** Mirror of the bridge's parse step: JSON.parse in try/catch, undefined on error. */
function parseLocaleJSON(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    return undefined;
  }
}

/** Mirror of the bridge's adopt decision: parse → validate → change-detect. */
function adoptLocale(json: string, current: LocaleSpoofing): LocaleSpoofing | null {
  const parsed = parseLocaleJSON(json);
  if (parsed === undefined) return null; // malformed JSON — ignored by the bridge
  const validated = validateLocaleSpoofing(parsed);
  if (JSON.stringify(validated) === JSON.stringify(current)) return null; // no-op
  return validated;
}

describe("bridged JSON shapes round-trip to canonical TS values", () => {
  test('{"mode":"off"} → { mode: "off" }', () => {
    expect(validateLocaleSpoofing(JSON.parse('{"mode":"off"}'))).toEqual({ mode: "off" });
  });

  test('{"mode":"match"} → { mode: "match" }', () => {
    expect(validateLocaleSpoofing(JSON.parse('{"mode":"match"}'))).toEqual({ mode: "match" });
  });

  test('{"mode":"custom","locale":"fr-FR"} → { mode: "custom", locale: "fr-FR" }', () => {
    expect(validateLocaleSpoofing(JSON.parse('{"mode":"custom","locale":"fr-FR"}'))).toEqual({
      mode: "custom",
      locale: "fr-FR",
    });
  });

  test("a non-canonical tag from the app is canonicalized on adoption", () => {
    // The app may hold a user-typed or platform-formatted tag; the extension is
    // the source of truth for canonical form so both sides converge.
    expect(validateLocaleSpoofing(JSON.parse('{"mode":"custom","locale":"fr-fr"}'))).toEqual({
      mode: "custom",
      locale: "fr-FR",
    });
  });

  test("the JSON the extension SENDS is accepted by the validator it receives with", () => {
    // pushRegionToNativeHost serializes with JSON.stringify; a value that
    // survived a round-trip out and back must be unchanged, or the two sides
    // would fight over it on every sync.
    for (const setting of [
      { mode: "off" as const },
      { mode: "match" as const },
      { mode: "custom" as const, locale: "ja" },
      { mode: "custom" as const, locale: "pt-BR" },
    ]) {
      expect(validateLocaleSpoofing(JSON.parse(JSON.stringify(setting)))).toEqual(setting);
    }
  });
});

describe("engine capability is enforced on adoption, not trusted from the app", () => {
  test("a tag this engine has no data for is repaired to off", () => {
    // The app might be running on a platform whose ICU has a locale this engine
    // lacks. Adopting it verbatim would leave the user believing a language is
    // applied while pages saw a silent fallback, so the extension repairs it.
    expect(validateLocaleSpoofing(JSON.parse('{"mode":"custom","locale":"xx-ZZ"}'))).toEqual({
      mode: "off",
    });
  });

  test("a malformed tag is repaired to off", () => {
    expect(validateLocaleSpoofing(JSON.parse('{"mode":"custom","locale":"en_US"}'))).toEqual({
      mode: "off",
    });
    expect(validateLocaleSpoofing(JSON.parse('{"mode":"custom","locale":""}'))).toEqual({
      mode: "off",
    });
  });

  test("custom with no locale field is repaired to off", () => {
    expect(validateLocaleSpoofing(JSON.parse('{"mode":"custom"}'))).toEqual({ mode: "off" });
  });

  test("an unknown mode is repaired to off", () => {
    expect(validateLocaleSpoofing(JSON.parse('{"mode":"wobble"}'))).toEqual({ mode: "off" });
  });
});

describe("adopt decision semantics", () => {
  test("adopts when the app's value differs", () => {
    expect(adoptLocale('{"mode":"match"}', { mode: "off" })).toEqual({ mode: "match" });
    expect(adoptLocale('{"mode":"custom","locale":"fr-FR"}', { mode: "match" })).toEqual({
      mode: "custom",
      locale: "fr-FR",
    });
  });

  test("no-ops when the app's value already matches", () => {
    expect(adoptLocale('{"mode":"off"}', { mode: "off" })).toBeNull();
    expect(adoptLocale('{"mode":"match"}', { mode: "match" })).toBeNull();
    expect(
      adoptLocale('{"mode":"custom","locale":"fr-FR"}', { mode: "custom", locale: "fr-FR" })
    ).toBeNull();
  });

  test("no-ops when a non-canonical tag normalizes to the current value", () => {
    // Otherwise every sync would look like a change and re-broadcast forever.
    expect(
      adoptLocale('{"mode":"custom","locale":"FR-fr"}', { mode: "custom", locale: "fr-FR" })
    ).toBeNull();
  });

  test("malformed JSON is ignored rather than throwing or clearing the setting", () => {
    expect(adoptLocale("not json", { mode: "match" })).toBeNull();
    expect(adoptLocale("", { mode: "match" })).toBeNull();
    expect(adoptLocale("{unclosed", { mode: "match" })).toBeNull();
  });

  test("an unusable tag from the app turns the feature OFF rather than being ignored", () => {
    // Distinct from malformed JSON: the app expressed a real intent that this
    // engine can't honor, so the correct outcome is a visible `off` rather than
    // silently keeping the previous language.
    expect(adoptLocale('{"mode":"custom","locale":"xx-ZZ"}', { mode: "match" })).toEqual({
      mode: "off",
    });
  });
});

describe("validator totality across bridge inputs", () => {
  test("never throws for any JSON value the bridge could deliver", () => {
    for (const json of [
      "null",
      "true",
      "0",
      '""',
      "[]",
      "{}",
      '{"mode":null}',
      '{"mode":"custom","locale":42}',
      '{"mode":"custom","locale":null}',
      '{"mode":"match","locale":"fr-FR"}',
      '{"nested":{"mode":"custom","locale":"fr-FR"}}',
    ]) {
      expect(() => validateLocaleSpoofing(JSON.parse(json)), json).not.toThrow();
      const result = validateLocaleSpoofing(JSON.parse(json));
      expect(["off", "match", "custom"], json).toContain(result.mode);
    }
  });

  test("extra properties from a newer app version are dropped, not carried through", () => {
    expect(validateLocaleSpoofing(JSON.parse('{"mode":"match","futureField":true}'))).toEqual({
      mode: "match",
    });
  });
});
