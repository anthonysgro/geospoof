/**
 * The purchase-alert pipeline: verify -> decide -> deliver.
 *
 * Deliberately split out of the route module so it can be loaded lazily. Apple's
 * library and its `node-fetch` dependency are ~200 KB of JS, and the route file
 * gets bundled into the shared SSR router chunk — a static import there means
 * every server-rendered request (`/test`, `/verify`, the `/verify` server
 * function) pays to parse and initialise a certificate verifier it will never
 * use. Behind a dynamic import, that cost is only paid when Apple actually
 * POSTs.
 */

import { readConfig } from "./config"
import { deliverAlert } from "./deliver"
import { describeNotification } from "./format"
import { describeVerificationFailure, verifyNotification } from "./verify"

/**
 * Apple can deliver the same notification more than once (its own retries, plus
 * at-least-once delivery), and `notificationUUID` is the documented dedup key.
 *
 * Best-effort by design: this lives in one warm serverless instance, so a
 * duplicate that lands on a cold instance still gets through. That's an accepted
 * trade — the alternative is a KV store for a problem whose worst case is seeing
 * the same sale twice. A UUID is only recorded once delivery has SUCCEEDED, so a
 * retry after a failed webhook post is still able to alert.
 */
const MAX_REMEMBERED = 500
const deliveredNotificationIds = new Set<string>()

function rememberDelivered(notificationUUID: string | undefined): void {
  if (!notificationUUID) return
  deliveredNotificationIds.add(notificationUUID)
  if (deliveredNotificationIds.size > MAX_REMEMBERED) {
    // Sets iterate in insertion order, so this evicts the oldest.
    const oldest = deliveredNotificationIds.values().next()
    if (!oldest.done) deliveredNotificationIds.delete(oldest.value)
  }
}

async function readSignedPayload(
  request: Request
): Promise<string | undefined> {
  try {
    const body: unknown = await request.json()
    if (typeof body !== "object" || body === null) return undefined
    const signedPayload = (body as { signedPayload?: unknown }).signedPayload
    return typeof signedPayload === "string" && signedPayload.length > 0
      ? signedPayload
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Handle one notification. See the route module for the status-code contract —
 * the codes are load-bearing, because any non-2xx makes Apple redeliver.
 */
export async function handleNotification(request: Request): Promise<Response> {
  const config = readConfig()

  const signedPayload = await readSignedPayload(request)
  if (!signedPayload) {
    return new Response("Expected a JSON body with a signedPayload string", {
      status: 400,
    })
  }

  let verified
  try {
    verified = await verifyNotification(signedPayload, config)
  } catch (error) {
    console.error(
      "[purchase-alert] notification failed verification:",
      describeVerificationFailure(error)
    )
    return new Response("Signature verification failed", { status: 401 })
  }

  const { payload, transaction } = verified
  const summary = `${payload.notificationType ?? "unknown"}${
    payload.subtype ? `/${payload.subtype}` : ""
  } (${payload.data?.environment ?? "unknown env"})`

  if (
    payload.notificationUUID &&
    deliveredNotificationIds.has(payload.notificationUUID)
  ) {
    console.info(`[purchase-alert] duplicate ${summary}, already delivered`)
    return new Response(null, { status: 200 })
  }

  const alert = describeNotification(payload, transaction)
  if (!alert) {
    console.info(`[purchase-alert] ${summary} is not reported`)
    return new Response(null, { status: 200 })
  }

  if (!config.webhookUrl) {
    // Misconfiguration, not a transient failure: retrying for three days won't
    // conjure an env var, so ack and make the reason loud instead.
    console.error(
      `[purchase-alert] PURCHASE_ALERT_WEBHOOK_URL is not set — dropping ${summary}`
    )
    return new Response(null, { status: 200 })
  }

  const delivered = await deliverAlert(
    alert,
    config.webhookUrl,
    config.mentionUserId
  )
  if (!delivered) {
    return new Response("Alert delivery failed", { status: 500 })
  }

  rememberDelivered(payload.notificationUUID)
  console.info(`[purchase-alert] delivered ${summary}`)
  return new Response(null, { status: 200 })
}
