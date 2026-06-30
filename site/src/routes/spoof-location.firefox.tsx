import { createFileRoute } from "@tanstack/react-router"
import { BrowserSpoofPage } from "@/components/seo/BrowserSpoofPage"
import { SITE_URL } from "@/lib/blog"

const PAGE_URL = `${SITE_URL}/spoof-location/firefox`
const DESCRIPTION =
  "Spoof your location in Firefox with a free, open-source add-on. GeoSpoof overrides the Geolocation API and timezone so sites see the location you choose."

export const Route = createFileRoute("/spoof-location/firefox")({
  component: () => <BrowserSpoofPage slug="firefox" />,
  head: () => ({
    meta: [
      { title: "Spoof Your Location in Firefox — Free Add-on | GeoSpoof" },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { property: "og:title", content: "Spoof your location in Firefox" },
      { property: "og:description", content: DESCRIPTION },
      { name: "twitter:url", content: PAGE_URL },
      { name: "twitter:title", content: "Spoof your location in Firefox" },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
})
