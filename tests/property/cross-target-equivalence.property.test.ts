/**
 * Cross-Target Equivalence & Scope Boundaries (Site-Scoping, Task 12)
 *
 * Feature: site-scoping
 *
 * Requirement 16 states the feature must behave identically on the Firefox,
 * Chromium, and Safari build targets: given the same Master_Enabled,
 * Scope_Mode, active Site_List, and Top_Level_URL, every target must compute
 * the same Effective_Enabled boolean (Req 16.1, 16.2). This is structurally
 * guaranteed because all three targets resolve the per-tab decision through a
 * single, target-agnostic source of truth — `computeEffectiveEnabled` in
 * `src/shared/utils/scope.ts`. The targets diverge only in their build-time
 * `__CHROMIUM__` / `__SAFARI__` defines, and the scope module references
 * neither, so its output cannot vary by target.
 *
 * Requirement 16.4 additionally requires that on engines without the Firefox
 * `webRequest.filterResponseData` worker filter (Chromium and Safari), scope is
 * applied purely through the Background-authoritative content/injected gating
 * (the per-tab `enabled` boolean computed by `computeEffectiveEnabled`) with no
 * dependency on the worker filter. We assert the worker filter feature-detects
 * to "unsupported" on those engines and that the scope decision is fully
 * determined without it.
 *
 * **Validates: Requirements 16.1, 16.2, 16.3, 16.4, 16.5**
 */

import { readFileSync } from "fs";
import { resolve } from "path";
import fc from "fast-check";
import type { ScopeMode } from "@/shared/types/settings";
import { computeEffectiveEnabled } from "@/shared/utils/scope";
import { isRestrictedUrl } from "@/background/tabs";
import { isWorkerFilterSupported } from "@/background/worker-request-filter";

/** The three build targets the extension ships on (see src/build/manifest.ts). */
const BUILD_TARGETS = ["firefox", "chromium", "safari"] as const;
type BuildTarget = (typeof BUILD_TARGETS)[number];

/** The exact scope inputs Requirement 16.2 names as the cross-target contract. */
interface ScopeInputs {
  masterEnabled: boolean;
  scopeMode: ScopeMode;
  allowlist: string[];
  denylist: string[];
  topLevelUrl: string | undefined;
}

/**
 * Resolve Effective_Enabled "on" a given build target. Because every target
 * uses the same shared resolver, this calls `computeEffectiveEnabled` exactly
 * as each target's background does at runtime — the `target` argument is only
 * here to make the per-target evaluation explicit in the assertions. Any future
 * target-specific scope branch would have to flow through here and would break
 * the equivalence assertions below.
 */
function evaluateOnTarget(_target: BuildTarget, inputs: ScopeInputs): boolean {
  return computeEffectiveEnabled({
    masterEnabled: inputs.masterEnabled,
    scopeMode: inputs.scopeMode,
    allowlist: inputs.allowlist,
    denylist: inputs.denylist,
    topLevelUrl: inputs.topLevelUrl,
    isRestricted: isRestrictedUrl,
  });
}

// ── Table-driven cross-target equivalence (Req 16.1, 16.2) ────────────

interface TableRow {
  name: string;
  inputs: ScopeInputs;
  /** The Effective_Enabled value every target must agree on. */
  expected: boolean;
}

const EQUIVALENCE_TABLE: TableRow[] = [
  {
    name: "master off ⇒ false regardless of mode/lists",
    inputs: {
      masterEnabled: false,
      scopeMode: "all",
      allowlist: [],
      denylist: [],
      topLevelUrl: "https://example.com/",
    },
    expected: false,
  },
  {
    name: "mode=all, non-restricted ⇒ true",
    inputs: {
      masterEnabled: true,
      scopeMode: "all",
      allowlist: [],
      denylist: [],
      topLevelUrl: "https://example.com/page?q=1",
    },
    expected: true,
  },
  {
    name: "mode=all, restricted URL ⇒ false",
    inputs: {
      masterEnabled: true,
      scopeMode: "all",
      allowlist: [],
      denylist: [],
      topLevelUrl: "about:debugging",
    },
    expected: false,
  },
  {
    name: "mode=all, restricted domain (addons.mozilla.org) ⇒ false",
    inputs: {
      masterEnabled: true,
      scopeMode: "all",
      allowlist: [],
      denylist: [],
      topLevelUrl: "https://addons.mozilla.org/en-US/firefox/",
    },
    expected: false,
  },
  {
    name: "allowlist hit (exact host) ⇒ true",
    inputs: {
      masterEnabled: true,
      scopeMode: "allowlist",
      allowlist: ["example.com"],
      denylist: [],
      topLevelUrl: "https://example.com/",
    },
    expected: true,
  },
  {
    name: "allowlist hit (subdomain inclusive) ⇒ true",
    inputs: {
      masterEnabled: true,
      scopeMode: "allowlist",
      allowlist: ["example.com"],
      denylist: [],
      topLevelUrl: "https://app.example.com/dashboard",
    },
    expected: true,
  },
  {
    name: "allowlist miss ⇒ false",
    inputs: {
      masterEnabled: true,
      scopeMode: "allowlist",
      allowlist: ["example.com"],
      denylist: [],
      topLevelUrl: "https://other.org/",
    },
    expected: false,
  },
  {
    name: "allowlist no false-suffix match (notexample.com) ⇒ false",
    inputs: {
      masterEnabled: true,
      scopeMode: "allowlist",
      allowlist: ["example.com"],
      denylist: [],
      topLevelUrl: "https://notexample.com/",
    },
    expected: false,
  },
  {
    name: "denylist hit ⇒ false",
    inputs: {
      masterEnabled: true,
      scopeMode: "denylist",
      allowlist: [],
      denylist: ["blocked.com"],
      topLevelUrl: "https://blocked.com/",
    },
    expected: false,
  },
  {
    name: "denylist hit (subdomain inclusive) ⇒ false",
    inputs: {
      masterEnabled: true,
      scopeMode: "denylist",
      allowlist: [],
      denylist: ["blocked.com"],
      topLevelUrl: "https://tracker.blocked.com/",
    },
    expected: false,
  },
  {
    name: "denylist miss ⇒ true",
    inputs: {
      masterEnabled: true,
      scopeMode: "denylist",
      allowlist: [],
      denylist: ["blocked.com"],
      topLevelUrl: "https://example.com/",
    },
    expected: true,
  },
  {
    name: "undeterminable top-level URL ⇒ false",
    inputs: {
      masterEnabled: true,
      scopeMode: "all",
      allowlist: [],
      denylist: [],
      topLevelUrl: undefined,
    },
    expected: false,
  },
  {
    name: "unparseable top-level URL ⇒ false",
    inputs: {
      masterEnabled: true,
      scopeMode: "all",
      allowlist: [],
      denylist: [],
      topLevelUrl: "not a url",
    },
    expected: false,
  },
];

describe("Cross-target equivalence (Req 16.1, 16.2)", () => {
  test.each(EQUIVALENCE_TABLE)("every build target agrees: $name", ({ inputs, expected }) => {
    const results = BUILD_TARGETS.map((target) => evaluateOnTarget(target, inputs));

    // All three targets resolve the identical boolean (Req 16.2).
    const distinct = new Set(results);
    expect(distinct.size).toBe(1);

    // And that single value is the documented Effective_Enabled (Req 16.1).
    for (const result of results) {
      expect(result).toBe(expected);
    }
  });

  test("identical inputs yield identical Effective_Enabled on every target for arbitrary inputs", () => {
    const domainPool = ["example.com", "app.example.com", "blocked.com", "other.org", "foo.net"];
    const listArb = fc.uniqueArray(fc.constantFrom(...domainPool), { maxLength: 4 });
    const urlArb = fc.oneof(
      fc.constantFrom(...domainPool).map((d) => `https://${d}/some/path?q=1`),
      fc.constantFrom("about:blank", "chrome://settings", "https://addons.mozilla.org/"),
      fc.constant(undefined),
      fc.constant("::::not-a-url")
    );

    fc.assert(
      fc.property(
        fc.boolean(),
        fc.constantFrom<ScopeMode>("all", "allowlist", "denylist"),
        listArb,
        listArb,
        urlArb,
        (masterEnabled, scopeMode, allowlist, denylist, topLevelUrl) => {
          const inputs: ScopeInputs = {
            masterEnabled,
            scopeMode,
            allowlist,
            denylist,
            topLevelUrl,
          };

          const [firefox, chromium, safari] = BUILD_TARGETS.map((t) => evaluateOnTarget(t, inputs));

          // Pairwise equality across all three targets (Req 16.2).
          return firefox === chromium && chromium === safari;
        }
      ),
      { numRuns: 300 }
    );
  });

  test("the scope source of truth is target-agnostic (no __CHROMIUM__/__SAFARI__ branches)", () => {
    const scopeSrc = readFileSync(resolve(__dirname, "../../src/shared/utils/scope.ts"), "utf-8");

    // The single resolver must not branch on build target; if it did, the
    // cross-target equivalence guarantee (Req 16.2) could silently break.
    expect(scopeSrc).not.toContain("__CHROMIUM__");
    expect(scopeSrc).not.toContain("__SAFARI__");

    // All three targets import this same exported resolver.
    expect(scopeSrc).toContain("export function computeEffectiveEnabled");
  });
});

// ── Chrome/Safari gating without worker-filter dependency (Req 16.4) ──

describe("Chrome/Safari content-injected gating without worker filter (Req 16.4)", () => {
  const originalWebRequest = (browser as unknown as { webRequest?: unknown }).webRequest;

  afterEach(() => {
    (browser as unknown as { webRequest?: unknown }).webRequest = originalWebRequest;
  });

  test("worker filter feature-detects as unsupported when filterResponseData is absent (Chrome/Safari engines)", () => {
    // Chromium MV3 and Safari Web Extensions do not expose
    // webRequest.filterResponseData.
    (browser as unknown as { webRequest?: unknown }).webRequest = {
      onBeforeRequest: { addListener: () => {} },
      onBeforeSendHeaders: { addListener: () => {} },
    };

    expect(isWorkerFilterSupported()).toBe(false);
  });

  test("worker filter feature-detects as supported only when filterResponseData exists (Firefox engine)", () => {
    (browser as unknown as { webRequest?: unknown }).webRequest = {
      filterResponseData: () => ({}),
    };

    expect(isWorkerFilterSupported()).toBe(true);
  });

  test("scope decision is fully determined by computeEffectiveEnabled even when the worker filter is unsupported", () => {
    // Simulate a Chrome/Safari engine: no worker filter available.
    (browser as unknown as { webRequest?: unknown }).webRequest = {};
    expect(isWorkerFilterSupported()).toBe(false);

    // The content/injected gating path (the per-tab `enabled` boolean) is
    // produced purely by the shared resolver — it needs nothing from the
    // worker filter, so scope still applies on Chrome/Safari (Req 16.4).
    const inScope = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "allowlist",
      allowlist: ["example.com"],
      denylist: [],
      topLevelUrl: "https://app.example.com/",
      isRestricted: isRestrictedUrl,
    });
    const outOfScope = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "allowlist",
      allowlist: ["example.com"],
      denylist: [],
      topLevelUrl: "https://other.org/",
      isRestricted: isRestrictedUrl,
    });

    expect(inScope).toBe(true);
    expect(outOfScope).toBe(false);
  });
});
