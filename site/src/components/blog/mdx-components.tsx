import * as React from "react"
import type { Platform } from "@/hooks/use-platform"
import type { BrowserLogoName } from "@/components/BrowserLogo"
import { cn } from "@/lib/utils"
import { usePlatform } from "@/hooks/use-platform"
import { BrowserLogo } from "@/components/BrowserLogo"

/** Recursively extract the plain-text content of a React node, for slug ids. */
function nodeText(node: React.ReactNode): string {
  if (node == null || typeof node === "boolean") return ""
  if (typeof node === "string" || typeof node === "number") return String(node)
  if (Array.isArray(node)) return node.map(nodeText).join("")
  if (React.isValidElement(node)) {
    return nodeText((node.props as { children?: React.ReactNode }).children)
  }
  return ""
}

/** GitHub-style slug: lowercase, strip punctuation, collapse spaces to dashes. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

/**
 * Heading with a stable, deep-linkable `id` derived from its text and a “#”
 * anchor that appears on hover/focus. Sections become shareable URLs and the
 * existing `scroll-mt` offset keeps the target clear of the sticky nav.
 */
function Heading({
  as: Tag,
  className,
  children,
  ...props
}: { as: "h2" | "h3" } & React.ComponentProps<"h2">) {
  const id = props.id ?? slugify(nodeText(children))
  return (
    <Tag id={id} className={cn("group relative", className)} {...props}>
      <a
        href={`#${id}`}
        aria-label="Direct link to this section"
        className="absolute top-1/2 -left-5 hidden -translate-y-1/2 text-(--color-canvas-muted) no-underline opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 lg:inline"
      >
        #
      </a>
      {children}
    </Tag>
  )
}

/**
 * Theme-aware screenshot. Renders both the light and dark variant and lets CSS
 * pick which one shows, keyed off the `.dark` class the theme script puts on
 * <html>. No JS / hydration dance — both <img> tags are in the DOM and the
 * dark-mode variant only swaps in visually. Use in MDX as:
 *
 *   <ThemeImage light="/a-light.jpg" dark="/a-dark.jpg" alt="..." caption="..." />
 */
export function ThemeImage({
  light,
  dark,
  alt,
  caption,
  wrapperClassName,
}: {
  light: string
  dark: string
  alt: string
  caption?: string
  wrapperClassName?: string
}) {
  // The screenshots share the page's canvas background, so on their own they
  // melt into the page. Sitting them on a `card` surface (a different token
  // from `canvas` in both themes) with padding, a border and a soft shadow
  // frames each one as a distinct, lifted panel.
  const imgClass = "block h-auto w-full rounded-sm-brand"
  return (
    <span className={cn("my-6 block", wrapperClassName)}>
      <span className="block overflow-hidden rounded-md-brand border border-(--color-canvas-border) bg-card p-2 shadow-md ring-1 ring-black/5 sm:p-3 dark:ring-white/10">
        <img
          src={light}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(imgClass, "dark:hidden")}
        />
        <img
          src={dark}
          alt={alt}
          loading="lazy"
          decoding="async"
          className={cn(imgClass, "hidden dark:block")}
        />
      </span>
      {caption && (
        <span className="text-small mt-2 block text-center text-(--color-canvas-muted)">
          {caption}
        </span>
      )}
    </span>
  )
}

/**
 * Side-by-side comparison of a GeoSpoof screenshot against a competitor's, each
 * theme-aware. Stacks on narrow screens, two columns from `sm` up. Use as:
 *
 *   <Compare
 *     leftLabel="Geoceptor"  leftLight="..."  leftDark="..."
 *     rightLabel="GeoSpoof"  rightLight="..." rightDark="..."
 *     alt="What both screens show"
 *     caption="Optional shared caption below the pair"
 *   />
 */
export function Compare({
  leftLabel,
  leftLight,
  leftDark,
  rightLabel,
  rightLight,
  rightDark,
  alt,
  caption,
}: {
  leftLabel: string
  leftLight: string
  leftDark: string
  rightLabel: string
  rightLight: string
  rightDark: string
  alt: string
  caption?: string
}) {
  const figure = (label: string, light: string, dark: string) => (
    <span className="block">
      <span className="text-small mb-2 block text-center font-semibold text-(--color-canvas-foreground)">
        {label}
      </span>
      <ThemeImage
        light={light}
        dark={dark}
        alt={`${label}: ${alt}`}
        wrapperClassName="my-0"
      />
    </span>
  )
  return (
    // Break out of the article's narrow (720px) text column so the paired
    // screenshots render large enough to read. The text stays at a comfortable
    // reading width; only the figure widens — centered on the viewport via
    // `ml-[50%]` + `-translate-x-1/2` — up to the same 1200px the wide page
    // sections use. Gated at `lg` because narrower viewports have no room to
    // gain (and the panes stack on mobile anyway).
    <span className="my-6 block lg:ml-[50%] lg:w-[min(75rem,92vw)] lg:-translate-x-1/2">
      <span className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {figure(leftLabel, leftLight, leftDark)}
        {figure(rightLabel, rightLight, rightDark)}
      </span>
      {caption && (
        <span className="text-small mt-3 block text-center text-(--color-canvas-muted)">
          {caption}
        </span>
      )}
    </span>
  )
}

/**
 * Two plain (non-theme-aware) images shown side by side — built for the small
 * extension-popup screenshots, which only exist as single PNGs. Always two
 * columns so the pair reads as a direct comparison, each image framed like
 * `ThemeImage` and capped so the tall popups stay compact and centered. Use as:
 *
 *   <ImagePair
 *     leftLabel="GeoSpoof"  leftSrc="/a.png"
 *     rightLabel="Spoof Geolocation"  rightSrc="/b.png"
 *     alt="What both screens show"
 *     caption="Optional shared caption"
 *   />
 */
export function ImagePair({
  leftLabel,
  leftSrc,
  rightLabel,
  rightSrc,
  alt,
  caption,
}: {
  leftLabel: string
  leftSrc: string
  rightLabel: string
  rightSrc: string
  alt: string
  caption?: string
}) {
  const figure = (label: string, src: string) => (
    <span className="block">
      <span className="text-small mb-2 block text-center font-semibold text-(--color-canvas-foreground)">
        {label}
      </span>
      <span className="block overflow-hidden rounded-md-brand border border-(--color-canvas-border) bg-card p-2 shadow-md ring-1 ring-black/5 sm:p-3 dark:ring-white/10">
        <img
          src={src}
          alt={`${label}: ${alt}`}
          loading="lazy"
          decoding="async"
          className="mx-auto block h-auto w-full max-w-65 rounded-sm-brand"
        />
      </span>
    </span>
  )
  return (
    <span className="mx-auto my-6 block max-w-160">
      <span className="grid grid-cols-2 gap-4">
        {figure(leftLabel, leftSrc)}
        {figure(rightLabel, rightSrc)}
      </span>
      {caption && (
        <span className="text-small mt-3 block text-center text-(--color-canvas-muted)">
          {caption}
        </span>
      )}
    </span>
  )
}

/**
 * Element styling for rendered MDX blog content.
 *
 * These map the raw HTML tags MDX produces (h2, p, ul, a, code, ...) onto the
 * site's design tokens so posts match the look of the Privacy / Terms pages.
 * Passed to `<MDXContent components={mdxComponents} />`.
 */
/**
 * Official Apple "Download on the App Store" / "Download on the Mac App Store"
 * badges for use in blog posts. Reuses the same assets and universal listing
 * (id 6765719745; mt=8 → iOS/iPadOS, mt=12 → Mac) as the landing page so the
 * branding stays compliant with Apple's marketing guidelines. The `campaign`
 * prop feeds App Store Connect's `ct` attribution token.
 */
export function AppStoreBadges({ campaign = "blog" }: { campaign?: string }) {
  const base =
    "https://apps.apple.com/app/apple-store/id6765719745?pt=128299974"
  const linkClass =
    "transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand) focus-visible:ring-offset-2 rounded-md-brand"
  return (
    <span className="my-6 flex flex-wrap items-center justify-center gap-4">
      <a
        href={`${base}&ct=${campaign}&mt=8`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download on the App Store"
        className={linkClass}
      >
        <img
          src="/images/stores/ios-store-icon.svg"
          alt="Download on the App Store"
          className="h-12 w-auto"
        />
      </a>
      <a
        href={`${base}&ct=${campaign}&mt=12`}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Download on the Mac App Store"
        className={linkClass}
      >
        <img
          src="/images/stores/mac-store-icon.svg"
          alt="Download on the Mac App Store"
          className="h-12 w-auto"
        />
      </a>
    </span>
  )
}

/**
 * Platform-aware download row for blog posts. GeoSpoof ships on Firefox, Chrome
 * (Brave/Edge), and the App Store (iOS/iPadOS + macOS Safari); this surfaces all
 * three and highlights — and reorders to the front — the store matching the
 * visitor's browser. Reuses the same store URLs and brand icons as the home
 * page's download section so links stay in one mental model. `campaign` feeds
 * the UTM / App Store attribution token.
 *
 * Built from inline-level spans (styled as blocks) because MDX may wrap a
 * standalone component in a paragraph; block <div>s there would be invalid
 * nesting — same defensive pattern as ThemeImage / Compare above.
 */
function DownloadCTA({ campaign = "blog" }: { campaign?: string }) {
  const platform = usePlatform()

  const stores: Array<{
    platform: Exclude<Platform, "unknown">
    name: string
    detail: string
    logo: BrowserLogoName
    cta: string
    href: string
  }> = [
    {
      platform: "firefox",
      name: "Firefox",
      detail: "Desktop & Android",
      logo: "firefox",
      cta: "Add to Firefox",
      href: `https://addons.mozilla.org/firefox/addon/geo-spoof/?utm_source=geospoof.com&utm_medium=blog&utm_campaign=${campaign}`,
    },
    {
      platform: "chromium",
      name: "Chrome",
      detail: "Chrome, Brave & Edge",
      logo: "chrome",
      cta: "Add to Chrome",
      href: `https://chromewebstore.google.com/detail/geospoof/dgdbdodafgaeifgajaajohkjjgobcgje?utm_source=geospoof.com&utm_medium=blog&utm_campaign=${campaign}`,
    },
    {
      platform: "apple",
      name: "iPhone, iPad & Mac",
      detail: "Safari via the App Store",
      logo: "safari",
      cta: "Get on the App Store",
      href: `https://apps.apple.com/app/apple-store/id6765719745?pt=128299974&ct=${campaign}&mt=8`,
    },
  ]

  const recommended = stores.find((s) => s.platform === platform)
  // Recommended store first after hydration; stable order on the server (where
  // platform is "unknown") so markup matches and hydration doesn't warn.
  const ordered = recommended
    ? [recommended, ...stores.filter((s) => s !== recommended)]
    : stores

  return (
    <span className="my-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
      {ordered.map((s) => {
        const isRecommended = s === recommended
        return (
          <a
            key={s.platform}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "relative flex flex-col items-center gap-2 rounded-md-brand border p-4 text-center no-underline!",
              "transition-all duration-200 hover:border-(--color-brand) hover:shadow-md",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)",
              isRecommended
                ? "border-(--color-brand) ring-1 ring-brand/40"
                : "border-(--color-canvas-border)"
            )}
          >
            {isRecommended && (
              <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-(--color-brand) px-2 py-0.5 text-xs font-semibold text-white">
                Your browser
              </span>
            )}
            <BrowserLogo name={s.logo} className="size-10" />
            <span className="text-sm font-bold text-(--color-canvas-foreground)">
              {s.name}
            </span>
            <span className="text-xs text-(--color-canvas-muted)">
              {s.detail}
            </span>
            <span className="mt-1 inline-block text-xs font-semibold text-(--color-brand)">
              {s.cta} →
            </span>
          </a>
        )
      })}
    </span>
  )
}

export const mdxComponents = {
  ThemeImage,
  Compare,
  ImagePair,
  AppStoreBadges,
  DownloadCTA,
  h2: (props: React.ComponentProps<"h2">) => (
    <Heading
      as="h2"
      className="mt-12 mb-4 scroll-mt-24 text-2xl font-bold text-(--color-canvas-foreground)"
      {...props}
    />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <Heading
      as="h3"
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
      className="my-6 overflow-x-auto rounded-md-brand border border-(--color-canvas-border) bg-canvas-border/40 p-4 text-sm [&_code]:bg-transparent [&_code]:p-0"
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
        className="mx-auto block h-auto max-w-full rounded-md-brand border border-(--color-canvas-border)"
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
