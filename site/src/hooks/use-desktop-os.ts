import * as React from "react"

/**
 * Which desktop build of GeoSpoof GPS a visitor most likely wants.
 *
 * Deliberately separate from `usePlatform` in `use-platform.ts`: that hook
 * answers "which *store* should this visitor use", so its `"apple"` value
 * covers iOS, iPadOS and Safari-on-macOS alike, and a Windows visitor resolves
 * to `"chromium"` or `"firefox"`. Neither answer can pick a DMG over an EXE, so
 * the OS axis gets its own type rather than widening that union.
 *
 *  - "macos"   → offer the DMG first
 *  - "windows" → offer the Setup EXE first
 *  - "unknown" → couldn't tell, or the visitor is on a phone/tablet/Linux where
 *                neither build applies. Callers should present both equally.
 */
export type DesktopOS = "macos" | "windows" | "unknown"

/** The subset of `navigator` this detection reads, so it can be tested purely. */
export interface DesktopOSHints {
  userAgent: string
  /** `navigator.platform`. Needed to tell iPadOS apart from macOS. */
  platform?: string
  /** `navigator.maxTouchPoints`. Same reason. */
  maxTouchPoints?: number
}

/**
 * Map user-agent hints to a desktop OS. Pure, so the interesting cases (iPadOS
 * masquerading as a Mac, Edge, Linux) are checkable without a DOM.
 */
export function detectDesktopOS(hints: DesktopOSHints): DesktopOS {
  const { userAgent: ua, platform, maxTouchPoints = 0 } = hints

  // Phones and tablets first. Neither desktop build runs there, and iPadOS 13+
  // reports `navigator.platform` as "MacIntel" with a Mac-shaped UA, so without
  // this an iPad would be handed a DMG.
  const isMobile =
    /iPhone|iPad|iPod|Android/i.test(ua) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  if (isMobile) return "unknown"

  // Windows on any browser. "Windows NT" survives UA reduction in Chromium.
  if (/Windows NT|Win64|Win32|WOW64/i.test(ua)) return "windows"

  if (/Macintosh|Mac OS X/i.test(ua)) return "macos"

  // Linux, ChromeOS, bots, anything unrecognised.
  return "unknown"
}

/**
 * SSR-safe desktop OS detection. Returns "unknown" on the server and on the
 * first client render so the prerendered markup matches and hydration doesn't
 * warn, then resolves in an effect. Callers must render something sensible for
 * "unknown" — on /gps that means both downloads at equal weight, which is also
 * what a visitor with JavaScript disabled keeps.
 */
export function useDesktopOS(): DesktopOS {
  const [os, setOS] = React.useState<DesktopOS>("unknown")

  React.useEffect(() => {
    if (typeof navigator === "undefined") return
    setOS(
      detectDesktopOS({
        userAgent: navigator.userAgent,
        platform: navigator.platform,
        maxTouchPoints: navigator.maxTouchPoints,
      })
    )
  }, [])

  return os
}
