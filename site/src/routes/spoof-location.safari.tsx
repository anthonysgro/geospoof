import { createFileRoute } from "@tanstack/react-router"
import { BrowserSpoofPage } from "@/components/seo/BrowserSpoofPage"
import { SITE_URL } from "@/lib/blog"

const PAGE_URL = `${SITE_URL}/spoof-location/safari`
const DESCRIPTION =
  "Spoof your location in Safari with a free extension from the App Store. GeoSpoof overrides the Geolocation API and timezone on iOS, iPadOS, and macOS so sites see the location you choose."

export const Route = createFileRoute("/spoof-location/safari")({
  component: () => <BrowserSpoofPage slug="safari" />,
  head: () => ({
    meta: [
      { title: "Spoof Your Location in Safari — Free Extension | GeoSpoof" },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { property: "og:title", content: "Spoof your location in Safari" },
      { property: "og:description", content: DESCRIPTION },
      { name: "twitter:url", content: PAGE_URL },
      { name: "twitter:title", content: "Spoof your location in Safari" },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
})
