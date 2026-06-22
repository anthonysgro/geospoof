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
  | "privacyguides" // community posts

/**
 * Same-origin path that 307-redirects to the Proton VPN offer for a given
 * on-site placement. The redirect target is defined in `vercel.json`.
 *
 * @param placement on-site spot the click originates from (aff_sub)
 */
export function protonVpnLink(placement: VpnPlacement): string {
  return `/go/proton/web/${placement}`
}
