import type { Location, Timezone, Settings } from "./settings";

/**
 * All supported message types for inter-component communication.
 */
export type MessageType =
  | "SET_LOCATION"
  | "SET_PROTECTION_STATUS"
  | "SET_WEBRTC_PROTECTION"
  | "GEOCODE_QUERY"
  | "GET_SETTINGS"
  | "UPDATE_SETTINGS"
  | "COMPLETE_ONBOARDING"
  | "CHECK_TAB_INJECTION"
  | "PING"
  | "SYNC_VPN"
  | "DISABLE_VPN_SYNC"
  | "CLEAR_LOCATION";

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
export interface UpdateSettingsPayload {
  enabled: boolean;
  location: Location | null;
  timezone: Timezone | null;
}

/**
 * Response shape for GET_SETTINGS messages.
 */
export type GetSettingsResponse = Settings;

// --- VPN Sync types ---

export type VpnSyncErrorCode = "IP_DETECTION_FAILED" | "GEOLOCATION_FAILED" | "NETWORK";

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
