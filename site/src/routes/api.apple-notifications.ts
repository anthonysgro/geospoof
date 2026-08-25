/**
 * POST /api/apple-notifications — App Store Server Notifications V2 receiver.
 *
 * This is the endpoint registered in App Store Connect (App Information ▸ App
 * Store Server Notifications) for BOTH the Production and Sandbox URLs. Apple
 * POSTs a signed JWS whenever a purchase, renewal, refund or cancellation
 * happens; we verify it, decide whether it's worth reporting, and forward a
 * one-liner to a chat webhook.
 *
 * It is intentionally *only* an alerting path. Pro entitlement is resolved
 * on-device from StoreKit 2 (`ProStore.swift`) and the GPS agent verifies the
 * Apple-signed JWS offline — nothing here grants, revokes, or stores access, so
 * an outage of this route costs a notification and nothing else.
 *
 * Security model, since this URL is necessarily public and unauthenticated in
 * the usual sense (Apple sends no bearer token and publishes no source IPs):
 *   - `APPLE_NOTIFICATIONS_TOKEN`, when set, must appear as `?token=…`. This is
 *     checked before the body is read, before any crypto, and before the
 *     verification module is even loaded, so unauthenticated traffic is as close
 *     to free as an invocation gets. A miss answers 404, not 403, so the endpoint
 *     doesn't confirm itself to a scanner.
 *   - The JWS signature is the real authentication: chain must terminate at the
 *     embedded Apple Root CA - G3, and the payload's bundle id / appAppleId must
 *     match this app. See `lib/purchase-alerts/verify.ts`.
 *
 * Status codes matter here, because a non-2xx makes Apple retry (roughly 1h,
 * 12h, 24h, 48h, 72h):
 *   200  handled, ignored by design, or a duplicate — nothing to retry
 *   400  body wasn't `{ "signedPayload": "…" }`
 *   401  signature/app-identity verification failed — retrying won't help, but a
 *        forged request retrying harmlessly is preferable to acking it
 *   404  URL token missing or wrong
 *   500  verified fine, but the chat webhook was unreachable — DO retry
 *
 * Runtime note: this must stay on the Node runtime. Verification uses
 * `node:crypto`'s X509Certificate and Buffer, neither of which exists on the
 * Edge runtime.
 */

import { timingSafeEqual } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import { readConfig } from "@/lib/purchase-alerts/config"

function tokenMatches(expected: string, provided: string | null): boolean {
  if (provided === null) return false
  const a = Buffer.from(expected, "utf8")
  const b = Buffer.from(provided, "utf8")
  // timingSafeEqual throws on length mismatch; length is not the secret here.
  return a.length === b.length && timingSafeEqual(a, b)
}

export const Route = createFileRoute("/api/apple-notifications")({
  server: {
    handlers: {
      // Without this, a GET falls through to the SPA shell and answers 200 with
      // an empty page — which is both misleading and indexable.
      GET: () =>
        new Response("Method not allowed", {
          status: 405,
          headers: { Allow: "POST" },
        }),

      POST: async ({ request }) => {
        const { urlToken } = readConfig()

        if (urlToken) {
          const provided = new URL(request.url).searchParams.get("token")
          if (!tokenMatches(urlToken, provided)) {
            return new Response("Not found", { status: 404 })
          }
        }

        // Loaded on demand: this pulls in Apple's verification library, which
        // would otherwise be initialised on every server-rendered request in
        // the shared SSR bundle. See the header of `handle.ts`.
        const { handleNotification } =
          await import("@/lib/purchase-alerts/handle")
        return handleNotification(request)
      },
    },
  },
})
