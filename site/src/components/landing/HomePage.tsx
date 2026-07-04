import type { Locale } from "@/lib/i18n"
import { Navigation } from "@/components/landing/Navigation"
import { HeroSection } from "@/components/landing/HeroSection"
import { FeaturesSection } from "@/components/landing/FeaturesSection"
import { ComparisonSection } from "@/components/landing/ComparisonSection"
import { ScreenshotsSection } from "@/components/landing/ScreenshotsSection"
import { DemoVideoSection } from "@/components/landing/DemoVideoSection"
import { TestimonialsSection } from "@/components/landing/TestimonialsSection"
import { CompatibilitySection } from "@/components/landing/CompatibilitySection"
import { FeaturedPostSection } from "@/components/landing/FeaturedPostSection"
import { DownloadSection } from "@/components/landing/DownloadSection"
import { Footer } from "@/components/landing/Footer"
import { ExposureToast } from "@/components/landing/ExposureToast"
import { SkipLink } from "@/components/landing/SkipLink"
import { SITE_URL } from "@/lib/blog"
import {
  buildAlternateLinks,
  buildOgLocaleMeta,
  localizedPath,
} from "@/lib/i18n"

/**
 * Shared home page, rendered by both the English route (`/`) and the French
 * route (`/fr`). Locale-aware sections (Navigation, HeroSection, Footer) read
 * the active locale from the URL via `useTranslations`, so this component needs
 * no locale prop — it renders correctly under whichever route mounts it.
 */
export function HomePage() {
  return (
    <div className="min-h-screen bg-(--color-canvas)">
      <SkipLink />
      <Navigation />
      <main id="main-content">
        <HeroSection />
        <TestimonialsSection />
        <ScreenshotsSection />
        <DemoVideoSection />
        <FeaturesSection />
        <ComparisonSection />
        <CompatibilitySection />
        <FeaturedPostSection />
        <DownloadSection />
      </main>
      <Footer />

      <ExposureToast />

      <script
        type="application/ld+json"
        // Static, app-authored schema (no user input).
        dangerouslySetInnerHTML={{
          __html: JSON.stringify([
            softwareApplicationSchema,
            organizationSchema,
            demoVideoSchema,
          ]),
        }}
      />
    </div>
  )
}

/** Per-locale homepage SEO copy (title + meta description). */
const localeMeta: Record<Locale, { title: string; description: string }> = {
  en: {
    title: "GeoSpoof — Spoof Geolocation & Timezone (Free Extension)",
    description:
      "Spoof your browser's geolocation, timezone, and WebRTC in one free extension. No account required. Works on Chrome, Firefox, Edge, Brave, and Safari.",
  },
  de: {
    title: "GeoSpoof — Standort und Zeitzone fälschen (kostenlose Erweiterung)",
    description:
      "Fälsche Geolocation, Zeitzone und WebRTC deines Browsers mit einer einzigen kostenlosen Erweiterung. Kein Konto nötig. Funktioniert in Chrome, Firefox, Edge, Brave und Safari.",
  },
  fr: {
    title:
      "GeoSpoof — Simulez votre position et fuseau horaire (extension gratuite)",
    description:
      "Simulez la géolocalisation, le fuseau horaire et le WebRTC de votre navigateur avec une seule extension gratuite. Sans compte. Compatible Chrome, Firefox, Edge, Brave et Safari.",
  },
  id: {
    title: "GeoSpoof — Palsukan Geolokasi & Zona Waktu (Ekstensi Gratis)",
    description:
      "Palsukan geolokasi, zona waktu, dan WebRTC browser Anda dalam satu ekstensi gratis. Tanpa akun. Berfungsi di Chrome, Firefox, Edge, Brave, dan Safari.",
  },
  ja: {
    title: "GeoSpoof — 位置情報とタイムゾーンを偽装（無料拡張機能）",
    description:
      "ブラウザの位置情報・タイムゾーン・WebRTC を1つの無料拡張機能で偽装。アカウント不要。Chrome、Firefox、Edge、Brave、Safari に対応。",
  },
  "pt-BR": {
    title:
      "GeoSpoof — Falsifique geolocalização e fuso horário (extensão grátis)",
    description:
      "Falsifique a geolocalização, o fuso horário e o WebRTC do seu navegador com uma única extensão grátis. Sem conta. Funciona no Chrome, Firefox, Edge, Brave e Safari.",
  },
  es: {
    title:
      "GeoSpoof — Falsea tu geolocalización y zona horaria (extensión gratuita)",
    description:
      "Falsea la geolocalización, la zona horaria y el WebRTC de tu navegador con una sola extensión gratuita. Sin cuenta. Funciona en Chrome, Firefox, Edge, Brave y Safari.",
  },
  ru: {
    title:
      "GeoSpoof — подмена геолокации и часового пояса (бесплатное расширение)",
    description:
      "Подмена геолокации, часового пояса и WebRTC браузера в одном бесплатном расширении. Без аккаунта. Работает в Chrome, Firefox, Edge, Brave и Safari.",
  },
  "zh-CN": {
    title: "GeoSpoof — 伪造地理位置和时区（免费扩展）",
    description:
      "用一款免费扩展伪造浏览器的地理位置、时区和 WebRTC。无需账户。支持 Chrome、Firefox、Edge、Brave 和 Safari。",
  },
}

/**
 * Build the `head` payload for the home page in a given locale: localized
 * title/description, a self-referential canonical, and the hreflang cluster
 * (identical on every locale variant, x-default -> the English bare path).
 */
export function buildHomeHead(locale: Locale) {
  const canonical = `${SITE_URL}${localizedPath("/", locale)}`
  const meta = localeMeta[locale]

  return {
    meta: [
      { title: meta.title },
      { name: "description", content: meta.description },
      ...buildOgLocaleMeta(locale),
      { property: "og:url", content: canonical },
      { name: "twitter:url", content: canonical },
    ],
    links: [
      { rel: "canonical", href: canonical },
      ...buildAlternateLinks("/", SITE_URL),
    ],
  }
}

// SoftwareApplication schema — tells Google + AI answer engines what GeoSpoof
// is (a free, cross-browser location/timezone spoofing extension), which feeds
// app info boxes and "best browser location spoofer" style AI answers.
const softwareApplicationSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "GeoSpoof",
  description:
    "Spoof your browser's geolocation, timezone, and WebRTC in one extension. Open source, privacy-first, no account required. Works on Chrome, Firefox, Edge, Brave, and Safari.",
  url: SITE_URL,
  image: `${SITE_URL}/icon.png`,
  applicationCategory: "BrowserApplication",
  operatingSystem: "Windows, macOS, Linux, iOS, iPadOS, Android",
  browserRequirements: "Requires Firefox, Chrome, Brave, Edge, or Safari",
  softwareVersion: "latest",
  isAccessibleForFree: true,
  featureList: [
    "Spoof browser geolocation via the Geolocation API",
    "Spoof timezone across Date, Intl, and Temporal",
    "Automatic VPN sync — match your spoofed location to your VPN exit region",
    "Auto background sync that follows you as you switch VPN servers",
    "WebRTC IP leak protection",
    "Per-site allow and deny filters",
    "Search 33,000+ cities offline or enter coordinates manually",
  ],
  offers: {
    "@type": "Offer",
    price: "0",
    priceCurrency: "USD",
  },
  author: { "@type": "Person", name: "Anthony Sgro" },
  publisher: {
    "@type": "Organization",
    name: "GeoSpoof",
    logo: { "@type": "ImageObject", url: `${SITE_URL}/icon.png` },
  },
  sameAs: ["https://github.com/anthonysgro/geospoof"],
}

// Organization schema — feeds entity recognition and the logo shown beside
// results / in knowledge panels.
const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  name: "GeoSpoof",
  url: SITE_URL,
  logo: `${SITE_URL}/icon.png`,
  sameAs: ["https://github.com/anthonysgro/geospoof"],
}

// VideoObject schema — describes the homepage demo clip. The explicit
// thumbnailUrl tells Google which image represents the video.
const demoVideoSchema = {
  "@context": "https://schema.org",
  "@type": "VideoObject",
  name: "GeoSpoof demo — spoof your browser location in a few clicks",
  description:
    "A short demo of GeoSpoof overriding the browser's geolocation and timezone so websites see the location you choose.",
  thumbnailUrl: [`${SITE_URL}/images/social-og-home.png`],
  uploadDate: "2026-06-11",
  contentUrl:
    "https://dsgaoei8r9jiwulf.public.blob.vercel-storage.com/geospoof-demo-v2.mp4",
}
