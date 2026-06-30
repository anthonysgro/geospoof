import { createFileRoute } from "@tanstack/react-router"
import {
  BrowserSpoofPage,
  buildSpoofLocationHead,
} from "@/components/seo/BrowserSpoofPage"

export const Route = createFileRoute("/fr/spoof-location/safari")({
  component: () => <BrowserSpoofPage slug="safari" />,
  head: () => buildSpoofLocationHead("safari", "fr"),
})
