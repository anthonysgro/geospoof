import { createFileRoute } from "@tanstack/react-router"
import { toLocale } from "@/lib/i18n"
import {
  BrowserSpoofPage,
  buildSpoofLocationHead,
} from "@/components/seo/BrowserSpoofPage"

export const Route = createFileRoute("/{-$locale}/spoof-location/chrome")({
  component: () => <BrowserSpoofPage slug="chrome" />,
  head: ({ params }) =>
    buildSpoofLocationHead("chrome", toLocale(params.locale)),
})
