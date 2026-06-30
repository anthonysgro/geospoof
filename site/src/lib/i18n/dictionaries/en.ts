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
