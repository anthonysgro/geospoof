# Privacy Policy for GeoSpoof

**Last Updated:** May 6, 2026

## Overview

GeoSpoof is committed to protecting your privacy. This extension is designed to enhance your location privacy and does not collect, store, or transmit any personal data to the extension developer.

**GeoSpoof does not implement VPN functionality.** It does not use NetworkExtension or any VPN framework, and it does not route, tunnel, or inspect network traffic. The word "VPN" appears only in reference to the optional "Sync with VPN" feature, which helps align your browser's reported location with the exit region of a third-party VPN you are already running.

## Data Collection

**GeoSpoof does not collect any personal data.** The extension:

- Does NOT track your browsing activity
- Does NOT collect analytics or telemetry
- Does NOT store data on external servers
- Does NOT share data with third parties for advertising or marketing

## Local Data Storage

All extension settings are stored locally on your device using the browser's local storage API (`browser.storage.local`):

- Your spoofed location coordinates
- Your timezone preferences
- Resolved location name (city, country)
- WebRTC protection settings
- VPN sync preference
- Onboarding completion status

This data never leaves your device and is only accessible by the extension.

## Third-Party API Usage

When you use certain features, the extension communicates with external services. The developer operates no server and receives none of this data.

### 1. [Nominatim](https://nominatim.org/) (OpenStreetMap)

**When:** When you search for a city or the extension performs reverse geocoding.
**Data Sent:** Search query (city name) or coordinates, over HTTPS.
**Purpose:** To find location coordinates or city names.
**Privacy Policy:** [OpenStreetMap Privacy Policy](https://wiki.osmfoundation.org/wiki/Privacy_Policy)

### 2. VPN Sync Services

**When:** Only when you explicitly enable the "Sync with VPN" feature or tap the "Re-sync" button in the extension popup. This never happens automatically unless you have previously enabled VPN sync mode.

**Data Sent:** Your public IP address is first detected via ipify, then sent in parallel over HTTPS to up to four public IP geolocation services. The first successful response is used; the rest are cancelled. Only your public IP is transmitted — no identifiers, account data, or browsing history:

- **[ipify](https://www.ipify.org/)** (`api.ipify.org`): Detects your current public IP address. The request returns your public-facing IP.
- **[GeoJS](https://www.geojs.io/)** (`get.geojs.io`): Primary geolocation service. Receives your public IP and returns approximate geographic coordinates, city, and country.
- **[FreeIPAPI](https://freeipapi.com/)** (`free.freeipapi.com`): Fallback geolocation service. ([Privacy Policy](https://freeipapi.com/privacy-policy))
- **[ReallyFreeGeoIP](https://reallyfreegeoip.org/)** (`reallyfreegeoip.org`): Fallback geolocation service.
- **[ipinfo.io](https://ipinfo.io/)** (`ipinfo.io`): Fallback geolocation service. ([Privacy Policy](https://ipinfo.io/privacy-policy))

**Purpose:** To determine the geographic location of your VPN exit server so the extension can set your spoofed location to match your VPN region.

**Privacy Safeguards:**

- All requests use HTTPS encryption.
- Your IP address is **never persisted to disk**. It is only held in an in-memory cache for the duration of your browser session.
- The in-memory geolocation cache is **cleared immediately** when you disable VPN sync mode or switch to a different location input method.
- IP data only appears in transient message responses between the popup and background script and is discarded when the popup closes.

### 3. [browser-geo-tz](https://github.com/kevmo314/browser-geo-tz) (Timezone Boundary Data)

**When:** Used to determine the correct Timezone ID (e.g., `America/New_York`) for a selected location.
**Data Sent:** The extension makes HTTPS range requests to a CDN to fetch small chunks of geographic boundary data.
**Purpose:** This allows the extension to resolve your timezone entirely within your browser's memory using high-precision boundary maps, without needing a centralized API account.
**Note:** Your coordinates are never sent as a query or stored by a third-party API. The extension simply downloads the map data it needs to do the math locally on your machine.

**Important:** These data fetches are made directly from your browser to the CDN. The extension developer never receives, logs, or has access to your location or these requests.

## Permissions Explained

The extension requires the following permissions:

- **storage**: To save your settings locally on your device
- **privacy**: To configure WebRTC protection settings
- **<all_urls>**: To inject location spoofing on all websites you visit

These permissions are used solely for the extension's functionality and not for data collection.

## Data Security

- All settings are stored locally using the browser's secure storage API
- No data is transmitted to the extension developer
- All third-party API calls use HTTPS encryption
- The developer operates no backend server and maintains no user accounts

## Your Rights

You have complete control over your data:

- All settings can be cleared by disabling or removing the extension
- You can view all stored data in your browser's extension storage inspector
- No account or registration is required

## Changes to This Policy

If this privacy policy changes, the updated version will be posted in the extension's repository and on the GeoSpoof website. The "Last Updated" date will be revised accordingly. Continued use of the extension after changes are posted constitutes your acceptance of the updated policy.

## Contact

For questions or concerns about this privacy policy:

- Email: [support@geospoof.com](mailto:support@geospoof.com)
- GitHub: [https://github.com/anthonysgro/geospoof](https://github.com/anthonysgro/geospoof)

## Open Source

GeoSpoof is open source. You can review the complete source code to verify these privacy practices:

[https://github.com/anthonysgro/geospoof](https://github.com/anthonysgro/geospoof)

## Important Disclaimers

### What This Extension Does NOT Do

- **Does NOT implement VPN functionality** - No NetworkExtension, no tunneling, no traffic interception
- **Does NOT change browser language or locale settings** - Your browser's language preferences remain unchanged, which may create detectable inconsistencies with your spoofed location
- **Does NOT spoof IP address** - Your real IP address is still visible to websites unless you use a VPN
- **Does NOT bypass server-side detection** - Websites can still detect your location through IP address, payment methods, account history, and other server-side signals

### Terms of Service Compliance

Using location spoofing may violate the terms of service of certain websites, particularly:

- Streaming services (Netflix, HBO Max, Disney+, etc.)
- Financial services
- E-commerce platforms with region-specific pricing

**You are responsible for ensuring your use of this extension complies with applicable terms of service and laws.** The extension developer is not liable for any violations or consequences resulting from your use of this extension.

### Intended Use

This extension is intended for:

- Privacy protection and testing
- Web development and testing
- Educational purposes
- Legitimate privacy enhancement

This extension is NOT intended for:

- Circumventing geo-restrictions on copyrighted content
- Fraud or deception
- Violating terms of service agreements

I absolutely **do not endorse any illegitimate or illegal use of this tool** whatsoever. Use responsibly and in accordance with local laws and regulations.
