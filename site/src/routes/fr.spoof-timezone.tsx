import { createFileRoute } from "@tanstack/react-router"
import { SpoofTimezonePage, buildSpoofTimezoneHead } from "./spoof-timezone"

// French timezone page at /fr/spoof-timezone. Shares SpoofTimezonePage with the
// English route; the active locale ("fr") is derived from this URL.
export const Route = createFileRoute("/fr/spoof-timezone")({
  component: SpoofTimezonePage,
  head: () => buildSpoofTimezoneHead("fr"),
})
