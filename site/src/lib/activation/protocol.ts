/**
 * The deliberately small public contract between geospoof.com/activate and
 * the GeoSpoof browser extension. The activation page only needs proof that
 * its MAIN-world spoofing engine is installed, configured, and active; location
 * is read through the browser's Geolocation API so no extension settings or
 * identifiers cross the boundary.
 */
export const ACTIVATION_PROTOCOL_VERSION = 2 as const
export const ACTIVATION_PAGE_SOURCE = "com.geospoof.activation-page" as const
export const ACTIVATION_EXTENSION_SOURCE =
  "com.moonloaf.geospoof.extension" as const
export const ACTIVATION_PING_TYPE = "GEOSPOOF_ACTIVATION_PING" as const
export const ACTIVATION_READY_TYPE = "GEOSPOOF_ACTIVATION_READY" as const
export const ACTIVATION_PING_EVENT = "geospoof:activation-ping:v2" as const
export const ACTIVATION_READY_EVENT = "geospoof:activation-ready:v2" as const

export interface ActivationPingMessage {
  source: typeof ACTIVATION_PAGE_SOURCE
  type: typeof ACTIVATION_PING_TYPE
  protocolVersion: typeof ACTIVATION_PROTOCOL_VERSION
  nonce: string
}

export interface ActivationReadyMessage {
  source: typeof ACTIVATION_EXTENSION_SOURCE
  type: typeof ACTIVATION_READY_TYPE
  protocolVersion: typeof ACTIVATION_PROTOCOL_VERSION
  nonce: string
}

export type ActivationBrowser =
  | "safari"
  | "safari-desktop"
  | "other-ios"
  | "other"
  | "unknown"
export type SafariSetupVariant = "ios18" | "ios26"

export function createActivationNonce(): string {
  return globalThis.crypto.randomUUID()
}

export function makeActivationPing(nonce: string): ActivationPingMessage {
  return {
    source: ACTIVATION_PAGE_SOURCE,
    type: ACTIVATION_PING_TYPE,
    protocolVersion: ACTIVATION_PROTOCOL_VERSION,
    nonce,
  }
}

export function isActivationReadyMessage(
  value: unknown,
  expectedNonce: string
): value is ActivationReadyMessage {
  if (typeof value !== "object" || value === null) return false

  const candidate = value as Record<string, unknown>
  return (
    candidate.source === ACTIVATION_EXTENSION_SOURCE &&
    candidate.type === ACTIVATION_READY_TYPE &&
    candidate.protocolVersion === ACTIVATION_PROTOCOL_VERSION &&
    candidate.nonce === expectedNonce
  )
}

/**
 * Distinguish Safari from iOS browsers that also include the Safari token in
 * their user agent. HTTPS links open in the user's default browser on iOS, but
 * the extension can only be enabled from Safari itself.
 *
 * Desktop Safari is reported separately from mobile Safari. Every instruction on
 * this page describes tapping an iPhone control that does not exist on a Mac, and
 * the Mac app enables its extension natively through
 * `SFSafariApplication.showPreferencesForExtension` — so a Mac visitor needs
 * pointing at the app, not walking through a gesture they cannot perform.
 */
export function detectActivationBrowser(
  userAgent: string,
  platform: string,
  maxTouchPoints: number
): ActivationBrowser {
  if (!userAgent) return "unknown"

  const isIOS =
    /iPhone|iPad|iPod/i.test(userAgent) ||
    (platform === "MacIntel" && maxTouchPoints > 1)
  const isAlternativeIOSBrowser =
    /CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo|DdgA|Brave|GSA/i.test(userAgent)
  const isSafari =
    /Safari/i.test(userAgent) &&
    !/Chrome|Chromium|CriOS|Edg|OPR|Opera|FxiOS|Firefox|Android/i.test(
      userAgent
    )

  if (isIOS && isAlternativeIOSBrowser) return "other-ios"
  // `isIOS` covers iPadOS reporting a Mac platform, so an iPad with a desktop-class
  // user agent still lands on the touch instructions rather than the Mac notice.
  if (isSafari) return isIOS ? "safari" : "safari-desktop"
  return "other"
}

/**
 * Select the Safari terminology shown by the setup page. The native iOS app
 * supplies the authoritative hint because iPadOS can present a desktop-style
 * user agent. Direct visits still receive a conservative user-agent fallback.
 */
export function resolveSafariSetupVariant(
  hint: string | null | undefined,
  userAgent: string
): SafariSetupVariant {
  if (hint === "18") return "ios18"
  if (hint === "26") return "ios26"

  const iosVersion = userAgent.match(/CPU(?: iPhone)? OS (\d+)[_.]/i)
  if (iosVersion && Number.parseInt(iosVersion[1], 10) < 26) {
    return "ios18"
  }

  return "ios26"
}
