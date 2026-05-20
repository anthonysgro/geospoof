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

### Geolocation (`Geolocation.prototype`)

Overrides are installed on `Geolocation.prototype` (not on the per-window `navigator.geolocation` instance), preserving the WebIDL-specified native descriptor shape (`writable: true, configurable: true, enumerable: true`). This matches native layout: `Object.getOwnPropertyDescriptor(navigator.geolocation, "getCurrentPosition")` correctly returns `undefined` because the method is inherited from the prototype.

Spoofed `GeolocationPosition` and `GeolocationCoordinates` instances are allocated via `Object.create(...)` with values stored in WeakMaps, so they have zero own properties — `Object.getOwnPropertyNames(pos)` returns `[]`, matching native.

| API                                                                                                            | Override Behavior                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `Geolocation.prototype.getCurrentPosition`                                                                     | Returns spoofed coords with 10-50ms realistic delay; brand-checks `this`; serves cached result sub-millisecond when `maximumAge` is honored |
| `Geolocation.prototype.watchPosition`                                                                          | Initial callback at 10-50ms; re-fires every 1-2s matching native stationary-device cadence                                                  |
| `Geolocation.prototype.clearWatch`                                                                             | Clears spoofed watch                                                                                                                        |
| `GeolocationCoordinates.prototype.{latitude, longitude, accuracy, altitude, altitudeAccuracy, heading, speed}` | Accessor getters that read from WeakMap slots for spoofed instances and fall through to native for pristine instances                       |
| `GeolocationPosition.prototype.{coords, timestamp}`                                                            | Same accessor pattern as above                                                                                                              |
| `GeolocationPosition.prototype.toJSON`                                                                         | Returns populated shape from WeakMap slots for spoofed instances; falls through to native for pristine instances                            |
| `GeolocationCoordinates.prototype.toJSON`                                                                      | Same pattern; returns the seven-field coordinate JSON shape                                                                                 |

### Permissions (`Permissions.prototype`)

Installed on `Permissions.prototype` preserving native descriptor flags.

| API                                                    | Override Behavior                                                                              |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------- |
| `Permissions.prototype.query({ name: "geolocation" })` | Returns a prototype-linked `PermissionStatus` with `state: "granted"` when spoofing is enabled |
| `Permissions.prototype.query({ name: other })`         | Passthrough to native                                                                          |

### Date constructor and statics

| API                              | Override Behavior                                       |
| -------------------------------- | ------------------------------------------------------- |
| `Date` (global)                  | Replaced entirely — spoofing-aware constructor          |
| `Date()` constructor (no-arg)    | Passthrough (current time)                              |
| `Date(string)` — ambiguous       | Epoch adjusted by offset difference                     |
| `Date(string)` — explicit tz     | Passthrough                                             |
| `Date(y, m, d, ...)` — multi-arg | Epoch adjusted by offset difference                     |
| `Date.parse(string)`             | Same adjustment as constructor                          |
| `Date.now`                       | Behavior passthrough; registered for `toString` masking |
| `Date.UTC`                       | Behavior passthrough; registered for `toString` masking |
| `Date.prototype.constructor`     | Re-pointed to the replacement constructor               |

### Date.prototype methods

| API                                    | Override Behavior                                                                                                                          |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `Date.prototype.getTimezoneOffset`     | Negated Intl-based offset for spoofed tz                                                                                                   |
| `Date.prototype.toString`              | Formatted with spoofed tz name and offset                                                                                                  |
| `Date.prototype.toDateString`          | Formatted in spoofed timezone                                                                                                              |
| `Date.prototype.toTimeString`          | Formatted with spoofed offset and tz name                                                                                                  |
| `Date.prototype.toLocaleString`        | Timezone injected into options                                                                                                             |
| `Date.prototype.toLocaleDateString`    | Timezone injected into options                                                                                                             |
| `Date.prototype.toLocaleTimeString`    | Timezone injected into options                                                                                                             |
| `Date.prototype.getHours`              | Computed via engine-specific path in spoofed tz                                                                                            |
| `Date.prototype.getMinutes`            | Computed via engine-specific path in spoofed tz                                                                                            |
| `Date.prototype.getSeconds`            | Computed via engine-specific path in spoofed tz                                                                                            |
| `Date.prototype.getMilliseconds`       | Behavior passthrough (timezone-independent)                                                                                                |
| `Date.prototype.getDate`               | Computed via engine-specific path in spoofed tz                                                                                            |
| `Date.prototype.getDay`                | Computed via engine-specific path in spoofed tz                                                                                            |
| `Date.prototype.getMonth`              | Computed via engine-specific path in spoofed tz                                                                                            |
| `Date.prototype.getFullYear`           | Computed via engine-specific path in spoofed tz                                                                                            |
| `Date.prototype.setHours(h,m?,s?,ms?)` | Components interpreted in spoofed tz; omitted args preserve current spoofed-zone component; DST-refined                                    |
| `Date.prototype.setMinutes(m,s?,ms?)`  | Components interpreted in spoofed tz; omitted args preserve current spoofed-zone component; DST-refined                                    |
| `Date.prototype.setSeconds(s,ms?)`     | Components interpreted in spoofed tz; omitted args preserve current spoofed-zone component; DST-refined                                    |
| `Date.prototype.setDate(d)`            | Day-of-month interpreted in spoofed tz; time-of-day preserved in spoofed tz; DST-refined                                                   |
| `Date.prototype.setMonth(m,d?)`        | Month (and optional day) interpreted in spoofed tz; time-of-day preserved; DST-refined                                                     |
| `Date.prototype.setFullYear(y,m?,d?)`  | Year (and optional month/day) interpreted in spoofed tz; time-of-day preserved; DST-refined; small-year 0-99 literal (not 1900+y) per spec |
| `Date.prototype.setMilliseconds`       | **Not overridden** — timezone-independent, round-trips natively                                                                            |
| `Date.prototype.setTime`               | **Not overridden** — absolute UTC epoch write with no timezone interpretation                                                              |
| `Date.prototype.setUTC*` (all seven)   | **Not overridden** — UTC surfaces, true UTC epoch preserved                                                                                |
| `Date.prototype.toISOString`           | **Not overridden** — UTC surface, true UTC epoch preserved                                                                                 |
| `Date.prototype.toJSON`                | **Not overridden** — delegates to toISOString, true UTC epoch preserved                                                                    |
| `Date.prototype.getUTC*` (all eight)   | **Not overridden** — UTC surfaces, true UTC values preserved                                                                               |

### Intl

| API                                                | Override Behavior                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------- |
| `Intl.DateTimeFormat` constructor                  | Injects spoofed timezone when no explicit tz                                |
| `Intl.DateTimeFormat.prototype.resolvedOptions`    | Returns spoofed tz for non-explicit instances                               |
| `Intl.DateTimeFormat.prototype.formatToParts`      | Inherits spoofed timezone from the constructor; no separate override needed |
| `Intl.DateTimeFormat.prototype.formatRange`        | Inherits spoofed timezone from the constructor (feature-gated)              |
| `Intl.DateTimeFormat.prototype.formatRangeToParts` | Inherits spoofed timezone from the constructor (feature-gated)              |

### Temporal (feature-detected)

| API                                                  | Override Behavior                               |
| ---------------------------------------------------- | ----------------------------------------------- |
| `Temporal.Now.timeZoneId`                            | Returns spoofed identifier                      |
| `Temporal.Now.plainDateTimeISO`                      | Passes spoofed tz when no arg                   |
| `Temporal.Now.plainDateISO`                          | Passes spoofed tz when no arg                   |
| `Temporal.Now.plainTimeISO`                          | Passes spoofed tz when no arg                   |
| `Temporal.Now.zonedDateTimeISO`                      | Passes spoofed tz when no arg                   |
| `Temporal.ZonedDateTime.prototype.offsetNanoseconds` | Passthrough getter; kept for `toString` masking |
| `Temporal.ZonedDateTime.prototype.offset`            | Passthrough getter; kept for `toString` masking |

### Document overrides

| API                                        | Override Behavior                                                                                                                                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Document.prototype.lastModified` (getter) | Reformats the native `"MM/DD/YYYY HH:MM:SS"` string from the real system timezone into the spoofed timezone. Covers `document.lastModified`, `DOMParser`-constructed documents, and `iframe.contentDocument.lastModified` via prototype-level patching. |

### Function masking and stealth infrastructure

| API                           | Override Behavior                                |
| ----------------------------- | ------------------------------------------------ |
| `Function.prototype.toString` | Returns `[native code]` for registered overrides |

### Iframe patching

Two accessor properties on `HTMLIFrameElement.prototype` are wrapped at the top level. When a same-origin iframe window is first accessed, `patchIframeWindow` runs synchronously and installs overrides on the iframe's realm:

1. `Function.prototype.toString` — native-`[native code]`-reporting mask
2. Geolocation — `getCurrentPosition` / `watchPosition` / `clearWatch` on the iframe's `Geolocation.prototype`
3. Permissions — `query` on the iframe's `Permissions.prototype`, returning a prototype-linked `PermissionStatus` with `state: "granted"` for geolocation
4. Intl — `Intl.DateTimeFormat` constructor + `resolvedOptions` on the iframe's realm
5. Date — full spoofing-aware `Date` constructor + `Date.parse` on the iframe's realm
6. Temporal — `Temporal.Now.{timeZoneId,plainDateTimeISO,plainDateISO,plainTimeISO,zonedDateTimeISO}` when available
7. Document — `Document.prototype.lastModified` getter override on the iframe's realm
8. Nested-iframe cascade — iframe-realm copies of `HTMLIFrameElement.prototype.{contentWindow,contentDocument}` getters, `Node.prototype.{appendChild,insertBefore,replaceChild}`, `Element.prototype.{append,prepend,replaceWith,insertAdjacentElement,insertAdjacentHTML}`, the `innerHTML` setter, plus a `MutationObserver` on the iframe's own `documentElement`. This causes nested iframes to trigger `patchIframeWindow` recursively to any depth.

Cross-origin iframes throw `SecurityError` on any access and are silently skipped. All shape/descriptor checks in the cascade use tag-name / duck-typing rather than `instanceof`, because elements created in the iframe's realm are not instances of the top-level constructors.

| API                                                    | Override Behavior                       |
| ------------------------------------------------------ | --------------------------------------- |
| `HTMLIFrameElement.prototype.contentWindow` (getter)   | Patches iframe on access                |
| `HTMLIFrameElement.prototype.contentDocument` (getter) | Triggers `contentWindow` patching first |

### DOM insertion wrapping

Wrapped to synchronously scan inserted subtrees for iframes and patch them before the next line of JavaScript executes. A `MutationObserver` on `document.documentElement` catches anything missed by the wrappers.

| API                                       | Override Behavior                                |
| ----------------------------------------- | ------------------------------------------------ |
| `Node.prototype.appendChild`              | Calls original, then scans inserted node         |
| `Node.prototype.insertBefore`             | Calls original, then scans inserted node         |
| `Node.prototype.replaceChild`             | Calls original, then scans inserted node         |
| `Element.prototype.append`                | Calls original, then scans inserted nodes        |
| `Element.prototype.prepend`               | Calls original, then scans inserted nodes        |
| `Element.prototype.replaceWith`           | Calls original, then scans inserted nodes        |
| `Element.prototype.insertAdjacentElement` | Calls original, then scans inserted element      |
| `Element.prototype.insertAdjacentHTML`    | Calls original, then scans parent subtree        |
| `Element.prototype.innerHTML` (setter)    | Calls original setter, then scans target subtree |

## Stealth Properties Verified by Test Suite

The test suite on the verification site validates that every override is indistinguishable from native. For each overridden function, the following eight properties are checked:

1. **toString masking** — `Function.prototype.toString.call(fn)` contains `[native code]`
2. **name** — `fn.name` equals the property name
3. **length** — `fn.length` matches native arity (validated against a clean iframe reference)
4. **no own prototype** — non-constructors have no own `prototype` property; constructors do
5. **non-constructable** — non-constructors throw `TypeError` on `Reflect.construct`; constructors succeed
6. **descriptor flags** — `Object.getOwnPropertyDescriptor` flags match native (validated against a clean iframe reference)
7. **strict-mode .caller** — accessing `.caller` throws `TypeError`
8. **strict-mode .arguments** — accessing `.arguments` throws `TypeError`

For accessor properties (`contentWindow`, `contentDocument`, `innerHTML`), a separate battery validates:

- Accessor descriptor shape (get/set presence, configurable, enumerable)
- No data descriptor where native has an accessor
- Getter/setter function stealth (toString, name, length)

### Additional Shape Fidelity Checks (Geolocation)

| Check                                                                       | What it validates                                              |
| --------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `Object.prototype.toString.call(navigator.geolocation)`                     | Returns `[object Geolocation]` (Symbol.toStringTag brand)      |
| `Object.prototype.toString.call(position)`                                  | Returns `[object GeolocationPosition]`                         |
| `Object.prototype.toString.call(position.coords)`                           | Returns `[object GeolocationCoordinates]`                      |
| `Object.prototype.toString.call(navigator.permissions)`                     | Returns `[object Permissions]`                                 |
| `Object.prototype.toString.call(permissionStatus)`                          | Returns `[object PermissionStatus]`                            |
| `Object.keys(position)`                                                     | Returns `[]` (no own enumerable keys)                          |
| `Object.keys(position.coords)`                                              | Returns `[]` (no own enumerable keys)                          |
| `Object.getOwnPropertyNames(position)`                                      | Returns `[]` (no own string keys at all)                       |
| `Object.getOwnPropertyNames(position.coords)`                               | Returns `[]` (no own string keys at all)                       |
| `Object.getOwnPropertySymbols(position)`                                    | Returns `[]` (no own symbol keys)                              |
| `Object.getOwnPropertySymbols(position.coords)`                             | Returns `[]` (no own symbol keys)                              |
| `Object.getOwnPropertyDescriptor(coords, "latitude")`                       | Returns `undefined` (inherited from prototype)                 |
| `JSON.stringify(position)`                                                  | Produces native-shaped output with coords + timestamp          |
| `Geolocation.prototype.getCurrentPosition.call({}, noop)`                   | Throws `TypeError` (brand check)                               |
| `GeolocationPositionError.{PERMISSION_DENIED,POSITION_UNAVAILABLE,TIMEOUT}` | Constants are 1, 2, 3                                          |
| `position.coords.latitude` decimal precision                                | ≥6 decimal places (realistic GPS precision via jitter padding) |

### Internal Consistency Checks

These tests cross-check independent APIs against each other to detect partial spoofing:

| Cross-check                       | APIs compared                                                                                                                                                                                                                                                         |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Offset agreement                  | `Date.getTimezoneOffset()` vs `Intl.DateTimeFormat` shortOffset                                                                                                                                                                                                       |
| Hour agreement                    | `Date.getHours()` vs `toLocaleTimeString("en-US", { hour12: false })`                                                                                                                                                                                                 |
| Minute agreement                  | `Date.getMinutes()` vs `toLocaleTimeString("en-US", { minute: "2-digit" })`                                                                                                                                                                                           |
| Second agreement                  | `Date.getSeconds()` vs `toLocaleTimeString("en-US", { second: "2-digit" })`                                                                                                                                                                                           |
| Day-of-week agreement             | `Date.getDay()` vs `toLocaleDateString("en-US", { weekday: "long" })`                                                                                                                                                                                                 |
| Month agreement                   | `Date.getMonth()` vs `toLocaleDateString("en-US", { month: "long" })`                                                                                                                                                                                                 |
| Date agreement                    | `Date.getDate()` vs `toLocaleDateString("en-US", { day: "numeric" })`                                                                                                                                                                                                 |
| Year agreement                    | `Date.getFullYear()` vs `toLocaleDateString("en-US", { year: "numeric" })`                                                                                                                                                                                            |
| toString offset vs longOffset     | `Date.toString()` GMT±HHMM vs `toLocaleString(undefined, { timeZoneName: "longOffset" })`                                                                                                                                                                             |
| toTimeString vs getTimezoneOffset | `Date.toTimeString()` GMT offset vs `-getTimezoneOffset()`                                                                                                                                                                                                            |
| toDateString vs Intl              | `Date.toDateString()` weekday/month vs `Intl.DateTimeFormat` short weekday/month                                                                                                                                                                                      |
| Temporal vs Intl                  | `Temporal.Now.zonedDateTimeISO().timeZoneId` vs `Intl.DateTimeFormat().resolvedOptions().timeZone`                                                                                                                                                                    |
| format vs formatToParts           | `Intl.DateTimeFormat.format()` vs concatenation of `formatToParts()` values                                                                                                                                                                                           |
| toLocaleString vs Intl.format     | `Date.toLocaleString("en-US", opts)` vs `new Intl.DateTimeFormat("en-US", opts).format()`                                                                                                                                                                             |
| Offset stability                  | Two `Date` instances from the same ISO string have identical `getTimezoneOffset()`                                                                                                                                                                                    |
| Clock monotonicity                | Two consecutive `Date.now()` calls are monotonically non-decreasing                                                                                                                                                                                                   |
| DST across seasons                | Jan vs Jul `getTimezoneOffset()` differ for DST-observing zones                                                                                                                                                                                                       |
| Cross-method offset (6 surfaces)  | `getTimezoneOffset`, epoch arithmetic, `Date.parse`, Intl shortOffset, component arithmetic (`getUTC*` vs `get*`), `Temporal.Instant.toZonedDateTimeISO().offsetNanoseconds` — all must agree for the same instant across 4 historical years (2025, 1976, 1952, 1879) |

### Iframe Behavioral Tests

Validates that geolocation spoofing works across all iframe injection paths:

| Injection path                       | What's tested                                                      |
| ------------------------------------ | ------------------------------------------------------------------ |
| `contentWindow` getter               | Static access after iframe is in the tree                          |
| `Node.prototype.appendChild`         | DOM insertion wrapper scans subtree                                |
| `Element.prototype.innerHTML` setter | String-based injection path                                        |
| `srcdoc` attribute                   | Synchronous document load from attribute                           |
| `document.write("<iframe>")`         | Parser-based injection (nested iframe via outer iframe's document) |

Each test creates an `about:blank` same-origin iframe, calls `getCurrentPosition` inside it, and asserts the returned coordinates match the top-level identity.

### Iframe Realm Timezone Tests

Validates that timezone spoofing is installed in iframe realms:

| Surface                                                                 | What's tested                                             |
| ----------------------------------------------------------------------- | --------------------------------------------------------- |
| `iframe.contentWindow.Intl.DateTimeFormat().resolvedOptions().timeZone` | Must match top-level Intl resolved zone                   |
| `new iframe.contentWindow.Date("2024-01-01T12:00:00").getTime()`        | Ambiguous string must parse identically to top-level Date |
| `iframe.contentWindow.Temporal.Now.timeZoneId()`                        | Must match top-level Intl resolved zone (feature-gated)   |

### Indirection Bypass Tests (webbrowsertools-style)

| Technique                                        | What's tested                                                                                                   |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- |
| `eval("navigator.geolocation")`                  | Dynamic resolution still hits spoofed coords                                                                    |
| `new Function("return navigator.geolocation")()` | Function constructor indirection still hits spoofed coords                                                      |
| `sandbox="allow-same-origin"` iframe             | Sandboxed iframe's `navigator.geolocation` still returns spoofed coords                                         |
| Instance descriptor parity                       | `Object.getOwnPropertyDescriptor(navigator.geolocation, "getCurrentPosition")` matches pristine iframe baseline |
| Prototype toString                               | `Geolocation.prototype.getCurrentPosition.toString()` contains `[native code]`                                  |

### WebRTC Leak Tests

| Surface                         | What's tested                                                                |
| ------------------------------- | ---------------------------------------------------------------------------- |
| Public IP via srflx candidate   | ICE gathering with STUN server must not reveal a public IP in SDP candidates |
| Host candidate mDNS obfuscation | Host-type candidates must use `.local` mDNS hostnames, not raw LAN IPs       |
| Iframe-realm bypass             | `iframe.contentWindow.RTCPeerConnection` gather must not reveal a public IP  |
| `RTCPeerConnection.getStats()`  | Stats reports must not expose local candidate IP addresses                   |

### IP Geolocation Cross-checks

| Check              | What's tested                                                                                                                    |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Country match      | Public IP country (via geojs.io / freeipapi) must match the country of the spoofed coordinates (via Nominatim reverse geocoding) |
| Regional proximity | Public IP location must be within 500km of the spoofed coordinates (Haversine distance)                                          |

### document.lastModified Tests

| Surface                                                         | What's tested                                                         |
| --------------------------------------------------------------- | --------------------------------------------------------------------- |
| `document.lastModified`                                         | Top-level document's lastModified offset matches the spoofed timezone |
| `new DOMParser().parseFromString("", "text/html").lastModified` | DOMParser-constructed document's lastModified offset matches          |
| `iframe.contentDocument.lastModified`                           | Iframe realm's lastModified offset matches                            |

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
10. **date-setters** — `setHours`, `setMinutes`, `setSeconds`, `setDate`, `setMonth`, `setFullYear`
11. **temporal** — `Temporal.Now.*` (feature-detected, no-ops if unavailable)
12. **document-overrides** — `Document.prototype.lastModified` getter
13. **iframe-patching** — `contentWindow`/`contentDocument` getter overrides
14. **dom-insertion** — DOM method wrapping + MutationObserver fallback

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

#### geolocation.ts

Installs geolocation and position/coordinate overrides on `Geolocation.prototype`, `GeolocationPosition.prototype`, and `GeolocationCoordinates.prototype`. Key exports:

- `installGeolocationOverrides()` — Installs `getCurrentPosition` / `watchPosition` / `clearWatch` on `Geolocation.prototype`, plus prototype-level accessor and `toJSON` installers so spoofed instances have zero own properties (matching native layout — `Object.getOwnPropertyNames(pos)` returns `[]`).
- `getPaddedCoords(location)` — Returns a padded coordinate pair for the given raw spoofed location. Pads values with fewer than 7 decimal places by appending a ±5mm jitter (well below any accuracy a user could configure), caches per unique raw pair, and is shared with `iframe-patching.ts` so main-window and iframe paths emit identical values. Closes the "suspiciously round spoofed coordinates" detection vector.

Spoofed positions are allocated via `Object.create(GeolocationPosition.prototype)` with coordinate/timestamp values stored in a module-level `WeakMap<object, slots>`. Prototype getters consult the WeakMap for our instances and fall through to the native getters for pristine browser-allocated objects.

#### document-overrides.ts

Overrides `Document.prototype.lastModified` to reformat the native string in the spoofed timezone. Key exports:

- `installDocumentOverrides()` — Installs the `lastModified` getter override on the top-level `Document.prototype`.
- `installLastModifiedOverride(documentProto)` — Installs the override on any `Document.prototype` (used by `iframe-patching.ts` for iframe realms).

The override parses the native `"MM/DD/YYYY HH:MM:SS"` string (which is in the real system timezone), recovers the UTC epoch, and reformats it in the spoofed timezone using `Intl.DateTimeFormat` via `formatToParts`.

#### iframe-patching.ts

Per-iframe realm patcher. When a same-origin iframe window is first accessed, `patchIframeWindow` installs ten sections of overrides on that iframe's realm:

1. `Function.prototype.toString` — native-[native code]-reporting mask
2. Geolocation — `getCurrentPosition` / `watchPosition` / `clearWatch` on the iframe's `Geolocation.prototype`
3. Permissions — `query` on the iframe's `Permissions.prototype`, returning a prototype-linked `PermissionStatus` with `state: "granted"` for geolocation
4. Intl — `Intl.DateTimeFormat` constructor + `resolvedOptions` on the iframe's realm
5. Date — full spoofing-aware `Date` constructor + `Date.parse` on the iframe's realm
6. Date.prototype methods — full per-method overrides on the iframe's `Date.prototype` via the parameterized installers from `date-getters.ts`, `date-setters.ts`, `date-formatting.ts`, and `timezone-overrides.ts`. Captures the iframe realm's native methods for fallback paths so each realm stays self-contained.
7. Temporal — `Temporal.Now.{timeZoneId,plainDateTimeISO,plainDateISO,plainTimeISO,zonedDateTimeISO}` when available
8. Nested-iframe cascade — iframe-realm copies of `HTMLIFrameElement.prototype.{contentWindow,contentDocument}` getters, `Node.prototype.{appendChild,insertBefore,replaceChild}`, `Element.prototype.{append,prepend,replaceWith,insertAdjacentElement,insertAdjacentHTML}`, the `innerHTML` setter, plus a `MutationObserver` on the iframe's own `documentElement`. This causes a nested iframe created from inside the outer iframe to trigger `patchIframeWindow` on itself recursively — so grand-nested iframes get the same treatment, and so on.
9. Document — `Document.prototype.lastModified` getter override on the iframe's realm
10. RTCPeerConnection — iframe-realm copy of the top-level WebRTC override

Cross-origin iframes throw `SecurityError` on any access and are silently skipped. All shape/descriptor checks in the cascade use tag-name / duck-typing rather than `instanceof`, because elements created in the iframe's realm are not instances of the top-level constructors.

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

1. **Web Workers** — Content scripts cannot directly inject into Worker/SharedWorker/ServiceWorker contexts because they run in separate global scopes. The extension takes different paths for different URL schemes to balance protection coverage with site-breakage risk:
   - **URL-based workers** (`new Worker("/foo.js")`, module workers, SharedWorker with a URL, `navigator.serviceWorker.register(url)`) — the content script announces the URL to the background and passes the original URL through to the real constructor. On Firefox the background's `webRequest.filterResponseData` listener prepends the spoofing payload to the response bytes, but **only for workers whose registrable domain (eTLD+1) matches the tab's page origin**. Cross-origin workers — such as Cloudflare Turnstile (`challenges.cloudflare.com`), Stripe (`js.stripe.com`), or any other third-party worker loaded from a different domain — are classified as `"pass"` and left completely unmodified. This is an accepted limitation analogous to the cross-origin iframe limitation: the timezone leak in cross-origin workers is not closed by this extension. On Chromium and Safari nothing listens (the API doesn't exist on those engines) and URL-based workers run unpatched — a documented engine limit, not a site-breakage path.

   - **Inline workers** (`new Worker(URL.createObjectURL(new Blob([...])))` or `new Worker("data:application/javascript,...")`) — blob-wrapped on every engine. The site already committed to an inline URL and its CSP necessarily allows it, so our replacement blob stays within the same allowance.

   Rewriting URL-based workers to blob URLs is deliberately avoided because blob wrapping fails on strict-CSP origins (breaking the site's worker entirely), shifts `self.location` which breaks relative `fetch`/`import` calls inside the worker, and can't preserve module-worker `import` resolution. The `filterResponseData` path has cleaner failure modes: on the rare site that ships Subresource Integrity on worker scripts, the browser rejects the modified bytes, our `onerror` handler disconnects, the original response serves unmodified, and the site keeps working (with no protection on that origin).

   CreepJS's `code:` worker-fingerprint hash is closed on Firefox: the payload derives the engine-specific `"[native code]"` surround format at runtime and matches Firefox's multi-line shape, so spoofed `Intl.DateTimeFormat`, `Date` prototype methods, `Worker`, and `importScripts` all pass the native-shape check.

2. **XSLT/EXSLT datetime leak (Firefox only)** — `XSLTProcessor` runs inside a C++ engine that doesn't round-trip through JavaScript date machinery. The EXSLT function `date:date-time()` emits an ISO datetime string with the real system UTC offset, bypassing every Date/Intl/Temporal override. This is the technique arkenfox's TZP uses as its ground-truth timezone source. Chromium doesn't ship EXSLT, so the leak is Firefox-only. Unpatchable without browser-level changes.

3. **Extension initialization race** — Browser extensions install overrides at `document_start`, but spoofing settings arrive asynchronously (typically 50-250ms on cold page loads). A fingerprinting script that reads timezone synchronously in `<head>` can win that race and learn the real zone. This is a fundamental MV3 limitation that requires browser-level fixes to eliminate (see Tor Browser, which patches C++ directly).

4. **Cross-origin iframes** — `SecurityError` prevents any access from the content script to cross-origin iframes, so `patchIframeWindow` silently skips them. Additionally, the injected script runs in every frame context including cross-origin ones — Worker patching, iframe patching, and DOM insertion wrapping are skipped in cross-origin frame contexts to avoid interfering with third-party scripts (e.g. Cloudflare Turnstile) that perform self-integrity checks and break when their execution environment is modified. Timing side-channels can reveal discrepancies between the parent's spoofed view and the cross-origin iframe's real view.

5. **Timing channels** — A content-script spoofer returns fake positions via `setTimeout` on the JavaScript event loop. Real GPS/Wi-Fi/cell-tower lookups go through browser-internal threads with wider, heavier-tailed latency distributions. A detector with enough samples can fingerprint the artificial bounds (10-50ms floor). Additionally, native `maximumAge` caching serves positions sub-millisecond, while a `setTimeout`-based spoofer cannot emit below its configured delay. Only a browser-native implementation can match real hardware timing signatures.

6. **SharedArrayBuffer timing** — High-resolution timing can fingerprint override execution patterns. Unfixable at the content-script level.

7. **IP geolocation** — Extension does not mask IP address. Fingerprinting scripts cross-check public IP country/region against browser-reported geolocation. Closing this gap requires routing traffic through a VPN exit in the spoofed region (hence the VPN Sync feature).

8. **WebRTC IP leaks** — Without `browser.privacy.network.webRTCIPHandlingPolicy` set to `disable_non_proxied_udp`, WebRTC ICE gathering can expose the real public IP via server-reflexive (srflx) candidates, even when geolocation is spoofed. On Firefox this only holds when behind a proxy/VPN; on Chromium it's strict. Safari doesn't expose `browser.privacy`.

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
