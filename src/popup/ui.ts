/**
 * Popup UI Helpers
 * Formatting, display, and DOM utility functions.
 */

import type { Settings, Location, Timezone, LocationName } from "@/shared/types/settings";
import { t } from "./i18n";

export function formatLocationDetails(
  location: Location | null,
  locationName: LocationName | null
): string {
  if (!location) return t("details_notConfigured") || "Not configured";

  let details = `${t("details_latitudeLabel") || "Latitude"}: ${location.latitude.toFixed(6)}\n`;
  details += `${t("details_longitudeLabel") || "Longitude"}: ${location.longitude.toFixed(6)}\n`;
  details += `${t("details_accuracyLabel") || "Accuracy"}: ±${location.accuracy}m\n`;

  if (locationName && locationName.displayName) {
    details += `\n${t("details_locationLabel") || "Location"}: ${locationName.displayName}`;
  }

  return details;
}

export function formatTimezoneDetails(timezone: Timezone | null): string {
  if (!timezone) return t("details_notConfigured") || "Not configured";

  const offsetHours = Math.floor(Math.abs(timezone.offset) / 60);
  const offsetMinutes = Math.abs(timezone.offset) % 60;
  const sign = timezone.offset >= 0 ? "+" : "-";
  const offsetStr = `UTC${sign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;

  let details = `${t("details_identifierLabel") || "Identifier"}: ${timezone.identifier}\n`;
  details += `${t("details_offsetLabel") || "Offset"}: ${offsetStr}\n`;
  const dstMinutes = String(timezone.dstOffset);
  const dstLabel = t("details_dstOffsetLabel") || "DST Offset";
  const dstValue = t("details_dstOffsetMinutes", [dstMinutes]) || `${dstMinutes} minutes`;
  details += `${dstLabel}: ${dstValue}`;

  if (timezone.fallback) {
    details += `\n\n${t("details_fallbackNote") || "⚠️ Estimated (API unavailable)"}`;
  }

  return details;
}

export function formatWebRTCDetails(enabled: boolean): string {
  // Wording is engine-agnostic because the protection mechanism
  // differs by engine: Chromium/Firefox use the browser-level
  // webRTCIPHandlingPolicy pref (strict on Chromium, proxy-gated on
  // Firefox), Safari relies on the content-script RTCPeerConnection
  // wrapper. Both paths block candidate gathering end-to-end; the
  // user doesn't need to know which one fired.
  if (!enabled) {
    return (
      t("details_webrtcInactive") ||
      "✗ Inactive\n\nWebRTC can leak your real IP address even when using a VPN."
    );
  }
  return (
    t("details_webrtcActive") ||
    "✓ Active\n\nRTCPeerConnection is wrapped to suppress ICE candidate gathering.\nThis prevents WebRTC from leaking your real IP address."
  );
}

export function formatAPIsDetails(
  enabled: boolean,
  hasLocation: boolean,
  hasTimezone: boolean,
  hasWebRTC: boolean = false
): string {
  if (!enabled) return t("details_noneDisabled") || "None (protection disabled)";

  const sections: string[] = [];

  if (hasLocation) {
    sections.push(t("details_section_geolocation") || "Geolocation");
    sections.push("    • navigator.geolocation.getCurrentPosition()");
    sections.push("    • navigator.geolocation.watchPosition()");
    sections.push("    • navigator.geolocation.clearWatch()");
    sections.push("    • navigator.permissions.query()");
  }

  if (hasTimezone) {
    sections.push(t("details_section_timezone") || "Timezone");
    sections.push("    • Date.prototype.getTimezoneOffset()");
    sections.push("    • Intl.DateTimeFormat() constructor");
    sections.push("    • Intl.DateTimeFormat.resolvedOptions()");
    sections.push("    • Date.prototype.toString()");
    sections.push("    • Date.prototype.toTimeString()");
    sections.push("    • Date.prototype.toLocaleString()");
    sections.push("    • Date.prototype.toLocaleDateString()");
    sections.push("    • Date.prototype.toLocaleTimeString()");
  }

  if (hasWebRTC) {
    sections.push(t("details_section_webrtc") || "WebRTC");
    sections.push("    • RTCPeerConnection (content-script wrapper)");
    sections.push("    • RTCPeerConnection.prototype.getStats");
    sections.push("    • privacy.network.webRTCIPHandlingPolicy (where available)");
  }

  return sections.length > 0 ? sections.join("\n") : t("details_none") || "None";
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
      !!settings.timezone,
      settings.webrtcProtection
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
    text.textContent = enabled
      ? t("status_enabled") || "Enabled"
      : t("status_disabled") || "Disabled";
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
      nameEl.textContent = t("location_custom") || "Custom Location";
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
