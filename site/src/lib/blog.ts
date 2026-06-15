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
 * The post to feature on the home page: the first one flagged `featured`,
 * falling back to the newest post. `undefined` only if there are no posts.
 */
export const featuredPost: Post | undefined =
  posts.find((p) => p.featured) ?? posts[0]

/** Absolute canonical URL for a post. */
export function postUrl(slug: string): string {
  return `${SITE_URL}/blog/${slug}`
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
