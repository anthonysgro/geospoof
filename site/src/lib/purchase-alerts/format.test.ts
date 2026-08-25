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
  describeNotification,
  formatAlertText,
  formatMoney,
  productLabel,
} from "./format"
import type {
  JWSTransactionDecodedPayload,
  ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library"

const LIFETIME = "com.moonloaf.geospoof.pro.lifetime"
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
  it("names the six shipping SKUs", () => {
    expect(productLabel(LIFETIME)).toBe("Pro Lifetime")
    expect(productLabel(ANNUAL)).toBe("Pro Annual")
    expect(productLabel(TIP)).toBe("Coffee tip")
  })

  it("falls back to the raw id for an unknown product", () => {
    expect(productLabel("com.moonloaf.geospoof.pro.quarterly")).toBe(
      "com.moonloaf.geospoof.pro.quarterly"
    )
  })

  it("stays readable when no product is present", () => {
    expect(productLabel(undefined)).toBe("an in-app purchase")
  })
})

describe("formatMoney", () => {
  it("converts Apple's milliunits to a currency amount", () => {
    expect(formatMoney(24_990, "USD")).toBe("$24.99")
    expect(formatMoney(1_990, "USD")).toBe("$1.99")
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
  it("reports a lifetime purchase as a sale with the amount and storefront", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      transaction()
    )

    expect(alert).not.toBeNull()
    expect(alert?.kind).toBe("sale")
    expect(alert?.headline).toBe("Pro Lifetime bought")
    expect(alert?.details).toContain("$24.99 (USA)")
    expect(alert?.details).toContain("txn 2000000900000001")
  })

  it("reports a tip purchase, including quantity above one", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      transaction({
        productId: TIP,
        type: Type.CONSUMABLE,
        price: 1_990,
        quantity: 2,
      })
    )

    expect(alert?.kind).toBe("sale")
    expect(alert?.headline).toBe("Coffee tip bought")
    expect(alert?.details).toContain("$1.99 x2 (USA)")
  })

  // Both Pro plans ship a free introductory offer, so INITIAL_BUY is a trial
  // start, not revenue. Mislabelling this would inflate every launch week.
  it("labels an introductory-offer subscription as a trial, not a sale", () => {
    const alert = describeNotification(
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
    expect(alert?.headline).toBe("New subscriber: Pro Annual (free trial)")
    expect(alert?.details).toContain("Converts 2026-09-01")
    // A "$0.00" line would be noise next to that headline.
    expect(alert?.details.some((line) => line.includes("0.00"))).toBe(false)
  })

  it("reports a paid first subscription as a sale with the renewal date", () => {
    const alert = describeNotification(
      notification({
        notificationType: NotificationTypeV2.SUBSCRIBED,
        subtype: Subtype.INITIAL_BUY,
      }),
      transaction({
        productId: ANNUAL,
        type: Type.AUTO_RENEWABLE_SUBSCRIPTION,
        price: 14_990,
        expiresDate: Date.UTC(2027, 7, 24),
      })
    )

    expect(alert?.kind).toBe("sale")
    expect(alert?.headline).toBe("New subscriber: Pro Annual")
    expect(alert?.details).toContain("$14.99 (USA)")
    expect(alert?.details).toContain("Renews 2027-08-24")
  })

  it("distinguishes a resubscribe from a first-time subscriber", () => {
    const alert = describeNotification(
      notification({
        notificationType: NotificationTypeV2.SUBSCRIBED,
        subtype: Subtype.RESUBSCRIBE,
      }),
      transaction({ productId: ANNUAL, price: 14_990 })
    )

    expect(alert?.headline).toBe("Resubscribed to Pro Annual")
  })

  it("reports renewals, and says so when billing recovered", () => {
    const renewal = describeNotification(
      notification({ notificationType: NotificationTypeV2.DID_RENEW }),
      transaction({ productId: ANNUAL, price: 14_990 })
    )
    expect(renewal?.kind).toBe("sale")
    expect(renewal?.headline).toBe("Pro Annual renewed")

    const recovered = describeNotification(
      notification({
        notificationType: NotificationTypeV2.DID_RENEW,
        subtype: Subtype.BILLING_RECOVERY,
      }),
      transaction({ productId: ANNUAL, price: 14_990 })
    )
    expect(recovered?.headline).toBe("Pro Annual renewed (billing recovered)")
  })

  // Family Sharing produces the same notification type as a purchase but no
  // charge, so it must not be counted as a sale.
  it("separates Family Sharing access from a purchase", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      transaction({ inAppOwnershipType: InAppOwnershipType.FAMILY_SHARED })
    )

    expect(alert?.kind).toBe("info")
    expect(alert?.headline).toBe("Pro Lifetime shared via Family Sharing")
  })

  it("reports refunds and cancellations", () => {
    expect(
      describeNotification(
        notification({ notificationType: NotificationTypeV2.REFUND }),
        transaction()
      )?.kind
    ).toBe("refund")

    const cancelled = describeNotification(
      notification({
        notificationType: NotificationTypeV2.DID_CHANGE_RENEWAL_STATUS,
        subtype: Subtype.AUTO_RENEW_DISABLED,
      }),
      transaction({ productId: ANNUAL, expiresDate: Date.UTC(2026, 11, 25) })
    )
    expect(cancelled?.kind).toBe("churn")
    expect(cancelled?.headline).toBe("Auto-renew turned off for Pro Annual")
    expect(cancelled?.details).toContain("Access until 2026-12-25")

    expect(
      describeNotification(
        notification({
          notificationType: NotificationTypeV2.EXPIRED,
          subtype: Subtype.BILLING_RETRY,
        }),
        transaction({ productId: ANNUAL })
      )?.headline
    ).toBe("Pro Annual expired (billing failed)")
  })

  it("reports a requested test notification so the wiring is verifiable", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.TEST }),
      undefined
    )

    expect(alert?.kind).toBe("info")
    expect(alert?.headline).toContain("Test notification")
  })

  it("stays quiet for plumbing notifications", () => {
    for (const notificationType of [
      NotificationTypeV2.CONSUMPTION_REQUEST,
      NotificationTypeV2.RENEWAL_EXTENSION,
      NotificationTypeV2.PRICE_INCREASE,
      NotificationTypeV2.METADATA_UPDATE,
      NotificationTypeV2.EXTERNAL_PURCHASE_TOKEN,
    ]) {
      expect(
        describeNotification(notification({ notificationType }), transaction())
      ).toBeNull()
    }
  })

  it("stays quiet for a notification type it has never seen", () => {
    expect(
      describeNotification(
        notification({ notificationType: "SOMETHING_APPLE_ADDED_LATER" }),
        transaction()
      )
    ).toBeNull()
  })
})

describe("formatAlertText", () => {
  it("puts the label first and the details on a second line", () => {
    const alert = describeNotification(
      notification({ notificationType: NotificationTypeV2.ONE_TIME_CHARGE }),
      transaction()
    )

    expect(formatAlertText(alert!)).toBe(
      "[SALE] Pro Lifetime bought\n$24.99 (USA) · txn 2000000900000001"
    )
  })

  it("tags sandbox events so TestFlight and App Review can't look like revenue", () => {
    const alert = describeNotification(
      notification({
        notificationType: NotificationTypeV2.ONE_TIME_CHARGE,
        data: { environment: Environment.SANDBOX },
      }),
      transaction()
    )

    expect(formatAlertText(alert!)).toContain(
      "[SALE] [Sandbox] Pro Lifetime bought"
    )
  })
})
