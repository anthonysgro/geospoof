# GeoSpoof API Documentation

Technical documentation for the GeoSpoof browser extension (Firefox + Chromium + Safari).

## Table of Contents

1. [API Override Summary](#api-override-summary)
2. [Injected Script Architecture](#injected-script-architecture)
3. [Message Types and Payloads](#message-types-and-payloads)
4. [Settings Schema](#settings-schema)
5. [Data Models](#data-models)
6. [External API Integration](#external-api-integration)
7. [Known Limitations](#known-limitations)
8. [Performance Targets](#performance-targets)
9. [Browser Compatibility](#browser-compatibility)

## API Override Summary

All overrides are injected synchronously at `document_start` before any page JavaScript runs.

| API                                          | Override Behavior                                   |
| -------------------------------------------- | --------------------------------------------------- |
| `navigator.geolocation.getCurrentPosition`   | Returns spoofed coords with 10-50ms realistic delay |
| `navigator.geolocation.watchPosition`        | Returns spoofed coords on each callback             |
| `navigator.geolocation.clearWatch`           | Clears spoofed watch                                |
| `navigator.permissions.query("geolocation")` | Returns "granted" when spoofing enabled             |
| `Date()` constructor (no-arg)                | Passthrough (current time)                          |
| `Date(string)` — ambiguous                   | Epoch adjusted by offset difference                 |
| `Date(string)` — explicit tz                 | Passthrough                                         |
| `Date(y, m, d, ...)` — multi-arg             | Epoch adjusted by offset difference                 |
| `Date.parse(string)`                         | Same adjustment as constructor                      |
| `Date.prototype.getTimezoneOffset`           | Negated Intl-based offset for spoofed tz            |
| `Date.prototype.toString`                    | Formatted with spoofed tz name and offset           |
| `Date.prototype.toDateString`                | Formatted in spoofed timezone                       |
| `Date.prototype.toTimeString`                | Formatted with spoofed offset and tz name           |
| `Date.prototype.toLocaleString`              | Timezone injected into options                      |
| `Date.prototype.toLocaleDateString`          | Timezone injected into options                      |
| `Date.prototype.toLocaleTimeString`          | Timezone injected into options                      |
| `Date.prototype.getHours/Minutes/Seconds`    | Computed via `formatToParts` in spoofed tz          |
| `Date.prototype.getDate/Day/Month/FullYear`  | Computed via `formatToParts` in spoofed tz          |
| `Date.prototype.getMilliseconds`             | Passthrough (timezone-independent)                  |
| `Intl.DateTimeFormat` constructor            | Injects spoofed timezone when no explicit tz        |
| `Intl.DateTimeFormat.resolvedOptions`        | Returns spoofed tz for non-explicit instances       |
| `Temporal.Now.timeZoneId`                    | Returns spoofed identifier                          |
| `Temporal.Now.plainDateTimeISO`              | Passes spoofed tz when no arg                       |
| `Temporal.Now.plainDateISO`                  | Passes spoofed tz when no arg                       |
| `Temporal.Now.plainTimeISO`                  | Passes spoofed tz when no arg                       |
| `Temporal.Now.zonedDateTimeISO`              | Passes spoofed tz when no arg                       |
| `Function.prototype.toString`                | Returns `[native code]` for all overrides           |
| `HTMLIFrameElement.contentWindow`            | Patches iframe toString on access                   |
| `HTMLIFrameElement.contentDocument`          | Triggers contentWindow patching first               |
| DOM insertion methods (11 total)             | Synchronously scan for iframes and patch            |

## Injected Script Architecture

The injected script runs in page context and overrides browser APIs. It's organized as modular TypeScript files bundled into a single IIFE by Vite.

### Module Initialization Order

Order matters — each module depends on the ones before it:

1. **function-masking** — `toString` masking infrastructure
2. **state** — Original API references captured at import time
3. **date-constructor** — Global `Date` replaced
4. **settings-listener** — CustomEvent listener for settings updates
5. **geolocation** — `getCurrentPosition`, `watchPosition`, `clearWatch`
6. **permissions** — `navigator.permissions.query`
7. **timezone-overrides** — `getTimezoneOffset`, `Intl.DateTimeFormat` constructor + `resolvedOptions`
8. **date-formatting** — `toString`, `toDateString`, `toTimeString`, `toLocale*`
9. **date-getters** — `getHours`, `getMinutes`, `getSeconds`, `getDate`, `getDay`, `getMonth`, `getFullYear`
10. **temporal** — `Temporal.Now.*` (feature-detected, no-ops if unavailable)
11. **iframe-patching** — `contentWindow`/`contentDocument` getter overrides
12. **dom-insertion** — DOM method wrapping + MutationObserver fallback

### Key Modules

#### state.ts

Centralized mutable state and original API references. All originals captured at module load time before any overrides.

Exports:

- `spoofingEnabled`, `spoofedLocation`, `timezoneData`, `settingsReceived` — mutable state with setter functions
- `OriginalDate`, `OriginalDateParse`, `OriginalDateTimeFormat` — pristine constructors
- `originalGetTimezoneOffset`, `originalToString`, `originalGetHours`, etc. — unbound prototype methods
- `overrideRegistry` — `Map<Function, string>` for toString masking
- `explicitTimezoneInstances` — `WeakSet<Intl.DateTimeFormat>` for self-interference prevention
- `EVENT_NAME` — configurable event name (build-time)

#### function-masking.ts

Anti-fingerprinting infrastructure. Key exports:

- `initFunctionMasking()` — Installs `Function.prototype.toString` override. Must be called first.
- `registerOverride(fn, nativeName)` — Register a function in the override registry
- `disguiseAsNative(fn, nativeName, length)` — Set name/length, delete prototype
- `stripConstruct(fn)` — Wrap in method shorthand to remove `[[Construct]]` and `prototype`
- `installOverride(target, prop, overrideFn)` — Full install: register, disguise, define property. Auto-wraps function expressions via `stripConstruct`.

#### timezone-helpers.ts

Pure utility functions (no side effects on globals):

- `getIntlBasedOffset(date, timezoneId, fallback)` — Resolve UTC offset via `Intl.DateTimeFormat` with `shortOffset`
- `formatGMTOffset(offsetMinutes)` — Convert offset to `GMT±HHMM` string
- `getLongTimezoneName(date, timezoneId)` — Extract long timezone name (e.g. "Pacific Daylight Time")
- `isAmbiguousDateString(str)` — Detect date strings without explicit timezone indicator
- `computeEpochAdjustment(parsedDate, timezoneId, fallback)` — Compute ms adjustment for Date constructor spoofing with iterative DST refinement
- `parseGMTOffset(gmtString)` — Parse `GMT+5:30` style strings to minutes
- `validateTimezoneData(tz)` — Runtime type guard for TimezoneData

#### temporal.ts

Feature-detected Temporal API overrides. Overrides `Temporal.Now` methods when available:

- `timeZoneId()` — returns spoofed identifier
- `plainDateTimeISO()`, `plainDateISO()`, `plainTimeISO()`, `zonedDateTimeISO()` — pass spoofed identifier when no explicit timezone argument provided

### Content Script → Injected Script Communication

Uses `CustomEvent` with a configurable event name (`EVENT_NAME`, set at build time, defaults to `"__x_evt"`). CSP-safe.

```typescript
interface SettingsEventDetail {
  enabled: boolean;
  location: Location | null;
  timezone: Timezone | null;
}
```

On Firefox, `cloneInto()` is used to make the detail object accessible across content-script / page-context boundaries.

## Message Types and Payloads

The extension uses `browser.runtime.sendMessage` and `browser.runtime.onMessage` for inter-component communication. All messages follow this structure:

```typescript
{
  type: string,      // Message type identifier
  payload?: object   // Message-specific data
}
```

### Popup → Background Messages

#### SET_LOCATION

```typescript
{ type: "SET_LOCATION", payload: { latitude: number, longitude: number } }
```

Side effects: Calculates timezone (offline via browser-geo-tz), performs reverse geocoding, saves to storage, broadcasts to all content scripts, updates badge.

#### SET_PROTECTION_STATUS

```typescript
{ type: "SET_PROTECTION_STATUS", payload: { enabled: boolean } }
```

Side effects: Saves status, updates badge (green/gray), broadcasts to content scripts.

#### SET_WEBRTC_PROTECTION

```typescript
{ type: "SET_WEBRTC_PROTECTION", payload: { enabled: boolean } }
```

Side effects: Configures browser privacy API settings, saves to storage.

#### GEOCODE_QUERY

```typescript
{ type: "GEOCODE_QUERY", payload: { query: string } }
```

Response: `{ results: [{ name, latitude, longitude, city, country }] }`
Error: `{ error: "TIMEOUT" | "NETWORK" | "NO_RESULTS", message: string }`

#### GET_SETTINGS

```typescript
{
  type: "GET_SETTINGS";
}
```

Response: Complete settings object.

#### COMPLETE_ONBOARDING

```typescript
{
  type: "COMPLETE_ONBOARDING";
}
```

### Background → Content Script Messages

#### UPDATE_SETTINGS

```typescript
{
  type: "UPDATE_SETTINGS",
  payload: {
    enabled: boolean,
    location: { latitude: number, longitude: number, accuracy: number } | null,
    timezone: { identifier: string, offset: number, dstOffset: number } | null
  }
}
```

#### PING

```typescript
{
  type: "PING";
}
```

Response: `{ pong: true }` — used for injection health checks via `browser.alarms`.

## Settings Schema

Persisted in `browser.storage.local` under the key `"settings"`.

```typescript
{
  enabled: boolean,
  location: { latitude: number, longitude: number, accuracy: number } | null,
  timezone: { identifier: string, offset: number, dstOffset: number } | null,
  locationName: { city: string, country: string, displayName: string } | null,
  webrtcProtection: boolean,
  onboardingCompleted: boolean,
  vpnSyncEnabled: boolean,
  version: string,
  lastUpdated: number
}
```

## Data Models

### Location

```typescript
{ latitude: number, longitude: number, accuracy: number }
```

### Timezone

```typescript
{ identifier: string, offset: number, dstOffset: number }
// identifier: IANA timezone ID (e.g. "America/Los_Angeles")
// offset: Minutes from UTC (e.g. -480 for PST)
// dstOffset: DST offset in minutes
```

### LocationName

```typescript
{ city: string, country: string, displayName: string }
```

### GeolocationPosition (W3C)

```typescript
{
  coords: {
    latitude: number, longitude: number, accuracy: number,
    altitude: null, altitudeAccuracy: null, heading: null, speed: null
  },
  timestamp: number
}
```

## External API Integration

### Nominatim Geocoding API (OpenStreetMap)

Base URL: `https://nominatim.openstreetmap.org`
Rate Limit: 1 req/sec | Auth: None | Timeout: 5s | Retry: 3x exponential backoff

- Forward geocoding: `/search?q=...&format=json&limit=5&addressdetails=1`
- Reverse geocoding: `/reverse?lat=...&lon=...&format=json&addressdetails=1`
- Caching: In-memory by rounded coordinates (4 decimal places)
- User-Agent: `GeoSpoof-Extension/1.0`

### Offline Timezone Lookup

Uses `browser-geo-tz` npm package for offline coordinate-to-timezone resolution. No external API calls needed for timezone lookup.

### VPN Sync IP Geolocation

Public IP detected via `api.ipify.org`. Geolocation resolved in parallel across four services (first success wins):

| Service                    | URL                                        |
| -------------------------- | ------------------------------------------ |
| GeoJS (primary)            | `https://get.geojs.io/v1/ip/geo/{ip}.json` |
| FreeIPAPI (fallback)       | `https://free.freeipapi.com/api/json/{ip}` |
| ReallyFreeGeoIP (fallback) | `https://reallyfreegeoip.org/json/{ip}`    |
| ipinfo.io (fallback)       | `https://ipinfo.io/{ip}/json`              |

Timeout: 5s per service | Retry: 2x exponential backoff | Results cached in memory and `browser.storage.local` (30 days).

## Known Limitations

1. **Web Workers** — Content scripts cannot inject into Worker/SharedWorker contexts, so real timezone can leak there
2. **Cross-origin iframes** — Timing side-channels can reveal discrepancies
3. **SharedArrayBuffer timing** — High-resolution timing can fingerprint override execution patterns
4. **Engine internal checks** — Brand checks and internal slots can distinguish overrides from native
5. **IP geolocation** — Extension does not mask IP address (use a VPN for that)

## Performance Targets

| Operation                | Target                    |
| ------------------------ | ------------------------- |
| Geolocation API overhead | <50ms per call            |
| Popup open time          | <200ms                    |
| Settings save            | <500ms                    |
| Settings load on startup | <1 second                 |
| Geocoding request        | <5 seconds (with timeout) |
| Badge update             | <100ms                    |

## Browser Compatibility

| Browser               | Minimum Version |
| --------------------- | --------------- |
| Firefox               | 140+ (MV3)      |
| Firefox Android       | 140+            |
| Chrome / Brave / Edge | MV3             |
| Safari (macOS)        | 15+             |
| Safari (iOS / iPadOS) | 15+             |
