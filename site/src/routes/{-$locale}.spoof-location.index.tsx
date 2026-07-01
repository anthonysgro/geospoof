import { createFileRoute } from "@tanstack/react-router"
import { toLocale } from "@/lib/i18n"
import {
  SpoofLocationHub,
  buildSpoofLocationHead,
} from "@/components/seo/BrowserSpoofPage"

export const Route = createFileRoute("/{-$locale}/spoof-location/")({
  component: SpoofLocationHub,
  head: ({ params }) => buildSpoofLocationHead("hub", toLocale(params.locale)),
})
