/**
 * Posts a purchase alert to an incoming-webhook URL.
 *
 * Discord and Slack both accept a single JSON POST with no auth beyond the
 * secret in the URL, which is why they're the two shapes handled here — the
 * target is picked from the URL's host so switching providers is an env-var
 * change, not a code change. Anything else gets a generic body carrying both a
 * `text` field and the structured alert.
 *
 * What leaves our infrastructure: product id, price, currency, storefront
 * country, and Apple's opaque transaction id. No customer identity is in the
 * notification to begin with (GeoSpoof sets no `appAccountToken`), and none is
 * added here — worth keeping that way given the product's privacy stance.
 */

import { formatAlertText } from "./format"
import type { PurchaseAlert } from "./format"

/** Discord rejects `content` over 2000 characters; stay clear of the edge. */
const MAX_TEXT_LENGTH = 1900

/**
 * Kept well inside the strictest Vercel function default (10s on a Hobby project
 * without Fluid compute) so a hanging webhook can't turn into a platform timeout,
 * which Apple would see as an ambiguous failure rather than our clean 500.
 * Discord and Slack answer in well under a second in normal operation.
 */
const DELIVERY_TIMEOUT_MS = 5_000

type WebhookFlavor = "discord" | "slack" | "generic"

export function webhookFlavor(url: string): WebhookFlavor {
  let host: string
  try {
    host = new URL(url).host.toLowerCase()
  } catch {
    return "generic"
  }
  if (host.endsWith("discord.com") || host.endsWith("discordapp.com"))
    return "discord"
  if (host.endsWith("slack.com")) return "slack"
  return "generic"
}

function truncate(text: string): string {
  return text.length <= MAX_TEXT_LENGTH
    ? text
    : `${text.slice(0, MAX_TEXT_LENGTH - 1)}…`
}

export function webhookBody(
  alert: PurchaseAlert,
  flavor: WebhookFlavor,
  mentionUserId?: string
): unknown {
  const text = truncate(formatAlertText(alert))
  switch (flavor) {
    case "discord":
      return {
        content: mentionUserId ? `<@${mentionUserId}> ${text}` : text,
        // Explicitly scope what a webhook post is allowed to ping. `parse: []`
        // disables @everyone/@here/role pings outright, and only the configured
        // user id can be mentioned — so no alert text can ever notify a whole
        // server, which matters once the channel lives in a community server.
        allowed_mentions: mentionUserId
          ? { parse: [], users: [mentionUserId] }
          : { parse: [] },
      }
    case "slack":
      return { text }
    case "generic":
      return { text, alert }
  }
}

/**
 * Deliver the alert. Returns false rather than throwing so the caller can decide
 * whether to make Apple retry; the reason is logged here.
 */
export async function deliverAlert(
  alert: PurchaseAlert,
  webhookUrl: string,
  mentionUserId?: string
): Promise<boolean> {
  const flavor = webhookFlavor(webhookUrl)
  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(webhookBody(alert, flavor, mentionUserId)),
      signal: AbortSignal.timeout(DELIVERY_TIMEOUT_MS),
    })
    if (!response.ok) {
      console.error(
        `[purchase-alert] ${flavor} webhook rejected the alert: ${response.status} ${response.statusText}`
      )
      return false
    }
    return true
  } catch (error) {
    console.error(
      `[purchase-alert] ${flavor} webhook delivery failed:`,
      error instanceof Error ? error.message : error
    )
    return false
  }
}
