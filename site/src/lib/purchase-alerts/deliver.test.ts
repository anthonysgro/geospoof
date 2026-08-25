import { afterEach, describe, expect, it } from "vitest"

import { deliverAlert, webhookBody, webhookFlavor } from "./deliver"
import type { PurchaseAlert } from "./format"

const ALERT: PurchaseAlert = {
  kind: "sale",
  label: "SALE",
  headline: "Pro Lifetime bought",
  details: ["$24.99 (USA)"],
  environment: "Production",
}

describe("webhookFlavor", () => {
  it("recognizes Discord and Slack incoming webhooks", () => {
    expect(webhookFlavor("https://discord.com/api/webhooks/123/abc")).toBe(
      "discord"
    )
    expect(webhookFlavor("https://discordapp.com/api/webhooks/123/abc")).toBe(
      "discord"
    )
    expect(webhookFlavor("https://hooks.slack.com/services/T0/B0/xxx")).toBe(
      "slack"
    )
  })

  it("treats anything else as a generic JSON endpoint", () => {
    expect(webhookFlavor("https://alerts.example.com/hook")).toBe("generic")
    expect(webhookFlavor("not a url")).toBe("generic")
  })

  // Guards against a lookalike host (e.g. discord.com.evil.test) being treated
  // as Discord, which would send the alert body to the wrong shape and host.
  it("matches on the host suffix, not a substring", () => {
    expect(webhookFlavor("https://discord.com.evil.test/hook")).toBe("generic")
  })
})

describe("webhookBody", () => {
  it("uses `content` for Discord and `text` for Slack", () => {
    expect(webhookBody(ALERT, "discord")).toEqual({
      content: "[SALE] Pro Lifetime bought\n$24.99 (USA)",
      allowed_mentions: { parse: [] },
    })
    expect(webhookBody(ALERT, "slack")).toEqual({
      text: "[SALE] Pro Lifetime bought\n$24.99 (USA)",
    })
  })

  // A webhook post pings nobody, and a Discord server defaults to "Only
  // @mentions" — so without a mention the alert never reaches your phone.
  it("prefixes a Discord mention when one is configured", () => {
    expect(webhookBody(ALERT, "discord", "1234567890")).toEqual({
      content: "<@1234567890> [SALE] Pro Lifetime bought\n$24.99 (USA)",
      allowed_mentions: { parse: [], users: ["1234567890"] },
    })
  })

  // Belt and braces for a channel that lives in a community server: no alert
  // body should ever be able to ping @everyone.
  it("never allows role or @everyone pings", () => {
    const shouty: PurchaseAlert = { ...ALERT, headline: "@everyone bought Pro" }
    const body = webhookBody(shouty, "discord", "1234567890") as {
      allowed_mentions: { parse: Array<string>; users?: Array<string> }
    }

    expect(body.allowed_mentions.parse).toEqual([])
    expect(body.allowed_mentions.users).toEqual(["1234567890"])
  })

  it("ignores a mention for non-Discord targets", () => {
    expect(webhookBody(ALERT, "slack", "1234567890")).toEqual({
      text: "[SALE] Pro Lifetime bought\n$24.99 (USA)",
    })
  })

  it("includes the structured alert for a generic endpoint", () => {
    expect(webhookBody(ALERT, "generic")).toEqual({
      text: "[SALE] Pro Lifetime bought\n$24.99 (USA)",
      alert: ALERT,
    })
  })

  it("truncates text that would exceed Discord's content limit", () => {
    const long: PurchaseAlert = { ...ALERT, headline: "x".repeat(2_500) }
    const body = webhookBody(long, "discord") as { content: string }

    expect(body.content.length).toBeLessThanOrEqual(1_900)
    expect(body.content.endsWith("…")).toBe(true)
  })
})

// deliverAlert's return value decides the HTTP status the route gives Apple:
// false becomes a 500 so Apple retries, true becomes a 200. Getting this wrong
// either loses the alert silently or has Apple redeliver for three days.
describe("deliverAlert", () => {
  const originalFetch = globalThis.fetch

  afterEach(() => {
    globalThis.fetch = originalFetch
  })

  it("posts the flavored body to the webhook and reports success", async () => {
    const calls: Array<{ url: string; init: RequestInit | undefined }> = []
    globalThis.fetch = ((url: string, init?: RequestInit) => {
      calls.push({ url, init })
      return Promise.resolve(new Response(null, { status: 204 }))
    }) as unknown as typeof fetch

    const delivered = await deliverAlert(
      ALERT,
      "https://discord.com/api/webhooks/1/abc"
    )

    expect(delivered).toBe(true)
    expect(calls).toHaveLength(1)
    expect(calls[0].init?.method).toBe("POST")
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({
      content: "[SALE] Pro Lifetime bought\n$24.99 (USA)",
      allowed_mentions: { parse: [] },
    })
  })

  it("reports failure when the webhook answers non-2xx", async () => {
    globalThis.fetch = () =>
      Promise.resolve(new Response("too many requests", { status: 429 }))

    expect(
      await deliverAlert(ALERT, "https://hooks.slack.com/services/T0/B0/x")
    ).toBe(false)
  })

  it("reports failure instead of throwing when the request itself fails", async () => {
    globalThis.fetch = () => Promise.reject(new Error("network unreachable"))

    expect(await deliverAlert(ALERT, "https://alerts.example.com/hook")).toBe(
      false
    )
  })
})
