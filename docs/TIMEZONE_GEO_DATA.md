# Timezone Boundary Data — Architecture & Runbook

How GeoSpoof turns spoofed coordinates into a real IANA timezone, where the
boundary data is hosted, why the URL is version-scoped, and the exact steps to
update the dataset without breaking installed clients.

## Why This Exists

When GeoSpoof spoofs a location, it must also report a matching timezone —
otherwise `Date` / `Intl` / `Temporal` / EXSLT keep leaking the user's **real**
zone, which is exactly the inconsistency a fingerprinting script looks for. The
extension resolves coordinates → IANA zone offline using
[`browser-geo-tz`](https://www.npmjs.com/package/browser-geo-tz) against the
[`geo-tz`](https://www.npmjs.com/package/geo-tz) boundary dataset.

That dataset is large (~29 MB) and is fetched at runtime, so where and how it's
hosted is load-bearing for the protection working at all.

## The Two Files

`browser-geo-tz` reads the boundary data as a **pair** of files that must stay
in lockstep:

| File                           | Size    | Fetched as                                  | Role                                                              |
| ------------------------------ | ------- | ------------------------------------------- | ----------------------------------------------------------------- |
| `timezones.geojson.index.json` | ~915 KB | one full GET (Brotli'd ~210 KB on the wire) | Table of contents: "region X lives at bytes A..B of the `.dat`."  |
| `timezones.geojson.geo.dat`    | ~29 MB  | HTTP `Range` requests (206)                 | The boundary polygons, addressed by the byte offsets in the index |

Per-lookup the library fetches the index once (then it's `immutable`-cached) and
issues small range requests for only the shards a coordinate touches — typically
a few hundred bytes each. Per-user lifetime transfer is roughly the ~210 KB
compressed index plus a handful of tiny shards.

We use the **full** `timezones.geojson` dataset, not the `-1970` variant — the
1970 variant lands coastal/boundary points in fingerprintable `Etc/GMT±N`
buckets instead of a real named zone.

## Hosting

The data is served same-origin from `https://geospoof.com/geo-tz/<version>/…`
(Vercel static assets). The extension and the `/verify` page both point at it.

- **Why not jsdelivr (the original setup):** jsdelivr **truncated** the large
  `.dat`, serving ~24.3 MB of the real ~29.3 MB file while the index still
  referenced offsets up to ~29.3 MB. Range requests past the truncation point
  returned `416`, the lookup silently fell back to an `Etc/GMT` bucket, and
  because we refuse to persist `Etc/GMT` zones the timezone ended up `null` — so
  the extension spoofed the location but leaked the real zone. jsdelivr also
  served the `.dat` as `200` on a cache hit but `206` on a miss, which Safari's
  range/cache layer mishandled into intermittent `416`s.
- **Vercel serves it correctly:** consistent `206` range support
  (`accept-ranges: bytes`), `access-control-allow-origin: *` (so the extension's
  cross-origin background fetch and the same-origin verify page both work),
  Brotli on the JSON index, and edge caching (`x-vercel-cache: HIT`).
- The full intact file is confirmed by the `content-range` total:
  `bytes …/29259572` matches what the npm package ships.

### Caching

Both files are served with `Cache-Control: public, max-age=31536000, immutable`
(see the `/geo-tz/(.*)` rule in `site/vercel.json`, which matches the nested
versioned paths). Immutable caching is what keeps this cheap and fast — and is
also the reason the path **must** be versioned (next section).

## Why the Path Is Versioned

This is the single most important invariant in this system.

The index and the `.dat` are fetched separately and cached `immutable` for a
year. If the data ever changed under a **stable** URL, a returning client could
pair a **stale cached index** (old byte offsets) with **freshly-fetched `.dat`
ranges** from the new file. The offsets no longer line up, and the lookup
silently returns garbage or `null` — no error, no crash, just a wrong/absent
timezone and a leak.

Scoping the URL by the `geo-tz` data version (`/geo-tz/8.1.6/…`) guarantees new
data lands at a **new URL**, so a cached index and the `.dat` it indexes can
never disagree. Old clients keep using the old path; new clients use the new
one.

### Single Source of Truth + Build Guard

The version lives in **three** places that must agree, enforced at build time by
`site/scripts/copy-geo-tz-data.mjs`:

| Where                                                                | Consumer                                                                    |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| The installed `geo-tz` package version (node_modules)                | What data we actually copy/serve                                            |
| `src/shared/geo-tz-data.json`                                        | The **extension** builds its CDN URL from it (`src/background/timezone.ts`) |
| `GEO_TZ_DATA_VERSION` in `site/src/lib/verification/geo-timezone.ts` | The **verify page** builds its URL from it                                  |

The copy script refuses to build on any mismatch, turning "someone bumped
`geo-tz` and forgot to version the path" from a silent user-facing data
corruption bug into a loud, local build failure.

> **Vercel note:** Vercel's project root is `site/`, so the extension's
> `src/shared/geo-tz-data.json` is **not** present in that build context. The
> guard checks it only when the full repo is available (local dev / full-repo
> CI) and skips it otherwise. The site-internal check (installed `geo-tz` ===
> `GEO_TZ_DATA_VERSION`) always runs. Always make `geo-tz` version bumps in a
> normal commit/PR so the full-repo check runs before it reaches Vercel.

## Build Flow

`site` build (`npm run build`) runs `scripts/copy-geo-tz-data.mjs` first, which:

1. Resolves the installed `geo-tz` version and runs the drift guard above.
2. Copies both files into `public/geo-tz/<version>/` (the primary, versioned
   path — what current and future builds point at).
3. **Also** copies them into the legacy unversioned `public/geo-tz/` path.

`public/geo-tz/` is gitignored and regenerated on every build — the data is
sourced from the pinned npm package, so the build has no network dependency and
the output is reproducible.

### The Legacy Unversioned Copy

Extension **≤ 1.21.6** shipped pointing at the unversioned `/geo-tz/…` path
before path-versioning existed. The script keeps emitting that copy so those
already-installed clients keep working as they roll over to a versioned build.
It stays byte-correct because the version guard pins the data to exactly the
version 1.21.6 was built against (`8.1.6`).

**Cleanup:** the unversioned copy can be deleted from the copy script once
1.21.6 is no longer meaningfully in the field.

## Dependency Pinning

To stop the served data from changing accidentally, the relevant packages are
pinned to **exact** versions (no `^`) and installs are reproducible:

- `geo-tz` → exact in `site/package.json` (the data).
- `browser-geo-tz` → exact in both `site/package.json` and root `package.json`
  (the reader; must stay format-compatible with the data).
- Lockfiles are committed; Vercel's `installCommand` is `npm ci` (strict, fails
  on lock/manifest drift instead of silently upgrading).

## Runbook: Updating the Boundary Data

Do this only when you intentionally want fresher timezone boundaries. Because
clients cache the old path's data for up to a year, the update **must** land at a
new versioned path — never overwrite an existing version's files.

1. Bump `geo-tz` to the new **exact** version in `site/package.json`, then
   `npm install` in `site/` to update `site/package-lock.json`. Commit the lock.
2. Set the same version in `src/shared/geo-tz-data.json` (extension).
3. Set the same version in `GEO_TZ_DATA_VERSION` in
   `site/src/lib/verification/geo-timezone.ts`.
4. Run `node scripts/copy-geo-tz-data.mjs` in `site/` locally — it must print
   `data version <new> verified across extension + site`. If it fails, one of
   the three is out of sync; fix and rerun.
5. Ship a **new extension build** so installed clients request the new path. The
   old path keeps serving old clients until they update.
6. Deploy the site. The new `/geo-tz/<new>/…` directory goes live; old versioned
   paths remain for not-yet-updated clients.

> Keep older versioned directories live as long as extensions pinned to them are
> in the field. They're static and cheap; removing one breaks any client still
> requesting it.

## Failure Modes & Behavior

The extension's `getTimezoneForCoordinates()` (`src/background/timezone.ts`)
degrades deliberately when the boundary lookup fails (network error, range
hiccup, service-worker suspension mid-fetch):

1. **Boundary lookup succeeds** → real IANA zone, cached for the session.
2. **Lookup fails / returns nothing / returns `Etc/GMT`** → prefer the
   geo-service `ianaHint` (VPN-sync path only) — a real named zone with DST.
3. **No usable hint** → crude longitude estimate (`Etc/GMT±N`), `fallback: true`,
   **not cached** and saved as `null` by the caller so the real lookup is retried
   on the next sync. We never persist or serve an `Etc/GMT` zone — it's a
   fingerprintable, DST-less bucket and exactly the leak we're preventing.

Because of this, **site/CDN uptime affects correctness, not just convenience**: a
prolonged outage means manual locations (no hint) fall back to `null` and leak
the real zone. The VPN-sync `ianaHint` path mitigates synced locations.

## Quick Diagnostics

Verify the live endpoints behave (replace the version as needed):

```sh
# Index: expect 200, content-encoding: br, access-control-allow-origin: *
curl -sI https://geospoof.com/geo-tz/8.1.6/timezones.geojson.index.json

# Data range: expect 206, accept-ranges: bytes, content-range …/29259572
curl -sI -H "Range: bytes=0-100" https://geospoof.com/geo-tz/8.1.6/timezones.geojson.geo.dat
```

In the extension background console, a healthy lookup logs:

```
Timezone resolved: { identifier: "Asia/Baku", offset: 240, dstOffset: 0 }
```

A leak-risk fallback instead logs a `WARN` about using a fallback / `Etc/GMT`.

## Related Files

| Path                                        | Role                                        |
| ------------------------------------------- | ------------------------------------------- |
| `src/background/timezone.ts`                | Extension: resolution + fallback ladder     |
| `src/shared/geo-tz-data.json`               | Canonical data version (extension URL)      |
| `site/src/lib/verification/geo-timezone.ts` | Verify page: resolution + version literal   |
| `site/scripts/copy-geo-tz-data.mjs`         | Build-time copy + drift guard               |
| `site/vercel.json`                          | `npm ci` install + `/geo-tz/` cache headers |

See also: [VPN_SYNC.md](VPN_SYNC.md) (where the `ianaHint` comes from) and
[API.md](API.md) (the `getTimezoneForCoordinates` contract).
