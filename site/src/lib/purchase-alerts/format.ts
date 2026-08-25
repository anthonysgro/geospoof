/**
 * Turns a verified App Store notification into the line that lands in chat.
 * Pure and side-effect free so it can be unit tested against fixtures without
 * any Apple credentials or network.
 *
 * Written to be read as an operational feed — a day's worth of these should be
 * scannable in one pass on a phone. That drove four rules:
 *
 *  1. **Line one answers "what and how much".** Product and money go together,
 *     because those are the two facts worth scrolling for. Context (country,
 *     dates, ids) drops to line two.
 *  2. **Never print a bare zero.** A subscription "purchase" is usually not
 *     money yet: both Pro plans ship a free introductory offer, so
 *     `SUBSCRIBED/INITIAL_BUY` fires at trial start with `price: 0`. And on a
 *     churn event, `price: 0` means a trial lapsed rather than a payer leaving —
 *     the single most important distinction in the whole feed. Both say so in
 *     words instead of rendering "$0.00".
 *  3. **New money, recurring money and lost money are different labels.** SALE,
 *     RENEWAL and CHURN are separate so the feed can be skimmed for the one you
 *     care about, and a refund shows a negative amount.
 *  4. **An untagged line always means real money.** Anything not explicitly
 *     Production is tagged, including a missing environment, so silence is never
 *     ambiguous.
 *
 * Family Sharing gets its own label for the same reason as trials: it produces
 * the same notification types as a purchase, with no charge attached.
 */

import {
  InAppOwnershipType,
  NotificationTypeV2,
  OfferType,
  Subtype,
} from "@apple/app-store-server-library"
import type {
  JWSTransactionDecodedPayload,
  ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library"

export type AlertKind =
  | "sale"
  | "renewal"
  | "trial"
  | "churn"
  | "refund"
  | "info"

export interface PurchaseAlert {
  readonly kind: AlertKind
  /** Short scannable prefix, e.g. "SALE". */
  readonly label: string
  /** Line one: product plus the money or its absence, e.g. "Pro Lifetime — $24.99". */
  readonly headline: string
  /** Line two: country, dates, transaction id. */
  readonly details: ReadonlyArray<string>
  /** "Production" | "Sandbox" | undefined when Apple didn't say. */
  readonly environment: string | undefined
}

const LABELS: Record<AlertKind, string> = {
  sale: "SALE",
  renewal: "RENEWAL",
  trial: "TRIAL",
  churn: "CHURN",
  refund: "REFUND",
  info: "INFO",
}

/**
 * Friendly names for the six SKUs (see `ProStore.ProductID` and `TipStore`).
 * Unknown ids fall through to the raw product id rather than being dropped, so a
 * newly added SKU still produces a usable alert before this map is updated.
 */
const PRODUCT_NAMES: Record<string, string> = {
  "com.moonloaf.geospoof.pro.monthly": "Pro Monthly",
  "com.moonloaf.geospoof.pro.annual": "Pro Annual",
  "com.moonloaf.geospoof.pro.lifetime": "Pro Lifetime",
  "com.moonloaf.geospoof.tip.small": "Coffee tip",
  "com.moonloaf.geospoof.tip.medium": "Lunch tip",
  "com.moonloaf.geospoof.tip.large": "Dinner tip",
}

export function productLabel(productId: string | undefined): string {
  if (!productId) return "an in-app purchase"
  return PRODUCT_NAMES[productId] ?? productId
}

/**
 * Apple reports `price` in milliunits of `currency` (24990 = 24.99). Returns
 * undefined when either half is missing, so callers can omit the amount rather
 * than print something misleading.
 */
export function formatMoney(
  priceMilliunits: number | undefined,
  currency: string | undefined
): string | undefined {
  if (
    typeof priceMilliunits !== "number" ||
    !Number.isFinite(priceMilliunits)
  ) {
    return undefined
  }
  const units = priceMilliunits / 1000
  if (!currency) return units.toFixed(2)
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(units)
  } catch {
    // Unknown/invalid ISO 4217 code — still report the number.
    return `${units.toFixed(2)} ${currency}`
  }
}

function formatDate(ms: number | undefined): string | undefined {
  if (typeof ms !== "number" || !Number.isFinite(ms)) return undefined
  const date = new Date(ms)
  return Number.isNaN(date.getTime())
    ? undefined
    : date.toISOString().slice(0, 10)
}

function isFamilyShared(
  transaction: JWSTransactionDecodedPayload | undefined
): boolean {
  return transaction?.inAppOwnershipType === InAppOwnershipType.FAMILY_SHARED
}

/** True when Apple charged nothing for this transaction. */
function isFree(
  transaction: JWSTransactionDecodedPayload | undefined
): boolean {
  return transaction?.price === 0
}

/** A free introductory offer, i.e. a trial rather than a charge. */
function isFreeTrial(
  transaction: JWSTransactionDecodedPayload | undefined
): boolean {
  if (!transaction) return false
  return (
    transaction.offerType === OfferType.INTRODUCTORY_OFFER ||
    isFree(transaction)
  )
}

/**
 * The amount, with quantity when someone bought several of a consumable.
 * `negative` renders money leaving the account, which is what makes a refund
 * readable at a glance.
 */
function amount(
  transaction: JWSTransactionDecodedPayload | undefined,
  { negative = false }: { negative?: boolean } = {}
): string | undefined {
  const money = formatMoney(transaction?.price, transaction?.currency)
  if (!money) return undefined
  const quantity =
    typeof transaction?.quantity === "number" && transaction.quantity > 1
      ? ` x${transaction.quantity}`
      : ""
  // U+2212 minus, not a hyphen: unambiguous next to a currency symbol.
  return `${negative ? "\u2212" : ""}${money}${quantity}`
}

interface Verdict {
  kind: AlertKind
  /** Product plus money/no-money, rendered as line one. */
  headline: string
  /** Context for line two, in reading order. Falsy entries are dropped. */
  details?: ReadonlyArray<string | undefined>
}

/**
 * Map notification type + subtype to a verdict, or null for the types we
 * deliberately stay quiet about (consumption requests, price-increase notices,
 * renewal-date extensions, Advanced Commerce and external-purchase plumbing).
 * Staying quiet is the default for anything unrecognised: this feed is only
 * useful if every message in it is worth reading.
 */
function verdictFor(
  payload: ResponseBodyV2DecodedPayload,
  transaction: JWSTransactionDecodedPayload | undefined
): Verdict | null {
  const product = productLabel(transaction?.productId)
  const paid = amount(transaction)
  const expires = formatDate(transaction?.expiresDate)

  switch (payload.notificationType) {
    case NotificationTypeV2.SUBSCRIBED: {
      if (isFamilyShared(transaction)) {
        return {
          kind: "info",
          headline: `${product} — Family Sharing, no charge`,
        }
      }
      const returning = payload.subtype === Subtype.RESUBSCRIBE
      if (isFreeTrial(transaction)) {
        return {
          kind: "trial",
          headline: `${product} — free trial started`,
          details: [
            returning ? "returning subscriber" : "new subscriber",
            expires ? `converts ${expires}` : undefined,
          ],
        }
      }
      return {
        kind: "sale",
        headline: `${product} — ${paid ?? "amount unknown"}`,
        details: [
          returning ? "resubscribed" : "new subscriber",
          expires ? `renews ${expires}` : undefined,
        ],
      }
    }

    case NotificationTypeV2.DID_RENEW:
      return {
        kind: "renewal",
        headline: `${product} — ${paid ?? "amount unknown"}`,
        details: [
          payload.subtype === Subtype.BILLING_RECOVERY
            ? "recovered after a billing failure"
            : undefined,
          expires ? `next renewal ${expires}` : undefined,
        ],
      }

    case NotificationTypeV2.ONE_TIME_CHARGE:
      if (isFamilyShared(transaction)) {
        return {
          kind: "info",
          headline: `${product} — Family Sharing, no charge`,
        }
      }
      return {
        kind: "sale",
        headline: `${product} — ${paid ?? "amount unknown"}`,
        details: ["one-time"],
      }

    case NotificationTypeV2.OFFER_REDEEMED:
      return {
        kind: "sale",
        headline: `${product} — ${paid ?? "offer redeemed"}`,
        details: ["offer redeemed", expires ? `renews ${expires}` : undefined],
      }

    case NotificationTypeV2.REFUND:
      return {
        kind: "refund",
        headline: `${product} — ${amount(transaction, { negative: true }) ?? "refunded"}`,
        details: ["refunded by Apple"],
      }

    case NotificationTypeV2.REFUND_REVERSED:
      return {
        kind: "info",
        headline: `${product} — refund reversed, ${paid ?? "amount unknown"} restored`,
      }

    case NotificationTypeV2.REVOKE:
      return {
        kind: "churn",
        headline: `${product} — Family Sharing access revoked`,
      }

    case NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS:
      if (payload.subtype === Subtype.AUTO_RENEW_DISABLED) {
        return {
          kind: "churn",
          headline: `${product} — auto-renew turned off`,
          details: [
            expires ? `access until ${expires}` : undefined,
            // What you stand to lose at that date, which is the actionable part.
            isFree(transaction)
              ? "was on a free trial"
              : paid
                ? `was ${paid}`
                : undefined,
          ],
        }
      }
      return {
        kind: "info",
        headline: `${product} — auto-renew turned back on`,
        details: [expires ? `renews ${expires}` : undefined],
      }

    case NotificationTypeV2.DID_CHANGE_RENEWAL_PREF: {
      if (payload.subtype === Subtype.UPGRADE) {
        return {
          kind: "sale",
          headline: `${product} — upgraded, ${paid ?? "amount unknown"}`,
        }
      }
      if (payload.subtype === Subtype.DOWNGRADE) {
        return {
          kind: "info",
          headline: `${product} — downgrade scheduled`,
          details: [expires ? `takes effect ${expires}` : undefined],
        }
      }
      return { kind: "info", headline: `${product} — plan change cancelled` }
    }

    case NotificationTypeV2.EXPIRED: {
      // The distinction that matters: a payer leaving vs a trial that never
      // converted. Same notification type, completely different news.
      if (isFree(transaction)) {
        return {
          kind: "churn",
          headline: `${product} — trial ended, never charged`,
          details: [
            payload.subtype === Subtype.VOLUNTARY
              ? "cancelled during trial"
              : undefined,
          ],
        }
      }
      return {
        kind: "churn",
        headline: `${product} — lapsed${paid ? `, was ${paid}` : ""}`,
        details: [
          payload.subtype === Subtype.BILLING_RETRY
            ? "billing failed"
            : payload.subtype === Subtype.VOLUNTARY
              ? "cancelled"
              : payload.subtype === Subtype.PRICE_INCREASE
                ? "declined a price increase"
                : undefined,
        ],
      }
    }

    case NotificationTypeV2.DID_FAIL_TO_RENEW:
      return {
        kind: "churn",
        headline: `${product} — payment failed${paid ? `, ${paid} at risk` : ""}`,
        details: [
          payload.subtype === Subtype.GRACE_PERIOD
            ? "in grace period, still has access"
            : "in billing retry",
        ],
      }

    case NotificationTypeV2.GRACE_PERIOD_EXPIRED:
      return {
        kind: "churn",
        headline: `${product} — grace period ended, access cut off`,
      }

    case NotificationTypeV2.TEST:
      return {
        kind: "info",
        headline: "Test notification — the webhook works",
      }

    default:
      return null
  }
}

/**
 * Build the alert for a verified notification, or null when this event type is
 * intentionally not reported.
 */
export function describeNotification(
  payload: ResponseBodyV2DecodedPayload,
  transaction: JWSTransactionDecodedPayload | undefined
): PurchaseAlert | null {
  const verdict = verdictFor(payload, transaction)
  if (!verdict) return null

  const details: Array<string> = []
  // Country first: it frames everything after it, and it's the field that makes
  // a feed feel like a map of where the product is landing.
  if (transaction?.storefront) details.push(transaction.storefront)
  for (const line of verdict.details ?? []) {
    if (line) details.push(line)
  }
  // Opaque, Apple-issued id, last because it's for lookups rather than reading.
  // No customer identity is available here (GeoSpoof sets no appAccountToken),
  // and none should be added — this is the field that ties an alert back to a
  // specific transaction in App Store Connect.
  if (transaction?.originalTransactionId) {
    details.push(`txn ${transaction.originalTransactionId}`)
  }

  return {
    kind: verdict.kind,
    label: LABELS[verdict.kind],
    headline: verdict.headline,
    details,
    environment: payload.data?.environment,
  }
}

/**
 * Tag for anything that isn't confirmed real money. A missing environment is
 * tagged too, so an untagged line can always be trusted as production.
 */
function environmentTag(environment: string | undefined): string {
  if (environment === "Production") return ""
  if (!environment) return " [env?]"
  return ` [${environment}]`
}

/** Render an alert as the plain-text lines posted to chat. */
export function formatAlertText(alert: PurchaseAlert): string {
  const head = `[${alert.label}]${environmentTag(alert.environment)} ${alert.headline}`
  return alert.details.length > 0
    ? `${head}\n${alert.details.join(" · ")}`
    : head
}

/**
 * Discord variant: same content, with the label and headline bolded so a day's
 * events can be skimmed by eye. Kept out of `formatAlertText` because Slack uses
 * different markup and a generic consumer wants none.
 */
export function formatAlertMarkdown(alert: PurchaseAlert): string {
  const head = `**[${alert.label}]${environmentTag(alert.environment)} ${alert.headline}**`
  return alert.details.length > 0
    ? `${head}\n${alert.details.join(" · ")}`
    : head
}
