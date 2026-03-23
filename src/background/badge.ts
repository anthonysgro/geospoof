/**
 * Badge Management
 * Update the toolbar icon badge to reflect extension state.
 */

import { isRestrictedUrl } from "./tabs";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("BG");

export async function updateBadge(enabled: boolean): Promise<void> {
  try {
    const tabs = await browser.tabs.query({});

    for (const tab of tabs) {
      const isRestricted = isRestrictedUrl(tab.url ?? "");

      if (!enabled || isRestricted) {
        void browser.action.setBadgeBackgroundColor({ color: "gray", tabId: tab.id });
        void browser.action.setBadgeText({ text: "", tabId: tab.id });
      } else {
        void browser.action.setBadgeBackgroundColor({ color: "green", tabId: tab.id });
        void browser.action.setBadgeText({ text: "✓", tabId: tab.id });
      }
    }
  } catch (error) {
    logger.error("Failed to update badge:", error);
    const color = enabled ? "green" : "gray";
    const text = enabled ? "✓" : "";
    void browser.action.setBadgeBackgroundColor({ color });
    void browser.action.setBadgeText({ text });
  }
}
