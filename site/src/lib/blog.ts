import { allPosts } from "content-collections"

/** Canonical production origin (no trailing slash). */
export const SITE_URL = "https://geospoof.com"

export type Post = (typeof allPosts)[number]

/** Published posts (drafts excluded), newest first. */
export const posts: Array<Post> = allPosts
  .filter((p) => !p.draft)
  .sort((a, b) => (a.date < b.date ? 1 : -1))

/** Look up a single published post by its slug. */
export function getPostBySlug(slug: string): Post | undefined {
  return posts.find((p) => p.slug === slug)
}

/**
 * Adjacent posts for foot-of-article navigation. `posts` is newest-first, so
 * the *newer* neighbour sits at the lower index and the *older* one at the
 * higher index. Either side may be `undefined` at the ends of the list.
 */
export function getAdjacentPosts(slug: string): {
  newer: Post | undefined
  older: Post | undefined
} {
  const i = posts.findIndex((p) => p.slug === slug)
  if (i === -1) return { newer: undefined, older: undefined }
  return { newer: posts[i - 1], older: posts[i + 1] }
}

/**
 * The post to feature on the home page: the first one flagged `featured`,
 * falling back to the newest post. `undefined` only if there are no posts.
 */
export const featuredPost: Post | undefined =
  posts.find((p) => p.featured) ?? posts[0]

/** Absolute canonical URL for a post. */
export function postUrl(slug: string): string {
  return `${SITE_URL}/blog/${slug}`
}

/** Max length for a page <title> before search engines truncate it. */
const MAX_TITLE_LENGTH = 70

/**
 * Build a post's document `<title>`.
 *
 * We prefer the fully branded form ("<title> | GeoSpoof Blog"), but search
 * engines truncate titles past ~70 characters, so we step down to a shorter
 * brand suffix — and finally to the bare title — to stay within budget. The
 * bare title already contains "GeoSpoof", so dropping the suffix loses no
 * brand signal. Applies to every post, so long titles can't regress.
 */
export function blogPageTitle(title: string): string {
  for (const suffix of [" | GeoSpoof Blog", " | GeoSpoof", ""]) {
    const candidate = `${title}${suffix}`
    if (candidate.length <= MAX_TITLE_LENGTH) return candidate
  }
  return title
}

/** Format an ISO date string as e.g. "June 11, 2026". */
export function formatDate(iso: string): string {
  // Parse as UTC noon to avoid timezone off-by-one-day shifts.
  const d = new Date(`${iso}T12:00:00Z`)
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  })
}
