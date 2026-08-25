/**
 * Asks Apple to send a TEST notification to the URL registered in App Store
 * Connect, then reports what Apple saw when it tried to deliver it.
 *
 * This is the only way to prove /api/apple-notifications works end to end
 * without waiting for a real sale — and the `sendAttempts` it prints are
 * Apple's own view of your server's response, which is far more useful than
 * guessing from your logs (it distinguishes TLS problems, timeouts, redirects
 * and a plain non-2xx).
 *
 * Usage:
 *   node scripts/apple-test-notification.mjs                 # production URL
 *   node scripts/apple-test-notification.mjs --sandbox       # sandbox URL
 *
 * Required env (all from App Store Connect):
 *   APPLE_IAP_KEY_ID      Key ID of an In-App Purchase key
 *   APPLE_IAP_ISSUER_ID   Issuer ID shown above the key list
 *   APPLE_IAP_KEY         The .p8 contents, or a path to the .p8 file
 *
 * NOTE: the App Store Server API needs a key from Users and Access ▸
 * Integrations ▸ **In-App Purchase** (creating one requires the Admin role).
 * The existing `ASC_API_KEY_P8` / BXMZW4LMSP key used by fastlane is an App
 * Store Connect API key with the App Manager role and will NOT authenticate
 * here — they are different key types against different APIs.
 */
import { readFileSync } from "node:fs"
import {
  AppStoreServerAPIClient,
  Environment,
} from "@apple/app-store-server-library"

const BUNDLE_ID = "com.moonloaf.geospoof"
const POLL_ATTEMPTS = 10
const POLL_INTERVAL_MS = 3_000

const sandbox = process.argv.includes("--sandbox")
const environment = sandbox ? Environment.SANDBOX : Environment.PRODUCTION

function requireEnv(name) {
  const value = process.env[name]?.trim()
  if (!value) {
    console.error(`Missing ${name}. See the header of this script for setup.`)
    process.exit(1)
  }
  return value
}

/** Accept either the PEM text itself or a path to the .p8 file. */
function resolveSigningKey(raw) {
  if (raw.includes("BEGIN PRIVATE KEY")) return raw
  try {
    return readFileSync(raw, "utf8")
  } catch {
    console.error(
      "APPLE_IAP_KEY is neither a PEM private key nor a readable path to a .p8 file."
    )
    process.exit(1)
  }
}

const client = new AppStoreServerAPIClient(
  resolveSigningKey(requireEnv("APPLE_IAP_KEY")),
  requireEnv("APPLE_IAP_KEY_ID"),
  requireEnv("APPLE_IAP_ISSUER_ID"),
  BUNDLE_ID,
  environment
)

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

console.log(`Requesting a TEST notification (${environment})…`)

let token
try {
  const response = await client.requestTestNotification()
  token = response.testNotificationToken
} catch (error) {
  console.error("Apple refused the request:", error.message ?? error)
  process.exit(1)
}

if (!token) {
  console.error("Apple returned no testNotificationToken.")
  process.exit(1)
}
console.log(`Token: ${token}`)

// Apple records a delivery attempt asynchronously, so poll until it appears.
for (let attempt = 1; attempt <= POLL_ATTEMPTS; attempt++) {
  await sleep(POLL_INTERVAL_MS)
  let status
  try {
    status = await client.getTestNotificationStatus(token)
  } catch (error) {
    console.error("Status check failed:", error.message ?? error)
    process.exit(1)
  }

  const attempts = status.sendAttempts ?? []
  if (attempts.length === 0) {
    console.log(
      `  no delivery attempt recorded yet (${attempt}/${POLL_ATTEMPTS})…`
    )
    continue
  }

  for (const item of attempts) {
    const when = item.attemptDate
      ? new Date(item.attemptDate).toISOString()
      : "unknown time"
    console.log(`  ${when}  ${item.sendAttemptResult}`)
  }

  const succeeded = attempts.some(
    (item) => item.sendAttemptResult === "SUCCESS"
  )
  console.log(
    succeeded
      ? "\nApple delivered the TEST notification. Check your chat channel for an [INFO] line."
      : "\nApple could not deliver it. The result above is the reason; a non-2xx from your" +
          " endpoint shows as UNSUCCESSFUL_HTTP_RESPONSE_CODE (most often a wrong or missing" +
          " ?token= on the registered URL, which answers 404 by design)."
  )
  process.exit(succeeded ? 0 : 1)
}

console.error(
  "\nApple never recorded a delivery attempt. Is a URL registered for this environment?"
)
process.exit(1)
