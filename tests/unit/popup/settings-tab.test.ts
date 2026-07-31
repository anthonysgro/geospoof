/**
 * Settings tab extraction + the Language & Locale entry in "Key Overrides".
 *
 * The controls that used to sit behind the "Advanced" accordion inside the
 * Details tab now live in their own Settings tab — Details had grown too long to
 * scan. These tests pin the wiring that a type-checker can't see: the markup ids
 * the view-switcher toggles, the fact that every control survived the move, and
 * that the accordion is genuinely gone rather than left orphaned.
 */

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildApiGroups } from "@/popup/ui";

const html = readFileSync("assets/popup.html", "utf8");
const indexTs = readFileSync("src/popup/index.ts", "utf8");
const css = readFileSync("assets/popup.css", "utf8");
const messages = JSON.parse(readFileSync("_locales/en/messages.json", "utf8")) as Record<
  string,
  { message: string; description?: string }
>;

describe("Settings view + header gear trigger", () => {
  test("the trigger and its view both exist", () => {
    expect(html).toContain('id="settingsTab"');
    expect(html).toContain('id="settingsView"');
    // Must be a real tab-content pane so the shared show/hide logic applies.
    expect(html).toMatch(/<div class="tab-content" id="settingsView"/);
  });

  test("the view switcher knows about all four views", () => {
    for (const id of ["mainTab", "filtersTab", "detailsTab", "settingsTab"]) {
      expect(indexTs, id).toContain(id);
    }
    for (const id of ["mainView", "filtersView", "detailsView", "settingsView"]) {
      expect(indexTs, id).toContain(id);
    }
    // The switcher iterates a literal tuple; a view missing from it would render
    // but never hide the others.
    expect(indexTs).toMatch(/\["main", "filters", "details", "settings"\] as const/);
  });

  test("the gear has a click handler", () => {
    expect(indexTs).toMatch(
      /getElementById\("settingsTab"\)[\s\S]{0,80}showPopupView\("settings"\)/
    );
  });

  test("Settings is NOT in the tab bar - the bar stays at three labels", () => {
    // The point of the gear: Main/Filters/Details are views onto the current
    // spoofing state, Settings is app config, and four labels crowded the 350px bar.
    const navStart = html.indexOf('class="tab-navigation"');
    const navMarkup = html.slice(navStart, html.indexOf("<!-- Main View -->", navStart));
    expect(navMarkup).toContain('id="mainTab"');
    expect(navMarkup).toContain('id="filtersTab"');
    expect(navMarkup).toContain('id="detailsTab"');
    expect(navMarkup).not.toContain('id="settingsTab"');
    expect((navMarkup.match(/class="nav-tab/g) ?? []).length).toBe(3);
  });

  test("the gear lives in the header's grouped right side", () => {
    // Grouping matters: a third direct child of the space-between header would
    // have centred the status badge instead of leaving it right-aligned.
    expect(html).toContain('class="header-actions"');
    const group = html.slice(
      html.indexOf('class="header-actions"'),
      html.indexOf("<!-- Tab Navigation -->")
    );
    expect(group).toContain('id="statusBadge"');
    expect(group).toContain('id="settingsTab"');
  });

  test("the gear carries its own selected state, since no tab can", () => {
    // While Settings is open every tab is inactive, so aria-pressed is what
    // signals "you are here" - visually and to screen readers.
    expect(html).toMatch(/id="settingsTab"[\s\S]{0,200}aria-pressed="false"/);
    expect(indexTs).toMatch(/settingsTab[\s\S]{0,200}aria-pressed/);
    expect(css).toContain('.header-gear[aria-pressed="true"]');
  });

  test("the gear is accessible without a visible label", () => {
    const at = html.indexOf('id="settingsTab"');
    const gear = html.slice(at, html.indexOf("</button>", at));
    // Tooltip for sighted users, action-phrased label for screen readers, both
    // localized; decorative glyph hidden from the a11y tree.
    expect(gear).toContain('data-i18n-title="tab_settings"');
    expect(gear).toContain('data-i18n-aria-label="tab_settings_ariaLabel"');
    expect(gear).toContain('aria-hidden="true"');
    expect(gear).toContain('focusable="false"');
  });

  test("the Advanced accordion is fully removed, not orphaned", () => {
    // Both the button and its handler must go together - a leftover handler
    // referencing a removed element is dead code that silently does nothing.
    expect(html).not.toContain("advanced-toggle");
    expect(html).not.toContain('id="advancedToggle"');
    expect(indexTs).not.toContain("advancedToggle");
  });

  test("both gear strings are localized with translator notes", () => {
    for (const key of ["tab_settings", "tab_settings_ariaLabel"]) {
      expect(messages[key], key).toBeDefined();
      expect(messages[key].message.length, key).toBeGreaterThan(0);
      expect(messages[key].description, key).toBeTruthy();
    }
  });

  test("the tab bar keeps its roomy three-tab proportions", () => {
    // Reverted from the cramped 4-tab values (6px / 13px) now that Settings has
    // moved out. The nowrap/ellipsis translation insurance stays.
    const i = css.indexOf(".nav-tab {");
    const navTab = css.slice(i, css.indexOf("}", i));
    expect(navTab).toContain("padding: 10px 16px");
    expect(navTab).toContain("font-size: 14px");
    expect(navTab).toContain("text-overflow: ellipsis");
  });
});

describe("every Advanced control survived the move into Settings", () => {
  // A silent drop during the block move would be easy to miss by eye, since the
  // Settings tab would still look plausible with a control missing.
  const CONTROL_IDS = [
    // Toggles
    "preserveGeoPromptToggle",
    "earlyTzToggle",
    "debuggerModeToggle",
    "debugLoggingToggle",
    // Selects
    "accuracySelect",
    "precisionSelect",
    "localeSelect",
    "themeSelect",
    "languageSelect",
    "verbosityLevel",
    // Reported Language sub-controls
    "localeCustomEdit",
    "localeCustomInput",
    "localeSuggestions",
    "localeCustomConfirm",
    "localeCustomDisplay",
    "localeCustomEditBtn",
    "localeCustomHint",
    "localeWarning",
    "localeProNote",
    // Accuracy sub-controls
    "accuracyCustomInput",
    "accuracyCustomConfirm",
    "accuracyCustomDisplay",
    "accuracyCustomHint",
    // Pro notes + footer
    "accuracyProNote",
    "precisionProNote",
    "preserveGeoPromptProNote",
    "versionLabel",
  ];

  test.each(CONTROL_IDS)("%s is present", (id) => {
    expect(html).toContain(`id="${id}"`);
  });

  test("the settings controls sit inside settingsView, not detailsView", () => {
    const settingsStart = html.indexOf('id="settingsView"');
    const detailsStart = html.indexOf('id="detailsView"');
    expect(settingsStart).toBeGreaterThan(-1);
    expect(detailsStart).toBeGreaterThan(-1);
    // Details comes first, and the controls must land after the Settings marker.
    expect(detailsStart).toBeLessThan(settingsStart);
    for (const id of ["localeSelect", "accuracySelect", "precisionSelect", "themeSelect"]) {
      expect(html.indexOf(`id="${id}"`), id).toBeGreaterThan(settingsStart);
    }
  });

  test("Details keeps its read-only rows", () => {
    // The move must not have taken the actual details with it.
    const settingsStart = html.indexOf('id="settingsView"');
    for (const id of ["detailLocation", "detailTimezone", "detailWebRTC", "detailAPIs"]) {
      const at = html.indexOf(`id="${id}"`);
      expect(at, id).toBeGreaterThan(-1);
      expect(at, `${id} should still be in the Details tab`).toBeLessThan(settingsStart);
    }
  });
});

describe("Language & Locale group in Key Overrides", () => {
  const ids = (hasLocale: boolean): string[] =>
    buildApiGroups(true, true, true, hasLocale).map((g) => g.id);

  test("appears only when a locale is actually active", () => {
    // `off` is the default and overrides nothing, so listing the group would
    // misrepresent what's in effect.
    expect(ids(false)).not.toContain("locale");
    expect(ids(true)).toContain("locale");
  });

  test("lists the surfaces the feature actually overrides", () => {
    const group = buildApiGroups(true, true, true, true).find((g) => g.id === "locale");
    expect(group).toBeDefined();
    for (const api of [
      "navigator.language",
      "navigator.languages",
      "Accept-Language (request header)",
      "Intl.NumberFormat()",
      "Intl.Collator()",
      "String.prototype.localeCompare()",
    ]) {
      expect(group!.apis, api).toContain(api);
    }
  });

  test("does not claim surfaces the feature deliberately leaves native", () => {
    // supportedLocalesOf / getCanonicalLocales report engine capability, not user
    // preference, and are passed through unchanged — claiming them would be a
    // false advertisement in the UI.
    const group = buildApiGroups(true, true, true, true).find((g) => g.id === "locale");
    const joined = group!.apis.join(" ");
    expect(joined).not.toContain("supportedLocalesOf");
    expect(joined).not.toContain("getCanonicalLocales");
  });

  test("its heading is localized", () => {
    expect(messages.details_section_locale).toBeDefined();
    expect(messages.details_section_locale.description).toBeTruthy();
  });

  test("the other groups are unaffected by the new parameter", () => {
    // buildApiGroups gained a trailing arg; existing callers must behave as before.
    expect(buildApiGroups(true, true, true)).toEqual(buildApiGroups(true, true, true, false));
  });
});
