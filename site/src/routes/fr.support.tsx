import { createFileRoute } from "@tanstack/react-router"
import { SupportPage, buildSupportHead } from "./support"

// French support page at /fr/support. Shares SupportPage; locale ("fr") is
// derived from the URL.
export const Route = createFileRoute("/fr/support")({
  component: SupportPage,
  head: () => buildSupportHead("fr"),
})
