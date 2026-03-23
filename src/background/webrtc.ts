/**
 * WebRTC Protection
 * Configure Firefox privacy settings to prevent WebRTC IP leaks.
 */

export async function setWebRTCProtection(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await browser.privacy.network.webRTCIPHandlingPolicy.set({
        value: "disable_non_proxied_udp",
      });
    } else {
      await browser.privacy.network.webRTCIPHandlingPolicy.clear({});
    }
  } catch (error) {
    console.error("Failed to set WebRTC protection:", error);
    throw error;
  }
}
