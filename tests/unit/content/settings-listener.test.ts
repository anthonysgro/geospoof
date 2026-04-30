/**
 * Unit tests for waitForSettings and the deferred getCurrentPosition path.
 *
 * These tests cover the scenario where navigator.geolocation.getCurrentPosition
 * is called before the content script has dispatched settings — the "aggressive
 * window" bypass pattern used by fingerprinting sites.
 *
 * The key behaviours under test:
 * 1. waitForSettings resolves with { timedOut: false } when the event fires
 * 2. waitForSettings resolves with { timedOut: true } when the timeout expires
 * 3. getCurrentPosition defers and returns spoofed coords once settings arrive
 * 4. getCurrentPosition fires the error callback (not the real API) on timeout
 */

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// ── Minimal in-process simulation of the injected script's state + modules ──
//
// We can't import the real injected modules directly (they reference browser
// globals like navigator.geolocation that don't exist in jsdom the same way),
// so we replicate the exact logic under test here. This keeps the tests fast
// and focused on the specific behaviour we changed.

const EVENT_NAME = "__x_evt_test";
const SETTINGS_WAIT_TIMEOUT = 3000;

// Mirrors state.ts mutable state
let settingsReceived = false;
let spoofingEnabled = false;
let spoofedLocation: { latitude: number; longitude: number; accuracy: number } | null = null;

function resetState(): void {
  settingsReceived = false;
  spoofingEnabled = false;
  spoofedLocation = null;
}

// Mirrors settings-listener.ts waitForSettings
function waitForSettings(): Promise<{ timedOut: boolean }> {
  if (settingsReceived) return Promise.resolve({ timedOut: false });
  return new Promise<{ timedOut: boolean }>((resolve) => {
    const onSettings = (): void => {
      window.removeEventListener(EVENT_NAME, onSettings);
      resolve({ timedOut: false });
    };
    window.addEventListener(EVENT_NAME, onSettings);
    setTimeout(() => {
      window.removeEventListener(EVENT_NAME, onSettings);
      resolve({ timedOut: true });
    }, SETTINGS_WAIT_TIMEOUT);
  });
}

// Mirrors the deferred branch of getCurrentPositionOverride in geolocation.ts
function simulateGetCurrentPosition(
  successCallback: (pos: { coords: { latitude: number; longitude: number } }) => void,
  errorCallback?: (err: { code: number; message: string }) => void,
  originalGetCurrentPosition?: () => void
): void {
  if (settingsReceived) {
    if (spoofingEnabled && spoofedLocation) {
      setTimeout(() => successCallback({ coords: spoofedLocation! }), 10);
    } else {
      originalGetCurrentPosition?.();
    }
    return;
  }

  void waitForSettings().then(({ timedOut }) => {
    if (timedOut) {
      errorCallback?.({ code: 3 /* TIMEOUT */, message: "Settings not received in time" });
      return;
    }
    if (spoofingEnabled && spoofedLocation) {
      setTimeout(() => successCallback({ coords: spoofedLocation! }), 10);
    } else {
      originalGetCurrentPosition?.();
    }
  });
}

// Helper: dispatch a settings event to simulate the content script sending settings
function dispatchSettings(enabled: boolean, location: typeof spoofedLocation): void {
  settingsReceived = true;
  spoofingEnabled = enabled;
  spoofedLocation = location;
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

describe("waitForSettings", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("resolves immediately with timedOut:false when settingsReceived is already true", async () => {
    settingsReceived = true;
    const result = await waitForSettings();
    expect(result).toEqual({ timedOut: false });
  });

  test("resolves with timedOut:false when event fires before timeout", async () => {
    const promise = waitForSettings();

    // Simulate settings arriving at 100ms
    setTimeout(() => dispatchSettings(true, { latitude: 1, longitude: 2, accuracy: 10 }), 100);
    await vi.runAllTimersAsync();

    expect(await promise).toEqual({ timedOut: false });
  });

  test("resolves with timedOut:true when timeout fires before event", async () => {
    const promise = waitForSettings();

    // Advance past the full timeout without dispatching settings
    await vi.advanceTimersByTimeAsync(SETTINGS_WAIT_TIMEOUT + 1);

    expect(await promise).toEqual({ timedOut: true });
  });

  test("does not resolve with timedOut:true if event fires just before timeout", async () => {
    const promise = waitForSettings();

    // Fire event 1ms before timeout
    setTimeout(
      () => dispatchSettings(true, { latitude: 1, longitude: 2, accuracy: 10 }),
      SETTINGS_WAIT_TIMEOUT - 1
    );
    await vi.runAllTimersAsync();

    expect(await promise).toEqual({ timedOut: false });
  });

  test("cleans up event listener after event fires", async () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const promise = waitForSettings();
    setTimeout(() => dispatchSettings(true, null), 50);
    await vi.runAllTimersAsync();
    await promise;

    // The listener for EVENT_NAME should have been removed (event path removes it,
    // the timeout cleanup also removes it — both are correct)
    const removeCalls = removeSpy.mock.calls.filter((c) => c[0] === EVENT_NAME);
    expect(removeCalls.length).toBeGreaterThanOrEqual(1);
  });

  test("cleans up event listener after timeout", async () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const promise = waitForSettings();
    await vi.advanceTimersByTimeAsync(SETTINGS_WAIT_TIMEOUT + 1);
    await promise;

    const addCalls = addSpy.mock.calls.filter((c) => c[0] === EVENT_NAME);
    const removeCalls = removeSpy.mock.calls.filter((c) => c[0] === EVENT_NAME);
    expect(addCalls.length).toBe(removeCalls.length);
  });
});

describe("getCurrentPosition deferred path", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetState();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("returns spoofed coords when settings arrive after the call", async () => {
    const successCallback = vi.fn();
    const errorCallback = vi.fn();
    const originalGetCurrentPosition = vi.fn();

    simulateGetCurrentPosition(successCallback, errorCallback, originalGetCurrentPosition);

    // Settings arrive 200ms later with spoofing enabled
    setTimeout(
      () => dispatchSettings(true, { latitude: 51.5, longitude: -0.1, accuracy: 10 }),
      200
    );
    await vi.runAllTimersAsync();

    expect(successCallback).toHaveBeenCalledOnce();
    const pos = successCallback.mock.calls[0][0] as {
      coords: { latitude: number; longitude: number };
    };
    expect(pos.coords.latitude).toBe(51.5);
    expect(pos.coords.longitude).toBe(-0.1);
    expect(errorCallback).not.toHaveBeenCalled();
    expect(originalGetCurrentPosition).not.toHaveBeenCalled();
  });

  test("falls through to real API when settings arrive with spoofing disabled", async () => {
    const successCallback = vi.fn();
    const errorCallback = vi.fn();
    const originalGetCurrentPosition = vi.fn();

    simulateGetCurrentPosition(successCallback, errorCallback, originalGetCurrentPosition);

    // Settings arrive with spoofing disabled
    setTimeout(() => dispatchSettings(false, null), 200);
    await vi.runAllTimersAsync();

    expect(originalGetCurrentPosition).toHaveBeenCalledOnce();
    expect(successCallback).not.toHaveBeenCalled();
    expect(errorCallback).not.toHaveBeenCalled();
  });

  test("fires error callback (not real API) when settings never arrive", async () => {
    const successCallback = vi.fn();
    const errorCallback = vi.fn();
    const originalGetCurrentPosition = vi.fn();

    simulateGetCurrentPosition(successCallback, errorCallback, originalGetCurrentPosition);

    // Advance past timeout without dispatching settings
    await vi.advanceTimersByTimeAsync(SETTINGS_WAIT_TIMEOUT + 1);

    expect(errorCallback).toHaveBeenCalledOnce();
    const err = errorCallback.mock.calls[0][0] as { code: number };
    expect(err.code).toBe(3); // TIMEOUT
    // Real API must NOT be called — that would leak the user's real location
    expect(originalGetCurrentPosition).not.toHaveBeenCalled();
    expect(successCallback).not.toHaveBeenCalled();
  });

  test("fires error callback even when no errorCallback provided on timeout", async () => {
    const successCallback = vi.fn();
    // No errorCallback — should not throw
    expect(() => {
      simulateGetCurrentPosition(successCallback, undefined);
    }).not.toThrow();

    await vi.advanceTimersByTimeAsync(SETTINGS_WAIT_TIMEOUT + 1);

    expect(successCallback).not.toHaveBeenCalled();
  });

  test("responds immediately when settingsReceived is already true at call time", async () => {
    dispatchSettings(true, { latitude: 40.7, longitude: -74.0, accuracy: 5 });

    const successCallback = vi.fn();
    simulateGetCurrentPosition(successCallback);

    await vi.runAllTimersAsync();

    expect(successCallback).toHaveBeenCalledOnce();
    const pos = successCallback.mock.calls[0][0] as { coords: { latitude: number } };
    expect(pos.coords.latitude).toBe(40.7);
  });
});
