import { createFileRoute } from "@tanstack/react-router"
import type { Locale } from "@/lib/i18n"
import { LocaleLink } from "@/components/LocaleLink"
import {
  buildAlternateLinks,
  buildOgLocaleMeta,
  getDictionary,
  localizedPath,
  toLocale,
} from "@/lib/i18n"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { Badge } from "@/components/ui/badge"
import { SITE_URL, formatDate, postUrl, posts } from "@/lib/blog"
import { useTranslations } from "@/hooks/use-i18n"

/**
 * Build the `head` payload for the blog index in a given locale: localized
 * title/description/OG + self-canonical + hreflang cluster. `head()` can't use
 * hooks, so the route passes its locale explicitly. Post *bodies* stay English,
 * but this listing's framing (title, description, headings) is translated.
 */
export function buildBlogIndexHead(locale: Locale) {
  const m = getDictionary(locale).blog.index
  const canonical = `${SITE_URL}${localizedPath("/blog", locale)}`
  return {
    meta: [
      { title: m.metaTitle },
      { name: "description", content: m.metaDescription },
      { property: "og:type", content: "website" },
      ...buildOgLocaleMeta(locale),
      { property: "og:url", content: canonical },
      { property: "og:title", content: m.heading },
      { property: "og:description", content: m.metaDescription },
    ],
    links: [
      { rel: "canonical", href: canonical },
      ...buildAlternateLinks("/blog", SITE_URL),
    ],
  }
}

export const Route = createFileRoute("/{-$locale}/blog/")({
  component: BlogIndexView,
  head: ({ params }) => buildBlogIndexHead(toLocale(params.locale)),
})

/**
 * Blog listing. Shared by the English (`/blog`) and French (`/fr/blog`) routes;
 * the active locale is derived from the URL, so post links keep the visitor's
 * language via `LocaleLink`. Post titles/descriptions stay in the language they
 * were written in (English) — only the page framing is localized.
 */
export function BlogIndexView() {
  const { t } = useTranslations()
  const b = t.blog.index
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          <div className="mb-12 text-center">
            <h1 className="mb-4 text-4xl font-bold text-(--color-canvas-foreground)">
              {b.heading}
            </h1>
            <p className="text-body-lg text-(--color-canvas-muted)">
              {b.subhead}
            </p>
          </div>

          {posts.length === 0 ? (
            <p className="text-center text-(--color-canvas-muted)">{b.empty}</p>
          ) : (
            <ul className="space-y-4">
              {posts.map((post) => (
                <li key={post.slug}>
                  <LocaleLink
                    to={`/blog/${post.slug}`}
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
                      <div className="text-small mb-2 flex flex-wrap items-center gap-2 text-(--color-canvas-muted)">
                        <time dateTime={post.date}>
                          {formatDate(post.date)}
                        </time>
                        <span aria-hidden="true">·</span>
                        <span>
                          {post.readingTime} {b.minRead}
                        </span>
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
                  </LocaleLink>
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
              author: {
                "@type": "Person",
                name: post.author,
                url: `${SITE_URL}/about`,
              },
              url: postUrl(post.slug),
            })),
          }),
        }}
      />
    </div>
  )
}
