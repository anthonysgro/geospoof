import { createFileRoute } from "@tanstack/react-router"
import { HomePage, buildHomeHead } from "@/components/landing/HomePage"

// French home page at `/fr`. Shares the HomePage component with `/`; the active
// locale ("fr") is derived from this URL by the locale-aware components.
export const Route = createFileRoute("/fr")({
  component: HomePage,
  head: () => buildHomeHead("fr"),
})
