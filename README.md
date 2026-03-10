# GeoSpoof

Firefox extension that spoofs your geolocation, timezone, and WebRTC to prevent websites from identifying your real location.

Install: [Firefox Add-ons Store](https://addons.mozilla.org/en-US/firefox/addon/geo-spoof/)

<p>
  <img src="assets/screenshot1.png" alt="GeoSpoof main view" width="350"  />
  <img src="assets/screenshot2.png" alt="GeoSpoof details view" width="350"  />
</p>

## Why Use GeoSpoof?

When using a VPN, your browser's geolocation creates a problem either way. If you "Block" geolocation requests, modern web security systems using Digital Consistency Checking treat that as a signal you're hiding data, leading to restricted access or account flags. If you "Allow" geolocation, your real GPS coordinates are sent to the site and contradict your VPN's IP address — a mismatch that immediately identifies you as using a VPN.

GeoSpoof allows you to maintain a Synchronized Identity:

- **Consistency**: Aligns your GPS, IANA Timezone, and WebRTC interface to match your VPN endpoint, making your connection appear as a legitimate local user.
- **Bypass "Hard Gates"**: Access services (like regional streaming or local retail inventory) that refuse to load unless geolocation is granted.
- **Silent Protection**: Prevents "leakage" from WebRTC and Timezone offsets that can reveal your true location even when a VPN is active.
- **Development & QA**: Test location-dependent features without physically being in the target region — useful for developers building geofenced apps, localized content, or location-aware UIs.

> **Note:** Use of this tool is legal, but may violate the Terms of Service of certain websites. I absolutely **do not endorse any illegitimate or illegal use of this tool**, this is purely in the interest of legitimate privacy use and development purposes. Use responsibly.

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
2. Search for a city or enter coordinates manually
3. Enable "Location Protection" and "WebRTC Protection"
4. Refresh open tabs to apply

See [USER_GUIDE.md](USER_GUIDE.md) for details.

## What This Does NOT Do

- Does not change browser language or locale
- Does not spoof your IP address (use a VPN for that)
- Does not bypass server-side detection (IP, payment info, account history)

## External Services

| Service                                                          | When                           | What's sent                                                            |
| ---------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------- |
| [Nominatim](https://nominatim.org/) (OpenStreetMap)              | City search, reverse geocoding | Search query or coordinates                                            |
| [browser-geo-tz](https://github.com/kevmo314/browser-geo-tz) CDN | Timezone resolution            | HTTPS range requests for boundary data chunks (coordinates stay local) |

No data is sent to the extension developer. See [PRIVACY_POLICY.md](PRIVACY_POLICY.md).

## Development

**Requirements:** Node.js 18+, npm 9+, Firefox 115+

```bash
npm run build:dev      # Dev build (source maps, console logs)
npm run build:prod     # Production build (minified)
npm run dev            # Watch mode (rebuilds on file changes)
npm start              # Launch Firefox with extension loaded
npm run validate       # Type-check + lint + extension lint + format + test
npm test               # All tests
npm run test:unit      # Unit tests
npm run test:property  # Property-based tests
npm run test:integration  # Integration tests
npm run lint:ext       # Lint extension manifest and files
npm run package        # Production build + package .zip for AMO
npm run start:android  # Launch on Firefox for Android (USB)
```

For the best dev experience, run `npm run dev` and `npm start` in separate terminals. Vite rebuilds on file changes and `web-ext` auto-reloads the extension in Firefox.

### Testing on Android

Requires `adb` (`brew install android-platform-tools`) and a USB-connected Android device with Firefox installed.

1. Enable Developer Options on your device (Settings → About Phone → tap Build Number 7 times)
2. Enable USB Debugging (Settings → Developer Options → USB Debugging)
3. In Firefox for Android: Settings → Remote debugging via USB → On
4. Connect via USB and run:

```bash
npm run build:dev
npm run start:android -- <device-id>
```

Get your device ID from `adb devices`.

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
