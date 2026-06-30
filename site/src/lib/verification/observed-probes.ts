/**
 * Observed-values probes.
 *
 * Each probe invokes one browser API surface that GeoSpoof overrides
 * (or would, if a content-script extension could reach it), captures
 * the literal value the browser returned, and renders it as a string
 * suitable for display in the Observed Values Panel.
 *
 * These are intentionally NOT tests — they don't compare against an
 * expected value or report pass/fail. They're read-only observations.
 * The Detectable_Issues_Section below the panel is what does the
 * value-correctness judgment; the panel's job is just to let a reader
 * eyeball every surface side-by-side.
 *
 * SSR safety: every browser-global reference lives inside a function
 * body, never at module scope. The panel guards execution behind a
 * `useEffect`, so Node-side imports of this module don't touch
 * `document`, `Intl`, `Temporal`, etc.
 *
 * Error handling: every probe returns a `string` — either the observed
 * value, a short "unavailable" / "unsupported" marker, or a skip
 * message. A probe never throws to the caller.
 */

const UNAVAILABLE = "—"
const NOT_SUPPORTED = "not supported"
const IFRAME_LOAD_TIMEOUT_MS = 2_000

// ---------------------------------------------------------------------------
// Probe result shapes
// ---------------------------------------------------------------------------

export interface ObservedRow {
  /** Short technique identifier, shown in monospace on the left. */
  label: string
  /** The literal value the browser returned, as a string. */
  value: string
  /** Optional longer description surfaced via a hover tooltip. */
  description?: string
}

export interface ObservedFacet {
  id: string
  title: string
  subtitle?: string
  rows: ReadonlyArray<ObservedRow>
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Safe `formatToParts` → named part extractor. */
function intlPart(
  options: Intl.DateTimeFormatOptions,
  partType: Intl.DateTimeFormatPartTypes,
  now: Date
): string {
  try {
    const fmt = new Intl.DateTimeFormat(undefined, options)
    if (typeof fmt.formatToParts !== "function") return NOT_SUPPORTED
    const parts = fmt.formatToParts(now)
    return parts.find((p) => p.type === partType)?.value ?? UNAVAILABLE
  } catch {
    return UNAVAILABLE
  }
}

/** Call a function that returns a string, coercing throws to UNAVAILABLE. */
function safe<T>(fn: () => T, map?: (v: T) => string): string {
  try {
    const v = fn()
    if (map) return map(v)
    return String(v)
  } catch {
    return UNAVAILABLE
  }
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const

// ---------------------------------------------------------------------------
// Facet: Timezone
// ---------------------------------------------------------------------------

function timezoneFacet(now: Date): ObservedFacet {
  const rows: Array<ObservedRow> = [
    {
      label: "Intl.DateTimeFormat().resolvedOptions().timeZone",
      value: safe(() => new Intl.DateTimeFormat().resolvedOptions().timeZone),
      description:
        "The canonical IANA timezone identifier the JavaScript engine thinks it is in. Every other timezone surface ultimately flows from this value.",
    },
    {
      label: "new Date().getTimezoneOffset()",
      value: safe(
        () => now.getTimezoneOffset(),
        (n) => `${n}`
      ),
      description:
        "Minutes WEST of UTC (so -120 means UTC+02:00). Negated from the human-readable offset because it's computed as UTC-minus-local.",
    },
    {
      label: "Intl shortOffset (timeZoneName)",
      value: intlPart({ timeZoneName: "shortOffset" }, "timeZoneName", now),
      description:
        "Compact GMT±HHMM form extracted via Intl.DateTimeFormat's formatToParts. This is the engine's authoritative string rendering of the current offset.",
    },
    {
      label: "Intl longOffset (timeZoneName)",
      value: intlPart({ timeZoneName: "longOffset" }, "timeZoneName", now),
      description:
        "Full GMT±HH:MM form. Same underlying data as shortOffset but with a colon separator.",
    },
    {
      label: "Intl long name (timeZoneName)",
      value: intlPart({ timeZoneName: "long" }, "timeZoneName", now),
      description:
        'Human-friendly zone name like "Pacific Daylight Time". Includes DST state at the current instant.',
    },
  ]
  return {
    id: "timezone",
    title: "Timezone",
    subtitle: "What the engine thinks our zone is, through five surfaces.",
    rows,
  }
}

// ---------------------------------------------------------------------------
// Facet: Temporal
// ---------------------------------------------------------------------------

function temporalFacet(): ObservedFacet {
  const temporal = (
    globalThis as unknown as {
      Temporal?: {
        Now?: {
          timeZoneId?: () => string
          plainDateISO?: () => { toString: () => string }
          plainTimeISO?: () => { toString: () => string }
          plainDateTimeISO?: () => { toString: () => string }
          zonedDateTimeISO?: () => { toString: () => string }
        }
      }
    }
  ).Temporal

  if (!temporal?.Now) {
    return {
      id: "temporal",
      title: "Temporal",
      subtitle: "The new (ES2024) replacement for Date.",
      rows: [
        {
          label: "Temporal.Now.*",
          value: NOT_SUPPORTED,
          description:
            "Temporal isn't exposed in this browser. Firefox 140+ ships it enabled; older Chromium may not.",
        },
      ],
    }
  }
  const N = temporal.Now

  const rows: Array<ObservedRow> = [
    {
      label: "Temporal.Now.timeZoneId()",
      value: safe(() => N.timeZoneId?.() ?? UNAVAILABLE),
      description: "IANA identifier via the Temporal namespace.",
    },
    {
      label: "Temporal.Now.plainDateISO()",
      value: safe(() => N.plainDateISO?.().toString() ?? UNAVAILABLE),
      description: "Current wall-clock date with no time component.",
    },
    {
      label: "Temporal.Now.plainTimeISO()",
      value: safe(() => N.plainTimeISO?.().toString() ?? UNAVAILABLE),
      description: "Current wall-clock time with no date component.",
    },
    {
      label: "Temporal.Now.plainDateTimeISO()",
      value: safe(() => N.plainDateTimeISO?.().toString() ?? UNAVAILABLE),
      description: "Combined wall-clock date-and-time with no offset.",
    },
    {
      label: "Temporal.Now.zonedDateTimeISO()",
      value: safe(() => N.zonedDateTimeISO?.().toString() ?? UNAVAILABLE),
      description: "Full zoned instant including the IANA zone and offset.",
    },
  ]
  return {
    id: "temporal",
    title: "Temporal",
    subtitle: "The new (ES2024) replacement for Date.",
    rows,
  }
}

// ---------------------------------------------------------------------------
// Facet: Date rendering (the .toString family)
// ---------------------------------------------------------------------------

function dateRenderingFacet(now: Date): ObservedFacet {
  const rows: Array<ObservedRow> = [
    {
      label: "new Date().toString()",
      value: safe(() => now.toString()),
      description:
        'Implementation-defined but generally "Day Mon DD YYYY HH:MM:SS GMT±HHMM (Zone Name)". Includes both the numeric offset and a human-readable zone name.',
    },
    {
      label: "new Date().toDateString()",
      value: safe(() => now.toDateString()),
      description:
        "The date-only portion of toString, without time or timezone.",
    },
    {
      label: "new Date().toTimeString()",
      value: safe(() => now.toTimeString()),
      description:
        "The time portion of toString, including offset and zone name.",
    },
    {
      label: "new Date().toLocaleString()",
      value: safe(() => now.toLocaleString()),
      description: "Locale-formatted date and time. Uses the engine's Intl.",
    },
    {
      label: "new Date().toLocaleDateString()",
      value: safe(() => now.toLocaleDateString()),
      description: "Locale-formatted date only.",
    },
    {
      label: "new Date().toLocaleTimeString()",
      value: safe(() => now.toLocaleTimeString()),
      description: "Locale-formatted time only.",
    },
    {
      label: "new Date().toISOString() (UTC — passthrough)",
      value: safe(() => now.toISOString()),
      description:
        "UTC surface — deliberately not spoofed. Preserves true epoch time so round-trips through toISOString/parseISO don't drift. Leaking here would break Date arithmetic.",
    },
  ]
  return {
    id: "date-rendering",
    title: "Date rendering",
    subtitle: "String-producing methods of Date.prototype.",
    rows,
  }
}

// ---------------------------------------------------------------------------
// Facet: Date getters
// ---------------------------------------------------------------------------

function dateGettersFacet(now: Date): ObservedFacet {
  const rows: Array<ObservedRow> = [
    {
      label: "new Date().getHours()",
      value: safe(() => now.getHours(), String),
    },
    {
      label: "new Date().getMinutes()",
      value: safe(() => now.getMinutes(), String),
    },
    {
      label: "new Date().getSeconds()",
      value: safe(() => now.getSeconds(), String),
    },
    {
      label: "new Date().getDate()",
      value: safe(() => now.getDate(), String),
    },
    {
      label: "new Date().getMonth()",
      value: safe(() => {
        const m = now.getMonth()
        return `${m} (${MONTHS[m] ?? "?"})`
      }),
      description: "0-indexed, so 0 is January and 11 is December.",
    },
    {
      label: "new Date().getFullYear()",
      value: safe(() => now.getFullYear(), String),
    },
    {
      label: "new Date().getDay()",
      value: safe(() => {
        const d = now.getDay()
        return `${d} (${WEEKDAYS[d] ?? "?"})`
      }),
      description: "0 is Sunday, 6 is Saturday.",
    },
    {
      label: "new Date().getUTCHours() (UTC — passthrough)",
      value: safe(() => now.getUTCHours(), String),
      description:
        "UTC surface — deliberately not spoofed. Should match the UTC portion of toISOString.",
    },
  ]
  return {
    id: "date-getters",
    title: "Date getters",
    subtitle: "Component accessors on Date.prototype.",
    rows,
  }
}

// ---------------------------------------------------------------------------
// Facet: Intl formatting
// ---------------------------------------------------------------------------

function intlFacet(now: Date): ObservedFacet {
  const fullFormat = safe(() =>
    new Intl.DateTimeFormat(undefined, {
      dateStyle: "full",
      timeStyle: "full",
    }).format(now)
  )
  const utcExplicit = safe(() =>
    new Intl.DateTimeFormat(undefined, {
      timeZone: "UTC",
      dateStyle: "medium",
      timeStyle: "long",
    }).format(now)
  )

  return {
    id: "intl",
    title: "Intl formatting",
    subtitle: "Output from Intl.DateTimeFormat under various options.",
    rows: [
      {
        label: "Intl.DateTimeFormat({ full, full }).format(now)",
        value: fullFormat,
        description:
          "Full locale-formatted date and time including zone name. The canonical way a modern site formats dates — every piece of it flows through the engine's Intl machinery.",
      },
      {
        label: "Intl.DateTimeFormat({ timeZone: 'UTC' }).format(now)",
        value: utcExplicit,
        description:
          "Explicit-UTC passthrough. Asking for UTC should honor UTC regardless of the resolved zone — this proves an explicit argument wins.",
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Facet: Document-level leaks
// ---------------------------------------------------------------------------

function documentFacet(): ObservedFacet {
  const rows: Array<ObservedRow> = []

  rows.push({
    label: "document.lastModified",
    value: safe(() => document.lastModified || UNAVAILABLE),
    description:
      'A wall-clock string in "MM/DD/YYYY HH:MM:SS" form emitted by the document-metadata layer. Bypasses every Date/Intl/Temporal override because it reads from a non-JS timestamp source — we intercept it explicitly.',
  })

  rows.push({
    label: "new DOMParser().parseFromString(...).lastModified",
    value: safe(() => {
      const doc = new DOMParser().parseFromString("", "text/html")
      return doc.lastModified || UNAVAILABLE
    }),
    description:
      "Same metadata layer as document.lastModified, but exposed on an orphan document. A spoofer that only patches the top-level document misses this one.",
  })

  return {
    id: "document",
    title: "Document-level timestamps",
    subtitle:
      "Timestamp surfaces that sit below the JS date machinery. Commonly used as ground-truth timezone sources by fingerprinting tools.",
    rows,
  }
}

// ---------------------------------------------------------------------------
// Async probes (iframe + XSLT)
// ---------------------------------------------------------------------------

/**
 * Mount an offscreen about:blank iframe, read
 * `contentDocument.lastModified`, dispose. Resolves to the string or
 * a skip reason; never throws.
 */
async function probeIframeLastModified(): Promise<string> {
  if (typeof document === "undefined") {
    return UNAVAILABLE
  }
  const iframe = document.createElement("iframe")
  iframe.setAttribute("aria-hidden", "true")
  iframe.style.display = "none"
  document.body.appendChild(iframe)
  try {
    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => resolve(), IFRAME_LOAD_TIMEOUT_MS)
      if (iframe.contentDocument?.readyState === "complete") {
        clearTimeout(timer)
        resolve()
        return
      }
      iframe.addEventListener(
        "load",
        () => {
          clearTimeout(timer)
          resolve()
        },
        { once: true }
      )
    })
    const doc = iframe.contentDocument
    if (!doc) return UNAVAILABLE
    const v = doc.lastModified
    return typeof v === "string" && v.length > 0 ? v : UNAVAILABLE
  } catch {
    return UNAVAILABLE
  } finally {
    try {
      iframe.remove()
    } catch {
      /* ignore */
    }
  }
}

/**
 * Probe EXSLT's `date:date-time()` function through an XSLTProcessor.
 * Only Gecko (Firefox) ships EXSLT; Chromium engines return an empty
 * string. This is the technique arkenfox TZP uses as its ground-truth
 * timezone source.
 */
function probeExsltDateTime(): string {
  if (
    typeof XSLTProcessor === "undefined" ||
    typeof DOMParser === "undefined"
  ) {
    return NOT_SUPPORTED
  }
  const stylesheet =
    '<xsl:stylesheet version="1.0" ' +
    'xmlns:xsl="http://www.w3.org/1999/XSL/Transform" ' +
    'xmlns:date="http://exslt.org/dates-and-times" ' +
    'extension-element-prefixes="date">' +
    '<xsl:output method="html"/>' +
    '<xsl:template match="/">' +
    '<xsl:value-of select="date:date-time()" />' +
    "</xsl:template>" +
    "</xsl:stylesheet>"
  try {
    const doc = new DOMParser().parseFromString(stylesheet, "text/xml")
    const processor = new XSLTProcessor()
    processor.importStylesheet(doc)
    const fragment = processor.transformToFragment(doc, document)
    const value = fragment.childNodes[0].nodeValue
    if (typeof value === "string" && value.length > 0) return value
    return NOT_SUPPORTED
  } catch {
    return UNAVAILABLE
  }
}

// ---------------------------------------------------------------------------
// Facet: Location
// ---------------------------------------------------------------------------

/**
 * Location values come from the identity snapshot — there's no need to
 * re-probe `navigator.geolocation.getCurrentPosition` here. The
 * snapshot's resolution runs exactly once per run with its own
 * permission-aware prompt handling; probing again would either
 * reprompt or race with the shared-position cache.
 */
function locationFacet(
  latitude: string,
  longitude: string,
  accuracy: string
): ObservedFacet {
  return {
    id: "location",
    title: "Location",
    subtitle: "Reported by the W3C Geolocation API.",
    rows: [
      {
        label: "navigator.geolocation.getCurrentPosition → latitude",
        value: latitude,
      },
      {
        label: "navigator.geolocation.getCurrentPosition → longitude",
        value: longitude,
      },
      {
        label: "navigator.geolocation.getCurrentPosition → accuracy",
        value: accuracy,
        description:
          "The reported accuracy in metres. GeoSpoof forwards whatever the user configured.",
      },
    ],
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export interface BuildFacetsInput {
  location: {
    latitude: number | null
    longitude: number | null
    accuracy: number | null
  }
}

/**
 * Build the synchronous facets. The document facet gets its async
 * rows filled in later via `appendAsyncDocumentRows`; we publish
 * twice so the panel renders something immediately instead of sitting
 * blank while the iframe mounts.
 */
export function buildSyncFacets(input: BuildFacetsInput): Array<ObservedFacet> {
  const now = new Date()
  const { latitude, longitude, accuracy } = input.location
  const latStr = latitude === null ? UNAVAILABLE : latitude.toFixed(6)
  const lonStr = longitude === null ? UNAVAILABLE : longitude.toFixed(6)
  const accStr = accuracy === null ? UNAVAILABLE : `${accuracy.toFixed(0)} m`

  return [
    timezoneFacet(now),
    temporalFacet(),
    dateRenderingFacet(now),
    dateGettersFacet(now),
    intlFacet(now),
    locationFacet(latStr, lonStr, accStr),
    documentFacet(),
  ]
}

/**
 * Resolve the async document-level probes and return the additional
 * rows. The caller merges them into the document facet.
 */
export async function resolveAsyncDocumentRows(): Promise<Array<ObservedRow>> {
  const [iframeLastModified] = await Promise.all([probeIframeLastModified()])
  const rows: Array<ObservedRow> = []
  rows.push({
    label: "iframe.contentDocument.lastModified",
    value: iframeLastModified,
    description:
      "An about:blank iframe's own document. The extension's iframe-patching must reach into the iframe's realm to spoof this.",
  })
  const exslt = probeExsltDateTime()
  rows.push({
    label: "XSLTProcessor → date:date-time() (EXSLT)",
    value: exslt,
    description:
      "Gecko-only. Runs inside the C++ XSLT engine, which doesn't round-trip through JS — this is why arkenfox TZP uses it as ground truth. If this disagrees with the other timezone surfaces, the engine is leaking the real offset.",
  })
  return rows
}
