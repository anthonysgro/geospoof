/**
 * App Store listing metadata parity guard.
 *
 * `fastlane deliver` uploads whatever sits in safari/fastlane/metadata/<locale>/.
 * App Store Connect silently rejects (or truncates) overlong fields, and a missing
 * locale folder means that storefront quietly keeps stale copy. Neither failure is
 * visible in a build log, so assert the tree here instead.
 *
 * The layout is flat on purpose. `deliver` validates every directory inside
 * `metadata_path` against its list of App Store locales and aborts on anything it
 * doesn't recognise — and it does that even when `skip_metadata: true`, so a
 * platform subfolder like `metadata/ios/` fails a routine binary-only upload with
 * "Unsupported directory name(s)". When macOS copy is written it needs its own
 * tree plus an explicit `metadata_path` on the macOS lane, not a subfolder here.
 *
 * Companion to native-catalog-parity.unit.test.ts, which guards the in-app strings.
 * Together they cover both halves of the 12-language surface: the app UI and the listing.
 */

import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";
import { SUPPORTED_UI_LOCALES, toAppleLocaleCode } from "../../src/shared/i18n/locales";

const METADATA_ROOT = join(__dirname, "../../safari/fastlane/metadata");

/**
 * App Store Connect field limits. Apple does not publish these as an API; they are
 * enforced in the ASC web form and by the REST API on submit. Exceeding them is a
 * submission-time rejection, which is far more expensive to discover than a test.
 */
const FIELD_LIMITS: Record<string, number> = {
  "name.txt": 30,
  "subtitle.txt": 30,
  "keywords.txt": 100,
  "promotional_text.txt": 170,
  "description.txt": 4000,
  "release_notes.txt": 4000,
};

/** Fields we require in every locale. Others (release_notes, URLs) are optional. */
const REQUIRED_FIELDS = [
  "name.txt",
  "subtitle.txt",
  "keywords.txt",
  "promotional_text.txt",
  "description.txt",
];

/**
 * App Store Connect locale codes, derived from the same single source of truth the
 * app catalog uses. ASC is a third vocabulary: `_locales` uses `pt_BR`/`zh_CN`,
 * Apple platforms use `pt-BR`/`zh-Hans`, and ASC needs region suffixes on some
 * languages (`de-DE`) but not others (`ja`). Encode only the ASC-specific delta here.
 */
const ASC_REGION_SUFFIX: Record<string, string> = {
  en: "en-US",
  de: "de-DE",
  es: "es-ES",
  fr: "fr-FR",
  nl: "nl-NL",
};

function ascLocaleCode(uiLocale: string): string {
  const apple = toAppleLocaleCode(uiLocale);
  return ASC_REGION_SUFFIX[apple] ?? apple;
}

const EXPECTED_LOCALES = SUPPORTED_UI_LOCALES.map((l) => ascLocaleCode(l.code));

function localeDirs(): string[] {
  if (!existsSync(METADATA_ROOT)) return [];
  return readdirSync(METADATA_ROOT)
    .filter((n) => statSync(join(METADATA_ROOT, n)).isDirectory())
    .sort();
}

function read(locale: string, file: string): string {
  // deliver applies .strip() to every value before upload, so compare stripped.
  return readFileSync(join(METADATA_ROOT, locale, file), "utf-8").trim();
}

describe("App Store metadata parity", () => {
  const present = localeDirs();

  it("has a locale folder for every supported UI locale", () => {
    const missing = EXPECTED_LOCALES.filter((l) => !present.includes(l));
    expect(missing, `missing App Store locale folders: ${missing.join(", ")}`).toEqual([]);
  });

  it("has no directory that deliver would reject", () => {
    // deliver aborts the whole upload on an unrecognized directory name, even
    // when skip_metadata is true. A platform subfolder here breaks binary-only
    // releases, which is exactly how this bit us once.
    const extra = present.filter((l) => !EXPECTED_LOCALES.includes(l));
    expect(extra, `unexpected directories under fastlane/metadata: ${extra.join(", ")}`).toEqual(
      []
    );
  });

  for (const locale of EXPECTED_LOCALES) {
    describe(locale, () => {
      it("has every required field file", () => {
        const missing = REQUIRED_FIELDS.filter((f) => !existsSync(join(METADATA_ROOT, locale, f)));
        expect(missing, `${locale} missing: ${missing.join(", ")}`).toEqual([]);
      });

      it("keeps every field within its App Store Connect limit", () => {
        const over: string[] = [];
        for (const file of REQUIRED_FIELDS) {
          if (!existsSync(join(METADATA_ROOT, locale, file))) continue;
          const len = read(locale, file).length;
          const limit = FIELD_LIMITS[file];
          if (len > limit) over.push(`${file}: ${len}/${limit}`);
        }
        expect(over, `${locale} over limit — ${over.join("; ")}`).toEqual([]);
      });

      it("has no empty field, which would leave stale copy live", () => {
        // deliver skips empty values rather than clearing them, so an empty
        // file silently ships whatever is already in App Store Connect.
        const empty = REQUIRED_FIELDS.filter((f) => {
          const path = join(METADATA_ROOT, locale, f);
          return existsSync(path) && read(locale, f).length === 0;
        });
        expect(empty, `${locale} has empty fields: ${empty.join(", ")}`).toEqual([]);
      });

      it("keeps the required legal links in the description", () => {
        // Guideline 3.1.2 requires functional links to the terms of use and
        // privacy policy wherever auto-renewable subscriptions are described.
        const desc = read(locale, "description.txt");
        expect(desc, `${locale} description is missing the EULA link`).toContain(
          "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/"
        );
        expect(desc, `${locale} description is missing the privacy policy link`).toContain(
          "https://www.geospoof.com/privacy"
        );
      });

      it("matches the English description structure", () => {
        // The listing renders line breaks literally, so paragraph and bullet
        // counts are load-bearing layout, not incidental whitespace.
        const en = read("en-US", "description.txt");
        const mine = read(locale, "description.txt");
        expect(mine.split("\n\n").length, `${locale} paragraph-break count drifted`).toBe(
          en.split("\n\n").length
        );
        expect((mine.match(/•/g) ?? []).length, `${locale} feature-bullet count drifted`).toBe(
          (en.match(/•/g) ?? []).length
        );
      });

      it("leads the subtitle with GPS", () => {
        // Deliberate ASO decision recorded in assets/store-listings/listing-copy.md:
        // GPS is the higher-intent query. Two locales had to be reworded to fit
        // it inside 30 characters, so assert it rather than trusting review.
        const subtitle = read(locale, "subtitle.txt");
        expect(subtitle.toUpperCase().startsWith("GPS"), `${locale} subtitle: ${subtitle}`).toBe(
          true
        );
      });

      it("uses comma-separated keywords with no wasted spaces", () => {
        // Apple counts every character, including the space after a comma.
        const kw = read(locale, "keywords.txt");
        expect(kw, `${locale} keywords waste characters on ", "`).not.toMatch(/,\s/);
        expect(kw, `${locale} keywords have an empty entry`).not.toMatch(/,,|^,|,$/);
      });

      it("does not repeat name or subtitle tokens in keywords", () => {
        // Apple builds search phrases by combining tokens across name, subtitle
        // and keywords, so a repeat spends characters that buy no extra reach.
        const tokens = new Set(
          `${read(locale, "name.txt")} ${read(locale, "subtitle.txt")}`
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter(Boolean)
        );
        const repeated = read(locale, "keywords.txt")
          .split(",")
          .map((k) => k.trim().toLowerCase())
          .filter((k) => k && tokens.has(k));
        expect(
          repeated,
          `${locale} keywords duplicate name/subtitle: ${repeated.join(", ")}`
        ).toEqual([]);
      });

      it("has no markdown, which the App Store renders literally", () => {
        // `**NEW**` shipped to production once and displayed as visible asterisks.
        for (const f of ["promotional_text.txt", "description.txt", "subtitle.txt", "name.txt"]) {
          expect(read(locale, f), `${locale}/${f} contains markdown emphasis`).not.toMatch(
            /\*\*|__/
          );
        }
      });
    });
  }
});
