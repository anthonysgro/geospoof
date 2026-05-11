import type { Location, Timezone, Settings } from "./settings";

/**
 * All supported message types for inter-component communication.
 */
export type MessageType =
  | "SET_LOCATION"
  | "SET_PROTECTION_STATUS"
  | "SET_WEBRTC_PROTECTION"
  | "ANNOUNCE_WORKER_FETCH"
  | "GEOCODE_QUERY"
  | "GET_SETTINGS"
  | "UPDATE_SETTINGS"
  | "COMPLETE_ONBOARDING"
  | "CHECK_TAB_INJECTION"
  | "PING"
  | "SYNC_VPN"
  | "DISABLE_VPN_SYNC"
  | "CLEAR_LOCATION"
  | "SET_DEBUG_LOGGING"
  | "SET_VERBOSITY_LEVEL"
  | "SET_THEME";

/**
 * Generic message structure for runtime messaging.
 */
export interface Message<T = unknown> {
  type: MessageType;
  payload?: T;
}

// --- Payload types for each message ---

export interface SetLocationPayload {
  latitude: number;
  longitude: number;
}

export interface SetProtectionStatusPayload {
  enabled: boolean;
}

export interface SetWebRTCProtectionPayload {
  enabled: boolean;
}

/**
 * Sent by the content-script Worker / ServiceWorker wrapper just
 * before it hands off to the real browser constructor so the
 * background script's webRequest.filterResponseData listener knows
 * the next request for `url` is a worker script (not a regular
 * `<script>` tag) and should be modified.
 *
 * The background registers the URL in a short-lived allowlist; the
 * webRequest listener matches incoming requests against that list.
 * No response is needed — this is fire-and-forget.
 */
export interface AnnounceWorkerFetchPayload {
  url: string;
}

export interface GeocodeQueryPayload {
  query: string;
}

export interface CheckTabInjectionPayload {
  tabId: number;
}

// --- Response types ---

export interface GeocodeResult {
  name: string;
  latitude: number;
  longitude: number;
  city: string;
  country: string;
}

export interface GeocodeResponse {
  results?: GeocodeResult[];
  error?: "TIMEOUT" | "NETWORK" | "NO_RESULTS";
  message?: string;
}

export interface InjectionStatus {
  injected: boolean;
  error: string | null;
}

/**
 * Payload sent from background to content scripts when settings change.
 */
export interface SetDebugLoggingPayload {
  enabled: boolean;
}

export interface SetVerbosityLevelPayload {
  level: string;
}

export interface SetThemePayload {
  theme: "system" | "light" | "dark";
}

export interface UpdateSettingsPayload {
  enabled: boolean;
  location: Location | null;
  timezone: Timezone | null;
  debugLogging: boolean;
  verbosityLevel: string;
  /**
   * When true the injected script wraps RTCPeerConnection (both the
   * constructor and getStats) so no ICE candidates are ever gathered
   * or surfaced, regardless of what `browser.privacy.network.
   * webRTCIPHandlingPolicy` does at the browser layer.
   *
   * This closes two gaps left by the browser-level policy:
   *   - Firefox only honours `disable_non_proxied_udp` when a proxy
   *     is configured; without one, srflx still leaks.
   *   - Safari doesn't expose `browser.privacy` at all.
   */
  webrtcProtection: boolean;
}

/**
 * Response shape for GET_SETTINGS messages.
 */
export type GetSettingsResponse = Settings;

// --- VPN Sync types ---

export type VpnSyncErrorCode =
  | "IP_DETECTION_FAILED"
  | "GEOLOCATION_FAILED"
  | "IP_BLOCKED"
  | "NETWORK";

export interface SyncVpnPayload {
  forceRefresh?: boolean;
}

export interface SyncVpnSuccessResponse {
  latitude: number;
  longitude: number;
  city: string;
  country: string;
  ip: string;
}

export interface SyncVpnErrorResponse {
  error: VpnSyncErrorCode;
  message: string;
}

export type SyncVpnResponse = SyncVpnSuccessResponse | SyncVpnErrorResponse;
