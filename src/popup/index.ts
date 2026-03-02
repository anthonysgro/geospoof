/**
 * Popup UI Script
 * Handles user interactions in the extension popup
 */

import type { Settings, Location, Timezone, LocationName } from "@/shared/types/settings";
import type { GeocodeResult, GeocodeResponse } from "@/shared/types/messages";

// --- Helper functions for details view ---

function formatLocationDetails(
  location: Location | null,
  locationName: LocationName | null
): string {
  if (!location) return "Not configured";

  let details = `Latitude: ${location.latitude.toFixed(6)}\n`;
  details += `Longitude: ${location.longitude.toFixed(6)}\n`;
  details += `Accuracy: ±${location.accuracy}m\n`;

  if (locationName && locationName.displayName) {
    details += `\nLocation: ${locationName.displayName}`;
  }

  return details;
}

function formatTimezoneDetails(timezone: Timezone | null): string {
  if (!timezone) return "Not configured";

  const offsetHours = Math.floor(Math.abs(timezone.offset) / 60);
  const offsetMinutes = Math.abs(timezone.offset) % 60;
  const sign = timezone.offset >= 0 ? "+" : "-";
  const offsetStr = `UTC${sign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;

  let details = `Identifier: ${timezone.identifier}\n`;
  details += `Offset: ${offsetStr}\n`;
  details += `DST Offset: ${timezone.dstOffset} minutes`;

  if (timezone.fallback) {
    details += "\n\n⚠️ Estimated (API unavailable)";
  }

  return details;
}

function formatWebRTCDetails(enabled: boolean): string {
  if (!enabled) return "✗ Inactive\n\nWebRTC can leak your real IP address even when using a VPN.";
  return "✓ Active\n\nPolicy: disable_non_proxied_udp\nThis prevents WebRTC from leaking your real IP address.";
}

function formatAPIsDetails(enabled: boolean, hasLocation: boolean, hasTimezone: boolean): string {
  if (!enabled) return "None (protection disabled)";

  const apis: string[] = [];

  if (hasLocation) {
    apis.push("• navigator.geolocation.getCurrentPosition()");
    apis.push("• navigator.geolocation.watchPosition()");
  }

  if (hasTimezone) {
    apis.push("• Date.prototype.getTimezoneOffset()");
    apis.push("• Intl.DateTimeFormat");
    apis.push("• Date.prototype.toString()");
    apis.push("• Date.prototype.toLocaleString()");
    apis.push("• Date.prototype.toTimeString()");
  }

  return apis.length > 0 ? apis.join("\n") : "None";
}

function updateDetailsView(settings: Settings): void {
  const detailLocation = document.getElementById("detailLocation");
  const detailTimezone = document.getElementById("detailTimezone");
  const detailWebRTC = document.getElementById("detailWebRTC");
  const detailAPIs = document.getElementById("detailAPIs");

  if (detailLocation) {
    detailLocation.textContent = formatLocationDetails(settings.location, settings.locationName);
  }
  if (detailTimezone) {
    detailTimezone.textContent = formatTimezoneDetails(settings.timezone);
  }
  if (detailWebRTC) {
    detailWebRTC.textContent = formatWebRTCDetails(settings.webrtcProtection);
  }
  if (detailAPIs) {
    detailAPIs.textContent = formatAPIsDetails(
      settings.enabled,
      !!settings.location,
      !!settings.timezone
    );
  }
}

// --- Core functions ---

/** Load current settings on popup open */
async function loadSettings(): Promise<void> {
  try {
    const settings = (await browser.runtime.sendMessage({
      type: "GET_SETTINGS",
    })) as Settings;
    if (!settings.onboardingCompleted) {
      showOnboarding();
    }

    // Update UI
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
    }

    // Update details view
    updateDetailsView(settings);

    // Show warning if protection enabled without location
    const warningMessage = document.getElementById("warningMessage");
    if (warningMessage) {
      if (settings.enabled && !settings.location) {
        warningMessage.style.display = "block";
        warningMessage.textContent = "⚠️ Protection enabled but no location set";
      } else {
        warningMessage.style.display = "none";
      }
    }

    // Check for restricted page and injection issues on current tab (non-blocking)
    checkPageStatus().catch((err: unknown) => {
      console.error("Failed to check page status:", err);
    });
  } catch (error: unknown) {
    console.error("Failed to load settings:", error);
  }
}

/** Check if current page is restricted or has injection issues */
async function checkPageStatus(): Promise<void> {
  try {
    const tabs = await browser.tabs.query({
      active: true,
      currentWindow: true,
    });
    if (tabs.length === 0) return;

    const currentTab = tabs[0];

    // Check if this is a restricted URL where extensions can't run
    if (isRestrictedUrl(currentTab.url)) {
      const restrictedNotice = document.getElementById("restrictedPageNotice");
      const injectionWarning = document.getElementById("injectionWarning");
      if (restrictedNotice) restrictedNotice.style.display = "block";
      if (injectionWarning) injectionWarning.style.display = "none";
      return;
    }

    // Not a restricted page, hide the notice
    const restrictedNotice = document.getElementById("restrictedPageNotice");
    if (restrictedNotice) restrictedNotice.style.display = "none";

    // Check for injection issues (only if protection is enabled)
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
async function checkInjectionStatus(): Promise<void> {
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

    const badgeText = await browser.browserAction.getBadgeText({
      tabId: currentTab.id,
    });

    const warningEl = document.getElementById("injectionWarning");
    if (warningEl) {
      warningEl.style.display = badgeText === "!" ? "block" : "none";
    }
  } catch (error: unknown) {
    console.error("Failed to check injection status:", error);
  }
}

/**
 * Check if a URL is a restricted page where extensions cannot run.
 * @param url - The URL to check
 * @returns True if the URL is restricted
 */
function isRestrictedUrl(url: string | undefined): boolean {
  if (!url) return true;

  const restrictedPrefixes: string[] = [
    "about:",
    "moz-extension:",
    "chrome:",
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
    // Invalid URL, treat as restricted
    return true;
  }

  return false;
}

/** Show onboarding overlay */
function showOnboarding(): void {
  const overlay = document.getElementById("onboardingOverlay");
  if (overlay) overlay.style.display = "flex";
}

/** Close onboarding overlay */
async function closeOnboarding(): Promise<void> {
  const overlay = document.getElementById("onboardingOverlay");
  if (overlay) overlay.style.display = "none";

  try {
    await browser.runtime.sendMessage({ type: "COMPLETE_ONBOARDING" });
  } catch (error: unknown) {
    console.error("Failed to complete onboarding:", error);
  }
}

/** Update status badge in popup header */
function updateStatusBadge(enabled: boolean): void {
  const badge = document.getElementById("statusBadge");
  const text = document.getElementById("statusText");

  if (badge) {
    if (enabled) {
      badge.classList.add("enabled");
    } else {
      badge.classList.remove("enabled");
    }
  }
  if (text) {
    text.textContent = enabled ? "Enabled" : "Disabled";
  }
}

/** Display location info in the popup */
function displayLocation(location: Location, locationName: LocationName | null): void {
  const nameEl = document.getElementById("locationName");
  const coordsEl = document.getElementById("locationCoords");

  if (nameEl) {
    if (locationName && locationName.displayName) {
      nameEl.textContent = locationName.displayName;
    } else if (locationName && locationName.city) {
      nameEl.textContent = `${locationName.city}, ${locationName.country}`;
    } else {
      nameEl.textContent = "Custom Location";
    }
  }

  if (coordsEl) {
    coordsEl.textContent = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
  }
}

/** Display geocoding search results */
function displaySearchResults(results: GeocodeResult[]): void {
  const container = document.getElementById("searchResults");
  if (!container) return;

  // Clear existing results
  while (container.firstChild) {
    container.removeChild(container.firstChild);
  }

  if (results.length === 0) {
    const noResults = document.createElement("div");
    noResults.className = "no-results";
    noResults.textContent = "No locations found";
    container.appendChild(noResults);
    return;
  }

  results.forEach((result: GeocodeResult) => {
    const resultDiv = document.createElement("div");
    resultDiv.className = "search-result";
    resultDiv.dataset.lat = String(result.latitude);
    resultDiv.dataset.lon = String(result.longitude);

    const nameDiv = document.createElement("div");
    nameDiv.className = "result-name";
    nameDiv.textContent = result.name;

    const coordsDiv = document.createElement("div");
    coordsDiv.className = "result-coords";
    coordsDiv.textContent = `${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}`;

    resultDiv.appendChild(nameDiv);
    resultDiv.appendChild(coordsDiv);
    container.appendChild(resultDiv);

    resultDiv.addEventListener("click", () => {
      const lat = parseFloat(resultDiv.dataset.lat ?? "0");
      const lon = parseFloat(resultDiv.dataset.lon ?? "0");
      void setLocation(lat, lon);
    });
  });
}

/** Set spoofed location and update UI */
async function setLocation(latitude: number, longitude: number): Promise<void> {
  const container = document.getElementById("searchResults");

  try {
    // Show loading indicator with spinner
    if (container) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
      const loadingDiv = document.createElement("div");
      loadingDiv.className = "loading";
      const spinner = document.createElement("div");
      spinner.className = "spinner";
      loadingDiv.appendChild(spinner);
      loadingDiv.appendChild(document.createTextNode("Setting location..."));
      container.appendChild(loadingDiv);
    }

    await browser.runtime.sendMessage({
      type: "SET_LOCATION",
      payload: { latitude, longitude },
    });

    // Clear search
    const searchInput = document.getElementById("locationSearch") as HTMLInputElement | null;
    if (searchInput) searchInput.value = "";
    if (container) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }

    // Reload settings to update display
    await loadSettings();
  } catch (error: unknown) {
    console.error("Failed to set location:", error);
    if (container) {
      while (container.firstChild) {
        container.removeChild(container.firstChild);
      }
    }
    alert("Failed to set location. Please try again.");
  }
}

// --- Event listeners ---

/** Helper to clear all children from an element */
function clearChildren(el: Element): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}

// Protection toggle handler
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
      target.checked = !enabled; // Revert on error
    }
  })();
});

// WebRTC toggle handler
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
        detailWebRTC.textContent = formatWebRTCDetails(enabled);
      }
    } catch (error: unknown) {
      console.error("Failed to set WebRTC protection:", error);
      target.checked = !enabled; // Revert on error
      alert("Failed to configure WebRTC protection. Check extension permissions.");
    }
  })();
});

// Location search handler
let searchTimeout: ReturnType<typeof setTimeout> | undefined;

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

  // Show loading indicator
  clearChildren(container);
  const loadingDiv = document.createElement("div");
  loadingDiv.className = "loading";
  const spinner = document.createElement("div");
  spinner.className = "spinner";
  loadingDiv.appendChild(spinner);
  loadingDiv.appendChild(document.createTextNode("Searching..."));
  container.appendChild(loadingDiv);

  searchTimeout = setTimeout(() => {
    void (async () => {
      try {
        const response = (await browser.runtime.sendMessage({
          type: "GEOCODE_QUERY",
          payload: { query },
        })) as GeocodeResponse;

        displaySearchResults(response.results ?? []);
      } catch (error: unknown) {
        console.error("Geocoding failed:", error);
        clearChildren(container);
        const errorDiv = document.createElement("div");
        errorDiv.className = "no-results";
        errorDiv.textContent = "Search failed. Please try again.";
        container.appendChild(errorDiv);
      }
    })();
  }, 300); // Debounce 300ms
});

// Manual coordinates handler
document.getElementById("setManualCoords")?.addEventListener("click", () => {
  const latInput = document.getElementById("latitudeInput") as HTMLInputElement | null;
  const lonInput = document.getElementById("longitudeInput") as HTMLInputElement | null;

  if (!latInput || !lonInput) return;

  const lat = parseFloat(latInput.value);
  const lon = parseFloat(lonInput.value);

  if (isNaN(lat) || lat < -90 || lat > 90) {
    alert("Invalid latitude. Must be between -90 and 90.");
    return;
  }

  if (isNaN(lon) || lon < -180 || lon > 180) {
    alert("Invalid longitude. Must be between -180 and 180.");
    return;
  }

  void setLocation(lat, lon).then(() => {
    latInput.value = "";
    lonInput.value = "";
  });
});

// Tab switching: search / coordinates mode
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

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("loaded");
  void loadSettings();
});

// Onboarding close button handler
document.getElementById("closeOnboarding")?.addEventListener("click", () => {
  void closeOnboarding();
});

// Tab switching: main / details view
document.getElementById("mainTab")?.addEventListener("click", () => {
  document.getElementById("mainTab")?.classList.add("active");
  document.getElementById("detailsTab")?.classList.remove("active");
  const mainView = document.getElementById("mainView");
  const detailsView = document.getElementById("detailsView");
  if (mainView) mainView.style.display = "block";
  if (detailsView) detailsView.style.display = "none";
});

document.getElementById("detailsTab")?.addEventListener("click", () => {
  document.getElementById("detailsTab")?.classList.add("active");
  document.getElementById("mainTab")?.classList.remove("active");
  const detailsView = document.getElementById("detailsView");
  const mainView = document.getElementById("mainView");
  if (detailsView) detailsView.style.display = "block";
  if (mainView) mainView.style.display = "none";
});
