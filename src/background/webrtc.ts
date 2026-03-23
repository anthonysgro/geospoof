/**
 * WebRTC Protection
 * Configure Firefox privacy settings to prevent WebRTC IP leaks.
 */

import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("BG");

export async function setWebRTCProtection(enabled: boolean): Promise<void> {
  try {
    if (enabled) {
      await browser.privacy.network.webRTCIPHandlingPolicy.set({
        value: "disable_non_proxied_udp",
      });
      logger.info("WebRTC protection enabled: policy set to disable_non_proxied_udp");
    } else {
      await browser.privacy.network.webRTCIPHandlingPolicy.clear({});
      logger.info("WebRTC protection disabled: policy cleared");
    }
  } catch (error) {
    logger.error("Failed to set WebRTC protection:", error);
    throw error;
  }
}
