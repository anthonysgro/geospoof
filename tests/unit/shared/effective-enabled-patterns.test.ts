import { describe, it, expect } from "vitest";
import { computeEffectiveEnabled } from "@/shared/utils/scope";

/**
 * Unit tests for `computeEffectiveEnabled` under Advanced Filtering — the
 * URL-based pattern matcher (Req 6). These exercise the new capabilities the
 * old hostname-only matcher could not express: wildcard TLDs, `*.` subdomain
 * patterns, ports, and sub-route/path scoping.
 *   - Property 10: master / restricted / unparseable ⇒ false (Req 6.2, 6.8, 6.9)
 *   - Property 11: mode semantics against the full URL (Req 6.1, 6.3, 6.4, 6.5)
 *   - Property 16 (non-Safari half): the Pro gate is compiled out on the
 *     Firefox/Chrome builds, so `proFeaturesBlocked` has no effect here
 *     (Req 16.5). The Safari-active branch is `__SAFARI__`-guarded and compiled
 *     out under the default (Firefox) test define, so it is not exercised here.
 */

const neverRestricted = (): boolean => false;
const alwaysRestricted = (): boolean => true;

/** Build args with sensible defaults, overridable per test. */
function args(overrides: {
  scopeMode: "all" | "allowlist" | "denylist";
  allowlist?: string[];
  denylist?: string[];
  topLevelUrl: string | undefined;
  masterEnabled?: boolean;
  isRestricted?: (url: string) => boolean;
  proFeaturesBlocked?: boolean;
}) {
  return {
    masterEnabled: overrides.masterEnabled ?? true,
    scopeMode: overrides.scopeMode,
    allowlist: overrides.allowlist ?? [],
    denylist: overrides.denylist ?? [],
    topLevelUrl: overrides.topLevelUrl,
    isRestricted: overrides.isRestricted ?? neverRestricted,
    proFeaturesBlocked: overrides.proFeaturesBlocked,
  };
}

describe("computeEffectiveEnabled — wildcard TLD patterns (allowlist)", () => {
  const allowlist = ["*.ru"];

  it("enables any host under the suffix", () => {
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "allowlist", allowlist, topLevelUrl: "https://example.ru/" })
      )
    ).toBe(true);
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "allowlist", allowlist, topLevelUrl: "https://a.b.ru/x" })
      )
    ).toBe(true);
  });

  it("does not enable hosts outside the suffix", () => {
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "allowlist", allowlist, topLevelUrl: "https://example.com/" })
      )
    ).toBe(false);
  });
});

describe("computeEffectiveEnabled — `*.host` excludes the apex (allowlist)", () => {
  const allowlist = ["*.example.com"];

  it("enables subdomains", () => {
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "allowlist", allowlist, topLevelUrl: "https://app.example.com/" })
      )
    ).toBe(true);
  });

  it("does not enable the apex", () => {
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "allowlist", allowlist, topLevelUrl: "https://example.com/" })
      )
    ).toBe(false);
  });
});

describe("computeEffectiveEnabled — port patterns (allowlist)", () => {
  const allowlist = ["localhost:3000"];

  it("enables only the matching port", () => {
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "allowlist", allowlist, topLevelUrl: "http://localhost:3000/" })
      )
    ).toBe(true);
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "allowlist", allowlist, topLevelUrl: "http://localhost:3001/" })
      )
    ).toBe(false);
  });
});

describe("computeEffectiveEnabled — path patterns (allowlist)", () => {
  const allowlist = ["example.com/app/*"];

  it("enables in-scope sub-routes only", () => {
    expect(
      computeEffectiveEnabled(
        args({
          scopeMode: "allowlist",
          allowlist,
          topLevelUrl: "https://example.com/app/dashboard",
        })
      )
    ).toBe(true);
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "allowlist", allowlist, topLevelUrl: "https://example.com/settings" })
      )
    ).toBe(false);
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "allowlist", allowlist, topLevelUrl: "https://example.com/" })
      )
    ).toBe(false);
  });
});

describe("computeEffectiveEnabled — patterns in denylist mode", () => {
  it("suppresses spoofing under a wildcard TLD, spoofs elsewhere", () => {
    const denylist = ["*.ru"];
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "denylist", denylist, topLevelUrl: "https://example.ru/" })
      )
    ).toBe(false);
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "denylist", denylist, topLevelUrl: "https://example.com/" })
      )
    ).toBe(true);
  });

  it("suppresses spoofing on a denied sub-route only", () => {
    const denylist = ["example.com/tracking/*"];
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "denylist", denylist, topLevelUrl: "https://example.com/tracking/pixel" })
      )
    ).toBe(false);
    expect(
      computeEffectiveEnabled(
        args({ scopeMode: "denylist", denylist, topLevelUrl: "https://example.com/home" })
      )
    ).toBe(true);
  });
});

describe("computeEffectiveEnabled — Property 10 guards with pattern lists", () => {
  const allowlist = ["*.ru", "example.com/app/*"];

  it("master off ⇒ false even when a pattern would match", () => {
    expect(
      computeEffectiveEnabled(
        args({
          scopeMode: "allowlist",
          allowlist,
          topLevelUrl: "https://example.ru/",
          masterEnabled: false,
        })
      )
    ).toBe(false);
  });

  it("restricted URL ⇒ false even when a pattern would match", () => {
    expect(
      computeEffectiveEnabled(
        args({
          scopeMode: "allowlist",
          allowlist,
          topLevelUrl: "https://example.ru/",
          isRestricted: alwaysRestricted,
        })
      )
    ).toBe(false);
  });

  it("unparseable URL ⇒ false", () => {
    expect(
      computeEffectiveEnabled(args({ scopeMode: "allowlist", allowlist, topLevelUrl: "not a url" }))
    ).toBe(false);
    expect(
      computeEffectiveEnabled(args({ scopeMode: "allowlist", allowlist, topLevelUrl: undefined }))
    ).toBe(false);
  });
});

describe("computeEffectiveEnabled — Pro gate is a no-op on non-Safari builds (Req 16.5)", () => {
  it("proFeaturesBlocked does not force 'all' when __SAFARI__ is false", () => {
    // On the Firefox/Chrome build (this test's define), the Pro gate is compiled
    // out, so proFeaturesBlocked must NOT flip an out-of-scope URL to enabled.
    expect(
      computeEffectiveEnabled(
        args({
          scopeMode: "allowlist",
          allowlist: ["*.ru"],
          topLevelUrl: "https://example.com/",
          proFeaturesBlocked: true,
        })
      )
    ).toBe(false);
  });
});
