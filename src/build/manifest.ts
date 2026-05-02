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
    name: "GeoSpoof",
    description: "Spoof your browser's geolocation and timezone. Prevent WebRTC IP leaks.",
    author: "Anthony Sgro",
    homepage_url: "https://github.com/anthonysgro/geospoof",
    incognito: "spanning",
    version,
    permissions: ["storage", "privacy", "scripting", "alarms"],
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
  // Firefox: scripts-based background, injected.js as world: "MAIN" content script
  return {
    ...shared,
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
    // no privacy permission (unsupported), no browser_specific_settings.
    // Safari may not honor <all_urls> wildcard for CORS exemption in background pages,
    // so we explicitly list the geo/IP service domains to ensure CORS is bypassed.
    const safariPermissions = (shared.permissions as string[]).filter((p) => p !== "privacy");
    const safariHostPermissions = [
      ...(shared.host_permissions as string[]),
      "https://api.ipify.org/*",
      "https://get.geojs.io/*",
      "https://free.freeipapi.com/*",
      "https://ipapi.co/*",
      "https://reallyfreegeoip.org/*",
      "https://nominatim.openstreetmap.org/*",
    ];
    return {
      ...shared,
      permissions: safariPermissions,
      host_permissions: safariHostPermissions,
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
