import { createFileRoute } from "@tanstack/react-router"
import { toLocale } from "@/lib/i18n"
import {
  BrowserSpoofPage,
  buildSpoofLocationHead,
} from "@/components/seo/BrowserSpoofPage"

export const Route = createFileRoute("/{-$locale}/spoof-location/firefox")({
  component: () => <BrowserSpoofPage slug="firefox" />,
  head: ({ params }) =>
    buildSpoofLocationHead("firefox", toLocale(params.locale)),
})
