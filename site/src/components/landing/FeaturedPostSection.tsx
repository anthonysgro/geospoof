import { Link } from "@tanstack/react-router"
import { ArrowRightIcon } from "lucide-react"
import { Section } from "./Section"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { featuredPost, formatDate } from "@/lib/blog"

/**
 * Home page "From the blog" section. Surfaces a single featured post (see
 * `featuredPost` in lib/blog) as a large card, with a link through to the full
 * blog index. Renders nothing if there are no posts.
 */
export function FeaturedPostSection({ className }: { className?: string }) {
  const post = featuredPost
  if (!post) return null

  return (
    <Section className={cn("py-16! md:py-24!", className)}>
      <div className="mb-10 flex items-end justify-between gap-4">
        <div>
          <p className="mb-3 text-sm font-semibold tracking-widest text-(--color-brand) uppercase">
            From the blog
          </p>
          <h2 className="text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
            Worth a read
          </h2>
        </div>
        <Link
          to="/blog"
          className="hidden shrink-0 items-center gap-1.5 text-sm font-medium text-(--color-brand) hover:underline sm:inline-flex"
        >
          All posts
          <ArrowRightIcon className="h-4 w-4" />
        </Link>
      </div>

      <Link
        to="/blog/$slug"
        params={{ slug: post.slug }}
        className={cn(
          "group grid overflow-hidden rounded-brand border border-(--color-canvas-border)",
          "transition-colors hover:border-(--color-brand)",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)",
          "md:grid-cols-2"
        )}
      >
        {post.cover && (
          <img
            src={post.cover}
            alt={post.coverAlt ?? ""}
            width={1200}
            height={630}
            className="aspect-1200/630 h-full w-full border-b border-(--color-canvas-border) object-cover md:border-r md:border-b-0"
          />
        )}
        <div className="flex flex-col justify-center p-6 md:p-8">
          <div className="mb-3 flex flex-wrap items-center gap-2 text-small text-(--color-canvas-muted)">
            <time dateTime={post.date}>{formatDate(post.date)}</time>
            <span aria-hidden="true">·</span>
            <span>{post.readingTime} min read</span>
          </div>
          <h3 className="mb-3 text-2xl font-bold text-(--color-canvas-foreground)">
            {post.title}
          </h3>
          <p className="text-body-base mb-5 text-(--color-canvas-muted)">
            {post.description}
          </p>
          <div className="mb-5 flex flex-wrap gap-2">
            {post.tags.map((tag) => (
              <Badge key={tag} variant="secondary">
                {tag}
              </Badge>
            ))}
          </div>
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-(--color-brand)">
            Read more
            <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        </div>
      </Link>
    </Section>
  )
}
