import { createFileRoute } from "@tanstack/react-router"
import { BrowserSpoofPage } from "@/components/seo/BrowserSpoofPage"
import { SITE_URL } from "@/lib/blog"

const PAGE_URL = `${SITE_URL}/spoof-location/edge`
const DESCRIPTION =
  "Spoof your location in Microsoft Edge with a free extension. GeoSpoof overrides the Geolocation API and timezone so sites see the location you choose. Works on Windows and macOS."

export const Route = createFileRoute("/spoof-location/edge")({
  component: () => <BrowserSpoofPage slug="edge" />,
  head: () => ({
    meta: [
      { title: "Spoof Your Location in Edge — Free Extension | GeoSpoof" },
      { name: "description", content: DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PAGE_URL },
      { property: "og:title", content: "Spoof your location in Edge" },
      { property: "og:description", content: DESCRIPTION },
      { name: "twitter:url", content: PAGE_URL },
      { name: "twitter:title", content: "Spoof your location in Edge" },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: PAGE_URL }],
  }),
})
