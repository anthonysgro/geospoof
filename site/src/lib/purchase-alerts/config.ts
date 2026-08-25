/**
 * Server-only configuration for the purchase-alert webhook.
 *
 * Everything here is read from `process.env` at call time (not module scope) so
 * a Vercel env-var change takes effect on the next invocation without a rebuild.
 *
 * The Apple identifiers default to GeoSpoof's real, public values — the bundle
 * id ships in every build and the numeric app id is in the App Store URL — so
 * only the two genuinely-private values need setting in Vercel.
 */

/** Bundle id every notification must be for. Rejects payloads for other apps. */
const DEFAULT_BUNDLE_ID = "com.moonloaf.geospoof"

/**
 * The App Store's numeric app id (the `id…` in the App Store URL). Required by
 * `SignedDataVerifier` for the Production environment; it cross-checks the
 * `appAppleId` inside the payload.
 */
const DEFAULT_APP_APPLE_ID = 6765719745

export interface PurchaseAlertConfig {
  /** Incoming-webhook URL that receives the alert (Discord, Slack, or generic JSON). */
  readonly webhookUrl: string | undefined
  /**
   * Optional Discord user id to mention, so the alert reliably pushes to your
   * phone. A server's default notification setting is usually "Only @mentions",
   * and a webhook post mentions nobody — so without this, alerts land silently
   * in the channel and you find out about a sale when you next open Discord.
   */
  readonly mentionUserId: string | undefined
  /**
   * Shared secret required as `?token=…` on the notification URL. Apple lets you
   * register any HTTPS URL, so a secret path/query is the cheapest way to keep
   * unauthenticated traffic from reaching the (CPU-bound) signature check.
   * Optional: when unset, the JWS signature is the only gate.
   */
  readonly urlToken: string | undefined
  readonly bundleId: string
  readonly appAppleId: number
}

function trimmed(value: string | undefined): string | undefined {
  const v = value?.trim()
  return v && v.length > 0 ? v : undefined
}

export function readConfig(
  env: NodeJS.ProcessEnv = process.env
): PurchaseAlertConfig {
  const appAppleId = Number(
    trimmed(env.APPLE_APP_APPLE_ID) ?? DEFAULT_APP_APPLE_ID
  )

  return {
    webhookUrl: trimmed(env.PURCHASE_ALERT_WEBHOOK_URL),
    mentionUserId: trimmed(env.PURCHASE_ALERT_DISCORD_MENTION),
    urlToken: trimmed(env.APPLE_NOTIFICATIONS_TOKEN),
    bundleId: trimmed(env.APPLE_BUNDLE_ID) ?? DEFAULT_BUNDLE_ID,
    appAppleId: Number.isSafeInteger(appAppleId)
      ? appAppleId
      : DEFAULT_APP_APPLE_ID,
  }
}
