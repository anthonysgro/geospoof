/**
 * Popup UI Script — Entry Point
 * Wires up event listeners and initializes the popup.
 */

import type { GeocodeResponse } from "@/shared/types/messages";
import { loadSettings } from "./settings";
import { closeOnboarding } from "./onboarding";
import { displaySearchResults } from "./search";
import { updateStatusBadge, formatWebRTCDetails, clearChildren } from "./ui";

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
      loadingDiv.appendChild(document.createTextNode("Setting location..."));
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
    alert("Failed to set location. Please try again.");
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
        detailWebRTC.textContent = formatWebRTCDetails(enabled);
      }
    } catch (error: unknown) {
      console.error("Failed to set WebRTC protection:", error);
      target.checked = !enabled;
      alert("Failed to configure WebRTC protection. Check extension permissions.");
    }
  })();
});

// Location search with debounce
let searchTimeout: ReturnType<typeof setTimeout> | undefined;

document.getElementById("locationSearch")?.addEventListener("focus", () => {
  // On mobile, scroll the search input into view above the virtual keyboard
  setTimeout(() => {
    document
      .getElementById("locationSearch")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, 300);
});

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
  loadingDiv.appendChild(document.createTextNode("Searching..."));
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

        // On mobile, scroll results into view so they're not hidden behind the keyboard
        const isTouchDevice = window.matchMedia("(pointer: coarse)").matches;
        if (isTouchDevice && container.children.length > 0) {
          container.scrollIntoView({ behavior: "smooth", block: "end" });
        }
      } catch (error: unknown) {
        console.error("Geocoding failed:", error);
        clearChildren(container);
        const errorDiv = document.createElement("div");
        errorDiv.className = "no-results";
        errorDiv.textContent = "Search failed. Please try again.";
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

// Onboarding close
document.getElementById("closeOnboarding")?.addEventListener("click", () => {
  void closeOnboarding();
});

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("loaded");
  void loadSettings();
});
