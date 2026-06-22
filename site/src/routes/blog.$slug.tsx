import { Link, createFileRoute, notFound } from "@tanstack/react-router"
import { MDXContent } from "@content-collections/mdx/react"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { Badge } from "@/components/ui/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
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
        : `${SITE_URL}/images/social-og-home.png`
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
      : `${SITE_URL}/images/social-og-home.png`

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

  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: SITE_URL },
      { "@type": "ListItem", position: 2, name: "Blog", item: `${SITE_URL}/blog` },
      { "@type": "ListItem", position: 3, name: post.title, item: url },
    ],
  }

  // FAQPage structured data — only emitted when the post defines FAQs. Note:
  // Google restricted FAQ rich results to authoritative gov/health sites in
  // 2023, so this no longer yields FAQ rich results here — it's kept for
  // semantic understanding and AI answer engines.
  const faqSchema =
    post.faq.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: post.faq.map((item) => ({
            "@type": "Question",
            name: item.question,
            acceptedAnswer: { "@type": "Answer", text: item.answer },
          })),
        }
      : null

  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          <Breadcrumb className="mb-8">
            <BreadcrumbList>
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/">Home</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbLink asChild>
                  <Link to="/blog">Blog</Link>
                </BreadcrumbLink>
              </BreadcrumbItem>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{post.title}</BreadcrumbPage>
              </BreadcrumbItem>
            </BreadcrumbList>
          </Breadcrumb>

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
                className="mb-8 aspect-1200/630 w-full rounded-brand border border-(--color-canvas-border) object-cover"
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

            {post.faq.length > 0 && (
              <section className="mt-12 border-t border-(--color-canvas-border) pt-8">
                <h2 className="mb-6 text-2xl font-bold text-(--color-canvas-foreground)">
                  Frequently asked questions
                </h2>
                <dl className="space-y-6">
                  {post.faq.map((item) => (
                    <div key={item.question}>
                      <dt className="mb-1.5 text-lg font-semibold text-(--color-canvas-foreground)">
                        {item.question}
                      </dt>
                      <dd className="text-body-base text-(--color-canvas-muted)">
                        {item.answer}
                      </dd>
                    </div>
                  ))}
                </dl>
              </section>
            )}
          </article>
        </Section>
      </main>
      <Footer />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(articleSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbSchema) }}
      />
      {faqSchema && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqSchema) }}
        />
      )}
    </div>
  )
}
