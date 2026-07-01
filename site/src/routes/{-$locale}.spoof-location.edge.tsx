import { createFileRoute } from "@tanstack/react-router"
import { toLocale } from "@/lib/i18n"
import {
  BrowserSpoofPage,
  buildSpoofLocationHead,
} from "@/components/seo/BrowserSpoofPage"

export const Route = createFileRoute("/{-$locale}/spoof-location/edge")({
  component: () => <BrowserSpoofPage slug="edge" />,
  head: ({ params }) => buildSpoofLocationHead("edge", toLocale(params.locale)),
})
