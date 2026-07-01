import { createFileRoute } from "@tanstack/react-router"
import { PrivacyPage, buildPrivacyHead } from "./privacy"

// French Privacy page at /fr/privacy. Only the page chrome is French; the legal
// body stays in English (authoritative). Shares PrivacyPage.
export const Route = createFileRoute("/fr/privacy")({
  component: PrivacyPage,
  head: () => buildPrivacyHead("fr"),
})
