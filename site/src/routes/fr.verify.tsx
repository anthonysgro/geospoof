import { createFileRoute } from "@tanstack/react-router"
import { VerifyPage, buildVerifyHead } from "./verify"

// French verify page at /fr/verify. Like /verify it's excluded from prerender
// (runs live browser probes) and rendered at runtime. Shares VerifyPage; the
// active locale ("fr") is derived from the URL.
export const Route = createFileRoute("/fr/verify")({
  component: VerifyPage,
  head: () => buildVerifyHead("fr"),
})
