# Privacy Policy for GeoSpoof

**Last Updated:** June 6, 2026

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

The extension requires the following permissions. Exact permissions vary slightly by browser (some APIs do not exist on every engine), but the principles below apply everywhere.

- **storage**: To save your settings locally on your device
- **privacy** (Firefox/Chromium only): To configure WebRTC protection settings
- **proxy** (Firefox/Chromium only): To detect when a browser-based VPN switches exit nodes so VPN Sync can re-align your spoofed location. GeoSpoof only _observes_ proxy changes — it never sets or routes a proxy.
- **scripting**: To inject the location-spoofing overrides into pages
- **alarms**: To run periodic health checks that keep the spoofing overrides active
- **idle** (Firefox/Chromium only): Part of the VPN-sync re-check scheduling
- **`<all_urls>` / host access to all websites**: To inject location spoofing on every website you visit
- **webRequest permissions** (Firefox only): To repair the timezone leak inside Web Workers at the network layer

These permissions are used solely for the extension's functionality and not for data collection.

### Why Safari warns that GeoSpoof can "read and alter webpages"

When you enable GeoSpoof, Safari shows a prompt similar to:

> "The extension 'GeoSpoof' would like to access [websites]. This extension will be able to read and alter webpages and see your browsing history on these websites. This could include sensitive information, including passwords, phone numbers, and credit cards."

**This warning is standard for any extension that runs on every site, and the specific websites Safari names are simply the tabs you happen to have open at that moment — GeoSpoof does not single them out and has no special interest in them.** Safari shows this same wording for ad blockers, password managers, and dark-mode extensions.

GeoSpoof needs broad website access because its only job is to make every site you visit see your chosen location instead of your real one. To do that it must run a small script on each page that overrides the browser's location, timezone, and date APIs _before_ the page's own code runs. There is no narrower permission that would let it spoof location site-wide.

**What "read and alter webpages" technically allows vs. what GeoSpoof actually does:**

| Safari says it _could_                                             | What GeoSpoof _actually_ does                                                                                                                                              |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Read page content (including passwords, form fields, credit cards) | Never reads form fields, passwords, page text, or any page content. The overrides only replace location/time API return values.                                            |
| Alter webpages                                                     | Only "alters" the values returned by the Geolocation, `Date`, `Intl`, and Temporal APIs. It does not modify page text, inject ads, or rewrite content.                     |
| See your browsing history                                          | Never reads, stores, or transmits your history or the list of sites you visit.                                                                                             |
| Transmit data externally                                           | Sends nothing to the developer. The only outbound requests are the optional geocoding / VPN-sync API calls described above, and only when you actively use those features. |

The extension is open source, so you can verify all of the above:
[https://github.com/anthonysgro/geospoof](https://github.com/anthonysgro/geospoof)

**Which Safari permission option should you choose?**

- **Allow for One Day** — best for trying GeoSpoof out. Access expires automatically, so it's the lowest-commitment option.
- **Always Allow on Every Website** — most convenient if you want location protection everywhere without re-granting access.
- **Allow / Always Allow on specific websites** — if you only want spoofing on certain sites, grant access per-site and leave the rest unprotected.
- **Deny** — GeoSpoof will not run on that site (it cannot spoof your location there).

You can change or revoke any of these at any time in **Safari → Settings → Extensions → GeoSpoof**, or per-site from the **AA** menu in the address bar on iOS/iPadOS. Restricting access never deletes your settings — it only controls where spoofing is allowed to run.

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

## For Users in the European Economic Area, United Kingdom, and Switzerland

If you are located in the EEA, UK, or Switzerland, the following applies to you in addition to the rest of this policy.

**Controller:** Anthony Sgro, an individual developer based in the United States, acts as the data controller for any personal data processed by this extension. You can contact the controller at [support@geospoof.com](mailto:support@geospoof.com).

**Legal basis for processing:** The only personal data processed is your public IP address, and only when you explicitly enable the "Sync with VPN" feature. We rely on your consent (GDPR Art. 6(1)(a)), which you give by enabling the feature, and which you can withdraw at any time by disabling "Sync with VPN" in the extension popup. Withdrawing consent does not affect the lawfulness of processing based on consent before its withdrawal.

**International transfers:** The third-party services listed above (ipify, GeoJS, FreeIPAPI, ReallyFreeGeoIP, ipinfo.io, Nominatim) are operated outside the EEA, including in the United States. When you use features that contact these services, your public IP is transferred to their infrastructure. Each service is an independent controller and determines its own transfer mechanisms. The extension developer operates no server and performs no cross-border transfer on its own.

**Your rights under GDPR / UK GDPR:** you have the right to access, rectify, erase, restrict, object to, and port your personal data, and to withdraw consent at any time. Because the extension stores no personal data on any server controlled by the developer, most of these rights are exercised directly by you within the extension: uninstalling the extension or disabling "Sync with VPN" fully erases everything the developer could ever access. You also have the right to lodge a complaint with your local data protection authority.

**Retention:** Your public IP is held only in volatile memory for the current browser session and cleared when you disable the feature or close your browser. No retention period applies because no storage occurs.

## For California Residents

If you are a California resident, the California Consumer Privacy Act (CCPA), as amended by the California Privacy Rights Act (CPRA), gives you specific rights regarding your personal information.

**We do not sell or share your personal information** as those terms are defined under the CCPA/CPRA. We do not disclose personal information for cross-context behavioral advertising. We do not knowingly handle the personal information of consumers under 16.

**Categories collected:** The only category of personal information touched by the extension is an internet identifier (your public IP address), and only when you explicitly enable "Sync with VPN." It is used for the single purpose described above and is not retained.

**Your rights:** You have the right to know what personal information is collected, the right to delete personal information, the right to correct inaccurate personal information, the right to opt out of sale or sharing (there is nothing to opt out of here), and the right not to receive discriminatory treatment for exercising these rights. Because no personal information is retained by the developer, these rights are effectively exercised by uninstalling the extension or disabling the feature. For any inquiry, contact [support@geospoof.com](mailto:support@geospoof.com).

## Children's Privacy

GeoSpoof is not directed to children under 13, and we do not knowingly collect personal information from children under 13. If you believe a child under 13 has used the extension in a way that caused personal information to reach a third-party service referenced above, please contact us at [support@geospoof.com](mailto:support@geospoof.com) and we will take reasonable steps to assist.

## Security Incidents

Because the extension stores no personal data on any developer-operated server, there is no developer-side database that can be breached. In the unlikely event of a security issue affecting the extension itself (for example, a vulnerability in the extension code), we will publish an advisory on the project's GitHub page and release a patched version through the relevant browser stores. Where required by applicable law, we will notify affected users and the relevant data protection authority.

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
