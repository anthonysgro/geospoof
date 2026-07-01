import { createFileRoute } from "@tanstack/react-router"
import { BlogIndexView, buildBlogIndexHead } from "./blog.index"

// French blog index at /fr/blog. Shares BlogIndexView with the English route;
// the active locale ("fr") is derived from this URL, so post links stay under
// /fr/blog. Post titles/descriptions remain English — only the framing is
// localized.
export const Route = createFileRoute("/fr/blog/")({
  component: BlogIndexView,
  head: () => buildBlogIndexHead("fr"),
})
