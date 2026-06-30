import { createFileRoute } from "@tanstack/react-router"
import { VpnPage, buildVpnHead } from "./vpn"

// French VPN page at /fr/vpn. Shares VpnPage with the English route; the active
// locale ("fr") is derived from this URL by the locale-aware sections.
export const Route = createFileRoute("/fr/vpn")({
  component: VpnPage,
  head: () => buildVpnHead("fr"),
})
