/**
 * Unit Tests for the Three-State Per-Tab Badge
 * Feature: site-scoping
 *
 * Covers:
 *  - badgeStateFor across all master/effective combinations (Req 12.1–12.3)
 *  - setBadgeForTab writing the expected color/text per state
 *  - updateBadge computing Effective_Enabled per tab, including restricted
 *    URLs mapping to the out-of-scope state (Req 12.5)
 */

import { DEFAULT_SETTINGS, type Settings } from "@/shared/types/settings";
import { badgeStateFor, setBadgeForTab, updateBadge } from "@/background/badge";
import { storageData } from "../../setup";

function seedSettings(overrides: Partial<Settings>): void {
  storageData.settings = { ...DEFAULT_SETTINGS, ...overrides };
}

describe("badgeStateFor", () => {
  /**
   * Master on + effective true ⇒ active (Req 12.1).
   */
  test("returns 'active' when master on and effective enabled", () => {
    expect(badgeStateFor(true, true)).toBe("active");
  });

  /**
   * Master on + effective false ⇒ out-of-scope (Req 12.2, 12.5).
   */
  test("returns 'out-of-scope' when master on but effective disabled", () => {
    expect(badgeStateFor(true, false)).toBe("out-of-scope");
  });

  /**
   * Master off ⇒ master-off regardless of effective value (Req 12.3).
   */
  test("returns 'master-off' when master off (effective false)", () => {
    expect(badgeStateFor(false, false)).toBe("master-off");
  });

  test("returns 'master-off' when master off even if effective true", () => {
    expect(badgeStateFor(false, true)).toBe("master-off");
  });
});

describe("setBadgeForTab", () => {
  test("writes green checkmark for 'active'", () => {
    setBadgeForTab(7, "active");

    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "green",
      tabId: 7,
    });
    expect(browser.action.setBadgeText).toHaveBeenCalledWith({ text: "✓", tabId: 7 });
  });

  test("writes muted slate dot for 'out-of-scope'", () => {
    setBadgeForTab(8, "out-of-scope");

    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#5b7083",
      tabId: 8,
    });
    expect(browser.action.setBadgeText).toHaveBeenCalledWith({ text: "•", tabId: 8 });
  });

  test("writes gray empty text for 'master-off'", () => {
    setBadgeForTab(9, "master-off");

    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "gray",
      tabId: 9,
    });
    expect(browser.action.setBadgeText).toHaveBeenCalledWith({ text: "", tabId: 9 });
  });
});

describe("updateBadge", () => {
  test("shows master-off on every tab when master switch is off", async () => {
    seedSettings({ enabled: false });
    browser.tabs.query.mockResolvedValue([
      { id: 1, url: "https://example.com" },
      { id: 2, url: "https://other.com" },
    ]);

    await updateBadge();

    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "gray",
      tabId: 1,
    });
    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "gray",
      tabId: 2,
    });
  });

  test("shows active for an in-scope tab in 'all' mode", async () => {
    seedSettings({ enabled: true, scopeMode: "all" });
    browser.tabs.query.mockResolvedValue([{ id: 1, url: "https://example.com" }]);

    await updateBadge();

    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "green",
      tabId: 1,
    });
    expect(browser.action.setBadgeText).toHaveBeenCalledWith({ text: "✓", tabId: 1 });
  });

  test("shows out-of-scope for a restricted URL even when master on (Req 12.5)", async () => {
    seedSettings({ enabled: true, scopeMode: "all" });
    browser.tabs.query.mockResolvedValue([{ id: 1, url: "about:blank" }]);

    await updateBadge();

    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#5b7083",
      tabId: 1,
    });
    expect(browser.action.setBadgeText).toHaveBeenCalledWith({ text: "•", tabId: 1 });
  });

  test("shows out-of-scope for a tab not on the allowlist", async () => {
    seedSettings({ enabled: true, scopeMode: "allowlist", allowlist: ["example.com"] });
    browser.tabs.query.mockResolvedValue([{ id: 1, url: "https://not-listed.com" }]);

    await updateBadge();

    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#5b7083",
      tabId: 1,
    });
    expect(browser.action.setBadgeText).toHaveBeenCalledWith({ text: "•", tabId: 1 });
  });

  test("applies per-tab states across a mixed set of tabs", async () => {
    seedSettings({ enabled: true, scopeMode: "denylist", denylist: ["blocked.com"] });
    browser.tabs.query.mockResolvedValue([
      { id: 1, url: "https://example.com" }, // active
      { id: 2, url: "https://blocked.com" }, // out-of-scope (denylisted)
      { id: 3, url: "chrome://settings" }, // out-of-scope (restricted)
    ]);

    await updateBadge();

    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "green",
      tabId: 1,
    });
    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#5b7083",
      tabId: 2,
    });
    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "#5b7083",
      tabId: 3,
    });
  });
});
