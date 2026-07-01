import { createFileRoute } from "@tanstack/react-router"
import { AboutPage, buildAboutHead } from "./about"

// French About page at /fr/about. Shares AboutPage with the English route; the
// active locale ("fr") is derived from this URL.
export const Route = createFileRoute("/fr/about")({
  component: AboutPage,
  head: () => buildAboutHead("fr"),
})
