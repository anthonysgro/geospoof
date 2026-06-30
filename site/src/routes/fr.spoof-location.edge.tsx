import { createFileRoute } from "@tanstack/react-router"
import {
  BrowserSpoofPage,
  buildSpoofLocationHead,
} from "@/components/seo/BrowserSpoofPage"

export const Route = createFileRoute("/fr/spoof-location/edge")({
  component: () => <BrowserSpoofPage slug="edge" />,
  head: () => buildSpoofLocationHead("edge", "fr"),
})
