import { describe, it, expect } from "vitest";
import { computeEffectiveEnabled, matchesDomainList } from "@/shared/utils/scope";
import type { ScopeMode } from "@/shared/types/settings";

/**
 * Unit tests for `computeEffectiveEnabled` (Req 6). These cover the
 * master × mode × restricted matrix plus the missing/unparseable URL guards.
 *
 * Requirements traced: 6.1, 6.2, 6.3, 6.4, 6.5, 6.8, 6.9, 16.2.
 */

/** Stub restriction predicate: treats browser-internal schemes as restricted. */
const stubIsRestricted = (url: string): boolean =>
  url.startsWith("about:") || url.startsWith("chrome:") || url.startsWith("moz-extension:");

/** Predicate that is never restricted, to isolate the mode branches. */
const neverRestricted = (): boolean => false;

/** Predicate that is always restricted, to isolate the restricted branch. */
const alwaysRestricted = (): boolean => true;

describe("computeEffectiveEnabled — master switch (Requirement 6.2)", () => {
  const modes: ScopeMode[] = ["all", "allowlist", "denylist"];

  it("returns false when master is off, regardless of mode/lists/url", () => {
    for (const scopeMode of modes) {
      expect(
        computeEffectiveEnabled({
          masterEnabled: false,
          scopeMode,
          allowlist: ["example.com"],
          denylist: ["example.com"],
          topLevelUrl: "https://example.com/page",
          isRestricted: neverRestricted,
        })
      ).toBe(false);
    }
  });

  it("returns false when master is off even for a restricted url", () => {
    expect(
      computeEffectiveEnabled({
        masterEnabled: false,
        scopeMode: "all",
        allowlist: [],
        denylist: [],
        topLevelUrl: "about:blank",
        isRestricted: stubIsRestricted,
      })
    ).toBe(false);
  });
});

describe('computeEffectiveEnabled — "all" mode (Requirements 6.3, 6.8)', () => {
  it("returns true for a non-restricted url", () => {
    expect(
      computeEffectiveEnabled({
        masterEnabled: true,
        scopeMode: "all",
        allowlist: [],
        denylist: [],
        topLevelUrl: "https://example.com/page",
        isRestricted: neverRestricted,
      })
    ).toBe(true);
  });

  it("returns false for a restricted url", () => {
    expect(
      computeEffectiveEnabled({
        masterEnabled: true,
        scopeMode: "all",
        allowlist: [],
        denylist: [],
        topLevelUrl: "https://example.com/page",
        isRestricted: alwaysRestricted,
      })
    ).toBe(false);
  });
});

describe('computeEffectiveEnabled — "allowlist" mode (Requirement 6.4)', () => {
  const allowlist = ["example.com"];

  it("returns matchesDomainList(host, allowlist) for a matching host", () => {
    const topLevelUrl = "https://example.com/page";
    const host = new URL(topLevelUrl).hostname;
    const result = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "allowlist",
      allowlist,
      denylist: [],
      topLevelUrl,
      isRestricted: neverRestricted,
    });
    expect(result).toBe(matchesDomainList(host, allowlist));
    expect(result).toBe(true);
  });

  it("matches subdomains of a allowlisted entry", () => {
    const topLevelUrl = "https://app.example.com/page";
    const host = new URL(topLevelUrl).hostname;
    const result = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "allowlist",
      allowlist,
      denylist: [],
      topLevelUrl,
      isRestricted: neverRestricted,
    });
    expect(result).toBe(matchesDomainList(host, allowlist));
    expect(result).toBe(true);
  });

  it("returns matchesDomainList(host, allowlist) for a non-matching host", () => {
    const topLevelUrl = "https://other.org/page";
    const host = new URL(topLevelUrl).hostname;
    const result = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "allowlist",
      allowlist,
      denylist: [],
      topLevelUrl,
      isRestricted: neverRestricted,
    });
    expect(result).toBe(matchesDomainList(host, allowlist));
    expect(result).toBe(false);
  });
});

describe('computeEffectiveEnabled — "denylist" mode (Requirement 6.5)', () => {
  const denylist = ["example.com"];

  it("returns !matchesDomainList(host, denylist) for a matching (denylisted) host", () => {
    const topLevelUrl = "https://example.com/page";
    const host = new URL(topLevelUrl).hostname;
    const result = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "denylist",
      allowlist: [],
      denylist,
      topLevelUrl,
      isRestricted: neverRestricted,
    });
    expect(result).toBe(!matchesDomainList(host, denylist));
    expect(result).toBe(false);
  });

  it("blocks subdomains of a denylisted entry", () => {
    const topLevelUrl = "https://app.example.com/page";
    const host = new URL(topLevelUrl).hostname;
    const result = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "denylist",
      allowlist: [],
      denylist,
      topLevelUrl,
      isRestricted: neverRestricted,
    });
    expect(result).toBe(!matchesDomainList(host, denylist));
    expect(result).toBe(false);
  });

  it("returns !matchesDomainList(host, denylist) for a non-matching host", () => {
    const topLevelUrl = "https://other.org/page";
    const host = new URL(topLevelUrl).hostname;
    const result = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "denylist",
      allowlist: [],
      denylist,
      topLevelUrl,
      isRestricted: neverRestricted,
    });
    expect(result).toBe(!matchesDomainList(host, denylist));
    expect(result).toBe(true);
  });
});

describe("computeEffectiveEnabled — restricted urls (Requirement 6.8)", () => {
  it("returns false for a restricted url even in allowlist mode with a matching host", () => {
    expect(
      computeEffectiveEnabled({
        masterEnabled: true,
        scopeMode: "allowlist",
        allowlist: ["example.com"],
        denylist: [],
        topLevelUrl: "chrome://settings",
        isRestricted: stubIsRestricted,
      })
    ).toBe(false);
  });

  it("returns false for a restricted url in denylist mode that would otherwise spoof", () => {
    expect(
      computeEffectiveEnabled({
        masterEnabled: true,
        scopeMode: "denylist",
        allowlist: [],
        denylist: ["example.com"],
        topLevelUrl: "about:blank",
        isRestricted: stubIsRestricted,
      })
    ).toBe(false);
  });
});

describe("computeEffectiveEnabled — missing/unparseable url (Requirement 6.9)", () => {
  const modes: ScopeMode[] = ["all", "allowlist", "denylist"];

  it("returns false when topLevelUrl is undefined", () => {
    for (const scopeMode of modes) {
      expect(
        computeEffectiveEnabled({
          masterEnabled: true,
          scopeMode,
          allowlist: ["example.com"],
          denylist: ["example.com"],
          topLevelUrl: undefined,
          isRestricted: neverRestricted,
        })
      ).toBe(false);
    }
  });

  it("returns false when topLevelUrl is unparseable", () => {
    expect(
      computeEffectiveEnabled({
        masterEnabled: true,
        scopeMode: "all",
        allowlist: [],
        denylist: [],
        topLevelUrl: "not a url",
        isRestricted: neverRestricted,
      })
    ).toBe(false);
  });

  it("returns false when the parsed hostname is empty", () => {
    // file: URLs parse but have an empty hostname.
    expect(
      computeEffectiveEnabled({
        masterEnabled: true,
        scopeMode: "all",
        allowlist: [],
        denylist: [],
        topLevelUrl: "file:///Users/me/page.html",
        isRestricted: neverRestricted,
      })
    ).toBe(false);
  });
});
