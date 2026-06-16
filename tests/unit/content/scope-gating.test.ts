/**
 * Verification tests for content-script gating against the scoped `enabled` value.
 *
 * Feature: site-scoping (Requirement 10 — Content and Injected Script Gating).
 *
 * Site-scoping is background-authoritative: the background computes a single
 * per-tab `Effective_Enabled` boolean and delivers it as the `enabled` field of
 * the `UPDATE_SETTINGS` payload. The content script's only job is to forward
 * that received `enabled` value to the injected (page-world) script via the
 * settings `CustomEvent`, exactly as it already does. No content/injected logic
 * changes for this feature — only the *value* of `enabled` changes.
 *
 * These tests exercise the REAL content script (`src/content/index.ts`): they
 * capture the `runtime.onMessage` listener it registers, deliver `UPDATE_SETTINGS`
 * payloads, and inspect the `CustomEvent` it dispatches to the injected script.
 *
 * Covered acceptance criteria:
 *  - 10.1 forward the received `enabled` boolean as the injected gating flag
 *  - 10.4 / 10.7 a true→false / false→true change flips the forwarded flag with
 *         no page reload (value-driven; the listener simply re-dispatches)
 *  - 10.6 a payload whose `enabled` is missing or not a boolean must not produce
 *         an active gating flag (so the injected script applies no overrides)
 *
 * 10.2/10.3/10.5 describe injected-script behaviour gated on the forwarded flag
 * and are covered by the existing injected-script tests; here we verify the
 * content script delivers the correct gating flag to the injected boundary.
 */

import { describe, test, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import type { Timezone } from "@/shared/types/settings";

// Must match `EVENT_NAME` in src/content/index.ts (process.env.EVENT_NAME || "__x_evt").
const EVENT_NAME = "__x_evt";

type MessageListener = (message: { type: string; payload?: unknown }) => unknown;

/** A representative non-scope payload shape, mirroring UpdateSettingsPayload. */
function buildPayload(enabled: unknown): Record<string, unknown> {
  return {
    enabled,
    location: { latitude: 40.7128, longitude: -74.006, accuracy: 10 },
    timezone: null as Timezone | null,
    debugLogging: false,
    verbosityLevel: "INFO",
    webrtcProtection: false,
  };
}

/**
 * (Re)load the real content script module with a fresh module state and return
 * the `runtime.onMessage` listener it registers.
 *
 * `runtime.sendMessage` is stubbed to return a never-settling promise so the
 * module's initial `GET_SETTINGS` request neither resolves nor rejects during
 * the test — this isolates the dispatch behaviour to the `UPDATE_SETTINGS`
 * messages we deliver explicitly, and avoids an unhandled rejection from the
 * default `vi.fn()` returning `undefined`.
 */
async function loadContentScript(): Promise<MessageListener> {
  vi.resetModules();

  const runtime = browser.runtime as unknown as {
    sendMessage: Mock;
    onMessage: { addListener: Mock };
  };
  // Never settles: suppress the load-time GET_SETTINGS dispatch.
  runtime.sendMessage.mockReturnValue(new Promise<never>(() => {}));
  runtime.onMessage.addListener.mockClear();

  await import("@/content/index");

  const calls = runtime.onMessage.addListener.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][0] as MessageListener;
}

/**
 * Capture every settings `CustomEvent` the content script dispatches to the
 * injected script. Returns the list of forwarded event details and a cleanup fn.
 */
function captureForwardedSettings(): {
  details: Array<{ enabled: unknown }>;
  stop: () => void;
} {
  const details: Array<{ enabled: unknown }> = [];
  const handler = (event: Event): void => {
    details.push((event as CustomEvent<{ enabled: unknown }>).detail);
  };
  window.addEventListener(EVENT_NAME, handler);
  return { details, stop: () => window.removeEventListener(EVENT_NAME, handler) };
}

/**
 * The gating flag the injected script acts on. The injected script enables
 * overrides only for a truthy boolean `true`; any other value (false, missing,
 * or a non-boolean) leaves overrides off. This mirrors how the forwarded value
 * gates overrides at the injected boundary.
 */
function gatingActive(enabled: unknown): boolean {
  return enabled === true;
}

describe("content script gating against scoped enabled value (Req 10)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  test("forwards a received enabled:true as an active gating flag (Req 10.1)", async () => {
    const listener = await loadContentScript();
    const captured = captureForwardedSettings();

    listener({ type: "UPDATE_SETTINGS", payload: buildPayload(true) });
    vi.runAllTimers(); // flush the first-dispatch document_start retries

    expect(captured.details.length).toBeGreaterThan(0);
    for (const detail of captured.details) {
      expect(detail.enabled).toBe(true);
      expect(gatingActive(detail.enabled)).toBe(true);
    }
    captured.stop();
  });

  test("forwards a received enabled:false as an inactive gating flag (Req 10.1)", async () => {
    const listener = await loadContentScript();
    const captured = captureForwardedSettings();

    listener({ type: "UPDATE_SETTINGS", payload: buildPayload(false) });
    vi.runAllTimers();

    expect(captured.details.length).toBeGreaterThan(0);
    for (const detail of captured.details) {
      expect(detail.enabled).toBe(false);
      expect(gatingActive(detail.enabled)).toBe(false);
    }
    captured.stop();
  });

  test("toggling enabled true→false→true flips the forwarded flag without a reload (Req 10.4, 10.7)", async () => {
    const listener = await loadContentScript();
    const captured = captureForwardedSettings();

    // First scoped delivery: in scope.
    listener({ type: "UPDATE_SETTINGS", payload: buildPayload(true) });
    vi.runAllTimers();
    expect(captured.details.at(-1)?.enabled).toBe(true);
    expect(gatingActive(captured.details.at(-1)?.enabled)).toBe(true);

    // Scope change to out-of-scope — same content-script instance, no reload.
    listener({ type: "UPDATE_SETTINGS", payload: buildPayload(false) });
    vi.runAllTimers();
    expect(captured.details.at(-1)?.enabled).toBe(false);
    expect(gatingActive(captured.details.at(-1)?.enabled)).toBe(false);

    // Scope change back to in-scope — flips again, still no reload.
    listener({ type: "UPDATE_SETTINGS", payload: buildPayload(true) });
    vi.runAllTimers();
    expect(captured.details.at(-1)?.enabled).toBe(true);
    expect(gatingActive(captured.details.at(-1)?.enabled)).toBe(true);

    captured.stop();
  });

  // Req 10.6: a malformed payload (missing `enabled`, or a non-boolean value)
  // must not produce an active gating flag, so the injected script applies no
  // overrides. The background is the sole producer of this field and always
  // emits a strict boolean; these cases defend against missing/legacy payloads.
  const malformedEnabledValues: Array<[label: string, value: unknown]> = [
    ["missing", undefined],
    ["null", null],
    ["empty string", ""],
    ["number 0", 0],
    ["NaN", Number.NaN],
  ];

  test.each(malformedEnabledValues)(
    "does not forward an active gating flag when enabled is %s (Req 10.6)",
    async (_label, value) => {
      const listener = await loadContentScript();
      const captured = captureForwardedSettings();

      const payload = buildPayload(value);
      if (_label === "missing") delete payload.enabled;

      listener({ type: "UPDATE_SETTINGS", payload });
      vi.runAllTimers();

      expect(captured.details.length).toBeGreaterThan(0);
      for (const detail of captured.details) {
        // No overrides may be applied for a malformed enabled value.
        expect(gatingActive(detail.enabled)).toBe(false);
      }
      captured.stop();
    }
  );
});
