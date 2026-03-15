/**
 * Shared mutable state, original API references, and constants.
 * All cross-module state is centralized here with controlled access via setters.
 */

import type { SpoofedLocation, TimezoneData, AnyFunction } from "./types";

// ── Build-time declarations ──────────────────────────────────────────

/* eslint-disable no-var */
// `process.env.EVENT_NAME` is replaced at build time by Vite's `define` config.
declare var process: { env: Record<string, string | undefined> };
/* eslint-enable no-var */

// ── Constants ────────────────────────────────────────────────────────

/** Event name for settings updates (must match content script). */
export const EVENT_NAME: string = process.env.EVENT_NAME || "__x_evt";

/** Milliseconds to wait for settings before falling through to real API. */
export const SETTINGS_WAIT_TIMEOUT = 500;

// ── Override registry ────────────────────────────────────────────────

export const overrideRegistry = new Map<AnyFunction, string>();

// ── Explicit timezone instances tracking ─────────────────────────────

export const explicitTimezoneInstances = new WeakSet<Intl.DateTimeFormat>();

// ── Original API references ──────────────────────────────────────────
// Captured at module load time, before any overrides are applied.

// eslint-disable-next-line @typescript-eslint/unbound-method
export const originalFunctionToString = Function.prototype.toString;
// eslint-disable-next-line @typescript-eslint/unbound-method
export const originalCall = Function.prototype.call;

export const OriginalDate = Date;
export const OriginalDateParse = Date.parse;

// Geolocation originals (bound to navigator.geolocation)
export const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(
  navigator.geolocation
);
export const originalWatchPosition = navigator.geolocation.watchPosition.bind(
  navigator.geolocation
);
export const originalClearWatch = navigator.geolocation.clearWatch.bind(navigator.geolocation);

// Date prototype originals
// These are intentionally detached and always re-bound at call sites via `.call(this)`.
/* eslint-disable @typescript-eslint/unbound-method */
export const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
export const OriginalDateTimeFormat = Intl.DateTimeFormat;
export const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
export const originalToString = Date.prototype.toString;
export const originalToTimeString = Date.prototype.toTimeString;
export const originalToLocaleString = Date.prototype.toLocaleString;
export const originalToLocaleDateString = Date.prototype.toLocaleDateString;
export const originalToDateString = Date.prototype.toDateString;
export const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
export const originalGetHours = Date.prototype.getHours;
export const originalGetMinutes = Date.prototype.getMinutes;
export const originalGetSeconds = Date.prototype.getSeconds;
export const originalGetMilliseconds = Date.prototype.getMilliseconds;
export const originalGetDate = Date.prototype.getDate;
export const originalGetDay = Date.prototype.getDay;
export const originalGetMonth = Date.prototype.getMonth;
export const originalGetFullYear = Date.prototype.getFullYear;
/* eslint-enable @typescript-eslint/unbound-method */

// Permissions original (may be undefined if API unavailable)
export const originalPermissionsQuery = navigator.permissions?.query?.bind(navigator.permissions);

// DOM method originals for iframe patching / DOM insertion wrapping
/* eslint-disable @typescript-eslint/unbound-method */
export const originalAppendChild = Node.prototype.appendChild;
export const originalInsertBefore = Node.prototype.insertBefore;
export const originalReplaceChild = Node.prototype.replaceChild;
export const originalAppend = Element.prototype.append;
export const originalPrepend = Element.prototype.prepend;
export const originalReplaceWith = Element.prototype.replaceWith;
export const originalInsertAdjacentElement = Element.prototype.insertAdjacentElement;
export const originalInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
/* eslint-enable @typescript-eslint/unbound-method */

// ── Mutable spoofing state ───────────────────────────────────────────

export let spoofingEnabled = false;
export let spoofedLocation: SpoofedLocation | null = null;
export let timezoneData: TimezoneData | null = null;
export let settingsReceived = false;

// Setter functions for state mutation from other modules
export function setSpoofingEnabled(v: boolean): void {
  spoofingEnabled = v;
}

export function setSpoofedLocation(v: SpoofedLocation | null): void {
  spoofedLocation = v;
}

export function setTimezoneData(v: TimezoneData | null): void {
  timezoneData = v;
}

export function setSettingsReceived(v: boolean): void {
  settingsReceived = v;
}
