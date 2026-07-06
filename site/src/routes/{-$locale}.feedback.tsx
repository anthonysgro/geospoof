import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Check, Copy, Heart, Mail } from "lucide-react"
import type { Locale } from "@/lib/i18n"
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
import { cn } from "@/lib/utils"
import { SITE_URL } from "@/lib/blog"
import { useTranslations } from "@/hooks/use-i18n"

/** The single inbox this page points visitors at. */
const FEEDBACK_EMAIL = "feedback@geospoof.com"

/**
 * Build the `head` payload for the Feedback page in a given locale: localized
 * title/description/OG + self-canonical + hreflang cluster (same pattern as
 * the About and Support pages).
 */
export function buildFeedbackHead(locale: Locale) {
  const m = getDictionary(locale).feedback.meta
  const canonical = `${SITE_URL}${localizedPath("/feedback", locale)}`
  return {
    meta: [
      { title: m.title },
      { name: "description", content: m.description },
      ...buildOgLocaleMeta(locale),
      { property: "og:url", content: canonical },
      { property: "og:title", content: m.ogTitle },
      { property: "og:description", content: m.description },
      { name: "twitter:url", content: canonical },
      { name: "twitter:title", content: m.ogTitle },
      { name: "twitter:description", content: m.description },
    ],
    links: [
      { rel: "canonical", href: canonical },
      ...buildAlternateLinks("/feedback", SITE_URL),
    ],
  }
}

export const Route = createFileRoute("/{-$locale}/feedback")({
  component: FeedbackPage,
  head: ({ params }) => buildFeedbackHead(toLocale(params.locale)),
})

/**
 * A copyable block showing the feedback address. Clicking the address opens the
 * visitor's mail app (mailto); the Copy button writes it to the clipboard and
 * confirms with a transient "Copied" state, so it's useful with or without a
 * configured mail client.
 */
function CopyableEmail() {
  const { t } = useTranslations()
  const d = t.feedback
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(FEEDBACK_EMAIL)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable — the mailto link still works */
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <p className="mb-2 text-sm font-medium text-(--color-canvas-foreground)">
        {d.emailLabel}
      </p>
      <div className="flex flex-col gap-2 rounded-xl border border-(--color-canvas-border) p-2 sm:flex-row sm:items-center">
        <a
          href={`mailto:${FEEDBACK_EMAIL}`}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-base font-semibold text-(--color-brand) hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
        >
          <Mail className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{FEEDBACK_EMAIL}</span>
        </a>
        <button
          type="button"
          onClick={handleCopy}
          className={cn(
            "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-4 py-2",
            "text-sm font-medium transition-colors",
            copied
              ? "bg-brand/10 text-(--color-brand)"
              : "bg-(--color-canvas-border) text-(--color-canvas-muted) hover:text-(--color-canvas-foreground)",
            "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
          )}
          aria-label={d.copyAria}
        >
          {copied ? (
            <Check className="size-4" aria-hidden="true" />
          ) : (
            <Copy className="size-4" aria-hidden="true" />
          )}
          {copied ? d.copied : d.copy}
        </button>
      </div>
      <p className="mt-2 text-xs text-(--color-canvas-muted)">{d.emailHint}</p>
    </div>
  )
}

export function FeedbackPage() {
  const { t } = useTranslations()
  const d = t.feedback

  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          <div className="text-center">
            <span
              className="mx-auto mb-6 inline-flex size-14 items-center justify-center rounded-full bg-brand/10 text-(--color-brand)"
              aria-hidden="true"
            >
              <Heart className="size-7" />
            </span>
            <h1 className="mb-4 text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
              {d.heading}
            </h1>
            <p className="text-body-lg mx-auto mb-10 max-w-2xl leading-relaxed text-(--color-canvas-muted)">
              {d.subhead}
            </p>
          </div>

          <CopyableEmail />

          <p className="mt-10 text-center text-sm text-(--color-canvas-muted)">
            {d.closing}
          </p>
        </Section>
      </main>
      <Footer />
    </div>
  )
}
