/**
 * Signature verification for App Store Server Notifications V2.
 *
 * Apple POSTs `{ "signedPayload": "<JWS>" }` with no bearer token, no HMAC, and
 * no fixed source IP — the JWS signature IS the authentication. So this module
 * is the security boundary for the endpoint: anything it rejects never reaches
 * the alert path.
 *
 * Apple's own library does the heavy lifting (x5c chain validation against the
 * embedded Apple root, effective-date checks, bundle-id and appAppleId
 * cross-checks). What this file adds:
 *
 *   - One verifier per environment. Apple signs Sandbox notifications with a
 *     Sandbox-scoped payload and the verifier rejects a mismatched environment,
 *     so a single verifier cannot serve both. Registering the same URL for both
 *     environments in App Store Connect is convenient (and is what makes
 *     TestFlight / App Review purchases visible), so we keep both verifiers and
 *     pick by peeking at the untrusted payload first.
 *   - Cached verifier instances. Constructing one parses the root certificate;
 *     serverless invocations are short-lived but often reused.
 */

import {
  Environment,
  SignedDataVerifier,
  VerificationException,
  VerificationStatus,
} from "@apple/app-store-server-library"
import { appleRootCertificates } from "./apple-root-ca"
import type {
  JWSTransactionDecodedPayload,
  ResponseBodyV2DecodedPayload,
} from "@apple/app-store-server-library"
import type { PurchaseAlertConfig } from "./config"

/**
 * OCSP revocation checks are deliberately off. They add a network round-trip to
 * Apple on every notification and fail closed when Apple's OCSP responder is
 * slow, which would turn a transient outage into "Apple retries this in an
 * hour". Offline chain + validity-window verification is the right trade here:
 * these notifications only drive a developer alert, never an entitlement — Pro
 * access is resolved on-device from StoreKit (see ProStore.swift).
 */
const ENABLE_ONLINE_CHECKS = false

const verifierCache = new Map<string, SignedDataVerifier>()

function verifierFor(
  environment: Environment.PRODUCTION | Environment.SANDBOX,
  config: PurchaseAlertConfig
): SignedDataVerifier {
  const key = `${environment}:${config.bundleId}:${config.appAppleId}`
  const cached = verifierCache.get(key)
  if (cached) return cached

  const verifier = new SignedDataVerifier(
    appleRootCertificates(),
    ENABLE_ONLINE_CHECKS,
    environment,
    config.bundleId,
    // Required for Production, and documented as omitted for Sandbox: sandbox
    // payloads don't reliably carry an appAppleId to cross-check against.
    environment === Environment.PRODUCTION ? config.appAppleId : undefined
  )
  verifierCache.set(key, verifier)
  return verifier
}

/**
 * Read `data.environment` out of the JWS **without** verifying it, purely to
 * choose which verifier to try first.
 *
 * This value is untrusted by construction — an attacker controls it — but it is
 * only used to order two verification attempts, both of which validate the
 * signature and the environment properly. Worst case a forged hint costs one
 * extra failed verification.
 */
function peekEnvironment(signedPayload: string): string | undefined {
  const segments = signedPayload.split(".")
  if (segments.length !== 3) return undefined
  try {
    const json = Buffer.from(segments[1], "base64url").toString("utf8")
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== "object" || parsed === null) return undefined
    const data = (parsed as { data?: unknown }).data
    if (typeof data !== "object" || data === null) return undefined
    const environment = (data as { environment?: unknown }).environment
    return typeof environment === "string" ? environment : undefined
  } catch {
    return undefined
  }
}

export interface VerifiedNotification {
  readonly payload: ResponseBodyV2DecodedPayload
  /**
   * The decoded transaction, when the notification carries one. Absent for
   * notification types with no transaction (TEST, RENEWAL_EXTENSION summaries,
   * external purchase tokens).
   */
  readonly transaction: JWSTransactionDecodedPayload | undefined
  readonly environment: Environment.PRODUCTION | Environment.SANDBOX
}

/**
 * Verify a `signedPayload` and decode its nested transaction.
 *
 * @throws if neither environment's verifier accepts the payload. The thrown
 * error is Apple's `VerificationException` for the environment we tried first,
 * so the status code (INVALID_APP_IDENTIFIER, INVALID_CERTIFICATE, …) survives
 * into the log.
 */
export async function verifyNotification(
  signedPayload: string,
  config: PurchaseAlertConfig
): Promise<VerifiedNotification> {
  const hint = peekEnvironment(signedPayload)
  const order: Array<Environment.PRODUCTION | Environment.SANDBOX> =
    hint === Environment.SANDBOX
      ? [Environment.SANDBOX, Environment.PRODUCTION]
      : [Environment.PRODUCTION, Environment.SANDBOX]

  let firstError: unknown
  for (const environment of order) {
    try {
      const verifier = verifierFor(environment, config)
      const payload = await verifier.verifyAndDecodeNotification(signedPayload)
      const signedTransactionInfo = payload.data?.signedTransactionInfo
      const transaction = signedTransactionInfo
        ? await verifier.verifyAndDecodeTransaction(signedTransactionInfo)
        : undefined
      return { payload, transaction, environment }
    } catch (error) {
      firstError ??= error
    }
  }

  throw firstError instanceof Error
    ? firstError
    : new Error("App Store notification failed verification")
}

/**
 * A loggable reason for a rejection.
 *
 * Apple's `VerificationException` carries an empty `message` and puts the actual
 * reason in a numeric `status`, so logging `error.message` alone produces a blank
 * line — useless in exactly the situation you need it (Apple's notifications are
 * being rejected and you need to know whether it's the bundle id, the app id, the
 * environment, or the certificate chain).
 */
export function describeVerificationFailure(error: unknown): string {
  if (error instanceof VerificationException) {
    // TypeScript types the enum's reverse mapping as total, but a status Apple
    // adds in a later library version would have no entry — so look it up as a
    // partial record and fall back to the raw number.
    const statusNames = VerificationStatus as unknown as Record<
      number,
      string | undefined
    >
    const name = statusNames[error.status] ?? String(error.status)
    const cause = error.cause?.message
    return cause
      ? `VerificationException ${name}: ${cause}`
      : `VerificationException ${name}`
  }
  if (error instanceof Error) {
    return error.message || error.name
  }
  return String(error)
}
