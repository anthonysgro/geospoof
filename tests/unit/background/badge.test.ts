/**
 * Unit Tests for Badge Icon Colors
 * Feature: geolocation-spoof-extension-mvp
 */

import { importBackground as importBackgroundBase } from "../../helpers/import-background";

// Wrap the shared helper with badge-specific setup (wait for async init + clear mocks)
async function importBackground() {
  const mod = await importBackgroundBase();
  // Allow initialize() async chain to complete before tests assert
  await new Promise((resolve) => setTimeout(resolve, 0));
  vi.clearAllMocks();
  return mod;
}

beforeEach(() => {
  // Override tabs.query to throw so updateBadge falls through to the global badge path
  browser.tabs.query.mockRejectedValue(new Error("tabs.query not available in test"));
});

describe("Badge Icon Colors", () => {
  /**
   * Test green badge when protection enabled
   * Validates: Requirements 5.7, 5.8
   */
  test("should display green badge with checkmark when protection is enabled", async () => {
    const { updateBadge } = await importBackground();

    await updateBadge(true);

    // Verify badge color is set to green
    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "green",
    });

    // Verify badge text is set to checkmark
    expect(browser.action.setBadgeText).toHaveBeenCalledWith({
      text: "✓",
    });
  });

  /**
   * Test gray badge when protection disabled
   * Validates: Requirements 5.7, 5.8
   */
  test("should display gray badge with empty text when protection is disabled", async () => {
    const { updateBadge } = await importBackground();

    await updateBadge(false);

    // Verify badge color is set to gray
    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledWith({
      color: "gray",
    });

    // Verify badge text is empty
    expect(browser.action.setBadgeText).toHaveBeenCalledWith({
      text: "",
    });
  });

  test("should call both badge API methods when updating badge", async () => {
    const { updateBadge } = await importBackground();

    await updateBadge(true);

    // Both methods should be called
    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledTimes(1);
    expect(browser.action.setBadgeText).toHaveBeenCalledTimes(1);
  });

  test("should handle multiple badge updates", async () => {
    const { updateBadge } = await importBackground();

    // Enable
    await updateBadge(true);
    expect(browser.action.setBadgeBackgroundColor).toHaveBeenLastCalledWith({
      color: "green",
    });

    // Disable
    await updateBadge(false);
    expect(browser.action.setBadgeBackgroundColor).toHaveBeenLastCalledWith({
      color: "gray",
    });

    // Enable again
    await updateBadge(true);
    expect(browser.action.setBadgeBackgroundColor).toHaveBeenLastCalledWith({
      color: "green",
    });

    // Should have been called 3 times total
    expect(browser.action.setBadgeBackgroundColor).toHaveBeenCalledTimes(3);
    expect(browser.action.setBadgeText).toHaveBeenCalledTimes(3);
  });
});
