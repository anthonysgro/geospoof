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
    usersTrust: "Trusted by {count} users",
    usersShort: "{count} users",
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
      gps: "GeoSpoof GPS for Mac",
      needVpn: "Do you need a VPN?",
      testProtection: "Test your protection",
      engineLevel: "Engine-level Spoofing (Chrome)",
      blog: "Blog",
      support: "Support",
      about: "About",
      feedback: "Feedback",
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
  storeCta: {
    firefox: "Add to Firefox",
    chrome: "Add to Chrome",
    apple: "Get on the App Store",
  },
  legal: {
    // Only the page chrome (meta, H1, "last updated") is localized. The legal
    // body text itself is intentionally left in English (the authoritative
    // version) and is not translated.
    englishNote:
      "The legal text below is available in English only. The English version is authoritative.",
    privacy: {
      metaTitle: "Privacy Policy | GeoSpoof",
      metaDescription:
        "Privacy Policy for GeoSpoof — learn how we protect your data and respect your privacy.",
      heading: "Privacy Policy",
      lastUpdated: "Last Updated: July 3, 2026",
    },
    terms: {
      metaTitle: "Terms of Service | GeoSpoof",
      metaDescription:
        "Terms of Service for GeoSpoof — understand the terms governing your use of the extension.",
      heading: "Terms of Service",
      lastUpdated: "Last Updated: July 3, 2026",
    },
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
  blog: {
    index: {
      metaTitle: "Blog | GeoSpoof",
      metaDescription:
        "Guides and deep dives on browser location spoofing, timezone privacy, WebRTC leaks, and getting the most out of GeoSpoof.",
      heading: "GeoSpoof Blog",
      subhead:
        "Guides and deep dives on location spoofing, timezone privacy, and browser fingerprinting.",
      empty: "No posts yet — check back soon.",
      minRead: "min read",
    },
    post: {
      breadcrumbHome: "Home",
      breadcrumbBlog: "Blog",
      minRead: "min read",
      faqHeading: "Frequently asked questions",
      olderPost: "← Older post",
      newerPost: "Newer post →",
      backToAll: "← Back to all posts",
      // Shown above translated pages whose article body is still English-only.
      englishNote: "This article is available in English only.",
    },
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
      headingPre: "Spoof your location in {name}",
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
      disclosureBody:
        "We partner with Proton VPN. If you subscribe through our link, we earn a commission at no extra cost to you.",
      ctaPlans: "See Proton VPN plans",
      partnerPricing: "Up to {discount} partner discount",
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
      // Secondary, contextual upsell for visitors who already run a VPN. Rendered
      // as pre + link + post fragments (same pattern as the primer/callout
      // links elsewhere on the page). Unlimited bundles the VPN with the rest of
      // Proton's suite, so it's the one cross-sell that fits a VPN-intent page.
      unlimitedPre: "Already have a VPN, or want more than one tool? Proton's ",
      unlimitedLink: "Unlimited plan",
      unlimitedPost: " bundles VPN with Mail, Pass, Drive, and Calendar.",
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
  support: {
    meta: {
      title: "GeoSpoof Support — Fix Spoofing, VPN Sync & Setup Issues",
      description:
        "Get help with GeoSpoof: fix location spoofing that isn't working, resolve VPN Sync timeouts, WebRTC issues, and browser or mobile setup — or contact our team.",
    },
    heading: "How can we help?",
    subhead:
      "Most reports trace back to one of the causes below. Work down the list and stop when spoofing works.",
    symptomsLead: "What's happening?",
    symptoms: [
      {
        label: "Location spoofing isn't working",
        target: "troubleshooting",
      },
      { label: "VPN Sync fails or times out", target: "faq-vpn-sync" },
      { label: "It works on desktop but not my phone", target: "faq-mobile" },
      { label: "Something else", target: "questions" },
    ],
    lastUpdatedLabel: "Last updated",
    troubleshooting: {
      title: "Spoofing isn't working on a site",
      intro:
        "These are ordered from most to least common. You likely won't need to reach the end.",
      browserNote:
        "GeoSpoof also runs on Chrome, Edge, Brave, and Safari. The steps below are written for Firefox, where these conflicts are most common — on other browsers, apply the equivalent settings.",
      latestReleaseLabel: "Latest release",
      latestReleaseCta: "View the latest release on GitHub",
      badgeActiveLabel: "Active on this tab",
      badgeActiveAlt:
        "GeoSpoof toolbar icon with a badge showing it is active on the current tab",
      badgeDisabledLabel: "Not running on this tab",
      badgeDisabledAlt:
        "GeoSpoof toolbar icon with a badge showing it is not running on the current tab",
      geolocationDeniedAlt:
        'A fingerprint test result reporting "Geolocation: Denied" because Firefox blocked the location request',
      geolocationDeniedCaption:
        "What a blocked location request looks like on a fingerprint test.",
      preserveOffAlt:
        'The GeoSpoof popup with the "Preserve location prompts" toggle turned off',
      preserveOffCaption:
        'GeoSpoof popup with "Preserve location prompts" turned off.',
      tzpCta: "Open the TZP test",
      featuredLabel: "Best diagnostic",
      steps: [
        {
          title: "Refresh the tab, or reopen it",
          featured: false,
          body: "GeoSpoof only takes effect on pages loaded after it's enabled. Any tab that was already open when you installed, updated, or re-enabled GeoSpoof won't be spoofed until it reloads. Refresh the tab you're testing — if that doesn't help, close it and open it again.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Update to the latest version",
          featured: false,
          body: "Many issues are already fixed in a newer release. In the popup, open Details → Advanced to see your version, then compare it to the latest release below and update through your browser's extension manager if you're behind.",
          details: [],
          note: "",
          action: "latestRelease",
        },
        {
          title: "Confirm GeoSpoof is running on the site",
          featured: false,
          body: "GeoSpoof's toolbar icon shows whether it's active on the current tab. If it isn't active, nothing gets spoofed — most often because of the site scope set in the Filters tab.",
          details: [
            "Allowlist mode: only listed sites are spoofed — add the site you're testing.",
            "Denylist mode: make sure the site isn't on the list.",
            'Or switch to "All" to spoof everywhere.',
          ],
          note: "",
          action: "badgeCheck",
        },
        {
          title: "Reset the site's location permission",
          featured: false,
          body: 'If a test reports "Geolocation: Denied", Firefox is blocking the request — usually because the prompt was once denied with "Remember this decision" checked.',
          details: [
            "Click the lock icon in the address bar.",
            "Clear any remembered Block for location, then reload the page.",
            'In Firefox settings, confirm "Block new requests asking to access your location" is off.',
            'If GeoSpoof\'s "Preserve location prompts" toggle is on and you denied the prompt, either allow it or turn the toggle off so GeoSpoof answers directly.',
          ],
          note: "",
          action: "geolocationDenied",
        },
        {
          title: "Restart your browser",
          featured: false,
          body: "Some browser APIs are set up at startup, so a recent install, update, or settings change may not take effect until you fully close and reopen your browser.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Test in a fresh Firefox profile",
          featured: true,
          body: "A clean profile isolates GeoSpoof from your existing setup.",
          details: [
            "Open about:profiles and create a new profile.",
            "Launch it, install GeoSpoof, and test the same site again.",
          ],
          note: "If spoofing works in the clean profile, GeoSpoof itself is fine — something in your normal profile is interfering, almost always a privacy tool or an about:config change. The next two steps cover those.",
          action: "",
        },
        {
          title: "Disable conflicting privacy tools",
          featured: false,
          body: "Hardening tools change many of the same browser APIs as GeoSpoof and can override it. Temporarily disable any you use, then retry: Arkenfox, Betterfox, LibreWolf, CanvasBlocker, JShelter, Chameleon, Trace, or any fingerprint randomizer.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Check about:config (advanced)",
          featured: false,
          body: "If you've hardened Firefox, confirm these preferences are disabled, then restart and retry. Strict Enhanced Tracking Protection is usually fine and doesn't need changing.",
          details: [
            "privacy.resistFingerprinting",
            "privacy.fingerprintingProtection",
            "privacy.fingerprintingProtection.pbmode",
          ],
          note: "",
          action: "",
        },
        {
          title: "Confirm on a second fingerprint test",
          featured: false,
          body: "Tests measure different APIs and some are simply buggy. Before assuming GeoSpoof is at fault, verify the result on another reputable test — we recommend the Region section of arkenfox's TZP.",
          details: [],
          note: "",
          action: "tzpTest",
        },
      ],
    },
    commonIssues: "Other common questions",
    faqs: [
      {
        id: "vpn-sync",
        q: "VPN Sync shows a timeout or network error",
        a: "VPN Sync calls a few public IP geolocation services to detect your VPN exit region. Some VPNs or firewalls block outbound requests to these services. Try temporarily disabling your VPN's firewall or kill switch. If the issue persists, use the Search City or Enter Coordinates tabs to set your location manually instead.",
      },
      {
        id: "specific-site",
        q: "A specific website isn't being spoofed",
        a: "Some sites use server-side location detection based on your IP address rather than the browser Geolocation API. GeoSpoof overrides browser APIs only — it does not change your IP address. For full location consistency, use GeoSpoof alongside a VPN pointed at the same region.",
      },
      {
        id: "mobile",
        q: "The extension works on desktop but not on my phone",
        a: "On Firefox for Android, the extension is fully supported on Firefox 140 and later. On iOS and macOS Safari, the extension is available through the App Store — tap the puzzle piece icon in the address bar and enable GeoSpoof for the site you want to protect. Chrome for iOS and Android does not support extensions.",
      },
      {
        id: "webrtc",
        q: "WebRTC Protection isn't available / greyed out",
        a: "WebRTC Protection uses a browser privacy API that is not available on all platforms. It is supported on Firefox and Chromium-based browsers on desktop. It is not available on Safari or Firefox for Android.",
      },
      {
        id: "extensions-page",
        q: 'I see "Extensions cannot run on this page"',
        a: "Browsers restrict extensions from running on built-in pages such as about:blank, chrome://, about:newtab, and extension store pages. This is a browser security boundary that cannot be bypassed. GeoSpoof works on all normal websites.",
      },
    ],
    copy: "Copy",
    copied: "✓ Copied",
    copyAria: "Copy email address",
    stillNeedHelp: "Still need help?",
    contactBody:
      "Send us an email and we'll get back to you within a day or two.",
    contactChecklistLead: "Include these so we can help faster:",
    contactChecklist: [
      "Firefox version",
      "Operating system",
      "GeoSpoof version",
      "VPN provider (if applicable)",
      "The fingerprint test site you're using",
      "A screenshot of the result",
      "Whether spoofing works in a fresh Firefox profile",
    ],
    reportBugsLead: "You can also report bugs on ",
  },
  about: {
    meta: {
      title: "About GeoSpoof — Who Builds It | GeoSpoof",
      description:
        "GeoSpoof is an open-source location and timezone spoofer built by Anthony Sgro — no accounts, no tracking, and honest about what it does.",
      ogTitle: "About GeoSpoof",
    },
    greeting: "👋 Hi, I'm Anthony",
    tagline: "I build GeoSpoof.",
    githubAria: "Anthony Sgro on GitHub",
    linkedinAria: "Anthony Sgro on LinkedIn",
    p1a: "I'm a software developer, and GeoSpoof started as ",
    p1strong: "something I wanted for myself",
    p1b: ": an easy way to control the location and timezone my browser was handing out, without signing up for anything or giving my data to yet another company. It grew into a tool a lot of people now use every day, which still kind of amazes me.",
    p2a: "It's open-source, with ",
    p2strong: "no accounts and nothing to sign up for",
    p2b: ". Your settings just live in your browser. And if you're ever curious what it's actually doing, the code is public and the ",
    verifyLink: "verify page",
    p2c: " shows you exactly what websites can read about you.",
    p3a: "There's an optional Pro tier for the ",
    p3strong: "extra power features",
    p3b: ", while the everyday spoofing stays free.",
    p4a: "Got a question, an idea, or just want to ",
    p4em: "say hi",
    p4b: "? The ",
    supportLink: "support page",
    p4c: " reaches me directly, or find me on GitHub and LinkedIn up top. Thanks for stopping by.",
  },
  spoofTimezone: {
    meta: {
      title: "Spoof Your Browser Timezone — Free Extension | GeoSpoof",
      description:
        "Change or spoof your browser's timezone to match any location. GeoSpoof overrides Date, Intl, and Temporal so your clock can't reveal your real region.",
      ogTitle: "Spoof your browser's timezone",
    },
    hero: {
      breadcrumbHome: "Home",
      breadcrumb: "Spoof Timezone",
      badge: "Timezone Spoofing",
      headingPre: "Spoof your browser's ",
      headingEmphasis: "timezone",
      introPre:
        "Websites read your timezone the instant a page loads — no permission prompt — through ",
      introMid: " and ",
      introPost:
        ". GeoSpoof overrides them so your clock matches the location you choose, not where you really are.",
      ctaFallback: "Get GeoSpoof free",
      testTimezone: "Test your timezone",
    },
    whatLeaks: {
      heading: "What your browser gives away",
      intro:
        "Unlike the Geolocation API, the timezone surfaces never ask permission — they answer the moment a page loads. A single mismatched clock can undo a spoofed GPS location.",
      reveals1: "Returns an IANA name like America/New_York.",
      reveals2: "Returns your UTC offset in minutes.",
      surface3Api: "Temporal & document timestamps",
      reveals3: "Newer time APIs and page timestamps expose the same zone.",
    },
    howTo: {
      heading: "How to spoof your timezone",
      schemaName: "How to spoof your browser's timezone",
      schemaDesc:
        "Change the timezone your browser reports to websites, without changing your system clock, using the free GeoSpoof extension.",
      steps: [
        {
          name: "Install GeoSpoof",
          text: "Add the free GeoSpoof extension for your browser — Firefox, Chrome, Brave, Edge, or Safari.",
        },
        {
          name: "Set your location",
          text: "Search for a city, enter coordinates, or use VPN Sync to match your VPN's exit region.",
        },
        {
          name: "Timezone aligns automatically",
          text: "GeoSpoof overrides Date, Intl.DateTimeFormat, and Temporal so every clock-based API reports the timezone of your chosen location.",
        },
        {
          name: "Verify it worked",
          text: "Open the GeoSpoof verification page to confirm your reported timezone matches your spoofed location.",
        },
      ],
    },
    whyItMatters: {
      heading: "A spoofed location needs a matching clock",
      body: "A VPN moves your IP and GeoSpoof moves your GPS coordinates — but if your timezone still reads your real region, the mismatch gives you away. GeoSpoof keeps your timezone aligned to your chosen location automatically, and re-aligns it as your VPN switches exit servers, so your geolocation, timezone, and IP all tell the same story.",
      blogLinkLead: "Want the technical deep dive? ",
      blogLinkText: "Read why your timezone reveals your location",
    },
    faq: {
      heading: "Frequently asked questions",
      items: [
        {
          q: "How do I change my browser's timezone?",
          a: "Browsers take their timezone from your operating system, and most don't let you override it per-site. GeoSpoof changes the timezone your browser reports to websites without touching your system clock: install the extension, set a location, and it overrides the JavaScript timezone APIs to match.",
        },
        {
          q: "Can I spoof my timezone without changing my system clock?",
          a: "Yes. GeoSpoof works at the browser API level, so it changes what websites read (Intl.DateTimeFormat, Date, Temporal) while your computer's actual clock and system settings stay exactly as they are.",
        },
        {
          q: "Does a VPN change my browser's timezone?",
          a: "No. A VPN only changes your IP address. Your browser still reports its own timezone from your operating system, so a VPN in another country with your home timezone is an easy mismatch to detect. GeoSpoof aligns the timezone to your spoofed location to close that gap.",
        },
        {
          q: "Why does my timezone need to match my location?",
          a: "If you spoof your GPS location or use a VPN but leave your timezone on your real region, the two disagree — and that mismatch is a common, easily detected tell. Aligning your timezone to your chosen location keeps every signal telling the same story.",
        },
        {
          q: "Does GeoSpoof spoof the timezone automatically?",
          a: "Yes. When you set a location or sync to your VPN, GeoSpoof resolves the correct timezone for those coordinates and applies it automatically — including as your VPN switches exit servers.",
        },
      ],
    },
  },
  verify: {
    meta: {
      title:
        "Browser Location Test — See What Websites Know About You | GeoSpoof",
      description:
        "Free browser location test. See the geolocation, timezone, and IP websites read about you right now — and whether your browser leaks your real location.",
    },
    eyebrow: "Verification",
    heading: "What websites can see about you",
    refresh: "Refresh",
    refreshAria: "Refresh — reload the page to see your latest values",
    introMobile: "Live values websites can read about you right now.",
    introDesktop:
      "Live values from your browser right now — the location, timezone, and IP websites can read. With GeoSpoof active, they reflect your spoofed location instead of your real one.",
    vpnSyncNote:
      "Using Automatic VPN sync? Changes can take up to 10 seconds — tap Refresh to see the latest.",
    rows: {
      geolocation: "Geolocation",
      timezone: "Timezone",
      currentTime: "Current time",
      ipAddress: "IP Address",
      webrtc: "WebRTC",
      waitingPermission: "Waiting for permission…",
      blockedDenied: "Blocked / denied",
      lookingUp: "Looking up…",
      lookupFailed: "Lookup failed",
      probing: "Probing…",
      noLeak: "No IP leak detected",
    },
    vpnCard: {
      line1:
        "Your IP address is the one signal GeoSpoof can't change. Only a VPN can.",
      line2: "The one we recommend is up to {discount} off.",
      cta: "Secure your IP with Proton VPN",
      priceNote: "Up to {discount} off",
      guaranteeNote: "30-day guarantee",
    },
    apiSection: {
      eyebrow: "Browser API surface",
      description:
        "Key fingerprinting surfaces attackers check. Expand any group to see the values they get — they should all tell the same story.",
    },
    supportLead: "See something wrong, or a result you don't expect? ",
    supportLink: "Get support",
    verdict: {
      running: "Running checks…",
      runningSub: "Reading your browser and probing for leaks.",
      allGood: "All checks passed",
      allGoodSub: "Nothing we checked gives you away.",
      exposed: "Some signals are exposed",
      problemWebrtc: "WebRTC leaking your real IP",
      problemGeo: "Location doesn't match IP",
      problemTz: "Timezone doesn't match IP",
      crossRef: "A site cross-referencing these signals could flag you.",
      installFree: "Install GeoSpoof free",
      alreadyHave: "Already have GeoSpoof?",
    },
    dialog: {
      title: "Already running GeoSpoof?",
      description: "A quick checklist clears up almost every flagged signal.",
      ipMismatchLocation: "IP doesn't match your location?",
      ipMismatchTimezone: "IP doesn't match your timezone?",
      ipMismatchBody:
        "That's expected when VPN sync is off — GeoSpoof only aligns your IP when you turn it on. If you meant to keep your real IP, this is working as intended.",
      autoSyncBold: "Just turned on auto VPN sync?",
      autoSyncBody:
        "Give it up to ~10 seconds after a refresh to catch up, then re-check — auto sync isn't instant the way manual sync is.",
      updateBold: "Update to the latest version.",
      updateBody: "New fingerprinting tricks get patched continuously. ",
      downloadOptions: "See download options",
      checkSiteBold: "Check it's on for this site.",
      checkSiteBody:
        "Look at the toolbar icon; if you scope by allowlist or denylist, include this site.",
      reloadBold: "Reload after enabling or updating.",
      reloadBody: "Some surfaces only apply on a fresh page load.",
      stillStuck: "Still stuck? Contact support",
      gotIt: "Got it",
    },
    faq: {
      heading: "Frequently asked questions",
      items: [
        {
          q: "What is my browser's geolocation?",
          a: "Your browser's geolocation is the latitude and longitude it hands to websites through the JavaScript Geolocation API. The map and coordinates above show exactly what sites read when they ask where you are. With GeoSpoof active, that's your spoofed location instead of your real one.",
        },
        {
          q: "Can websites see my real location even when I use a VPN?",
          a: "Yes. A VPN only changes your IP address. Your browser still reports its own GPS-level geolocation, system timezone, and locale — and WebRTC can leak your real IP entirely. If those signals disagree with your VPN's exit location, a site can tell something is off. This page flags exactly those mismatches.",
        },
        {
          q: "Why does my timezone not match my IP address?",
          a: "Your timezone comes from your operating system, while your IP location comes from your network or VPN. If you connect through a VPN in another country but leave your system clock on your home timezone, the two won't line up — a common, easily detected tell. GeoSpoof aligns your timezone to your spoofed location to close that gap.",
        },
        {
          q: "What is a WebRTC leak?",
          a: "WebRTC is a browser feature for real-time audio, video, and data. It can reveal your real public and local IP addresses directly to a website — bypassing your VPN — unless it's blocked. The WebRTC check above probes for that leak and reports any address it manages to expose.",
        },
        {
          q: "Is this browser location test free?",
          a: "Yes. The test runs entirely in your browser, costs nothing, and requires no account. It reads the same signals any website can read and shows them back to you in plain language.",
        },
      ],
    },
  },
  engineLevel: {
    meta: {
      title: "Hide Chrome's “Started Debugging This Browser” Bar | GeoSpoof",
      description:
        "GeoSpoof's Engine-level Spoofing uses Chrome's debugger API, so Chrome shows a debugging bar. Here's what it means, why it's safe, and how to hide it.",
      ogTitle: "Hide Chrome's “started debugging this browser” bar",
    },
    hero: {
      breadcrumbHome: "Home",
      breadcrumb: "Engine-level Spoofing",
      badge: "Chrome · Engine-level Spoofing",
      headingPre: "Hide Chrome's ",
      headingEmphasis: "“started debugging this browser”",
      headingPost: " bar",
      intro:
        "Chrome shows a “started debugging this browser” bar while Engine-level Spoofing is on. It's harmless — here's how to hide it.",
      ctaHowTo: "How to hide the bar",
      ctaFallback: "Get GeoSpoof free",
      figureAlt:
        "Chrome showing a “GeoSpoof started debugging this browser” notification bar at the top of the window while Engine-level Spoofing is on",
      figCaption:
        "The “started debugging this browser” bar Chrome shows while Engine-level Spoofing is on.",
    },
    whatBar: {
      heading: "What the bar means",
      intro:
        "Engine-level Spoofing applies your timezone at the browser level, before a page's first script runs, so it also covers background workers. To reach that deep, GeoSpoof uses Chrome's debugger API — and Chrome announces that with a notification bar.",
      point1Title: "It's a standard Chrome notice",
      point1Body:
        "Chrome shows the bar for any extension that uses the debugger API — the same API DevTools use. It appears the moment GeoSpoof attaches, not because anything went wrong.",
      point2Title: "GeoSpoof only sets a timezone override",
      point2Body:
        "The debugger connection is used solely to apply your spoofed timezone across frames and workers. It doesn't read your page content, keystrokes, or browsing — and the code is open source.",
      point3Title: "The bar is cosmetic",
      point3Body:
        "It changes nothing about how sites see you. Hiding it is purely about removing the strip at the top of the window.",
    },
    howTo: {
      heading: "How to hide the bar",
      introPre: "Launch Chrome with the ",
      introPost:
        " flag. Quit Chrome first, then follow the steps for your system.",
    },
    guides: {
      win: {
        step1: "Close all Chrome windows.",
        step2:
          "Right-click the Chrome shortcut you use (taskbar, desktop, or Start menu) and choose Properties.",
        step3a: "In the ",
        step3strong: "Target",
        step3mid: " field, leave the quoted path to ",
        step3code: "chrome.exe",
        step3end:
          " as-is and add the flag after the closing quote (note the leading space).",
        step4: "Click OK, then open Chrome from that shortcut.",
        note: "Repeat for each shortcut you launch Chrome from (taskbar and Start menu are separate shortcuts).",
      },
      mac: {
        step1: "Quit Chrome completely (⌘Q).",
        step2: "Open Terminal and run the command below.",
        step3a:
          "Chrome reopens without the bar. To launch this way every time, save the command as an Automator ",
        step3strong: "Application",
        step3end: " or a shell alias.",
      },
      linux: {
        step1: "Close Chrome.",
        step2:
          "Launch it with the flag, or add the flag to the Exec= line of your Chrome .desktop launcher to make it permanent.",
        note: "Use chromium in place of google-chrome if you run Chromium.",
      },
    },
    permanent: {
      heading: "Make it stick",
      bodyPre:
        "The flag only applies to launches that include it, so the bar returns if you open Chrome a different way. To keep it hidden for good, add ",
      bodyMid:
        " to the shortcut or launcher you open Chrome from every day — the Windows shortcut Target, a macOS launcher app, or your Linux ",
      bodyDesktopCode: ".desktop",
      bodyEnd: " file.",
      body2Pre:
        "Prefer not to bother? Leave Engine-level Spoofing off — GeoSpoof's standard protection still spoofs your ",
      locationLink: "location",
      body2Mid: " and ",
      timezoneLink: "timezone",
      body2End: " without any debugger bar.",
    },
    faq: {
      heading: "Frequently asked questions",
      items: [
        {
          q: "Why does GeoSpoof say it's “debugging” my browser?",
          a: "Engine-level Spoofing uses Chrome's debugger API (the Chrome DevTools Protocol) — the same mechanism your browser's own DevTools use — to set your timezone deeper in the browser than a normal extension can. Whenever any extension attaches with that API, Chrome shows a “started debugging this browser” bar. It's a standard Chrome notice, not a sign that something is wrong.",
        },
        {
          q: "Is it safe? Is GeoSpoof reading my data?",
          a: "GeoSpoof uses the debugger connection only to apply a timezone override. It does not read your page content, keystrokes, or browsing. GeoSpoof is open source, so you can review exactly what it sends on GitHub. If you'd rather not use it, leave Engine-level Spoofing off and GeoSpoof's standard protection still spoofs your location and timezone.",
        },
        {
          q: "How do I hide the “started debugging this browser” bar?",
          a: "Launch Chrome with the {flag} flag. On Windows, add it to your Chrome shortcut's Target field; on macOS, relaunch Chrome from Terminal with that flag (or save it as a launcher); on Linux, add it to your Chrome launch command or the .desktop file. The bar disappears while spoofing keeps working.",
        },
        {
          q: "Will the bar come back when I restart Chrome?",
          a: "Yes, unless you bake the flag into the shortcut or launcher you always use. The flag only affects launches that include it, so opening Chrome a different way brings the bar back. Add it to your everyday launcher to make it stick.",
        },
        {
          q: "Why can't GeoSpoof hide the bar for me automatically?",
          a: "The bar is controlled by Chrome itself, and only a browser launch flag can turn it off. Extensions can't set Chrome's command-line flags, so this step has to be done once by you. It's a deliberate Chrome safeguard around the debugger API.",
        },
        {
          q: "What is Engine-level Spoofing?",
          a: "It's a Chrome-only GeoSpoof option that spoofs your timezone at the browser engine level instead of from a page script. Because it applies before a page's first script runs and reaches background workers, it closes timezone leaks that page-level spoofing can miss. Geolocation continues to use GeoSpoof's standard, prompt-free method.",
        },
      ],
    },
    schema: {
      howToStep1Name: "Quit Chrome completely",
      howToStep1Text:
        "Close every Chrome window so the browser fully exits — the flag only applies to a fresh launch.",
      howToStep2Name: "Relaunch Chrome with the flag",
      howToStep2Text:
        "Start Chrome with the {flag} command-line flag using the steps for your operating system.",
      howToStep3Name: "Make it permanent (optional)",
      howToStep3Text:
        "Add the flag to the shortcut or launcher you normally use, so the bar stays hidden on every launch.",
      howToStep4Name: "Reopen GeoSpoof",
      howToStep4Text:
        "Engine-level Spoofing keeps working exactly as before — only the notification bar is gone.",
      howToName: "How to hide Chrome's “started debugging this browser” bar",
      howToDesc:
        "Hide the notification bar Chrome shows while GeoSpoof's Engine-level Spoofing is on, by launching Chrome with the {flag} flag.",
    },
  },
  feedback: {
    meta: {
      title: "Send Feedback — GeoSpoof",
      description:
        "Have an idea, a bug to report, or just want to say hi? Send your feedback to the GeoSpoof team — we read every message.",
      ogTitle: "Send feedback to GeoSpoof",
    },
    heading: "Thank you for using GeoSpoof",
    subhead:
      "GeoSpoof is built by a tiny team, and every message genuinely helps shape where it goes next. Whether it's a bug, a feature idea, or just a hello — we'd love to hear from you.",
    emailLabel: "Send your feedback to",
    emailHint: "Copy the address below, or tap it to open your email app.",
    copy: "Copy",
    copied: "✓ Copied",
    copyAria: "Copy the feedback email address",
    closing: "Thank you for helping make GeoSpoof better.",
  },
  gps: {
    meta: {
      title: "Download GeoSpoof GPS for Mac | GeoSpoof",
      description:
        "GeoSpoof GPS is a macOS menu-bar app that sets your connected iPhone's real GPS location to match your spoofed location. Download the signed, notarized DMG.",
      ogTitle: "Download GeoSpoof GPS for Mac",
    },
    experimental: {
      label: "Experimental",
      title: "An early, experimental feature",
      body: "GeoSpoof GPS is new and still being proven across devices, so expect a few rough edges and some one-time setup. It's an optional add-on. The rest of GeoSpoof works fine without it.",
    },
    hero: {
      breadcrumbHome: "Home",
      breadcrumb: "GeoSpoof GPS",
      iconAlt: "GeoSpoof GPS app icon",
      badge: "macOS · Menu-bar app",
      headingPre: "Match your iPhone's ",
      headingEmphasis: "real GPS",
      headingPost: " to your spoofed location",
      intro:
        "GeoSpoof GPS is a macOS menu-bar companion that sets a connected iPhone's system-level location to the place you pick in GeoSpoof. Your browser and your phone's real GPS tell the same story.",
    },
    download: {
      cta: "Download for Mac",
      setupCta: "Set up guide",
      resolving: "Finding the latest version…",
      versionLabel: "Latest version",
      note: "Universal build for Apple Silicon and Intel. Developer ID-signed and notarized by Apple.",
    },
    setup: {
      title: "Set up GeoSpoof GPS",
      intro:
        "Open the menu-bar icon and choose “Set Up…”. The wizard checks each step off as you go. Connect your iPhone with a cable to finish setup, then it keeps working over Wi-Fi.",
      steps: [
        {
          name: "Install the app",
          text: "Open the DMG, drag GeoSpoof GPS into Applications, then launch it. It lives in your menu bar (no Dock icon, no window) and opens the setup wizard the first time it runs.",
        },
        {
          name: "Allow Local Network access",
          text: "On first launch, macOS asks for Local Network access. Click Allow so GeoSpoof GPS can find and talk to your iPhone. Without it, the app can't see your phone.",
          bullets: [
            "Missed the prompt? Turn it on under System Settings ▸ Privacy & Security ▸ Local Network ▸ GeoSpoof GPS.",
            "A stuck “No device found” is the usual sign this permission is off.",
          ],
        },
        {
          name: "Connect your iPhone",
          text: "Plug your iPhone into your Mac and unlock it. Use a data-capable cable, since some are charge-only. If it doesn't appear, try another cable or port.",
        },
        {
          name: "Trust this computer",
          text: "When your iPhone asks whether to trust this computer, tap Trust and enter your passcode. That lets your Mac and phone talk to each other.",
          bullets: [
            "No prompt? Keep the phone unlocked, then unplug and replug the cable. The alert only shows while the screen is unlocked.",
            "Still nothing? Lock and unlock the phone (or restart it) and reconnect.",
            "Last resort only: Settings ▸ General ▸ Transfer or Reset iPhone ▸ Reset ▸ Reset Location & Privacy, then reconnect and tap Trust.",
          ],
        },
        {
          name: "Enable Developer Mode",
          text: "On your iPhone, open Settings ▸ Privacy & Security ▸ Developer Mode, switch it on, and restart when prompted. It only appears after the phone has connected to your Mac at least once.",
        },
        {
          name: "Pair with this Mac",
          text: "In the setup window, click Pair. This one-time secure handshake lets your Mac drive the iPhone's GPS. Keep the phone unlocked and connected while it runs.",
        },
        {
          name: "Prepare the developer image",
          text: "Click Prepare. GeoSpoof GPS mounts Apple's Developer Disk Image on your iPhone, the piece that allows setting the device's real location.",
          bullets: [
            "What it is: a small, Apple-signed system image (the DDI) that turns on developer features like setting a real GPS location on your iPhone.",
            "Where to get it: it ships inside Xcode. Install Xcode free from the Mac App Store and open it once with your iPhone connected. GeoSpoof GPS finds and uses that copy for you. No project, no build, nothing to compile.",
            "Bring your own: already have a developer image? Point GeoSpoof GPS at that folder instead and skip the Xcode download.",
          ],
          link: { label: "Get Xcode on the Mac App Store" },
        },
        {
          name: "Pick a location in GeoSpoof",
          text: "Set your location as usual in GeoSpoof. Your iPhone's system-level GPS follows it and stays aligned, even after you unplug and switch to Wi-Fi.",
          link: { label: "Get GeoSpoof for iPhone" },
        },
      ],
    },
    requirements: {
      title: "What you'll need",
      macos: "macOS 13 (Ventura) or later.",
      appPre: "The ",
      appLink: "GeoSpoof app for iPhone",
      appPost:
        " with GeoSpoof Pro. The app is your control surface that sets the location, and moving the device's real GPS is a Pro feature.",
      iphone:
        "An iPhone with Developer Mode enabled, connected by USB cable for first-time setup.",
      xcodePre: "Xcode, Apple's free developer app from the ",
      xcodeLink: "Mac App Store",
      xcodePost:
        ". It's a big download, so set aside about 15 GB of free space. (You don't build anything; the setup steps below explain how it's used.)",
    },
    menuShotAlt: "GeoSpoof GPS menu-bar app on macOS",
    screenshotAlt: "GeoSpoof GPS on iPhone, screenshot {n}",
    help: {
      title: "Still stuck?",
      body: "If a step won't complete, our support page has more fixes. Found a bug or have an idea? We'd love to hear it.",
      supportLink: "Get help",
      feedbackLink: "Send feedback",
    },
  },
} as const

/**
 * Widen string *literal* types (from `as const`) back to plain `string`, while
 * preserving the exact object structure. This lets the English dictionary
 * define the required shape (every key, correctly nested) without forcing
 * other locales to use the literal English text — `fr.nav.home` can be
 * "Accueil" yet still be type-checked against the canonical structure.
 *
 * Arrays are widened to *homogeneous, variable-length* arrays (not the fixed
 * tuples `as const` would otherwise produce), keyed off the union of their
 * element types. This is deliberate: locales legitimately differ in list
 * length (a translation may split or merge bullets), and a step that carries
 * optional `bullets` in English shouldn't force every other locale to add the
 * same field. Element shapes are still type-checked against the English union.
 */
type Widen<T> = T extends string
  ? string
  : T extends ReadonlyArray<infer E>
    ? ReadonlyArray<Widen<E>>
    : { [K in keyof T]: Widen<T[K]> }

/** The canonical dictionary shape every locale must implement. */
export type Dictionary = Widen<typeof en>
