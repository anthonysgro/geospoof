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

### From Source

1. Clone this repository
2. Open Firefox and navigate to `about:debugging`
3. Click "This Firefox" → "Load Temporary Add-on"
4. Select `manifest.json` from the project directory

### From Firefox Add-ons (Coming Soon)

Extension will be published to Firefox Add-ons store.

## Quick Start

1. Click the GeoSpoof icon in your toolbar
2. Search for a city or enter coordinates
3. Enable "Location Protection" and "WebRTC Protection"
4. Refresh any open tabs to apply changes

See [USER_GUIDE.md](USER_GUIDE.md) for detailed instructions.

## How It Works

- **Geolocation API**: Overrides `navigator.geolocation` methods
- **Timezone API**: Overrides `Date.prototype.getTimezoneOffset()` and `Intl.DateTimeFormat`
- **WebRTC Protection**: Uses Firefox privacy API to disable non-proxied UDP

All overrides are applied at `document_start` before page scripts execute.

## Development

### Setup

```bash
npm install
```

### Run Tests

```bash
npm test
```

357 tests covering unit, integration, and property-based testing.

### Project Structure

```
geospoof/
├── background/       # Background script (settings, geocoding, timezone)
├── content/          # Content scripts (API overrides)
├── popup/            # Extension popup UI
├── icons/            # Extension icons
├── tests/            # Test suite
│   ├── unit/         # Unit tests
│   ├── integration/  # Integration tests
│   └── property/     # Property-based tests
└── manifest.json     # Extension manifest
```

## Technical Details

- **Browser**: Firefox 115+ (uses Firefox-specific APIs)
- **Geocoding**: OpenStreetMap Nominatim API
- **Timezone**: GeoNames API
- **Testing**: Jest with fast-check for property-based testing

See [.kiro/steering/api-documentation.md](.kiro/steering/api-documentation.md) for full API documentation.

## Privacy

- No data collection or analytics
- All settings stored locally
- Geocoding queries sent to public APIs only
- Open source and auditable

## Limitations

- **Firefox only** - Uses Firefox-specific privacy APIs
- **Client-side only** - Cannot bypass server-side location detection
- **VPN recommended** - For full privacy, use with a VPN matching your spoofed location

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Add tests for new features
4. Ensure all tests pass (`npm test`)
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Support

- [User Guide](USER_GUIDE.md)
- [API Documentation](.kiro/steering/api-documentation.md)
- [Buy me a coffee ☕](https://buymeacoffee.com/sgro)

## Acknowledgments

- OpenStreetMap Nominatim for geocoding
- GeoNames for timezone data
- BrowserLeaks for testing tools
