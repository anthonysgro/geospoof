/**
 * Unit Tests for WebRTC Configuration
 * Feature: geolocation-spoof-extension-mvp
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
   * Test permission denied handling
   * Validates: Requirements 3.1, 3.2, 3.3
   */
  test("should handle permission denied error when setting WebRTC protection", async () => {
    const { setWebRTCProtection } = await importBackground();

    browser.privacy.network.webRTCIPHandlingPolicy.set.mockRejectedValue(
      new Error("Permission denied")
    );

    await expect(setWebRTCProtection(true)).rejects.toThrow("Permission denied");
  });

  test("should handle permission denied error when clearing WebRTC protection", async () => {
    const { setWebRTCProtection } = await importBackground();

    browser.privacy.network.webRTCIPHandlingPolicy.clear.mockRejectedValue(
      new Error("Permission denied")
    );

    await expect(setWebRTCProtection(false)).rejects.toThrow("Permission denied");
  });

  test("should handle generic errors from privacy API", async () => {
    const { setWebRTCProtection } = await importBackground();

    browser.privacy.network.webRTCIPHandlingPolicy.set.mockRejectedValue(
      new Error("Unknown error")
    );

    await expect(setWebRTCProtection(true)).rejects.toThrow("Unknown error");
  });

  test("should not throw when privacy API succeeds", async () => {
    const { setWebRTCProtection } = await importBackground();

    browser.privacy.network.webRTCIPHandlingPolicy.set.mockResolvedValue(undefined);
    browser.privacy.network.webRTCIPHandlingPolicy.clear.mockResolvedValue(undefined);

    await expect(setWebRTCProtection(true)).resolves.not.toThrow();
    await expect(setWebRTCProtection(false)).resolves.not.toThrow();
  });
});
