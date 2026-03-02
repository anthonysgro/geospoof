/**
 * Popup UI Script
 * Handles user interactions in the extension popup
 */

// Helper functions for details view
function formatLocationDetails(location, locationName) {
  if (!location) return "Not configured";
  
  let details = `Latitude: ${location.latitude.toFixed(6)}\n`;
  details += `Longitude: ${location.longitude.toFixed(6)}\n`;
  details += `Accuracy: ±${location.accuracy}m\n`;
  
  if (locationName && locationName.displayName) {
    details += `\nLocation: ${locationName.displayName}`;
  }
  
  return details;
}

function formatTimezoneDetails(timezone) {
  if (!timezone) return "Not configured";
  
  const offsetHours = Math.floor(Math.abs(timezone.offset) / 60);
  const offsetMinutes = Math.abs(timezone.offset) % 60;
  const sign = timezone.offset >= 0 ? '+' : '-';
  const offsetStr = `UTC${sign}${String(offsetHours).padStart(2, '0')}:${String(offsetMinutes).padStart(2, '0')}`;
  
  let details = `Identifier: ${timezone.identifier}\n`;
  details += `Offset: ${offsetStr}\n`;
  details += `DST Offset: ${timezone.dstOffset} minutes`;
  
  if (timezone.fallback) {
    details += "\n\n⚠️ Estimated (API unavailable)";
  }
  
  return details;
}

function formatWebRTCDetails(enabled) {
  if (!enabled) return "✗ Inactive\n\nWebRTC can leak your real IP address even when using a VPN.";
  return "✓ Active\n\nPolicy: disable_non_proxied_udp\nThis prevents WebRTC from leaking your real IP address.";
}

function formatAPIsDetails(enabled, hasLocation, hasTimezone) {
  if (!enabled) return "None (protection disabled)";
  
  const apis = [];
  
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

function updateDetailsView(settings) {
  document.getElementById("detailLocation").textContent = formatLocationDetails(settings.location, settings.locationName);
  document.getElementById("detailTimezone").textContent = formatTimezoneDetails(settings.timezone);
  document.getElementById("detailWebRTC").textContent = formatWebRTCDetails(settings.webrtcProtection);
  document.getElementById("detailAPIs").textContent = formatAPIsDetails(
    settings.enabled,
    !!settings.location,
    !!settings.timezone
  );
}

// Load current settings on popup open
async function loadSettings() {
  try {
    const settings = await browser.runtime.sendMessage({ type: "GET_SETTINGS" });
    
    // Show onboarding if not completed
    if (!settings.onboardingCompleted) {
      showOnboarding();
    }
    
    // Update UI
    document.getElementById("protectionToggle").checked = settings.enabled;
    document.getElementById("webrtcToggle").checked = settings.webrtcProtection;
    
    updateStatusBadge(settings.enabled);
    
    if (settings.location) {
      displayLocation(settings.location, settings.locationName);
    }
    
    // Update details view
    updateDetailsView(settings);
    
    // Show warning if protection enabled without location
    if (settings.enabled && !settings.location) {
      document.getElementById("warningMessage").style.display = "block";
      document.getElementById("warningMessage").textContent = "⚠️ Protection enabled but no location set";
    } else {
      document.getElementById("warningMessage").style.display = "none";
    }
    
    // Check for injection issues on current tab (non-blocking)
    if (settings.enabled) {
      checkInjectionStatus().catch(err => {
        console.error("Failed to check injection status:", err);
      });
    }
  } catch (error) {
    console.error("Failed to load settings:", error);
  }
}

// Check if content script is properly injected in current tab
async function checkInjectionStatus() {
  try {
    // Get current tab
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) return;
    
    const currentTab = tabs[0];
    
    // Check if tab has a URL and it's injectable (http/https)
    if (!currentTab.url || (!currentTab.url.startsWith("http://") && !currentTab.url.startsWith("https://"))) {
      // Not an injectable page, don't show warning
      return;
    }
    
    // Get the badge for this tab to check if there's a warning
    const badgeText = await browser.browserAction.getBadgeText({ tabId: currentTab.id });
    
    if (badgeText === "!") {
      // Show warning - page needs refresh
      const warningEl = document.getElementById("injectionWarning");
      if (warningEl) {
        warningEl.style.display = "block";
      }
    } else {
      // Hide warning
      const warningEl = document.getElementById("injectionWarning");
      if (warningEl) {
        warningEl.style.display = "none";
      }
    }
  } catch (error) {
    console.error("Failed to check injection status:", error);
  }
}

// Show onboarding overlay
function showOnboarding() {
  document.getElementById("onboardingOverlay").style.display = "flex";
}

// Close onboarding overlay
async function closeOnboarding() {
  document.getElementById("onboardingOverlay").style.display = "none";
  
  try {
    await browser.runtime.sendMessage({ type: "COMPLETE_ONBOARDING" });
  } catch (error) {
    console.error("Failed to complete onboarding:", error);
  }
}

// Update status badge
function updateStatusBadge(enabled) {
  const badge = document.getElementById("statusBadge");
  const text = document.getElementById("statusText");
  
  if (enabled) {
    badge.classList.add("enabled");
    text.textContent = "Enabled";
  } else {
    badge.classList.remove("enabled");
    text.textContent = "Disabled";
  }
}

// Display location
function displayLocation(location, locationName) {
  const nameEl = document.getElementById("locationName");
  const coordsEl = document.getElementById("locationCoords");
  
  if (locationName && locationName.displayName) {
    nameEl.textContent = locationName.displayName;
  } else if (locationName && locationName.city) {
    nameEl.textContent = `${locationName.city}, ${locationName.country}`;
  } else {
    nameEl.textContent = "Custom Location";
  }
  
  coordsEl.textContent = `${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`;
}

// Protection toggle handler
document.getElementById("protectionToggle").addEventListener("change", async (e) => {
  const enabled = e.target.checked;
  
  try {
    await browser.runtime.sendMessage({
      type: "SET_PROTECTION_STATUS",
      payload: { enabled }
    });
    
    updateStatusBadge(enabled);
    
    // Reload settings to update warning and details view
    await loadSettings();
  } catch (error) {
    console.error("Failed to set protection status:", error);
    e.target.checked = !enabled; // Revert on error
  }
});

// WebRTC toggle handler
document.getElementById("webrtcToggle").addEventListener("change", async (e) => {
  const enabled = e.target.checked;
  
  try {
    await browser.runtime.sendMessage({
      type: "SET_WEBRTC_PROTECTION",
      payload: { enabled }
    });
    
    // Update the details view
    document.getElementById("detailWebRTC").textContent = formatWebRTCDetails(enabled);
  } catch (error) {
    console.error("Failed to set WebRTC protection:", error);
    e.target.checked = !enabled; // Revert on error
    alert("Failed to configure WebRTC protection. Check extension permissions.");
  }
});

// Location search handler
let searchTimeout;
document.getElementById("locationSearch").addEventListener("input", (e) => {
  clearTimeout(searchTimeout);
  const query = e.target.value.trim();
  
  if (query.length < 3) {
    document.getElementById("searchResults").innerHTML = "";
    return;
  }
  
  // Show loading indicator
  document.getElementById("searchResults").innerHTML = '<div class="loading"><div class="spinner"></div>Searching...</div>';
  
  searchTimeout = setTimeout(async () => {
    try {
      const response = await browser.runtime.sendMessage({
        type: "GEOCODE_QUERY",
        payload: { query }
      });
      
      displaySearchResults(response.results || []);
    } catch (error) {
      console.error("Geocoding failed:", error);
      document.getElementById("searchResults").innerHTML = 
        '<div class="no-results">Search failed. Please try again.</div>';
    }
  }, 300); // Debounce 300ms
});

// Display search results
function displaySearchResults(results) {
  const container = document.getElementById("searchResults");
  
  if (results.length === 0) {
    container.innerHTML = "<div class='no-results'>No locations found</div>";
    return;
  }
  
  container.innerHTML = results.map(result => `
    <div class="search-result" data-lat="${result.latitude}" data-lon="${result.longitude}">
      <div class="result-name">${result.name}</div>
      <div class="result-coords">${result.latitude.toFixed(4)}, ${result.longitude.toFixed(4)}</div>
    </div>
  `).join("");
  
  // Add click handlers
  container.querySelectorAll(".search-result").forEach(el => {
    el.addEventListener("click", () => {
      const lat = parseFloat(el.dataset.lat);
      const lon = parseFloat(el.dataset.lon);
      setLocation(lat, lon);
    });
  });
}

// Set location
async function setLocation(latitude, longitude) {
  try {
    // Show loading indicator with spinner
    document.getElementById("searchResults").innerHTML = '<div class="loading"><div class="spinner"></div>Setting location...</div>';
    
    await browser.runtime.sendMessage({
      type: "SET_LOCATION",
      payload: { latitude, longitude }
    });
    
    // Clear search
    document.getElementById("locationSearch").value = "";
    document.getElementById("searchResults").innerHTML = "";
    
    // Reload settings to update display
    await loadSettings();
  } catch (error) {
    console.error("Failed to set location:", error);
    document.getElementById("searchResults").innerHTML = "";
    alert("Failed to set location. Please try again.");
  }
}

// Manual coordinates handler
document.getElementById("setManualCoords").addEventListener("click", async () => {
  const lat = parseFloat(document.getElementById("latitudeInput").value);
  const lon = parseFloat(document.getElementById("longitudeInput").value);
  
  // Validate
  if (isNaN(lat) || lat < -90 || lat > 90) {
    alert("Invalid latitude. Must be between -90 and 90.");
    return;
  }
  
  if (isNaN(lon) || lon < -180 || lon > 180) {
    alert("Invalid longitude. Must be between -180 and 180.");
    return;
  }
  
  await setLocation(lat, lon);
  
  // Clear inputs
  document.getElementById("latitudeInput").value = "";
  document.getElementById("longitudeInput").value = "";
});

// Tab switching handlers
document.getElementById("searchModeTab").addEventListener("click", () => {
  // Switch to search mode
  document.getElementById("searchModeTab").classList.add("active");
  document.getElementById("coordsModeTab").classList.remove("active");
  document.getElementById("searchMode").style.display = "block";
  document.getElementById("coordsMode").style.display = "none";
});

document.getElementById("coordsModeTab").addEventListener("click", () => {
  // Switch to coordinates mode
  document.getElementById("coordsModeTab").classList.add("active");
  document.getElementById("searchModeTab").classList.remove("active");
  document.getElementById("coordsMode").style.display = "block";
  document.getElementById("searchMode").style.display = "none";
});

// Initialize on load
document.addEventListener("DOMContentLoaded", () => {
  // Show body immediately
  document.body.classList.add("loaded");
  
  // Load settings
  loadSettings();
});

// Onboarding close button handler
document.getElementById("closeOnboarding").addEventListener("click", closeOnboarding);

// Tab switching handlers
document.getElementById("mainTab").addEventListener("click", () => {
  document.getElementById("mainTab").classList.add("active");
  document.getElementById("detailsTab").classList.remove("active");
  document.getElementById("mainView").style.display = "block";
  document.getElementById("detailsView").style.display = "none";
});

document.getElementById("detailsTab").addEventListener("click", () => {
  document.getElementById("detailsTab").classList.add("active");
  document.getElementById("mainTab").classList.remove("active");
  document.getElementById("detailsView").style.display = "block";
  document.getElementById("mainView").style.display = "none";
});
