import { createFileRoute } from "@tanstack/react-router"
import {
  BrowserSpoofPage,
  buildSpoofLocationHead,
} from "@/components/seo/BrowserSpoofPage"

export const Route = createFileRoute("/fr/spoof-location/firefox")({
  component: () => <BrowserSpoofPage slug="firefox" />,
  head: () => buildSpoofLocationHead("firefox", "fr"),
})
