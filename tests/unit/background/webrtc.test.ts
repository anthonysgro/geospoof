/**
 * Unit Tests for WebRTC Configuration
 * Feature: geolocation-spoof-extension-mvp
 *
 * NOTE ON ERROR HANDLING SEMANTICS
 *
 * When WebRTC Protection moved to the content-script layer (see
 * `src/content/injected/webrtc.ts`), `setWebRTCProtection` stopped
 * throwing on privacy-API failures. The background-level
 * `browser.privacy.network.webRTCIPHandlingPolicy` call is now a
 * "belt" over the content-script "suspenders": on engines where it
 * works (Chromium, Firefox behind a proxy) it gives us strict
 * browser-level enforcement; on engines where it doesn't (Safari,
 * Firefox without a proxy) the content-script wrapper does the real
 * work. A failure of the belt is informational, not a reason to
 * abort the user's toggle action or surface a popup error.
 *
 * So the current contract is: `setWebRTCProtection` resolves
 * successfully regardless of what the privacy API does. Errors are
 * logged and swallowed. When the API is missing entirely (Safari),
 * the function is a logged no-op.
 */

import { importBackground } from "../../helpers/import-background";
import { expectWebRTCPolicySet, expectWebRTCPolicyClear } from "../../helpers/mock-types";

describe("WebRTC Configuration", () => {
  /**
   * Test privacy API calls with correct parameters
   * Validates: Requirements 3.1, 3.2, 3.3
   */
  test("should call privacy API with correct parameters when enabling WebRTC protection", async () => {
    const { setWebRTCProtection } = await importBackground();

    await setWebRTCProtection(true);

    expectWebRTCPolicySet().toHaveBeenCalledWith({
      value: "disable_non_proxied_udp",
    });
    expectWebRTCPolicySet().toHaveBeenCalledTimes(1);
  });

  test("should call privacy API to clear settings when disabling WebRTC protection", async () => {
    const { setWebRTCProtection } = await importBackground();

    await setWebRTCProtection(false);

    expectWebRTCPolicyClear().toHaveBeenCalledWith({});
    expectWebRTCPolicyClear().toHaveBeenCalledTimes(1);
  });

  /**
   * Privacy-API errors no longer throw — they're logged and
   * swallowed so the popup toggle flow never sees them. The
   * content-script RTCPeerConnection wrapper is now the primary
   * protection path; a browser-level policy-set failure is
   * informational.
   */
  test("should swallow (not throw) permission-denied error when setting WebRTC protection", async () => {
    const { setWebRTCProtection } = await importBackground();

    browser.privacy.network.webRTCIPHandlingPolicy.set.mockRejectedValue(
      new Error("Permission denied")
    );

    await expect(setWebRTCProtection(true)).resolves.not.toThrow();
  });

  test("should swallow (not throw) permission-denied error when clearing WebRTC protection", async () => {
    const { setWebRTCProtection } = await importBackground();

    browser.privacy.network.webRTCIPHandlingPolicy.clear.mockRejectedValue(
      new Error("Permission denied")
    );

    await expect(setWebRTCProtection(false)).resolves.not.toThrow();
  });

  test("should swallow (not throw) generic errors from privacy API", async () => {
    const { setWebRTCProtection } = await importBackground();

    browser.privacy.network.webRTCIPHandlingPolicy.set.mockRejectedValue(
      new Error("Unknown error")
    );

    await expect(setWebRTCProtection(true)).resolves.not.toThrow();
  });

  test("should not throw when privacy API succeeds", async () => {
    const { setWebRTCProtection } = await importBackground();

    browser.privacy.network.webRTCIPHandlingPolicy.set.mockResolvedValue(undefined);
    browser.privacy.network.webRTCIPHandlingPolicy.clear.mockResolvedValue(undefined);

    await expect(setWebRTCProtection(true)).resolves.not.toThrow();
    await expect(setWebRTCProtection(false)).resolves.not.toThrow();
  });

  /**
   * Safari case: the entire `browser.privacy.network.webRTCIPHandlingPolicy`
   * WebExtensions API is not exposed. Before the content-script WebRTC
   * wrapper landed, `setWebRTCProtection(true)` would throw on Safari
   * because it called `.set` on `undefined`. The popup caught that,
   * alerted the user, and reverted the toggle — which is why the
   * Safari popup used to hide the toggle entirely. With graceful
   * feature-detection in place, the call is a logged no-op on engines
   * without the API and the toggle works end-to-end (content-script
   * wrapper delivers the actual protection).
   */
  test("should be a no-op when browser.privacy.network.webRTCIPHandlingPolicy is unavailable (Safari-like)", async () => {
    const { setWebRTCProtection } = await importBackground();

    // Save the real mock so we can restore it afterwards.
    // We cast `browser.privacy.network` once to a loosely-typed
    // shape so the temporary `undefined` assignment doesn't
    // permanently loosen the project-wide browser type.
    const networkTypeLoose = browser.privacy.network as {
      webRTCIPHandlingPolicy: typeof browser.privacy.network.webRTCIPHandlingPolicy | undefined;
    };
    const originalPolicy = networkTypeLoose.webRTCIPHandlingPolicy;
    networkTypeLoose.webRTCIPHandlingPolicy = undefined;

    try {
      await expect(setWebRTCProtection(true)).resolves.not.toThrow();
      await expect(setWebRTCProtection(false)).resolves.not.toThrow();
    } finally {
      networkTypeLoose.webRTCIPHandlingPolicy = originalPolicy;
    }
  });
});
