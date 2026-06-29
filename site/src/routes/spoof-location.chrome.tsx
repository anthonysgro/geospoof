import { createFileRoute } from "@tanstack/react-router"
import { BrowserSpoofPage } from "@/components/seo/BrowserSpoofPage"
import { SITE_URL } from "@/lib/blog"

const PAGE_URL = `${SITE_URL}/spoof-location/chrome`
const DESCRIPTION =
  "Spoof your location in Chrome with a free extension. GeoSpoof overrides the Geolocation API and timezone so sites see the location you choose. Brave too."

export const Route = createFileRoute("/spoof-location/chrome")({
  component: () => <BrowserSpoofPage slug="chrome" />,
  head: () => ({
    meta: [
      { title: "Spoof Your Location in Chrome — Free Extension | GeoSpoof" },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { property: "og:title", content: "Spoof your location in Chrome" },
      { property: "og:description", content: DESCRIPTION },
      { name: "twitter:url", content: PAGE_URL },
      { name: "twitter:title", content: "Spoof your location in Chrome" },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
})
