/**
 * Manifest generator for Firefox and Chromium browser targets.
 *
 * Extracted from vite.config.ts so it can be imported in tests without
 * pulling in the Vite/esbuild dependency chain.
 */

/** Valid browser targets for the build system. */
export type BrowserTarget = "firefox" | "chromium" | "safari";

/**
 * Validate and return the browser target from the BROWSER env var.
 * Defaults to "firefox" when unset. Throws for invalid values.
 */
export function resolveBrowserTarget(envBrowser: string | undefined): BrowserTarget {
  if (!envBrowser) return "firefox";
  if (envBrowser === "firefox" || envBrowser === "chromium" || envBrowser === "safari")
    return envBrowser;
  throw new Error(
    `Invalid BROWSER environment variable: "${envBrowser}". ` +
      `Valid values are "firefox", "chromium", or "safari".`
  );
}

/**
 * Generate a browser-specific manifest.json from the shared base configuration.
 *
 * Shared fields (permissions, host_permissions, content_scripts, action, icons,
 * manifest_version, name, description, author, homepage_url, incognito) are
 * preserved for both targets. Browser-specific sections diverge:
 *
 * - Firefox: background.scripts, browser_specific_settings, web_accessible_resources
 * - Chromium: background.service_worker, type "module", injected.js with world "MAIN",
 *   no browser_specific_settings
 */
export function generateManifest(target: BrowserTarget, version: string): Record<string, unknown> {
  const shared: Record<string, unknown> = {
    manifest_version: 3,
    // Use __MSG_*__ references so the Chrome Web Store, AMO, and the
    // App Store can localize the extension name and description to
    // match each user's browser/OS locale. `default_locale` is the
    // fallback when a user's locale has no messages.json file.
    name: "__MSG_extensionName__",
    description: "__MSG_extensionDescription__",
    default_locale: "en",
    author: "Anthony Sgro",
    homepage_url: "https://github.com/anthonysgro/geospoof",
    incognito: "spanning",
    version,
    // `proxy` powers the VPN-sync auto-resync watcher: GeoSpoof observes
    // `proxy.settings.onChange` to detect when a browser-based VPN (e.g. the
    // Proton VPN extension) switches exit nodes, and re-syncs the spoofed
    // location to match the new exit IP. It is observe-only — GeoSpoof never
    // *sets* the proxy. On Chromium the permission's user-facing warning
    // ("Read and change all your data on all websites") is already triggered
    // by the existing `<all_urls>` host permission, so it adds no new install
    // prompt there. Safari has no proxy WebExtensions API, so it is filtered
    // out of the Safari build below (the watcher feature-detects and no-ops).
    permissions: ["storage", "privacy", "proxy", "scripting", "alarms", "idle"],
    host_permissions: ["<all_urls>"],
    content_scripts: [
      {
        matches: ["<all_urls>"],
        js: ["content/content.js"],
        run_at: "document_start",
        all_frames: true,
      },
    ],
    action: {
      default_popup: "popup/popup.html",
      default_icon: {
        "16": "icons/icon-16.png",
        "32": "icons/icon-32.png",
        "48": "icons/icon-48.png",
      },
    },
    icons: {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png",
      "1024": "icons/icon-1024.png",
    },
  };

  if (target === "firefox") {
  // Firefox: scripts-based background, injected.js as world: "MAIN" content script.
  //
  // Permission notes — all four of these are listed under required
  // `permissions`. The scary install string users see is
  // "Block content on any page" from `webRequestBlocking`. This is
  // intentional: GeoSpoof's Firefox build uses `webRequest.
  // filterResponseData` to inject its timezone-spoofing payload into
  // Worker / SharedWorker / ServiceWorker script responses at the
  // network layer. Without these permissions we cannot close the
  // worker timezone leaks that are now widely known (CreepJS and
  // similar tools flag them). The feature is baked in and always on
  // — there is no opt-in toggle because the alternative (content-
  // script blob-URL wrapping) fails on strict-CSP origins and can
  // break site functionality, whereas filterResponseData degrades
  // gracefully (onerror fallback keeps the site working, just
  // unprotected) on the rare origin that ships SRI on workers.
  //
  //   - `webRequest` — baseline API access
  //   - `webRequestBlocking` — required to attach filters to responses.
  //     This is the permission whose user-facing string is "Block
  //     content on any page."
  //   - `webRequestFilterResponse` — MV3-specific gate added in Firefox
  //     110. MV2 extensions got this implicitly from
  //     `webRequestBlocking`; MV3 needs it listed separately.
  //   - `webRequestFilterResponse.serviceWorkerScript` — required to
  //     intercept `navigator.serviceWorker.register()` script fetches.
  //     Without this the filter fires for dedicated / shared / module
  //     workers but not service workers. Added in Firefox 95.
  //
  // These are Firefox-only; Chromium MV3 removed response-body
  // modification entirely (declarativeNetRequest can't modify bodies)
  // and Safari never implemented the API.
  return {
    ...shared,
    permissions: [
      ...(shared.permissions as string[]),
      "webRequest",
      "webRequestBlocking",
      "webRequestFilterResponse",
      "webRequestFilterResponse.serviceWorkerScript",
    ],
    // userScripts lets us register a document_start MAIN-world script with the
    // saved timezone inlined, so synchronous Date/Intl reads in a page's first
    // <script> are already spoofed (closes the cold-start race). In Firefox it
    // is an *optional-only* permission: it CANNOT be listed under required
    // `permissions` (Firefox drops it there, leaving `browser.userScripts`
    // undefined) and is never granted silently — it must be requested at
    // runtime from a user gesture via `permissions.request({permissions:
    // ["userScripts"]})`. The popup's "Instant timezone protection" toggle
    // (Advanced section) drives that request; until the user opts in, the
    // bootstrap registration no-ops and the pre-existing async path applies the
    // spoof a few ms later. Optional-only permissions must be requested alone,
    // so this array contains nothing else.
    optional_permissions: ["userScripts"],
    browser_specific_settings: {
      gecko: {
        id: "{a8f7e9c2-4d3b-4a1e-9f8c-7b6d5e4a3c2b}",
        strict_min_version: "140.0",
        update_url: "https://anthonysgro.github.io/geospoof/update.json",
        data_collection_permissions: {
          required: ["none"],
        },
      },
      gecko_android: {
        strict_min_version: "140.0",
      },
    },
    background: {
      scripts: ["background/background.js"],
      type: "module",
    },
    content_scripts: [
      ...(shared.content_scripts as Array<Record<string, unknown>>),
      {
        matches: ["<all_urls>"],
        js: ["content/injected.js"],
        run_at: "document_start",
        all_frames: true,
        world: "MAIN",
      },
    ],
    web_accessible_resources: [
      {
        resources: ["content/injected.js"],
        matches: ["<all_urls>"],
      },
    ],
  };
  }

  if (target === "safari") {
    // Safari: scripts-based background (avoids service worker suspension bug),
    // no privacy permission (unsupported), no proxy permission (no proxy API),
    // no idle permission (the activity watcher's idle trigger feature-detects to
    // a no-op; tab-navigation triggers still work), no browser_specific_settings.
    // Safari may not honor <all_urls> wildcard for CORS exemption in background pages,
    // so we explicitly list the geo/IP service domains to ensure CORS is bypassed.
    const safariPermissions = (shared.permissions as string[]).filter(
      (p) => p !== "privacy" && p !== "proxy" && p !== "idle"
    );
    // nativeMessaging enables browser.runtime.sendNativeMessage →
    // SafariWebExtensionHandler, used to push the current region to the
    // containing app via the shared App Group UserDefaults suite.
    if (!safariPermissions.includes("nativeMessaging")) {
      safariPermissions.push("nativeMessaging");
    }
    const safariHostPermissions = [
      ...(shared.host_permissions as string[]),
      // Public-IP (exit-IP) detection — hyperscale echo endpoints, tried in
      // order with failover (see IP_ECHO_PROVIDERS in vpn-sync.ts).
      "https://checkip.amazonaws.com/*",
      "https://www.cloudflare.com/*",
      "https://whatismyip.akamai.com/*",
      "https://api.ipify.org/*",
      // IP geolocation providers.
      "https://get.geojs.io/*",
      "https://free.freeipapi.com/*",
      "https://reallyfreegeoip.org/*",
      "https://ipinfo.io/*",
      "https://nominatim.openstreetmap.org/*",
    ];
    return {
      ...shared,
      permissions: safariPermissions,
      host_permissions: safariHostPermissions,
      background: {
        scripts: ["background/background.js"],
        type: "module",
        persistent: false,
      },
      content_scripts: [
        ...(shared.content_scripts as Array<Record<string, unknown>>),
        {
          matches: ["<all_urls>"],
          js: ["content/injected.js"],
          run_at: "document_start",
          all_frames: true,
          world: "MAIN",
        },
      ],
    };
  }

  // Chromium: service_worker background, injected.js as world: "MAIN" content script
  return {
    ...shared,
    background: {
      service_worker: "background/background.js",
      type: "module",
    },
    content_scripts: [
      ...(shared.content_scripts as Array<Record<string, unknown>>),
      {
        matches: ["<all_urls>"],
        js: ["content/injected.js"],
        run_at: "document_start",
        all_frames: true,
        world: "MAIN",
      },
    ],
  };
}
