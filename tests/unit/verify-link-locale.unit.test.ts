/**
 * The app's activation and verify links point at locale-prefixed copies on the
 * marketing site. That mapping lives in Swift (`AppLink.siteLocalePrefix`) and
 * has to agree with two lists it cannot import:
 *
 *   - the app's string catalog, which decides what languages the UI can render
 *   - the site's locale-data.mjs, which decides what URL prefixes exist
 *
 * Adding a language to either side without updating the Swift switch produces a
 * link to a page that does not exist, or an English page for a translated user.
 * Neither shows up in a build. These tests are the guard.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const MODEL = join(ROOT, "safari", "Shared (App)", "SpoofModel.swift");
const CONTROL_PANEL = join(ROOT, "safari", "Shared (App)", "SpoofControlPanel.swift");
const DETAILS = join(ROOT, "safari", "Shared (App)", "SpoofDetailsView.swift");
const CATALOG = join(ROOT, "safari", "Shared (App)", "Resources", "Localizable.xcstrings");
const LOCALE_DATA = join(ROOT, "site", "src", "lib", "i18n", "locale-data.mjs");

const model = readFileSync(MODEL, "utf8");
const controlPanel = readFileSync(CONTROL_PANEL, "utf8");
const details = readFileSync(DETAILS, "utf8");
const swift = `${model}\n${controlPanel}\n${details}`;

/** The body of `static var siteLocalePrefix: String { ... }`. */
function siteLocalePrefixBody(): string {
  const start = model.indexOf("static var siteLocalePrefix: String {");
  expect(
    start,
    "siteLocalePrefix was renamed or removed — update this test to match"
  ).toBeGreaterThan(-1);
  const end = model.indexOf("\n    }", start);
  expect(end).toBeGreaterThan(start);
  return model.slice(start, end);
}

/**
 * App language code -> site URL prefix, parsed out of the Swift switch. Parses
 * the real source so the test cannot pass against a stale copy of the mapping.
 */
function parseSwiftMapping(): Map<string, string> {
  const body = siteLocalePrefixBody();
  const map = new Map<string, string>();
  // case "de", "es", ...: return "/\(language)"   — passthrough form
  // case "zh-Hans": return "/zh-CN"               — explicit form
  for (const line of body.split("\n")) {
    const m = line.match(/^\s*case\s+(.+?):\s*return\s+"(.*?)"\s*$/);
    if (!m) continue;
    const codes = [...m[1].matchAll(/"([^"]+)"/g)].map((c) => c[1]);
    const target = m[2];
    for (const code of codes) {
      map.set(code, target === "/\\(language)" ? `/${code}` : target.replace(/\\/g, ""));
    }
  }
  return map;
}

/** Locales the app string catalog can actually render, including the source. */
function appLocales(): string[] {
  const catalog = JSON.parse(readFileSync(CATALOG, "utf8")) as {
    sourceLanguage: string;
    strings: Record<string, { localizations?: Record<string, unknown> }>;
  };
  const found = new Set<string>([catalog.sourceLanguage]);
  for (const entry of Object.values(catalog.strings)) {
    for (const locale of Object.keys(entry.localizations ?? {})) {
      found.add(locale);
    }
  }
  return [...found].sort();
}

/** Locale codes the site serves, and its default (which is unprefixed). */
function siteLocales(): { codes: string[]; defaultLocale: string } {
  const src = readFileSync(LOCALE_DATA, "utf8");
  const defaultLocale = src.match(/export const defaultLocale = "([^"]+)"/)?.[1];
  expect(defaultLocale, "could not parse defaultLocale").toBeTruthy();
  const listStart = src.indexOf("export const localeList = [");
  const listEnd = src.indexOf("\n]", listStart);
  const list = src.slice(listStart, listEnd);
  const codes = [...list.matchAll(/code:\s*"([^"]+)"/g)].map((m) => m[1]);
  expect(codes.length).toBeGreaterThan(1);
  return { codes, defaultLocale: defaultLocale! };
}

describe("verify link locale mapping", () => {
  const mapping = parseSwiftMapping();
  const app = appLocales();
  const { codes: site, defaultLocale } = siteLocales();

  it("parses a non-trivial mapping out of the Swift source", () => {
    expect(mapping.size).toBeGreaterThan(5);
  });

  it("only ever produces prefixes the site actually serves", () => {
    const prefixed = site.filter((c) => c !== defaultLocale).map((c) => `/${c}`);
    for (const [appLocale, prefix] of mapping) {
      expect(
        prefixed,
        `${appLocale} maps to "${prefix}", which is not a site locale prefix. ` +
          `Site serves: ${prefixed.join(", ")}`
      ).toContain(prefix);
    }
  });

  it("maps every app language that has a matching site locale", () => {
    // pt-BR matches outright; zh-Hans is the app's code for the site's zh-CN.
    const equivalent: Record<string, string> = { "zh-Hans": "zh-CN" };
    for (const appLocale of app) {
      if (appLocale === "en") continue;
      const siteCode = equivalent[appLocale] ?? appLocale;
      if (!site.includes(siteCode)) continue;
      expect(
        mapping.get(appLocale),
        `the app ships ${appLocale} and the site translates ${siteCode}, but ` +
          `siteLocalePrefix does not map it — those users would get English`
      ).toBe(`/${siteCode}`);
    }
  });

  it("does not map app languages the site has no translation for", () => {
    const equivalent: Record<string, string> = { "zh-Hans": "zh-CN" };
    for (const appLocale of app) {
      const siteCode = equivalent[appLocale] ?? appLocale;
      if (site.includes(siteCode)) continue;
      expect(
        mapping.has(appLocale),
        `${appLocale} has no site translation, so it must fall through to ` +
          `unprefixed English rather than linking to a nonexistent /${appLocale}`
      ).toBe(false);
    }
  });

  it("never maps the site's default locale to a prefix", () => {
    expect(mapping.has(defaultLocale)).toBe(false);
  });

  it("keeps zh-Hans mapped to the site's regional code, not the script code", () => {
    // The one case where the two systems genuinely disagree on the code.
    expect(app).toContain("zh-Hans");
    expect(site).toContain("zh-CN");
    expect(site).not.toContain("zh-Hans");
    expect(mapping.get("zh-Hans")).toBe("/zh-CN");
  });

  it("flags a site locale the app could support but does not yet ship", () => {
    // Not a failure: the site may translate a language before the app does. This
    // records the gap so it is a decision rather than an oversight.
    const equivalent: Record<string, string> = { "zh-CN": "zh-Hans" };
    const missing = site
      .filter((c) => c !== defaultLocale)
      .filter((c) => !app.includes(equivalent[c] ?? c));
    expect(
      missing,
      `site translates ${missing.join(", ")} but the app catalog does not — ` +
        `either add the language to the app or accept those users see English`
    ).toEqual([]);
  });
});

describe("verify link construction", () => {
  it("builds both verify URLs through the shared locale-aware helper", () => {
    // Two entry points (home link, setup card). Both must go through
    // verifyURL(campaign:) or one of them silently stops following the language.
    const calls = [...controlPanel.matchAll(/verifyURL\(campaign:\s*"([^"]+)"\)/g)].map(
      (m) => m[1]
    );
    expect(calls.sort()).toEqual(["verify", "verify-setup"]);
  });

  it("has no hardcoded verify URL left behind", () => {
    const hardcoded = [...swift.matchAll(/"https:\/\/[^"]*\/verify[^"]*"/g)].map((m) => m[0]);
    expect(hardcoded, "a literal verify URL bypasses the locale prefix").toEqual([]);
  });

  it("uses the www host, which is what the site serves without redirecting", () => {
    const body = model.slice(model.indexOf("enum AppLink {"));
    expect(body).toContain("https://www.geospoof.com");
  });

  it("routes verify through the shared locale-aware site helper", () => {
    const start = controlPanel.indexOf("private func verifyURL(campaign:");
    const body = controlPanel.slice(start, controlPanel.indexOf("\n    }", start));
    expect(body).toContain('AppLink.site("/verify", campaign: campaign, localized: true)');
  });

  it("routes activation through the same locale-aware site helper", () => {
    const start = details.indexOf("private func openSafariActivationPage()");
    const body = details.slice(start, details.indexOf("\n    }", start));
    expect(body).toMatch(
      /AppLink\.site\(\s*"\/activate",\s*campaign:\s*"onboarding-activate",\s*localized:\s*true\s*\)/
    );
  });

  it("reads the language from the bundle, not the raw system preference", () => {
    // Locale.current would report a language the app has no catalog for, which
    // would prefix the URL for a locale the user is not actually seeing.
    const body = siteLocalePrefixBody();
    expect(body).toContain("Bundle.main.preferredLocalizations.first");
    expect(body).not.toContain("Locale.current");
    expect(body).not.toContain("Locale.preferredLanguages");
  });

  it("falls through to English instead of trapping on an unknown language", () => {
    const body = siteLocalePrefixBody();
    expect(body).toMatch(/default:\s*return ""/);
  });
});
