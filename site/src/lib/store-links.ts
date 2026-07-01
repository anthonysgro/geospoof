import type { Platform } from "@/hooks/use-platform"

export interface StoreLink {
  /** Store identifier, used to look up a localized CTA label. */
  key: "firefox" | "chrome" | "apple"
  /** Action-oriented label in English, e.g. "Add to Firefox". Localized UIs
   *  should prefer the dictionary label via `key` (t.storeCta[key]). */
  cta: string
  /** Direct store URL. */
  href: string
}

/**
 * Resolve the single best store link for a detected platform. Returns null for
 * "unknown" (server + first client render) so callers can fall back to a
 * neutral "see all platforms" action and avoid sending users to the wrong store.
 */
export function getStoreLink(
  platform: Platform,
  campaign = "hero"
): StoreLink | null {
  switch (platform) {
    case "firefox":
      return {
        key: "firefox",
        cta: "Add to Firefox",
        href: `https://addons.mozilla.org/firefox/addon/geo-spoof/?utm_source=geospoof.com&utm_medium=website&utm_campaign=${campaign}`,
      }
    case "chromium":
      return {
        key: "chrome",
        cta: "Add to Chrome",
        href: `https://chromewebstore.google.com/detail/geospoof/dgdbdodafgaeifgajaajohkjjgobcgje?utm_source=geospoof.com&utm_medium=website&utm_campaign=${campaign}`,
      }
    case "apple":
      return {
        key: "apple",
        cta: "Get on the App Store",
        href: `https://apps.apple.com/app/apple-store/id6765719745?pt=128299974&ct=${campaign}&mt=8`,
      }
    default:
      return null
  }
}
