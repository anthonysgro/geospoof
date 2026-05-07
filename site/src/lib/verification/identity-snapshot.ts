/**
 * Shared identity snapshot used by the Verification Dashboard.
 *
 * A single snapshot is produced per run by the identity provider and
 * consumed by both the Identity Panel (for rendering) and the
 * values-correctness / internal-consistency tests (for assertions). This
 * guarantees the panel and the tests cannot disagree with each other.
 *
 * This module MUST stay pure data declarations — no browser-global access
 * at import time so it is safe to load under SSR.
 */

/**
 * Resolution state of an asynchronously-resolved identity field.
 */
export type AsyncFieldStatus = "pending" | "ready" | "error"

/**
 * Tri-state wrapper for identity fields that cannot be read synchronously
 * (geolocation, high-entropy user-agent data).
 */
export interface AsyncField<T> {
  status: AsyncFieldStatus
  value: T | null
  error: string | null
}

/**
 * Location as reported by `navigator.geolocation.getCurrentPosition`.
 */
export interface LocationValue {
  latitude: number
  longitude: number
  accuracy: number | null
}

/**
 * Timezone view resolved synchronously via Intl + Date APIs.
 */
export interface TimezoneValue {
  /** IANA id from `Intl.DateTimeFormat().resolvedOptions().timeZone`. */
  identifier: string
  /** Minutes from UTC as reported by `new Date().getTimezoneOffset()`. */
  offsetMinutes: number
  /** Long timezone name from `formatToParts` with `timeZoneName: "long"`. */
  longName: string
  /** Whether daylight saving time is currently active. */
  dstActive: boolean
}

/**
 * Language and locale view resolved synchronously.
 */
export interface LanguageValue {
  /** `navigator.language`. */
  primary: string
  /** `navigator.languages`. */
  all: ReadonlyArray<string>
  /** `Intl.DateTimeFormat().resolvedOptions().locale`. */
  intlLocale: string | null
}

/**
 * Platform view. The primary label resolves synchronously; the high-entropy
 * fields resolve via `navigator.userAgentData.getHighEntropyValues(...)`.
 */
export interface PlatformValue {
  /** Human-readable summary (no raw UA echo). */
  label: string
  platform: string | null
  platformVersion: string | null
  architecture: string | null
  hardwareConcurrency: number | null
  uaDataAvailable: boolean
}

/**
 * Runtime availability of relevant browser features.
 *
 * Missing features are never counted as detectable issues — they only
 * affect which tests can run.
 */
export interface FeatureAvailability {
  geolocation: boolean
  permissions: boolean
  userAgentData: boolean
  intlDateTimeFormat: boolean
  intlFormatToParts: boolean
  temporal: boolean
  temporalTimeZoneId: boolean
}

/**
 * Full identity snapshot for a single verification run.
 */
export interface IdentitySnapshot {
  /** Monotonically increasing id; bumps on every "Run again". */
  runId: number
  /** When the snapshot was first taken for this run (epoch ms). */
  startedAt: number
  location: AsyncField<LocationValue>
  platform: AsyncField<PlatformValue>
  timezone: TimezoneValue
  language: LanguageValue
  features: FeatureAvailability
}
