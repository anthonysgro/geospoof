import { Link, createFileRoute } from "@tanstack/react-router"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { Badge } from "@/components/ui/badge"
import { SITE_URL, formatDate, postUrl, posts } from "@/lib/blog"

export const Route = createFileRoute("/blog/")({
  component: BlogIndexPage,
  head: () => ({
    meta: [
      { title: "Blog | GeoSpoof" },
      {
        name: "description",
        content:
          "Guides and deep dives on browser location spoofing, timezone privacy, WebRTC leaks, and getting the most out of GeoSpoof.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${SITE_URL}/blog` },
      { property: "og:title", content: "GeoSpoof Blog" },
      {
        property: "og:description",
        content:
          "Guides and deep dives on browser location spoofing, timezone privacy, and WebRTC leaks.",
      },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/blog` }],
  }),
})

function BlogIndexPage() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          <div className="mb-12 text-center">
            <h1 className="mb-4 text-4xl font-bold text-(--color-canvas-foreground)">
              GeoSpoof Blog
            </h1>
            <p className="text-body-lg text-(--color-canvas-muted)">
              Guides and deep dives on location spoofing, timezone privacy, and
              browser fingerprinting.
            </p>
          </div>

          {posts.length === 0 ? (
            <p className="text-center text-(--color-canvas-muted)">
              No posts yet — check back soon.
            </p>
          ) : (
            <ul className="space-y-4">
              {posts.map((post) => (
                <li key={post.slug}>
                  <Link
                    to="/blog/$slug"
                    params={{ slug: post.slug }}
                    className="block overflow-hidden rounded-brand border border-(--color-canvas-border) transition-colors hover:border-(--color-brand) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
                  >
                    {post.cover && (
                      <img
                        src={post.cover}
                        alt={post.coverAlt ?? ""}
                        width={1200}
                        height={630}
                        loading="lazy"
                        className="aspect-1200/630 w-full border-b border-(--color-canvas-border) object-cover"
                      />
                    )}
                    <div className="p-6">
                      <div className="mb-2 flex flex-wrap items-center gap-2 text-small text-(--color-canvas-muted)">
                        <time dateTime={post.date}>
                          {formatDate(post.date)}
                        </time>
                        <span aria-hidden="true">·</span>
                        <span>{post.readingTime} min read</span>
                      </div>
                      <h2 className="mb-2 text-xl font-semibold text-(--color-canvas-foreground)">
                        {post.title}
                      </h2>
                      <p className="text-body-base mb-4 text-(--color-canvas-muted)">
                        {post.description}
                      </p>
                      {post.tags.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {post.tags.map((tag) => (
                            <Badge key={tag} variant="secondary">
                              {tag}
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </main>
      <Footer />

      {/* Blog listing structured data for search + AI answer engines. */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Blog",
            name: "GeoSpoof Blog",
            url: `${SITE_URL}/blog`,
            blogPost: posts.map((post) => ({
              "@type": "BlogPosting",
              headline: post.title,
              description: post.description,
              datePublished: post.date,
              dateModified: post.updated ?? post.date,
              author: { "@type": "Person", name: post.author, url: `${SITE_URL}/about` },
              url: postUrl(post.slug),
            })),
          }),
        }}
      />
    </div>
  )
}
