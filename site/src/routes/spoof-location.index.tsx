import { createFileRoute } from "@tanstack/react-router"
import {
  SpoofLocationHub,
  buildSpoofLocationHead,
} from "@/components/seo/BrowserSpoofPage"

export const Route = createFileRoute("/spoof-location/")({
  component: SpoofLocationHub,
  head: () => buildSpoofLocationHead("hub", "en"),
})
