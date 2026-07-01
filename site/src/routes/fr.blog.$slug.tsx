import { createFileRoute, notFound } from "@tanstack/react-router"
import { BlogPostView, buildBlogPostHead } from "./blog.$slug"
import { getPostBySlug } from "@/lib/blog"

// French blog post at /fr/blog/$slug. Shares BlogPostView with the English
// route; the active locale ("fr") is derived from this URL, so the chrome
// (breadcrumb, byline, prev/next) is French while the article body stays
// English. The head's canonical points at the English URL so the untranslated
// duplicate consolidates onto the one indexable article.
export const Route = createFileRoute("/fr/blog/$slug")({
  loader: ({ params }) => {
    const post = getPostBySlug(params.slug)
    if (!post) throw notFound()
    return post
  },
  head: ({ loaderData }) => (loaderData ? buildBlogPostHead(loaderData) : {}),
  component: BlogPostSlugFr,
})

function BlogPostSlugFr() {
  const post = Route.useLoaderData()
  return <BlogPostView post={post} />
}
