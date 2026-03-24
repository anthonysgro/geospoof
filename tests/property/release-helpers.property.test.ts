/**
 * Property-Based Tests for Release Helper Functions
 * Feature: dual-channel-release
 *
 * Tests the 6 correctness properties defined in the design document
 * for the pure helper functions used in the dual-channel release pipeline.
 */

import fc from "fast-check";
import {
  extractBaseVersion,
  buildNightlyVersion,
  isNewerVersion,
  versionsMatch,
  generateUpdateManifest,
  formatSignedXpiName,
} from "../../scripts/release-helpers";

const GECKO_ID = "{a8f7e9c2-4d3b-4a1e-9f8c-7b6d5e4a3c2b}";

/** Arbitrary for a valid semver string (e.g. "1.18.0", "0.0.1"). */
const semverArb = fc
  .tuple(
    fc.integer({ min: 0, max: 999 }),
    fc.integer({ min: 0, max: 999 }),
    fc.integer({ min: 0, max: 999 })
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`);

/** Arbitrary for a positive run number. */
const runNumberArb = fc.integer({ min: 1, max: 999999 });

/** Arbitrary for a simple URL string. */
const urlArb = fc.tuple(fc.constantFrom("https://", "http://"), fc.webUrl()).map(([, url]) => url);

/**
 * Property 1: Tag version extraction strips prefix and suffix
 *
 * For any valid semver string S and any boolean isAmo, constructing a tag as
 * `v${S}` (or `v${S}-amo` if isAmo) and then extracting the base version
 * should yield exactly S.
 *
 * Validates: Requirements 3.3
 */
describe("Feature: dual-channel-release, Property 1: Tag version extraction strips prefix and suffix", () => {
  test("extractBaseVersion round-trips through regular tag construction", () => {
    fc.assert(
      fc.property(semverArb, (version) => {
        const tag = `v${version}`;
        expect(extractBaseVersion(tag)).toBe(version);
      }),
      { numRuns: 100 }
    );
  });

  test("extractBaseVersion round-trips through AMO tag construction", () => {
    fc.assert(
      fc.property(semverArb, (version) => {
        const tag = `v${version}-amo`;
        expect(extractBaseVersion(tag)).toBe(version);
      }),
      { numRuns: 100 }
    );
  });

  test("extractBaseVersion handles both tag patterns identically", () => {
    fc.assert(
      fc.property(semverArb, fc.boolean(), (version, isAmo) => {
        const tag = isAmo ? `v${version}-amo` : `v${version}`;
        expect(extractBaseVersion(tag)).toBe(version);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 2: Nightly version construction
 *
 * For any valid semver base version V and any positive integer run number N,
 * the computed nightly version should equal `${V}.${N}` (4-segment, AMO-compatible).
 *
 * Validates: Requirements 4.1
 */
describe("Feature: dual-channel-release, Property 2: Nightly version construction", () => {
  test("buildNightlyVersion produces correct 4-segment format", () => {
    fc.assert(
      fc.property(semverArb, runNumberArb, (base, runNumber) => {
        const result = buildNightlyVersion(base, runNumber);
        expect(result).toBe(`${base}.${runNumber}`);
      }),
      { numRuns: 100 }
    );
  });

  test("buildNightlyVersion output is a valid AMO version (dot-separated integers)", () => {
    fc.assert(
      fc.property(semverArb, runNumberArb, (base, runNumber) => {
        const result = buildNightlyVersion(base, runNumber);
        expect(result).toMatch(/^\d+\.\d+\.\d+\.\d+$/);
        expect(result.startsWith(base)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 3: Higher base version is newer than any nightly of a lower base
 *
 * For any valid semver base version V and any positive integer run number N,
 * a version with a higher minor (V.minor+1) should be strictly newer than
 * V.N (the 4-segment nightly). This ensures AMO listed releases (which use
 * a higher base version) are always newer than self-hosted nightlies.
 *
 * Validates: Requirements 4.5
 */
describe("Feature: dual-channel-release, Property 3: AMO version is newer than any nightly of a lower base", () => {
  /** Arbitrary for a semver where minor can be bumped without overflow. */
  const bumpableSemverArb = fc
    .tuple(
      fc.integer({ min: 0, max: 999 }),
      fc.integer({ min: 0, max: 998 }),
      fc.integer({ min: 0, max: 999 })
    )
    .map(([major, minor, patch]) => ({
      base: `${major}.${minor}.${patch}`,
      bumped: `${major}.${minor + 1}.0`,
    }));

  test("bumped version is always newer than nightly of the original base", () => {
    fc.assert(
      fc.property(bumpableSemverArb, runNumberArb, ({ base, bumped }, runNumber) => {
        const nightly = buildNightlyVersion(base, runNumber);
        expect(isNewerVersion(bumped, nightly)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test("nightly is never newer than a bumped version", () => {
    fc.assert(
      fc.property(bumpableSemverArb, runNumberArb, ({ base, bumped }, runNumber) => {
        const nightly = buildNightlyVersion(base, runNumber);
        expect(isNewerVersion(nightly, bumped)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  test("identical versions are not newer than each other", () => {
    fc.assert(
      fc.property(semverArb, (version) => {
        expect(isNewerVersion(version, version)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 4: Tag-to-package version mismatch detection
 *
 * For any two valid semver strings tagVersion and packageVersion,
 * versionsMatch returns true iff tagVersion === packageVersion.
 *
 * Validates: Requirements 4.4
 */
describe("Feature: dual-channel-release, Property 4: Tag-to-package version mismatch detection", () => {
  test("versionsMatch returns true for identical versions", () => {
    fc.assert(
      fc.property(semverArb, (version) => {
        expect(versionsMatch(version, version)).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test("versionsMatch returns false for different versions", () => {
    fc.assert(
      fc.property(semverArb, semverArb, (tagVersion, packageVersion) => {
        fc.pre(tagVersion !== packageVersion);
        expect(versionsMatch(tagVersion, packageVersion)).toBe(false);
      }),
      { numRuns: 100 }
    );
  });

  test("versionsMatch is symmetric", () => {
    fc.assert(
      fc.property(semverArb, semverArb, (a, b) => {
        expect(versionsMatch(a, b)).toBe(versionsMatch(b, a));
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 5: Update manifest contains correct version and URL
 *
 * For any valid version string V and any valid URL string U, the generated
 * update manifest JSON should contain V as the version and U as the
 * update_link, nested under the correct gecko addon ID.
 *
 * Validates: Requirements 5.1
 */
describe("Feature: dual-channel-release, Property 5: Update manifest contains correct version and URL", () => {
  test("manifest contains the provided version and URL under the gecko ID", () => {
    fc.assert(
      fc.property(semverArb, urlArb, (version, url) => {
        const manifest = generateUpdateManifest(version, url) as {
          addons: Record<string, { updates: Array<{ version: string; update_link: string }> }>;
        };

        expect(manifest.addons).toBeDefined();
        expect(manifest.addons[GECKO_ID]).toBeDefined();
        expect(manifest.addons[GECKO_ID].updates).toHaveLength(1);
        expect(manifest.addons[GECKO_ID].updates[0].version).toBe(version);
        expect(manifest.addons[GECKO_ID].updates[0].update_link).toBe(url);
      }),
      { numRuns: 100 }
    );
  });

  test("manifest has exactly one addon entry", () => {
    fc.assert(
      fc.property(semverArb, urlArb, (version, url) => {
        const manifest = generateUpdateManifest(version, url) as {
          addons: Record<string, unknown>;
        };
        expect(Object.keys(manifest.addons)).toHaveLength(1);
        expect(Object.keys(manifest.addons)[0]).toBe(GECKO_ID);
      }),
      { numRuns: 100 }
    );
  });
});

/**
 * Property 6: Signed XPI filename formatting
 *
 * For any valid semver base version V, the rename target should equal
 * `geospoof-${V}-signed.xpi`.
 *
 * Validates: Requirements 5.4
 */
describe("Feature: dual-channel-release, Property 6: Signed XPI filename formatting", () => {
  test("formatSignedXpiName produces correct filename", () => {
    fc.assert(
      fc.property(semverArb, (version) => {
        const result = formatSignedXpiName(version);
        expect(result).toBe(`geospoof-${version}-signed.xpi`);
      }),
      { numRuns: 100 }
    );
  });

  test("formatSignedXpiName output starts with geospoof- and ends with -signed.xpi", () => {
    fc.assert(
      fc.property(semverArb, (version) => {
        const result = formatSignedXpiName(version);
        expect(result.startsWith("geospoof-")).toBe(true);
        expect(result.endsWith("-signed.xpi")).toBe(true);
      }),
      { numRuns: 100 }
    );
  });

  test("formatSignedXpiName embeds the version in the filename", () => {
    fc.assert(
      fc.property(semverArb, (version) => {
        const result = formatSignedXpiName(version);
        expect(result).toContain(version);
      }),
      { numRuns: 100 }
    );
  });
});
