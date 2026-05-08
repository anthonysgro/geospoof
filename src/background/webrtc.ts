/**
 * WebRTC Protection — browser-level policy layer.
 *
 * Sets the Firefox/Chromium `browser.privacy.network.webRTCIPHandlingPolicy`
 * pref to `"disable_non_proxied_udp"` when the user enables WebRTC
 * Protection. This is the belt; the suspenders are the content-script
 * `RTCPeerConnection` wrapper installed from `src/content/injected/webrtc.ts`.
 *
 * The belt alone is inadequate on two engines:
 *
 *   - Firefox only honours the policy when the user is actually behind
 *     a proxy. Without one, srflx still leaks.
 *   - Safari doesn't expose `browser.privacy` at all — this API is a
 *     Firefox/Chromium-only WebExtensions feature.
 *
 * So the content-script wrapper is what actually closes the leak
 * cross-engine. We keep this call around because it's strictly stronger
 * on Chromium (the browser layer refuses to open UDP sockets at all
 * there), and it's a no-op rather than an error elsewhere.
 *
 * Feature-detects the API instead of relying on try/catch alone — when
 * absent, the call resolves silently so the caller (popup / message
 * handler) doesn't alert the user about "failed to configure WebRTC
 * protection." The content-script wrapper is doing the real work.
 */

import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("BG");

export async function setWebRTCProtection(enabled: boolean): Promise<void> {
  const api = browser.privacy?.network?.webRTCIPHandlingPolicy;
  if (!api) {
    // Safari (and any other engine without this WebExtensions API).
    // The content-script `RTCPeerConnection` wrapper handles the
    // actual protection here; there's nothing to configure at the
    // browser level.
    logger.debug(
      "browser.privacy.network.webRTCIPHandlingPolicy is not available on this engine; " +
        "relying on content-script RTCPeerConnection override for WebRTC protection"
    );
    return;
  }

  try {
    if (enabled) {
      await api.set({ value: "disable_non_proxied_udp" });
      logger.info("WebRTC protection enabled: policy set to disable_non_proxied_udp");
    } else {
      await api.clear({});
      logger.info("WebRTC protection disabled: policy cleared");
    }
  } catch (error) {
    // Log but don't throw. The content-script layer is doing the real
    // work; a browser-level policy-set failure (e.g. a profile that
    // has the pref locked by enterprise policy) is informational, not
    // a reason to block the user's toggle action.
    logger.warn(
      "Browser-level WebRTC policy call failed; content-script protection remains active:",
      error
    );
  }
}
