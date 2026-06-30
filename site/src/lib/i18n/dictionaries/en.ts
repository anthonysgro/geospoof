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
  spoofLocation: {
    hub: {
      metaTitle: "Spoof Your Browser Location — Free Extension | GeoSpoof",
      metaDescription:
        "Spoof your browser location in Chrome, Edge, Firefox, or Safari. GeoSpoof overrides the Geolocation API and timezone so sites see the location you choose.",
      ogTitle: "Spoof your browser location",
      badge: "Location Spoofing",
      headingPre: "Spoof your browser ",
      headingEmphasis: "location",
      intro:
        "Websites read your location through the browser's Geolocation API and your timezone — a VPN changes neither. GeoSpoof overrides both so sites see the location you pick. Pick your browser to get started.",
      cardTitle: "Spoof your location in {name}",
      openGuide: "Open guide",
    },
    page: {
      browserBadge: "{name} Extension",
      headingPre: "Spoof your location in ",
      ctaFallback: "Get GeoSpoof for {name}",
      testLocation: "Test your location",
      breadcrumbHome: "Home",
      breadcrumbHub: "Spoof Location",
      howToHeading: "How to spoof your location in {name}",
      stepInstallName: "Install GeoSpoof for {name}",
      stepInstallText: "Add the free GeoSpoof extension from {store}.",
      stepEnableName: "Enable it in {name}",
      stepSetName: "Set your location",
      stepSetText:
        "Search for a city, enter coordinates, or use VPN Sync to match your VPN's exit region.",
      stepReportsName: "{name} reports your chosen location",
      stepReportsText:
        "GeoSpoof overrides the Geolocation API and timezone (Date, Intl, Temporal) so every site sees the location you picked",
      stepReportsWebrtcSuffix:
        ", and WebRTC protection blocks your real IP from leaking",
      webrtcAvailableTitle: "WebRTC protection is available in {name}.",
      webrtcAvailableBody:
        "GeoSpoof also blocks your real IP from leaking through WebRTC, which can otherwise bypass a VPN entirely.",
      webrtcUnavailableTitle:
        "Note: WebRTC protection isn't available in {name}.",
      webrtcUnavailableBody:
        "Geolocation and timezone spoofing are fully supported; the WebRTC privacy API GeoSpoof relies on isn't exposed on this browser.",
      faqHeading: "Frequently asked questions",
      faqHowQ: "How do I spoof my location in {name}?",
      faqHowA:
        "Install the free GeoSpoof extension, set a location (search a city, enter coordinates, or sync to your VPN), and GeoSpoof overrides the Geolocation and timezone APIs in {name} so websites see your chosen location instead of your real one.",
      faqVpnQ: "Does a VPN change my location in {name}?",
      faqVpnA:
        "No. A VPN only changes your IP address. {name} still reports its own browser geolocation and system timezone, so those can still reveal your real region. GeoSpoof spoofs the browser signals; use it alongside a VPN for a consistent location.",
      faqFreeQ: "Is GeoSpoof free for {name}?",
      faqFreeA:
        "Yes. GeoSpoof is free and open source. There's no account, no login, and no tracking — every setting stays on your device.",
      crossLinkLead: "Using a different browser? See ",
      crossLinkText: "spoof your location in any browser",
      schemaSoftwareDesc:
        "Spoof your geolocation and timezone in {name} with a free, open-source extension.",
    },
    browsers: {
      chrome: {
        storeName: "the Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Chrome reports your whereabouts to websites through the Geolocation API and your timezone through Intl and Date — and a VPN changes none of that. GeoSpoof overrides those signals inside Chrome so sites see the location you pick. The same build also runs in Brave, Opera, and other Chromium browsers.",
        enableStep:
          "Pin GeoSpoof from the puzzle-piece (Extensions) icon in Chrome's toolbar so it's one click away.",
        extraFaqQ: "Does GeoSpoof work in Brave and other Chromium browsers?",
        extraFaqA:
          "Yes. GeoSpoof installs from the Chrome Web Store, which serves Chrome, Brave, Opera, and other Chromium-based browsers. The location and timezone spoofing works identically across all of them.",
        metaTitle: "Spoof Your Location in Chrome — Free Extension | GeoSpoof",
        metaDescription:
          "Spoof your location in Chrome with a free extension. GeoSpoof overrides the Geolocation API and timezone so sites see the location you choose. Brave too.",
        ogTitle: "Spoof your location in Chrome",
      },
      edge: {
        storeName: "the Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Microsoft Edge is built on Chromium, so it exposes your location the same way Chrome does — the Geolocation API plus your system timezone. GeoSpoof installs from the Chrome Web Store, runs in Edge, and overrides those APIs to report the location you choose. It works for spoofing your location in Edge on both Windows and macOS.",
        enableStep:
          "Allow the extension from the Chrome Web Store when Edge prompts you, then pin GeoSpoof from the Extensions (puzzle-piece) icon.",
        extraFaqQ: "Can I spoof my location in Edge on Windows?",
        extraFaqA:
          "Yes. GeoSpoof runs in Edge on Windows and macOS. It overrides the location and timezone your browser reports to websites; it does not change Windows' own system location settings, so your OS stays untouched.",
        metaTitle: "Spoof Your Location in Edge — Free Extension | GeoSpoof",
        metaDescription:
          "Spoof your location in Microsoft Edge with a free extension. GeoSpoof overrides the Geolocation API and timezone so sites see the location you choose.",
        ogTitle: "Spoof your location in Edge",
      },
      firefox: {
        storeName: "Firefox Add-ons",
        storeShort: "Firefox Add-ons",
        intro:
          "Firefox hands websites your location through the Geolocation API and your region through the timezone APIs, regardless of any VPN. GeoSpoof installs from Firefox Add-ons and overrides those signals. It's the one build that also runs on Firefox for Android, so you can spoof your location on mobile too.",
        enableStep:
          "After adding GeoSpoof from Firefox Add-ons, pin it to the toolbar from the extensions menu for quick access.",
        extraFaqQ: "Can I spoof my location in Firefox on Android?",
        extraFaqA:
          "Yes. Firefox 140+ on Android supports GeoSpoof, so you can spoof geolocation and timezone on your phone — something Chrome on mobile can't do, since it doesn't support extensions.",
        metaTitle: "Spoof Your Location in Firefox — Free Add-on | GeoSpoof",
        metaDescription:
          "Spoof your location in Firefox with a free, open-source add-on. GeoSpoof overrides the Geolocation API and timezone so sites see the location you choose.",
        ogTitle: "Spoof your location in Firefox",
      },
      safari: {
        storeName: "the App Store",
        storeShort: "App Store",
        intro:
          "Safari on iOS, iPadOS, and macOS reports your location and timezone to websites just like any browser. GeoSpoof installs from the App Store and runs as a Safari extension, overriding those APIs so sites see the location you choose. Geolocation and timezone spoofing are fully supported; WebRTC protection isn't available on Safari.",
        enableStep:
          "After installing from the App Store, enable GeoSpoof from Safari's extensions menu (the puzzle-piece in the address bar on iOS, or Safari → Settings → Extensions on macOS).",
        extraFaqQ: "Does location spoofing work in Safari on iPhone?",
        extraFaqA:
          "Yes. GeoSpoof is a Safari extension available through the App Store for iOS, iPadOS, and macOS. Once enabled for a site, it overrides the geolocation and timezone Safari reports. WebRTC protection is the one feature not available on Safari.",
        metaTitle: "Spoof Your Location in Safari — Free Extension | GeoSpoof",
        metaDescription:
          "Spoof your location in Safari with a free App Store extension. GeoSpoof overrides the Geolocation API and timezone on iOS, iPadOS, and macOS.",
        ogTitle: "Spoof your location in Safari",
      },
    },
  },
  vpn: {
    meta: {
      title:
        "Do You Need a VPN With GeoSpoof? Two Layers of Privacy | GeoSpoof",
      description:
        "GeoSpoof hides the location, timezone, and WebRTC your browser reports. A no-log VPN hides your IP — the one signal an extension can't change.",
      ogTitle: "Do you need a VPN with GeoSpoof?",
    },
    hero: {
      mapAlt: "Proton VPN hides your IP address",
      badge: "Location privacy has two layers",
      headingPre: "Do you need a VPN with ",
      headingPost: "?",
      answer:
        "GeoSpoof hides your browser's location. A VPN hides your IP. For full privacy, you want both.",
      disclosureLabel: "Privacy Disclosure:",
      disclosureBody:
        "We partner with Proton VPN. If you subscribe through our link, we earn a commission at no extra cost to you.",
      ctaPlans: "See Proton VPN plans",
      discountSticker: "Up to {discount} off",
      learnMore: "Learn more",
      moneyBack: "30-day money-back guarantee",
      platformsAria:
        "Proton VPN is available on Windows, macOS, Linux, iOS, and Android",
    },
    twoLayers: {
      heading: "Two layers, two tools",
      intro:
        "Location privacy has two independent layers. GeoSpoof seals the browser layer; a VPN seals the network layer. Spoof one but leave the other and the mismatch gives you away. A browser reporting Tokyo while your IP still resolves to New York is easy to flag.",
      browserTitle: "The browser layer",
      browserBody:
        "Websites read your location from the Geolocation API, your region from the timezone APIs, and your local IPs from WebRTC. GeoSpoof overrides all of these so they report the location you choose.",
      browserWho: "Handled by GeoSpoof",
      networkTitle: "The network layer",
      networkBody:
        "Every site also sees the public IP address your connection comes from, which maps to a real city. No browser extension can change this — it lives below the browser, on the network.",
      networkWho: "Handled by a VPN",
      primerLead:
        "Want a deeper, vendor-neutral take? Jonah Aragon of Privacy Guides has a clear primer on ",
      primerLink: "what a VPN actually does and doesn't do",
    },
    whyProton: {
      eyebrow: "The VPN we trust",
      heading: "Why Proton VPN",
      intro:
        "GeoSpoof is open-source and keeps zero logs. In privacy, the only trust worth having is the kind you can verify. Proton holds itself to the same bar: open-source apps, an independently audited no-logs policy, and Swiss jurisdiction.",
      reason1Title: "No-logs, independently audited",
      reason1Body:
        "Proton's no-logs policy has been independently audited repeatedly, not just claimed, and tested in real-world legal requests.",
      reason2Title: "Swiss, open-source",
      reason2Body:
        "Based in Switzerland under strong privacy law, with fully open-source apps anyone can inspect — the same verifiable approach as GeoSpoof.",
      reason3Title: "Works with VPN Sync",
      reason3Body:
        "GeoSpoof's VPN Sync keeps your spoofed location matched to your VPN's exit region automatically — with Proton, or any other VPN you choose.",
      calloutLead: "Don't take our word for it.",
      calloutBodyPre: " Proton is one of the few VPNs recommended by ",
      calloutLink: "Privacy Guides",
      calloutBodyPost:
        ", an independent, community-run privacy resource. GeoSpoof works with any VPN, so you're never locked in; we point to Proton for the open-source, audited reasons above, but the right call is whichever one you trust.",
    },
    plan: {
      imgAlt: "Proton VPN app home screen",
      heading: "Pick the plan that fits",
      body: "GeoSpoof is open-source. For the IP layer, we'd point you to Proton's VPN Plus. The 2-year plan is {discount} off Proton's standard rate — the lowest price per month and the best overall value. Prefer to try it first? The monthly plan works too.",
      cta: "See Proton VPN plans",
      discountLine: "{discount} off the 2-year plan",
    },
    inlineDisclosure:
      "Heads up — this is an affiliate link. Subscribe through it and Proton shares a small cut with us, at no extra cost to you. It's how we help keep GeoSpoof open-source and independent.",
    faq: {
      heading: "Frequently asked questions",
      items: [
        {
          q: "Do I need a VPN if I use GeoSpoof?",
          a: "For full location privacy, yes — but not because GeoSpoof falls short. GeoSpoof changes the location, timezone, and WebRTC details your browser reports to websites. The strongest remaining signal is your IP address, and only a VPN can change that. The two cover different layers; together they tell one consistent story.",
        },
        {
          q: "Can I use a different VPN with GeoSpoof?",
          a: "Yes. GeoSpoof works with any VPN. Nothing is locked to Proton, and VPN Sync works the same with all of them. Mullvad and IVPN are other well-regarded no-log providers in the privacy community. We point to Proton because it's fully open-source, independently audited, and recommended by Privacy Guides, but the choice is entirely yours.",
        },
        {
          q: "Why does GeoSpoof recommend Proton VPN?",
          a: "Proton is no-logs, based in Switzerland, fully open-source, and has passed repeated independent audits. Those are the same verifiable, privacy-first values GeoSpoof is built on. It's also one of the few VPNs recommended by Privacy Guides, an independent resource that takes no affiliate money. VPN Sync works with Proton exactly as it does with any other VPN.",
        },
        {
          q: "Do I need a VPN to use GeoSpoof?",
          a: "No. GeoSpoof's core spoofing works without a VPN. A VPN only hides your real IP address — it's a complementary tool, not a requirement to use GeoSpoof.",
        },
        {
          q: "Does GeoSpoof make money if I sign up?",
          a: "If you subscribe to Proton through our link, Proton shares a portion of the sale with us, at no extra cost to you. It helps keep GeoSpoof open-source and ad-free. We recommend Proton on its merits (open-source, independently audited, and recommended by Privacy Guides), and the commission doesn't change which plan is actually best for you.",
        },
      ],
    },
    disclosure: {
      label: "Affiliate disclosure:",
      body: "GeoSpoof is an independent, open-source utility and is not affiliated with or endorsed by Proton. When you buy a plan through our recommendation, Proton shares a portion of the sale with us, at no extra cost to you. It helps keep GeoSpoof free, open-source, and ad-free. We recommend Proton on its merits (open-source, independently audited, and recommended by Privacy Guides), not because of the commission, and GeoSpoof works with any VPN you prefer.",
    },
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
