/**
 * Shared location-snapshot helper.
 *
 * Multiple test modules need to read the identity snapshot's location
 * (`ctx.awaitIdentity("location", ...)`) and short-circuit the test if
 * the snapshot never became ready — the most common reason is that the
 * user denied the browser's geolocation prompt, timed out, or doesn't
 * have geolocation available at all.
 *
 * Without this helper, every caller had to either:
 *   - Throw a plain Error on failure → becomes `status: "error"` and
 *     falsely registers as a detectable issue.
 *   - Return a discriminated `{ ok, skipReason }` → every callsite
 *     needs manual branching, which balloons test code.
 *
 * We chose the third path: throw a typed `SkipTestError`, which
 * `buildBehavioralTest` catches and converts to `known-limitation`
 * with the supplied reason. Callsites stay one line:
 *
 *   const location = await requireLocationSnapshot(ctx)
 *
 * If the snapshot isn't ready, the test reports as a known-limitation
 * ("Location unavailable: Geolocation request timed out" or similar)
 * rather than a false failure.
 */

import { SkipTestError } from "./behavioral"
import type { LocationValue } from "../../verification/identity-snapshot"
import type { TestRunContext } from "../types"

/**
 * Max time tests will wait for the shared location snapshot.
 *
 * The provider's `getLocation` correctly waits for the user's decision
 * on the permission prompt rather than timing out prematurely — so in
 * the common case where permission has already been granted, the
 * snapshot is `ready` by the time tests run and `awaitIdentity`
 * returns immediately. This bound matters on a first-run where the
 * user has to read and click the prompt, then the browser has to
 * acquire a fix. We pick 20s to cover:
 *   - A typical prompt reaction (up to ~10s)
 *   - Plus a cold CoreLocation / WiFi-geolocation fix (up to ~10s on
 *     Safari, ~3s on Firefox/Chromium)
 *
 * That's larger than the runner's default 10s per-test timeout —
 * which is fine because the runner multiplies tests in series, and
 * tests that `requireLocationSnapshot` are all waiting on the SAME
 * pending snapshot. Once the first test has waited for and resolved
 * the snapshot, every subsequent test's await returns immediately.
 * So in practice only the first location-dependent test ever sees
 * this bound kick in, and its effective ceiling is still the
 * runner's per-test timeout — we just want our cap to be strictly
 * higher so the skip reason says "location snapshot status was
 * pending" rather than our own premature timeout.
 */
const IDENTITY_LOCATION_WAIT_MS = 20_000

/**
 * Await the shared location snapshot. Resolves with the ready
 * `LocationValue` or throws `SkipTestError` when the snapshot is
 * unavailable. The provider's `getLocation` already handles the
 * permission lifecycle — it waits for the user's decision rather than
 * prematurely timing out — so by the time we reach this helper, the
 * snapshot's status/error field reflects a final outcome: either
 * location was obtained, the user denied permission, or the
 * geolocation request itself errored.
 *
 * Thrown `SkipTestError` is caught by `buildBehavioralTest` and
 * converted to `status: "skipped"` with the descriptive reason,
 * distinguishing "test prerequisite unmet" from "fail" (regression)
 * and "known-limitation" (unfixable architectural gap).
 */
export async function requireLocationSnapshot(
  ctx: TestRunContext
): Promise<LocationValue> {
  const field = await ctx.awaitIdentity("location", IDENTITY_LOCATION_WAIT_MS)
  if (field.status !== "ready" || !field.value) {
    const detail =
      field.error ?? `location snapshot status was "${field.status}"`
    throw new SkipTestError(detail)
  }
  return field.value
}
