import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import { ChevronRight, ExternalLink, Lightbulb, Star } from "lucide-react"
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
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import { SITE_URL } from "@/lib/blog"
import { useTranslations } from "@/hooks/use-i18n"

const GITHUB_REPO = "anthonysgro/geospoof"
const LATEST_RELEASE_URL = `https://github.com/${GITHUB_REPO}/releases/latest`
const TZP_TEST_URL = "https://arkenfox.github.io/TZP/tzp.html"
/** Freshness signal for the troubleshooting content. Update when steps change. */
const LAST_UPDATED = "July 2026"

/** Matches code-adjacent tokens: about:* pages and privacy.* prefs. */
const CODE_TOKEN = /(about:[a-zA-Z]+|privacy\.[a-zA-Z.]+)/g

/**
 * Wrap code-adjacent tokens (e.g. `about:config`, `privacy.resistFingerprinting`)
 * in a styled inline <code> so they read as code rather than prose.
 */
function withCode(text: string): React.ReactNode {
  return text.split(CODE_TOKEN).map((part, i) =>
    /^(about:[a-zA-Z]+|privacy\.[a-zA-Z.]+)$/.test(part) ? (
      <code
        key={i}
        className="rounded bg-(--color-canvas-border) px-1 py-0.5 font-mono text-[0.85em] text-(--color-canvas-foreground)"
      >
        {part}
      </code>
    ) : (
      <React.Fragment key={i}>{part}</React.Fragment>
    )
  )
}

/** Build the `head` payload for the Support page in a given locale. */
export function buildSupportHead(locale: Locale) {
  const m = getDictionary(locale).support.meta
  const canonical = `${SITE_URL}${localizedPath("/support", locale)}`
  return {
    meta: [
      { title: m.title },
      { name: "description", content: m.description },
      ...buildOgLocaleMeta(locale),
    ],
    links: [
      { rel: "canonical", href: canonical },
      ...buildAlternateLinks("/support", SITE_URL),
    ],
  }
}

export const Route = createFileRoute("/{-$locale}/support")({
  component: SupportPage,
  head: ({ params }) => buildSupportHead(toLocale(params.locale)),
})

function CopyEmailButton() {
  const { t } = useTranslations()
  const [copied, setCopied] = React.useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText("support@geospoof.com")
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={cn(
        "inline-flex items-center gap-1 rounded-md px-3 py-1.5",
        "text-sm font-medium transition-colors",
        copied
          ? "bg-brand/10 text-(--color-brand)"
          : "bg-(--color-canvas-border) text-(--color-canvas-muted) hover:text-(--color-canvas-foreground)",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
      )}
      aria-label={t.support.copyAria}
    >
      {copied ? t.support.copied : t.support.copy}
    </button>
  )
}

/**
 * Link to the newest GitHub release. Renders a stable link to
 * `/releases/latest` immediately (works during SSR and if the network call
 * fails), then progressively enhances the label with the live version tag
 * fetched from the GitHub API.
 */
function LatestReleaseLink({ label, cta }: { label: string; cta: string }) {
  const [version, setVersion] = React.useState<string | null>(null)

  React.useEffect(() => {
    const controller = new AbortController()
    fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" },
      signal: controller.signal,
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { tag_name?: string } | null) => {
        if (data?.tag_name) setVersion(data.tag_name)
      })
      .catch(() => {
        /* leave the fallback link as-is */
      })
    return () => controller.abort()
  }, [])

  return (
    <a
      href={LATEST_RELEASE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-(--color-brand) hover:underline"
    >
      {version ? `${label}: ${version}` : cta}
      <ExternalLink className="size-3.5" aria-hidden="true" />
    </a>
  )
}

export function SupportPage() {
  const { t } = useTranslations()
  const d = t.support

  // Open a targeted FAQ item when the page is opened with a #faq-<id> hash
  // (from the symptom chooser or a shared deep link).
  const [openFaq, setOpenFaq] = React.useState<string>("")
  React.useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace(/^#/, "")
      if (hash.startsWith("faq-")) setOpenFaq(hash.slice("faq-".length))
    }
    applyHash()
    window.addEventListener("hashchange", applyHash)
    return () => window.removeEventListener("hashchange", applyHash)
  }, [])

  // FAQPage structured data so search engines and assistants can extract Q&A.
  const faqJsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: d.faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: { "@type": "Answer", text: faq.a },
    })),
  })

  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: faqJsonLd }}
      />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          {/* Header */}
          <div className="mb-10 text-center">
            <h1 className="mb-3 text-3xl font-bold text-(--color-canvas-foreground)">
              {d.heading}
            </h1>
            <p className="mx-auto max-w-2xl text-sm text-(--color-canvas-muted)">
              {d.subhead}
            </p>
          </div>

          {/* Symptom chooser — self-routing to the relevant section */}
          <nav
            aria-label={d.symptomsLead}
            className="mb-12 rounded-xl border border-(--color-canvas-border) p-4"
          >
            <p className="mb-3 text-xs font-semibold tracking-wide text-(--color-canvas-muted) uppercase">
              {d.symptomsLead}
            </p>
            <ul className="space-y-1">
              {d.symptoms.map((symptom, i) => (
                <li key={i}>
                  <a
                    href={`#${symptom.target}`}
                    className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm font-medium text-(--color-canvas-foreground) hover:bg-(--color-canvas-border)"
                  >
                    <span>{symptom.label}</span>
                    <ChevronRight
                      className="size-4 shrink-0 text-(--color-canvas-muted)"
                      aria-hidden="true"
                    />
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {/* Troubleshooting — ordered diagnostic list */}
          <div id="troubleshooting" className="mb-16 scroll-mt-24">
            <h2 className="text-lg font-semibold text-(--color-canvas-foreground)">
              {d.troubleshooting.title}
            </h2>
            <p className="mb-3 text-sm text-(--color-canvas-muted)">
              {d.troubleshooting.intro}
            </p>
            <p className="mb-2 border-l-2 border-(--color-canvas-border) pl-3 text-sm text-(--color-canvas-muted)">
              {d.troubleshooting.browserNote}
            </p>
            <p className="mb-6 text-xs text-(--color-canvas-muted)">
              {d.lastUpdatedLabel}: {LAST_UPDATED}
            </p>

            <ol className="space-y-3">
              {d.troubleshooting.steps.map((step, si) => (
                <li
                  key={si}
                  id={`step-${si + 1}`}
                  className={cn(
                    "flex scroll-mt-24 gap-3 rounded-xl border p-4",
                    step.featured
                      ? "border-(--color-brand)/40 bg-brand/5"
                      : "border-(--color-canvas-border)"
                  )}
                >
                  <span
                    className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand/10 text-xs font-semibold text-(--color-brand)"
                    aria-hidden="true"
                  >
                    {si + 1}
                  </span>
                  <div className="min-w-0">
                    {step.featured ? (
                      <p className="mb-1 inline-flex items-center gap-1 text-xs font-semibold tracking-wide text-(--color-brand) uppercase">
                        <Star
                          className="size-3.5 fill-current"
                          aria-hidden="true"
                        />
                        {d.troubleshooting.featuredLabel}
                      </p>
                    ) : null}
                    <h3 className="mb-1 text-sm font-semibold text-(--color-canvas-foreground)">
                      {withCode(step.title)}
                    </h3>
                    <p className="text-sm leading-relaxed text-(--color-canvas-muted)">
                      {withCode(step.body)}
                    </p>
                    {step.action === "geolocationDenied" ? (
                      <figure className="mt-3">
                        <img
                          src="/images/support/geolocation-denied.png"
                          alt={d.troubleshooting.geolocationDeniedAlt}
                          width={678}
                          height={186}
                          loading="lazy"
                          decoding="async"
                          className="w-full max-w-md rounded-lg border border-(--color-canvas-border)"
                        />
                        <figcaption className="mt-1.5 text-xs text-(--color-canvas-muted)">
                          {d.troubleshooting.geolocationDeniedCaption}
                        </figcaption>
                      </figure>
                    ) : null}
                    {step.action === "badgeCheck" ? (
                      <div className="mt-3 flex flex-wrap gap-3">
                        <figure className="flex items-center gap-2.5 rounded-lg border border-(--color-canvas-border) px-3 py-2">
                          <img
                            src="/images/support/extension-badge-active.png"
                            alt={d.troubleshooting.badgeActiveAlt}
                            width={34}
                            height={34}
                            loading="lazy"
                            decoding="async"
                            className="size-[34px] shrink-0"
                          />
                          <figcaption className="text-sm font-medium text-(--color-canvas-foreground)">
                            {d.troubleshooting.badgeActiveLabel}
                          </figcaption>
                        </figure>
                        <figure className="flex items-center gap-2.5 rounded-lg border border-(--color-canvas-border) px-3 py-2">
                          <img
                            src="/images/support/extension-badge-disabled.png"
                            alt={d.troubleshooting.badgeDisabledAlt}
                            width={34}
                            height={34}
                            loading="lazy"
                            decoding="async"
                            className="size-[34px] shrink-0"
                          />
                          <figcaption className="text-sm font-medium text-(--color-canvas-muted)">
                            {d.troubleshooting.badgeDisabledLabel}
                          </figcaption>
                        </figure>
                      </div>
                    ) : null}
                    {step.details.length > 0 ? (
                      <ul className="mt-2.5 space-y-1.5">
                        {step.details.map((detail, di) => (
                          <li
                            key={di}
                            className="flex gap-2 text-sm text-(--color-canvas-muted)"
                          >
                            <span
                              className="mt-2 size-1 shrink-0 rounded-full bg-(--color-canvas-muted)"
                              aria-hidden="true"
                            />
                            <span>{withCode(detail)}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    {step.action === "geolocationDenied" ? (
                      <figure className="mt-3">
                        <img
                          src="/images/support/preserve-location-prompts-off.png"
                          alt={d.troubleshooting.preserveOffAlt}
                          width={644}
                          height={170}
                          loading="lazy"
                          decoding="async"
                          className="w-full max-w-md rounded-lg border border-(--color-canvas-border)"
                        />
                        <figcaption className="mt-1.5 text-xs text-(--color-canvas-muted)">
                          {d.troubleshooting.preserveOffCaption}
                        </figcaption>
                      </figure>
                    ) : null}
                    {step.note ? (
                      <div className="mt-3 flex gap-2 rounded-lg bg-brand/5 p-3">
                        <Lightbulb
                          className="mt-0.5 size-3.5 shrink-0 text-(--color-brand)"
                          aria-hidden="true"
                        />
                        <p className="text-sm leading-relaxed text-(--color-canvas-foreground)">
                          {withCode(step.note)}
                        </p>
                      </div>
                    ) : null}
                    {step.action === "latestRelease" ? (
                      <LatestReleaseLink
                        label={d.troubleshooting.latestReleaseLabel}
                        cta={d.troubleshooting.latestReleaseCta}
                      />
                    ) : null}
                    {step.action === "tzpTest" ? (
                      <a
                        href={TZP_TEST_URL}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-(--color-brand) hover:underline"
                      >
                        {d.troubleshooting.tzpCta}
                        <ExternalLink className="size-3.5" aria-hidden="true" />
                      </a>
                    ) : null}
                  </div>
                </li>
              ))}
            </ol>
          </div>

          <Separator className="mb-16 bg-(--color-canvas-border)" />

          {/* FAQ — shadcn Accordion */}
          <div id="questions" className="mb-16 scroll-mt-24">
            <h2 className="mb-5 text-lg font-semibold text-(--color-canvas-foreground)">
              {d.commonIssues}
            </h2>
            <Accordion
              type="single"
              collapsible
              value={openFaq}
              onValueChange={setOpenFaq}
              className="divide-y divide-(--color-canvas-border) overflow-hidden rounded-xl border border-(--color-canvas-border)"
            >
              {d.faqs.map((faq) => (
                <AccordionItem
                  key={faq.id}
                  id={`faq-${faq.id}`}
                  value={faq.id}
                  className="scroll-mt-24 border-none px-5"
                >
                  <AccordionTrigger className="py-4 text-sm font-semibold text-(--color-canvas-foreground) hover:no-underline">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 text-sm leading-relaxed text-(--color-canvas-muted)">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <Separator className="mb-16 bg-(--color-canvas-border)" />

          {/* Contact */}
          <div id="contact" className="scroll-mt-24 text-center">
            <h2 className="mb-3 text-xl font-bold text-(--color-canvas-foreground)">
              {d.stillNeedHelp}
            </h2>
            <p className="mx-auto mb-6 max-w-md text-sm text-(--color-canvas-muted)">
              {d.contactBody}
            </p>

            <div className="mb-6 inline-flex items-center gap-3">
              <a
                href="mailto:support@geospoof.com"
                className="text-base font-semibold text-(--color-brand) hover:underline"
              >
                support@geospoof.com
              </a>
              <CopyEmailButton />
            </div>

            <div className="mx-auto mb-8 max-w-md rounded-xl border border-(--color-canvas-border) p-4 text-left">
              <p className="mb-2 text-sm font-medium text-(--color-canvas-foreground)">
                {d.contactChecklistLead}
              </p>
              <ul className="space-y-1.5">
                {d.contactChecklist.map((item, i) => (
                  <li
                    key={i}
                    className="flex gap-2 text-sm text-(--color-canvas-muted)"
                  >
                    <span
                      className="mt-2 size-1 shrink-0 rounded-full bg-(--color-canvas-muted)"
                      aria-hidden="true"
                    />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-sm text-(--color-canvas-muted)">
              {d.reportBugsLead}
              <a
                href="https://github.com/anthonysgro/geospoof/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="text-(--color-brand) hover:underline"
              >
                GitHub
              </a>
              .
            </p>
          </div>
        </Section>
      </main>
      <Footer />
    </div>
  )
}
