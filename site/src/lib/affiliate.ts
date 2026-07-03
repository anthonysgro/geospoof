// Central source of truth for on-site affiliate *links*.
//
// The real outbound Proton URL (including the offer_id / aff_id and the
// source/aff_sub tracking params) lives ONLY in the `/go/proton/*` redirects
// in `vercel.json`. Everything — this site, the browser extensions, and the
// iOS/macOS apps — links to a stable `geospoof.com/go/proton/...` path, so the
// destination can change server-side without shipping a new build of anything.
//
// Tagging taxonomy (encoded in the redirect path, mapped to Proton fields in
// vercel.json):
//   source  → platform the click came from (web, ios, macos, chrome, firefox)
//   aff_sub → placement (Sub ID 1)
// Pick a placement value once and never rename it — renaming splits report
// history (and breaks the matching redirect).

/** On-site (web) placements that link to the Proton VPN offer. */
export type VpnPlacement =
  | "vpn-page" // the /vpn recommendation page CTA
  | "vpnsync" // "Sync with VPN" contextual callouts
  | "verify" // /verify page mention
  | "blog" // in-article links

/**
 * Same-origin path that 307-redirects to the Proton VPN offer for a given
 * on-site placement. The redirect target is defined in `vercel.json`.
 *
 * @param placement on-site spot the click originates from (aff_sub)
 */
export function protonVpnLink(placement: VpnPlacement): string {
  return `/go/proton/web/${placement}`
}

/** On-site (web) placements that link to the Proton Unlimited offer. */
export type UnlimitedPlacement = "vpn-unlimited" // the /vpn page "already have a VPN?" bundle upsell

/**
 * Same-origin path that 307-redirects to the Proton Unlimited landing for a
 * given on-site placement. The redirect target is defined in `vercel.json`.
 *
 * Note: Unlimited is sold under the SAME Proton offer as VPN (offer_id 26,
 * "Proton VPN RevShare") — Unlimited includes the VPN — so the only difference
 * from `protonVpnLink` is the landing page (`url_id`), which lives in the
 * redirect. Attribution and commission treatment match the VPN links.
 *
 * @param placement on-site spot the click originates from (aff_sub)
 */
export function protonUnlimitedLink(placement: UnlimitedPlacement): string {
  return `/go/proton/web/${placement}`
}

/**
 * Plain, NON-affiliate Proton VPN URL — no offer_id, no aff_id, no tracking.
 *
 * Use this anywhere an affiliate link would be inappropriate or unwelcome:
 * most importantly, privacy-community spaces like the Privacy Guides forum,
 * where affiliate links erode trust (and are often against the rules). The
 * recommendation there should stand on its own, with nothing to gain from it.
 */
export const PROTON_PLAIN_URL = "https://protonvpn.com"

/**
 * Proton's standing promotional discount, shown as an "up to" figure across
 * the site. This is Proton's *own* advertised headline deal: the 2-year VPN
 * Plus plan at ~70% off their standard monthly list price (NOT vs. the $4.99
 * monthly plan — that gap is only ~40%). Shorter plans discount less (1-year
 * ~65%, 1-month ~50%), which is why the copy says "up to". Proton changes
 * promos over time — keep this in sync with (or below) their current 2-year
 * offer so the claim stays accurate. Single source of truth: update here.
 */
export const PROTON_DISCOUNT = "70%"
