import { createFileRoute } from "@tanstack/react-router"
import { toLocale } from "@/lib/i18n"
import { HomePage, buildHomeHead } from "@/components/landing/HomePage"

// English home page at the bare path `/`. French lives at `/fr` (routes/fr.tsx).
export const Route = createFileRoute("/{-$locale}/")({
  component: HomePage,
  head: ({ params }) => buildHomeHead(toLocale(params.locale)),
})
