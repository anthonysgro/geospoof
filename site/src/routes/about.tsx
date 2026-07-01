import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import type { Locale } from "@/lib/i18n"
import { LocaleLink } from "@/components/LocaleLink"
import { Navigation } from "@/components/landing/Navigation"
import { Footer } from "@/components/landing/Footer"
import { SkipLink } from "@/components/landing/SkipLink"
import { Section } from "@/components/landing/Section"
import { cn } from "@/lib/utils"
import { SITE_URL } from "@/lib/blog"
import { useTranslations } from "@/hooks/use-i18n"
import { buildOgLocaleMeta, getDictionary, localizedPath } from "@/lib/i18n"

const GITHUB_PROFILE = "https://github.com/anthonysgro"
const LINKEDIN_URL = "https://www.linkedin.com/in/sgro"

/**
 * Build the `head` payload for the About page in a given locale: localized
 * title/description/OG + self-canonical + hreflang cluster.
 */
export function buildAboutHead(locale: Locale) {
  const m = getDictionary(locale).about.meta
  const canonical = `${SITE_URL}${localizedPath("/about", locale)}`
  return {
    meta: [
      { title: m.title },
      { name: "description", content: m.description },
      { property: "og:type", content: "profile" },
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
      { rel: "alternate", hrefLang: "en", href: `${SITE_URL}/about` },
      { rel: "alternate", hrefLang: "fr", href: `${SITE_URL}/fr/about` },
      { rel: "alternate", hrefLang: "x-default", href: `${SITE_URL}/about` },
    ],
  }
}

export const Route = createFileRoute("/about")({
  component: AboutPage,
  head: () => buildAboutHead("en"),
})

// ProfilePage + Person structured data. Establishes the author as a real,
// described entity (E-E-A-T) and gives blog bylines a profile to link to.
// Language-neutral entity data — kept canonical (English /about).
const profileSchema = {
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  mainEntity: {
    "@type": "Person",
    name: "Anthony Sgro",
    url: `${SITE_URL}/about`,
    image: `${SITE_URL}/profile_pic_2.png`,
    jobTitle: "Software developer",
    description:
      "Software developer and creator of GeoSpoof, an open-source location and timezone spoofing tool.",
    sameAs: [GITHUB_PROFILE, LINKEDIN_URL],
    worksFor: { "@type": "Organization", name: "GeoSpoof", url: SITE_URL },
  },
}

function GitHubIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.305-5.467-1.334-5.467-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.399 3-.405 1.02.006 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12" />
    </svg>
  )
}

function LinkedInIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" {...props}>
      <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z" />
    </svg>
  )
}

const socialLinkClass = cn(
  "inline-flex items-center gap-2 rounded-brand border border-(--color-canvas-border) px-4 py-2",
  "text-sm font-medium text-(--color-canvas-foreground) transition-colors",
  "hover:bg-(--color-canvas-border)",
  "focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-brand)"
)

export function AboutPage() {
  const { t } = useTranslations()
  const d = t.about
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <Section narrow className="py-12! md:py-16!">
          <div className="flex flex-col items-start gap-6 sm:flex-row sm:items-center">
            <img
              src="/profile_pic_2.png"
              alt="Anthony Sgro"
              width={112}
              height={112}
              className="size-24 shrink-0 rounded-full object-cover object-[30%_center] sm:size-28"
              loading="eager"
            />
            <div>
              <h1 className="text-3xl font-bold text-(--color-canvas-foreground) md:text-4xl">
                {d.greeting}
              </h1>
              <p className="text-body-lg mt-1 text-(--color-canvas-muted)">
                {d.tagline}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <a
                  href={GITHUB_PROFILE}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={socialLinkClass}
                  aria-label={d.githubAria}
                >
                  <GitHubIcon className="size-4" />
                  GitHub
                </a>
                <a
                  href={LINKEDIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={socialLinkClass}
                  aria-label={d.linkedinAria}
                >
                  <LinkedInIcon className="size-4" />
                  LinkedIn
                </a>
              </div>
            </div>
          </div>

          <div className="text-body-lg mt-10 space-y-5 leading-relaxed text-(--color-canvas-muted)">
            <p>
              {d.p1a}
              <strong className="font-semibold text-(--color-canvas-foreground)">
                {d.p1strong}
              </strong>
              {d.p1b}
            </p>
            <p>
              {d.p2a}
              <strong className="font-semibold text-(--color-canvas-foreground)">
                {d.p2strong}
              </strong>
              {d.p2b}
              <LocaleLink
                to="/verify"
                className="font-medium text-(--color-brand) hover:underline"
              >
                {d.verifyLink}
              </LocaleLink>
              {d.p2c}
            </p>
            <p>
              {d.p3a}
              <strong className="font-semibold text-(--color-canvas-foreground)">
                {d.p3strong}
              </strong>
              {d.p3b}
            </p>
            <p>
              {d.p4a}
              <em>{d.p4em}</em>
              {d.p4b}
              <LocaleLink
                to="/support"
                className="font-medium text-(--color-brand) hover:underline"
              >
                {d.supportLink}
              </LocaleLink>
              {d.p4c}
            </p>
          </div>
        </Section>
      </main>
      <Footer />

      <script
        type="application/ld+json"
        // Static, app-authored schema (no user input).
        dangerouslySetInnerHTML={{ __html: JSON.stringify(profileSchema) }}
      />
    </div>
  )
}
