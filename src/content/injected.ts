/**
 * Injected Script
 * This code runs in the page context (not isolated) to override browser APIs.
 *
 * It communicates with the content script via CustomEvent and overrides:
 * - navigator.geolocation (getCurrentPosition, watchPosition, clearWatch)
 * - Date.prototype.getTimezoneOffset
 * - Intl.DateTimeFormat (constructor + resolvedOptions)
 * - Date.prototype formatting methods (toString, toTimeString, toLocale*)
 */

/* eslint-disable no-var */
// `process.env.EVENT_NAME` is replaced at build time by Vite's `define` config.
declare var process: { env: Record<string, string | undefined> };
/* eslint-enable no-var */

(function (): void {
  "use strict";

  // ── Known Limitations ────────────────────────────────────────────────
  //
  // The following detection vectors CANNOT be fully mitigated from a
  // content script and are acknowledged as known limitations:
  //
  // 1. Iframe timing side-channels — A cross-origin iframe can compare
  //    its own Date/Intl results against the parent frame's postMessage
  //    timestamps, revealing discrepancies that content-script overrides
  //    cannot prevent.
  //
  // 2. Web Worker timezone leaks — Content scripts cannot inject into
  //    Web Worker or SharedWorker contexts. Code running inside a Worker
  //    will see the real system timezone via Date and Intl APIs.
  //
  // 3. SharedArrayBuffer timing attacks — High-resolution timing via
  //    SharedArrayBuffer can be used to fingerprint execution patterns
  //    introduced by API overrides, which cannot be masked at the
  //    content-script level.
  //
  // 4. Proxy/engine-internal detection — Some fingerprinting techniques
  //    rely on engine-internal checks (e.g., brand checks, internal
  //    slots) that can distinguish overridden functions from true native
  //    implementations. These require browser-level changes to mitigate.
  //
  // Content-script-based API overrides cannot prevent all fingerprinting
  // techniques. Some detection vectors require browser-level changes.
  // This extension does NOT attempt to override APIs in Web Worker
  // contexts, as content scripts cannot inject into workers.
  //
  // ────────────────────────────────────────────────────────────────────

  // ── Types ──────────────────────────────────────────────────────────────

  interface SpoofedLocation {
    latitude: number;
    longitude: number;
    accuracy?: number;
  }

  interface TimezoneData {
    /** IANA timezone identifier */
    identifier: string;
    /** Minutes from UTC */
    offset: number;
    /** DST offset in minutes */
    dstOffset: number;
    /** True if estimated from longitude */
    fallback?: boolean;
  }

  interface SettingsEventDetail {
    enabled: boolean;
    location: SpoofedLocation | null;
    timezone: TimezoneData | null;
  }

  interface SpoofedGeolocationPosition {
    coords: {
      latitude: number;
      longitude: number;
      accuracy: number;
      altitude: null;
      altitudeAccuracy: null;
      heading: null;
      speed: null;
    };
    timestamp: number;
  }

  // Event name for settings updates (must match content script).
  const EVENT_NAME: string = process.env.EVENT_NAME || "__x_evt";

  // ── Override registry & toString masking ─────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type AnyFunction = (...args: any[]) => any;
  const overrideRegistry = new Map<AnyFunction, string>();
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalFunctionToString = Function.prototype.toString;
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const originalCall = Function.prototype.call;

  /** Register a function in the override registry for toString masking. */
  function registerOverride(fn: AnyFunction, nativeName: string): void {
    overrideRegistry.set(fn, nativeName);
  }

  /**
   * Make a JS function indistinguishable from a native function by:
   * - Setting name/length to match the original
   * - Deleting the prototype property (native functions don't have one)
   * - Ensuring ownKeys returns only ["length", "name"]
   */
  function disguiseAsNative(fn: AnyFunction, nativeName: string, expectedLength: number): void {
    // Set name to match the native function
    Object.defineProperty(fn, "name", {
      value: nativeName,
      configurable: true,
      enumerable: false,
      writable: false,
    });
    // Set length to match the native function's arity
    Object.defineProperty(fn, "length", {
      value: expectedLength,
      configurable: true,
      enumerable: false,
      writable: false,
    });
    // Native non-constructor functions don't have a prototype property.
    // Arrow functions already lack prototype (no-op). Function expressions
    // need it deleted. Do NOT call this on DateOverride — Date is a constructor.
    // Guard: only delete if the property is configurable. In strict mode,
    // deleting a non-configurable property throws TypeError.
    if ("prototype" in fn) {
      const desc = Object.getOwnPropertyDescriptor(fn, "prototype");
      if (desc?.configurable) {
        delete (fn as { prototype?: unknown }).prototype;
      }
    }
  }

  // Override Function.prototype.toString to return native-looking strings
  // for all registered override functions.

  // Capture the native TypeError message thrown when toString is called on
  // a non-function. We throw this ourselves in the pre-check below so that
  // only ONE "Function.toString" frame appears in Chrome's stack trace.
  // Without this, delegating to the original toString creates a second
  // native frame, shifting the caller frames and failing arkenfox test "o".
  let nativeTypeErrorMessage = "Function.prototype.toString requires that 'this' be a Function";
  try {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
    (originalCall as any).call(originalFunctionToString, Object.create(Function));
  } catch (e: unknown) {
    if (e instanceof TypeError) {
      nativeTypeErrorMessage = e.message;
    }
  }

  // Method shorthand has no `prototype`, no `[[Construct]]`, and
  // `.arguments`/`.caller` throw TypeError — matching native methods
  // without using Proxy (which Firefox detects).
  // All logic is inlined to avoid extra stack frames in Chrome's TypeError
  // traces (arkenfox getNewObjectToStringTypeErrorLie / test "o").
  // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: method shorthand destructuring for anti-fingerprint (no prototype/[[Construct]])
  const toStringMethod = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    toString(this: any): string {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const nativeName = overrideRegistry.get(this);
      if (nativeName !== undefined) {
        return `function ${nativeName}() { [native code] }`;
      }
      // Pre-check: throw TypeError directly for non-functions so only one
      // "Function.toString" frame appears in Chrome's stack trace. Without
      // this, the native toString adds a second frame that shifts the
      // caller chain and fails arkenfox's stack validation.
      if (typeof this !== "function") {
        throw new TypeError(nativeTypeErrorMessage);
      }
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
      return (originalCall as any).call(originalFunctionToString, this);
    },
  }.toString;
  registerOverride(toStringMethod, "toString");
  disguiseAsNative(toStringMethod, "toString", 0);
  Function.prototype.toString = toStringMethod;

  /**
   * Wrap a function expression in a method-shorthand wrapper so that
   * the result has no `prototype` property and no `[[Construct]]` internal
   * slot, matching native method behaviour. Unlike Proxy, method shorthand
   * is not detectable by Firefox's "incompatible Proxy" error checks.
   *
   * The wrapper preserves `this` binding from the caller.
   */
  function stripConstruct(fn: AnyFunction): AnyFunction {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: method shorthand destructuring for anti-fingerprint (no prototype/[[Construct]])
    return {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      method(this: any) {
        // Use Reflect.apply instead of fn.apply — Chrome's stack trace
        // leaks "Object.apply" which fails the arkenfox validScope check.
        // Reflect.apply doesn't appear as "Object.apply" in the stack.
        // eslint-disable-next-line @typescript-eslint/no-unsafe-return, prefer-rest-params
        return Reflect.apply(fn, this, Array.prototype.slice.call(arguments) as unknown[]);
      },
    }.method;
  }

  /**
   * Install an override on a target object's property, preserving the
   * original property descriptor flags and registering the function for
   * toString masking. The override function is disguised as a native function.
   *
   * If the override is a `function` expression (has non-configurable
   * `prototype`), it is automatically wrapped in a method-shorthand so
   * that fingerprinting checks for `prototype`, `[[Construct]]`, class
   * extends, descriptor enumeration, etc. all pass.
   */
  function installOverride(
    target: object,
    prop: string,
    overrideFn: AnyFunction,
    nativeLength?: number
  ): void {
    // Determine the expected length from the original function if not specified
    let expectedLength = nativeLength ?? 0;
    if (nativeLength === undefined) {
      const originalDescriptor = Object.getOwnPropertyDescriptor(target, prop);
      if (originalDescriptor && typeof originalDescriptor.value === "function") {
        expectedLength = (originalDescriptor.value as AnyFunction).length;
      } else if (originalDescriptor && typeof originalDescriptor.get === "function") {
        expectedLength = (originalDescriptor.get as AnyFunction).length;
      }
    }

    // If the function has a non-configurable prototype (i.e. it's a function
    // expression), wrap it in a Proxy-over-arrow to strip [[Construct]] and
    // the prototype property. This makes it indistinguishable from a native
    // method under fingerprinting checks (f, i, j, k, l, m, n tests).
    let finalFn = overrideFn;
    if ("prototype" in overrideFn) {
      const protoDesc = Object.getOwnPropertyDescriptor(overrideFn, "prototype");
      if (protoDesc && !protoDesc.configurable) {
        finalFn = stripConstruct(overrideFn);
      }
    }

    // Disguise the override as native BEFORE installing it on the target
    registerOverride(finalFn, prop);
    disguiseAsNative(finalFn, prop, expectedLength);

    const originalDescriptor = Object.getOwnPropertyDescriptor(target, prop);
    if (originalDescriptor) {
      Object.defineProperty(target, prop, {
        value: finalFn,
        configurable: originalDescriptor.configurable,
        enumerable: originalDescriptor.enumerable,
        writable: originalDescriptor.writable,
      });
    } else {
      Object.defineProperty(target, prop, {
        value: finalFn,
        configurable: true,
        enumerable: false,
        writable: true,
      });
    }
  }

  // ── Store original methods ─────────────────────────────────────────────

  const OriginalDate = Date;
  const OriginalDateParse = Date.parse;

  const originalGetCurrentPosition = navigator.geolocation.getCurrentPosition.bind(
    navigator.geolocation
  );
  const originalWatchPosition = navigator.geolocation.watchPosition.bind(navigator.geolocation);
  const originalClearWatch = navigator.geolocation.clearWatch.bind(navigator.geolocation);
  // Store original prototype methods. These are intentionally detached and
  // always re-bound at call sites via `.call(this)`, so the lint warning
  // about unintentional `this` scoping does not apply here.
  /* eslint-disable @typescript-eslint/unbound-method */
  const originalGetTimezoneOffset = Date.prototype.getTimezoneOffset;
  const OriginalDateTimeFormat = Intl.DateTimeFormat;
  const originalResolvedOptions = Intl.DateTimeFormat.prototype.resolvedOptions;
  const originalToString = Date.prototype.toString;
  const originalToTimeString = Date.prototype.toTimeString;
  const originalToLocaleString = Date.prototype.toLocaleString;
  const originalToLocaleDateString = Date.prototype.toLocaleDateString;
  const originalToDateString = Date.prototype.toDateString;
  const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;
  const originalGetHours = Date.prototype.getHours;
  const originalGetMinutes = Date.prototype.getMinutes;
  const originalGetSeconds = Date.prototype.getSeconds;
  const originalGetMilliseconds = Date.prototype.getMilliseconds;
  const originalGetDate = Date.prototype.getDate;
  const originalGetDay = Date.prototype.getDay;
  const originalGetMonth = Date.prototype.getMonth;
  const originalGetFullYear = Date.prototype.getFullYear;
  /* eslint-enable @typescript-eslint/unbound-method */

  // ── Spoofing state ─────────────────────────────────────────────────────

  let spoofingEnabled = false;
  let spoofedLocation: SpoofedLocation | null = null;
  let timezoneData: TimezoneData | null = null;

  // Track whether we've received settings at least once from the content script.
  // Until settings arrive, geolocation/permissions calls are deferred rather than
  // falling through to the real API (which would leak the user's real location).
  let settingsReceived = false;
  const SETTINGS_WAIT_TIMEOUT = 500; // ms to wait for settings before falling through

  /** Returns a promise that resolves when settings arrive or timeout expires. */
  function waitForSettings(): Promise<void> {
    if (settingsReceived) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const onSettings = (): void => {
        window.removeEventListener(EVENT_NAME, onSettings);
        resolve();
      };
      window.addEventListener(EVENT_NAME, onSettings);
      setTimeout(() => {
        window.removeEventListener(EVENT_NAME, onSettings);
        resolve();
      }, SETTINGS_WAIT_TIMEOUT);
    });
  }

  // ── Timezone helpers ───────────────────────────────────────────────────

  /** Validate timezone data structure. */
  function validateTimezoneData(tz: unknown): tz is TimezoneData {
    if (!tz || typeof tz !== "object") {
      return false;
    }

    const t = tz as Partial<TimezoneData>;

    if (typeof t.identifier !== "string" || t.identifier.length === 0) {
      console.error("[GeoSpoof Injected] Invalid timezone identifier:", t.identifier);
      return false;
    }

    if (typeof t.offset !== "number" || !Number.isFinite(t.offset)) {
      console.error("[GeoSpoof Injected] Invalid timezone offset:", t.offset);
      return false;
    }

    if (typeof t.dstOffset !== "number" || !Number.isFinite(t.dstOffset)) {
      console.error("[GeoSpoof Injected] Invalid timezone dstOffset:", t.dstOffset);
      return false;
    }

    return true;
  }

  /** Parse a GMT offset string like "GMT+5:30" or "GMT-8" into minutes from UTC. */
  function parseGMTOffset(gmtString: string): number {
    if (gmtString === "GMT" || gmtString === "UTC") {
      return 0;
    }

    const match = gmtString.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);
    if (!match) {
      return 0;
    }

    const sign = match[1] === "+" ? 1 : -1;
    const hours = parseInt(match[2], 10);
    const minutes = parseInt(match[3] || "0", 10);
    return sign * (hours * 60 + minutes);
  }

  /**
   * Resolve the actual UTC offset for a given date and IANA timezone using
   * Intl.DateTimeFormat. Returns offset in minutes from UTC (positive = east).
   * Falls back to the stored timezone.offset on any error.
   */
  function getIntlBasedOffset(date: Date, timezoneId: string, fallbackOffset: number): number {
    try {
      const formatter = new OriginalDateTimeFormat("en-US", {
        timeZone: timezoneId,
        timeZoneName: "shortOffset",
      });
      const parts = formatter.formatToParts(date);
      const tzPart = parts.find((p) => p.type === "timeZoneName");
      return parseGMTOffset(tzPart?.value ?? "GMT");
    } catch {
      // Invalid IANA identifier or unsupported environment — use fallback
      return fallbackOffset;
    }
  }

  /** Convert an offset in minutes from UTC to a `GMT±HHMM` string. */
  function formatGMTOffset(offsetMinutes: number): string {
    const sign = offsetMinutes >= 0 ? "+" : "-";
    const abs = Math.abs(offsetMinutes);
    const hours = Math.floor(abs / 60);
    const minutes = abs % 60;
    return `GMT${sign}${String(hours).padStart(2, "0")}${String(minutes).padStart(2, "0")}`;
  }

  /** Extract the long timezone name (e.g. "Pacific Daylight Time") for a date and IANA tz. */
  function getLongTimezoneName(date: Date, timezoneId: string): string {
    try {
      const formatter = new OriginalDateTimeFormat("en-US", {
        timeZone: timezoneId,
        timeZoneName: "long",
      });
      const parts = formatter.formatToParts(date);
      const tzPart = parts.find((p) => p.type === "timeZoneName");
      return tzPart?.value ?? timezoneId;
    } catch {
      return timezoneId;
    }
  }

  // ── Date constructor helpers ─────────────────────────────────────────

  /**
   * Determine if a date string lacks an explicit timezone indicator.
   * Returns true if the string is "ambiguous" (no tz info), meaning
   * the JS engine will parse it using the local timezone.
   *
   * Explicit indicators: Z, UTC, GMT, ±HH:MM, ±HHMM, ±HH (at end)
   * ISO 8601 date-only (e.g. "2024-01-15") is treated as explicit (UTC per spec).
   */
  function isAmbiguousDateString(str: string): boolean {
    // ISO 8601 date-only: YYYY-MM-DD with no time component → UTC per ECMAScript spec
    if (/^\d{4}-\d{2}-\d{2}$/.test(str.trim())) {
      return false;
    }

    // Check for explicit timezone indicators
    const hasExplicitTz =
      // Trailing Z (UTC designator) — e.g. "2024-01-15T12:00:00Z"
      /Z$/i.test(str.trim()) ||
      // UTC or GMT keywords (case-insensitive)
      /\b(?:UTC|GMT)\b/i.test(str) ||
      // ±HH:MM, ±HHMM, or ±HH at end of string
      /[+-]\d{2}(?::?\d{2})?$/.test(str.trim());

    return !hasExplicitTz;
  }

  /**
   * Compute the epoch adjustment in milliseconds to shift a timestamp
   * from real-local-time interpretation to spoofed-local-time interpretation.
   *
   * @param parsedDate - Date object parsed in real local time
   * @param timezoneId - Spoofed IANA timezone identifier
   * @param fallbackOffset - Fallback offset from timezoneData
   * @returns adjustment in milliseconds (add to epoch)
   */
  function computeEpochAdjustment(
    parsedDate: Date,
    timezoneId: string,
    fallbackOffset: number
  ): number {
    // Real system offset (positive = west of UTC, same convention as getTimezoneOffset)
    const realOffsetMinutes = originalGetTimezoneOffset.call(parsedDate);
    // Spoofed offset (positive = east of UTC, Intl convention)
    const spoofedUtcOffset = getIntlBasedOffset(parsedDate, timezoneId, fallbackOffset);
    // Convert to same sign convention as getTimezoneOffset (positive = west)
    const spoofedOffsetMinutes = -spoofedUtcOffset;
    return (spoofedOffsetMinutes - realOffsetMinutes) * 60000;
  }

  // ── Date constructor and Date.parse overrides ──────────────────────────

  /**
   * Date constructor override.
   *
   * Intercepts string and multi-argument calls, detects ambiguous inputs,
   * and adjusts the resulting epoch by the difference between the real and
   * spoofed UTC offsets. Delegates entirely to OriginalDate when spoofing
   * is disabled or for non-ambiguous inputs.
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function DateOverride(this: any, ...args: any[]): any {
    // Called as function (without new) — return current time string
    if (!new.target) {
      return OriginalDate();
    }

    // When spoofing is disabled, delegate entirely to OriginalDate
    if (!spoofingEnabled || !timezoneData) {
      if (args.length === 0) return new OriginalDate();
      if (args.length === 1) return new OriginalDate(args[0] as number | string);
      return new OriginalDate(
        args[0] as number,
        args[1] as number,
        (args[2] ?? 1) as number,
        (args[3] ?? 0) as number,
        (args[4] ?? 0) as number,
        (args[5] ?? 0) as number,
        (args[6] ?? 0) as number
      );
    }

    // No arguments — current time
    if (args.length === 0) {
      return new OriginalDate();
    }

    // Single argument
    if (args.length === 1) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const arg = args[0];

      // Single numeric argument — absolute epoch, no adjustment
      if (typeof arg === "number") {
        return new OriginalDate(arg);
      }

      // Single string argument
      if (typeof arg === "string") {
        try {
          const parsed = new OriginalDate(arg);
          // If unparseable (NaN), return invalid Date as-is
          if (isNaN(parsed.getTime())) {
            return parsed;
          }
          // If ambiguous, apply epoch adjustment
          if (isAmbiguousDateString(arg)) {
            const adjustment = computeEpochAdjustment(
              parsed,
              timezoneData.identifier,
              timezoneData.offset
            );
            return new OriginalDate(parsed.getTime() + adjustment);
          }
          // Explicit timezone string — pass through
          return parsed;
        } catch {
          // Fall back to original behavior on error
          return new OriginalDate(arg);
        }
      }

      // Any other single argument (Date object, null, undefined, boolean, etc.)
      return new OriginalDate(arg as number | string);
    }

    // Multi-argument (2+ numeric): year, month, [day, hours, minutes, seconds, ms]
    try {
      const parsed = new OriginalDate(
        args[0] as number,
        args[1] as number,
        (args[2] ?? 1) as number,
        (args[3] ?? 0) as number,
        (args[4] ?? 0) as number,
        (args[5] ?? 0) as number,
        (args[6] ?? 0) as number
      );
      const adjustment = computeEpochAdjustment(
        parsed,
        timezoneData.identifier,
        timezoneData.offset
      );
      return new OriginalDate(parsed.getTime() + adjustment);
    } catch {
      // Fall back to original behavior on error
      return new OriginalDate(
        args[0] as number,
        args[1] as number,
        (args[2] ?? 1) as number,
        (args[3] ?? 0) as number,
        (args[4] ?? 0) as number,
        (args[5] ?? 0) as number,
        (args[6] ?? 0) as number
      );
    }
  }

  /**
   * Date.parse override.
   *
   * Applies the same ambiguous-string adjustment as the Date constructor
   * override, returning the corrected epoch number.
   */
  const dateParseOverride = (str: string): number => {
    // When spoofing is disabled, delegate entirely to OriginalDateParse
    if (!spoofingEnabled || !timezoneData) {
      return OriginalDateParse(str);
    }

    try {
      const epoch = OriginalDateParse(str);
      // If unparseable, return NaN
      if (isNaN(epoch)) {
        return NaN;
      }
      // If ambiguous, apply epoch adjustment
      if (isAmbiguousDateString(str)) {
        const parsed = new OriginalDate(epoch);
        const adjustment = computeEpochAdjustment(
          parsed,
          timezoneData.identifier,
          timezoneData.offset
        );
        return epoch + adjustment;
      }
      // Explicit timezone string — pass through
      return epoch;
    } catch {
      // Fall back to original behavior on error
      return OriginalDateParse(str);
    }
  };

  // ── Install Date constructor override and preserve static methods/prototype ──

  // Set prototype for instanceof preservation
  DateOverride.prototype = OriginalDate.prototype;

  // Fix name property: "DateOverride" → "Date"
  Object.defineProperty(DateOverride, "name", {
    value: "Date",
    configurable: true,
    enumerable: false,
    writable: false,
  });

  // Fix length property to match native Date.length (7)
  Object.defineProperty(DateOverride, "length", {
    value: 7,
    configurable: true,
    enumerable: false,
    writable: false,
  });

  // Copy ALL own properties from OriginalDate (UTC, now, etc.)
  const skipProps = new Set(["prototype", "name", "length", "parse"]);
  for (const prop of Object.getOwnPropertyNames(OriginalDate)) {
    if (skipProps.has(prop)) continue;
    const desc = Object.getOwnPropertyDescriptor(OriginalDate, prop);
    if (desc) {
      Object.defineProperty(DateOverride, prop, desc);
    }
  }

  // Disguise dateParseOverride BEFORE installing it on DateOverride
  registerOverride(dateParseOverride as unknown as AnyFunction, "parse");
  disguiseAsNative(dateParseOverride as unknown as AnyFunction, "parse", 1);

  // Install Date.parse override
  Object.defineProperty(DateOverride, "parse", {
    value: dateParseOverride,
    configurable: true,
    enumerable: false,
    writable: true,
  });

  // Ensure prototype chain: Object.getPrototypeOf(Date) === Function.prototype
  Object.setPrototypeOf(DateOverride, Function.prototype);

  // Replace global Date constructor
  (globalThis as unknown as Record<string, unknown>).Date =
    DateOverride as unknown as DateConstructor;

  // Fix constructor reference: Date.prototype.constructor === Date
  Object.defineProperty(OriginalDate.prototype, "constructor", {
    value: DateOverride,
    configurable: true,
    enumerable: false,
    writable: true,
  });

  // Register overrides for toString masking
  registerOverride(DateOverride as AnyFunction, "Date");
  // Register static methods — fingerprinters check Date.now.toString() after the constructor swap
  registerOverride(
    (DateOverride as unknown as DateConstructor).now as unknown as AnyFunction,
    "now"
  );
  registerOverride(
    (DateOverride as unknown as DateConstructor).UTC as unknown as AnyFunction,
    "UTC"
  );

  // ── Known limitations ──────────────────────────────────────────────────
  //
  // The following fingerprinting vectors CANNOT be fixed from a content
  // script and are documented here for awareness:
  //
  // 1. iframe.contentDocument.lastModified
  //    — The lastModified property is set by the browser engine when the
  //      document is loaded. It reflects the server's Last-Modified header
  //      formatted in the real local timezone. Content scripts cannot
  //      intercept or override this read-only property.
  //
  // 2. DOMParser.parseFromString().lastModified
  //    — Similar to iframe.contentDocument.lastModified, the lastModified
  //      property on documents created via DOMParser is set internally by
  //      the engine and cannot be overridden from script.
  //
  // 3. Document.parseHTMLUnsafe().lastModified
  //    — Same limitation as DOMParser — the engine sets lastModified
  //      using the real timezone during document creation.
  //
  // 4. EXSLT date:date-time() via XSLTProcessor
  //    — The EXSLT date:date-time() function is evaluated inside the XSLT
  //      engine, which uses the real system timezone. There is no script-
  //      level hook to intercept XSLT function evaluation.
  //
  // 5. Temporal.Instant.from().toZonedDateTimeISO(tz).offsetNanoseconds
  //    — When a specific timezone string is passed to toZonedDateTimeISO(),
  //      the Temporal API resolves the offset internally. This cannot be
  //      intercepted without overriding every Temporal.ZonedDateTime
  //      instance method, which is impractical.
  //

  // ── Settings listener ──────────────────────────────────────────────────

  window.addEventListener(EVENT_NAME, ((event: CustomEvent<SettingsEventDetail>) => {
    if (event.detail) {
      spoofingEnabled = event.detail.enabled;
      spoofedLocation = event.detail.location;
      settingsReceived = true;

      if (event.detail.timezone) {
        if (validateTimezoneData(event.detail.timezone)) {
          timezoneData = event.detail.timezone;
          console.log("[GeoSpoof Injected] Timezone data updated:", timezoneData);
        } else {
          console.error(
            "[GeoSpoof Injected] Invalid timezone data received, timezone spoofing disabled"
          );
          timezoneData = null;
        }
      } else {
        timezoneData = null;
      }

      console.log("[GeoSpoof Injected] Settings updated via event:", {
        spoofingEnabled,
        spoofedLocation,
        timezoneData,
      });
    }
  }) as EventListener);

  // ── Geolocation overrides ──────────────────────────────────────────────

  const watchCallbacks = new Map<number, PositionCallback>();
  let watchIdCounter = 1;

  /** Create a W3C-compliant GeolocationPosition from spoofed location. */
  function createGeolocationPosition(location: SpoofedLocation): SpoofedGeolocationPosition {
    return {
      coords: {
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy || 10,
        altitude: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };
  }

  // Override getCurrentPosition
  const getCurrentPositionOverride = (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions
  ): void => {
    console.log(
      "[GeoSpoof Injected] getCurrentPosition called. Enabled:",
      spoofingEnabled,
      "Location:",
      spoofedLocation,
      "Settings received:",
      settingsReceived
    );

    if (settingsReceived) {
      // Settings already loaded — respond immediately
      if (spoofingEnabled && spoofedLocation) {
        const position = createGeolocationPosition(spoofedLocation);
        console.log("[GeoSpoof Injected] Returning spoofed position:", position);
        const delay = 10 + Math.random() * 40;
        setTimeout(() => {
          if (successCallback) {
            successCallback(position as GeolocationPosition);
          }
        }, delay);
      } else {
        console.log("[GeoSpoof Injected] Using original geolocation");
        originalGetCurrentPosition(successCallback, errorCallback, options);
      }
    } else {
      // Settings not yet received — wait for them before responding
      console.log("[GeoSpoof Injected] Deferring getCurrentPosition until settings arrive");
      void waitForSettings().then(() => {
        if (spoofingEnabled && spoofedLocation) {
          const position = createGeolocationPosition(spoofedLocation);
          console.log("[GeoSpoof Injected] Deferred: returning spoofed position:", position);
          const delay = 10 + Math.random() * 40;
          setTimeout(() => {
            if (successCallback) {
              successCallback(position as GeolocationPosition);
            }
          }, delay);
        } else {
          console.log("[GeoSpoof Injected] Deferred: using original geolocation");
          originalGetCurrentPosition(successCallback, errorCallback, options);
        }
      });
    }
  };
  registerOverride(getCurrentPositionOverride, "getCurrentPosition");
  disguiseAsNative(getCurrentPositionOverride, "getCurrentPosition", 1);
  navigator.geolocation.getCurrentPosition = getCurrentPositionOverride;

  // Override watchPosition
  const watchPositionOverride = (
    successCallback: PositionCallback,
    errorCallback?: PositionErrorCallback | null,
    options?: PositionOptions
  ): number => {
    if (spoofingEnabled && spoofedLocation) {
      const watchId = watchIdCounter++;
      watchCallbacks.set(watchId, successCallback);

      const position = createGeolocationPosition(spoofedLocation);
      const delay = 10 + Math.random() * 40;

      setTimeout(() => {
        if (successCallback) {
          successCallback(position as GeolocationPosition);
        }
      }, delay);

      return watchId;
    } else {
      return originalWatchPosition(successCallback, errorCallback, options);
    }
  };
  registerOverride(watchPositionOverride, "watchPosition");
  disguiseAsNative(watchPositionOverride, "watchPosition", 1);
  navigator.geolocation.watchPosition = watchPositionOverride;

  // Override clearWatch
  const clearWatchOverride = (watchId: number): void => {
    if (spoofingEnabled) {
      watchCallbacks.delete(watchId);
    } else {
      originalClearWatch(watchId);
    }
  };
  registerOverride(clearWatchOverride, "clearWatch");
  disguiseAsNative(clearWatchOverride, "clearWatch", 1);
  navigator.geolocation.clearWatch = clearWatchOverride;

  // ── Permissions query override ───────────────────────────────────────────

  const originalPermissionsQuery = navigator.permissions?.query?.bind(navigator.permissions);

  /** Create a spoofed PermissionStatus object with state "granted". */
  function createSpoofedPermissionStatus(): PermissionStatus {
    const target = new EventTarget();
    let onchangeHandler: ((this: PermissionStatus, ev: Event) => unknown) | null = null;

    Object.defineProperty(target, "state", {
      get: () => "granted" as PermissionState,
      enumerable: true,
      configurable: false,
    });

    Object.defineProperty(target, "onchange", {
      get: () => onchangeHandler,
      set: (value: ((this: PermissionStatus, ev: Event) => unknown) | null) => {
        onchangeHandler = value;
      },
      enumerable: true,
      configurable: true,
    });

    return target as unknown as PermissionStatus;
  }

  if (originalPermissionsQuery) {
    const permissionsQueryOverride = (
      descriptor: PermissionDescriptor
    ): Promise<PermissionStatus> => {
      try {
        if (descriptor?.name === "geolocation") {
          if (settingsReceived) {
            if (spoofingEnabled) {
              return Promise.resolve(createSpoofedPermissionStatus());
            }
            return originalPermissionsQuery(descriptor);
          }
          // Defer until settings arrive
          return waitForSettings().then(() => {
            if (spoofingEnabled) {
              return createSpoofedPermissionStatus();
            }
            return originalPermissionsQuery(descriptor);
          });
        }
        return originalPermissionsQuery(descriptor);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in permissions.query override:", error);
        return originalPermissionsQuery(descriptor);
      }
    };
    registerOverride(permissionsQueryOverride, "query");
    disguiseAsNative(permissionsQueryOverride, "query", 1);
    navigator.permissions.query = permissionsQueryOverride;
  } else {
    console.warn(
      "[GeoSpoof Injected] navigator.permissions.query not available, skipping override"
    );
  }

  // ── Timezone overrides ─────────────────────────────────────────────────

  // Override Date.prototype.getTimezoneOffset()
  try {
    installOverride(Date.prototype, "getTimezoneOffset", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          const offsetMinutes = getIntlBasedOffset(
            this,
            timezoneData.identifier,
            timezoneData.offset
          );
          // getTimezoneOffset returns the offset TO GET TO UTC (negative of UTC offset)
          return -offsetMinutes;
        }
        return originalGetTimezoneOffset.call(this);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in getTimezoneOffset override:", error);
        return originalGetTimezoneOffset.call(this);
      }
    });
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override getTimezoneOffset:", error);
  }

  // Track Intl.DateTimeFormat instances created with an explicit timeZone option.
  // The resolvedOptions override uses this to avoid injecting the spoofed timezone
  // into instances that already have an explicit timezone (fixes self-interference).
  const explicitTimezoneInstances = new WeakSet<Intl.DateTimeFormat>();

  // Override Intl.DateTimeFormat constructor to inject timezone
  try {
    const DateTimeFormatOverride = function (
      this: Intl.DateTimeFormat | void,
      locales?: string | string[],
      options?: Intl.DateTimeFormatOptions
    ): Intl.DateTimeFormat {
      try {
        const hasExplicitTimezone = options?.timeZone != null;

        if (spoofingEnabled && timezoneData && !hasExplicitTimezone) {
          // Only inject spoofed timezone when caller did NOT provide an explicit one
          const opts: Intl.DateTimeFormatOptions = {
            ...options,
            timeZone: timezoneData.identifier,
          };
          const instance = new OriginalDateTimeFormat(locales, opts);
          // Do NOT add to explicitTimezoneInstances — this is a default-timezone instance
          return instance;
        }

        const instance = new OriginalDateTimeFormat(locales, options);
        if (hasExplicitTimezone) {
          explicitTimezoneInstances.add(instance);
        }
        return instance;
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in DateTimeFormat constructor override:", error);
        return new OriginalDateTimeFormat(locales, options);
      }
    } as unknown as typeof Intl.DateTimeFormat;

    registerOverride(DateTimeFormatOverride, "DateTimeFormat");
    disguiseAsNative(DateTimeFormatOverride, "DateTimeFormat", 0);
    Intl.DateTimeFormat = DateTimeFormatOverride;

    // Copy static properties
    Object.defineProperty(Intl.DateTimeFormat, "prototype", {
      value: OriginalDateTimeFormat.prototype,
      writable: false,
      configurable: false,
    });
    // eslint-disable-next-line @typescript-eslint/unbound-method
    Intl.DateTimeFormat.supportedLocalesOf = OriginalDateTimeFormat.supportedLocalesOf;
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Intl.DateTimeFormat constructor:", error);
  }

  // Override Intl.DateTimeFormat.prototype.resolvedOptions()
  // Scoped: only inject the spoofed timezone for instances that were NOT created
  // with an explicit timeZone option. This prevents self-interference where
  // getIntlBasedOffset / getLongTimezoneName (which use OriginalDateTimeFormat
  // with explicit timeZone) would get corrupted by the spoofed timezone.
  try {
    installOverride(
      Intl.DateTimeFormat.prototype,
      "resolvedOptions",
      function (this: Intl.DateTimeFormat): Intl.ResolvedDateTimeFormatOptions {
        try {
          const options = originalResolvedOptions.call(this);
          if (spoofingEnabled && timezoneData && !explicitTimezoneInstances.has(this)) {
            options.timeZone = timezoneData.identifier;
          }
          return options;
        } catch (error) {
          console.error("[GeoSpoof Injected] Error in resolvedOptions override:", error);
          return originalResolvedOptions.call(this);
        }
      }
    );
  } catch (error) {
    console.error(
      "[GeoSpoof Injected] Failed to override Intl.DateTimeFormat.resolvedOptions:",
      error
    );
  }

  // ── Date formatting overrides ──────────────────────────────────────────

  // Override Date.prototype.toDateString()
  try {
    installOverride(Date.prototype, "toDateString", function (this: Date): string {
      try {
        if (spoofingEnabled && timezoneData) {
          const formatter = new OriginalDateTimeFormat("en-US", {
            timeZone: timezoneData.identifier,
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "2-digit",
          });
          const parts = formatter.formatToParts(this);
          const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
          return `${get("weekday")} ${get("month")} ${get("day")} ${get("year")}`;
        }
        return originalToDateString.call(this);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toDateString override:", error);
        return originalToDateString.call(this);
      }
    });
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toDateString:", error);
  }

  // Override Date.prototype.toString()
  try {
    installOverride(Date.prototype, "toString", function (this: Date): string {
      try {
        if (spoofingEnabled && timezoneData) {
          const offsetMinutes = getIntlBasedOffset(
            this,
            timezoneData.identifier,
            timezoneData.offset
          );
          const formatter = new OriginalDateTimeFormat("en-US", {
            timeZone: timezoneData.identifier,
            weekday: "short",
            year: "numeric",
            month: "short",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          });
          const parts = formatter.formatToParts(this);
          const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
          const gmtOffset = formatGMTOffset(offsetMinutes);
          const longName = getLongTimezoneName(this, timezoneData.identifier);
          return `${get("weekday")} ${get("month")} ${get("day")} ${get("year")} ${get("hour")}:${get("minute")}:${get("second")} ${gmtOffset} (${longName})`;
        }
        return originalToString.call(this);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toString override:", error);
        return originalToString.call(this);
      }
    });
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toString:", error);
  }

  // Override Date.prototype.toTimeString()
  try {
    installOverride(Date.prototype, "toTimeString", function (this: Date): string {
      try {
        if (spoofingEnabled && timezoneData) {
          const offsetMinutes = getIntlBasedOffset(
            this,
            timezoneData.identifier,
            timezoneData.offset
          );
          const formatter = new OriginalDateTimeFormat("en-US", {
            timeZone: timezoneData.identifier,
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          });
          const parts = formatter.formatToParts(this);
          const get = (type: string): string => parts.find((p) => p.type === type)?.value ?? "";
          const gmtOffset = formatGMTOffset(offsetMinutes);
          const longName = getLongTimezoneName(this, timezoneData.identifier);
          return `${get("hour")}:${get("minute")}:${get("second")} ${gmtOffset} (${longName})`;
        }
        return originalToTimeString.call(this);
      } catch (error) {
        console.error("[GeoSpoof Injected] Error in toTimeString override:", error);
        return originalToTimeString.call(this);
      }
    });
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toTimeString:", error);
  }

  // Override Date.prototype.toLocaleString()
  try {
    installOverride(
      Date.prototype,
      "toLocaleString",
      function (
        this: Date,
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions
      ): string {
        try {
          if (spoofingEnabled && timezoneData) {
            const hasExplicitTimezone = options?.timeZone != null;
            if (!hasExplicitTimezone) {
              const opts: Intl.DateTimeFormatOptions = {
                ...options,
                timeZone: timezoneData.identifier,
              };
              return originalToLocaleString.call(this, locales as string, opts);
            }
            return originalToLocaleString.call(this, locales, options);
          }
          return originalToLocaleString.call(this, locales as string, options);
        } catch (error) {
          console.error("[GeoSpoof Injected] Error in toLocaleString override:", error);
          return originalToLocaleString.call(this, locales as string, options);
        }
      }
    );
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toLocaleString:", error);
  }

  // Override Date.prototype.toLocaleDateString()
  try {
    installOverride(
      Date.prototype,
      "toLocaleDateString",
      function (
        this: Date,
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions
      ): string {
        try {
          if (spoofingEnabled && timezoneData) {
            const hasExplicitTimezone = options?.timeZone != null;
            if (!hasExplicitTimezone) {
              const opts: Intl.DateTimeFormatOptions = {
                ...options,
                timeZone: timezoneData.identifier,
              };
              return originalToLocaleDateString.call(this, locales as string, opts);
            }
            return originalToLocaleDateString.call(this, locales, options);
          }
          return originalToLocaleDateString.call(this, locales as string, options);
        } catch (error) {
          console.error("[GeoSpoof Injected] Error in toLocaleDateString override:", error);
          return originalToLocaleDateString.call(this, locales as string, options);
        }
      }
    );
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toLocaleDateString:", error);
  }

  // Override Date.prototype.toLocaleTimeString()
  try {
    installOverride(
      Date.prototype,
      "toLocaleTimeString",
      function (
        this: Date,
        locales?: string | string[],
        options?: Intl.DateTimeFormatOptions
      ): string {
        try {
          if (spoofingEnabled && timezoneData) {
            const hasExplicitTimezone = options?.timeZone != null;
            if (!hasExplicitTimezone) {
              const opts: Intl.DateTimeFormatOptions = {
                ...options,
                timeZone: timezoneData.identifier,
              };
              return originalToLocaleTimeString.call(this, locales as string, opts);
            }
            return originalToLocaleTimeString.call(this, locales, options);
          }
          return originalToLocaleTimeString.call(this, locales as string, options);
        } catch (error) {
          console.error("[GeoSpoof Injected] Error in toLocaleTimeString override:", error);
          return originalToLocaleTimeString.call(this, locales as string, options);
        }
      }
    );
  } catch (error) {
    console.error("[GeoSpoof Injected] Failed to override Date.toLocaleTimeString:", error);
  }

  // ── Date getter overrides ────────────────────────────────────────────

  /**
   * Extract a date component for a given date in the specified IANA timezone
   * using OriginalDateTimeFormat with formatToParts.
   * Returns the numeric value of the requested component.
   */
  function getDateComponent(
    date: Date,
    timezoneId: string,
    component: "hour" | "minute" | "second" | "day" | "month" | "year" | "weekday"
  ): number {
    const options: Intl.DateTimeFormatOptions = { timeZone: timezoneId };
    switch (component) {
      case "hour":
        options.hour = "numeric";
        options.hour12 = false;
        break;
      case "minute":
        options.minute = "numeric";
        break;
      case "second":
        options.second = "numeric";
        break;
      case "day":
        options.day = "numeric";
        break;
      case "month":
        options.month = "numeric";
        break;
      case "year":
        options.year = "numeric";
        break;
      case "weekday":
        options.weekday = "short";
        break;
    }
    const formatter = new OriginalDateTimeFormat("en-US", options);
    const parts = formatter.formatToParts(date);

    if (component === "weekday") {
      // Derive day-of-week (0=Sun..6=Sat) from the formatted weekday
      const weekdayStr = parts.find((p) => p.type === "weekday")?.value ?? "";
      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };
      return dayMap[weekdayStr] ?? 0;
    }

    const partType =
      component === "day"
        ? "day"
        : component === "month"
          ? "month"
          : component === "year"
            ? "year"
            : component;
    const part = parts.find((p) => p.type === partType);
    return parseInt(part?.value ?? "0", 10);
  }

  // Override Date.prototype.getHours
  try {
    installOverride(Date.prototype, "getHours", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          return getDateComponent(this, timezoneData.identifier, "hour");
        }
        return originalGetHours.call(this);
      } catch {
        return originalGetHours.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getMinutes
  try {
    installOverride(Date.prototype, "getMinutes", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          return getDateComponent(this, timezoneData.identifier, "minute");
        }
        return originalGetMinutes.call(this);
      } catch {
        return originalGetMinutes.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getSeconds
  try {
    installOverride(Date.prototype, "getSeconds", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          return getDateComponent(this, timezoneData.identifier, "second");
        }
        return originalGetSeconds.call(this);
      } catch {
        return originalGetSeconds.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getMilliseconds
  // Milliseconds don't change with timezone — they're the same in all zones.
  // However, to maintain consistency with the spoofed timezone, we compute
  // the offset delta and adjust the UTC milliseconds accordingly.
  try {
    installOverride(Date.prototype, "getMilliseconds", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          // Milliseconds are timezone-independent (same instant in time),
          // so we return the original value. The ms component doesn't shift
          // across timezones — only h/m/s/date do.
          return originalGetMilliseconds.call(this);
        }
        return originalGetMilliseconds.call(this);
      } catch {
        return originalGetMilliseconds.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getDate (day of month)
  try {
    installOverride(Date.prototype, "getDate", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          return getDateComponent(this, timezoneData.identifier, "day");
        }
        return originalGetDate.call(this);
      } catch {
        return originalGetDate.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getDay (day of week, 0=Sun..6=Sat)
  try {
    installOverride(Date.prototype, "getDay", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          return getDateComponent(this, timezoneData.identifier, "weekday");
        }
        return originalGetDay.call(this);
      } catch {
        return originalGetDay.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getMonth (0-indexed: 0=Jan..11=Dec)
  try {
    installOverride(Date.prototype, "getMonth", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          // getDateComponent returns 1-based month, subtract 1 for 0-indexed
          return getDateComponent(this, timezoneData.identifier, "month") - 1;
        }
        return originalGetMonth.call(this);
      } catch {
        return originalGetMonth.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // Override Date.prototype.getFullYear
  try {
    installOverride(Date.prototype, "getFullYear", function (this: Date): number {
      try {
        if (spoofingEnabled && timezoneData) {
          return getDateComponent(this, timezoneData.identifier, "year");
        }
        return originalGetFullYear.call(this);
      } catch {
        return originalGetFullYear.call(this);
      }
    });
  } catch {
    // Failed to override — original remains in place
  }

  // ── Temporal API overrides ──────────────────────────────────────────
  // Feature-detect Temporal API (available in modern Firefox) and override
  // Temporal.Now methods to return the spoofed timezone when enabled.

  if (typeof Temporal !== "undefined") {
    try {
      // Temporal is feature-detected at runtime; cast through unknown to satisfy
      // strict type-checking since the eslint TS parser cannot resolve the ambient
      // Temporal declarations inside this IIFE.

      const TemporalNow: TemporalNow = (Temporal as unknown as TemporalNamespace).Now;

      const originalTimeZoneId = TemporalNow.timeZoneId.bind(TemporalNow) as () => string;
      const originalPlainDateTimeISO = TemporalNow.plainDateTimeISO.bind(TemporalNow) as (
        tzLike?: string
      ) => TemporalPlainDateTime;
      const originalPlainDateISO = TemporalNow.plainDateISO.bind(TemporalNow) as (
        tzLike?: string
      ) => TemporalPlainDate;
      const originalPlainTimeISO = TemporalNow.plainTimeISO.bind(TemporalNow) as (
        tzLike?: string
      ) => TemporalPlainTime;
      const originalZonedDateTimeISO = TemporalNow.zonedDateTimeISO.bind(TemporalNow) as (
        tzLike?: string
      ) => TemporalZonedDateTime;

      const temporalNowObj = TemporalNow as unknown as object;

      installOverride(temporalNowObj, "timeZoneId", function (): string {
        if (spoofingEnabled && timezoneData) {
          return timezoneData.identifier;
        }
        return originalTimeZoneId();
      });

      installOverride(
        temporalNowObj,
        "plainDateTimeISO",
        function (tzLike?: string): TemporalPlainDateTime {
          if (spoofingEnabled && timezoneData && tzLike === undefined) {
            return originalPlainDateTimeISO(timezoneData.identifier);
          }
          return originalPlainDateTimeISO(tzLike);
        }
      );

      installOverride(
        temporalNowObj,
        "plainDateISO",
        function (tzLike?: string): TemporalPlainDate {
          if (spoofingEnabled && timezoneData && tzLike === undefined) {
            return originalPlainDateISO(timezoneData.identifier);
          }
          return originalPlainDateISO(tzLike);
        }
      );

      installOverride(
        temporalNowObj,
        "plainTimeISO",
        function (tzLike?: string): TemporalPlainTime {
          if (spoofingEnabled && timezoneData && tzLike === undefined) {
            return originalPlainTimeISO(timezoneData.identifier);
          }
          return originalPlainTimeISO(tzLike);
        }
      );

      installOverride(
        temporalNowObj,
        "zonedDateTimeISO",
        function (tzLike?: string): TemporalZonedDateTime {
          if (spoofingEnabled && timezoneData && tzLike === undefined) {
            return originalZonedDateTimeISO(timezoneData.identifier);
          }
          return originalZonedDateTimeISO(tzLike);
        }
      );
    } catch {
      // Temporal API override failed — originals remain in place
    }
  }

  // ── Iframe toString patching ──────────────────────────────────────────
  // Fingerprinting scripts create iframes to get a "clean" Function.prototype.toString
  // reference and cross-check our overrides. We intercept contentWindow access
  // so the iframe's toString is patched synchronously before the caller can use it.
  // This defeats the arkenfox test which grabs iframeWindow immediately after
  // appending the iframe to the DOM.

  // Track which iframe windows have already been patched to avoid re-patching
  const patchedIframeWindows = new WeakSet<Window>();

  function patchIframeWindow(iframeWindow: Window): void {
    if (patchedIframeWindows.has(iframeWindow)) return;
    patchedIframeWindows.add(iframeWindow);

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
      const iframeFnProto = (iframeWindow as any).Function.prototype as {
        toString: AnyFunction;
        call: typeof Function.prototype.call;
      };
      const iframeOrigToString = iframeFnProto.toString;
      const iframeOrigCall = iframeFnProto.call;

      // Use method shorthand so the patched toString has no prototype/[[Construct]]
      // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: method shorthand destructuring for anti-fingerprint
      iframeFnProto.toString = {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        toString(this: any): string {
          const nativeName = overrideRegistry.get(this as AnyFunction);
          if (nativeName !== undefined) {
            return `function ${nativeName}() { [native code] }`;
          }
          // Pre-check: throw TypeError directly for non-functions (same
          // reason as the main window override — single stack frame).
          if (typeof this !== "function") {
            throw new TypeError(nativeTypeErrorMessage);
          }
          // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
          return (iframeOrigCall as any).call(iframeOrigToString, this) as string;
        },
      }.toString;
    } catch {
      // Cross-origin iframes throw SecurityError — silently ignore
    }
  }

  // Override HTMLIFrameElement.prototype.contentWindow getter to patch
  // the iframe's toString synchronously on first access.
  const iframeContentWindowDesc = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    "contentWindow"
  );
  if (iframeContentWindowDesc?.get) {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the wrapper
    const originalContentWindowGet = iframeContentWindowDesc.get;
    // Wrap via stripConstruct so the getter has no prototype/[[Construct]]

    const contentWindowGetter = stripConstruct(function (
      this: HTMLIFrameElement
    ): WindowProxy | null {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const win = originalContentWindowGet.call(this);
      if (win) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          patchIframeWindow(win);
        } catch {
          // Ignore cross-origin errors
        }
      }
      return win;
    });
    registerOverride(contentWindowGetter, "contentWindow");
    disguiseAsNative(contentWindowGetter, "contentWindow", 0);
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      get: contentWindowGetter,
      configurable: iframeContentWindowDesc.configurable,
      enumerable: iframeContentWindowDesc.enumerable,
    });
  }

  // Also intercept contentDocument for completeness — some tests access
  // the iframe's document to get Function.prototype.toString from there.
  const iframeContentDocDesc = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    "contentDocument"
  );
  if (iframeContentDocDesc?.get) {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the wrapper
    const originalContentDocGet = iframeContentDocDesc.get;

    const contentDocGetter = stripConstruct(function (this: HTMLIFrameElement): Document | null {
      // Trigger contentWindow patching first
      const win = this.contentWindow; // uses our patched getter above
      void win; // ensure side-effect
      return originalContentDocGet.call(this);
    });
    registerOverride(contentDocGetter, "contentDocument");
    disguiseAsNative(contentDocGetter, "contentDocument", 0);
    Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
      get: contentDocGetter,
      configurable: iframeContentDocDesc.configurable,
      enumerable: iframeContentDocDesc.enumerable,
    });
  }

  // ── DOM insertion method wrapping ───────────────────────────────────
  // Arkenfox creates iframes via innerHTML + appendChild and immediately
  // accesses window[numberOfIframes] synchronously. MutationObserver is
  // async and fires too late. We wrap DOM insertion methods to synchronously
  // scan inserted nodes for iframes and patch them before the next line
  // of JS executes.

  /** Scan a node (and descendants) for iframes and patch their windows. */
  function scanAndPatchIframes(node: Node): void {
    if (node instanceof HTMLIFrameElement) {
      if (node.contentWindow) {
        try {
          patchIframeWindow(node.contentWindow);
        } catch {
          /* cross-origin */
        }
      }
    }
    if (node instanceof Element) {
      for (const iframe of Array.from(node.querySelectorAll("iframe"))) {
        if (iframe.contentWindow) {
          try {
            patchIframeWindow(iframe.contentWindow);
          } catch {
            /* cross-origin */
          }
        }
      }
    }
  }

  // Store originals before wrapping. These are intentionally detached and
  // always re-bound at call sites via `.call(this)`.
  /* eslint-disable @typescript-eslint/unbound-method */
  const originalAppendChild = Node.prototype.appendChild;
  const originalInsertBefore = Node.prototype.insertBefore;
  const originalReplaceChild = Node.prototype.replaceChild;
  const originalAppend = Element.prototype.append;
  const originalPrepend = Element.prototype.prepend;
  const originalReplaceWith = Element.prototype.replaceWith;
  const originalInsertAdjacentElement = Element.prototype.insertAdjacentElement;
  const originalInsertAdjacentHTML = Element.prototype.insertAdjacentHTML;
  /* eslint-enable @typescript-eslint/unbound-method */

  // Wrap Node.prototype.appendChild
  // When a DocumentFragment is appended, its children move to the parent
  // and the fragment becomes empty. We snapshot children before insertion.
  installOverride(Node.prototype, "appendChild", function <T extends Node>(this: Node, node: T): T {
    const isFragment = node instanceof DocumentFragment;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const children: Node[] = isFragment ? Array.from((node as any).childNodes as NodeList) : [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const result = originalAppendChild.call(this, node) as any;
    if (isFragment) {
      for (const child of children) scanAndPatchIframes(child);
    } else {
      scanAndPatchIframes(node);
    }

    return result;
  });

  // Wrap Node.prototype.insertBefore
  installOverride(Node.prototype, "insertBefore", function <
    T extends Node,
  >(this: Node, node: T, ref: Node | null): T {
    const isFragment = node instanceof DocumentFragment;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const children: Node[] = isFragment ? Array.from((node as any).childNodes as NodeList) : [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const result = originalInsertBefore.call(this, node, ref) as any;
    if (isFragment) {
      for (const child of children) scanAndPatchIframes(child);
    } else {
      scanAndPatchIframes(node);
    }

    return result;
  });

  // Wrap Node.prototype.replaceChild
  installOverride(Node.prototype, "replaceChild", function <
    T extends Node,
  >(this: Node, node: Node, old: T): T {
    const isFragment = node instanceof DocumentFragment;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const children: Node[] = isFragment ? Array.from((node as any).childNodes as NodeList) : [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const result = originalReplaceChild.call(this, node, old) as any;
    if (isFragment) {
      for (const child of children) scanAndPatchIframes(child);
    } else {
      scanAndPatchIframes(node);
    }

    return result;
  });

  // Wrap Element.prototype.append
  installOverride(
    Element.prototype,
    "append",
    function (this: Element, ...nodes: (Node | string)[]): void {
      originalAppend.apply(this, nodes);
      for (const n of nodes) {
        if (n instanceof Node) scanAndPatchIframes(n);
      }
    }
  );

  // Wrap Element.prototype.prepend
  installOverride(
    Element.prototype,
    "prepend",
    function (this: Element, ...nodes: (Node | string)[]): void {
      originalPrepend.apply(this, nodes);
      for (const n of nodes) {
        if (n instanceof Node) scanAndPatchIframes(n);
      }
    }
  );

  // Wrap Element.prototype.replaceWith
  installOverride(
    Element.prototype,
    "replaceWith",
    function (this: Element, ...nodes: (Node | string)[]): void {
      originalReplaceWith.apply(this, nodes);
      for (const n of nodes) {
        if (n instanceof Node) scanAndPatchIframes(n);
      }
    }
  );

  // Wrap Element.prototype.insertAdjacentElement
  installOverride(
    Element.prototype,
    "insertAdjacentElement",
    function (this: Element, position: InsertPosition, element: Element): Element | null {
      const result = originalInsertAdjacentElement.call(this, position, element);
      scanAndPatchIframes(element);
      return result;
    }
  );

  // Wrap Element.prototype.insertAdjacentHTML — parses HTML string which
  // may contain <iframe> elements. After insertion we scan the parent.
  installOverride(
    Element.prototype,
    "insertAdjacentHTML",
    function (this: Element, position: InsertPosition, text: string): void {
      originalInsertAdjacentHTML.call(this, position, text);
      scanAndPatchIframes(this.parentElement ?? this);
    }
  );

  // Wrap innerHTML setter — arkenfox uses div.innerHTML = `<iframe>` then
  // appends the div. We intercept innerHTML to patch iframes immediately.
  const innerHTMLDesc = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  if (innerHTMLDesc?.set) {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the wrapper
    const originalInnerHTMLSet = innerHTMLDesc.set;

    const innerHTMLSetter = stripConstruct(function (this: Element, value: string) {
      originalInnerHTMLSet.call(this, value);
      scanAndPatchIframes(this);
    });
    registerOverride(innerHTMLSetter, "innerHTML");
    disguiseAsNative(innerHTMLSetter, "innerHTML", 1);
    Object.defineProperty(Element.prototype, "innerHTML", {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: passing original getter descriptor to Object.defineProperty
      get: innerHTMLDesc.get,
      set: innerHTMLSetter,
      configurable: innerHTMLDesc.configurable,
      enumerable: innerHTMLDesc.enumerable,
    });
  }

  // Fallback: MutationObserver for edge cases (e.g., iframes created by
  // browser internals or patterns we haven't wrapped).
  const iframeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        scanAndPatchIframes(node);
      }
    }
  });

  if (document.documentElement) {
    iframeObserver.observe(document.documentElement, { childList: true, subtree: true });
  }

  console.log("[GeoSpoof Injected] Geolocation API overrides installed");
})();
