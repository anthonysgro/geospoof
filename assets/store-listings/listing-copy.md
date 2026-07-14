# Chrome Web Store Listing — GeoSpoof

This file tracks the store listing copy. Where each field lives:

| Field                                 | Source of truth                                      | Notes                                                                                                                  |
| ------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| **Title** (`name`)                    | `src/build/manifest.ts` (chromium override)          | Baked into the build. Max 75 chars.                                                                                    |
| **Short description** (`description`) | `src/build/manifest.ts` (chromium override)          | Baked into the build. Max 132 chars; shown under the name and in search results.                                       |
| **Detailed description**              | Chrome Web Store Developer Dashboard (paste by hand) | No manifest field exists for it. The copy below is the source of truth — paste it into the dashboard on each revision. |

ASO note: Chrome's [listing policy](https://developer.chrome.com/docs/webstore/program-policies/listing-requirements)
bans keyword spam. The practical ceiling is ~5 repetitions per keyword. Counts
below stay within that: `geolocation` = 5, `location changer/changers` = 3,
`GPS` = 3. Do not push these higher when editing.

---

## Title (manifest `name` — 38 chars)

```
GeoSpoof: Spoof Geolocation & Timezone
```

The "&" joins two different things you spoof (geolocation & timezone), so it
reads cleanly with no "location…location" repetition. Leads with the exact
"spoof geolocation" query; the location-changer intent is carried by the
description body (at the keyword cap there), not the title. Alternatives if you
ever want the location-changer query in the title instead:

```
GeoSpoof: Geolocation Spoofer & Location Changer   (parallel nouns; keeps exact "location changer", drops exact "spoof geolocation")
GeoSpoof: Spoof Geolocation & Change Location       (parallel verbs; repeats "location")
```

## Short description (manifest `description` — 123 chars)

```
Spoof geolocation, fake your GPS location & timezone — change your location to any city or sync it to your VPN. No account.
```

---

## Detailed description (paste into the Web Store dashboard — plain text)

🛡️ Spoof geolocation, timezone, and every location signal — in one click.

GeoSpoof is a privacy-first geolocation spoofer and location changer for Chrome. Flip one switch and every site reads the fake location you choose, not where you really are.

A basic location changer just moves the map pin. GeoSpoof goes further — it aligns your timezone, blocks WebRTC IP leaks, and auto-syncs to your VPN, so every signal matches your chosen spot.

Pick a city, type exact coordinates, or let GeoSpoof match your VPN automatically. Turn it off anytime and your real position returns untouched.

⭐ Why people choose GeoSpoof over a basic location changer

1️⃣ Set a fake GPS location in one click — any city or exact coordinates.
2️⃣ VPN Sync — detect your VPN's exit region and match your location to it.
3️⃣ Auto background sync — switch VPN servers and your location follows automatically.
4️⃣ Timezone too — clock and date match your location, so nothing gives you away.
5️⃣ Block WebRTC leaks — keep your real IP hidden, even behind a VPN.
6️⃣ Engine-level spoofing — deeper coverage that reaches workers and loads before the page.
7️⃣ Anti-fingerprinting — every signal stays consistent, so your location holds up.
8️⃣ Per-site control — allowlist or denylist which sites get spoofed.
9️⃣ Save favorites — pin up to 10 places, switch in a tap.
🔟 No account, no tracking, no analytics — everything stays on your device.

📍 Set your fake location any way you like

▸ Search by city or address and land on the exact spot.
▸ Enter precise latitude and longitude by hand for a clean GPS fix.
▸ Tune accuracy, from realistic to a custom meter value.
▸ Save the places you use most and reuse them instantly.

🌍 Spoof geolocation with or without a VPN

A VPN changes your IP. GeoSpoof rewrites the coordinates your browser reports through the geolocation API — and can sync the two together.

Run it solo, or pair it with your VPN so your IP, location, and timezone all tell the same story.

🔒 Privacy comes first

🔹 Everything runs on your device — GeoSpoof never sends your real location to a server.
🔹 No account, no tracking, no analytics. Settings live locally.
🔹 Open source — review exactly what it does on GitHub.
🔹 Turn protection off and your genuine coordinates return untouched.

💡 Who it's for

◆ Privacy-minded people who don't want sites logging where they are.
◆ Developers testing location, timezone, and region features.
◆ Anyone reaching region-specific content and services.
◆ VPN users who want their browser location to match their exit node.

❓ FAQ

📌 Will sites still see my real location?
💡 No. While protection is on, the browser returns the spot you picked.

📌 Is this a VPN?
💡 No. GeoSpoof changes the coordinates your browser reports, not your IP. It pairs perfectly with a VPN and can even sync to it automatically.

📌 Can I set an exact point?
💡 Yes. Enter precise latitude and longitude, or search a city, for a clean GPS spoof.

📌 Does it change my timezone too?
💡 Yes. GeoSpoof spoofs your timezone alongside your location so the two always match — a giveaway that location-only changers miss.

📌 Is this just a location changer?
💡 It's a location changer and more. GeoSpoof sets a fake location, then also matches your timezone and blocks WebRTC leaks so nothing contradicts it.

📌 Does it work on Google Maps?
💡 Yes. GeoSpoof works on any site that uses the browser geolocation API.

📌 Is my data safe?
💡 Yes. GeoSpoof runs locally, collects nothing, and is open source. Nothing about your location leaves your device.

📌 Do I need to sign up?
💡 No account and no setup. Install and start changing your location right away.

📲 Now on iPhone, iPad & Mac too.

Install GeoSpoof, set a fake location, and decide exactly what the web sees about where you are.

Links:
— geospoof.com
— github.com/anthonysgro/geospoof

---

# Firefox Add-on Listing (AMO) — GeoSpoof

AMO field sources:

| Field                    | Source of truth                                                                  | Notes                                                                                                                                                                                                                                                                                    |
| ------------------------ | -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Name**                 | `_locales/en/messages.json` (`extensionName`) → manifest `__MSG_extensionName__` | "GeoSpoof". Localized per-locale.                                                                                                                                                                                                                                                        |
| **Summary**              | `_locales/en/messages.json` (`extensionDescription`)                             | Leads with the WebRTC value prop.                                                                                                                                                                                                                                                        |
| **Detailed description** | AMO Developer Hub (paste by hand)                                                | **Markdown**, not HTML. AMO dropped HTML support in March 2025 (https://blog.mozilla.org/addons/2025/03/03/markdown/). Supported: bold, italic, monospace, links, abbreviations, code blocks, blockquotes, ordered/unordered lists. **No headings** — use bold lines for section titles. |

Differences vs. the Chrome detailed description:

- Real Markdown formatting (bold headers, numbered/bulleted lists, inline links).
- Feature 6 is Firefox's worker-level timezone protection + optional Instant
  timezone protection (`userScripts`), not Chrome's debugger-based Engine-level
  Spoofing.
- WebRTC is emphasized (matches the Firefox `extensionDescription`).
- Same keyword discipline: geolocation = 5, location changer = 3, GPS = 3.

## Detailed description (paste into AMO — Markdown)

**🛡️ Spoof geolocation, timezone, and every location signal — in one click.**

GeoSpoof is a privacy-first **geolocation spoofer** and **location changer** for Firefox. Flip one switch and every site reads the fake location you choose, not where you really are.

A basic location changer just moves the map pin. GeoSpoof goes further — it aligns your **timezone**, blocks **WebRTC IP leaks**, and auto-syncs to your **VPN**, so every signal matches your chosen spot.

Pick a city, type exact coordinates, or let GeoSpoof match your VPN automatically. Turn it off anytime and your real position returns untouched.

**⭐ Why people choose GeoSpoof over a basic location changer**

1. **Set a fake GPS location in one click** — any city or exact coordinates.
2. **VPN Sync** — detect your VPN's exit region and match your location to it.
3. **Auto background sync** — switch VPN servers and your location follows automatically.
4. **Timezone too** — clock and date match your location, so nothing gives you away.
5. **Block WebRTC leaks** — keep your real IP hidden, even behind a VPN.
6. **Worker-level timezone protection** — closes worker and cold-start leaks, with optional first-script coverage.
7. **Anti-fingerprinting** — every signal stays consistent, so your location holds up.
8. **Per-site control** — allowlist or denylist which sites get spoofed.
9. **Save favorites** — pin up to 10 places, switch in a tap.
10. **No account, no tracking, no analytics** — everything stays on your device.

**📍 Set your fake location any way you like**

- Search by city or address and land on the exact spot.
- Enter precise latitude and longitude by hand for a clean GPS fix.
- Tune accuracy, from realistic to a custom meter value.
- Save the places you use most and reuse them instantly.

**🌍 Spoof geolocation with or without a VPN**

A VPN changes your IP. GeoSpoof rewrites the coordinates your browser reports through the geolocation API — and can sync the two together.

Run it solo, or pair it with your VPN so your IP, location, and timezone all tell the same story.

**🔒 Privacy comes first**

- Everything runs on your device — GeoSpoof never sends your real location to a server.
- No account, no tracking, no analytics. Settings live locally.
- _Open source_ — review exactly what it does on [GitHub](https://github.com/anthonysgro/geospoof).
- Turn protection off and your genuine coordinates return untouched.

**💡 Who it's for**

- Privacy-minded people who don't want sites logging where they are.
- Developers testing location, timezone, and region features.
- Anyone reaching region-specific content and services.
- VPN users who want their browser location to match their exit node.

**❓ FAQ**

📌 **Will sites still see my real location?** No. While protection is on, the browser returns the spot you picked.

📌 **Is this a VPN?** No. GeoSpoof changes the coordinates your browser reports, not your IP. It pairs perfectly with a VPN and can even sync to it automatically.

📌 **Can I set an exact point?** Yes. Enter precise latitude and longitude, or search a city, for a clean GPS spoof.

📌 **Does it change my timezone too?** Yes. GeoSpoof spoofs your timezone alongside your location so the two always match — a giveaway that location-only changers miss.

📌 **Is this just a location changer?** It's a location changer and more. GeoSpoof sets a fake location, then also matches your timezone and blocks WebRTC leaks so nothing contradicts it.

📌 **Does it work on Google Maps?** Yes. GeoSpoof works on any site that uses the browser geolocation API.

📌 **Is my data safe?** Yes. GeoSpoof runs locally, collects nothing, and is open source. Nothing about your location leaves your device.

📌 **Do I need to sign up?** No account and no setup. Install and start changing your location right away.

**📲 Now on iPhone, iPad & Mac too.**

Install GeoSpoof, set a fake location, and decide exactly what the web sees about where you are.

Links:

- [geospoof.com](https://geospoof.com)
- [GitHub](https://github.com/anthonysgro/geospoof)

---

# App Store Listing (iOS / iPadOS / macOS) — GeoSpoof

**ASO model is different from Chrome/AMO.** Apple does NOT index the description
for search. Only three fields feed App Store search ranking:

| Field                | Limit      | Role                                                                                                                              |
| -------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **App name**         | 30 chars   | Highest-weighted search field.                                                                                                    |
| **Subtitle**         | 30 chars   | High-weighted search field. Use keywords NOT in the name.                                                                         |
| **Keywords**         | 100 chars  | Hidden, comma-separated, NO spaces. Use tokens NOT in name/subtitle — Apple combines tokens across all three fields into phrases. |
| **Promotional text** | 170 chars  | Above the description; updatable without review. Not indexed.                                                                     |
| **Description**      | 4000 chars | Conversion copy only — NOT indexed. Do not keyword-stuff.                                                                         |

Apple auto-handles singular/plural and forms phrases by combining tokens across
name + subtitle + keywords, so never repeat a word across those fields.

## App name (30 chars)

```
GeoSpoof: Location Spoofer
```

Recommended — accurate to what the app does (spoofs Safari's location), captures
the "location spoofer" query. Alternatives:

```
GeoSpoof - Fake GPS Location   (higher-volume "fake gps" query, but still risky — device GPS exists only as a Pro feature that needs the Mac companion, so a "Fake GPS" name over-promises for free/iPhone-only users and pulls game-cheat installs)
GeoSpoof: Spoof Location       (shorter; "spoof location")
```

## Subtitle (29 chars)

```
Safari GPS & Timezone Changer
```

Leads with "Safari" so scope is honest up front (the app itself spoofs Safari;
device-level system GPS is a separate Pro feature that needs the Mac companion,
so the indexed metadata intentionally doesn't lead with it), which keeps out the
wrong installs and the 1-star "doesn't work in Pokémon GO" reviews. Keeps the
high-value `changer` token (→ "location changer") plus `gps` and `timezone`,
with no wasted stop words. `fake` and `safari`'s extra reach are carried by the
keyword field instead.

## Keywords field (100 chars — no spaces, no name/subtitle repeats)

```
fake,spoof,geolocation,vpn,teleport,region,virtual,mock,coordinates,privacy,map,emulator,hide,change
```

Reasoning notes:

- `spoof` is included on purpose. "Spoofer" (name) → "spoof" is a derivational
  change, NOT a singular/plural pair, and Apple only reliably matches
  singular↔plural. So the standalone `spoof` token is what actually earns
  "spoof location" / "spoof gps".
- `change` (same logic vs. "Changer") captures the high-volume "change location",
  "change gps", "change timezone" queries.
- `geolocation` stays so "spoof geolocation" can still form, without spending
  title characters on the low-volume `geolocation` token.
- Deliberately excluded: `faker` (low search volume; "fake \_\_\_" phrases already
  covered by `fake`), and `ip` (would imply IP-changing, which contradicts the
  "not a VPN" scope and pulls the wrong installs).

Phrases Apple can form by combining with name/subtitle tokens: location spoofer,
location changer, change location, fake location, spoof location, fake gps,
spoof gps, gps location, location privacy, hide location, vpn location, fake gps,
spoof geolocation, location emulator, teleport location.

## Promotional text (153 chars)

```
NEW — GeoSpoof GPS moves your iPhone's real system GPS to your chosen location, driven from a Mac companion app. A Pro feature; Safari spoofing stays free.
```

Not indexed and updatable without review, so this is the place to announce
GeoSpoof GPS (device-level location). Rotate the previous Auto Background Sync
line back in later if you want:

```
NEW Auto Background Sync: switch VPN servers and your Safari location follows automatically — no manual re-sync, no need to open the app.
```

## Description (conversion copy — paste into App Store Connect)

Your VPN changes your IP address. Your browser is still telling websites where you actually are.

GeoSpoof makes Safari report a location and timezone you choose — not your real one.

Websites read your true location through the browser's Geolocation API, timezone, date formatting, and WebRTC. When those signals don't match your VPN's region, you stand out. GeoSpoof aligns all of them to a single, consistent place.

FEATURES

• Sync with VPN — detect your VPN's exit region and automatically match your spoofed location to it. One tap.

• Auto Background Sync (Pro) — switch VPN servers and your Safari location follows automatically. No manual re-sync, and no need to open the GeoSpoof app.

• Device GPS (Pro) — move your iPhone's real system GPS, not just Safari, to your chosen location. Driven from the GeoSpoof GPS companion app for Mac over a secure, one-time pairing (no jailbreak). Reverts to your real GPS when you turn it off.

• Pick any location — search 33,000+ cities offline, or enter coordinates directly.

• Full signal alignment — Geolocation, timezone, Date, Intl, Temporal, and WebRTC all report the same place. Every browser API that can reveal your location is covered.

• WebRTC protection — prevents your real IP from leaking through WebRTC connections.

• Filters — choose which websites to spoof, with allow and deny lists.

• Favorites — save locations and switch between them instantly from the app or the home screen widget.

• Widgets and Controls — see your spoofed location and re-sync from the Home Screen, Lock Screen, and Control Center without opening the app.

• Private by design — no account, no login, no tracking, no analytics, no developer servers. Open source and auditable.

GEOSPOOF GPS — DEVICE-LEVEL LOCATION (NEW, PRO)

Safari spoofing keeps your browser private. GeoSpoof GPS goes further: it sets your iPhone's real, system-level location to the place you pick, so location-aware apps — not just Safari — match it too. It's driven from a companion Mac app, built for privacy and for testing location-based features. It's an optional Pro feature, requires a Mac for a one-time setup, and is not designed for AR games.

WHAT GEOSPOOF DOES NOT DO

GeoSpoof is not a VPN and does not change your IP address. For full location privacy, use it alongside a VPN. On its own, the GeoSpoof app spoofs Safari; moving your device's real system GPS is a separate Pro feature that uses the GeoSpoof GPS companion app for Mac. It does not change your browser's language or locale, bypass server-side detection (IP, payment methods, account history), or collect any data about you or your browsing.

NOTE

Using location spoofing may violate the terms of service of certain websites, particularly streaming services, financial platforms, and e-commerce sites. You are responsible for ensuring your use complies with applicable terms of service and laws.
