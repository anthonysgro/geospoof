import { createFileRoute } from "@tanstack/react-router"
import { HomePage, buildHomeHead } from "@/components/landing/HomePage"

// French home page at `/fr`. Defined as an index route (not `fr.tsx`) so it
// stays a leaf — a `fr.tsx` file would become a layout parent for the
// `/fr/spoof-location/*` routes and render the homepage instead of the child.
export const Route = createFileRoute("/fr/")({
  component: HomePage,
  head: () => buildHomeHead("fr"),
})
