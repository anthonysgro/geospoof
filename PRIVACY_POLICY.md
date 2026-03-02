# Privacy Policy for GeoSpoof

**Last Updated:** March 1, 2026

## Overview

GeoSpoof is committed to protecting your privacy. This extension is designed to enhance your location privacy and does not collect, store, or transmit any personal data to the extension developer.

## Data Collection

**GeoSpoof does not collect any personal data.** The extension:

- Does NOT track your browsing activity
- Does NOT collect analytics or telemetry
- Does NOT store data on external servers
- Does NOT share data with third parties for advertising or marketing

## Local Data Storage

All extension settings are stored locally on your device using Firefox's local storage API:

- Your spoofed location coordinates
- Your timezone preferences
- WebRTC protection settings
- Onboarding completion status

This data never leaves your device and is only accessible by the extension.

## Third-Party API Usage

When you use certain features, the extension communicates with external services:

### 1. Nominatim (OpenStreetMap)

**When:** When you search for a city or the extension performs reverse geocoding
**Data Sent:** Search query (city name) or coordinates
**Purpose:** To find location coordinates or city names
**Privacy Policy:** [OpenStreetMap Privacy Policy](https://wiki.osmfoundation.org/wiki/Privacy_Policy)

### 2. GeoNames

**When:** When setting a location to determine the timezone
**Data Sent:** Latitude and longitude coordinates
**Purpose:** To determine the correct timezone for the spoofed location
**Privacy Policy:** [GeoNames Terms of Service](https://www.geonames.org/)

**Important:** These API calls are made directly from your browser to these services. The extension developer does not receive, log, or have access to this data.

## Permissions Explained

The extension requires the following permissions:

- **storage**: To save your settings locally on your device
- **privacy**: To configure WebRTC protection settings
- **<all_urls>**: To inject location spoofing on all websites you visit

These permissions are used solely for the extension's functionality and not for data collection.

## Data Security

- All settings are stored locally using Firefox's secure storage API
- No data is transmitted to the extension developer
- API calls to third-party services use HTTPS encryption

## Your Rights

You have complete control over your data:

- All settings can be cleared by disabling or removing the extension
- You can view all stored data in Firefox's extension storage inspector
- No account or registration is required

## Changes to This Policy

If this privacy policy changes, the updated version will be posted in the extension's repository and on the Firefox Add-ons page. The "Last Updated" date will be revised accordingly.

## Contact

For questions or concerns about this privacy policy:

- GitHub: [https://github.com/anthonysgro/geospoof](https://github.com/anthonysgro/geospoof)
- Email: [anthony.m.sgro@gmail.com]

## Open Source

GeoSpoof is open source. You can review the complete source code to verify these privacy practices:

[https://github.com/anthonysgro/geospoof](https://github.com/anthonysgro/geospoof)
