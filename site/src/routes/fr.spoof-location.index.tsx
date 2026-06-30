import { createFileRoute } from "@tanstack/react-router"
import {
  SpoofLocationHub,
  buildSpoofLocationHead,
} from "@/components/seo/BrowserSpoofPage"

// French hub at /fr/spoof-location. Shares SpoofLocationHub with the English
// route; the active locale ("fr") is derived from this URL.
export const Route = createFileRoute("/fr/spoof-location/")({
  component: SpoofLocationHub,
  head: () => buildSpoofLocationHead("hub", "fr"),
})
