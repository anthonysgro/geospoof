# Contributing to GeoSpoof

## Requirements

Node.js 18+, npm 9+, Firefox 140+ or any Chromium-based browser

## Quick Start

```bash
git clone https://github.com/anthonysgro/geospoof.git
cd geospoof
npm install
cp .env.example .env
```

## Building from Source

**Firefox:**

```bash
npm run build:firefox
npm run start:firefox   # launches Firefox with the extension loaded from dist/
```

**Chrome / Brave / Edge:**

```bash
npm run build:chromium
```

Then load `dist/` as an unpacked extension:

1. Go to `chrome://extensions` (or `brave://extensions`, `edge://extensions`)
2. Enable "Developer mode"
3. Click "Load unpacked" and select the `dist/` folder

Or use `npm run start:chrome` / `npm run start:brave` to build and launch automatically.

## Day-to-Day Development

Open two terminals:

```bash
# Terminal 1 — watches your source files and rebuilds on every save
npm run dev

# Terminal 2 — launches Firefox with the extension loaded, auto-reloads on rebuild
npm start
```

Edit code, save, Firefox reloads. If something looks wrong, check the browser console (`about:debugging` → Inspect for background, F12 for content scripts).

For Chromium development, use `npm run start:chrome` or `npm run start:brave` instead.

## Scripts Reference

| Command                    | What it does                                                          |
| -------------------------- | --------------------------------------------------------------------- |
| `npm run dev`              | Watch mode — Vite rebuilds `dist/` on every file change               |
| `npm start`                | Launch Firefox with the extension loaded from `dist/`                 |
| `npm run build:dev`        | One-time dev build (source maps, console logs)                        |
| `npm run build:prod`       | One-time production build (minified, no logs)                         |
| `npm run build:firefox`    | Production build targeting Firefox                                    |
| `npm run build:chromium`   | Production build targeting Chrome/Brave/Edge                          |
| `npm test`                 | Run all tests                                                         |
| `npm run lint:ext`         | Lint the extension manifest and files                                 |
| `npm run validate`         | Type-check + lint + format check + tests (run before PRs)             |
| `npm run package`          | Firefox production build + zip for AMO submission                     |
| `npm run package:chromium` | Chromium production build + zip for Chrome Web Store                  |
| `npm run package:xpi`      | Production build + package as `.xpi` for sideloading                  |
| `npm run package:source`   | Zip source code for AMO review (excludes node_modules, dist, etc.)    |
| `npm run sign:xpi`         | Sign the built `.xpi` via AMO unlisted channel (requires credentials) |
| `npm run sign:xpi:amo`     | Sign the built `.xpi` via AMO listed channel (requires credentials)   |
| `npm run start:firefox`    | Launch Firefox with the extension loaded                              |
| `npm run start:chrome`     | Build for Chromium + launch Chrome                                    |
| `npm run start:brave`      | Build for Chromium + launch Brave                                     |
| `npm run start:android`    | Launch on Firefox for Android (USB, auto-detects device)              |

## Testing on Android

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

## Project Structure

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

## Building for Review

**Firefox (AMO):**

```bash
npm install
cp .env.example .env
npm run package
```

Produces `web-ext-artifacts/geospoof-<version>.zip` for AMO submission.

**Chromium (Chrome Web Store):**

```bash
npm install
cp .env.example .env
npm run package:chromium
```

Produces `web-ext-artifacts/geospoof-chromium-v<version>.zip`.

## Release Pipeline

A single `v*` tag push (e.g., `v1.18.0`) triggers the full release pipeline:

1. Build Firefox, package unsigned XPI and source zip
2. Inject build version (`1.18.0.{run}`) → sign unlisted (self-hosted)
3. Restore clean dist → strip `update_url` → sign listed (AMO) with source
4. Build Chromium
5. Create one GitHub Release with all artifacts (signed XPI, unsigned XPI, Chromium zip, source zip)
6. Deploy `update.json` to GitHub Pages for self-hosted auto-updates

The unlisted XPI uses a 4-segment version (e.g., `1.18.0.42`) while the AMO submission uses the clean 3-segment version (`1.18.0`). This avoids AMO's version uniqueness constraint across channels.

**Required GitHub Actions secrets:**

| Secret           | Description              |
| ---------------- | ------------------------ |
| `AMO_JWT_ISSUER` | AMO API key (JWT issuer) |
| `AMO_JWT_SECRET` | AMO API secret           |

To generate credentials: go to the [AMO API Keys page](https://addons.mozilla.org/en-US/developers/addon/api/key/) and sign in with the Mozilla account that owns the extension listing.

**Releasing:**

```bash
npm run validate
npm version patch   # or minor/major
git push origin main --tags
```

`npm version` bumps package.json, commits, and creates the `v*` tag automatically.

**Local signing (testing):**

```bash
# Unlisted (self-hosted)
npm run build:firefox
npm run package:xpi
npm run sign:xpi

# Listed (AMO)
npm run build:firefox
npm run package:source
npm run sign:xpi:amo
```

Both require `AMO_JWT_ISSUER` and `AMO_JWT_SECRET` in your `.env`.

## Useful Git Commands

```bash
git tag                      # list all tags
git tag -d v1.2.0            # delete a local tag
git push origin :v1.2.0      # delete a remote tag
git log --oneline --decorate # see commits with tags
```
