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

## Quick Start

1. Click the GeoSpoof icon in your toolbar
2. Search for a city or enter coordinates
3. Enable "Location Protection" and "WebRTC Protection"
4. Refresh any open tabs to apply changes

See [USER_GUIDE.md](USER_GUIDE.md) for detailed usage instructions.

## How It Works

- **Geolocation API**: Overrides `navigator.geolocation` methods
- **Timezone API**: Overrides `Date.prototype.getTimezoneOffset()` and `Intl.DateTimeFormat`
- **WebRTC Protection**: Uses Firefox privacy API to disable non-proxied UDP

All overrides are applied at `document_start` before page scripts execute.

## Development

### Prerequisites

- Node.js 16+
- npm 8+
- Firefox 115+

### Setup

```bash
npm install
cp .env.example .env  # Configure build settings
```

### Build Commands

```bash
npm run build:dev   # Development build with source maps and console logs
npm run build:prod  # Production build (minified, no console logs, stealth mode)
npm run watch       # Auto-rebuild on file changes
npm run package     # Create distribution ZIP file
npm run clean       # Remove build artifacts
```

### Code Quality

```bash
npm run format      # Format all files with Prettier
npm run format:check # Check formatting without changes
npm run lint        # Check for linting issues
npm run lint:fix    # Auto-fix linting issues
npm test            # Run all tests (357 tests)
npm run test:watch  # Run tests in watch mode
npm run test:coverage # Generate coverage report
```

### Environment Variables

Create a `.env` file (copy from `.env.example`):

```env
NODE_ENV=production        # development or production
EVENT_NAME=_gsu           # Custom event name for stealth
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
├── background/       # Background script (settings, geocoding, timezone)
├── content/          # Content scripts (API overrides)
│   ├── content.js    # Content script coordinator
│   └── injected.js   # Page context overrides
├── popup/            # Extension popup UI
│   ├── popup.html
│   ├── popup.css
│   └── popup.js
├── icons/            # Extension icons
├── tests/            # Test suite
│   ├── unit/         # Unit tests
│   ├── integration/  # Integration tests
│   └── property/     # Property-based tests
├── .env.example      # Environment variables template
├── webpack.config.js # Build configuration
└── manifest.json     # Extension manifest
```

### Testing

We use Jest with property-based testing (fast-check):

```bash
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:property      # Property-based tests only
npm run test:coverage      # With coverage report
```

**Test Coverage:** 357 tests covering:

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

- **Bundler**: Webpack 5
- **Minification**: Terser
- **Environment**: dotenv-webpack
- **Testing**: Jest + fast-check

See [API Documentation](.kiro/steering/api-documentation.md) for detailed technical docs.

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

Contributions are welcome! Here's how to get started:

### 1. Fork and Clone

```bash
git clone https://github.com/yourusername/geospoof.git
cd geospoof
npm install
```

### 2. Create a Branch

```bash
git checkout -b feature/your-feature-name
```

### 3. Make Changes

- Write clear, descriptive commit messages
- Add tests for new features
- Update documentation as needed
- Follow the existing code style

### 4. Ensure Quality

```bash
npm run format      # Format code
npm run lint        # Check linting
npm test            # Run all tests
npm run build:prod  # Verify production build works
```

### 5. Submit Pull Request

Push your branch and create a pull request on GitHub.

### Commit Message Guidelines

- `feat: Add timezone spoofing support`
- `fix: Resolve geolocation accuracy issue`
- `docs: Update installation instructions`
- `test: Add property tests for geocoding`
- `refactor: Simplify settings validation`
- `chore: Update dependencies`

### Adding New Features

1. Update requirements in `.kiro/specs/` (if major feature)
2. Write tests first (TDD approach)
3. Implement the feature
4. Add JSDoc comments
5. Update documentation

## License

MIT License - see [LICENSE](LICENSE) file for details.

## Support & Resources

- 📖 [User Guide](USER_GUIDE.md) - Detailed usage instructions
- 🔧 [API Documentation](.kiro/steering/api-documentation.md) - Technical API docs
- 🐛 [Report Issues](https://github.com/anthonysgro/geospoof/issues)
- ☕ [Buy me a coffee](https://buymeacoffee.com/sgro)

## Acknowledgments

- [OpenStreetMap Nominatim](https://nominatim.org/) for geocoding
- [GeoNames](https://www.geonames.org/) for timezone data
- [BrowserLeaks](https://browserleaks.com/) for testing tools
- All contributors and users
