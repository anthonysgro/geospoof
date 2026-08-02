# IAP pricing and localization automation

Notes from wiring this up against the App Store Connect API. Most of what follows
was discovered by reading spaceship's source or by other people hitting the same
walls in public; none of it is obvious from Apple's reference docs.

## fastlane cannot do any of this for you

`deliver` handles app **listing** metadata only. In-app purchases, subscriptions,
their localizations and their pricing are all outside it — Apple removed IAP,
subscriptions, metadata and pricing from the XML feed
[on 2022-11-09](https://developer.apple.com/news/upcoming-requirements/?id=11092022a)
and never brought them back to `deliver`.

Confirmed by grepping the installed gem: `spaceship` 2.235.0 has **zero** models
or endpoints matching `subscriptionLocalizations`, `inAppPurchaseLocalizations`,
`subscriptionGroupLocalizations` or `subscriptionPrices`. So everything here is
raw REST against `api.appstoreconnect.apple.com`, using spaceship purely for
JWT auth and the Faraday connection.

## Two things that fail on the very first request

**The wrapper client has no HTTP verbs.** `Spaceship::ConnectAPI.client` returns a
`ConnectAPI::Client`, which delegates named model methods and does not respond to
`#get`. The raw verbs live on `ConnectAPI::APIClient`. Construct a subclass of it
directly:

```ruby
token  = Spaceship::ConnectAPI::Token.create          # reads SPACESHIP_CONNECT_API_* env
client = Spaceship::ConnectAPI::Tunes::Client.new(token: token)
client.get("v1/apps", { "filter[bundleId]" => "com.moonloaf.geospoof" })
```

**Spaceship does not inject an API version.** `api_client.rb` builds Faraday with
the hostname alone; every call site in spaceship writes the version into the path
itself (`"#{Version::V1}/appInfos/..."`). A path of `"apps"` resolves to
`https://api.appstoreconnect.apple.com/apps` and 404s.

Worse, **the versions are not uniform**:

| resource | version |
| --- | --- |
| `apps`, `territories`, `subscriptionGroups`, `subscriptions` | `v1` |
| `apps/{id}/inAppPurchasesV2` (relationship on the v1 app) | `v1` |
| `inAppPurchases/{id}/pricePoints` | **`v2`** |
| `inAppPurchasePriceSchedules/{id}/manualPrices` | `v1` |

## Subscriptions and IAPs use different pricing models

This is the biggest conceptual trap.

**Subscriptions** — individual `subscriptionPrices` resources, one per territory.
Read with `GET v1/subscriptions/{id}/prices?include=subscriptionPricePoint,territory`.
Write with `POST v1/subscriptionPrices` per territory.

Rows carrying `attributes.preserved == true` are the price **retained for existing
subscribers** after a change, not the current selling price. Scaling from a
preserved row means scaling from a stale baseline, so they must be filtered out.

`GET v1/subscriptionPricePoints/{id}/equalizations` returns the equivalent price
point in every other territory for a given point. That can replace ~141
per-territory calls with one, and is worth using if rate limits bite.

**IAPs** — a single `inAppPurchasePriceSchedule` whose id *is* the IAP id, holding
a set of `manualPrices`. Read with
`GET v1/inAppPurchasePriceSchedules/{iap_id}/manualPrices?include=inAppPurchasePricePoint,territory`.

## Price schedules are replace-all — the main hazard for the apply step

Creating a schedule replaces the whole thing. The `manualPrices` in the request
become **the complete set**; any territory not included reverts to the automated
price derived from `baseTerritory`.

Consequences:

- Apply must be **atomic per product** — every territory in one request. There is
  no incremental "set Brazil only".
- A partial plan silently un-sets territories that were previously manual.
- Which is arguably good: no half-applied state is possible.

The payload uses JSON:API create-with-included, with **client-generated
placeholder ids** referenced from the relationship:

```json
{
  "data": {
    "type": "inAppPurchasePriceSchedules",
    "relationships": {
      "inAppPurchase":  { "data": { "type": "inAppPurchases", "id": "<iap id>" } },
      "baseTerritory":  { "data": { "type": "territories",    "id": "USA" } },
      "manualPrices":   { "data": [{ "type": "inAppPurchasePrices", "id": "price-0" }] }
    }
  },
  "included": [
    {
      "type": "inAppPurchasePrices",
      "id": "price-0",
      "attributes": { "startDate": null },
      "relationships": {
        "inAppPurchasePricePoint": { "data": { "type": "inAppPurchasePricePoints", "id": "<point id>" } }
      }
    }
  ]
}
```

`startDate: null` means "effective immediately".

### The schedule must carry its own baseTerritory

Creating a schedule **replaces the entire set** of manual prices. Territories left
out fall back to the automatic price derived from `baseTerritory`.

That includes the base territory itself, which is the trap. `plan_pricing.rb`
never produces a row for it: the IAP baseline is read from `automaticPrices`, and
the base territory has a *manual* price so it is absent from that list. (For
subscriptions the baseline comes from `equalizations`, which likewise returns only
the other territories.) On the 157-territory run, USA was the one classified
territory with zero rows for exactly this reason.

So a schedule built purely from plan rows omits USA, which deletes the US manual
price and leaves the US price derived from `baseTerritory: USA` — circular. Apple
either rejects it or resolves it in a way nobody chose, and either outcome puts the
largest storefront in play during an operation whose plan contains no US rows.

`apply_pricing.rb` therefore looks up the current base-territory price point and
re-sends it unchanged as the first entry of every IAP schedule. It is not a price
change; it stops the replace-all from dropping the anchor. If that price cannot be
resolved the script refuses to run rather than guess. Being manual is the normal
state for a base territory anyway — it is where the price is set.

**409 Conflict on POST is common and widely reported** — see
[Apple Developer Forums 798230](https://developer.apple.com/forums/thread/798230)
and [this StackOverflow thread](https://stackoverflow.com/questions/74105965/how-to-add-a-temporary-price-change-of-inapppurchase-with-v1-inapppurchaseprice).
Expect to iterate on the first apply, and expect the failure mode to be a 409
rather than a useful validation message.

## Price point ids are base64-encoded JSON

`eyJzIjoiNjc1MTMwOTAyNiIsInQiOiJVU0EiLCJwIjoiMTAwMTEifQ` decodes to
`{"s":"6751309026","t":"USA","p":"10011"}` — product, territory, tier. Handy for
asserting that a chosen point really belongs to the territory it was planned for,
which is a cheap guard against the currency class of bug.

## Review and consent

- **Price changes do not require App Review.** They take effect on schedule.
- **Localization changes DO require review**, with a status separate from the app's.
  Existing text stays live until approved, and a pending change can be reverted.
- Subscription **increases** in Austria, Germany and Poland require every affected
  subscriber to consent (since 2025-08-04) or they churn at cycle end. One-time
  purchases have no such constraint. See `pricing-policy.json`.

## Rate limits and run time

Roughly 3600 requests/hour. The price-points endpoints require a territory filter
(App Store Connect API 3.6+), so a full plan is one request per product per
territory — 157 × 6 ≈ 950 before pagination. That takes **20–25 minutes**, and
the sequential pacing is deliberate: firing these concurrently would exceed the
hourly limit. Use `--territories` to smoke-test first.

## Surviving a transient failure

A 20-minute run of ~950 requests will occasionally meet an Apple 500. Two things
make that survivable:

- **Retry with real backoff** (2s, 4s, 8s, 16s, 32s). Spaceship appears to handle
  this already but does not: `api_client.rb#with_asc_retry` raises
  `TimeoutRetryError` on a 500 with the message "Retrying after 3 seconds", yet
  that rescue branch has no `sleep` in it — only the 429 branch does. All five
  attempts are spent inside a second, then the failed response reaches
  `handle_response`, which raises `InternalServerError`. Run #5 died this way at
  19m41s on the fifth of six products.
- **Rows are flushed to the CSV as they are produced**, so an abort keeps
  everything that finished. The workflow uploads the artifact on failure too.

To continue rather than start over:

```bash
bundle exec ruby fastlane/iap/plan_pricing.rb --resume plans/plan-<stamp>.csv
```

Carried rows are re-emitted into the new CSV, so the output is always complete on
its own. In CI, pass the failed run's ID as the `resume_run_id` input and it
fetches that artifact itself.

## Files

| file | purpose |
| --- | --- |
| `pricing-policy.json` | the business decisions: tiers, coefficients, rounding, increase gates |
| `plan_pricing.rb` | read-only planner. GET only. Writes a CSV to `plans/` |
| `plans/` | timestamped plan output, reviewed before any apply |

Deliberately **not** under `fastlane/metadata/` — `deliver` validates every
directory there against its App Store locale list and aborts on anything else,
even when `skip_metadata: true`. A subfolder there broke a release build once.
