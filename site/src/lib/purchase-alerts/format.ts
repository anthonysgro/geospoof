/**
 * Turns a verified App Store notification into the one-line alert that lands in
 * chat. Pure and side-effect free so it can be unit tested against fixtures
 * without any Apple credentials or network.
 *
 * Two deliberate editorial choices:
 *
 *  1. A subscription "purchase" is usually not money yet. Both Pro plans ship a
 *     free introductory offer, so `SUBSCRIBED / INITIAL_BUY` fires at trial
 *     start with `price: 0`. Reporting that as a sale would overstate revenue,
 *     so trials get their own label and the conversion date.
 *  2. Family Sharing access produces the same `ONE_TIME_CHARGE` /`SUBSCRIBED`
 *     types as a real purchase, with `inAppOwnershipType: FAMILY_SHARED` and no
 *     new charge. It's labelled separately for the same reason.
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

export type AlertKind = "sale" | "trial" | "churn" | "refund" | "info"

export interface PurchaseAlert {
  readonly kind: AlertKind
  /** Short scannable prefix, e.g. "SALE". */
  readonly label: string
  /** The headline, e.g. "Pro Lifetime bought". */
  readonly headline: string
  /** Supporting lines: money, storefront, plan dates, ids. */
  readonly details: ReadonlyArray<string>
  /** "Production" | "Sandbox" — sandbox alerts are tagged so they can't be mistaken for revenue. */
  readonly environment: string | undefined
}

const LABELS: Record<AlertKind, string> = {
  sale: "SALE",
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
 * undefined when either half is missing, so callers can omit the line entirely
 * instead of printing a misleading "0".
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
  const amount = priceMilliunits / 1000
  if (!currency) return amount.toFixed(2)
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
    }).format(amount)
  } catch {
    // Unknown/invalid ISO 4217 code — still report the number.
    return `${amount.toFixed(2)} ${currency}`
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

/** A free introductory offer, i.e. a trial rather than a charge. */
function isFreeTrial(
  transaction: JWSTransactionDecodedPayload | undefined
): boolean {
  if (!transaction) return false
  if (transaction.offerType === OfferType.INTRODUCTORY_OFFER) return true
  return transaction.price === 0
}

function moneyDetail(
  transaction: JWSTransactionDecodedPayload | undefined
): string | undefined {
  const money = formatMoney(transaction?.price, transaction?.currency)
  if (!money) return undefined
  const storefront = transaction?.storefront
  const quantity =
    typeof transaction?.quantity === "number" && transaction.quantity > 1
      ? ` x${transaction.quantity}`
      : ""
  return storefront
    ? `${money}${quantity} (${storefront})`
    : `${money}${quantity}`
}

interface Verdict {
  kind: AlertKind
  headline: string
  /** Extra lines specific to this verdict, appended after the money line. */
  extra?: ReadonlyArray<string | undefined>
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
  const renews = formatDate(transaction?.expiresDate)

  switch (payload.notificationType) {
    case NotificationTypeV2.SUBSCRIBED: {
      if (isFamilyShared(transaction)) {
        return {
          kind: "info",
          headline: `${product} shared via Family Sharing`,
        }
      }
      const first =
        payload.subtype === Subtype.RESUBSCRIBE
          ? "Resubscribed to"
          : "New subscriber:"
      if (isFreeTrial(transaction)) {
        return {
          kind: "trial",
          headline: `${first} ${product} (free trial)`,
          extra: [renews ? `Converts ${renews}` : undefined],
        }
      }
      return {
        kind: "sale",
        headline: `${first} ${product}`,
        extra: [renews ? `Renews ${renews}` : undefined],
      }
    }

    case NotificationTypeV2.DID_RENEW:
      return {
        kind: "sale",
        headline:
          payload.subtype === Subtype.BILLING_RECOVERY
            ? `${product} renewed (billing recovered)`
            : `${product} renewed`,
        extra: [renews ? `Next renewal ${renews}` : undefined],
      }

    case NotificationTypeV2.ONE_TIME_CHARGE:
      if (isFamilyShared(transaction)) {
        return {
          kind: "info",
          headline: `${product} shared via Family Sharing`,
        }
      }
      return { kind: "sale", headline: `${product} bought` }

    case NotificationTypeV2.OFFER_REDEEMED:
      return { kind: "sale", headline: `Offer redeemed on ${product}` }

    case NotificationTypeV2.REFUND:
      return { kind: "refund", headline: `${product} refunded` }

    case NotificationTypeV2.REFUND_REVERSED:
      return { kind: "info", headline: `Refund reversed on ${product}` }

    case NotificationTypeV2.REVOKE:
      return {
        kind: "churn",
        headline: `${product} access revoked (Family Sharing ended)`,
      }

    case NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS:
      if (payload.subtype === Subtype.AUTO_RENEW_DISABLED) {
        return {
          kind: "churn",
          headline: `Auto-renew turned off for ${product}`,
          extra: [renews ? `Access until ${renews}` : undefined],
        }
      }
      return {
        kind: "info",
        headline: `Auto-renew turned back on for ${product}`,
      }

    case NotificationTypeV2.DID_CHANGE_RENEWAL_PREF: {
      if (payload.subtype === Subtype.UPGRADE) {
        return { kind: "sale", headline: `Upgraded to ${product}` }
      }
      if (payload.subtype === Subtype.DOWNGRADE) {
        return { kind: "info", headline: `Downgrade scheduled to ${product}` }
      }
      return { kind: "info", headline: `Plan change cancelled on ${product}` }
    }

    case NotificationTypeV2.EXPIRED:
      return {
        kind: "churn",
        headline:
          payload.subtype === Subtype.BILLING_RETRY
            ? `${product} expired (billing failed)`
            : `${product} expired`,
      }

    case NotificationTypeV2.DID_FAIL_TO_RENEW:
      return {
        kind: "churn",
        headline: `${product} failed to renew (billing retry${
          payload.subtype === Subtype.GRACE_PERIOD ? ", in grace period" : ""
        })`,
      }

    case NotificationTypeV2.GRACE_PERIOD_EXPIRED:
      return { kind: "churn", headline: `${product} grace period ended` }

    case NotificationTypeV2.TEST:
      return {
        kind: "info",
        headline: "Test notification received — the webhook works",
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
  const money = moneyDetail(transaction)
  // A trial's "$0.00" line adds nothing the headline doesn't already say.
  if (money && verdict.kind !== "trial") details.push(money)
  for (const line of verdict.extra ?? []) {
    if (line) details.push(line)
  }
  // Opaque, Apple-issued id. No customer identity is available here (GeoSpoof
  // sets no appAccountToken), and none should be added — it's the one field that
  // makes an alert traceable back to a specific transaction in App Store Connect.
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

/** Render an alert as the plain-text line posted to chat. */
export function formatAlertText(alert: PurchaseAlert): string {
  const sandboxTag =
    alert.environment && alert.environment !== "Production" ? " [Sandbox]" : ""
  const head = `[${alert.label}]${sandboxTag} ${alert.headline}`
  return alert.details.length > 0
    ? `${head}\n${alert.details.join(" · ")}`
    : head
}
