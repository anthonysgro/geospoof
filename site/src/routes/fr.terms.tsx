import { createFileRoute } from "@tanstack/react-router"
import { TermsPage, buildTermsHead } from "./terms"

// French Terms page at /fr/terms. Only the page chrome is French; the legal
// body stays in English (authoritative). Shares TermsPage.
export const Route = createFileRoute("/fr/terms")({
  component: TermsPage,
  head: () => buildTermsHead("fr"),
})
