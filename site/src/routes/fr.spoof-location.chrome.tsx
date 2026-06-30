import { createFileRoute } from "@tanstack/react-router"
import {
  BrowserSpoofPage,
  buildSpoofLocationHead,
} from "@/components/seo/BrowserSpoofPage"

export const Route = createFileRoute("/fr/spoof-location/chrome")({
  component: () => <BrowserSpoofPage slug="chrome" />,
  head: () => buildSpoofLocationHead("chrome", "fr"),
})
