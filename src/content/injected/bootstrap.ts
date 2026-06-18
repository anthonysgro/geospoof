/**
 * Early bootstrap seed (Firefox only).
 *
 * Closes the document_start init race for the *synchronous* timezone surfaces
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone`, `Date.prototype.
 * getTimezoneOffset`, the `Date` string/getter methods). Those must answer
 * instantly on the calling line, so they can't wait for the spoofing settings
 * that normally arrive a moment later over the async CustomEvent channel — and
 * a page that reads them in its very first `<script>` (e.g. webbrowsertools'
 * "[aggressive] window" method snapshots `new Date` / `Intl` at the top of
 * `<head>`) captures the user's REAL zone before we've applied anything.
 *
 * On Firefox the background registers a MAIN-world `userScripts` script that
 * runs at document_start — before the page's first script — and stashes the
 * last-saved settings in a global here. We read that global synchronously and
 * apply it, so the spoof is live from the first instruction. The global is
 * removed on read so page scripts can't see it (and its name is derived from
 * the same per-build secret as the settings event, so it isn't a fixed tell).
 *
 * Chrome/Safari can't register a script with inlined data without a per-user
 * toggle (Chrome) or a reliable early-injection primitive (Safari), so the
 * global is simply never present there and this is a no-op. It's also a no-op
 * once the authoritative settings event has arrived, and it never marks
 * settings as "received" — the real event stays the source of truth.
 */

import type { SpoofedLocation } from "./types";
import {
  settingsReceived,
  setSpoofingEnabled,
  setSpoofedLocation,
  setTimezoneData,
  setWebRTCProtectionEnabled,
} from "./state";
import { validateTimezoneData } from "./timezone-helpers";

/* eslint-disable no-var */
declare var process: { env: Record<string, string | undefined> };
/* eslint-enable no-var */

/**
 * Name of the global the background's bootstrap userScript writes to. Derived
 * from the same EVENT_NAME secret used for the settings CustomEvent so it isn't
 * a stable, easily-grepped property name.
 */
const BOOT_KEY: string = (process.env.EVENT_NAME || "__x_evt") + "_b";

/**
 * True once we've successfully consumed the bootstrap global. We only latch
 * this on a *successful* read so that if the injected script happens to run
 * before the bootstrap userScript, an early call sees `undefined`, doesn't
 * latch, and a later call (by which point the bootstrap has run, since it's
 * also a document_start script that precedes any page script) still seeds.
 */
let bootConsumed = false;

/**
 * Synchronously seed spoofing state from the early bootstrap global if present.
 * Cheap and safe to call from the hot path of the synchronous Date/Intl
 * overrides — it returns immediately once consumed or once the real settings
 * event has landed.
 */
export function seedFromBootstrap(): void {
  if (bootConsumed || settingsReceived) return;

  const g = globalThis as Record<string, unknown>;
  let raw: unknown;
  try {
    raw = g[BOOT_KEY];
  } catch {
    return;
  }
  // Not there yet (bootstrap hasn't run, or this engine has no bootstrap).
  // Don't latch — a later call may find it.
  if (raw === undefined || raw === null) return;

  bootConsumed = true;
  // Remove immediately so page scripts can't read our settings off the global.
  try {
    delete g[BOOT_KEY];
  } catch {
    /* non-configurable — best effort */
  }

  try {
    if (typeof raw !== "object") return;
    const d = raw as {
      enabled?: unknown;
      timezone?: unknown;
      location?: unknown;
      webrtcProtection?: unknown;
    };
    if (typeof d.webrtcProtection === "boolean") {
      setWebRTCProtectionEnabled(d.webrtcProtection);
    }
    if (d.timezone && validateTimezoneData(d.timezone)) {
      setTimezoneData(d.timezone);
    }
    if (d.location && typeof d.location === "object") {
      setSpoofedLocation(d.location as SpoofedLocation);
    }
    if (d.enabled === true) {
      setSpoofingEnabled(true);
    }
    // Deliberately do NOT call setSettingsReceived(true): the authoritative
    // settings event remains the source of truth and will overwrite this
    // shortly with the freshest values.
  } catch {
    /* malformed bootstrap payload — ignore, fall back to the event channel */
  }
}
