# GeoSpoof

Your VPN changes your IP address. Your browser is still telling websites where you actually are.

Install: [Firefox Add-ons](https://addons.mozilla.org/en-US/firefox/addon/geo-spoof/) · [Chrome Web Store](https://chromewebstore.google.com/detail/geospoof/dgdbdodafgaeifgajaajohkjjgobcgje)

Supports Firefox 140+, Firefox Android, Chrome, Brave, and Edge.

<p>
  <img src="assets/screenshot1.png" alt="GeoSpoof main view" width="250"  />
    <img src="assets/screenshot2.png" alt="GeoSpoof details view" width="250"  />
  <img src="assets/screenshot3.png" alt="GeoSpoof details view" width="250"  />
</p>

## Why GeoSpoof?

### The Problem

Your browser leaks your location through multiple channels: the Geolocation API, timezone offsets, `Intl.DateTimeFormat`, and WebRTC. You get almost no control over it. A VPN changes your IP, but these signals still point right back to where you're sitting. Sites cross-reference them against your IP, and when they don't match, you're flagged.

Blocking geolocation requests is your right, but some sites treat it as evasion and restrict access or flag your account. And if you allow it, your real coordinates go straight to the site. You're stuck choosing between access and privacy.

### The Fix

GeoSpoof gives you full control over what your browser reports. Set your location to match your VPN, mismatch it on purpose for extra obfuscation, or pick somewhere entirely different. GPS coordinates, timezone, `Intl` locale data, Date APIs, the Temporal API, and WebRTC all stay in sync with whatever you choose.

- **VPN Region Sync**: Detects your VPN exit IP and sets your spoofed location to match. One click, no manual coordinates.
- **Manual Coordinates**: Search for a city or enter any latitude/longitude directly. Your location doesn't have to match your VPN.
- **Full Signal Alignment**: All location signals — geolocation, timezone offset, `Intl.DateTimeFormat`, Date getters, Date constructor, `Temporal.Now`, and WebRTC — report the same place. Sites see one consistent identity instead of mismatched data.
- **Real-World Timezone Offsets**: Offsets are derived from the browser's own IANA timezone database via `Intl.DateTimeFormat`, so historical and DST-aware offsets match what a real user in that timezone would produce. No hardcoded offset tables that go stale.
- **Cross-Browser**: Works on Firefox, Chrome, Brave, and Edge. Single codebase, MV3 on both platforms.
- **Bypass Hard Gates**: Sites that refuse to load without geolocation permission get a clean, consistent response.
- **Dev & QA**: Test geofenced apps, localized content, or location-aware UIs without leaving your desk.

> **Note:** Use of this tool may violate the Terms of Service of certain websites. This is purely in the interest of legitimate privacy use and development purposes. Use responsibly.

### What This Does NOT Do

GeoSpoof is designed to work alongside a VPN, not replace one.

- Does NOT spoof your IP address (use a VPN for that)
- Does NOT change browser language or locale
- Does NOT bypass server-side detection (IP, payment info, account history)
- Does NOT track your browsing activity, collect telemetry, or store data on external servers. Some features (city search, VPN sync) call third-party APIs to function. See [External Services](#external-services) for exactly what's sent and to whom.

## Overridden APIs

When protection is enabled, GeoSpoof overrides the following browser APIs on every page. All overrides are injected synchronously at `document_start` before any page JavaScript runs.

### Geolocation

| API                                                    | Behavior                          |
| ------------------------------------------------------ | --------------------------------- |
| `navigator.geolocation.getCurrentPosition()`           | Returns your spoofed coordinates  |
| `navigator.geolocation.watchPosition()`                | Returns your spoofed coordinates  |
| `navigator.geolocation.clearWatch()`                   | Clears spoofed watch callbacks    |
| `navigator.permissions.query({ name: "geolocation" })` | Reports permission as `"granted"` |

### Timezone & Date

| API                                               | Behavior                                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `Date.prototype.getTimezoneOffset()`              | Returns the correct offset for the spoofed timezone, including DST transitions                                   |
| `Intl.DateTimeFormat()` constructor               | Injects the spoofed IANA timezone into all format options                                                        |
| `Intl.DateTimeFormat.prototype.resolvedOptions()` | Returns the spoofed timezone identifier                                                                          |
| `Date.prototype.toString()`                       | Outputs `{weekday} {month} {day} {year} {HH:mm:ss} GMT{±HHMM} ({timezone long name})` using the spoofed timezone |
| `Date.prototype.toDateString()`                   | Outputs `{weekday} {month} {day} {year}` formatted in the spoofed timezone                                       |
| `Date.prototype.toTimeString()`                   | Outputs `{HH:mm:ss} GMT{±HHMM} ({timezone long name})` using the spoofed timezone                                |
| `Date.prototype.toLocaleString()`                 | Delegates to `Intl.DateTimeFormat` with the spoofed timezone injected                                            |
| `Date.prototype.toLocaleDateString()`             | Delegates to `Intl.DateTimeFormat` with the spoofed timezone injected                                            |
| `Date.prototype.toLocaleTimeString()`             | Delegates to `Intl.DateTimeFormat` with the spoofed timezone injected                                            |
| `Date.prototype.getHours()`                       | Returns hours in the spoofed timezone                                                                            |
| `Date.prototype.getMinutes()`                     | Returns minutes in the spoofed timezone                                                                          |
| `Date.prototype.getSeconds()`                     | Returns seconds in the spoofed timezone                                                                          |
| `Date.prototype.getDate()`                        | Returns day of month in the spoofed timezone                                                                     |
| `Date.prototype.getDay()`                         | Returns day of week in the spoofed timezone                                                                      |
| `Date.prototype.getMonth()`                       | Returns month in the spoofed timezone                                                                            |
| `Date.prototype.getFullYear()`                    | Returns year in the spoofed timezone                                                                             |
| `new Date(string)` (ambiguous strings)            | Adjusts epoch so the date is interpreted in the spoofed timezone instead of the real one                         |
| `new Date(year, month, ...)` (multi-arg)          | Adjusts epoch so the date is interpreted in the spoofed timezone instead of the real one                         |
| `Date.parse(string)` (ambiguous strings)          | Same epoch adjustment as the constructor                                                                         |

### Temporal API

Feature-detected at runtime. If the browser supports `Temporal`, these are overridden:

| API                               | Behavior                                                  |
| --------------------------------- | --------------------------------------------------------- |
| `Temporal.Now.timeZoneId()`       | Returns the spoofed IANA timezone identifier              |
| `Temporal.Now.plainDateTimeISO()` | Uses the spoofed timezone when no explicit timezone given |
| `Temporal.Now.plainDateISO()`     | Uses the spoofed timezone when no explicit timezone given |
| `Temporal.Now.plainTimeISO()`     | Uses the spoofed timezone when no explicit timezone given |
| `Temporal.Now.zonedDateTimeISO()` | Uses the spoofed timezone when no explicit timezone given |

### WebRTC

| API                                      | Behavior                                                                                           |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `privacy.network.webRTCIPHandlingPolicy` | Configured via the browser's built-in privacy API to prevent IP leaks — no script injection needed |

### Anti-Fingerprinting

Overridden functions are disguised to pass standard detection checks used by most fingerprinting scripts:

| Technique                       | What it does                                                                                                           |
| ------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `Function.prototype.toString`   | All overrides return `function name() { [native code] }` — indistinguishable from real builtins                        |
| Method shorthand wrapping       | Overrides have no `prototype` property and no `[[Construct]]`, matching native method behavior                         |
| Iframe `contentWindow` patching | Iframes get their `toString` patched synchronously on access, before fingerprinting scripts can grab a clean reference |
| DOM insertion wrapping          | `appendChild`, `insertBefore`, `innerHTML`, etc. (11 methods) synchronously patch iframes on insertion                 |

> **Privacy caveat:** These overrides pass the checks that real-world fingerprinting scripts typically run. Dedicated forensic tools like [TorZillaPrint](https://arkenfox.github.io/TZP/tzp.html) and [CreepJS](https://abrahamjuliot.github.io/creepjs/) can still detect content-script-level overrides through engine internals, Web Worker context leaks, and timing side-channels. Full undetectability requires browser-level changes (Tor Browser, Mullvad Browser). GeoSpoof does the best that's possible from an extension.

## Installation

**Firefox:** https://addons.mozilla.org/en-US/firefox/addon/geo-spoof

**Chrome / Brave / Edge:** https://chromewebstore.google.com/detail/geospoof/dgdbdodafgaeifgajaajohkjjgobcgje

**From source (Firefox):**

```bash
git clone https://github.com/anthonysgro/geospoof.git
cd geospoof
npm install
cp .env.example .env
npm run build:firefox
npm run start:firefox   # Launches Firefox with the extension loaded
```

**From source (Chrome / Brave / Edge):**

```bash
git clone https://github.com/anthonysgro/geospoof.git
cd geospoof
npm install
cp .env.example .env
npm run build:chromium
```

Then load `dist/` as an unpacked extension:

1. Go to `chrome://extensions` (or `brave://extensions`, `edge://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist/` folder

Or use `npm run start:chrome` / `npm run start:brave` to build and launch automatically.

**From GitHub Releases (Firefox):**

1. Go to the [Releases](https://github.com/anthonysgro/geospoof/releases) page
2. Download `geospoof-<version>-signed.xpi` from the latest release
3. In Firefox, open `about:addons`
4. Click the gear icon (⚙) and select **Install Add-on From File…**
5. Select the downloaded `.xpi` file

The signed XPI works on standard Firefox with no extra configuration. Once installed, Firefox automatically checks for and installs new versions — no need to manually download each release.

> **Note:** An unsigned `geospoof-<version>.xpi` is also included in each release for Firefox forks that don't support AMO signatures (LibreWolf, Waterfox, Floorp, etc.). Most users should use the signed version.

**From GitHub Releases (Chromium sideloading):**

1. Go to the [Releases](https://github.com/anthonysgro/geospoof/releases) page
2. Download the `geospoof-chromium-v<version>.zip` file from the latest release
3. Unzip it to a folder on your machine
4. Go to `chrome://extensions` (or `brave://extensions`, `edge://extensions`)
5. Enable "Developer mode"
6. Click "Load unpacked" and select the unzipped folder

## Usage

1. Click the GeoSpoof icon in your toolbar
2. Search for a city, enter coordinates manually, or use "Sync with VPN" to auto-detect your VPN exit region
3. Enable "Location Protection" and "WebRTC Protection"
4. Refresh open tabs to apply

See [USER_GUIDE.md](USER_GUIDE.md) for details.

## External Services

| Service                                                            | When                           | What's sent                                                            | Source                                                                 |
| ------------------------------------------------------------------ | ------------------------------ | ---------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Nominatim](https://nominatim.org/) (OpenStreetMap)                | City search, reverse geocoding | Search query or coordinates                                            | [GitHub](https://github.com/osm-search/Nominatim)                      |
| [browser-geo-tz](https://www.npmjs.com/package/browser-geo-tz) CDN | Timezone resolution            | HTTPS range requests for boundary data chunks (coordinates stay local) | [GitHub](https://github.com/kevmo314/browser-geo-tz)                   |
| [ipify](https://www.ipify.org/)                                    | VPN sync enabled               | HTTPS request to detect your public IP                                 | [GitHub](https://github.com/rdegges/ipify-api)                         |
| [FreeIPAPI](https://freeipapi.com/)                                | VPN sync enabled               | Your public IP (to geolocate VPN exit region)                          | Closed source ([Privacy Policy](https://freeipapi.com/privacy-policy)) |

> **VPN Sync privacy note:** When you enable "Sync with VPN," your public IP is sent to `api.ipify.org` and `freeipapi.com` over HTTPS to determine your VPN exit region. Your IP is never saved to disk — it's held only in memory and cleared when you disable VPN sync. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for full details.

No data is sent to the extension developer. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## Development

**Requirements:** Node.js 18+, npm 9+, Firefox 140+ or any Chromium-based browser

### Quick Start

```bash
git clone https://github.com/anthonysgro/geospoof.git
cd geospoof
npm install
cp .env.example .env
```

### Day-to-Day Development

Open two terminals:

```bash
# Terminal 1 — watches your source files and rebuilds on every save
npm run dev

# Terminal 2 — launches Firefox with the extension loaded, auto-reloads on rebuild
npm start
```

That's it. Edit code, save, Firefox reloads. If something looks wrong, check the browser console (`about:debugging` → Inspect for background, F12 for content scripts).

For Chromium development, use `npm run start:chrome` or `npm run start:brave` instead.

### Scripts Reference

| Command                    | What it does                                                           |
| -------------------------- | ---------------------------------------------------------------------- |
| `npm run dev`              | Watch mode — Vite rebuilds `dist/` on every file change                |
| `npm start`                | Launch Firefox with the extension loaded from `dist/`                  |
| `npm run build:dev`        | One-time dev build (source maps, console logs)                         |
| `npm run build:prod`       | One-time production build (minified, no logs)                          |
| `npm run build:firefox`    | Production build targeting Firefox                                     |
| `npm run build:chromium`   | Production build targeting Chrome/Brave/Edge                           |
| `npm test`                 | Run all tests                                                          |
| `npm run lint:ext`         | Lint the extension manifest and files                                  |
| `npm run validate`         | Type-check + lint + format check + tests (run before PRs)              |
| `npm run package`          | Firefox production build + zip for AMO submission                      |
| `npm run package:chromium` | Chromium production build + zip for Chrome Web Store                   |
| `npm run package:xpi`      | Production build + package as `.xpi` for sideloading                   |
| `npm run package:source`   | Zip source code for AMO review (excludes node_modules, dist, etc.)     |
| `npm run sign:xpi`         | Sign the built `.xpi` via AMO self-distribution (requires credentials) |
| `npm run start:firefox`    | Launch Firefox with the extension loaded                               |
| `npm run start:chrome`     | Build for Chromium + launch Chrome                                     |
| `npm run start:brave`      | Build for Chromium + launch Brave                                      |
| `npm run start:android`    | Launch on Firefox for Android (USB, auto-detects device)               |

### Testing on Android

Requires `adb` (`brew install android-platform-tools`) and a USB-connected Android device with Firefox installed.

1. Enable Developer Options on your device (Settings → About Phone → tap Build Number 7 times)
2. Enable USB Debugging (Settings → Developer Options → USB Debugging)
3. In Firefox for Android: Settings → Remote debugging via USB → On
4. Connect via USB and run:

```bash
npm run build:dev
npm run start:android
```

The script auto-detects the first connected device via `adb`. To target a specific device, pass its ID manually:

```bash
npm run start:android -- <device-id>
```

You can find device IDs with `adb devices`.

### Signing Pipeline Setup (Maintainers)

The release workflow signs the `.xpi` via AMO's self-distribution channel and deploys an update manifest to GitHub Pages. This requires two GitHub Actions secrets:

| Secret           | Description              |
| ---------------- | ------------------------ |
| `AMO_JWT_ISSUER` | AMO API key (JWT issuer) |
| `AMO_JWT_SECRET` | AMO API secret           |

To generate credentials:

1. Go to the [AMO API Keys page](https://addons.mozilla.org/en-US/developers/addon/api/key/)
2. Sign in with the Mozilla account that owns the extension listing
3. Generate a new key pair — you'll get a JWT issuer and JWT secret
4. In your GitHub repo, go to Settings → Secrets and variables → Actions
5. Add `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` with the values from step 3

Once configured, pushing a `v*` tag triggers the full pipeline: build → sign → generate update manifest → create GitHub Release → deploy `update.json` to GitHub Pages. If signing fails, the workflow stops and no release is created.

For local signing (testing), set `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` in your `.env` and run:

```bash
npm run build:firefox
npm run package:xpi
npm run sign:xpi
```

### Building for Review

**Firefox (AMO):**

```bash
npm install
cp .env.example .env
npm run package
```

This runs a production build and packages the extension into `web-ext-artifacts/geospoof-<version>.zip` for AMO submission. TypeScript source in `src/` is compiled via Vite + esbuild. No hand-minification or obfuscation.

**Chromium (Chrome Web Store):**

```bash
npm install
cp .env.example .env
npm run package:chromium
```

This produces `web-ext-artifacts/geospoof-chromium-v<version>.zip`.

### Project Structure

```
src/
├── background/          # Settings, geocoding, timezone resolution, VPN sync
├── build/               # Manifest generator (Firefox/Chromium targets)
├── content/
│   ├── index.ts         # Content script (bridge between background and injected)
│   └── injected/        # Page-context API overrides (12 modules)
├── popup/               # Extension popup UI
└── shared/              # Shared types and utilities
tests/
├── unit/                # Unit tests
├── integration/         # Integration tests
└── property/            # Property-based tests (fast-check)
```

## Legal

Using location spoofing may violate terms of service of streaming, financial, or e-commerce platforms. You are responsible for compliance. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for full details.

## License

MIT — see [LICENSE](LICENSE).

## Links

- [User Guide](USER_GUIDE.md)
- [Privacy Policy](PRIVACY_POLICY.md)
- [Report Issues](https://github.com/anthonysgro/geospoof/issues)
- [Buy me a coffee](https://buymeacoffee.com/sgro)

## Acknowledgments

- [Nominatim](https://nominatim.org/) for geocoding
- [browser-geo-tz](https://github.com/kevmo314/browser-geo-tz) for timezone boundary-data lookup
- [BrowserLeaks](https://browserleaks.com/) for testing tools
