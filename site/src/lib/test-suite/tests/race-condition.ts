/**
 * Extension-initialization race-condition probe.
 *
 * A browser extension that installs `Intl.DateTimeFormat` overrides at
 * `document_start` still needs an asynchronous round-trip to the
 * background script to receive its spoofing settings — typically
 * 50-250ms on a cold page load. During that window, the overrides are
 * live but pass through to the real system timezone. A fingerprinting
 * script that reads timezone in a `<head>` inline script wins that
 * race reliably and learns the real zone.
 *
 * This test captures a reading of `Intl.DateTimeFormat().resolvedOptions()
 * .timeZone` at the earliest possible moment (module-evaluation time,
 * before React mounts) and compares it to the settled timezone in the
 * Identity snapshot. When the captured value differs, the page-load
 * race was lost: whatever code ran at that earliest moment saw the
 * real zone, not the spoofed zone.
 *
 * This is NOT a regression test. The race is a fundamental limitation
 * of the MV3 extension architecture and cannot be eliminated without
 * browser-level changes (see Tor Browser, which modifies the C++ layer
 * directly). The test lives in the `known-limitations` group so it
 * surfaces under "Known limitations" in the dashboard rather than as
 * a regression. It passes when the extension wins the race (e.g. warm
 * page refreshes) and fails when the race is lost (cold page loads),
 * giving users an honest signal about when protection is at its
 * strongest.
 *
 * Browser-global access is confined to the `expected` / `observe`
 * callbacks so the module is safe to dynamic-import from `loadAllTests`.
 */

 

import {
  EARLY_TIMEZONE_PROBE,
  EARLY_TIMEZONE_PROBE_AT,
} from "../../verification/early-timezone-probe"

import { buildBehavioralTest } from "../helpers/behavioral"
import type { TestDefinition } from "../types"

const earlyTimezoneRaceTest = buildBehavioralTest<string>({
  id: "known-limitation.race.early-timezone-probe",
  group: "known-limitations",
  name: "Extension settled before the earliest possible page read",
  description:
    "Browser extensions that override `Intl.DateTimeFormat` install their overrides at document_start, but the spoofing settings arrive asynchronously — typically 50-250ms later on cold page loads. A fingerprinting script that reads the timezone synchronously in `<head>` can win that race and learn the real zone. This test takes its own earliest-possible timezone reading at module-evaluation time and compares it to the LIVE timezone at test-run time (after the extension has had ample opportunity to settle). When they differ, the race was lost: our own earliest read saw the real zone before the extension's settings arrived. This is a fundamental MV3 limitation that requires browser-level fixes to eliminate — see Tor Browser, which patches C++ directly rather than going through an extension round-trip.",
  technique:
    "At dashboard module-load time (before React mounts), synchronously read `Intl.DateTimeFormat().resolvedOptions().timeZone` into a cached constant. At test-run time, compare that cached value to a fresh live read of the same API. When the extension won the race, both values match and the test passes. When the race was lost, the cached value is the real system zone while the live read is the spoofed zone, and the test fails with a clear description of how early the race was lost.",
  codeSnippet: `// Runs at module-evaluation time, before any React lifecycle:
const EARLY = new Intl.DateTimeFormat().resolvedOptions().timeZone
// At test-run time (post-settlement):
const LIVE = new Intl.DateTimeFormat().resolvedOptions().timeZone
EARLY === LIVE`,
  expected: async () => {
    let live: string
    try {
      live = new Intl.DateTimeFormat().resolvedOptions().timeZone ?? ""
    } catch {
      live = ""
    }
    if (!live) {
      return {
        skipReason: "Intl did not resolve a timezone identifier",
      }
    }
    return {
      value: live,
      describe: `${live} (live at test-run time, post-settlement)`,
    }
  },
  observe: async () => {
    if (EARLY_TIMEZONE_PROBE === null) {
      return {
        value: "(unavailable)",
        describe: "Early probe returned no value — Intl was missing or threw",
      }
    }
    const probeAt = Math.round(EARLY_TIMEZONE_PROBE_AT)
    return {
      value: EARLY_TIMEZONE_PROBE,
      describe: `${EARLY_TIMEZONE_PROBE} (read at t=${probeAt}ms into page lifecycle)`,
    }
  },
})

export const raceConditionTests: ReadonlyArray<TestDefinition> = [
  earlyTimezoneRaceTest,
]
