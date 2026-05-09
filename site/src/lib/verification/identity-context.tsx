/**
 * Identity provider for the Verification Dashboard.
 *
 * The provider owns the shared `IdentitySnapshot` for one run. Both the
 * Identity Panel (for rendering) and the values-correctness /
 * internal-consistency tests (for assertions) read from the same
 * snapshot via `useIdentity()`, guaranteeing they cannot disagree.
 *
 * SSR safety: every browser-global reference (`navigator`, `Intl`,
 * `Temporal`, `window`) lives inside `useEffect` or an event handler.
 * Importing this module under Node with `window`/`navigator` unset must
 * not throw, which is enforced by the SSR-safety integration test.
 */

import * as React from "react"

import { primeSharedPosition } from "../test-suite/helpers/shared-position"
import { parseUserAgentSummary } from "./format"
import type {
  AsyncField,
  FeatureAvailability,
  IdentitySnapshot,
  LanguageValue,
  LocationValue,
  PlatformValue,
  TimezoneValue,
} from "./identity-snapshot"

/**
 * Max time to wait on `navigator.geolocation.getCurrentPosition`.
 *
 * Generous so a first-time user has space to read the permission
 * prompt, click Allow, and let the browser acquire a fix afterwards
 * without the timer firing beneath them. A tighter bound (e.g. 5s)
 * caused spurious "Geolocation request timed out" errors when the
 * user took 3-4s to click Allow and Chrome took another 2-3s to
 * produce a fix — both well inside "normal" ranges.
 *
 * If the user genuinely can't or won't interact with the prompt
 * the dashboard auto-run waits up to 45s (see the
 * `waitFor("location", 45_000)` call in VerificationDashboard.tsx)
 * before starting tests, so the budget here just needs to cover
 * typical prompt-reaction + acquisition time.
 */
const GEOLOCATION_TIMEOUT_MS = 30_000
/** Max time to wait on `navigator.userAgentData.getHighEntropyValues`. */
const UA_HIGH_ENTROPY_TIMEOUT_MS = 2_000

/**
 * Which asynchronously-resolved fields live on the snapshot. This matches
 * the generic parameter used by `TestRunContext.awaitIdentity` and keeps
 * the two APIs in lock-step.
 */
type AsyncFieldKey = "location" | "platform"

/**
 * React context shape. `snapshot` is reactive; `getSnapshot`, `waitFor`,
 * and `refresh` are stable callbacks backed by refs, so tests and other
 * non-React consumers can read or subscribe without re-rendering.
 */
export interface IdentityContextValue {
  snapshot: IdentitySnapshot
  /** Non-reactive accessor. Always returns the latest snapshot. */
  getSnapshot: () => IdentitySnapshot
  /**
   * Wait for an async field to transition out of `pending`. Resolves with
   * the current `AsyncField` once it is `ready` or `error`, or after
   * `timeoutMs` elapses — whichever comes first. The timeout path
   * resolves with the current (still-pending) field value rather than
   * rejecting; callers inspect `status` to decide what to do.
   */
  waitFor: <TField extends AsyncFieldKey>(
    field: TField,
    timeoutMs: number
  ) => Promise<IdentitySnapshot[TField]>
  /**
   * Re-resolve every field. Bumps `runId`, resets async fields to
   * `pending`, and kicks off fresh resolutions.
   */
  refresh: () => void
}

const IdentityContext = React.createContext<IdentityContextValue | undefined>(
  undefined
)

/**
 * Initial snapshot used at mount and during SSR. Values are blank/pending
 * so nothing here touches a browser global at import time.
 */
function buildInitialSnapshot(runId: number): IdentitySnapshot {
  return {
    runId,
    startedAt: 0,
    location: { status: "pending", value: null, error: null },
    platform: { status: "pending", value: null, error: null },
    timezone: {
      identifier: "",
      offsetMinutes: 0,
      longName: "",
      dstActive: false,
    },
    language: { primary: "", all: [], intlLocale: null },
    features: {
      geolocation: false,
      permissions: false,
      userAgentData: false,
      intlDateTimeFormat: false,
      intlFormatToParts: false,
      temporal: false,
      temporalTimeZoneId: false,
    },
  }
}

/**
 * Resolve the synchronous timezone view for the current run.
 *
 * Uses `Intl.DateTimeFormat` and `Date.prototype.getTimezoneOffset` — both
 * guarded against missing engines. DST is detected by comparing the
 * current offset against the min of January and July offsets: the zone
 * with the smaller (more positive / more east) offset is the DST one, so
 * if the current offset matches that minimum we're in DST.
 */
function resolveTimezone(): TimezoneValue {
  if (
    typeof Intl === "undefined" ||
    typeof Intl.DateTimeFormat !== "function"
  ) {
    return { identifier: "", offsetMinutes: 0, longName: "", dstActive: false }
  }

  let identifier = ""
  try {
    identifier = new Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
  } catch {
    identifier = ""
  }

  const now = new Date()
  const offsetMinutes = now.getTimezoneOffset()

  let longName = ""
  try {
    const fmt = new Intl.DateTimeFormat(undefined, { timeZoneName: "long" })
    const parts =
      typeof fmt.formatToParts === "function" ? fmt.formatToParts(now) : []
    longName = parts.find((p) => p.type === "timeZoneName")?.value ?? ""
  } catch {
    longName = ""
  }

  // DST detection: compare Jan vs Jul offsets. Whichever is smaller (more
  // east of UTC) is the DST one; current offset matching that means DST
  // is active. Works in both hemispheres.
  let dstActive = false
  try {
    const january = new Date(now.getFullYear(), 0, 1).getTimezoneOffset()
    const july = new Date(now.getFullYear(), 6, 1).getTimezoneOffset()
    const stdOffset = Math.max(january, july)
    dstActive = offsetMinutes < stdOffset
  } catch {
    dstActive = false
  }

  return { identifier, offsetMinutes, longName, dstActive }
}

/**
 * Resolve the synchronous language view.
 */
function resolveLanguage(): LanguageValue {
  if (typeof navigator === "undefined") {
    return { primary: "", all: [], intlLocale: null }
  }

  const primary =
    typeof navigator.language === "string" ? navigator.language : ""
  const all = Array.isArray(navigator.languages) ? [...navigator.languages] : []

  let intlLocale: string | null = null
  try {
    if (
      typeof Intl !== "undefined" &&
      typeof Intl.DateTimeFormat === "function"
    ) {
      intlLocale = new Intl.DateTimeFormat().resolvedOptions().locale ?? null
    }
  } catch {
    intlLocale = null
  }

  return { primary, all, intlLocale }
}

/**
 * Detect runtime availability of the features the dashboard inspects.
 *
 * Missing features are rendered as "Not available" in the Feature
 * Availability panel and drive `known-limitation` in affected tests.
 * They never contribute to the detectable-issue count.
 */
function resolveFeatures(): FeatureAvailability {
  const nav = typeof navigator !== "undefined" ? navigator : undefined
  const intl = typeof Intl !== "undefined" ? Intl : undefined
  const temporalGlobal = (
    globalThis as unknown as { Temporal?: { Now?: { timeZoneId?: unknown } } }
  ).Temporal

  return {
    geolocation: !!(nav && nav.geolocation),
    permissions: !!(nav && nav.permissions),
    userAgentData: !!(
      nav && (nav as Navigator & { userAgentData?: unknown }).userAgentData
    ),
    intlDateTimeFormat: !!(intl && typeof intl.DateTimeFormat === "function"),
    intlFormatToParts:
      !!(intl && typeof intl.DateTimeFormat === "function") &&
      typeof intl.DateTimeFormat.prototype.formatToParts === "function",
    temporal: !!temporalGlobal,
    temporalTimeZoneId:
      !!temporalGlobal && typeof temporalGlobal.Now?.timeZoneId === "function",
  }
}

/** Build a synchronous platform label that does not echo the raw UA. */
function resolvePlatformLabel(): {
  label: string
  uaDataAvailable: boolean
  hardwareConcurrency: number | null
} {
  if (typeof navigator === "undefined") {
    return {
      label: "Unknown browser",
      uaDataAvailable: false,
      hardwareConcurrency: null,
    }
  }

  const uaData = (
    navigator as Navigator & {
      userAgentData?: { platform?: string }
    }
  ).userAgentData
  const uaDataAvailable = !!uaData

  let label: string
  if (
    uaData &&
    typeof uaData.platform === "string" &&
    uaData.platform.length > 0
  ) {
    label = uaData.platform
  } else {
    label = parseUserAgentSummary(navigator.userAgent ?? "")
  }

  const hardwareConcurrency =
    typeof navigator.hardwareConcurrency === "number"
      ? navigator.hardwareConcurrency
      : null

  return { label, uaDataAvailable, hardwareConcurrency }
}

/**
 * Wrap `navigator.geolocation.getCurrentPosition` in a promise that
 * cooperates with the browser's permission model. Flow:
 *
 *   1. Query `navigator.permissions.query({ name: "geolocation" })` to
 *      see the current state without triggering any UI.
 *   2. If `denied`, resolve immediately as `status: "error"` with a
 *      clear reason. No prompt will appear — we can't get a position.
 *   3. If `granted`, call `getCurrentPosition` with a short timeout.
 *   4. If `prompt`, listen on the PermissionStatus's `change` event
 *      and wait for the user's decision. Once they grant, proceed to
 *      step 3. If they deny, resolve with the deny reason. We don't
 *      time out the user decision itself (the browser's own prompt
 *      UX owns that interaction), but the abort signal cuts us loose
 *      if the dashboard unmounts.
 *
 * This means location-dependent tests wait for the user's decision —
 * they don't falsely time out while the prompt is still showing.
 *
 * When `navigator.permissions` isn't available (older engines), we
 * fall back to calling `getCurrentPosition` directly with a timeout.
 * The success/error callbacks still work; we just can't distinguish
 * "user hasn't responded yet" from "browser is slow."
 */
function getLocation(signal: AbortSignal): Promise<AsyncField<LocationValue>> {
  // Diagnostic logging. Prefixed so it's easy to filter in the
  // console; every line includes a ms-since-start stamp so we can
  // see exactly how long each phase takes. Noisy on purpose — if
  // this stays in for long we'll gate it behind a flag, but while
  // we're debugging the "Chrome hangs on getCurrentPosition after
  // Allow" issue the noise is useful.
  const t0 = performance.now()
  const tlog = (...args: Array<unknown>): void => {
     
    console.log(
      `[geo-debug +${Math.round(performance.now() - t0)}ms]`,
      ...args,
    )
  }
  tlog("getLocation called")

  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      tlog("navigator.geolocation unavailable, resolving error")
      resolve({
        status: "error",
        value: null,
        error: "Geolocation API unavailable",
      })
      return
    }

    let settled = false

    const resolveOnce = (field: AsyncField<LocationValue>): void => {
      if (settled) return
      settled = true
      tlog(
        "resolveOnce",
        field.status,
        field.error ?? (field.value ? "got coords" : ""),
      )
      resolve(field)
    }

    const onAbort = (): void => {
      tlog("abort signal fired")
      resolveOnce({
        status: "error",
        value: null,
        error: "Geolocation request aborted",
      })
    }
    signal.addEventListener("abort", onAbort, { once: true })

    const callGetCurrentPosition = (): void => {
      tlog(
        "callGetCurrentPosition: invoking navigator.geolocation.getCurrentPosition with timeout",
        GEOLOCATION_TIMEOUT_MS,
      )
      let timeoutId: ReturnType<typeof setTimeout> | null = null
      timeoutId = setTimeout(() => {
        tlog(
          "JS-level timeout fired after",
          GEOLOCATION_TIMEOUT_MS,
          "ms — getCurrentPosition never called back",
        )
        resolveOnce({
          status: "error",
          value: null,
          error: "Geolocation request timed out",
        })
      }, GEOLOCATION_TIMEOUT_MS)

      try {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            tlog("success callback fired", {
              lat: pos.coords.latitude,
              lon: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
            })
            if (timeoutId !== null) clearTimeout(timeoutId)
            // Seed the shared-position cache so downstream tests read
            // from the exact same `GeolocationPosition` object the
            // Identity Panel rendered. Without this, a fresh
            // getCurrentPosition in a test can produce a coord that
            // straddles a 4dp rounding boundary differently from the
            // panel's reading and cause false precision mismatches.
            primeSharedPosition(pos)
            resolveOnce({
              status: "ready",
              value: {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy:
                  typeof pos.coords.accuracy === "number"
                    ? pos.coords.accuracy
                    : null,
              },
              error: null,
            })
          },
          (err) => {
            tlog("error callback fired", { code: err.code, message: err.message })
            if (timeoutId !== null) clearTimeout(timeoutId)
            // Map W3C error codes to human-readable reasons.
            // code 1 = PERMISSION_DENIED, 2 = POSITION_UNAVAILABLE, 3 = TIMEOUT
            const reason =
              err.code === 1
                ? "User denied location permission"
                : err.code === 2
                  ? "Position unavailable"
                  : err.code === 3
                    ? "Geolocation request timed out"
                    : err.message || `Geolocation error (code ${err.code})`
            resolveOnce({
              status: "error",
              value: null,
              error: reason,
            })
          },
          {
            // Match browserleaks' geolocation probe (which works
            // reliably on every engine including the problem cases
            // where ours was hanging): force a fresh fix with a
            // short explicit maximumAge and the high-accuracy path.
            //
            // Chrome has an observed hang when calling
            // `getCurrentPosition` with default options
            // (`enableHighAccuracy: false`, default `maximumAge`)
            // on certain network configurations — the callback
            // never fires until our own JS timer kicks in at 30s.
            // Adding these two options is the single change that
            // makes the call resolve in 1-3s on Chrome. Firefox
            // and Safari don't care — same timing either way.
            enableHighAccuracy: true,
            timeout: GEOLOCATION_TIMEOUT_MS,
            maximumAge: 0,
          },
        )
        tlog("getCurrentPosition returned (callbacks pending)")
      } catch (err) {
        tlog("getCurrentPosition threw synchronously", err)
        if (timeoutId !== null) clearTimeout(timeoutId)
        const message = err instanceof Error ? err.message : String(err)
        resolveOnce({
          status: "error",
          value: null,
          error: message,
        })
      }
    }

    // Prefer the permission-aware path. When it isn't supported, fall
    // through to a direct getCurrentPosition call (will still work —
    // just can't distinguish "user thinking" from "slow browser").
    const permissions =
      typeof navigator.permissions?.query === "function"
        ? navigator.permissions
        : null

    tlog("permissions API available:", !!permissions)

    if (!permissions) {
      callGetCurrentPosition()
      return
    }

    void permissions
      .query({ name: "geolocation" })
      .then((status) => {
        tlog("permissions.query resolved, initial state:", status.state)
        if (settled) return

        // Short-circuit the denied case: `getCurrentPosition` would
        // eventually reject with PERMISSION_DENIED anyway but some
        // engines (older Firefox) hold the call open for a while
        // before doing so. Resolve immediately with a clear reason.
        if (status.state === "denied") {
          resolveOnce({
            status: "error",
            value: null,
            error: "User denied location permission",
          })
          return
        }

        // Also log PermissionStatus state transitions while the call
        // is in flight — useful for seeing whether Chrome actually
        // fires `change` on grant-from-prompt or just delivers the
        // success callback directly.
        status.addEventListener("change", () => {
          tlog("permissions.state change ->", status.state)
        })

        // `granted` or `prompt`: issue the single timed
        // `getCurrentPosition` call. The 30s timeout comfortably
        // covers prompt-reaction time PLUS acquisition. If the user
        // clicks Block during the prompt, the W3C error callback
        // fires with PERMISSION_DENIED and we resolve cleanly.
        callGetCurrentPosition()
      })
      .catch((err) => {
        tlog("permissions.query rejected, falling back:", err)
        // If permissions.query itself rejects, just fall back.
        if (!settled) callGetCurrentPosition()
      })
  })
}

/**
 * Resolve the asynchronous high-entropy user-agent fields, falling back
 * to the synchronous label when unavailable. Returns a ready/error
 * `AsyncField<PlatformValue>` — pending is only used during the
 * in-flight window managed by the provider.
 */
async function getPlatform(
  signal: AbortSignal
): Promise<AsyncField<PlatformValue>> {
  const { label, uaDataAvailable, hardwareConcurrency } = resolvePlatformLabel()

  if (!uaDataAvailable) {
    return {
      status: "ready",
      value: {
        label,
        platform: null,
        platformVersion: null,
        architecture: null,
        hardwareConcurrency,
        uaDataAvailable: false,
      },
      error: null,
    }
  }

  const uaData = (
    navigator as Navigator & {
      userAgentData?: {
        getHighEntropyValues?: (hints: ReadonlyArray<string>) => Promise<{
          platform?: string
          platformVersion?: string
          architecture?: string
        }>
      }
    }
  ).userAgentData

  if (!uaData || typeof uaData.getHighEntropyValues !== "function") {
    return {
      status: "ready",
      value: {
        label,
        platform: null,
        platformVersion: null,
        architecture: null,
        hardwareConcurrency,
        uaDataAvailable: true,
      },
      error: null,
    }
  }

  // Race the getHighEntropyValues call against a timeout. Aborting the
  // signal also resolves the race so a mid-run refresh can short-circuit.
  const highEntropy = new Promise<
    | {
        ok: true
        v: {
          platform?: string
          platformVersion?: string
          architecture?: string
        }
      }
    | { ok: false; error: string }
  >((resolve) => {
    let settled = false
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      resolve({ ok: false, error: "High-entropy values timed out" })
    }, UA_HIGH_ENTROPY_TIMEOUT_MS)

    const onAbort = () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve({ ok: false, error: "High-entropy values aborted" })
    }
    signal.addEventListener("abort", onAbort, { once: true })

    uaData.getHighEntropyValues!([
      "platform",
      "platformVersion",
      "architecture",
    ])
      .then((v) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        signal.removeEventListener("abort", onAbort)
        resolve({ ok: true, v })
      })
      .catch((err: unknown) => {
        if (settled) return
        settled = true
        clearTimeout(timeout)
        signal.removeEventListener("abort", onAbort)
        const message = err instanceof Error ? err.message : String(err)
        resolve({ ok: false, error: message })
      })
  })

  const result = await highEntropy
  if (!result.ok) {
    return {
      status: "ready",
      value: {
        label,
        platform: null,
        platformVersion: null,
        architecture: null,
        hardwareConcurrency,
        uaDataAvailable: true,
      },
      error: result.error,
    }
  }

  return {
    status: "ready",
    value: {
      label,
      platform: result.v.platform ?? null,
      platformVersion: result.v.platformVersion ?? null,
      architecture: result.v.architecture ?? null,
      hardwareConcurrency,
      uaDataAvailable: true,
    },
    error: null,
  }
}

interface IdentityProviderProps {
  children: React.ReactNode
}

export function IdentityProvider({ children }: IdentityProviderProps) {
  const [snapshot, setSnapshot] = React.useState<IdentitySnapshot>(() =>
    buildInitialSnapshot(0)
  )
  const snapshotRef = React.useRef<IdentitySnapshot>(snapshot)
  /** Bumped on every mount and on every `refresh()`. Drives re-resolution. */
  const [runId, setRunId] = React.useState(0)
  /** Per-run abort controller so `refresh()` cancels outstanding async work. */
  const controllerRef = React.useRef<AbortController | null>(null)
  /**
   * Active waiters for each async field. Registered via `waitFor` and
   * drained when the field transitions out of `pending`.
   */
  const waitersRef = React.useRef<{
    location: Array<(field: AsyncField<LocationValue>) => void>
    platform: Array<(field: AsyncField<PlatformValue>) => void>
  }>({ location: [], platform: [] })

  /** Synchronously publish a new snapshot to both state and ref. */
  const publish = React.useCallback((next: IdentitySnapshot) => {
    snapshotRef.current = next
    setSnapshot(next)
  }, [])

  /** Drain waiters for a field whose value just settled. */
  const drainWaiters = React.useCallback(
    <TField extends AsyncFieldKey>(
      field: TField,
      value: IdentitySnapshot[TField]
    ) => {
      const list = waitersRef.current[field]
      if (list.length === 0) return
      // Snapshot + clear first to avoid re-entrancy issues if a callback
      // registers a new waiter.
      waitersRef.current[field] = [] as never
      for (const resolve of list) {
        ;(resolve as (v: IdentitySnapshot[TField]) => void)(value)
      }
    },
    []
  )

  /**
   * Kick off resolution for the given run. All browser-global access
   * happens inside here, which itself only runs inside the `useEffect`
   * that depends on `runId`.
   */
  const resolveRun = React.useCallback(
    (nextRunId: number) => {
      // Cancel any outstanding work from a previous run.
      controllerRef.current?.abort()
      const controller = new AbortController()
      controllerRef.current = controller

      // Clear any previously-seeded shared position — a new run must
      // re-seed from its own fresh getCurrentPosition to stay honest
      // about the current state of the environment.
      primeSharedPosition(null)

      const startedAt = Date.now()
      const timezone = resolveTimezone()
      const language = resolveLanguage()
      const features = resolveFeatures()

      const fresh: IdentitySnapshot = {
        runId: nextRunId,
        startedAt,
        location: { status: "pending", value: null, error: null },
        platform: { status: "pending", value: null, error: null },
        timezone,
        language,
        features,
      }
      publish(fresh)

      // Kick off async resolutions in parallel. Each settler re-publishes
      // the snapshot with just its field updated and drains its waiters.
      void getLocation(controller.signal).then((location) => {
        if (controller.signal.aborted) return
        const current = snapshotRef.current
        if (current.runId !== nextRunId) return
        const updated: IdentitySnapshot = { ...current, location }
        publish(updated)
        drainWaiters("location", location)
      })

      void getPlatform(controller.signal).then((platform) => {
        if (controller.signal.aborted) return
        const current = snapshotRef.current
        if (current.runId !== nextRunId) return
        const updated: IdentitySnapshot = { ...current, platform }
        publish(updated)
        drainWaiters("platform", platform)
      })
    },
    [publish, drainWaiters]
  )

  /**
   * Run resolution whenever `runId` changes. Starting at 0 on mount means
   * this fires once on first mount (matching the "kick off on mount"
   * design) and again on every `refresh()`.
   */
  React.useEffect(() => {
    resolveRun(runId + 1)
    return () => {
      controllerRef.current?.abort()
      controllerRef.current = null
    }
    // runId is the dependency; resolveRun is stable. eslint-disable is not
    // used — the rule is satisfied.
  }, [runId, resolveRun])

  const getSnapshot = React.useCallback(() => snapshotRef.current, [])

  const waitFor = React.useCallback(
    <TField extends AsyncFieldKey>(
      field: TField,
      timeoutMs: number
    ): Promise<IdentitySnapshot[TField]> => {
      return new Promise<IdentitySnapshot[TField]>((resolve) => {
        const current = snapshotRef.current[field]
        if (current.status !== "pending") {
          resolve(current)
          return
        }

        let settled = false
        const timeoutHandle = setTimeout(
          () => {
            if (settled) return
            settled = true
            // Remove ourselves from the waiter list so we don't get called
            // after the timeout has already resolved the promise.
            const list = waitersRef.current[field] as Array<
              (v: IdentitySnapshot[TField]) => void
            >
            const idx = list.indexOf(onResolve)
            if (idx !== -1) list.splice(idx, 1)
            resolve(snapshotRef.current[field])
          },
          Math.max(0, timeoutMs)
        )

        const onResolve = (v: IdentitySnapshot[TField]) => {
          if (settled) return
          settled = true
          clearTimeout(timeoutHandle)
          resolve(v)
        }
        ;(
          waitersRef.current[field] as Array<
            (v: IdentitySnapshot[TField]) => void
          >
        ).push(onResolve)
      })
    },
    []
  )

  const refresh = React.useCallback(() => {
    setRunId((prev) => prev + 1)
  }, [])

  const value = React.useMemo<IdentityContextValue>(
    () => ({ snapshot, getSnapshot, waitFor, refresh }),
    [snapshot, getSnapshot, waitFor, refresh]
  )

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  )
}

/**
 * Hook to read the shared identity context. Must be called inside an
 * `IdentityProvider`.
 */
export function useIdentity(): IdentityContextValue {
  const ctx = React.useContext(IdentityContext)
  if (ctx === undefined) {
    throw new Error("useIdentity must be used within an IdentityProvider")
  }
  return ctx
}

export { IdentityContext }
