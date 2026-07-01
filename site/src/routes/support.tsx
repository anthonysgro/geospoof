import * as React from "react"
import { createFileRoute } from "@tanstack/react-router"
import type { Locale } from "@/lib/i18n"
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
import { getDictionary, localizedPath } from "@/lib/i18n"

/** Build the `head` payload for the Support page in a given locale. */
export function buildSupportHead(locale: Locale) {
  const m = getDictionary(locale).support.meta
  const canonical = `${SITE_URL}${localizedPath("/support", locale)}`
  return {
    meta: [
      { title: m.title },
      { name: "description", content: m.description },
    ],
    links: [
      { rel: "canonical", href: canonical },
      { rel: "alternate", hrefLang: "en", href: `${SITE_URL}/support` },
      { rel: "alternate", hrefLang: "fr", href: `${SITE_URL}/fr/support` },
      { rel: "alternate", hrefLang: "x-default", href: `${SITE_URL}/support` },
    ],
  }
}

export const Route = createFileRoute("/support")({
  component: SupportPage,
  head: () => buildSupportHead("en"),
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
          ? "bg-(--color-brand)/10 text-(--color-brand)"
          : "bg-(--color-canvas-border) text-(--color-canvas-muted) hover:text-(--color-canvas-foreground)",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
      )}
      aria-label={t.support.copyAria}
    >
      {copied ? t.support.copied : t.support.copy}
    </button>
  )
}

export function SupportPage() {
  const { t } = useTranslations()
  const d = t.support
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          {/* Header */}
          <div className="mb-12 text-center">
            <h1 className="mb-4 text-4xl font-bold text-(--color-canvas-foreground)">
              {d.heading}
            </h1>
            <p className="text-body-lg text-(--color-canvas-muted)">
              {d.subhead}
            </p>
          </div>

          {/* FAQ — shadcn Accordion */}
          <div className="mb-16">
            <h2 className="mb-6 text-xl font-semibold text-(--color-canvas-foreground)">
              {d.commonIssues}
            </h2>
            <Accordion
              type="single"
              collapsible
              className="divide-y divide-(--color-canvas-border) overflow-hidden rounded-xl border border-(--color-canvas-border)"
            >
              {d.faqs.map((faq, i) => (
                <AccordionItem
                  key={i}
                  value={`faq-${i}`}
                  className="border-none px-5"
                >
                  <AccordionTrigger className="py-4 text-base font-semibold text-(--color-canvas-foreground) hover:no-underline">
                    {faq.q}
                  </AccordionTrigger>
                  <AccordionContent className="pb-5 leading-relaxed text-(--color-canvas-muted)">
                    {faq.a}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>

          <Separator className="mb-16 bg-(--color-canvas-border)" />

          {/* Contact */}
          <div className="text-center">
            <h2 className="mb-4 text-2xl font-bold text-(--color-canvas-foreground)">
              {d.stillNeedHelp}
            </h2>
            <p className="text-body-lg mx-auto mb-8 max-w-md text-(--color-canvas-muted)">
              {d.contactBody}
            </p>

            <div className="mb-4 inline-flex items-center gap-3">
              <a
                href="mailto:support@geospoof.com"
                className="text-xl font-semibold text-(--color-brand) hover:underline"
              >
                support@geospoof.com
              </a>
              <CopyEmailButton />
            </div>

            <p className="text-body-base text-(--color-canvas-muted)">
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
