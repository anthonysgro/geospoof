# Site Filters

Site Filters let you control **which sites GeoSpoof spoofs on**. Instead of spoofing everywhere, you can limit spoofing to a list of sites (or spoof everywhere _except_ a list). Filters live in the **Filters** tab of the popup.

This page is the complete reference for the pattern language you type into a filter list. The popup shows a short "What patterns can I use?" summary; this page covers every form, the exact matching rules, and the limitations.

## The three modes

| Mode          | What it does                                                           |
| ------------- | ---------------------------------------------------------------------- |
| **All**       | Spoof on every site (the default). Filter lists are ignored.           |
| **Allowlist** | Spoof **only** on sites that match a pattern in the list.              |
| **Denylist**  | Spoof on every site **except** those that match a pattern in the list. |

The master **Location Protection** toggle is still the on/off switch. Mode only decides _which_ sites are spoofed _when_ protection is on.

## Pattern quick reference

| You type              | It matches                                                                    |
| --------------------- | ----------------------------------------------------------------------------- |
| `example.com`         | the site **and** all its subdomains (`www.example.com`, `app.example.com`, …) |
| `*.example.com`       | subdomains only — **not** `example.com` itself                                |
| `*.ru`                | any site ending in `.ru` (`example.ru`, `a.b.ru`, …)                          |
| `*`                   | any host                                                                      |
| `localhost`           | `localhost` on any port                                                       |
| `localhost:3000`      | `localhost`, port 3000 only                                                   |
| `127.0.0.1:8080`      | that IP address and port                                                      |
| `example.com/app/*`   | that path and everything under it                                             |
| `https://example.com` | `https` only                                                                  |
| `*://example.com`     | any scheme                                                                    |

A pattern has the shape `[scheme://]host[:port][/path]`. Only the `host` is required; everything else is optional.

## Host matching

### Plain domains cover subdomains

A bare domain matches the domain **and every subdomain beneath it**:

- `example.com` matches `example.com`, `www.example.com`, `app.example.com`, `a.b.example.com`.

This is the most common form and usually what you want.

### `*.` matches subdomains only (this is the one to remember)

A leading `*.` matches subdomains but **excludes the apex**:

- `*.example.com` matches `www.example.com` and `app.example.com`, but **not** `example.com` itself.

> **The key gotcha.** `example.com` includes the apex; `*.example.com` does not. If you want the whole site, use the plain form `example.com`. Use `*.example.com` only when you deliberately want to leave the bare domain out.

### Wildcard TLDs and suffixes

Because `*.` matches any suffix, you can scope an entire top-level domain:

- `*.ru` matches `example.ru`, `shop.example.ru`, `a.b.ru` — any host that ends in `.ru`.

Handy for scoping traffic to whole country-code TLDs (`*.ru`, `*.cn`, `*.ir`, …).

### Any host

- `*` matches every host. In an allowlist it means "spoof everywhere" (same as All mode); in a denylist it means "spoof nowhere." Most useful combined with a path, e.g. `*/checkout/*`.

### localhost and IP addresses

Local development hosts work as first-class patterns:

- `localhost` — matches `localhost` on any port.
- `127.0.0.1` — matches that IPv4 address.

(Single-label hosts other than `localhost`, e.g. `intranet`, are **not** accepted — a bare label with no dot is rejected to avoid a stray word matching an entire TLD.)

## Ports

Add `:port` to match a specific port. This is the main reason a plain domain filter used to fail for dev servers:

- `localhost:3000` matches `localhost` on port 3000 only.
- `example.com:8443` matches that host on port 8443 only.
- Omit the port (`localhost`) to match **any** port.

## Paths (sub-routes)

Add a path to scope spoofing to part of a site. Paths use `*` as a wildcard and match against the URL's path only:

- `example.com/app/*` matches `/app/`, `/app/dashboard`, `/app/x/y` — anything under `/app/`.
- `example.com/checkout` matches only the exact path `/checkout` (no trailing `*` means no prefix match).
- A pattern with no path (`example.com`) matches **any** path.

Common uses: spoof only on a mapping sub-route (`example.com/maps/*`), or, in denylist mode, suppress spoofing on a tracking sub-route (`example.com/analytics/*`).

## Schemes

By default a pattern matches both `http` and `https` (and nothing else — GeoSpoof only runs on `http`/`https` pages). You can pin the scheme:

- `https://example.com` — `https` only.
- `http://localhost:3000` — `http` only.
- `*://example.com` — any scheme.

## What is _not_ supported

- **Regular expressions.** `*` is the only wildcard. Patterns like `example\.(com|net)` or `/user/\d+` are rejected. This is deliberate — it keeps patterns readable and avoids a class of performance problems.
- **Wildcards inside a label.** `ap*.example.com` or `example.*` are rejected. `*` is allowed only as the whole host, as a leading `*.`, or inside a path.
- **Query strings and hash routes.** Path matching looks at the URL path only. `?query=…` and `#/hash/route` are ignored, so you can't filter on them.
- **IPv6 literals** (e.g. `[::1]:3000`) are not accepted in this version.

Anything invalid is rejected inline when you add it, so a bad pattern is never silently stored.

## Limitations and behavior notes

- **The decision is made from the tab's top-level (address-bar) URL.** Every frame in the tab — including cross-origin iframes and embedded widgets — inherits the top-level page's decision. An iframe's own URL is never evaluated separately.
- **Single-page apps (path filters).** When a site changes route without a full page load (History API), GeoSpoof re-evaluates and turns spoofing on/off for new activity. However, overrides already applied to objects the page created while in scope stay in effect until the page reloads. If you rely on path filtering on a heavy single-page app, a reload gives the cleanest result.
- **Trailing slash / `:*`.** `example.com/` is treated the same as `example.com` (whole site), and `example.com:*` the same as `example.com` (any port).
- **Case.** Scheme and host are case-insensitive; the path is case-sensitive.

## Privacy

Your filter lists **never leave your device**. GeoSpoof evaluates them entirely in the extension background and only ever tells a page whether spoofing is on or off for it — it never sends the page your list. (Even the little site icons in the list are generated locally, so no favicon request reveals your list to anyone.)

## Availability

Site Filters work on Firefox, Chrome, and Safari and require no extra permissions. On iOS/macOS, per-site filtering is a **GeoSpoof Pro** feature — without Pro, spoofing applies everywhere (All mode). The core one-click spoofing path is always free.

## Examples

| Goal                                         | Mode      | Pattern(s)                |
| -------------------------------------------- | --------- | ------------------------- |
| Spoof only on one site (and its subdomains)  | Allowlist | `example.com`             |
| Spoof on every `.ru` site                    | Allowlist | `*.ru`                    |
| Spoof everywhere except your bank            | Denylist  | `mybank.com`              |
| Spoof only your local dev server             | Allowlist | `localhost:3000`          |
| Spoof only inside a site's app section       | Allowlist | `example.com/app/*`       |
| Spoof everywhere except a tracking sub-route | Denylist  | `example.com/analytics/*` |
| Spoof only on subdomains, not the apex       | Allowlist | `*.example.com`           |
