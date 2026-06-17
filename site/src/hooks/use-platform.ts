import * as React from "react"

/**
 * The download targets we can recommend. Each maps to exactly one store:
 *  - "firefox"  → Firefox Add-ons (desktop + Android)
 *  - "chromium" → Chrome Web Store (Chrome, Brave, Edge, Opera, …)
 *  - "apple"    → App Store (any iOS/iPadOS device, or Safari on macOS)
 *  - "unknown"  → couldn't tell; show every option equally.
 */
export type Platform = "firefox" | "chromium" | "apple" | "unknown"

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "unknown"

  const ua = navigator.userAgent

  // iOS/iPadOS first: every browser there is WebKit and add-ons ship through
  // the App Store, so the device matters more than the browser. iPadOS 13+
  // reports as "MacIntel" but exposes touch points, so check for that too.
  const isIOS =
    /iPhone|iPad|iPod/i.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  if (isIOS) return "apple"

  // Firefox (Gecko) on desktop or Android.
  if (/firefox/i.test(ua) && !/seamonkey/i.test(ua)) return "firefox"

  // Chromium family — Brave and Edge both report as Chrome, which is what we
  // want since they all use the Chrome Web Store.
  if (/chrome|chromium|crios|edg|opr|brave/i.test(ua)) return "chromium"

  // Safari on macOS (no Chromium token present).
  if (/safari/i.test(ua)) return "apple"

  return "unknown"
}

/**
 * SSR-safe platform detection. Returns "unknown" on the server and the first
 * client render (so markup matches and hydration doesn't warn), then resolves
 * to the real platform in an effect.
 */
export function usePlatform(): Platform {
  const [platform, setPlatform] = React.useState<Platform>("unknown")

  React.useEffect(() => {
    setPlatform(detectPlatform())
  }, [])

  return platform
}
