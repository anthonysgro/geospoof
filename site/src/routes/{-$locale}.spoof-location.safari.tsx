import { createFileRoute } from "@tanstack/react-router"
import { toLocale } from "@/lib/i18n"
import {
  BrowserSpoofPage,
  buildSpoofLocationHead,
} from "@/components/seo/BrowserSpoofPage"

export const Route = createFileRoute("/{-$locale}/spoof-location/safari")({
  component: () => <BrowserSpoofPage slug="safari" />,
  head: ({ params }) =>
    buildSpoofLocationHead("safari", toLocale(params.locale)),
})
