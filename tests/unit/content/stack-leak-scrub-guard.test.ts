/**
 * Regression guard for the extension-id stack-leak class.
 *
 * The leak: any Error whose stack still names our `chrome-extension://…/
 * injected.js` resource when it reaches the page exposes the extension id.
 * Method/getter overrides are covered structurally by the `stripConstruct`
 * scrub net (which now also scrubs promise rejections). The remaining risk is
 * RAW global constructor/callable installs — `Date`, `Worker`, `SharedWorker`,
 * `RTCPeerConnection`, `Intl.DateTimeFormat`, `Function.prototype.toString` —
 * which bypass that net and must scrub their own throw paths.
 *
 * This test is the "guarded" half of the fix: it scans every injected module and
 * fails if a file that installs such a raw global doesn't reference
 * `stripExtensionFramesFromStack`. A future raw override that forgets the scrub
 * trips this immediately, instead of shipping a fresh id leak. It also pins the
 * known fix sites so a scrub can't be quietly deleted.
 *
 * This is a static source scan, so it runs in CI with no browser/extension —
 * complementing the in-browser detection batteries on geospoof.com/test
 * (`tostring-stack-leak`, `constructor-stack-leak`) which prove the behaviour
 * end-to-end.
 */

import { describe, test, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { resolve } from "path";

const INJECTED_DIR = resolve(__dirname, "../../../src/content/injected");
const SCRUB = "stripExtensionFramesFromStack";

function injectedFiles(): Array<string> {
  return readdirSync(INJECTED_DIR).filter((f) => f.endsWith(".ts"));
}

function read(file: string): string {
  return readFileSync(resolve(INJECTED_DIR, file), "utf-8");
}

/**
 * Signals that a file installs a raw global constructor/callable that bypasses
 * the `stripConstruct` scrub net. Any file matching one of these MUST reference
 * the scrub helper so its own throw/reject paths can't leak the id.
 */
const RAW_GLOBAL_INSTALL_SIGNALS: ReadonlyArray<{ label: string; re: RegExp }> = [
  {
    label: 'Object.defineProperty(global, "RTCPeerConnection"|"Worker"|"SharedWorker"|"Date")',
    re: /Object\.defineProperty\(\s*(?:globalThis|window|self)\s*,\s*["'](?:RTCPeerConnection|Worker|SharedWorker|Date)["']/,
  },
  { label: "target.Date = <override>", re: /\.Date\s*=\s*\w*[Dd]ate\w*(?:Override)?\b/ },
  { label: "intl.DateTimeFormat = <override>", re: /\.DateTimeFormat\s*=\s*\w+/ },
  { label: "Function.prototype.toString = <override>", re: /Function\.prototype\.toString\s*=/ },
  {
    label: "class ... extends NativeCtor (RTCPeerConnection wrapper)",
    re: /class\s+\w+\s+extends\s+NativeCtor\b/,
  },
];

describe("stack-leak scrub guard — raw global installs must scrub", () => {
  const files = injectedFiles();

  test("finds injected source files to scan", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  for (const file of injectedFiles()) {
    const content = read(file);
    const matched = RAW_GLOBAL_INSTALL_SIGNALS.filter((s) => s.re.test(content));
    if (matched.length === 0) continue;

    test(`${file} installs a raw global (${matched
      .map((m) => m.label)
      .join(", ")}) and references ${SCRUB}`, () => {
      expect(
        content.includes(SCRUB),
        `${file} installs a raw global constructor/callable but never references ${SCRUB}. ` +
          `Raw installs bypass the stripConstruct scrub net, so their throw/reject paths ` +
          `leak the extension id in Error stacks. Wrap the throwing paths with ${SCRUB} ` +
          `(delegate-then-scrub), as in date-constructor.ts / worker-patching.ts / webrtc.ts.`
      ).toBe(true);
    });
  }
});

describe("stack-leak scrub guard — known fix sites are pinned", () => {
  const PINNED: ReadonlyArray<{ file: string; note: string }> = [
    {
      file: "function-masking.ts",
      note: "Function.prototype.toString delegate + stripConstruct net",
    },
    { file: "date-constructor.ts", note: "Date constructor + Date.parse throw scrub" },
    { file: "worker-patching.ts", note: "Worker + SharedWorker throw scrub" },
    { file: "webrtc.ts", note: "RTCPeerConnection super() + getStats scrub" },
    { file: "timezone-overrides.ts", note: "Intl.DateTimeFormat invalid-timeZone scrub" },
    { file: "permissions.ts", note: "permissions.query rejection scrub" },
    { file: "geolocation.ts", note: "foreign-this native-error scrub (reproduceNativeGeoError)" },
    { file: "error-report-sanitizer.ts", note: "uncaught-path filename/onerror scrub" },
  ];

  for (const { file, note } of PINNED) {
    test(`${file} retains its scrub (${note})`, () => {
      expect(
        read(file).includes(SCRUB),
        `${file} lost its ${SCRUB} reference — a stack-leak scrub was removed (${note}).`
      ).toBe(true);
    });
  }
});

describe("stack-leak scrub guard — stripConstruct scrubs promise rejections", () => {
  // The register leak was an async rejection that the sync-only scrub missed.
  // Lock in that stripConstruct handles the thenable/rejection path.
  test("function-masking.ts stripConstruct handles thenable rejections", () => {
    const content = read("function-masking.ts");
    // The rejection arm attaches a scrub via `.then(undefined, ...)` on a
    // returned thenable. Assert both the thenable detection and the scrub exist
    // in the stripConstruct region.
    expect(content).toMatch(/\.then\s*===\s*["']function["']/);
    expect(content).toMatch(/\.then\(\s*undefined\s*,/);
  });
});
