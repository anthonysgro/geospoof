/**
 * Popup UI Helpers
 * Formatting, display, and DOM utility functions.
 */

import type { Settings, Location, Timezone, LocationName } from "@/shared/types/settings";
import { t } from "./i18n";

/** Append a label/value row (mirrors the native iOS `LabeledRow`). */
function appendDetailRow(container: HTMLElement, label: string, value: string): void {
  const row = document.createElement("div");
  row.className = "detail-row";

  const labelEl = document.createElement("span");
  labelEl.className = "detail-row-label";
  labelEl.textContent = label;

  const valueEl = document.createElement("span");
  valueEl.className = "detail-row-value";
  valueEl.textContent = value;

  row.append(labelEl, valueEl);
  container.appendChild(row);
}

export function renderLocationDetails(
  container: HTMLElement,
  location: Location | null,
  locationName: LocationName | null
): void {
  clearChildren(container);

  if (!location) {
    container.classList.remove("detail-rows");
    container.textContent = t("details_notConfigured") || "Not configured";
    return;
  }

  container.classList.add("detail-rows");
  appendDetailRow(
    container,
    t("details_latitudeLabel") || "Latitude",
    location.latitude.toFixed(6)
  );
  appendDetailRow(
    container,
    t("details_longitudeLabel") || "Longitude",
    location.longitude.toFixed(6)
  );
  appendDetailRow(container, t("details_accuracyLabel") || "Accuracy", `±${location.accuracy}m`);

  if (locationName && locationName.displayName) {
    appendDetailRow(container, t("details_locationLabel") || "Location", locationName.displayName);
  }
}

export function renderTimezoneDetails(container: HTMLElement, timezone: Timezone | null): void {
  clearChildren(container);

  if (!timezone) {
    container.classList.remove("detail-rows");
    container.textContent = t("details_notConfigured") || "Not configured";
    return;
  }

  container.classList.add("detail-rows");

  const offsetHours = Math.floor(Math.abs(timezone.offset) / 60);
  const offsetMinutes = Math.abs(timezone.offset) % 60;
  const sign = timezone.offset >= 0 ? "+" : "-";
  const offsetStr = `UTC${sign}${String(offsetHours).padStart(2, "0")}:${String(offsetMinutes).padStart(2, "0")}`;

  const dstMinutes = String(timezone.dstOffset);
  const dstValue = t("details_dstOffsetMinutes", [dstMinutes]) || `${dstMinutes} minutes`;

  appendDetailRow(container, t("details_identifierLabel") || "Identifier", timezone.identifier);
  appendDetailRow(container, t("details_offsetLabel") || "Offset", offsetStr);
  appendDetailRow(container, t("details_dstOffsetLabel") || "DST Offset", dstValue);

  if (timezone.fallback) {
    const note = document.createElement("div");
    note.className = "detail-note";
    note.textContent = t("details_fallbackNote") || "⚠️ Estimated (API unavailable)";
    container.appendChild(note);
  }
}

export function renderWebRTCDetails(container: HTMLElement, enabled: boolean): void {
  // Wording is engine-agnostic because the protection mechanism differs by
  // engine: Chromium/Firefox use the browser-level webRTCIPHandlingPolicy pref,
  // Safari relies on the content-script RTCPeerConnection wrapper. Both block
  // candidate gathering end-to-end; the user doesn't need to know which fired.
  clearChildren(container);
  container.classList.add("detail-rows");

  const status = document.createElement("div");
  status.className = enabled ? "detail-status active" : "detail-status";
  status.textContent = enabled
    ? t("details_webrtcActiveStatus") || "✓ Active"
    : t("details_webrtcInactiveStatus") || "✗ Inactive";
  container.appendChild(status);

  if (!enabled) {
    const note = document.createElement("div");
    note.className = "detail-note";
    note.textContent =
      t("details_webrtcInactiveNote") ||
      "WebRTC can leak your real IP address even when using a VPN.";
    container.appendChild(note);
  }
}

/** One collapsible group of overridden APIs, mirroring the iOS Details screen. */
interface ApiGroup {
  /** Stable id used to track which groups are expanded across re-renders. */
  id: string;
  title: string;
  apis: string[];
}

/**
 * The full set of overridden APIs, grouped by surface — kept in parity with
 * the native iOS/macOS Details screen (`SpoofDetailsView.swift`). Only groups
 * whose protection is active are included; the anti-fingerprinting / structural
 * overrides are always installed while protection is on.
 */
export function buildApiGroups(
  hasLocation: boolean,
  hasTimezone: boolean,
  hasWebRTC: boolean
): ApiGroup[] {
  const groups: ApiGroup[] = [];

  if (hasLocation) {
    groups.push({
      id: "geolocation",
      title: t("details_section_geolocation") || "Geolocation",
      apis: [
        "navigator.geolocation.getCurrentPosition()",
        "navigator.geolocation.watchPosition()",
        "navigator.geolocation.clearWatch()",
        "navigator.permissions.query()",
        "GeolocationCoordinates.prototype.latitude",
        "GeolocationCoordinates.prototype.longitude",
        "GeolocationCoordinates.prototype.accuracy",
        "GeolocationCoordinates.prototype.altitude",
        "GeolocationCoordinates.prototype.altitudeAccuracy",
        "GeolocationCoordinates.prototype.heading",
        "GeolocationCoordinates.prototype.speed",
        "GeolocationCoordinates.prototype.toJSON()",
        "GeolocationPosition.prototype.coords",
        "GeolocationPosition.prototype.timestamp",
        "GeolocationPosition.prototype.toJSON()",
      ],
    });
  }

  if (hasTimezone) {
    groups.push({
      id: "datetime",
      title: t("details_section_dateTime") || "Date & Time",
      apis: [
        "Date() constructor",
        "Date.parse()",
        "Date.prototype.getTimezoneOffset()",
        "Date.prototype.getHours() / getMinutes() / getSeconds()",
        "Date.prototype.getDate() / getDay() / getMonth() / getFullYear()",
        "Date.prototype.setHours() / setMinutes() / setSeconds()",
        "Date.prototype.setDate() / setMonth() / setFullYear()",
        "Date.prototype.toString() / toDateString() / toTimeString()",
        "Date.prototype.toLocaleString() / toLocaleDateString() / toLocaleTimeString()",
        "Intl.DateTimeFormat()",
        "Intl.DateTimeFormat.prototype.resolvedOptions()",
        "Intl.DateTimeFormat.prototype.formatToParts()",
        "Intl.DateTimeFormat.prototype.formatRange() / formatRangeToParts()",
      ],
    });

    groups.push({
      id: "temporal",
      title: t("details_section_temporal") || "Temporal",
      apis: [
        "Temporal.Now.timeZoneId()",
        "Temporal.Now.plainDateTimeISO()",
        "Temporal.Now.plainDateISO()",
        "Temporal.Now.plainTimeISO()",
        "Temporal.Now.zonedDateTimeISO()",
      ],
    });

    groups.push({
      id: "xslt",
      title: t("details_section_xslt") || "XSLT / EXSLT",
      apis: [
        "XSLTProcessor.prototype.transformToFragment()",
        "XSLTProcessor.prototype.transformToDocument()",
        "EXSLT date:date-time() (result rewriting)",
      ],
    });

    groups.push({
      id: "workers",
      title: t("details_section_workers") || "Workers",
      apis: [
        "Worker (constructor wrapper)",
        "SharedWorker (constructor wrapper)",
        "navigator.serviceWorker.register()",
      ],
    });
  }

  if (hasWebRTC) {
    groups.push({
      id: "webrtc",
      title: t("details_section_webrtc") || "WebRTC",
      apis: [
        "RTCPeerConnection (constructor wrapper)",
        "RTCPeerConnection.prototype.getStats()",
        "privacy.network.webRTCIPHandlingPolicy (where available)",
      ],
    });
  }

  groups.push({
    id: "antifingerprint",
    title: t("details_section_antiFingerprinting") || "Anti-Fingerprinting & Structural",
    apis: [
      "Function.prototype.toString()",
      "Document.prototype.lastModified",
      "HTMLIFrameElement.prototype.contentWindow",
      "HTMLIFrameElement.prototype.contentDocument",
      "Node.prototype.appendChild() / insertBefore() / replaceChild()",
      "Element.prototype.append() / prepend() / replaceWith()",
      "Element.prototype.insertAdjacentElement() / insertAdjacentHTML()",
      "Element.prototype.innerHTML (setter)",
    ],
  });

  return groups;
}

/**
 * Render the overridden APIs into `container` as iOS-style collapsible groups:
 * a summary line followed by one expandable row per surface, each showing a
 * count chip and a rotating chevron. Expansion state persists across re-renders
 * via `expandedApiGroups`.
 */
export function renderAPIsDetails(
  container: HTMLElement,
  enabled: boolean,
  hasLocation: boolean,
  hasTimezone: boolean,
  hasWebRTC: boolean
): void {
  clearChildren(container);

  if (!enabled) {
    container.classList.remove("api-groups");
    container.textContent = t("details_noneDisabled") || "None (protection disabled)";
    return;
  }

  const groups = buildApiGroups(hasLocation, hasTimezone, hasWebRTC);
  if (groups.length === 0) {
    container.classList.remove("api-groups");
    container.textContent = t("details_none") || "None";
    return;
  }

  container.classList.add("api-groups");

  // Summary header introducing the grouped list.
  const overview = document.createElement("div");
  overview.className = "api-overview";

  const overviewTitle = document.createElement("div");
  overviewTitle.className = "api-overview-title";
  overviewTitle.textContent = t("details_keyOverrides") || "Key Overrides (where available)";
  overview.appendChild(overviewTitle);

  container.appendChild(overview);

  for (const group of groups) {
    container.appendChild(buildApiGroupElement(group));
  }
}

/** Tracks which API groups are currently expanded, keyed by group id. */
const expandedApiGroups = new Set<string>();

function buildApiGroupElement(group: ApiGroup): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = "api-group";

  const isExpanded = expandedApiGroups.has(group.id);

  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "api-group-toggle";
  toggle.setAttribute("aria-expanded", String(isExpanded));

  const chevron = document.createElement("span");
  chevron.className = "api-group-chevron";
  chevron.setAttribute("aria-hidden", "true");
  chevron.textContent = "▶";

  const title = document.createElement("span");
  title.className = "api-group-title";
  title.textContent = group.title;

  const count = document.createElement("span");
  count.className = "api-group-count";
  count.textContent = String(group.apis.length);

  toggle.append(chevron, title, count);

  const list = document.createElement("div");
  list.className = "api-group-list";
  list.style.display = isExpanded ? "" : "none";
  for (const api of group.apis) {
    const item = document.createElement("div");
    item.className = "api-group-item";
    item.textContent = api;
    list.appendChild(item);
  }

  toggle.addEventListener("click", () => {
    const nowExpanded = !expandedApiGroups.has(group.id);
    if (nowExpanded) {
      expandedApiGroups.add(group.id);
    } else {
      expandedApiGroups.delete(group.id);
    }
    toggle.setAttribute("aria-expanded", String(nowExpanded));
    list.style.display = nowExpanded ? "" : "none";
  });

  wrapper.append(toggle, list);
  return wrapper;
}

export function updateDetailsView(settings: Settings): void {
  const detailLocation = document.getElementById("detailLocation");
  const detailTimezone = document.getElementById("detailTimezone");
  const detailWebRTC = document.getElementById("detailWebRTC");
  const detailAPIs = document.getElementById("detailAPIs");

  if (detailLocation) {
    renderLocationDetails(detailLocation, settings.location, settings.locationName);
  }
  if (detailTimezone) {
    renderTimezoneDetails(detailTimezone, settings.timezone);
  }
  if (detailWebRTC) {
    renderWebRTCDetails(detailWebRTC, settings.webrtcProtection);
  }
  if (detailAPIs) {
    renderAPIsDetails(
      detailAPIs,
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
    coordsEl.textContent = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`;
  }
}

/** Helper to clear all children from an element */
export function clearChildren(el: Element): void {
  while (el.firstChild) {
    el.removeChild(el.firstChild);
  }
}
