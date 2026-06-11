import { Link, createFileRoute, notFound } from "@tanstack/react-router"
import { MDXContent } from "@content-collections/mdx/react"
import { ArrowLeftIcon } from "lucide-react"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { Badge } from "@/components/ui/badge"
import { mdxComponents } from "@/components/blog/mdx-components"
import { SITE_URL, formatDate, getPostBySlug, postUrl } from "@/lib/blog"

export const Route = createFileRoute("/blog/$slug")({
  loader: ({ params }) => {
    const post = getPostBySlug(params.slug)
    if (!post) throw notFound()
    return post
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    const post = loaderData
    const url = postUrl(post.slug)
    // SVG isn't reliably rendered by social-card scrapers, so only use a cover
    // as the OG image when it's a raster format; otherwise fall back to the
    // pre-built social card.
    const ogImage =
      post.cover && /\.(png|jpe?g|webp)$/i.test(post.cover)
        ? `${SITE_URL}${post.cover}`
        : `${SITE_URL}/images/social-og.png`
    return {
      meta: [
        { title: `${post.title} | GeoSpoof Blog` },
        { name: "description", content: post.description },
        ...(post.keywords.length > 0
          ? [{ name: "keywords", content: post.keywords.join(", ") }]
          : []),
        { name: "author", content: post.author },
        // Open Graph (article)
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { property: "og:title", content: post.title },
        { property: "og:description", content: post.description },
        { property: "og:image", content: ogImage },
        { property: "article:published_time", content: post.date },
        ...(post.updated
          ? [{ property: "article:modified_time", content: post.updated }]
          : []),
        { property: "article:author", content: post.author },
        // Twitter / X
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: post.title },
        { name: "twitter:description", content: post.description },
        { name: "twitter:image", content: ogImage },
      ],
      links: [{ rel: "canonical", href: url }],
    }
  },
  component: BlogPostPage,
})

function BlogPostPage() {
  const post = Route.useLoaderData()
  const url = postUrl(post.slug)
  const socialImage =
    post.cover && /\.(png|jpe?g|webp)$/i.test(post.cover)
      ? `${SITE_URL}${post.cover}`
      : `${SITE_URL}/images/social-og.png`

  const articleSchema = {
    "@context": "https://schema.org",
    "@type": "BlogPosting",
    headline: post.title,
    description: post.description,
    datePublished: post.date,
    dateModified: post.updated ?? post.date,
    author: { "@type": "Person", name: post.author },
    publisher: {
      "@type": "Organization",
      name: "GeoSpoof",
      logo: {
        "@type": "ImageObject",
        url: `${SITE_URL}/icon.png`,
      },
    },
    image: socialImage,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    keywords: post.keywords.join(", "),
  }

  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          <Link
            to="/blog"
            className="text-small mb-8 inline-flex items-center gap-1.5 text-(--color-canvas-muted) transition-colors hover:text-(--color-canvas-foreground)"
          >
            <ArrowLeftIcon className="h-4 w-4" />
            All posts
          </Link>

          <article>
            <header className="mb-8">
              <h1 className="mb-4 text-4xl font-bold text-(--color-canvas-foreground)">
                {post.title}
              </h1>
              <div className="flex flex-wrap items-center gap-2 text-small text-(--color-canvas-muted)">
                <span>{post.author}</span>
                <span aria-hidden="true">·</span>
                <time dateTime={post.date}>{formatDate(post.date)}</time>
                <span aria-hidden="true">·</span>
                <span>{post.readingTime} min read</span>
              </div>
              {post.tags.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {post.tags.map((tag) => (
                    <Badge key={tag} variant="secondary">
                      {tag}
                    </Badge>
                  ))}
                </div>
              )}
            </header>

            {post.cover && (
              <img
                src={post.cover}
                alt={post.coverAlt ?? ""}
                width={1200}
                height={630}
                className="mb-8 aspect-[1200/630] w-full rounded-brand border border-(--color-canvas-border) object-cover"
              />
            )}

            {/* Direct-answer block — the self-contained summary AI answer
                engines are most likely to lift as a citation. */}
            {post.answer && (
              <div className="mb-8 rounded-md-brand border border-brand/30 bg-brand/10 p-5">
                <p className="text-body-base text-(--color-canvas-foreground)">
                  {post.answer}
                </p>
              </div>
            )}

            <div>
              <MDXContent code={post.mdx} components={mdxComponents} />
            </div>
          </article>
        </Section>
      </main>
      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
    </div>
  )
}
