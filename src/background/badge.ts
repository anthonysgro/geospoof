/**
 * Badge Management
 * Update the toolbar icon badge to reflect the per-tab spoofing state.
 *
 * Three visually distinct states (design §5, Req 12):
 *   - `active`        — master on AND the tab's Effective_Enabled is true.
 *   - `out-of-scope`  — master on but Effective_Enabled is false (out of scope
 *                       under the active mode/lists, or a Restricted_URL).
 *   - `master-off`    — master switch off; shown on every tab.
 *
 * The orange `"!"` injection-failure badge written by the alarm path in
 * `index.ts` is orthogonal to scope state and lives there, not here.
 */

import { isRestrictedUrl } from "./tabs";
import { loadSettings } from "./settings";
import { computeEffectiveEnabled } from "@/shared/utils/scope";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("BG");

export type BadgeState = "active" | "out-of-scope" | "master-off";

const BADGE_STYLE: Record<BadgeState, { color: string; text: string }> = {
  active: { color: "green", text: "✓" },
  "out-of-scope": { color: "#5b7083", text: "•" },
  "master-off": { color: "gray", text: "" },
};

/**
 * Apply the mapped color/text for `state` to a single tab's badge.
 *
 * Per-tab badge writes are best-effort. They reject with "No tab with id ..."
 * when the tab has closed between resolving the state and applying it, and they
 * reject (or the API is entirely absent) on mobile engines that have no toolbar
 * to host a per-tab action badge — e.g. Chromium-based Android browsers such as
 * Quetta. Those rejections must never escape as unhandled promise rejections:
 * on some Android engines a flood of "Uncaught (in promise)" rejections in the
 * background wedges the worker, leaving the popup toggles unresponsive. So we
 * feature-detect the API and swallow any rejection (logged at debug only).
 */
export function setBadgeForTab(tabId: number, state: BadgeState): void {
  const action = browser.action;
  if (!action?.setBadgeText) {
    return;
  }
  const { color, text } = BADGE_STYLE[state];
  const swallow = (error: unknown): void => {
    logger.debug(`Badge update skipped for tab ${tabId}:`, error);
  };
  void action.setBadgeBackgroundColor({ color, tabId }).catch(swallow);
  void action.setBadgeText({ text, tabId }).catch(swallow);
}

/**
 * Map the master switch and a tab's Effective_Enabled value to a BadgeState.
 *
 * `master-off` when the master switch is off (Req 12.3); otherwise `active`
 * when the tab is effectively enabled (Req 12.1), else `out-of-scope` (Req
 * 12.2). Restricted URLs are covered here too because `computeEffectiveEnabled`
 * already returns false for them, so they map to `out-of-scope` (Req 12.5).
 */
export function badgeStateFor(masterEnabled: boolean, effectiveEnabled: boolean): BadgeState {
  if (!masterEnabled) {
    return "master-off";
  }
  return effectiveEnabled ? "active" : "out-of-scope";
}

/**
 * Refresh the badge on every open tab to reflect its current Effective_Enabled
 * value. Loads settings once, then resolves the per-tab decision against each
 * tab's top-level URL via the shared `computeEffectiveEnabled` source of truth
 * and applies the mapped state (Req 12.1–12.6).
 */
export async function updateBadge(): Promise<void> {
  try {
    const settings = await loadSettings();
    const tabs = await browser.tabs.query({});

    for (const tab of tabs) {
      if (tab.id == null) {
        continue;
      }

      const effectiveEnabled = computeEffectiveEnabled({
        masterEnabled: settings.enabled,
        scopeMode: settings.scopeMode,
        allowlist: settings.allowlist,
        denylist: settings.denylist,
        proFeaturesBlocked: settings.proFeaturesBlocked,
        topLevelUrl: tab.url,
        isRestricted: isRestrictedUrl,
      });

      setBadgeForTab(tab.id, badgeStateFor(settings.enabled, effectiveEnabled));
    }
  } catch (error) {
    logger.error("Failed to update badge:", error);
  }
}
