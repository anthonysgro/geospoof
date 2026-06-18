/**
 * Popup UI Script — Entry Point
 * Wires up event listeners and initializes the popup.
 */

import type { GeocodeResponse } from "@/shared/types/messages";
import { loadSettings, applyTheme } from "./settings";
import { closeOnboarding } from "./onboarding";
import { displaySearchResults } from "./search";
import { updateStatusBadge, renderWebRTCDetails, clearChildren } from "./ui";
import { handleVpnSync } from "./vpn-sync";
import { wireEarlyProtectionToggle } from "./early-protection";
import { applyI18n, t } from "./i18n";

// --- Location setting ---

async function setLocation(latitude: number, longitude: number): Promise<void> {
  const container = document.getElementById("searchResults");

  try {
    if (container) {
      clearChildren(container);
      const loadingDiv = document.createElement("div");
      loadingDiv.className = "loading";
      const spinner = document.createElement("div");
      spinner.className = "spinner";
      loadingDiv.appendChild(spinner);
      loadingDiv.appendChild(
        document.createTextNode(t("search_settingLocation") || "Setting location...")
      );
      container.appendChild(loadingDiv);
    }

    await browser.runtime.sendMessage({
      type: "SET_LOCATION",
      payload: { latitude, longitude },
    });

    const searchInput = document.getElementById("locationSearch") as HTMLInputElement | null;
    if (searchInput) searchInput.value = "";
    if (container) clearChildren(container);

    await loadSettings();
  } catch (error: unknown) {
    console.error("Failed to set location:", error);
    if (container) clearChildren(container);
    alert(t("search_setLocationFailed") || "Failed to set location. Please try again.");
  }
}

// --- Event Listeners ---

// Protection toggle
document.getElementById("protectionToggle")?.addEventListener("change", (e: Event) => {
  const target = e.target as HTMLInputElement;
  const enabled = target.checked;

  void (async () => {
    try {
      await browser.runtime.sendMessage({
        type: "SET_PROTECTION_STATUS",
        payload: { enabled },
      });

      updateStatusBadge(enabled);
      await loadSettings();
    } catch (error: unknown) {
      console.error("Failed to set protection status:", error);
      target.checked = !enabled;
    }
  })();
});

// WebRTC toggle
document.getElementById("webrtcToggle")?.addEventListener("change", (e: Event) => {
  const target = e.target as HTMLInputElement;
  const enabled = target.checked;

  void (async () => {
    try {
      await browser.runtime.sendMessage({
        type: "SET_WEBRTC_PROTECTION",
        payload: { enabled },
      });

      const detailWebRTC = document.getElementById("detailWebRTC");
      if (detailWebRTC) {
        renderWebRTCDetails(detailWebRTC, enabled);
      }
    } catch (error: unknown) {
      console.error("Failed to set WebRTC protection:", error);
      target.checked = !enabled;
      alert(
        t("webrtc_configFailed") ||
          "Failed to configure WebRTC protection. Check extension permissions."
      );
    }
  })();
});

// Advanced worker protection is now always-on on Firefox (and a no-op
// on Chromium / Safari), so there's no toggle to wire up. The feature
// is gated by manifest-declared webRequest permissions which the user
// accepts at install time.

// Location search with debounce
let searchTimeout: ReturnType<typeof setTimeout> | undefined;

document.getElementById("locationSearch")?.addEventListener("focus", () => {
  // On mobile, scroll the search input into view above the virtual keyboard.
  // Use "center" so it sits in the visible area between the header and keyboard.
  setTimeout(() => {
    document
      .getElementById("locationSearch")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, 300);
});

// When the virtual keyboard opens/closes on Android, the visual viewport shrinks.
// Re-scroll the focused search input into view so it isn't hidden.
if (window.visualViewport) {
  window.visualViewport.addEventListener("resize", () => {
    const searchInput = document.getElementById("locationSearch");
    if (document.activeElement === searchInput) {
      searchInput?.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  });
}

document.getElementById("locationSearch")?.addEventListener("input", (e: Event) => {
  clearTimeout(searchTimeout);
  const target = e.target as HTMLInputElement;
  const query = target.value.trim();

  const container = document.getElementById("searchResults");
  if (!container) return;

  if (query.length < 3) {
    clearChildren(container);
    return;
  }

  clearChildren(container);
  const loadingDiv = document.createElement("div");
  loadingDiv.className = "loading";
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  loadingDiv.appendChild(spinner);
  loadingDiv.appendChild(document.createTextNode(t("search_searching") || "Searching..."));
  container.appendChild(loadingDiv);

  searchTimeout = setTimeout(() => {
    void (async () => {
      try {
        const response = (await browser.runtime.sendMessage({
          type: "GEOCODE_QUERY",
          payload: { query },
        })) as GeocodeResponse;

        displaySearchResults(response.results ?? [], (lat, lon) => {
          void setLocation(lat, lon);
        });

        // On mobile, re-scroll the search input into view after results render
        // so the keyboard doesn't end up covering it.
        const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
        if (isTouchDevice) {
          const searchInput = document.getElementById("locationSearch");
          if (searchInput && document.activeElement === searchInput) {
            requestAnimationFrame(() => {
              searchInput.scrollIntoView({ behavior: "smooth", block: "center" });
            });
          }
        }
      } catch (error: unknown) {
        console.error("Geocoding failed:", error);
        clearChildren(container);
        const errorDiv = document.createElement("div");
        errorDiv.className = "no-results";
        errorDiv.textContent = t("search_failed") || "Search failed. Please try again.";
        container.appendChild(errorDiv);
      }
    })();
  }, 300);
});

// Manual coordinates
document.getElementById("setManualCoords")?.addEventListener("click", () => {
  const latInput = document.getElementById("latitudeInput") as HTMLInputElement | null;
  const lonInput = document.getElementById("longitudeInput") as HTMLInputElement | null;

  if (!latInput || !lonInput) return;

  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);

  if (isNaN(lat) || lat < -90 || lat > 90) {
    alert(t("coords_invalidLat") || "Invalid latitude. Must be between -90 and 90.");
    return;
  }

  if (isNaN(lon) || lon < -180 || lon > 180) {
    alert(t("coords_invalidLon") || "Invalid longitude. Must be between -180 and 180.");
    return;
  }

  void setLocation(lat, lon).then(() => {
    latInput.value = "";
    lonInput.value = "";
  });
});

// VPN Sync toggle
document.getElementById("vpnSyncToggle")?.addEventListener("change", (e: Event) => {
  const target = e.target as HTMLInputElement;
  if (target.checked) {
    activateVpnSyncMode();
  } else {
    void deactivateVpnSyncMode();
  }
});

// Tab switching: search / coordinates
document.getElementById("searchModeTab")?.addEventListener("click", () => {
  document.getElementById("searchModeTab")?.classList.add("active");
  document.getElementById("coordsModeTab")?.classList.remove("active");
  const searchMode = document.getElementById("searchMode");
  const coordsMode = document.getElementById("coordsMode");
  if (searchMode) searchMode.style.display = "block";
  if (coordsMode) coordsMode.style.display = "none";
});

document.getElementById("coordsModeTab")?.addEventListener("click", () => {
  document.getElementById("coordsModeTab")?.classList.add("active");
  document.getElementById("searchModeTab")?.classList.remove("active");
  const coordsMode = document.getElementById("coordsMode");
  const searchMode = document.getElementById("searchMode");
  if (coordsMode) coordsMode.style.display = "block";
  if (searchMode) searchMode.style.display = "none";
});

// VPN Sync / Re-sync buttons
document.getElementById("vpnSyncButton")?.addEventListener("click", () => {
  void handleVpnSync(false);
});

document.getElementById("vpnResyncButton")?.addEventListener("click", () => {
  void handleVpnSync(true);
});

// Clear location button
document.getElementById("clearLocationBtn")?.addEventListener("click", () => {
  void (async () => {
    try {
      await browser.runtime.sendMessage({ type: "CLEAR_LOCATION" });
      await loadSettings();
    } catch (error: unknown) {
      console.error("Failed to clear location:", error);
    }
  })();
});

/** Activate VPN sync mode: hide tabs and search/coords, show VPN panel, trigger sync */
function activateVpnSyncMode(): void {
  const inputModeTabs = document.getElementById("inputModeTabs");
  const searchMode = document.getElementById("searchMode");
  const coordsMode = document.getElementById("coordsMode");
  const vpnSyncMode = document.getElementById("vpnSyncMode");

  if (inputModeTabs) inputModeTabs.style.display = "none";
  if (searchMode) searchMode.style.display = "none";
  if (coordsMode) coordsMode.style.display = "none";
  if (vpnSyncMode) vpnSyncMode.style.display = "block";

  void handleVpnSync(false);
}

/** Deactivate VPN sync mode: hide VPN panel, show tabs with search as default, notify background */
async function deactivateVpnSyncMode(): Promise<void> {
  const inputModeTabs = document.getElementById("inputModeTabs");
  const searchMode = document.getElementById("searchMode");
  const coordsMode = document.getElementById("coordsMode");
  const vpnSyncMode = document.getElementById("vpnSyncMode");

  if (vpnSyncMode) vpnSyncMode.style.display = "none";
  if (inputModeTabs) inputModeTabs.style.display = "flex";
  if (searchMode) searchMode.style.display = "block";
  if (coordsMode) coordsMode.style.display = "none";

  // Reset tab active states
  document.getElementById("searchModeTab")?.classList.add("active");
  document.getElementById("coordsModeTab")?.classList.remove("active");

  try {
    await browser.runtime.sendMessage({ type: "DISABLE_VPN_SYNC" });
  } catch {
    // Best-effort
  }

  // Reset VPN panel UI state
  const statusEl = document.getElementById("vpnSyncStatus");
  const syncBtn = document.getElementById("vpnSyncButton");
  const resyncBtn = document.getElementById("vpnResyncButton");
  const errorEl = document.getElementById("vpnSyncError");
  if (statusEl) statusEl.style.display = "none";
  if (syncBtn) syncBtn.style.display = "block";
  if (resyncBtn) resyncBtn.style.display = "none";
  if (errorEl) errorEl.style.display = "none";

  // Reload settings so the location display reflects the cleared state
  await loadSettings();
}

// Tab switching: main / filters / details view
function showPopupView(view: "main" | "filters" | "details"): void {
  const tabs: Record<typeof view, string> = {
    main: "mainTab",
    filters: "filtersTab",
    details: "detailsTab",
  };
  const views: Record<typeof view, string> = {
    main: "mainView",
    filters: "filtersView",
    details: "detailsView",
  };

  for (const key of ["main", "filters", "details"] as const) {
    const tabEl = document.getElementById(tabs[key]);
    const viewEl = document.getElementById(views[key]);
    const isActive = key === view;
    if (tabEl) tabEl.classList.toggle("active", isActive);
    if (viewEl) viewEl.style.display = isActive ? "block" : "none";
  }
}

document.getElementById("mainTab")?.addEventListener("click", () => {
  showPopupView("main");
});

document.getElementById("filtersTab")?.addEventListener("click", () => {
  showPopupView("filters");
});

document.getElementById("detailsTab")?.addEventListener("click", () => {
  showPopupView("details");
});

// Advanced section expand/collapse
document.getElementById("advancedToggle")?.addEventListener("click", () => {
  const toggle = document.getElementById("advancedToggle");
  const content = document.getElementById("advancedContent");
  if (!toggle || !content) return;

  const expanded = toggle.getAttribute("aria-expanded") === "true";
  toggle.setAttribute("aria-expanded", String(!expanded));
  content.style.display = expanded ? "none" : "block";
});

// Debug logging toggle
document.getElementById("debugLoggingToggle")?.addEventListener("change", (e: Event) => {
  const target = e.target as HTMLInputElement;
  const enabled = target.checked;

  const verbositySelector = document.getElementById("verbositySelector");
  if (verbositySelector) {
    verbositySelector.style.display = enabled ? "block" : "none";
  }

  void (async () => {
    try {
      await browser.runtime.sendMessage({
        type: "SET_DEBUG_LOGGING",
        payload: { enabled },
      });
    } catch (error: unknown) {
      console.error("Failed to set debug logging:", error);
      target.checked = !enabled;
      if (verbositySelector) {
        verbositySelector.style.display = !enabled ? "block" : "none";
      }
    }
  })();
});

// Verbosity level dropdown
document.getElementById("verbosityLevel")?.addEventListener("change", (e: Event) => {
  const target = e.target as HTMLSelectElement;
  const level = target.value;

  void (async () => {
    try {
      await browser.runtime.sendMessage({
        type: "SET_VERBOSITY_LEVEL",
        payload: { level },
      });
    } catch (error: unknown) {
      console.error("Failed to set verbosity level:", error);
    }
  })();
});

// Theme selector
document.getElementById("themeSelect")?.addEventListener("change", (e: Event) => {
  const target = e.target as HTMLSelectElement;
  const theme = target.value as "system" | "light" | "dark";

  applyTheme(theme);

  void (async () => {
    try {
      await browser.runtime.sendMessage({
        type: "SET_THEME",
        payload: { theme },
      });
    } catch (error: unknown) {
      console.error("Failed to save theme:", error);
    }
  })();
});

// Onboarding close
document.getElementById("closeOnboarding")?.addEventListener("click", () => {
  void closeOnboarding();
});

// VPN Sync info tooltip — tap to toggle on mobile, click on desktop
document.getElementById("vpnSyncInfo")?.addEventListener("click", (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  const tooltip = document.getElementById("vpnSyncTooltip");
  tooltip?.classList.toggle("visible");
});

// Dismiss tooltip when tapping elsewhere
document.addEventListener("click", (e: Event) => {
  const tooltip = document.getElementById("vpnSyncTooltip");
  const infoBtn = document.getElementById("vpnSyncInfo");
  if (tooltip && e.target !== infoBtn && !infoBtn?.contains(e.target as Node)) {
    tooltip.classList.remove("visible");
  }
});

// Instant timezone protection info tooltip (Firefox-only row)
document.getElementById("earlyTzInfo")?.addEventListener("click", (e: Event) => {
  e.preventDefault();
  e.stopPropagation();
  const tooltip = document.getElementById("earlyTzTooltip");
  tooltip?.classList.toggle("visible");
});

// Dismiss the early-tz tooltip when tapping elsewhere
document.addEventListener("click", (e: Event) => {
  const tooltip = document.getElementById("earlyTzTooltip");
  const infoBtn = document.getElementById("earlyTzInfo");
  if (tooltip && e.target !== infoBtn && !infoBtn?.contains(e.target as Node)) {
    tooltip.classList.remove("visible");
  }
});

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("loaded");

  // Translate all [data-i18n*] nodes once the DOM is parsed. Happens
  // before loadSettings() so any text we later overwrite dynamically
  // inherits the localized copy rather than the English fallback.
  applyI18n();

  // Wire the Firefox-only "Instant timezone protection" toggle (requests the
  // optional userScripts permission). Compiles out / no-ops elsewhere.
  wireEarlyProtectionToggle();

  const versionLabel = document.getElementById("versionLabel");
  if (versionLabel) {
    const manifest = browser.runtime.getManifest();
    versionLabel.textContent = `v${manifest.version}`;
  }

  // Hide the coffee link on Safari (App Store guidelines prohibit external
  // payment/donation links in distributed apps).
  if (__SAFARI__) {
    const coffeeRow = document.getElementById("coffeeRow");
    if (coffeeRow) coffeeRow.style.display = "none";
  }

  void loadSettings();
});
