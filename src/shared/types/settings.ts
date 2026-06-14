/**
 * Location coordinates with accuracy.
 */
export interface Location {
  /** Latitude in decimal degrees (-90 to 90) */
  latitude: number;
  /** Longitude in decimal degrees (-180 to 180) */
  longitude: number;
  /** Accuracy in meters */
  accuracy: number;
}

/**
 * Timezone information for a location.
 */
export interface Timezone {
  /** IANA timezone identifier (e.g., "America/Los_Angeles") */
  identifier: string;
  /** Minutes from UTC (e.g., 480 for PST) */
  offset: number;
  /** DST offset in minutes */
  dstOffset: number;
  /** True if timezone was estimated from longitude rather than API lookup */
  fallback?: boolean;
}

/**
 * Display name information for a location.
 */
export interface LocationName {
  /** City name */
  city: string;
  /** Country name */
  country: string;
  /** Full display name (e.g., "San Francisco, CA, USA") */
  displayName: string;
}

/**
 * A saved favorite location.
 */
export interface Favorite {
  /** Unique identifier — timestamp-based string, e.g. Date.now().toString() */
  id: string;
  latitude: number;
  longitude: number;
  /** City name from reverse geocode */
  city: string;
  /** Country name from reverse geocode */
  country: string;
  /** Full display name from reverse geocode, capped at 100 characters */
  displayName: string;
  /** User-defined label; overrides city when non-empty. null = use city fallback */
  label: string | null;
}

/**
 * Site-scoping mode. "all" preserves the pre-1.1 global behavior.
 */
export type ScopeMode = "all" | "allowlist" | "denylist";

/**
 * Complete extension settings persisted in browser.storage.local.
 */
export interface Settings {
  /** Whether location spoofing is active */
  enabled: boolean;
  /** Spoofed location coordinates, or null if not set */
  location: Location | null;
  /** Timezone information for the spoofed location */
  timezone: Timezone | null;
  /** Cached display name for the spoofed location */
  locationName: LocationName | null;
  /** Whether WebRTC IP leak protection is enabled */
  webrtcProtection: boolean;
  /** Whether the user has completed onboarding */
  onboardingCompleted: boolean;
  /** Settings schema version (for migrations) */
  version: string;
  /** Timestamp of last settings update (milliseconds since epoch) */
  lastUpdated: number;
  /** Whether VPN sync mode is the active location method */
  vpnSyncEnabled: boolean;
  /** Whether debug logging is enabled */
  debugLogging: boolean;
  /** Active verbosity level threshold for the debug logger */
  verbosityLevel: string;
  /** UI theme preference */
  theme: "system" | "light" | "dark";
  /** Saved favorite locations */
  favorites: Favorite[];
  /** Which sites are spoofed when `enabled` is true */
  scopeMode: ScopeMode;
  /** Normalized domain strings spoofed in allowlist mode */
  allowlist: string[];
  /** Normalized domain strings excluded in denylist mode */
  denylist: string[];
}

/**
 * Default settings used when no saved settings exist.
 */
export const DEFAULT_SETTINGS: Settings = {
  enabled: false,
  location: null,
  timezone: null,
  locationName: null,
  webrtcProtection: false,
  onboardingCompleted: false,
  version: "1.1",
  // Epoch 0 (not Date.now()): a never-saved settings object hasn't been
  // "updated" yet. On Safari first run the app→extension adoption gate in
  // app-bridge.ts compares the app's pending-write timestamp against this; a
  // Date.now() default would make the freshly-booted extension look newer than
  // the user's earlier in-app setup and silently discard it. saveSettings()
  // always stamps Date.now() before persisting, so stored settings are real.
  lastUpdated: 0,
  vpnSyncEnabled: false,
  debugLogging: false,
  verbosityLevel: "INFO",
  theme: "system",
  favorites: [],
  scopeMode: "all",
  allowlist: [],
  denylist: [],
};
