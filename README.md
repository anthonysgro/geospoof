# GeoSpoof

Firefox extension to spoof your browser's geolocation, timezone, and prevent WebRTC IP leaks.

## Features

- 🌍 **Location Spoofing** - Override geolocation API with any coordinates
- 🕐 **Timezone Spoofing** - Automatically match timezone to spoofed location
- 🔒 **WebRTC Protection** - Prevent IP address leaks through WebRTC
- 🔍 **City Search** - Search for locations by city name
- 📍 **Manual Coordinates** - Enter exact latitude/longitude
- ✅ **Built-in Testing** - Quick links to verify protection

## Installation

### From Source (Development)

```bash
git clone https://github.com/anthonysgro/geospoof.git
cd geospoof
npm install
npm run build:dev
```

Then in Firefox:

1. Navigate to `about:debugging`
2. Click "This Firefox" → "Load Temporary Add-on"
3. Select `dist/manifest.json`

### From Firefox Add-ons (Coming Soon)

Extension will be published to Firefox Add-ons store.

### Building from Source (for Mozilla reviewers)

These steps produce an exact copy of the distributed extension from source.

**Requirements:**

- OS: macOS, Linux, or Windows
- Node.js 18+ (tested with v24.12.0)
- npm 9+ (tested with v11.8.0)

**Steps:**

```bash
# 1. Extract the source archive (or clone the repo)
# 2. Install dependencies (exact versions locked in package-lock.json)
npm install

# 3. Copy the environment config
cp .env.example .env

# 4. Build the production extension
npm run build:prod
```

The `dist/` folder now contains the extension. All output files are generated from the TypeScript source in `src/` using Vite (bundler) and esbuild (minifier). No source files are hand-minified or obfuscated.

**What the build does:**

- Compiles TypeScript (`src/`) to JavaScript via Vite + esbuild
- Bundles each entry point into a standalone `.js` file (no code splitting)
- Minifies production output and strips `console.log`/`console.debug` calls
- Copies static assets (manifest.json, popup HTML/CSS, icons) to `dist/`
- Syncs the version from `package.json` into `dist/manifest.json`

**No other tools** (template engines, CSS preprocessors, code generators) are used.

## Quick Start

1. Click the GeoSpoof icon in your toolbar
2. Search for a city or enter coordinates
3. Enable "Location Protection" and "WebRTC Protection"
4. Refresh any open tabs to apply changes

See [USER_GUIDE.md](USER_GUIDE.md) for detailed usage instructions.

## How It Works

Firefox extensions run in isolated security layers that can't be merged, so GeoSpoof uses three scripts that pass data down a chain:

```
┌──────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Background     │ ───► │  Content Script  │ ───► │ Injected Script │
│                  │      │                  │      │                 │
│ Stores settings, │      │ Bridge between   │      │ Runs inside the │
│ calls APIs,      │      │ the extension    │      │ webpage — the   │
│ manages tabs     │      │ and the webpage  │      │ only place that │
│                  │      │                  │      │ can override    │
│ ✓ Extension APIs │      │ ✓ DOM access     │      │ geolocation &   │
│ ✗ Page access    │      │ ✗ Page globals   │      │ timezone APIs   │
└──────────────────┘      └──────────────────┘      └─────────────────┘
   browser.runtime  ───►    CustomEvent     ───►    API overrides
```

Why three? Firefox enforces strict boundaries between extension code and page code. No single script has both extension API access (storage, networking) and the ability to modify a page's JavaScript globals (`navigator.geolocation`). The content script exists solely to bridge that gap.

The injection happens synchronously before any page JavaScript runs, so there's no window where a site could read your real location.

**WebRTC protection** works separately — it uses Firefox's built-in privacy API to prevent IP leaks through WebRTC connections. No script injection needed.

## Development

### Prerequisites

- Node.js 18+
- npm 9+
- Firefox 115+

### Setup

```bash
npm install
cp .env.example .env
```

### Build Commands

```bash
npm run build:dev    # Development build (source maps, console logs)
npm run build:prod   # Production build (minified, no console.log)
npm run dev          # Watch mode — rebuilds on file changes
npm run package      # Production build + create distribution ZIP
npm run clean        # Remove dist/, coverage/, and zip files
```

### Code Quality

```bash
npm run type-check   # TypeScript type checking
npm run lint         # Check for linting issues
npm run lint:fix     # Auto-fix linting issues
npm run format       # Format all files with Prettier
npm run format:check # Check formatting without changes
npm run validate     # Run type-check + lint + format:check + test
```

### Testing

```bash
npm test                  # Run all tests
npm run test:unit         # Unit tests only
npm run test:property     # Property-based tests only
npm run test:integration  # Integration tests only
npm run test:watch        # Watch mode
npm run test:coverage     # Generate coverage report
```

### Environment Variables

Create a `.env` file (copy from `.env.example`):

```env
DEBUG=false
EVENT_NAME=_gsu
```

**Production vs Development:**

| Feature      | Development                  | Production               |
| ------------ | ---------------------------- | ------------------------ |
| Console logs | ✓ Included                   | ✗ Removed                |
| Source maps  | ✓ Included                   | ✗ Removed                |
| Minification | ✗ Disabled                   | ✓ Enabled                |
| Event name   | `__geospoof_settings_update` | `_gsu` (configurable)    |
| File size    | Larger                       | Smaller (~60% reduction) |

### Project Structure

```
geospoof/
├── src/
│   ├── background/   # Background script (settings, geocoding, timezone)
│   ├── content/      # Content scripts (API overrides)
│   ├── popup/        # Extension popup UI
│   ├── shared/       # Shared types and utilities
│   └── types/        # Global type declarations
├── tests/            # Test suite
│   ├── unit/         # Unit tests
│   ├── integration/  # Integration tests
│   └── property/     # Property-based tests
├── popup/            # Popup HTML/CSS assets
├── icons/            # Extension icons
├── .env.example      # Environment variables template
├── vite.config.ts    # Build configuration
├── tsconfig.json     # TypeScript configuration
└── manifest.json     # Extension manifest
```

### TypeScript

All source code is TypeScript with strict mode enabled. Shared type definitions live in `src/shared/types/`. Path aliases (`@/background`, `@/content`, `@/popup`, `@/shared`) are available for imports.

### Testing

We use Vitest with property-based testing (fast-check):

```bash
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:property      # Property-based tests only
npm run test:coverage      # With coverage report
```

**Test Coverage:** Tests covering:

- Unit tests for individual functions
- Integration tests for user workflows
- Property-based tests for correctness invariants

## Technical Details

### Browser Compatibility

- **Firefox**: 115+ (ESR and stable)
- **Chrome/Edge**: Not supported (uses Firefox-specific APIs)

### External APIs

- **Geocoding**: OpenStreetMap Nominatim API
- **Timezone**: GeoNames API (free tier)
- **Testing**: BrowserLeaks.com

### Build System

- **Language**: TypeScript 5.x (strict mode)
- **Bundler**: Vite 5.x
- **Test Runner**: Vitest + fast-check
- **Linter**: ESLint 9 with TypeScript support
- **Formatter**: Prettier 3

## Privacy & Security

### What We Collect

**Nothing.** This extension:

- Does NOT track your browsing activity
- Does NOT collect analytics or telemetry
- Does NOT store data on external servers
- Does NOT share data with third parties

### Local Storage

All settings are stored locally in Firefox's storage API:

- Spoofed location coordinates
- Timezone preferences
- WebRTC protection settings
- Onboarding status

### Third-Party API Calls

When you search for a city or set a location, the extension makes API calls to:

- **Nominatim (OpenStreetMap)**: For geocoding
- **GeoNames**: For timezone lookup

These calls are made directly from your browser. We don't log or have access to this data.

See [PRIVACY_POLICY.md](PRIVACY_POLICY.md) for full details.

## Limitations & Disclaimers

### What This Extension Does NOT Do

- ❌ **Does NOT change browser language/locale** - May create detectable inconsistencies
- ❌ **Does NOT spoof IP address** - Use a VPN for IP spoofing
- ❌ **Does NOT bypass server-side detection** - Websites can still detect via IP, payment methods, etc.

### Legal & Terms of Service

⚠️ **Important**: Using location spoofing may violate the terms of service of certain websites, particularly:

- Streaming services (Netflix, HBO Max, Disney+, Hulu)
- Financial services
- E-commerce platforms with region-specific pricing

**You are responsible for ensuring your use complies with applicable terms of service and laws.** The extension developer is not liable for any violations or consequences.

### Intended Use Cases

✅ **Legitimate uses:**

- Privacy protection and testing
- Web development and testing
- Educational purposes
- Reducing location tracking on general websites

❌ **Not intended for:**

- Circumventing geo-restrictions on copyrighted content
- Fraud or deception
- Violating terms of service agreements

## Contributing

Contributions are welcome.

1. Fork and clone the repo
2. `npm install && cp .env.example .env`
3. Create a branch: `git checkout -b feature/your-feature`
4. Write tests, make changes, run `npm run validate`
5. Push and open a pull request

Pre-commit hooks automatically lint and format staged files. Use conventional commit messages (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `chore:`).

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support & Resources

- 📖 [User Guide](USER_GUIDE.md) - Detailed usage instructions
- � [Report Issues](https://github.com/anthonysgro/geospoof/issues)
- ☕ [Buy me a coffee](https://buymeacoffee.com/sgro)

## Acknowledgments

- [OpenStreetMap Nominatim](https://nominatim.org/) for geocoding
- [GeoNames](https://www.geonames.org/) for timezone data
- [BrowserLeaks](https://browserleaks.com/) for testing tools
- All contributors and users
