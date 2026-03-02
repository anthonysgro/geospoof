/**
 * Content Script
 * Injects override code into page context and manages settings
 */

// Settings received from background script
let spoofingEnabled = false;
let spoofedLocation = null;
let timezoneOverride = null;

// Event name for settings updates (configurable for stealth)
const EVENT_NAME = process.env.EVENT_NAME || "__geospoof_settings_update";

// Store settings in window object for injected script to access (CSP-safe)
function updateInjectedScript() {
  // Use CustomEvent to communicate with injected script (CSP-safe)
  const settingsData = {
    enabled: spoofingEnabled,
    location: spoofedLocation,
    timezone: timezoneOverride,
  };

  // For Firefox, we need to use cloneInto to make the object accessible in page context
  /* eslint-disable no-undef */
  const event = new CustomEvent(EVENT_NAME, {
    detail: typeof cloneInto !== "undefined" ? cloneInto(settingsData, window) : settingsData,
  });
  /* eslint-enable no-undef */

  try {
    window.dispatchEvent(event);
    console.log("[GeoSpoof Content] Dispatched settings update event:", {
      spoofingEnabled,
      spoofedLocation,
      timezoneOverride,
    });
  } catch (error) {
    console.error("[GeoSpoof Content] Failed to dispatch settings update:", error);
    // Retry once after 100ms delay
    setTimeout(() => {
      try {
        window.dispatchEvent(event);
        console.log("[GeoSpoof Content] Retry successful: Dispatched settings update event");
      } catch (retryError) {
        console.error("[GeoSpoof Content] Retry failed to dispatch settings update:", retryError);
      }
    }, 100);
  }
}

// Inject the override script into the page context IMMEDIATELY
// We need to inject it synchronously before any page JS runs
// Use a blocking approach by embedding the script inline
(async function () {
  try {
    const response = await fetch(browser.runtime.getURL("content/injected.js"));
    const scriptContent = await response.text();

    const script = document.createElement("script");
    script.textContent = scriptContent;
    (document.head || document.documentElement).prepend(script);
    script.remove();

    // Send initial settings after script is injected
    updateInjectedScript();
  } catch (err) {
    console.error("[GeoSpoof Content] Failed to inject script:", err);
  }
})();

// Listen for settings updates from background script
browser.runtime.onMessage.addListener((message) => {
  console.log("[GeoSpoof Content] Received message:", message);

  if (message.type === "UPDATE_SETTINGS") {
    spoofingEnabled = message.payload.enabled;
    spoofedLocation = message.payload.location;
    timezoneOverride = message.payload.timezone;
    console.log(
      "[GeoSpoof Content] Settings updated. Enabled:",
      spoofingEnabled,
      "Location:",
      spoofedLocation
    );
    updateInjectedScript();
  } else if (message.type === "PING") {
    // Respond to ping to confirm content script is injected
    return Promise.resolve({ pong: true });
  }
});

// Request initial settings on load
console.log("[GeoSpoof Content] Content script loaded, requesting initial settings");
browser.runtime
  .sendMessage({ type: "GET_SETTINGS" })
  .then((settings) => {
    spoofingEnabled = settings.enabled;
    spoofedLocation = settings.location;
    timezoneOverride = settings.timezone;
    console.log(
      "[GeoSpoof Content] Initial settings loaded. Enabled:",
      spoofingEnabled,
      "Location:",
      spoofedLocation
    );
    updateInjectedScript();
  })
  .catch((error) => {
    console.error("[GeoSpoof Content] Failed to get initial settings:", error);
  });
