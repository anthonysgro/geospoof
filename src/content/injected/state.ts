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

/**
 * Event name for announcing an imminent worker-script fetch so the
 * background-script webRequest listener can allowlist the URL. One-way
 * (page-context → content script → background). Must match the
 * constant in `src/content/index.ts`.
 */
export const ANNOUNCE_EVENT_NAME: string = (process.env.EVENT_NAME || "__x_evt") + "_announce";

/**
 * Milliseconds to wait for settings before giving up.
 * This must be long enough to cover the background script round-trip on a
 * cold page load (GET_SETTINGS → background → content script → CustomEvent).
 * Falling through to the real API on timeout would leak the user's real
 * location to pages that call getCurrentPosition early (e.g. in <head>).
 */
export const SETTINGS_WAIT_TIMEOUT = 3000;

/**
 * True when the engine truncates sub-minute historical offsets to an integer in
 * `Date.prototype.getTimezoneOffset()` (V8: Chrome/Chromium/Edge). SpiderMonkey
 * (Firefox/Thunderbird) preserves the fractional value.
 *
 * Detection strategy: key off engine identity, NOT a behavioral probe of another
 * surface. This flag governs how `getTimezoneOffset` rounds, but `getTimezoneOffset`
 * cannot be probed for an arbitrary zone (it only ever reports the real system
 * zone), so there is no direct behavioral probe available.
 *
 * The previous approach probed the Intl `shortOffset` string for a sub-minute zone
 * and inferred truncation from whether it carried a `:SS` component. That inference
 * no longer holds: modern V8 emits seconds in `shortOffset` (e.g. "GMT+9:18:59" for
 * Asia/Tokyo pre-1888) while STILL truncating `getTimezoneOffset` to whole minutes.
 * One surface can no longer predict the other, so the probe misclassified current
 * Chrome as Firefox-like and leaked a fractional `getTimezoneOffset`.
 *
 * `InternalError` is a SpiderMonkey-only global exposed to web content; V8 (and
 * JavaScriptCore) do not define it. Anything that is not positively identified as
 * SpiderMonkey is treated as truncating, matching V8 (the dominant target) and the
 * previous default-truncate fallback.
 */
function detectEngineTruncatesOffset(): boolean {
  try {
    // SpiderMonkey preserves fractional sub-minute offsets → does not truncate.
    return typeof (globalThis as { InternalError?: unknown }).InternalError === "undefined";
  } catch {
    // Fallback: assume truncation (V8-like behavior) on any error.
    return true;
  }
}

export const engineTruncatesOffset: boolean = detectEngineTruncatesOffset();

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

// Unbound native geolocation methods, captured before overrides are applied.
// Unlike the bound `original*` refs above, these are invoked via
// `Reflect.apply(fn, self, args)` so the browser performs its own WebIDL
// brand check and argument coercion against an arbitrary `this` — reproducing
// the exact native TypeError (correct type, per-engine message, native stack)
// when the override is called with a foreign `this` or invalid arguments.
// See `reproduceNativeGeoError` in geolocation.ts. Reading the property off the
// instance yields the same function object as `Geolocation.prototype.<method>`.
/* eslint-disable @typescript-eslint/unbound-method */
export const nativeGetCurrentPosition = navigator.geolocation.getCurrentPosition;
export const nativeWatchPosition = navigator.geolocation.watchPosition;
export const nativeClearWatch = navigator.geolocation.clearWatch;
/* eslint-enable @typescript-eslint/unbound-method */

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
export const originalSetHours = Date.prototype.setHours;
export const originalSetMinutes = Date.prototype.setMinutes;
export const originalSetSeconds = Date.prototype.setSeconds;
export const originalSetMilliseconds = Date.prototype.setMilliseconds;
export const originalSetDate = Date.prototype.setDate;
export const originalSetMonth = Date.prototype.setMonth;
export const originalSetFullYear = Date.prototype.setFullYear;
export const originalSetTime = Date.prototype.setTime;
/* eslint-enable @typescript-eslint/unbound-method */
// Permissions original (may be undefined if API unavailable)
export const originalPermissionsQuery = navigator.permissions?.query?.bind(navigator.permissions);

// Unbound native `Permissions.prototype.query`, captured before the override.
// Used to reproduce the browser's own brand-check error when `query` is called
// with a `this` that isn't a real `Permissions` object (native throws
// synchronously; our override must too). May be undefined if the Permissions
// API isn't exposed. See `permissions.ts`.
/* eslint-disable @typescript-eslint/unbound-method */
export const nativePermissionsQuery =
  typeof Permissions !== "undefined" && Permissions.prototype
    ? Permissions.prototype.query
    : undefined;
/* eslint-enable @typescript-eslint/unbound-method */

/**
 * Original WebRTC constructor reference, captured at module load
 * time before any overrides. May be `undefined` on engines that
 * don't expose WebRTC at all (very rare — essentially legacy
 * mobile browsers). Consumed by `webrtc.ts` to build the pristine
 * passthrough when protection is disabled and to subclass the
 * brand-checked prototype when protection is enabled.
 */
export const OriginalRTCPeerConnection: typeof RTCPeerConnection | undefined =
  typeof RTCPeerConnection !== "undefined" ? RTCPeerConnection : undefined;

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

export let debugEnabled = false;
export let spoofingEnabled = false;
export let spoofedLocation: SpoofedLocation | null = null;
export let timezoneData: TimezoneData | null = null;
export let settingsReceived = false;
/**
 * Content-script-level WebRTC IP-leak protection flag.
 *
 * Set from the settings CustomEvent and consumed by the
 * `installWebRTCOverride` module. When `true` the wrapped
 * `RTCPeerConnection` constructor refuses to gather any ICE
 * candidates (blocks srflx, host, relay — everything), and
 * `.getStats()` strips address/ip fields from local-candidate
 * reports. When `false` the native API passes through untouched.
 *
 * Orthogonal to `spoofingEnabled` — a user could have location
 * spoofing off but WebRTC protection on (closes the leak in
 * real-location mode too, useful for VPN users).
 */
export let webrtcProtectionEnabled = false;

/**
 * Content-script-level "preserve permission prompts" flag.
 *
 * When false (default), the geolocation override answers `getCurrentPosition`
 * / `watchPosition` directly with spoofed coordinates and forces
 * `permissions.query` to report `"granted"` — so a site silently receives a
 * location and never sees the native browser prompt.
 *
 * When true, the override instead calls the real geolocation API to surface
 * the browser's own permission prompt; it substitutes spoofed coordinates only
 * after the user grants, and forwards denials/errors unchanged. The
 * `permissions.query` override also stops forcing `"granted"` and reports the
 * real permission state. This trades the seamless VPN-companion experience for
 * lower fingerprinting entropy (denied sites behave like a normal browser) and
 * genuine per-site user control. Set from the settings CustomEvent.
 */
export let preserveGeolocationPrompt = false;

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

export function setDebugEnabled(v: boolean): void {
  debugEnabled = v;
}

export function setWebRTCProtectionEnabled(v: boolean): void {
  webrtcProtectionEnabled = v;
}

export function setPreserveGeolocationPrompt(v: boolean): void {
  preserveGeolocationPrompt = v;
}
