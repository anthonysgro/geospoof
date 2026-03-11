# GeoSpoof

Firefox extension that spoofs your geolocation, timezone, and WebRTC to prevent websites from identifying your real location.

Install: [Firefox Add-ons Store](https://addons.mozilla.org/en-US/firefox/addon/geo-spoof/)

<p>
  <img src="assets/screenshot1.png" alt="GeoSpoof main view" width="350"  />
  <img src="assets/screenshot3.png" alt="GeoSpoof details view" width="350"  />
</p>

## Why Use GeoSpoof?

When using a VPN, your browser's geolocation creates a problem either way. If you "Block" geolocation requests, websites treat that as a signal you're hiding data, leading to restricted access or account flags. If you "Allow" geolocation, your real GPS coordinates are sent to the site — and geolocation consistency checks compare those against your VPN's IP address, timezone, and other signals. The mismatch immediately identifies you as using a VPN.

GeoSpoof allows your browser to maintain a synchronized identity with your VPN.

- **Consistency**: Aligns your GPS, IANA Timezone, and WebRTC interface to match your VPN tunnel.
- **VPN Region Sync**: Automatically detects your VPN exit region and sets your spoofed location to match — one click, no manual coordinates needed.
- **Bypass "Hard Gates"**: Access services that refuse to load unless geolocation is granted.
- **Silent Protection**: Prevents leakage from WebRTC and Timezone offsets that can reveal your local IP even when a VPN is active.
- **Development & QA**: Useful for developers building geofenced apps, localized content, or location-aware UIs.

> **Note:** Use of this tool may violate the Terms of Service of certain websites. This is purely in the interest of legitimate privacy use and development purposes. Use responsibly.

## What This Does NOT Do

- Does NOT spoof your IP address (use a VPN for that)
- Does NOT change browser language or locale
- Does NOT bypass server-side detection (IP, payment info, account history)
- Does NOT track your browsing activity, collect telemetry, store data on external servers, or share data with third parties for advertising for marketing.

## Overridden APIs

When protection is enabled, GeoSpoof overrides the following browser APIs on every page. All overrides are injected synchronously at `document_start` before any page JavaScript runs.

### Geolocation

| API                                                    | Behavior                          |
| ------------------------------------------------------ | --------------------------------- |
| `navigator.geolocation.getCurrentPosition()`           | Returns your spoofed coordinates  |
| `navigator.geolocation.watchPosition()`                | Returns your spoofed coordinates  |
| `navigator.geolocation.clearWatch()`                   | Clears spoofed watch callbacks    |
| `navigator.permissions.query({ name: "geolocation" })` | Reports permission as `"granted"` |

### Timezone

| API                                               | Behavior                                                                       |
| ------------------------------------------------- | ------------------------------------------------------------------------------ |
| `Date.prototype.getTimezoneOffset()`              | Returns the correct offset for the spoofed timezone, including DST transitions |
| `Intl.DateTimeFormat()` constructor               | Injects the spoofed IANA timezone into all format options                      |
| `Intl.DateTimeFormat.prototype.resolvedOptions()` | Returns the spoofed timezone identifier                                        |
| `Date.prototype.toString()`                       | Formats using the spoofed timezone                                             |
| `Date.prototype.toTimeString()`                   | Formats using the spoofed timezone                                             |
| `Date.prototype.toLocaleString()`                 | Formats using the spoofed timezone                                             |
| `Date.prototype.toLocaleDateString()`             | Formats using the spoofed timezone                                             |
| `Date.prototype.toLocaleTimeString()`             | Formats using the spoofed timezone                                             |

### WebRTC

| API                                      | Behavior                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `privacy.network.webRTCIPHandlingPolicy` | Configured via Firefox's built-in privacy API to prevent IP leaks — no script injection needed |

## How It Works

Firefox enforces strict boundaries between extension code and page code. No single script has both extension API access and the ability to modify page globals like `navigator.geolocation`. GeoSpoof uses three scripts:

```
Background Script  ──►  Content Script  ──►  Injected Script
(settings, APIs)        (bridge)              (API overrides)
```

The background script resolves timezone from coordinates using [browser-geo-tz](https://github.com/kevmo314/browser-geo-tz) boundary data (fetched via CDN range requests). Reverse geocoding uses [Nominatim](https://nominatim.org/) (OpenStreetMap). The content script bridges settings to the injected script, which runs in the page context and overrides the APIs listed above.

## Installation

**From Firefox Add-ons:** https://addons.mozilla.org/en-US/firefox/addon/geo-spoof

**From source:**

```bash
git clone https://github.com/anthonysgro/geospoof.git
cd geospoof
npm install
cp .env.example .env
npm run build:dev
npm start              # Launches Firefox with the extension loaded
```

Or load `dist/manifest.json` manually as a temporary add-on via `about:debugging`.

## Usage

1. Click the GeoSpoof icon in your toolbar
2. Search for a city, enter coordinates manually, or use "Sync with VPN" to auto-detect your VPN exit region
3. Enable "Location Protection" and "WebRTC Protection"
4. Refresh open tabs to apply

See [USER_GUIDE.md](USER_GUIDE.md) for details.

## External Services

| Service                                                          | When                           | What's sent                                                            |
| ---------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| [Nominatim](https://nominatim.org/) (OpenStreetMap)              | City search, reverse geocoding | Search query or coordinates                                            |
| [browser-geo-tz](https://github.com/kevmo314/browser-geo-tz) CDN | Timezone resolution            | HTTPS range requests for boundary data chunks (coordinates stay local) |
| [ipify](https://www.ipify.org/)                                  | VPN sync enabled               | HTTPS request to detect your public IP                                 |
| [FreeIPAPI](https://freeipapi.com/)                              | VPN sync enabled               | Your public IP (to geolocate VPN exit region)                          |

> **VPN Sync privacy note:** When you enable "Sync with VPN," your public IP is sent to `api.ipify.org` and `freeipapi.com` over HTTPS to determine your VPN exit region. Your IP is never saved to disk — it's held only in memory and cleared when you disable VPN sync. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for full details.

No data is sent to the extension developer. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## Development

**Requirements:** Node.js 18+, npm 9+, Firefox 115+

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

### Scripts Reference

| Command                  | What it does                                                       |
| ------------------------ | ------------------------------------------------------------------ |
| `npm run dev`            | Watch mode — Vite rebuilds `dist/` on every file change            |
| `npm start`              | Launch Firefox with the extension loaded from `dist/`              |
| `npm run build:dev`      | One-time dev build (source maps, console logs)                     |
| `npm run build:prod`     | One-time production build (minified, no logs)                      |
| `npm test`               | Run all tests                                                      |
| `npm run lint:ext`       | Lint the extension manifest and files                              |
| `npm run validate`       | Type-check + lint + format check + tests (run before PRs)          |
| `npm run package`        | Production build + zip for AMO submission                          |
| `npm run package:source` | Zip source code for AMO review (excludes node_modules, dist, etc.) |
| `npm run start:android`  | Launch on Firefox for Android (USB, auto-detects device)           |

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

### Building for Mozilla Review

```bash
npm install
cp .env.example .env
npm run package
```

This runs a production build and packages the extension into `web-ext-artifacts/geospoof-<version>.zip` for AMO submission. TypeScript source in `src/` is compiled via Vite + esbuild. No hand-minification or obfuscation.

### Project Structure

```
src/
├── background/   # Settings, geocoding, timezone resolution
├── content/      # Content + injected scripts (API overrides)
├── popup/        # Extension popup UI
└── shared/       # Shared types and utilities
tests/
├── unit/         # Unit tests
├── integration/  # Integration tests
└── property/     # Property-based tests (fast-check)
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
