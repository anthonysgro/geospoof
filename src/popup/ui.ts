/**
 * Popup UI Helpers
 * Formatting, display, and DOM utility functions.
 */

import type { Settings, Location, Timezone, LocationName } from "@/shared/types/settings";

export function formatLocationDetails(
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

export function formatTimezoneDetails(timezone: Timezone | null): string {
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

export function formatWebRTCDetails(enabled: boolean): string {
  if (!enabled) return "✗ Inactive\n\nWebRTC can leak your real IP address even when using a VPN.";
  return "✓ Active\n\nPolicy: disable_non_proxied_udp\nThis prevents WebRTC from leaking your real IP address.";
}

export function formatAPIsDetails(
  enabled: boolean,
  hasLocation: boolean,
  hasTimezone: boolean
): string {
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

export function updateDetailsView(settings: Settings): void {
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

export function updateStatusBadge(enabled: boolean): void {
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

export function displayLocation(location: Location, locationName: LocationName | null): void {
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

/** Helper to clear all children from an element */
export function clearChildren(el: Element): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}
