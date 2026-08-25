# TanStack Start + shadcn/ui

This is a template for a new TanStack Start project with React, TypeScript, and shadcn/ui.

## Adding components

To add components to your app, run the following command:

```bash
npx shadcn@latest add button
```

This will place the ui components in the `components` directory.

## Using components

To use the components in your app, import them as follows:

```tsx
import { Button } from "@/components/ui/button"
```

## https

```
brew install mkcert nss
mkcert -install
cd site
mkcert -cert-file certs/dev-cert.pem -key-file certs/dev-key.pem localhost 127.0.0.1 ::1
```

## Purchase alerts (App Store Server Notifications)

`POST /api/apple-notifications` receives App Store Server Notifications V2 and
forwards purchases, renewals, refunds and cancellations to a chat webhook. It is
alerting only — Pro entitlement is still resolved on-device by StoreKit, so this
route never grants or revokes access.

### Vercel env vars

| Variable                         | Required             | Purpose                                                                                                                                    |
| -------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `PURCHASE_ALERT_WEBHOOK_URL`     | yes                  | Discord or Slack incoming webhook (any other host gets a generic JSON body). Without it, alerts are dropped with a loud log.               |
| `APPLE_NOTIFICATIONS_TOKEN`      | strongly recommended | Random secret that must appear as `?token=…` on the URL registered with Apple. Checked before any parsing or crypto; a miss answers 404.   |
| `PURCHASE_ALERT_DISCORD_MENTION` | recommended          | Your Discord user id. Webhook posts ping nobody and servers default to "Only @mentions", so without this the alert won't reach your phone. |
| `APPLE_BUNDLE_ID`                | no                   | Defaults to `com.moonloaf.geospoof`.                                                                                                       |
| `APPLE_APP_APPLE_ID`             | no                   | Defaults to `6765719745`.                                                                                                                  |

### Discord channel setup

Put the webhook in a channel only you can read. If the GeoSpoof server is (or
becomes) a community server, a sales feed in a member-visible channel publishes
your revenue to everyone in it.

1. Create the channel, then deny **View Channel** for `@everyone` in its
   permissions and grant it to yourself only.
2. Channel ▸ Edit Channel ▸ Integrations ▸ Webhooks ▸ New Webhook, and copy the URL
   into `PURCHASE_ALERT_WEBHOOK_URL`. That URL is a credential — anyone holding it
   can post to the channel, so keep it out of the repo and rotate it in Discord if
   it leaks.
3. Copy your own user id (Settings ▸ Advanced ▸ Developer Mode, then right-click
   your name ▸ Copy User ID) into `PURCHASE_ALERT_DISCORD_MENTION`.
4. On your phone, set that channel's notifications to **All Messages** as a
   backstop.

Alerts explicitly disable `@everyone`, `@here` and role pings, so the only thing a
notification can ever mention is the configured user id.

### App Store Connect setup

In App Store Connect ▸ your app ▸ **App Information** ▸ App Store Server
Notifications, set **both** URLs to version 2 of the same endpoint:

```
https://geospoof.com/api/apple-notifications?token=<APPLE_NOTIFICATIONS_TOKEN>
```

Registering the sandbox URL too is what makes TestFlight and App Review
purchases visible; those alerts are tagged `[Sandbox]` so they can't be mistaken
for revenue.

### Verifying it works

```
APPLE_IAP_KEY=/path/to/AuthKey_XXXX.p8 \
APPLE_IAP_KEY_ID=XXXX APPLE_IAP_ISSUER_ID=… \
node scripts/apple-test-notification.mjs
```

That asks Apple to deliver a `TEST` notification and prints Apple's own delivery
result, which distinguishes a TLS problem from a timeout from a non-2xx. It needs
an **In-App Purchase** key (Users and Access ▸ Integrations ▸ In-App Purchase,
Admin role) — the fastlane `ASC_API_KEY_P8` key is a different type and will not
authenticate against the App Store Server API.
