# GeoSpoof User Guide

Quick guide to using GeoSpoof to spoof your browser's geolocation and protect against IP leaks.

## Quick Start

1. **Set Your Location**
   - Search for a city OR enter coordinates manually
   - Click a search result to set location

2. **Enable Protection**
   - Toggle "Location Protection" ON
   - Toggle "WebRTC Protection" ON (recommended)

3. **Verify It Works**
   - Click test links in the extension (Geolocation, Timezone, IP Leak)
   - Refresh any open tabs to apply protection

## Features

### Location Spoofing

Overrides your browser's geolocation to show a fake location. Works on any website that requests your location.

### WebRTC Protection

Prevents websites from detecting your real IP address through WebRTC, even when using a VPN.

### Timezone Spoofing

Automatically adjusts your browser's timezone to match your spoofed location for consistency.

## How to Use

### Setting a Location

**Option 1: Search for a City**

1. Type a city name in the search box
2. Click a result from the dropdown
3. Wait for "Setting location..." to complete

**Option 2: Enter Coordinates**

1. Click "Enter Coordinates" tab
2. Enter latitude (-90 to 90) and longitude (-180 to 180)
3. Click "Set Location"

### Enabling Protection

**Location Protection**: Spoofs your geolocation API
**WebRTC Protection**: Prevents IP leaks through WebRTC

Both toggles work independently - you can enable one or both.

### Checking Status

**Badge Icon**:

- Green ✓ = Protection active
- Orange ! = Page needs refresh
- Gray (empty) = Protection disabled

**Details Tab**: Click "Details" to see exactly what's being spoofed (coordinates, timezone, APIs).

## Testing Your Protection

Use the built-in test links at the bottom of the extension:

- **Geolocation**: Verify your spoofed location coordinates
- **Timezone**: Check your spoofed timezone and date/time formatting
- **IP Leak**: Check for WebRTC IP leaks

## Important Notes

⚠️ **Refresh Required**: After enabling protection or changing location, refresh any open tabs for changes to take effect.

⚠️ **VPN Recommended**: This extension spoofs browser data only. For full privacy, use a VPN that matches your spoofed location.

⚠️ **Language/Locale Not Spoofed**: This extension does NOT change your browser's language or locale settings. Some websites (like streaming services) may detect inconsistencies if your browser language doesn't match your spoofed location. This is intentional - changing language settings could break your browsing experience.

⚠️ **Terms of Service**: Using location spoofing may violate the terms of service of some websites, particularly streaming services. Use responsibly and at your own risk.

## Troubleshooting

**Protection not working?**

- Refresh the page after enabling protection
- Check that the badge shows green ✓
- Try the test links to verify

**Search not finding cities?**

- Make sure you're typing at least 3 characters
- Try a more specific search (e.g., "London UK" instead of "London")
- Use coordinates if search fails

**Extension not loading?**

- Close and reopen the extension popup
- Restart Firefox if issues persist

## Privacy

- No data collection or tracking
- All settings stored locally in your browser
- Geocoding uses public APIs (OpenStreetMap, GeoNames)

## Support

Found this useful? [Buy me a coffee ☕](https://buymeacoffee.com/sgro)

Report issues on [GitHub](https://github.com/anthonysgro/geospoof)
