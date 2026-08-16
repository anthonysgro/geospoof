import { createFileRoute } from "@tanstack/react-router"
import * as React from "react"
import {
  Check,
  CircleAlert,
  Copy,
  ExternalLink,
  LoaderCircle,
  RefreshCw,
} from "lucide-react"

import type {
  ActivationBrowser,
  SafariSetupVariant,
} from "@/lib/activation/protocol"
import type { Dictionary, Locale } from "@/lib/i18n"
import navLogo from "@/assets/nav-logo.webp"
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion"
import { Alert, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { SkipLink } from "@/components/landing/SkipLink"
import { useTranslations } from "@/hooks/use-i18n"
import { getDictionary, localizedPath, toLocale } from "@/lib/i18n"
import { SITE_URL } from "@/lib/blog"
import { cn } from "@/lib/utils"
import {
  ACTIVATION_PING_EVENT,
  ACTIVATION_READY_EVENT,
  createActivationNonce,
  detectActivationBrowser,
  isActivationReadyMessage,
  makeActivationPing,
  resolveSafariSetupVariant,
} from "@/lib/activation/protocol"

const APP_RETURN_URL = "geospoof://onboarding/safari-complete"
const APPLE_SAFARI_EXTENSION_GUIDES: Record<SafariSetupVariant, string> = {
  ios18:
    "https://support.apple.com/guide/iphone/get-extensions-iphab0432bf6/18.0/ios/18.0",
  ios26:
    "https://support.apple.com/guide/iphone/get-extensions-iphab0432bf6/26/ios/26",
}

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

const primaryButtonClass =
  "min-h-12 w-full rounded-(--radius-md-brand) bg-(--color-brand) px-5 py-3 text-base font-bold text-white shadow-sm hover:bg-(--color-brand-dark) focus-visible:border-(--color-brand) focus-visible:ring-(--color-brand)/30"

const secondaryButtonClass =
  "min-h-12 w-full rounded-(--radius-md-brand) border-(--color-canvas-border) px-5 py-3 text-base font-bold text-(--color-canvas-foreground) hover:bg-(--color-canvas-border)/45 focus-visible:border-(--color-brand) focus-visible:ring-(--color-brand)/30"

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

function useSafariSetupVariant(): SafariSetupVariant {
  const [variant, setVariant] = React.useState<SafariSetupVariant>("ios26")

  React.useEffect(() => {
    const hint = new URLSearchParams(window.location.search).get("safari_ui")
    setVariant(resolveSafariSetupVariant(hint, navigator.userAgent))
  }, [])

  return variant
}

function useExtensionHandshake(browser: ActivationBrowser) {
  const [detected, setDetected] = React.useState(false)
  const [showTroubleshooting, setShowTroubleshooting] = React.useState(false)
  // Purely presentational: a manual check almost always resolves faster than a
  // person can perceive, so without a brief visible state the button looks dead.
  const [rechecking, setRechecking] = React.useState(false)
  const pingRef = React.useRef<() => void>(() => {})
  const recheckTimer = React.useRef<number | undefined>(undefined)

  React.useEffect(() => {
    if (browser !== "safari") return

    const nonce = createActivationNonce()
    const ping = makeActivationPing(nonce)
    let acknowledged = false
    // Held on an object so `acknowledge` can stop the poll it is declared before.
    const timers: { poll?: number } = {}

    const sendPing = () => {
      if (acknowledged) return

      // Safari's most reliable page-world bridge is a DOM event (the same
      // mechanism GeoSpoof uses for live settings). Keep postMessage as a
      // fallback for browsers whose extension realms preserve normal window
      // identity across the message boundary.
      window.dispatchEvent(
        new CustomEvent(ACTIVATION_PING_EVENT, { detail: ping })
      )
      window.postMessage(ping, window.location.origin)
    }

    const acknowledge = (data: unknown) => {
      if (!isActivationReadyMessage(data, nonce)) return

      acknowledged = true
      // The `acknowledged` guard already makes further pings no-ops, but leaving
      // a timer running for the life of the page to do nothing is just litter.
      window.clearInterval(timers.poll)
      setDetected(true)
      setShowTroubleshooting(false)
      setRechecking(false)
    }

    const receiveReady = (event: MessageEvent<unknown>) => {
      if (
        event.source !== window ||
        event.origin !== window.location.origin ||
        !isActivationReadyMessage(event.data, nonce)
      ) {
        return
      }

      acknowledge(event.data)
    }

    const receiveReadyEvent = (event: Event) => {
      acknowledge((event as CustomEvent<unknown>).detail)
    }

    const pingWhenVisible = () => {
      if (document.visibilityState === "visible") sendPing()
    }

    window.addEventListener(ACTIVATION_READY_EVENT, receiveReadyEvent)
    window.addEventListener("message", receiveReady)
    window.addEventListener("focus", sendPing)
    document.addEventListener("visibilitychange", pingWhenVisible)

    pingRef.current = sendPing

    sendPing()
    const earlyRetry = window.setTimeout(sendPing, 350)
    const laterRetry = window.setTimeout(sendPing, 1_200)
    timers.poll = window.setInterval(sendPing, 2_000)
    const helpTimer = window.setTimeout(() => {
      if (!acknowledged) setShowTroubleshooting(true)
    }, 4_000)

    return () => {
      pingRef.current = () => {}
      window.removeEventListener(ACTIVATION_READY_EVENT, receiveReadyEvent)
      window.removeEventListener("message", receiveReady)
      window.removeEventListener("focus", sendPing)
      document.removeEventListener("visibilitychange", pingWhenVisible)
      window.clearTimeout(earlyRetry)
      window.clearTimeout(laterRetry)
      window.clearTimeout(helpTimer)
      window.clearInterval(timers.poll)
    }
  }, [browser])

  React.useEffect(() => () => window.clearTimeout(recheckTimer.current), [])

  /**
   * Re-ping on demand. The polling loop would find the extension within two
   * seconds anyway, so this exists for the person who just flipped the switch and
   * wants to feel like they did something — which is why it pings rather than
   * reloading. The reload it replaces threw away the troubleshooting panel they
   * were part-way through reading and restarted the timer that revealed it.
   */
  const checkNow = React.useCallback(() => {
    pingRef.current()
    setRechecking(true)
    window.clearTimeout(recheckTimer.current)
    recheckTimer.current = window.setTimeout(() => setRechecking(false), 700)
  }, [])

  return { detected, showTroubleshooting, rechecking, checkNow }
}

/**
 * Move focus to the incoming heading when the page swaps one state for another.
 *
 * Each state is a separate subtree, so a transition unmounts the element that had
 * focus and the browser drops focus to `<body>` — a keyboard user who was on
 * "Check again" when the extension was detected loses their place entirely, and
 * has to tab from the top to find out what happened. The `aria-live` regions
 * announce the change but do not move focus, which is a separate concern.
 *
 * Deliberately does nothing for the first resolved state. `preparing` is a
 * hydration placeholder, so the state that follows it is the page arriving rather
 * than changing; focusing there would interrupt a screen reader mid-announcement
 * and jump past the skip link before it can be used.
 */
function useHeadingFocus(stateKey: string) {
  const headingRef = React.useRef<HTMLHeadingElement | null>(null)
  const previousKey = React.useRef<string | null>(null)

  React.useEffect(() => {
    const previous = previousKey.current
    previousKey.current = stateKey
    if (previous === null || previous === "preparing") return
    headingRef.current?.focus()
  }, [stateKey])

  return headingRef
}

/** Focusable-but-not-tabbable heading target. */
type HeadingRef = React.RefObject<HTMLHeadingElement | null>

const focusableHeadingProps = {
  // Programmatic focus only — the heading is not in the tab order, so suppressing
  // the ring avoids a stray outline appearing on a title nobody tabbed to.
  tabIndex: -1,
  className: "focus:outline-none",
} as const

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
  const safariSetupVariant = useSafariSetupVariant()
  const { detected, showTroubleshooting, rechecking, checkNow } =
    useExtensionHandshake(browser)
  const [location, setLocation] = React.useState<LocationCheck>({
    status: "idle",
  })

  React.useEffect(() => {
    if (detected && location.status === "idle") {
      readReportedLocation(setLocation, copy.checking.unavailable)
    }
  }, [copy.checking.unavailable, detected, location.status])

  // `idle` and `checking` share a key because they render the same heading, so a
  // detected extension moves focus once rather than twice.
  const stateKey = React.useMemo(() => {
    if (browser === "unknown") return "preparing"
    if (browser === "safari-desktop") return "desktop"
    if (browser !== "safari") return "wrong-browser"
    if (location.status === "ready") return "success"
    if (detected) {
      return location.status === "error"
        ? "location-error"
        : "location-checking"
    }
    return "waiting"
  }, [browser, detected, location.status])

  const headingRef = useHeadingFocus(stateKey)

  return (
    <div className="flex min-h-svh flex-col bg-(--color-canvas)">
      {/* Every other route renders this; without it the `main-content` id below
          is an anchor target nothing can reach. */}
      <SkipLink />
      <ActivationHeader locale={locale} t={t} />
      <main
        id="main-content"
        className="mx-auto flex w-full max-w-160 flex-1 flex-col px-6 pt-9 pb-12 sm:px-8 sm:pt-14"
      >
        {browser === "unknown" ? (
          <PreparingState label={copy.preparing} />
        ) : browser === "safari-desktop" ? (
          <DesktopSafariState
            copy={copy}
            locale={locale}
            headingRef={headingRef}
          />
        ) : browser !== "safari" ? (
          <WrongBrowserState
            browser={browser}
            copy={copy}
            locale={locale}
            safariSetupVariant={safariSetupVariant}
            headingRef={headingRef}
          />
        ) : location.status === "ready" ? (
          <SuccessState
            location={location.value}
            copy={copy}
            locale={locale}
            headingRef={headingRef}
          />
        ) : detected ? (
          <LocationCheckState
            state={location.status}
            onRetry={() =>
              readReportedLocation(setLocation, copy.checking.unavailable)
            }
            copy={copy}
            locale={locale}
            headingRef={headingRef}
          />
        ) : (
          <WaitingState
            showTroubleshooting={showTroubleshooting}
            rechecking={rechecking}
            onCheckNow={checkNow}
            copy={copy}
            locale={locale}
            safariSetupVariant={safariSetupVariant}
            headingRef={headingRef}
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
  rechecking,
  onCheckNow,
  copy,
  locale,
  safariSetupVariant,
  headingRef,
}: {
  showTroubleshooting: boolean
  rechecking: boolean
  onCheckNow: () => void
  copy: ActivationCopy
  locale: Locale
  safariSetupVariant: SafariSetupVariant
  headingRef: HeadingRef
}) {
  const waiting = copy.waiting
  return (
    <section
      className="mx-auto w-full max-w-md"
      aria-labelledby="activation-heading"
    >
      {/* Every other state on this page leads with an eyebrow; this one had the
          copy translated in all nine locales but never rendered it, so the
          waiting → checking transition changed layout for no reason. */}
      <Eyebrow>{waiting.eyebrow}</Eyebrow>
      <h1
        ref={headingRef}
        {...focusableHeadingProps}
        id="activation-heading"
        className={cn(
          focusableHeadingProps.className,
          "text-[1.75rem] leading-[1.15] font-bold tracking-[-0.02em] text-(--color-canvas-foreground) sm:text-[2rem]"
        )}
      >
        {waiting.heading}
      </h1>
      <p className="mt-3 max-w-sm text-sm leading-6 text-(--color-canvas-muted) sm:text-base">
        {waiting.body}
      </p>

      <Alert
        className="mt-6 w-full items-center rounded-[1rem] border border-(--color-canvas-border) bg-(--color-canvas-border)/15 px-4 py-3.5 text-left"
        role="status"
        aria-live="polite"
      >
        {showTroubleshooting ? (
          <CircleAlert
            className="size-4 shrink-0 text-amber-600"
            aria-hidden="true"
          />
        ) : (
          <LoaderCircle
            className="size-4 shrink-0 animate-spin text-(--color-brand)"
            aria-hidden="true"
          />
        )}
        <AlertTitle className="text-sm font-semibold text-(--color-canvas-foreground)">
          {showTroubleshooting ? waiting.notActive : waiting.status}
        </AlertTitle>
      </Alert>

      <SafariSetupVisual
        waiting={waiting}
        safariSetupVariant={safariSetupVariant}
      />

      <Button
        asChild
        variant="link"
        className="mt-2 -ml-2 min-h-11 justify-start px-2 font-semibold text-(--color-brand)"
      >
        <a
          href={APPLE_SAFARI_EXTENSION_GUIDES[safariSetupVariant]}
          target="_blank"
          rel="noreferrer"
        >
          {copy.troubleshooting.appleSupport}
          <ExternalLink className="ml-1.5 size-3.5" aria-hidden="true" />
        </a>
      </Button>

      <Button
        type="button"
        size="lg"
        className={cn(primaryButtonClass, "mt-3")}
        onClick={onCheckNow}
      >
        {rechecking ? (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <RefreshCw className="size-4" aria-hidden="true" />
        )}
        {waiting.retry}
      </Button>

      {showTroubleshooting ? (
        <Troubleshooting copy={copy} locale={locale} />
      ) : null}
    </section>
  )
}

/**
 * Desktop Safari. Not an error state — the extension works fine here, but every
 * instruction on this page is a tap gesture on an iPhone control, and the Mac app
 * opens Safari's extension settings natively. So point at the app rather than
 * teaching a flow that doesn't exist, and offer /verify for anyone who has already
 * enabled it and just wants to see what websites read.
 */
function DesktopSafariState({
  copy,
  locale,
  headingRef,
}: {
  copy: ActivationCopy
  locale: Locale
  headingRef: HeadingRef
}) {
  return (
    <section aria-labelledby="desktop-heading">
      <Eyebrow>{copy.waiting.eyebrow}</Eyebrow>
      <h1
        ref={headingRef}
        {...focusableHeadingProps}
        id="desktop-heading"
        className={cn(
          focusableHeadingProps.className,
          "text-[2rem] leading-[1.12] font-bold tracking-[-0.025em] text-(--color-canvas-foreground) sm:text-[2.35rem]"
        )}
      >
        {copy.desktop.heading}
      </h1>
      <p className="mt-4 text-base leading-7 text-(--color-canvas-muted) sm:text-lg">
        {copy.desktop.body}
      </p>
      <Button
        asChild
        variant="outline"
        size="lg"
        className={cn(secondaryButtonClass, "mt-8")}
      >
        <a href={localizedPath("/verify", locale)}>
          {copy.success.fullVerification}
        </a>
      </Button>
    </section>
  )
}

/** A compact, version-resilient rendering of Safari's three setup actions. */
function SafariSetupVisual({
  waiting,
  safariSetupVariant,
}: {
  waiting: ActivationCopy["waiting"]
  safariSetupVariant: SafariSetupVariant
}) {
  const pageControl =
    safariSetupVariant === "ios18" ? waiting.pageSettings : waiting.steps[0]

  return (
    <Card
      size="sm"
      className="mt-5 w-full gap-0 rounded-[1.1rem] border border-(--color-canvas-border) bg-(--color-canvas) py-0 text-left shadow-none ring-0"
    >
      <ol
        className="w-full divide-y divide-(--color-canvas-border)"
        aria-label={waiting.inSafari}
      >
        <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3 px-4 py-3.5">
          <span className="flex size-6 items-center justify-center rounded-full bg-(--color-brand) text-xs font-bold text-white">
            1
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-(--color-canvas-foreground)">
              <img
                src="/images/support/page-menu-ios.png"
                alt=""
                width={12}
                height={16}
                className="mr-2 inline-block h-4 w-auto align-[-0.2em] opacity-80 dark:invert"
              />
              {pageControl.title}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-(--color-canvas-muted)">
              {pageControl.body}
            </p>
          </div>
        </li>

        <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3 px-4 py-4">
          <span className="flex size-6 items-center justify-center rounded-full bg-(--color-brand) text-xs font-bold text-white">
            2
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-(--color-canvas-foreground)">
              {waiting.steps[1].title}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-(--color-canvas-muted)">
              {waiting.steps[1].body}
            </p>

            <div className="mt-3 flex items-center gap-2.5 rounded-xl border border-(--color-canvas-border) bg-(--color-canvas-border)/15 px-3 py-2.5">
              <img
                src={navLogo}
                alt=""
                width={28}
                height={28}
                className="size-7 shrink-0"
              />
              <span className="min-w-0 flex-1 text-sm font-bold text-(--color-canvas-foreground)">
                GeoSpoof
              </span>
              <span className="text-xs font-bold text-(--color-brand)">
                {waiting.onLabel}
              </span>
              <span
                className="flex h-7 w-12 shrink-0 items-center justify-end rounded-full bg-(--color-brand) p-0.5 shadow-inner"
                aria-hidden="true"
              >
                <span className="size-6 rounded-full bg-white shadow-sm" />
              </span>
            </div>
          </div>
        </li>

        {/* Granting site access is its own action, not a footnote to turning the
            extension on — and it is the step people most often miss. It was
            previously rendered as an unlabelled paragraph inside step 2, which
            left `steps[2].title` translated into nine languages and never shown. */}
        <li className="grid grid-cols-[1.5rem_minmax(0,1fr)] items-start gap-3 px-4 py-3.5">
          <span className="flex size-6 items-center justify-center rounded-full bg-(--color-brand) text-xs font-bold text-white">
            3
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold text-(--color-canvas-foreground)">
              {waiting.steps[2].title}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-(--color-canvas-muted)">
              {waiting.steps[2].body}
            </p>
          </div>
        </li>
      </ol>
    </Card>
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
    <Accordion type="single" collapsible className="mt-6 w-full text-left">
      <AccordionItem
        value="troubleshooting"
        className="border-t border-(--color-canvas-border)"
      >
        <AccordionTrigger className="min-h-11 py-4 text-sm font-semibold text-(--color-canvas-foreground) hover:no-underline">
          {troubleshooting.summary}
        </AccordionTrigger>
        <AccordionContent className="pb-1 text-left text-sm leading-6 text-(--color-canvas-muted)">
          <ul className="list-outside list-disc space-y-2 pl-5 text-left">
            {troubleshooting.items.map((item) => (
              <li key={item} className="pl-1">
                {item}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex flex-col items-start">
            <Button
              asChild
              variant="link"
              className="-ml-2 min-h-11 px-2 font-bold text-(--color-brand)"
            >
              <a href={localizedPath("/support", locale)}>
                {troubleshooting.support}
                <ExternalLink className="ml-1.5 size-3.5" aria-hidden="true" />
              </a>
            </Button>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  )
}

function LocationCheckState({
  state,
  onRetry,
  copy,
  locale,
  headingRef,
}: {
  state: "idle" | "checking" | "error"
  onRetry: () => void
  copy: ActivationCopy
  locale: Locale
  headingRef: HeadingRef
}) {
  if (state !== "error") {
    return (
      <section aria-labelledby="location-check-heading">
        <Eyebrow>{copy.checking.eyebrow}</Eyebrow>
        <h1
          ref={headingRef}
          {...focusableHeadingProps}
          id="location-check-heading"
          className={cn(
            focusableHeadingProps.className,
            "text-[2rem] leading-[1.12] font-bold tracking-[-0.025em] text-(--color-canvas-foreground) sm:text-[2.35rem]"
          )}
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
        ref={headingRef}
        {...focusableHeadingProps}
        id="location-error-heading"
        className={cn(
          focusableHeadingProps.className,
          "text-[2rem] leading-[1.12] font-bold tracking-[-0.025em] text-(--color-canvas-foreground) sm:text-[2.35rem]"
        )}
      >
        {copy.error.heading}
      </h1>
      <p className="mt-4 text-base leading-7 text-(--color-canvas-muted) sm:text-lg">
        {copy.error.body}
      </p>
      <Button
        type="button"
        size="lg"
        className={cn(primaryButtonClass, "mt-8")}
        onClick={onRetry}
      >
        <RefreshCw className="size-4" aria-hidden="true" />
        {copy.error.retry}
      </Button>
      <Button
        asChild
        variant="outline"
        size="lg"
        className={cn(secondaryButtonClass, "mt-3")}
      >
        <a href={localizedPath("/support", locale)}>{copy.error.support}</a>
      </Button>
    </section>
  )
}

function SuccessState({
  location,
  copy,
  locale,
  headingRef,
}: {
  location: ReportedLocation
  copy: ActivationCopy
  locale: Locale
  headingRef: HeadingRef
}) {
  const coordinates = `${location.latitude.toFixed(5)}, ${location.longitude.toFixed(5)}`

  return (
    <section
      className="mx-auto flex w-full max-w-md flex-col items-center text-center sm:pt-4"
      aria-labelledby="success-heading"
    >
      <div role="status" aria-live="polite">
        <div className="mx-auto flex size-20 items-center justify-center rounded-full bg-(--color-brand) text-white shadow-sm">
          <Check className="size-9 stroke-[2.5]" aria-hidden="true" />
        </div>
        <span className="sr-only">{copy.success.status}</span>
        <h1
          ref={headingRef}
          {...focusableHeadingProps}
          id="success-heading"
          className={cn(
            focusableHeadingProps.className,
            "mt-5 text-[1.75rem] leading-[1.15] font-bold tracking-[-0.02em] text-(--color-canvas-foreground) sm:text-[2rem]"
          )}
        >
          {copy.success.heading}
        </h1>
      </div>

      <Card
        size="sm"
        className="mt-7 w-full gap-0 rounded-[1.25rem] border border-(--color-canvas-border) bg-(--color-canvas-border)/15 py-0 shadow-none ring-0"
      >
        <dl className="w-full divide-y divide-(--color-canvas-border) px-4">
          <ProofRow
            label={copy.success.locationLabel}
            value={coordinates}
            mono
          />
          <ProofRow
            label={copy.success.timezoneLabel}
            value={location.timezone}
          />
        </dl>
      </Card>

      <Button asChild size="lg" className={cn(primaryButtonClass, "mt-7")}>
        <a href={APP_RETURN_URL}>{copy.success.returnToApp}</a>
      </Button>
      <Button
        asChild
        variant="link"
        className="mt-2 min-h-11 px-4 font-bold text-(--color-brand)"
      >
        <a href={localizedPath("/verify", locale)}>
          {copy.success.fullVerification}
          <ExternalLink className="size-3.5" aria-hidden="true" />
        </a>
      </Button>
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
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 py-3.5 text-left">
      <dt className="text-sm font-medium text-(--color-canvas-muted)">
        {label}
      </dt>
      <dd
        className={cn(
          "max-w-48 text-right text-sm font-bold break-words text-(--color-canvas-foreground)",
          mono && "font-mono text-[0.8rem]"
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
  safariSetupVariant,
  headingRef,
}: {
  browser: ActivationBrowser
  copy: ActivationCopy
  locale: Locale
  safariSetupVariant: SafariSetupVariant
  headingRef: HeadingRef
}) {
  const [copyState, setCopyState] = React.useState<"idle" | "copied" | "error">(
    "idle"
  )
  const activationUrl = new URL(localizedPath("/activate", locale), SITE_URL)
  activationUrl.searchParams.set(
    "safari_ui",
    safariSetupVariant === "ios18" ? "18" : "26"
  )
  const activationUrlString = activationUrl.toString()
  const displayAddress = activationUrlString.replace(/^https:\/\//, "")

  const copyAddress = async () => {
    try {
      await navigator.clipboard.writeText(activationUrlString)
      setCopyState("copied")
    } catch {
      setCopyState("error")
    }
  }

  return (
    <section aria-labelledby="wrong-browser-heading">
      <Eyebrow>{copy.wrongBrowser.eyebrow}</Eyebrow>
      <h1
        ref={headingRef}
        {...focusableHeadingProps}
        id="wrong-browser-heading"
        className={cn(
          focusableHeadingProps.className,
          "max-w-lg text-[2rem] leading-[1.12] font-bold tracking-[-0.025em] text-(--color-canvas-foreground) sm:text-[2.35rem]"
        )}
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

      <Button
        type="button"
        size="lg"
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
      </Button>

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
