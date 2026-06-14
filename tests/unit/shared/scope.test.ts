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
  const modes: ScopeMode[] = ["all", "whitelist", "blacklist"];

  it("returns false when master is off, regardless of mode/lists/url", () => {
    for (const scopeMode of modes) {
      expect(
        computeEffectiveEnabled({
          masterEnabled: false,
          scopeMode,
          whitelist: ["example.com"],
          blacklist: ["example.com"],
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
        whitelist: [],
        blacklist: [],
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
        whitelist: [],
        blacklist: [],
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
        whitelist: [],
        blacklist: [],
        topLevelUrl: "https://example.com/page",
        isRestricted: alwaysRestricted,
      })
    ).toBe(false);
  });
});

describe('computeEffectiveEnabled — "whitelist" mode (Requirement 6.4)', () => {
  const whitelist = ["example.com"];

  it("returns matchesDomainList(host, whitelist) for a matching host", () => {
    const topLevelUrl = "https://example.com/page";
    const host = new URL(topLevelUrl).hostname;
    const result = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "whitelist",
      whitelist,
      blacklist: [],
      topLevelUrl,
      isRestricted: neverRestricted,
    });
    expect(result).toBe(matchesDomainList(host, whitelist));
    expect(result).toBe(true);
  });

  it("matches subdomains of a whitelisted entry", () => {
    const topLevelUrl = "https://app.example.com/page";
    const host = new URL(topLevelUrl).hostname;
    const result = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "whitelist",
      whitelist,
      blacklist: [],
      topLevelUrl,
      isRestricted: neverRestricted,
    });
    expect(result).toBe(matchesDomainList(host, whitelist));
    expect(result).toBe(true);
  });

  it("returns matchesDomainList(host, whitelist) for a non-matching host", () => {
    const topLevelUrl = "https://other.org/page";
    const host = new URL(topLevelUrl).hostname;
    const result = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "whitelist",
      whitelist,
      blacklist: [],
      topLevelUrl,
      isRestricted: neverRestricted,
    });
    expect(result).toBe(matchesDomainList(host, whitelist));
    expect(result).toBe(false);
  });
});

describe('computeEffectiveEnabled — "blacklist" mode (Requirement 6.5)', () => {
  const blacklist = ["example.com"];

  it("returns !matchesDomainList(host, blacklist) for a matching (blacklisted) host", () => {
    const topLevelUrl = "https://example.com/page";
    const host = new URL(topLevelUrl).hostname;
    const result = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "blacklist",
      whitelist: [],
      blacklist,
      topLevelUrl,
      isRestricted: neverRestricted,
    });
    expect(result).toBe(!matchesDomainList(host, blacklist));
    expect(result).toBe(false);
  });

  it("blocks subdomains of a blacklisted entry", () => {
    const topLevelUrl = "https://app.example.com/page";
    const host = new URL(topLevelUrl).hostname;
    const result = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "blacklist",
      whitelist: [],
      blacklist,
      topLevelUrl,
      isRestricted: neverRestricted,
    });
    expect(result).toBe(!matchesDomainList(host, blacklist));
    expect(result).toBe(false);
  });

  it("returns !matchesDomainList(host, blacklist) for a non-matching host", () => {
    const topLevelUrl = "https://other.org/page";
    const host = new URL(topLevelUrl).hostname;
    const result = computeEffectiveEnabled({
      masterEnabled: true,
      scopeMode: "blacklist",
      whitelist: [],
      blacklist,
      topLevelUrl,
      isRestricted: neverRestricted,
    });
    expect(result).toBe(!matchesDomainList(host, blacklist));
    expect(result).toBe(true);
  });
});

describe("computeEffectiveEnabled — restricted urls (Requirement 6.8)", () => {
  it("returns false for a restricted url even in whitelist mode with a matching host", () => {
    expect(
      computeEffectiveEnabled({
        masterEnabled: true,
        scopeMode: "whitelist",
        whitelist: ["example.com"],
        blacklist: [],
        topLevelUrl: "chrome://settings",
        isRestricted: stubIsRestricted,
      })
    ).toBe(false);
  });

  it("returns false for a restricted url in blacklist mode that would otherwise spoof", () => {
    expect(
      computeEffectiveEnabled({
        masterEnabled: true,
        scopeMode: "blacklist",
        whitelist: [],
        blacklist: ["example.com"],
        topLevelUrl: "about:blank",
        isRestricted: stubIsRestricted,
      })
    ).toBe(false);
  });
});

describe("computeEffectiveEnabled — missing/unparseable url (Requirement 6.9)", () => {
  const modes: ScopeMode[] = ["all", "whitelist", "blacklist"];

  it("returns false when topLevelUrl is undefined", () => {
    for (const scopeMode of modes) {
      expect(
        computeEffectiveEnabled({
          masterEnabled: true,
          scopeMode,
          whitelist: ["example.com"],
          blacklist: ["example.com"],
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
        whitelist: [],
        blacklist: [],
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
        whitelist: [],
        blacklist: [],
        topLevelUrl: "file:///Users/me/page.html",
        isRestricted: neverRestricted,
      })
    ).toBe(false);
  });
});
