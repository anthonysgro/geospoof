import { createFileRoute } from "@tanstack/react-router"
import { HomePage, buildHomeHead } from "@/components/landing/HomePage"

// English home page at the bare path `/`. French lives at `/fr` (routes/fr.tsx).
export const Route = createFileRoute("/")({
  component: HomePage,
  head: () => buildHomeHead("en"),
})
