import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import {
  Check,
  ChevronDown,
  Copy,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"

import type { ActivationBrowser } from "@/lib/activation/protocol"
import type { Dictionary, Locale } from "@/lib/i18n"
import navLogo from "@/assets/nav-logo.webp"
import { useTranslations } from "@/hooks/use-i18n"
import { getDictionary, localizedPath, toLocale } from "@/lib/i18n"
import { SITE_URL } from "@/lib/blog"
import { cn } from "@/lib/utils"
import {
  createActivationNonce,
  detectActivationBrowser,
  isActivationReadyMessage,
  makeActivationPing,
} from "@/lib/activation/protocol"

const APP_RETURN_URL = "geospoof://onboarding/safari-complete"

type ActivationCopy = Dictionary["activate"]

export function buildActivationHead(locale: Locale) {
  const meta = getDictionary(locale).activate.meta
  return {
    meta: [
      { title: meta.title },
      { name: "description", content: meta.description },
      { name: "robots", content: "noindex,nofollow" },
    ],
    links: [
      {
        rel: "canonical",
        href: `${SITE_URL}${localizedPath("/activate", locale)}`,
      },
    ],
  }
}

export const Route = createFileRoute("/{-$locale}/activate")({
  component: ActivatePage,
  head: ({ params }) => buildActivationHead(toLocale(params.locale)),
})

type ReportedLocation = {
  latitude: number
  longitude: number
  timezone: string
}

type LocationCheck =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "ready"; value: ReportedLocation }
  | { status: "error" }

const primaryButtonClass = cn(
  "inline-flex min-h-12 w-full items-center justify-center gap-2",
  "rounded-(--radius-md-brand) bg-(--color-brand) px-5 py-3",
  "text-base font-bold text-white shadow-sm",
  "transition-colors hover:bg-(--color-brand-dark)",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand)"
)

const secondaryButtonClass = cn(
  "inline-flex min-h-12 w-full items-center justify-center gap-2",
  "rounded-(--radius-md-brand) border border-(--color-canvas-border) px-5 py-3",
  "text-base font-bold text-(--color-canvas-foreground)",
  "transition-colors hover:bg-(--color-canvas-border)/45",
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand)"
)

function useActivationBrowser(): ActivationBrowser {
  const [browser, setBrowser] = React.useState<ActivationBrowser>("unknown")

  React.useEffect(() => {
    setBrowser(
      detectActivationBrowser(
        navigator.userAgent,
        navigator.platform,
        navigator.maxTouchPoints
      )
    )
  }, [])

  return browser
}

function useExtensionHandshake(browser: ActivationBrowser) {
  const [detected, setDetected] = React.useState(false)
  const [showTroubleshooting, setShowTroubleshooting] = React.useState(false)

  React.useEffect(() => {
    if (browser !== "safari") return

    const nonce = createActivationNonce()
    const ping = makeActivationPing(nonce)
    let acknowledged = false

    const sendPing = () => {
      if (!acknowledged) window.postMessage(ping, window.location.origin)
    }

    const receiveReady = (event: MessageEvent<unknown>) => {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        !isActivationReadyMessage(event.data, nonce)
      ) {
        return
      }

      acknowledged = true
      setDetected(true)
      setShowTroubleshooting(false)
    }

    const pingWhenVisible = () => {
      if (document.visibilityState === "visible") sendPing()
    }

    window.addEventListener("message", receiveReady)
    window.addEventListener("focus", sendPing)
    document.addEventListener("visibilitychange", pingWhenVisible)

    sendPing()
    const earlyRetry = window.setTimeout(sendPing, 350)
    const laterRetry = window.setTimeout(sendPing, 1_200)
    const interval = window.setInterval(sendPing, 2_000)
    const helpTimer = window.setTimeout(() => {
      if (!acknowledged) setShowTroubleshooting(true)
    }, 8_000)

    return () => {
      window.removeEventListener("message", receiveReady)
      window.removeEventListener("focus", sendPing)
      document.removeEventListener("visibilitychange", pingWhenVisible)
      window.clearTimeout(earlyRetry)
      window.clearTimeout(laterRetry)
      window.clearTimeout(helpTimer)
      window.clearInterval(interval)
    }
  }, [browser])

  return { detected, showTroubleshooting }
}

function readReportedLocation(
  onChange: React.Dispatch<React.SetStateAction<LocationCheck>>,
  unavailableLabel: string
) {
  onChange({ status: "checking" })

  navigator.geolocation.getCurrentPosition(
    (position) => {
      let timezone = unavailableLabel
      try {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || timezone
      } catch {
        // A location result is still useful if the browser withholds timezone.
      }

      onChange({
        status: "ready",
        value: {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          timezone,
        },
      })
    },
    () => onChange({ status: "error" }),
    { enableHighAccuracy: false, maximumAge: 0, timeout: 10_000 }
  )
}

export function ActivatePage() {
  const { locale, t } = useTranslations()
  const copy = t.activate
  const browser = useActivationBrowser()
  const { detected, showTroubleshooting } = useExtensionHandshake(browser)
  const [location, setLocation] = React.useState<LocationCheck>({
    status: "idle",
  })

  React.useEffect(() => {
    if (detected && location.status === "idle") {
      readReportedLocation(setLocation, copy.checking.unavailable)
    }
  }, [copy.checking.unavailable, detected, location.status])

  return (
    <div className="flex min-h-svh flex-col bg-(--color-canvas)">
      <ActivationHeader locale={locale} t={t} />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-160 flex-1 flex-col px-6 pt-9 pb-12 sm:px-8 sm:pt-14"
      >
        {browser === "unknown" ? (
          <PreparingState label={copy.preparing} />
        ) : browser !== "safari" ? (
          <WrongBrowserState browser={browser} copy={copy} locale={locale} />
        ) : location.status === "ready" ? (
          <SuccessState location={location.value} copy={copy} locale={locale} />
        ) : detected ? (
          <LocationCheckState
            state={location.status}
            onRetry={() =>
              readReportedLocation(setLocation, copy.checking.unavailable)
            }
            copy={copy}
            locale={locale}
          />
        ) : (
          <WaitingState
            showTroubleshooting={showTroubleshooting}
            copy={copy}
            locale={locale}
          />
        )}
      </main>
      <ActivationFooter locale={locale} t={t} />
    </div>
  )
}

function ActivationHeader({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <header className="px-6 pt-5 sm:px-8 sm:pt-7">
      <div className="mx-auto flex w-full max-w-160 items-center justify-between">
        <a
          href={localizedPath("/", locale)}
          className="flex min-h-11 items-center gap-2.5 rounded-sm-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand)"
          aria-label={t.nav.brandAria}
        >
          <img src={navLogo} alt="" width={32} height={32} className="size-8" />
          <span className="text-xl font-bold text-(--color-brand)">
            GeoSpoof
          </span>
        </a>
        <a
          href={localizedPath("/support", locale)}
          className="flex min-h-11 items-center rounded-sm-brand px-2 text-sm font-semibold text-(--color-canvas-muted) transition-colors hover:text-(--color-canvas-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand)"
        >
          {t.nav.support}
        </a>
      </div>
    </header>
  )
}

function ActivationFooter({ locale, t }: { locale: Locale; t: Dictionary }) {
  return (
    <footer className="px-6 pb-7 sm:px-8">
      <nav
        aria-label={t.footer.footerNavAria}
        className="mx-auto flex w-full max-w-160 items-center gap-5 text-xs text-(--color-canvas-muted)"
      >
        <a
          className="hover:text-(--color-canvas-foreground)"
          href={localizedPath("/privacy", locale)}
        >
          {t.footer.links.privacy}
        </a>
        <a
          className="hover:text-(--color-canvas-foreground)"
          href={localizedPath("/terms", locale)}
        >
          {t.footer.links.terms}
        </a>
        <span className="ml-auto">GeoSpoof™</span>
      </nav>
    </footer>
  )
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-xs font-bold tracking-[0.16em] text-(--color-brand) uppercase">
      {children}
    </p>
  )
}

function PreparingState({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center" role="status">
      <LoaderCircle
        className="size-5 animate-spin text-(--color-canvas-muted)"
        aria-hidden="true"
      />
      <span className="sr-only">{label}</span>
    </div>
  )
}

function WaitingState({
  showTroubleshooting,
  copy,
  locale,
}: {
  showTroubleshooting: boolean
  copy: ActivationCopy
  locale: Locale
}) {
  const waiting = copy.waiting
  return (
    <section aria-labelledby="activation-heading">
      <Eyebrow>{waiting.eyebrow}</Eyebrow>
      <h1
        id="activation-heading"
        className="max-w-lg text-[2rem] leading-[1.12] font-bold tracking-[-0.025em] text-(--color-canvas-foreground) sm:text-[2.35rem]"
      >
        {waiting.heading}
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-(--color-canvas-muted) sm:text-lg">
        {waiting.body}
      </p>

      <div
        className="mt-8 flex items-center gap-3 border-y border-(--color-canvas-border) py-4"
        role="status"
        aria-live="polite"
      >
        <LoaderCircle
          className="size-4 shrink-0 animate-spin text-(--color-brand)"
          aria-hidden="true"
        />
        <span className="text-sm font-semibold text-(--color-canvas-foreground)">
          {waiting.status}
        </span>
      </div>

      <div className="mt-8">
        <h2 className="text-sm font-bold text-(--color-canvas-foreground)">
          {waiting.inSafari}
        </h2>
        <ol className="mt-2 divide-y divide-(--color-canvas-border)">
          {waiting.steps.map((step, index) => (
            <InstructionStep
              key={step.title}
              number={String(index + 1)}
              title={step.title}
            >
              {step.body}
            </InstructionStep>
          ))}
        </ol>
      </div>

      <button
        type="button"
        className={cn(primaryButtonClass, "mt-8")}
        onClick={() => window.location.reload()}
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        {waiting.retry}
      </button>

      {showTroubleshooting ? (
        <Troubleshooting copy={copy} locale={locale} />
      ) : null}
    </section>
  )
}

function InstructionStep({
  number,
  title,
  children,
}: {
  number: string
  title: string
  children: React.ReactNode
}) {
  return (
    <li className="grid grid-cols-[1.5rem_1fr] gap-3 py-4 first:pt-3">
      <span
        className="pt-0.5 text-sm font-bold text-(--color-canvas-muted)"
        aria-hidden="true"
      >
        {number}
      </span>
      <div>
        <p className="font-bold text-(--color-canvas-foreground)">{title}</p>
        <p className="mt-1 text-sm leading-6 text-(--color-canvas-muted)">
          {children}
        </p>
      </div>
    </li>
  )
}

function Troubleshooting({
  copy,
  locale,
}: {
  copy: ActivationCopy
  locale: Locale
}) {
  const troubleshooting = copy.troubleshooting
  return (
    <details className="group mt-7 border-t border-(--color-canvas-border) pt-5">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 rounded-sm-brand font-semibold text-(--color-canvas-foreground) focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--color-brand)">
        {troubleshooting.summary}
        <ChevronDown
          className="size-4 text-(--color-canvas-muted) transition-transform group-open:rotate-180"
          aria-hidden="true"
        />
      </summary>
      <div className="pt-2 pb-1 text-sm leading-6 text-(--color-canvas-muted)">
        <ul className="list-disc space-y-2 pl-5">
          {troubleshooting.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <a
          href={localizedPath("/support", locale)}
          className="mt-4 inline-flex min-h-11 items-center font-bold text-(--color-brand) hover:underline"
        >
          {troubleshooting.support}
          <ExternalLink className="ml-1.5 size-3.5" aria-hidden="true" />
        </a>
      </div>
    </details>
  )
}

function LocationCheckState({
  state,
  onRetry,
  copy,
  locale,
}: {
  state: "idle" | "checking" | "error"
  onRetry: () => void
  copy: ActivationCopy
  locale: Locale
}) {
  if (state !== "error") {
    return (
      <section aria-labelledby="location-check-heading">
        <Eyebrow>{copy.checking.eyebrow}</Eyebrow>
        <h1
          id="location-check-heading"
          className="text-[2rem] leading-[1.12] font-bold tracking-[-0.025em] text-(--color-canvas-foreground) sm:text-[2.35rem]"
        >
          {copy.checking.heading}
        </h1>
        <div
          className="mt-7 flex items-center gap-3 border-y border-(--color-canvas-border) py-4"
          role="status"
        >
          <LoaderCircle
            className="size-4 animate-spin text-(--color-brand)"
            aria-hidden="true"
          />
          <span className="text-sm font-semibold text-(--color-canvas-foreground)">
            {copy.checking.status}
          </span>
        </div>
      </section>
    )
  }

  return (
    <section aria-labelledby="location-error-heading">
      <Eyebrow>{copy.error.eyebrow}</Eyebrow>
      <h1
        id="location-error-heading"
        className="text-[2rem] leading-[1.12] font-bold tracking-[-0.025em] text-(--color-canvas-foreground) sm:text-[2.35rem]"
      >
        {copy.error.heading}
      </h1>
      <p className="mt-4 text-base leading-7 text-(--color-canvas-muted) sm:text-lg">
        {copy.error.body}
      </p>
      <button
        type="button"
        className={cn(primaryButtonClass, "mt-8")}
        onClick={onRetry}
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        {copy.error.retry}
      </button>
      <a
        href={localizedPath("/support", locale)}
        className={cn(secondaryButtonClass, "mt-3")}
      >
        {copy.error.support}
      </a>
    </section>
  )
}

function SuccessState({
  location,
  copy,
  locale,
}: {
  location: ReportedLocation
  copy: ActivationCopy
  locale: Locale
}) {
  const coordinates = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`

  return (
    <section aria-labelledby="success-heading">
      <div className="mb-4 flex items-center gap-2 text-sm font-bold text-(--color-brand)">
        <Check className="size-4 stroke-[2.5]" aria-hidden="true" />
        {copy.success.status}
      </div>
      <h1
        id="success-heading"
        className="max-w-lg text-[2rem] leading-[1.12] font-bold tracking-[-0.025em] text-(--color-canvas-foreground) sm:text-[2.35rem]"
      >
        {copy.success.heading}
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-(--color-canvas-muted) sm:text-lg">
        {copy.success.body}
      </p>

      <dl className="mt-8 divide-y divide-(--color-canvas-border) border-y border-(--color-canvas-border)">
        <ProofRow label={copy.success.locationLabel} value={coordinates} mono />
        <ProofRow
          label={copy.success.timezoneLabel}
          value={location.timezone}
        />
      </dl>

      <a href={APP_RETURN_URL} className={cn(primaryButtonClass, "mt-8")}>
        {copy.success.returnToApp}
      </a>
      <a
        href={localizedPath("/verify", locale)}
        className={cn(secondaryButtonClass, "mt-3")}
      >
        {copy.success.fullVerification}
        <ExternalLink className="size-4" aria-hidden="true" />
      </a>
      <p className="mt-4 text-center text-xs leading-5 text-(--color-canvas-muted)">
        {copy.success.fullVerificationNote}
      </p>
    </section>
  )
}

function ProofRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="py-4">
      <dt className="text-xs font-semibold tracking-wide text-(--color-canvas-muted) uppercase">
        {label}
      </dt>
      <dd
        className={cn(
          "mt-1.5 text-base font-bold break-words text-(--color-canvas-foreground)",
          mono && "font-mono text-[0.95rem]"
        )}
      >
        {value}
      </dd>
    </div>
  )
}

function WrongBrowserState({
  browser,
  copy,
  locale,
}: {
  browser: ActivationBrowser
  copy: ActivationCopy
  locale: Locale
}) {
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "error">(
    "idle"
  )
  const activationUrl = `${SITE_URL}${localizedPath("/activate", locale)}`
  const displayAddress = activationUrl.replace(/^https:\/\//, "")

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(activationUrl)
      setCopyState("copied")
    } catch {
      setCopyState("error")
    }
  }

  return (
    <section aria-labelledby="wrong-browser-heading">
      <Eyebrow>{copy.wrongBrowser.eyebrow}</Eyebrow>
      <h1
        id="wrong-browser-heading"
        className="max-w-lg text-[2rem] leading-[1.12] font-bold tracking-[-0.025em] text-(--color-canvas-foreground) sm:text-[2.35rem]"
      >
        {copy.wrongBrowser.heading}
      </h1>
      <p className="mt-4 max-w-xl text-base leading-7 text-(--color-canvas-muted) sm:text-lg">
        {copy.wrongBrowser.body}
      </p>

      <div className="mt-8 border-y border-(--color-canvas-border) py-5">
        <p className="text-sm font-bold text-(--color-canvas-foreground)">
          {copy.wrongBrowser.copyInstruction}
        </p>
        <p className="mt-2 font-mono text-sm break-all text-(--color-canvas-muted)">
          {displayAddress}
        </p>
      </div>

      <button
        type="button"
        className={cn(primaryButtonClass, "mt-8")}
        onClick={() => void copyAddress()}
      >
        {copyState === "copied" ? (
          <Check className="size-4" aria-hidden="true" />
        ) : (
          <Copy className="size-4" aria-hidden="true" />
        )}
        {copyState === "copied"
          ? copy.wrongBrowser.copied
          : copy.wrongBrowser.copy}
      </button>

      {copyState === "error" ? (
        <p
          className="mt-3 text-sm leading-6 text-(--color-canvas-muted)"
          role="alert"
        >
          {copy.wrongBrowser.copyError}
        </p>
      ) : null}

      {browser === "other-ios" ? (
        <p className="mt-5 text-sm leading-6 text-(--color-canvas-muted)">
          {copy.wrongBrowser.iosTip}
        </p>
      ) : null}
    </section>
  )
}
