import * as React from "react"
import { cn } from "@/lib/utils"

/**
 * Element styling for rendered MDX blog content.
 *
 * These map the raw HTML tags MDX produces (h2, p, ul, a, code, ...) onto the
 * site's design tokens so posts match the look of the Privacy / Terms pages.
 * Passed to `<MDXContent components={mdxComponents} />`.
 */
export const mdxComponents = {
  h2: (props: React.ComponentProps<"h2">) => (
    <h2
      className="mt-12 mb-4 scroll-mt-24 text-2xl font-bold text-(--color-canvas-foreground)"
      {...props}
    />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3
      className="mt-8 mb-3 scroll-mt-24 text-xl font-semibold text-(--color-canvas-foreground)"
      {...props}
    />
  ),
  h4: (props: React.ComponentProps<"h4">) => (
    <h4
      className="mt-6 mb-2 text-lg font-semibold text-(--color-canvas-foreground)"
      {...props}
    />
  ),
  p: (props: React.ComponentProps<"p">) => (
    <p className="text-body-base my-4 text-(--color-canvas-muted)" {...props} />
  ),
  ul: (props: React.ComponentProps<"ul">) => (
    <ul
      className="text-body-base my-4 list-disc space-y-2 pl-6 text-(--color-canvas-muted)"
      {...props}
    />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol
      className="text-body-base my-4 list-decimal space-y-2 pl-6 text-(--color-canvas-muted)"
      {...props}
    />
  ),
  li: (props: React.ComponentProps<"li">) => (
    <li className="leading-relaxed" {...props} />
  ),
  a: (props: React.ComponentProps<"a">) => {
    const href = props.href ?? ""
    const isExternal = /^https?:\/\//.test(href)
    return (
      <a
        className="font-medium text-(--color-brand) underline-offset-2 hover:underline"
        {...(isExternal
          ? { target: "_blank", rel: "noopener noreferrer" }
          : {})}
        {...props}
      />
    )
  },
  strong: (props: React.ComponentProps<"strong">) => (
    <strong
      className="font-semibold text-(--color-canvas-foreground)"
      {...props}
    />
  ),
  blockquote: (props: React.ComponentProps<"blockquote">) => (
    <blockquote
      className="my-6 border-l-4 border-(--color-brand) pl-4 text-(--color-canvas-muted) italic"
      {...props}
    />
  ),
  code: (props: React.ComponentProps<"code">) => (
    <code
      className="rounded bg-(--color-canvas-border) px-1.5 py-0.5 text-sm text-(--color-canvas-foreground)"
      {...props}
    />
  ),
  pre: (props: React.ComponentProps<"pre">) => (
    <pre
      className="my-6 overflow-x-auto rounded-[var(--radius-md-brand)] border border-(--color-canvas-border) bg-(--color-canvas-border)/40 p-4 text-sm [&_code]:bg-transparent [&_code]:p-0"
      {...props}
    />
  ),
  hr: (props: React.ComponentProps<"hr">) => (
    <hr className="my-10 border-(--color-canvas-border)" {...props} />
  ),
  table: (props: React.ComponentProps<"table">) => (
    <div className="my-6 overflow-x-auto">
      <table
        className={cn(
          "w-full border-collapse text-left text-sm",
          "[&_td]:border [&_td]:border-(--color-canvas-border) [&_td]:p-2 [&_td]:align-top",
          "[&_th]:border [&_th]:border-(--color-canvas-border) [&_th]:p-2 [&_th]:font-semibold [&_th]:text-(--color-canvas-foreground)"
        )}
        {...props}
      />
    </div>
  ),
  img: ({ title, ...props }: React.ComponentProps<"img">) => {
    // Markdown wraps standalone images in a <p>, so everything here must be
    // inline-level (spans styled as block) to avoid invalid nesting / hydration
    // warnings. A markdown title — `![alt](src "Caption")` — renders as a caption.
    // Images are centered and capped at their intrinsic size (never upscaled to
    // full width) so small square memes stay crisp instead of stretching blurry.
    const image = (
      <img
        className="mx-auto block h-auto max-w-full rounded-[var(--radius-md-brand)] border border-(--color-canvas-border)"
        loading="lazy"
        {...props}
      />
    )
    return (
      <span className="my-6 block">
        {image}
        {title && (
          <span className="text-small mt-2 block text-center text-(--color-canvas-muted)">
            {title}
          </span>
        )}
      </span>
    )
  },
}
