/**
 * Popup Settings
 * Load settings, check page/injection status, and restricted URL detection.
 */

import type { Settings } from "@/shared/types/settings";
import { updateDetailsView, updateStatusBadge, displayLocation } from "./ui";
import { showOnboarding } from "./onboarding";

/** Load current settings on popup open */
export async function loadSettings(): Promise<void> {
  try {
    const settings = (await browser.runtime.sendMessage({
      type: "GET_SETTINGS",
    })) as Settings;
    if (!settings.onboardingCompleted) {
      showOnboarding();
    }

    const protectionToggle = document.getElementById("protectionToggle") as HTMLInputElement | null;
    const webrtcToggle = document.getElementById("webrtcToggle") as HTMLInputElement | null;

    if (protectionToggle) {
      protectionToggle.checked = settings.enabled;
    }
    if (webrtcToggle) {
      webrtcToggle.checked = settings.webrtcProtection;
    }

    updateStatusBadge(settings.enabled);

    if (settings.location) {
      displayLocation(settings.location, settings.locationName);
    } else {
      const nameEl = document.getElementById("locationName");
      const coordsEl = document.getElementById("locationCoords");
      if (nameEl) nameEl.textContent = "No location set";
      if (coordsEl) coordsEl.textContent = "—";
    }

    // Show clear button only when location is set and VPN sync is not active
    const clearBtn = document.getElementById("clearLocationBtn");
    if (clearBtn) {
      clearBtn.style.display = settings.location && !settings.vpnSyncEnabled ? "block" : "none";
    }

    updateDetailsView(settings);

    // Restore VPN sync toggle state (Req 4.1–4.4)
    const vpnSyncToggle = document.getElementById("vpnSyncToggle") as HTMLInputElement | null;
    const inputModeTabs = document.getElementById("inputModeTabs");
    const vpnPanel = document.getElementById("vpnSyncMode");
    const searchPanel = document.getElementById("searchMode");
    const coordsPanel = document.getElementById("coordsMode");

    if (vpnSyncToggle) {
      vpnSyncToggle.checked = !!settings.vpnSyncEnabled;
    }

    if (settings.vpnSyncEnabled) {
      if (inputModeTabs) inputModeTabs.style.display = "none";
      if (searchPanel) searchPanel.style.display = "none";
      if (coordsPanel) coordsPanel.style.display = "none";
      if (vpnPanel) vpnPanel.style.display = "block";

      // If a previous sync succeeded, show re-sync button instead of sync button
      if (settings.locationName) {
        const syncBtn = document.getElementById("vpnSyncButton");
        const resyncBtn = document.getElementById("vpnResyncButton");

        if (syncBtn) syncBtn.style.display = "none";
        if (resyncBtn) resyncBtn.style.display = "block";
      }
    } else {
      if (inputModeTabs) inputModeTabs.style.display = "";
      if (searchPanel) searchPanel.style.display = "block";
      if (coordsPanel) coordsPanel.style.display = "none";
      if (vpnPanel) vpnPanel.style.display = "none";
    }

    const warningMessage = document.getElementById("warningMessage");
    if (warningMessage) {
      if (settings.enabled && !settings.location) {
        warningMessage.style.display = "block";
        warningMessage.textContent = "⚠️ Protection enabled but no location set";
      } else {
        warningMessage.style.display = "none";
      }
    }

    checkPageStatus().catch((err: unknown) => {
      console.error("Failed to check page status:", err);
    });
  } catch (error: unknown) {
    console.error("Failed to load settings:", error);
  }
}

/** Check if current page is restricted or has injection issues */
export async function checkPageStatus(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs.length === 0) return;

    const currentTab = tabs[0];

    if (isRestrictedUrl(currentTab.url)) {
      const restrictedNotice = document.getElementById("restrictedPageNotice");
      const injectionWarning = document.getElementById("injectionWarning");
      if (restrictedNotice) restrictedNotice.style.display = "block";
      if (injectionWarning) injectionWarning.style.display = "none";
      return;
    }

    const restrictedNotice = document.getElementById("restrictedPageNotice");
    if (restrictedNotice) restrictedNotice.style.display = "none";

    const settings = (await browser.runtime.sendMessage({
      type: "GET_SETTINGS",
    })) as Settings;
    if (settings.enabled) {
      await checkInjectionStatus();
    }
  } catch (error: unknown) {
    console.error("Failed to check page status:", error);
  }
}

/** Check if content script is properly injected in current tab */
export async function checkInjectionStatus(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs.length === 0) return;

    const currentTab = tabs[0];

    if (isRestrictedUrl(currentTab.url)) {
      return;
    }

    // Live PING via background's CHECK_TAB_INJECTION instead of stale badge text
    const result = (await browser.runtime.sendMessage({
      type: "CHECK_TAB_INJECTION",
      payload: { tabId: currentTab.id },
    })) as { injected: boolean; error: string | null };

    const warningEl = document.getElementById("injectionWarning");
    if (warningEl) {
      warningEl.style.display = result.injected ? "none" : "block";
    }
  } catch (error: unknown) {
    console.error("Failed to check injection status:", error);
  }
}

/**
 * Check if a URL is a restricted page where extensions cannot run.
 */
export function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;

  const restrictedPrefixes: string[] = [
    "about:",
    "moz-extension:",
    "chrome:",
    "chrome-extension:",
    "edge:",
    "resource:",
    "view-source:",
    "data:",
    "blob:",
    "file:",
  ];

  const restrictedDomains: string[] = [
    "addons.mozilla.org",
    "accounts.firefox.com",
    "testpilot.firefox.com",
    "chrome.google.com",
  ];

  for (const prefix of restrictedPrefixes) {
    if (url.startsWith(prefix)) {
      return true;
    }
  }

  try {
    const urlObj = new URL(url);
    for (const domain of restrictedDomains) {
      if (urlObj.hostname === domain || urlObj.hostname.endsWith("." + domain)) {
        return true;
      }
    }
  } catch {
    return true;
  }

  return false;
}
