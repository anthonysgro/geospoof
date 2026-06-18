import { defineCollection, defineConfig } from "@content-collections/core"
import { compileMDX } from "@content-collections/mdx"
import remarkGfm from "remark-gfm"
import { z } from "zod"

/**
 * Blog posts collection.
 *
 * Posts live in `content/blog/*.mdx`. The file name (minus extension) becomes
 * the URL slug, e.g. `content/blog/hello-world.mdx` -> `/blog/hello-world`.
 *
 * Frontmatter is validated against the schema below at build time, so a typo
 * in a date or a missing description fails the build instead of shipping a
 * broken page. The body is compiled to an MDX component string we render with
 * `<MDXContent />`.
 */
const posts = defineCollection({
  name: "posts",
  directory: "content/blog",
  include: "**/*.mdx",
  schema: z.object({
    /** Page <title> + H1. Keep under ~60 chars for clean search snippets. */
    title: z.string(),
    /** Meta description + listing summary. Aim for 120–160 characters. */
    description: z.string(),
    /** Publish date, ISO 8601 (e.g. "2026-06-11"). */
    date: z.string(),
    /** Optional last-updated date, ISO 8601. */
    updated: z.string().optional(),
    /** Author display name. */
    author: z.string().default("Anthony Sgro"),
    /** Short topical tags shown as badges. */
    tags: z.array(z.string()).default([]),
    /** SEO keywords emitted in the meta keywords tag. */
    keywords: z.array(z.string()).default([]),
    /**
     * One- or two-sentence direct answer to the post's core question, shown in
     * a highlighted block near the top. This is the snippet AI answer engines
     * are most likely to lift, so make it self-contained.
     */
    answer: z.string().optional(),
    /**
     * Frequently-asked questions rendered as a visible FAQ section at the foot
     * of the post AND emitted as FAQPage structured data (JSON-LD). This is the
     * highest-leverage SEO surface for comparison / "X vs Y" posts: it targets
     * People-Also-Ask boxes and long-tail question queries. Phrase each
     * `question` exactly as a searcher would type it; keep each `answer`
     * self-contained (1–3 sentences, plain text — no Markdown).
     */
    faq: z
      .array(
        z.object({
          question: z.string(),
          answer: z.string(),
        })
      )
      .default([]),
    /**
     * Cover image, shown on the listing card and at the top of the post.
     * Path is relative to the site root, e.g. "/images/blog/my-post.svg".
     */
    cover: z.string().optional(),
    /** Alt text for the cover image (describe it for screen readers + SEO). */
    coverAlt: z.string().optional(),
    /** Set true to hide from the index and exclude from the sitemap. */
    draft: z.boolean().default(false),
    /** Set true to surface this post in the home page's featured section. */
    featured: z.boolean().default(false),
    /** Raw MDX body (populated by Content Collections). */
    content: z.string(),
  }),
  transform: async (document, context) => {
    const mdx = await compileMDX(context, document, {
      remarkPlugins: [remarkGfm],
    })

    // Derive the URL slug from the file path (strip directories + extension).
    const slug = document._meta.path

    // Rough reading-time estimate at ~200 wpm from the raw MDX body.
    const words = document.content.trim().split(/\s+/).length
    const readingTime = Math.max(1, Math.round(words / 200))

    return {
      ...document,
      mdx,
      slug,
      readingTime,
    }
  },
})

export default defineConfig({
  content: [posts],
})
