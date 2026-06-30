/**
 * English dictionary — the CANONICAL source of truth.
 *
 * The shape of this object defines the `Dictionary` type that every other
 * locale must satisfy, so adding a key here without translating it elsewhere
 * is a TypeScript error. Keep keys grouped by surface (nav, hero, footer, …).
 */
export const en = {
  nav: {
    home: "Home",
    features: "Features",
    blog: "Blog",
    support: "Support",
    download: "Download",
    buyMeACoffee: "Buy me a coffee",
    github: "GeoSpoof on GitHub",
    openMenu: "Open navigation menu",
    brandAria: "GeoSpoof - Home",
    mainNavAria: "Main navigation",
  },
  hero: {
    badge: "VPN Companion · Extension",
    // The headline renders as: "{pre}{emphasis}{post}" with `emphasis`
    // highlighted in the brand colour and kept on one line.
    headlinePre: "Finish what ",
    headlineEmphasis: "your VPN",
    headlinePost: " started",
    subhead:
      "A VPN changes your IP, but your browser still leaks your real location. GeoSpoof matches it to your VPN automatically — and keeps it matched as you switch servers.",
    downloadFree: "Download Free",
    seeWhatSitesDetect: "See what sites detect",
    allPlatforms: "All platforms & browsers",
    usersSuffix: "users",
    firefoxRating: "Firefox",
    mainPhoneAlt: "GeoSpoof app — main view",
    secondaryPhoneAlt: "GeoSpoof app — secondary view",
  },
  footer: {
    groups: {
      guides: "Guides",
      learn: "Learn",
      company: "Company",
    },
    links: {
      spoofAllBrowsers: "Spoof location: all browsers",
      spoofChrome: "Spoof location in Chrome",
      spoofFirefox: "Spoof location in Firefox",
      spoofEdge: "Spoof location in Edge",
      spoofSafari: "Spoof location in Safari",
      spoofTimezone: "Spoof timezone",
      needVpn: "Do you need a VPN?",
      testProtection: "Test your protection",
      engineLevel: "Engine-level Spoofing (Chrome)",
      blog: "Blog",
      support: "Support",
      about: "About",
      privacy: "Privacy Policy",
      terms: "Terms of Service",
      github: "GitHub",
    },
    footerNavAria: "Footer navigation",
    // `{year}` is replaced at render time.
    copyright: "© {year} GeoSpoof. All rights reserved.",
  },
  languageSwitcher: {
    label: "Language",
    // Shown when we detect the visitor may prefer this language. Phrased IN
    // this locale, since the hint speaks the language being offered.
    suggestion: "This page is available in English.",
    switchAction: "View in English",
    dismiss: "Dismiss",
  },
  testimonials: {
    eyebrow: "What users are saying",
    heading: "Loved by privacy-minded users",
    subhead:
      "Real reviews from the Chrome Web Store, Firefox Add-ons, and App Store.",
    starsAria: "5 out of 5 stars",
    readMoreOn: "Read more reviews on",
  },
  screenshots: {
    eyebrow: "See it in action",
    heading: "Works everywhere you browse",
    desktopAlt:
      "GeoSpoof browser extension running on desktop — showing location spoofing in action",
  },
  demo: {
    eyebrow: "Watch it work",
    heading: "Spoof your location in a few clicks",
    videoAria:
      "GeoSpoof demo — setting a spoofed browser location with the extension",
    unsupported: "Your browser doesn't support embedded video.",
    downloadInstead: "Download the demo",
    insteadSuffix: "instead.",
  },
  features: {
    eyebrow: "Features",
    heading: "Every signal, covered",
    subhead:
      "Websites use multiple browser APIs to detect your location. GeoSpoof overrides all of them — consistently, before any page script runs.",
    visual: {
      noIpLeak: "No IP leak",
      noTracking: "No tracking",
      noTelemetry: "No telemetry",
      vpnExit: "VPN exit",
      spoofed: "Spoofed",
      synced: "synced",
      andMore: "& more",
    },
    items: {
      geolocation: {
        title: "Location spoofing",
        description:
          "Override navigator.geolocation so websites see your chosen coordinates. Search by city, enter coordinates manually, or sync with your VPN.",
      },
      timezone: {
        title: "Timezone spoofing",
        description:
          "Spoof Date, Intl.DateTimeFormat, and the Temporal API so your timezone matches your chosen location.",
      },
      webrtc: {
        title: "WebRTC protection",
        description:
          "Prevent IP leaks through WebRTC on Firefox and Chromium using the browser privacy API.",
      },
      vpnSync: {
        title: "VPN sync",
        description:
          "Detect your VPN exit region automatically and set your spoofed location to match — one click.",
      },
      apis: {
        title: "Full API coverage",
        description:
          "Every browser API that leaks your location is covered — injected at document_start before any page script runs.",
      },
    },
  },
  comparison: {
    eyebrow: "How GeoSpoof compares",
    heading: "More than a coordinate swap",
    subhead:
      "Most location spoofers do one thing: drop a fake latitude and longitude into the browser. GeoSpoof covers the whole signal, so your location, timezone, and IP all tell the same story.",
    featureHeader: "Feature",
    typicalHeader: "Typical",
    yesAria: "Yes",
    limited: "Limited",
    noAria: "No",
    features: {
      coordinates: "Spoof geolocation by coordinates",
      oneIdentity: "One consistent identity across dozens of browser APIs",
      citySearch: "Set your location by city search",
      webrtc: "WebRTC IP leak protection",
      everyBrowser: "Every major browser + full Apple ecosystem",
      verification: "Built-in verification page",
      vpnSync: "VPN Sync with automatic re-sync",
      perSite: "Per-site rules & saved favorites",
    },
    legend: {
      fullSupport: "Full support",
      limitedDetail: ": partial or basic",
      notSupported: "Not supported",
    },
    proAria: "Pro on iPhone and iPad",
    proNote: "Pro on iPhone & iPad. Free on desktop browsers and Safari.",
    ctaLead: "Don't take our word for it: ",
    ctaLink: "test your protection",
    ctaTail: " and see every signal for yourself.",
  },
  compatibility: {
    eyebrow: "Compatibility",
    heading: "Works across all your devices",
    subhead:
      "GeoSpoof runs on every major browser and platform. One extension, consistent protection everywhere.",
    platformHeader: "Platform",
    supportedAria: "Supported",
    naAria: "Not applicable",
    notSupportedAria: "Not supported",
    legend: {
      supported: "Supported",
      notSupported: "Not supported",
      na: "N/A — Not applicable",
    },
    footnote:
      "Firefox for Android requires Firefox 140+. Safari requires iOS 16+ or macOS 13+.",
    setupLead: "Browser-specific setup guides: spoof your location in ",
    or: ", or ",
    alsoLead: ". You can also ",
    timezoneLink: "spoof your browser timezone",
  },
  featuredPost: {
    eyebrow: "From the blog",
    heading: "Worth a read",
    allPosts: "All posts",
    minRead: "min read",
    readMore: "Read more",
  },
  download: {
    eyebrow: "Download",
    heading: "Get GeoSpoof free",
    subhead:
      "Available on all major browsers. No account required, no telemetry, no tracking.",
    recommendedBadge: "Recommended for you",
    installFree: "Install free",
    otherWays: "Other ways to download",
    stores: {
      firefox: {
        description: "Firefox 140+ on desktop and Android",
        cta: "Add to Firefox",
      },
      chromium: {
        description: "Chrome, Brave, and Edge",
        cta: "Add to Chrome",
      },
      apple: {
        description: "Safari on iOS and macOS",
        cta: "Get on the App Store",
      },
    },
    selfHosted: {
      dmg: {
        name: "Direct download (macOS)",
        description:
          "Notarized DMG for Safari on macOS. No Apple ID required. Manual updates — re-download to upgrade.",
      },
      xpi: {
        name: "Self-hosted XPI (Firefox)",
        description:
          "Signed XPI for Firefox forks or manual installs. Auto-updates via our update manifest.",
      },
      cta: "GitHub Releases",
    },
  },
  skipLink: {
    toMainContent: "Skip to main content",
  },
  phoneCarousel: {
    embeddedHeading: "And native on iPhone & iPad",
    standaloneHeading: "GeoSpoof on iOS & iPadOS",
    // `{n}` is replaced with the slide number.
    screenshotAlt: "GeoSpoof on iOS — screenshot {n}",
    goToSlide: "Go to slide {n}",
    getTheApp: "Get the app",
    appStore: "Download on the App Store",
    macAppStore: "Download on the Mac App Store",
  },
  exposureToast: {
    header: "What every site sees",
    exposed: "Exposed",
    visibleToSites: "Visible to sites",
    location: "Location",
    timezone: "Timezone",
    address: "Address",
    webrtc: "WebRTC",
    publicIpLeaking: "Public IP leaking",
    noLeak: "No leak",
    yourArea: "your area",
    hideMyLocation: "Hide my location",
    getGeospoof: "Get GeoSpoof",
    fullReport: "Full report",
    dismiss: "Dismiss",
  },
  themeToggle: {
    switchToLight: "Switch to light mode",
    switchToDark: "Switch to dark mode",
    changedToLight: "Theme changed to light mode",
    changedToDark: "Theme changed to dark mode",
  },
  carousel: {
    previousSlide: "Previous slide",
    nextSlide: "Next slide",
  },
} as const

/**
 * Widen string *literal* types (from `as const`) back to plain `string`, while
 * preserving the exact object structure. This lets the English dictionary
 * define the required shape (every key, correctly nested) without forcing
 * other locales to use the literal English text — `fr.nav.home` can be
 * "Accueil" yet still be type-checked against the canonical structure.
 */
type Widen<T> = T extends string ? string : { [K in keyof T]: Widen<T[K]> }

/** The canonical dictionary shape every locale must implement. */
export type Dictionary = Widen<typeof en>
