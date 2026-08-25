import { describe, expect, it } from "vitest"

import {
  Environment,
  InAppOwnershipType,
  NotificationTypeV2,
  OfferType,
  Subtype,
  Type,
} from "@apple/app-store-server-library"
import {
  classifyNotification,
  describeNotification,
  formatAlertMarkdown,
  formatAlertText,
  formatMoney,
  productLabel,
} from "./format"
import type {
  JWSTransactionDecodedPayload,
  ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library"

const LIFETIME = "com.moonloaf.geospoof.pro.lifetime"
const MONTHLY = "com.moonloaf.geospoof.pro.monthly"
const ANNUAL = "com.moonloaf.geospoof.pro.annual"
const TIP = "com.moonloaf.geospoof.tip.small"

function notification(
  overrides: Partial<ResponseBodyV2DecodedPayload> = {}
): ResponseBodyV2DecodedPayload {
  return {
    notificationUUID: "8d7f0b6a-0000-4000-8000-000000000001",
    data: {
      environment: Environment.PRODUCTION,
      bundleId: "com.moonloaf.geospoof",
    },
    ...overrides,
  }
}

function transaction(
  overrides: Partial<JWSTransactionDecodedPayload> = {}
): JWSTransactionDecodedPayload {
  return {
    originalTransactionId: "2000000900000001",
    transactionId: "2000000900000001",
    productId: LIFETIME,
    type: Type.NON_CONSUMABLE,
    inAppOwnershipType: InAppOwnershipType.PURCHASED,
    currency: "USD",
    price: 24_990,
    storefront: "USA",
    quantity: 1,
    ...overrides,
  }
}

describe("productLabel", () => {
  it("names the shipping SKUs", () => {
    expect(productLabel(LIFETIME)).toBe("Pro Lifetime")
    expect(productLabel(ANNUAL)).toBe("Pro Annual")
    expect(productLabel(TIP)).toBe("Coffee tip")
  })

  it("falls back to the raw id for an unknown product", () => {
    expect(productLabel("com.moonloaf.geospoof.pro.quarterly")).toBe(
      "com.moonloaf.geospoof.pro.quarterly"
    )
  })
})

describe("formatMoney", () => {
  it("converts Apple's milliunits to a currency amount", () => {
    expect(formatMoney(24_990, "USD")).toBe("$24.99")
    expect(formatMoney(2_990, "USD")).toBe("$2.99")
  })

  it("handles non-USD storefronts", () => {
    expect(formatMoney(14_990, "EUR")).toContain("14.99")
  })

  it("survives an unusable currency code", () => {
    expect(formatMoney(24_990, "XYZZY")).toBe("24.99 XYZZY")
  })

  it("omits the amount entirely when Apple sent no price", () => {
    expect(formatMoney(undefined, "USD")).toBeUndefined()
  })
})

describe("describeNotification", () => {
  it("puts product and amount on the headline for a one-time purchase", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      transaction()
    )

    expect(alert?.kind).toBe("sale")
    expect(alert?.headline).toBe("Pro Lifetime — $24.99")
    expect(alert?.details).toEqual(["USA", "one-time", "txn 2000000900000001"])
  })

  it("shows quantity when someone buys several of a consumable", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      transaction({
        productId: TIP,
        type: Type.CONSUMABLE,
        price: 1_990,
        quantity: 2,
      })
    )

    expect(alert?.headline).toBe("Coffee tip — $1.99 x2")
  })

  // Both Pro plans ship a free introductory offer, so INITIAL_BUY is a trial
  // start, not revenue. Rendering "$0.00" here would be worse than useless.
  it("reports a trial start as a trial, with no zero amount anywhere", () => {
    const alert = classifyNotification(
      notification({
        notificationType: NotificationTypeV2.SUBSCRIBED,
        subtype: Subtype.INITIAL_BUY,
      }),
      transaction({
        productId: ANNUAL,
        type: Type.AUTO_RENEWABLE_SUBSCRIPTION,
        offerType: OfferType.INTRODUCTORY_OFFER,
        price: 0,
        expiresDate: Date.UTC(2026, 8, 1),
      })
    )

    expect(alert?.kind).toBe("trial")
    expect(alert?.headline).toBe("Pro Annual — free trial started")
    expect(alert?.details).toEqual([
      "USA",
      "new subscriber",
      "converts 2026-09-01",
      "txn 2000000900000001",
    ])
    expect(formatAlertText(alert!)).not.toContain("0.00")
  })

  it("reports a paid first subscription as a sale", () => {
    const alert = describeNotification(
      notification({
        notificationType: NotificationTypeV2.SUBSCRIBED,
        subtype: Subtype.INITIAL_BUY,
      }),
      transaction({
        productId: ANNUAL,
        price: 14_990,
        expiresDate: Date.UTC(2027, 7, 24),
      })
    )

    expect(alert?.kind).toBe("sale")
    expect(alert?.headline).toBe("Pro Annual — $14.99")
    expect(alert?.details).toContain("new subscriber")
    expect(alert?.details).toContain("renews 2027-08-24")
  })

  // Recurring revenue is a different signal from a new customer, so it gets its
  // own label rather than being lumped in with sales.
  it("labels a renewal separately from a new sale", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.DID_RENEW }),
      transaction({
        productId: ANNUAL,
        price: 14_990,
        expiresDate: Date.UTC(2027, 7, 24),
      })
    )

    expect(alert?.kind).toBe("renewal")
    expect(alert?.label).toBe("RENEWAL")
    expect(alert?.headline).toBe("Pro Annual — $14.99")
    expect(alert?.details).toContain("next renewal 2027-08-24")
  })

  it("calls out a renewal that recovered from a billing failure", () => {
    const alert = describeNotification(
      notification({
        notificationType: NotificationTypeV2.DID_RENEW,
        subtype: Subtype.BILLING_RECOVERY,
      }),
      transaction({ productId: MONTHLY, price: 2_990 })
    )

    expect(alert?.details).toContain("recovered after a billing failure")
  })

  // The distinction that matters most in the whole feed: this is the real
  // message that prompted the redesign, which read "Pro Monthly expired /
  // €0.00 (NLD)" and buried the fact that nobody had ever paid.
  it("distinguishes a lapsed trial from a paying subscriber leaving", () => {
    const lapsedTrial = classifyNotification(
      notification({
        notificationType: NotificationTypeV2.EXPIRED,
        subtype: Subtype.VOLUNTARY,
      }),
      transaction({
        productId: MONTHLY,
        price: 0,
        currency: "EUR",
        storefront: "NLD",
        originalTransactionId: "700002746839062",
      })
    )

    expect(lapsedTrial?.kind).toBe("churn")
    expect(lapsedTrial?.headline).toBe(
      "Pro Monthly — trial ended, never charged"
    )
    expect(lapsedTrial?.details).toContain("cancelled during trial")
    expect(formatAlertText(lapsedTrial!)).not.toContain("0.00")

    const payerLeft = classifyNotification(
      notification({
        notificationType: NotificationTypeV2.EXPIRED,
        subtype: Subtype.VOLUNTARY,
      }),
      transaction({ productId: MONTHLY, price: 2_990 })
    )

    expect(payerLeft?.headline).toBe("Pro Monthly — lapsed, was $2.99")
    expect(payerLeft?.details).toContain("cancelled")
  })

  it("explains why a subscription expired when Apple says", () => {
    const billing = classifyNotification(
      notification({
        notificationType: NotificationTypeV2.EXPIRED,
        subtype: Subtype.BILLING_RETRY,
      }),
      transaction({ productId: MONTHLY, price: 2_990 })
    )
    expect(billing?.details).toContain("billing failed")

    const priceIncrease = classifyNotification(
      notification({
        notificationType: NotificationTypeV2.EXPIRED,
        subtype: Subtype.PRICE_INCREASE,
      }),
      transaction({ productId: MONTHLY, price: 2_990 })
    )
    expect(priceIncrease?.details).toContain("declined a price increase")
  })

  it("shows what is at stake when auto-renew is turned off", () => {
    const alert = classifyNotification(
      notification({
        notificationType: NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS,
        subtype: Subtype.AUTO_RENEW_DISABLED,
      }),
      transaction({
        productId: MONTHLY,
        price: 2_990,
        expiresDate: Date.UTC(2026, 11, 25),
      })
    )

    expect(alert?.kind).toBe("churn")
    expect(alert?.headline).toBe("Pro Monthly — auto-renew turned off")
    expect(alert?.details).toContain("access until 2026-12-25")
    expect(alert?.details).toContain("was $2.99")
  })

  it("says when a cancelled subscriber was still on a trial", () => {
    const alert = classifyNotification(
      notification({
        notificationType: NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS,
        subtype: Subtype.AUTO_RENEW_DISABLED,
      }),
      transaction({ productId: MONTHLY, price: 0 })
    )

    expect(alert?.details).toContain("was on a free trial")
  })

  it("renders a refund as money leaving", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.REFUND }),
      transaction()
    )

    expect(alert?.kind).toBe("refund")
    expect(alert?.headline).toBe("Pro Lifetime — \u2212$24.99")
  })

  it("flags a failed payment with the amount at risk", () => {
    const alert = classifyNotification(
      notification({
        notificationType: NotificationTypeV2.DID_FAIL_TO_RENEW,
        subtype: Subtype.GRACE_PERIOD,
      }),
      transaction({ productId: MONTHLY, price: 2_990 })
    )

    expect(alert?.kind).toBe("churn")
    expect(alert?.headline).toBe("Pro Monthly — payment failed, $2.99 at risk")
    expect(alert?.details).toContain("in grace period, still has access")
  })

  // Family Sharing produces the same notification type as a purchase but no
  // charge, so it must never be counted as a sale.
  it("separates Family Sharing access from a purchase", () => {
    const alert = classifyNotification(
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      transaction({ inAppOwnershipType: InAppOwnershipType.FAMILY_SHARED })
    )

    expect(alert?.kind).toBe("info")
    expect(alert?.headline).toBe("Pro Lifetime — Family Sharing, no charge")
  })

  it("reports a requested test notification so the wiring is verifiable", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.TEST }),
      undefined
    )

    expect(alert?.kind).toBe("info")
    expect(alert?.headline).toContain("Test notification")
  })

  it("stays quiet for plumbing notifications and unknown types", () => {
    for (const notificationType of [
      NotificationTypeV2.CONSUMPTION_REQUEST,
      NotificationTypeV2.RENEWAL_EXTENSION,
      NotificationTypeV2.PRICE_INCREASE,
      NotificationTypeV2.METADATA_UPDATE,
      NotificationTypeV2.EXTERNAL_PURCHASE_TOKEN,
      "SOMETHING_APPLE_ADDED_LATER",
    ]) {
      expect(
        describeNotification(notification({ notificationType }), transaction())
      ).toBeNull()
    }
  })
})

describe("formatAlertText", () => {
  it("renders two lines: what and how much, then context", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      transaction()
    )

    expect(formatAlertText(alert!)).toBe(
      "[SALE] Pro Lifetime — $24.99\nUSA · one-time · txn 2000000900000001"
    )
  })

  it("leaves production lines untagged", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      transaction()
    )

    expect(formatAlertText(alert!)).not.toContain("[Sandbox]")
    expect(formatAlertText(alert!)).not.toContain("[env?]")
  })

  it("tags sandbox so TestFlight and App Review can't look like revenue", () => {
    const alert = describeNotification(
      notification({
        notificationType: NotificationTypeV2.ONE_TIME_CHARGE,
        data: { environment: Environment.SANDBOX },
      }),
      transaction()
    )

    expect(formatAlertText(alert!)).toContain("[SALE] [Sandbox]")
  })

  // An untagged line must always be trustworthy as real money, so a missing
  // environment gets flagged rather than silently passing as production.
  it("tags a missing environment instead of assuming production", () => {
    const alert = describeNotification(
      notification({
        notificationType: NotificationTypeV2.ONE_TIME_CHARGE,
        data: {},
      }),
      transaction()
    )

    expect(formatAlertText(alert!)).toContain("[SALE] [env?]")
  })
})

describe("formatAlertMarkdown", () => {
  it("bolds only the headline line, so the feed is skimmable", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      transaction()
    )

    expect(formatAlertMarkdown(alert!)).toBe(
      "**[SALE] Pro Lifetime — $24.99**\nUSA · one-time · txn 2000000900000001"
    )
  })
})

// The feed carries revenue only. These events are all real, all classified
// above, and all deliberately not delivered — a feed you learn to ignore is
// worse than no feed.
describe("the revenue-only filter", () => {
  const nonRevenue: Array<
    [string, ResponseBodyV2DecodedPayload, JWSTransactionDecodedPayload]
  > = [
    [
      "trial start",
      notification({
        notificationType: NotificationTypeV2.SUBSCRIBED,
        subtype: Subtype.INITIAL_BUY,
      }),
      transaction({
        productId: MONTHLY,
        price: 0,
        offerType: OfferType.INTRODUCTORY_OFFER,
      }),
    ],
    [
      "trial lapsed",
      notification({
        notificationType: NotificationTypeV2.EXPIRED,
        subtype: Subtype.VOLUNTARY,
      }),
      transaction({ productId: MONTHLY, price: 0 }),
    ],
    [
      "paying subscriber lapsed",
      notification({ notificationType: NotificationTypeV2.EXPIRED }),
      transaction({ productId: MONTHLY, price: 2_990 }),
    ],
    [
      "auto-renew turned off",
      notification({
        notificationType: NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS,
        subtype: Subtype.AUTO_RENEW_DISABLED,
      }),
      transaction({ productId: MONTHLY, price: 2_990 }),
    ],
    [
      "billing failure",
      notification({ notificationType: NotificationTypeV2.DID_FAIL_TO_RENEW }),
      transaction({ productId: MONTHLY, price: 2_990 }),
    ],
    [
      "grace period ended",
      notification({
        notificationType: NotificationTypeV2.GRACE_PERIOD_EXPIRED,
      }),
      transaction({ productId: MONTHLY, price: 2_990 }),
    ],
    [
      "Family Sharing grant",
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      transaction({ inAppOwnershipType: InAppOwnershipType.FAMILY_SHARED }),
    ],
    [
      "downgrade scheduled",
      notification({
        notificationType: NotificationTypeV2.DID_CHANGE_RENEWAL_PREF,
        subtype: Subtype.DOWNGRADE,
      }),
      transaction({ productId: MONTHLY, price: 2_990 }),
    ],
  ]

  it.each(nonRevenue)("suppresses %s", (_name, payload, txn) => {
    // Still classified — just not delivered.
    expect(classifyNotification(payload, txn)).not.toBeNull()
    expect(describeNotification(payload, txn)).toBeNull()
  })

  it.each([
    ["a one-time charge", NotificationTypeV2.ONE_TIME_CHARGE, "sale"],
    ["a renewal", NotificationTypeV2.DID_RENEW, "renewal"],
    ["a refund", NotificationTypeV2.REFUND, "refund"],
  ])("delivers %s", (_name, notificationType, kind) => {
    const alert = describeNotification(
      notification({ notificationType }),
      transaction()
    )
    expect(alert?.kind).toBe(kind)
  })

  // Money coming back after a dispute is revenue, so it stays in the feed.
  it("delivers a reversed refund", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.REFUND_REVERSED }),
      transaction()
    )

    expect(alert?.kind).toBe("sale")
    expect(alert?.headline).toContain("refund reversed")
  })

  // A free promotional offer redeemed on an existing plan charges nothing.
  it("suppresses a zero-amount sale", () => {
    expect(
      describeNotification(
        notification({ notificationType: NotificationTypeV2.OFFER_REDEEMED }),
        transaction({ productId: MONTHLY, price: 0 })
      )
    ).toBeNull()
  })

  // Apple omits price on some transactions; a real sale must not vanish because
  // the amount didn't come through.
  it("still delivers a sale whose price Apple omitted", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      transaction({ price: undefined, currency: undefined })
    )

    expect(alert?.kind).toBe("sale")
    expect(alert?.headline).toBe("Pro Lifetime — amount unknown")
  })

  // Sent only when explicitly requested, so it can't be noise — and it's the
  // only way to verify the endpoint without waiting for a sale.
  it("still delivers a requested TEST notification", () => {
    expect(
      describeNotification(
        notification({ notificationType: NotificationTypeV2.TEST }),
        undefined
      )?.kind
    ).toBe("info")
  })
})
