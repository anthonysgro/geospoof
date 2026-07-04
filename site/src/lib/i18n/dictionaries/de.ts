import type { Dictionary } from "./en"

/**
 * German dictionary.
 *
 * Typed as `Dictionary`, so a missing or misnamed key fails the build. Copy is
 * hand-written (not machine-translated) — Google suppresses thin auto-translated
 * content in local results, so quality matters for the SEO payoff.
 */
export const de: Dictionary = {
  nav: {
    home: "Start",
    features: "Funktionen",
    blog: "Blog",
    support: "Support",
    download: "Herunterladen",
    buyMeACoffee: "Spendier mir einen Kaffee",
    github: "GeoSpoof auf GitHub",
    openMenu: "Navigationsmenü öffnen",
    brandAria: "GeoSpoof - Start",
    mainNavAria: "Hauptnavigation",
  },
  hero: {
    badge: "VPN-Begleiter · Erweiterung",
    headlinePre: "Vollende, was ",
    headlineEmphasis: "dein VPN",
    headlinePost: " begonnen hat",
    subhead:
      "Ein VPN ändert deine IP, aber dein Browser verrät weiterhin deinen echten Standort. GeoSpoof gleicht ihn automatisch an dein VPN an — und hält ihn abgeglichen, wenn du den Server wechselst.",
    downloadFree: "Kostenlos herunterladen",
    seeWhatSitesDetect: "Sieh, was Websites erkennen",
    allPlatforms: "Alle Plattformen und Browser",
    usersTrust: "{count} Nutzer vertrauen uns",
    usersShort: "{count} Nutzer",
    firefoxRating: "Firefox",
    mainPhoneAlt: "GeoSpoof-App — Hauptansicht",
    secondaryPhoneAlt: "GeoSpoof-App — Nebenansicht",
  },
  footer: {
    groups: {
      guides: "Anleitungen",
      learn: "Wissen",
      company: "Unternehmen",
    },
    links: {
      spoofAllBrowsers: "Standort fälschen: alle Browser",
      spoofChrome: "Standort in Chrome fälschen",
      spoofFirefox: "Standort in Firefox fälschen",
      spoofEdge: "Standort in Edge fälschen",
      spoofSafari: "Standort in Safari fälschen",
      spoofTimezone: "Zeitzone fälschen",
      needVpn: "Brauchst du ein VPN?",
      testProtection: "Teste deinen Schutz",
      engineLevel: "Fälschung auf Engine-Ebene (Chrome)",
      blog: "Blog",
      support: "Support",
      about: "Über uns",
      privacy: "Datenschutzerklärung",
      terms: "Nutzungsbedingungen",
      github: "GitHub",
    },
    footerNavAria: "Fußzeilennavigation",
    copyright: "© {year} GeoSpoof. Alle Rechte vorbehalten.",
  },
  languageSwitcher: {
    label: "Sprache",
    suggestion: "Diese Seite ist auf Deutsch verfügbar.",
    switchAction: "Auf Deutsch ansehen",
    dismiss: "Schließen",
  },
  storeCta: {
    firefox: "Zu Firefox hinzufügen",
    chrome: "Zu Chrome hinzufügen",
    apple: "Im App Store laden",
  },
  legal: {
    englishNote:
      "Der folgende rechtliche Text ist nur auf Englisch verfügbar. Maßgeblich ist die englische Fassung.",
    privacy: {
      metaTitle: "Datenschutzerklärung | GeoSpoof",
      metaDescription:
        "Datenschutzerklärung von GeoSpoof — erfahre, wie wir deine Daten schützen und deine Privatsphäre respektieren.",
      heading: "Datenschutzerklärung",
      lastUpdated: "Zuletzt aktualisiert: 3. Juli 2026",
    },
    terms: {
      metaTitle: "Nutzungsbedingungen | GeoSpoof",
      metaDescription:
        "Nutzungsbedingungen von GeoSpoof — verstehe die Bedingungen für die Nutzung der Erweiterung.",
      heading: "Nutzungsbedingungen",
      lastUpdated: "Zuletzt aktualisiert: 3. Juli 2026",
    },
  },
  testimonials: {
    eyebrow: "Das sagen die Nutzer",
    heading: "Beliebt bei datenschutzbewussten Nutzern",
    subhead:
      "Echte Bewertungen aus dem Chrome Web Store, von Firefox Add-ons und aus dem App Store.",
    starsAria: "5 von 5 Sternen",
    readMoreOn: "Lies weitere Bewertungen auf",
  },
  screenshots: {
    eyebrow: "In Aktion",
    heading: "Funktioniert überall, wo du surfst",
    desktopAlt:
      "Die GeoSpoof-Browsererweiterung auf dem Desktop — die Standortfälschung in Aktion",
  },
  demo: {
    eyebrow: "Sieh sie in Aktion",
    heading: "Fälsche deinen Standort mit ein paar Klicks",
    videoAria:
      "GeoSpoof-Demo — einen gefälschten Browserstandort mit der Erweiterung festlegen",
    unsupported: "Dein Browser unterstützt keine eingebetteten Videos.",
    downloadInstead: "Demo herunterladen",
    insteadSuffix: "stattdessen.",
  },
  features: {
    eyebrow: "Funktionen",
    heading: "Jedes Signal abgedeckt",
    subhead:
      "Websites nutzen mehrere Browser-APIs, um deinen Standort zu erkennen. GeoSpoof überschreibt sie alle — konsistent, bevor irgendein Seitenskript ausgeführt wird.",
    visual: {
      noIpLeak: "Kein IP-Leck",
      noTracking: "Kein Tracking",
      noTelemetry: "Keine Telemetrie",
      vpnExit: "VPN-Ausgang",
      spoofed: "Gefälscht",
      synced: "synchronisiert",
      andMore: "und mehr",
    },
    items: {
      geolocation: {
        title: "Standortfälschung",
        description:
          "Überschreibe navigator.geolocation, damit Websites die Koordinaten sehen, die du wählst. Suche nach einer Stadt, gib Koordinaten manuell ein oder synchronisiere mit deinem VPN.",
      },
      timezone: {
        title: "Zeitzonenfälschung",
        description:
          "Fälsche Date, Intl.DateTimeFormat und die Temporal-API, damit deine Zeitzone zum gewählten Standort passt.",
      },
      webrtc: {
        title: "WebRTC-Schutz",
        description:
          "Verhindere IP-Lecks über WebRTC in Firefox und Chromium mithilfe der Datenschutz-API des Browsers.",
      },
      vpnSync: {
        title: "VPN-Synchronisierung",
        description:
          "Erkenne die Ausgangsregion deines VPN automatisch und gleiche deinen gefälschten Standort daran an — mit einem Klick.",
      },
      apis: {
        title: "Vollständige API-Abdeckung",
        description:
          "Jede Browser-API, die deinen Standort verrät, ist abgedeckt — eingespeist bei document_start, bevor irgendein Seitenskript ausgeführt wird.",
      },
    },
  },
  comparison: {
    eyebrow: "So schneidet GeoSpoof ab",
    heading: "Mehr als nur ein Koordinatentausch",
    subhead:
      "Die meisten Standortfälscher tun nur eines: eine falsche Breiten- und Längenangabe in den Browser einspeisen. GeoSpoof deckt das gesamte Signal ab, damit dein Standort, deine Zeitzone und deine IP dieselbe Geschichte erzählen.",
    featureHeader: "Funktion",
    typicalHeader: "Üblich",
    yesAria: "Ja",
    limited: "Eingeschränkt",
    noAria: "Nein",
    features: {
      coordinates: "Geolocation über Koordinaten fälschen",
      oneIdentity:
        "Eine konsistente Identität über Dutzende Browser-APIs hinweg",
      citySearch: "Standort per Städtesuche festlegen",
      webrtc: "Schutz vor WebRTC-IP-Lecks",
      everyBrowser: "Alle großen Browser + gesamtes Apple-Ökosystem",
      verification: "Integrierte Überprüfungsseite",
      vpnSync: "VPN-Synchronisierung mit automatischer Neusynchronisierung",
      perSite: "Regeln pro Website und gespeicherte Favoriten",
    },
    legend: {
      fullSupport: "Volle Unterstützung",
      limitedDetail: ": teilweise oder grundlegend",
      notSupported: "Nicht unterstützt",
    },
    proAria: "Pro auf iPhone und iPad",
    proNote:
      "Pro auf iPhone und iPad. Kostenlos in Desktop-Browsern und Safari.",
    ctaLead: "Glaub uns nicht einfach: ",
    ctaLink: "teste deinen Schutz",
    ctaTail: " und sieh dir jedes Signal selbst an.",
  },
  compatibility: {
    eyebrow: "Kompatibilität",
    heading: "Funktioniert auf all deinen Geräten",
    subhead:
      "GeoSpoof läuft in allen großen Browsern und auf allen großen Plattformen. Eine Erweiterung, überall konsistenter Schutz.",
    platformHeader: "Plattform",
    supportedAria: "Unterstützt",
    naAria: "Nicht zutreffend",
    notSupportedAria: "Nicht unterstützt",
    legend: {
      supported: "Unterstützt",
      notSupported: "Nicht unterstützt",
      na: "N/V — Nicht zutreffend",
    },
    footnote:
      "Firefox für Android erfordert Firefox 140+. Safari erfordert iOS 16+ oder macOS 13+.",
    setupLead:
      "Browserspezifische Einrichtungsanleitungen: fälsche deinen Standort in ",
    or: " oder ",
    alsoLead: ". Du kannst auch ",
    timezoneLink: "die Zeitzone deines Browsers fälschen",
  },
  featuredPost: {
    eyebrow: "Aus dem Blog",
    heading: "Lesenswert",
    allPosts: "Alle Beiträge",
    minRead: "Min. Lesezeit",
    readMore: "Weiterlesen",
  },
  blog: {
    index: {
      metaTitle: "Blog | GeoSpoof",
      metaDescription:
        "Anleitungen und ausführliche Beiträge zur Standortfälschung im Browser, zum Zeitzonen-Datenschutz, zu WebRTC-Lecks und dazu, wie du das Beste aus GeoSpoof herausholst.",
      heading: "GeoSpoof-Blog",
      subhead:
        "Anleitungen und ausführliche Beiträge zur Standortfälschung, zum Zeitzonen-Datenschutz und zum Browser-Fingerprinting.",
      empty: "Noch keine Beiträge — schau bald wieder vorbei.",
      minRead: "Min. Lesezeit",
    },
    post: {
      breadcrumbHome: "Start",
      breadcrumbBlog: "Blog",
      minRead: "Min. Lesezeit",
      faqHeading: "Häufig gestellte Fragen",
      olderPost: "← Älterer Beitrag",
      newerPost: "Neuerer Beitrag →",
      backToAll: "← Zurück zu allen Beiträgen",
      englishNote: "Dieser Artikel ist nur auf Englisch verfügbar.",
    },
  },
  download: {
    eyebrow: "Herunterladen",
    heading: "Hol dir GeoSpoof kostenlos",
    subhead:
      "Verfügbar in allen großen Browsern. Kein Konto nötig, keine Telemetrie, kein Tracking.",
    recommendedBadge: "Für dich empfohlen",
    installFree: "Kostenlos installieren",
    otherWays: "Weitere Wege zum Herunterladen",
    stores: {
      firefox: {
        description: "Firefox 140+ auf Desktop und Android",
        cta: "Zu Firefox hinzufügen",
      },
      chromium: {
        description: "Chrome, Brave und Edge",
        cta: "Zu Chrome hinzufügen",
      },
      apple: {
        description: "Safari auf iOS und macOS",
        cta: "Im App Store laden",
      },
    },
    selfHosted: {
      dmg: {
        name: "Direkter Download (macOS)",
        description:
          "Notarisierte DMG für Safari auf macOS. Keine Apple-ID erforderlich. Manuelle Updates — zum Aktualisieren erneut herunterladen.",
      },
      xpi: {
        name: "Selbst gehostete XPI (Firefox)",
        description:
          "Signierte XPI für Firefox-Forks oder manuelle Installationen. Automatische Updates über unser Update-Manifest.",
      },
      cta: "GitHub-Releases",
    },
  },
  skipLink: {
    toMainContent: "Zum Hauptinhalt springen",
  },
  phoneCarousel: {
    embeddedHeading: "Und nativ auf iPhone und iPad",
    standaloneHeading: "GeoSpoof auf iOS und iPadOS",
    screenshotAlt: "GeoSpoof auf iOS — Screenshot {n}",
    goToSlide: "Zu Folie {n} springen",
    getTheApp: "Hol dir die App",
    appStore: "Im App Store laden",
    macAppStore: "Im Mac App Store laden",
  },
  exposureToast: {
    header: "Was jede Website sieht",
    exposed: "Offengelegt",
    visibleToSites: "Für Websites sichtbar",
    location: "Standort",
    timezone: "Zeitzone",
    address: "Adresse",
    webrtc: "WebRTC",
    publicIpLeaking: "Öffentliche IP wird verraten",
    noLeak: "Kein Leck",
    yourArea: "deine Region",
    hideMyLocation: "Meinen Standort verbergen",
    getGeospoof: "GeoSpoof holen",
    fullReport: "Vollständiger Bericht",
    dismiss: "Schließen",
  },
  themeToggle: {
    switchToLight: "Zum hellen Modus wechseln",
    switchToDark: "Zum dunklen Modus wechseln",
    changedToLight: "Design auf hellen Modus umgestellt",
    changedToDark: "Design auf dunklen Modus umgestellt",
  },
  carousel: {
    previousSlide: "Vorherige Folie",
    nextSlide: "Nächste Folie",
  },
  spoofLocation: {
    hub: {
      metaTitle:
        "Fälsche den Standort deines Browsers — kostenlose Erweiterung | GeoSpoof",
      metaDescription:
        "Fälsche den Standort deines Browsers in Chrome, Edge, Firefox oder Safari. GeoSpoof überschreibt die Geolocation-API und die Zeitzone, damit Websites den von dir gewählten Standort sehen.",
      ogTitle: "Fälsche den Standort deines Browsers",
      badge: "Standortfälschung",
      headingPre: "Fälsche den ",
      headingEmphasis: "Standort",
      intro:
        "Websites lesen deinen Standort über die Geolocation-API des Browsers und deine Zeitzone aus — ein VPN ändert keines von beiden. GeoSpoof überschreibt beide, damit Websites den Standort sehen, den du wählst. Wähle deinen Browser, um loszulegen.",
      cardTitle: "Standort in {name} fälschen",
      openGuide: "Anleitung öffnen",
    },
    page: {
      browserBadge: "{name}-Erweiterung",
      headingPre: "Fälsche deinen Standort in {name}",
      ctaFallback: "GeoSpoof für {name} holen",
      testLocation: "Teste deinen Standort",
      breadcrumbHome: "Start",
      breadcrumbHub: "Standort fälschen",
      howToHeading: "So fälschst du deinen Standort in {name}",
      stepInstallName: "GeoSpoof für {name} installieren",
      stepInstallText:
        "Füge die kostenlose GeoSpoof-Erweiterung aus {store} hinzu.",
      stepEnableName: "In {name} aktivieren",
      stepSetName: "Standort festlegen",
      stepSetText:
        "Suche nach einer Stadt, gib Koordinaten ein oder nutze die VPN-Synchronisierung, um sie an die Ausgangsregion deines VPN anzugleichen.",
      stepReportsName: "{name} meldet den von dir gewählten Standort",
      stepReportsText:
        "GeoSpoof überschreibt die Geolocation-API und die Zeitzone (Date, Intl, Temporal), damit jede Website den von dir gewählten Standort sieht",
      stepReportsWebrtcSuffix:
        ", und der WebRTC-Schutz verhindert, dass deine echte IP durchsickert",
      webrtcAvailableTitle: "Der WebRTC-Schutz ist in {name} verfügbar.",
      webrtcAvailableBody:
        "GeoSpoof verhindert außerdem, dass deine echte IP über WebRTC durchsickert, was andernfalls ein VPN komplett umgehen kann.",
      webrtcUnavailableTitle:
        "Hinweis: Der WebRTC-Schutz ist in {name} nicht verfügbar.",
      webrtcUnavailableBody:
        "Standort- und Zeitzonenfälschung werden vollständig unterstützt; die WebRTC-Datenschutz-API, auf die sich GeoSpoof stützt, ist in diesem Browser nicht verfügbar.",
      faqHeading: "Häufig gestellte Fragen",
      faqHowQ: "Wie fälsche ich meinen Standort in {name}?",
      faqHowA:
        "Installiere die kostenlose GeoSpoof-Erweiterung, lege einen Standort fest (suche eine Stadt, gib Koordinaten ein oder synchronisiere mit deinem VPN), und GeoSpoof überschreibt die Geolocation- und Zeitzonen-APIs in {name}, damit Websites deinen gewählten Standort statt deines echten sehen.",
      faqVpnQ: "Ändert ein VPN meinen Standort in {name}?",
      faqVpnA:
        "Nein. Ein VPN ändert nur deine IP-Adresse. {name} meldet weiterhin seine eigene Browser-Geolocation und die System-Zeitzone, die deine echte Region also weiterhin verraten können. GeoSpoof fälscht die Browsersignale; nutze es zusammen mit einem VPN für einen konsistenten Standort.",
      faqFreeQ: "Ist GeoSpoof für {name} kostenlos?",
      faqFreeA:
        "Ja. GeoSpoof ist kostenlos und quelloffen. Kein Konto, keine Anmeldung und kein Tracking — jede Einstellung bleibt auf deinem Gerät.",
      crossLinkLead: "Nutzt du einen anderen Browser? Siehe ",
      crossLinkText: "deinen Standort in jedem Browser fälschen",
      schemaSoftwareDesc:
        "Fälsche deine Geolocation und Zeitzone in {name} mit einer kostenlosen, quelloffenen Erweiterung.",
    },
    browsers: {
      chrome: {
        storeName: "dem Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Chrome teilt deinen Aufenthaltsort über die Geolocation-API und deine Zeitzone über Intl und Date mit Websites — und ein VPN ändert daran nichts. GeoSpoof überschreibt diese Signale innerhalb von Chrome, damit Websites den Standort sehen, den du wählst. Dieselbe Version läuft auch in Brave, Opera und anderen Chromium-Browsern.",
        enableStep:
          "Hefte GeoSpoof über das Puzzleteil-Symbol (Erweiterungen) in der Chrome-Symbolleiste an, damit es nur einen Klick entfernt ist.",
        extraFaqQ:
          "Funktioniert GeoSpoof in Brave und anderen Chromium-Browsern?",
        extraFaqA:
          "Ja. GeoSpoof wird aus dem Chrome Web Store installiert, der Chrome, Brave, Opera und andere Chromium-basierte Browser bedient. Die Standort- und Zeitzonenfälschung funktioniert in allen identisch.",
        metaTitle:
          "Fälsche deinen Standort in Chrome — kostenlose Erweiterung | GeoSpoof",
        metaDescription:
          "Fälsche deinen Standort in Chrome mit einer kostenlosen Erweiterung. GeoSpoof überschreibt die Geolocation-API und die Zeitzone, damit Websites den von dir gewählten Standort sehen. Brave ebenfalls.",
        ogTitle: "Fälsche deinen Standort in Chrome",
      },
      edge: {
        storeName: "dem Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Microsoft Edge basiert auf Chromium und legt deinen Standort daher genauso offen wie Chrome — über die Geolocation-API und die Zeitzone deines Systems. GeoSpoof wird aus dem Chrome Web Store installiert, läuft in Edge und überschreibt diese APIs, um den Standort zu melden, den du wählst. Das funktioniert zum Fälschen deines Standorts in Edge unter Windows wie unter macOS.",
        enableStep:
          "Erlaube die Erweiterung aus dem Chrome Web Store, wenn Edge dich dazu auffordert, und hefte GeoSpoof dann über das Symbol Erweiterungen (Puzzleteil) an.",
        extraFaqQ: "Kann ich meinen Standort in Edge unter Windows fälschen?",
        extraFaqA:
          "Ja. GeoSpoof läuft in Edge unter Windows und macOS. Es überschreibt den Standort und die Zeitzone, die dein Browser an Websites meldet; es ändert nicht die Standorteinstellungen von Windows selbst, dein Betriebssystem bleibt also unangetastet.",
        metaTitle:
          "Fälsche deinen Standort in Edge — kostenlose Erweiterung | GeoSpoof",
        metaDescription:
          "Fälsche deinen Standort in Microsoft Edge mit einer kostenlosen Erweiterung. GeoSpoof überschreibt die Geolocation-API und die Zeitzone, damit Websites den von dir gewählten Standort sehen.",
        ogTitle: "Fälsche deinen Standort in Edge",
      },
      firefox: {
        storeName: "Firefox Add-ons",
        storeShort: "Firefox Add-ons",
        intro:
          "Firefox übergibt Websites deinen Standort über die Geolocation-API und deine Region über die Zeitzonen-APIs, unabhängig von jedem VPN. GeoSpoof wird über Firefox Add-ons installiert und überschreibt diese Signale. Es ist die einzige Version, die auch auf Firefox für Android läuft, sodass du deinen Standort auch mobil fälschen kannst.",
        enableStep:
          "Nachdem du GeoSpoof über Firefox Add-ons hinzugefügt hast, hefte es für schnellen Zugriff über das Erweiterungsmenü an die Symbolleiste.",
        extraFaqQ:
          "Kann ich meinen Standort in Firefox unter Android fälschen?",
        extraFaqA:
          "Ja. Firefox 140+ unter Android unterstützt GeoSpoof, sodass du Geolocation und Zeitzone auf deinem Handy fälschen kannst — etwas, das Chrome auf dem Handy nicht kann, da es keine Erweiterungen unterstützt.",
        metaTitle:
          "Fälsche deinen Standort in Firefox — kostenloses Add-on | GeoSpoof",
        metaDescription:
          "Fälsche deinen Standort in Firefox mit einem kostenlosen, quelloffenen Add-on. GeoSpoof überschreibt die Geolocation-API und die Zeitzone, damit Websites den von dir gewählten Standort sehen.",
        ogTitle: "Fälsche deinen Standort in Firefox",
      },
      safari: {
        storeName: "dem App Store",
        storeShort: "App Store",
        intro:
          "Safari unter iOS, iPadOS und macOS meldet deinen Standort und deine Zeitzone genau wie jeder Browser an Websites. GeoSpoof wird aus dem App Store installiert und läuft als Safari-Erweiterung, die diese APIs überschreibt, damit Websites den Standort sehen, den du wählst. Standort- und Zeitzonenfälschung werden vollständig unterstützt; der WebRTC-Schutz ist in Safari nicht verfügbar.",
        enableStep:
          "Aktiviere GeoSpoof nach der Installation aus dem App Store über das Erweiterungsmenü von Safari (das Puzzleteil in der Adressleiste unter iOS oder Safari → Einstellungen → Erweiterungen unter macOS).",
        extraFaqQ:
          "Funktioniert die Standortfälschung in Safari auf dem iPhone?",
        extraFaqA:
          "Ja. GeoSpoof ist eine Safari-Erweiterung, die über den App Store für iOS, iPadOS und macOS verfügbar ist. Sobald sie für eine Website aktiviert ist, überschreibt sie die von Safari gemeldete Geolocation und Zeitzone. Der WebRTC-Schutz ist die einzige Funktion, die in Safari nicht verfügbar ist.",
        metaTitle:
          "Fälsche deinen Standort in Safari — kostenlose Erweiterung | GeoSpoof",
        metaDescription:
          "Fälsche deinen Standort in Safari mit einer kostenlosen App-Store-Erweiterung. GeoSpoof überschreibt die Geolocation-API und die Zeitzone unter iOS, iPadOS und macOS.",
        ogTitle: "Fälsche deinen Standort in Safari",
      },
    },
  },
  vpn: {
    meta: {
      title:
        "Brauchst du ein VPN mit GeoSpoof? Zwei Datenschutzebenen | GeoSpoof",
      description:
        "GeoSpoof verbirgt den Standort, die Zeitzone und das WebRTC, die dein Browser meldet. Ein VPN ohne Protokolle verbirgt deine IP — das eine Signal, das eine Erweiterung nicht ändern kann.",
      ogTitle: "Brauchst du ein VPN mit GeoSpoof?",
    },
    hero: {
      mapAlt: "Proton VPN verbirgt deine IP-Adresse",
      badge: "Standort-Datenschutz hat zwei Ebenen",
      headingPre: "Brauchst du ein VPN mit ",
      headingPost: "?",
      answer:
        "GeoSpoof verbirgt den Standort deines Browsers. Ein VPN verbirgt deine IP. Für vollständigen Datenschutz willst du beides.",
      disclosureBody:
        "Wir kooperieren mit Proton VPN. Wenn du über unseren Link abonnierst, erhalten wir eine Provision, ohne dass dir zusätzliche Kosten entstehen.",
      ctaPlans: "Proton-VPN-Tarife ansehen",
      partnerPricing: "Bis zu {discount} Partnerrabatt",
      learnMore: "Mehr erfahren",
      moneyBack: "30-Tage-Geld-zurück-Garantie",
      platformsAria:
        "Proton VPN ist für Windows, macOS, Linux, iOS und Android verfügbar",
    },
    twoLayers: {
      heading: "Zwei Ebenen, zwei Werkzeuge",
      intro:
        "Standort-Datenschutz hat zwei unabhängige Ebenen. GeoSpoof versiegelt die Browser-Ebene; ein VPN versiegelt die Netzwerk-Ebene. Fälsche die eine, lass aber die andere offen, und die Diskrepanz verrät dich. Ein Browser, der Tokio meldet, während deine IP weiterhin auf New York verweist, ist leicht aufzuspüren.",
      browserTitle: "Die Browser-Ebene",
      browserBody:
        "Websites lesen deinen Standort aus der Geolocation-API, deine Region aus den Zeitzonen-APIs und deine lokalen IPs aus WebRTC. GeoSpoof überschreibt all das, damit sie den Standort melden, den du wählst.",
      browserWho: "Von GeoSpoof abgedeckt",
      networkTitle: "Die Netzwerk-Ebene",
      networkBody:
        "Jede Website sieht außerdem die öffentliche IP-Adresse, von der deine Verbindung kommt und die einer echten Stadt zugeordnet ist. Keine Browsererweiterung kann sie ändern — sie liegt unterhalb des Browsers, im Netzwerk.",
      networkWho: "Von einem VPN abgedeckt",
      primerLead:
        "Willst du eine tiefere, herstellerneutrale Einschätzung? Jonah Aragon von Privacy Guides hat eine klare Einführung dazu, ",
      primerLink: "was ein VPN wirklich tut und was nicht",
    },
    whyProton: {
      eyebrow: "Das VPN, dem wir vertrauen",
      heading: "Warum Proton VPN",
      intro:
        "GeoSpoof ist quelloffen und speichert keinerlei Protokolle. Beim Datenschutz ist das einzige Vertrauen, das zählt, jenes, das man überprüfen kann. Proton hält sich an denselben Maßstab: quelloffene Apps, eine unabhängig geprüfte No-Logs-Richtlinie und Schweizer Gerichtsbarkeit.",
      reason1Title: "Keine Protokolle, unabhängig geprüft",
      reason1Body:
        "Protons No-Logs-Richtlinie wurde wiederholt unabhängig geprüft, nicht nur behauptet, und in echten rechtlichen Anfragen auf die Probe gestellt.",
      reason2Title: "Schweizerisch, quelloffen",
      reason2Body:
        "Ansässig in der Schweiz unter strengem Datenschutzrecht, mit vollständig quelloffenen Apps, die jeder prüfen kann — derselbe überprüfbare Ansatz wie bei GeoSpoof.",
      reason3Title: "Funktioniert mit der VPN-Synchronisierung",
      reason3Body:
        "Die VPN-Synchronisierung von GeoSpoof hält deinen gefälschten Standort automatisch mit der Ausgangsregion deines VPN abgeglichen — mit Proton oder jedem anderen VPN deiner Wahl.",
      calloutLead: "Glaub uns nicht einfach.",
      calloutBodyPre: " Proton ist eines der wenigen VPNs, die von ",
      calloutLink: "Privacy Guides",
      calloutBodyPost:
        " empfohlen werden, einer unabhängigen, von der Community betriebenen Datenschutz-Ressource. GeoSpoof funktioniert mit jedem VPN, du bist also nie gebunden; wir empfehlen Proton aus den oben genannten quelloffenen, geprüften Gründen, aber die richtige Wahl ist jenes, dem du vertraust.",
    },
    plan: {
      imgAlt: "Startbildschirm der Proton-VPN-App",
      heading: "Wähle den passenden Tarif",
      body: "GeoSpoof ist quelloffen. Für die IP-Ebene würden wir dich zu Protons VPN Plus lotsen. Der 2-Jahres-Tarif ist {discount} günstiger als Protons Standardpreis — der niedrigste Preis pro Monat und das beste Gesamtpreis-Leistungs-Verhältnis. Willst du es lieber erst ausprobieren? Der Monatstarif funktioniert auch.",
      cta: "Proton-VPN-Tarife ansehen",
      unlimitedPre:
        "Schon ein VPN, oder möchtest du mehr als ein Tool? Protons ",
      unlimitedLink: "Unlimited-Tarif",
      unlimitedPost: " bündelt VPN mit Mail, Pass, Drive und Calendar.",
    },
    inlineDisclosure:
      "Hinweis — das ist ein Affiliate-Link. Abonniere darüber und Proton gibt uns einen kleinen Anteil ab, ohne dass dir zusätzliche Kosten entstehen. So helfen wir mit, GeoSpoof quelloffen und unabhängig zu halten.",
    faq: {
      heading: "Häufig gestellte Fragen",
      items: [
        {
          q: "Brauche ich ein VPN, wenn ich GeoSpoof nutze?",
          a: "Für vollständigen Standort-Datenschutz ja — aber nicht, weil GeoSpoof zu kurz greift. GeoSpoof ändert den Standort, die Zeitzone und die WebRTC-Details, die dein Browser an Websites meldet. Das stärkste verbleibende Signal ist deine IP-Adresse, und nur ein VPN kann sie ändern. Die beiden decken unterschiedliche Ebenen ab; zusammen erzählen sie eine konsistente Geschichte.",
        },
        {
          q: "Kann ich ein anderes VPN mit GeoSpoof nutzen?",
          a: "Ja. GeoSpoof funktioniert mit jedem VPN. Nichts ist an Proton gebunden, und die VPN-Synchronisierung funktioniert mit allen gleich. Mullvad und IVPN sind weitere angesehene No-Logs-Anbieter in der Datenschutz-Community. Wir empfehlen Proton, weil es vollständig quelloffen, unabhängig geprüft und von Privacy Guides empfohlen ist, aber die Wahl liegt ganz bei dir.",
        },
        {
          q: "Warum empfiehlt GeoSpoof Proton VPN?",
          a: "Proton speichert keine Protokolle, sitzt in der Schweiz, ist vollständig quelloffen und hat wiederholt unabhängige Prüfungen bestanden. Das sind dieselben überprüfbaren, datenschutzorientierten Werte, auf denen GeoSpoof aufbaut. Es ist außerdem eines der wenigen VPNs, die von Privacy Guides empfohlen werden, einer unabhängigen Ressource, die kein Affiliate-Geld annimmt. Die VPN-Synchronisierung funktioniert mit Proton genau wie mit jedem anderen VPN.",
        },
        {
          q: "Brauche ich ein VPN, um GeoSpoof zu nutzen?",
          a: "Nein. Die Kernfälschung von GeoSpoof funktioniert ohne VPN. Ein VPN verbirgt nur deine echte IP-Adresse — es ist ein ergänzendes Werkzeug, keine Voraussetzung für die Nutzung von GeoSpoof.",
        },
        {
          q: "Verdient GeoSpoof Geld, wenn ich mich anmelde?",
          a: "Wenn du Proton über unseren Link abonnierst, gibt Proton uns einen Teil des Verkaufs ab, ohne dass dir zusätzliche Kosten entstehen. Das hilft, GeoSpoof quelloffen und werbefrei zu halten. Wir empfehlen Proton aufgrund seiner Verdienste (quelloffen, unabhängig geprüft und von Privacy Guides empfohlen), und die Provision ändert nichts daran, welcher Tarif tatsächlich am besten für dich ist.",
        },
      ],
    },
    disclosure: {
      label: "Affiliate-Hinweis:",
      body: "GeoSpoof ist ein unabhängiges, quelloffenes Tool und steht in keiner Verbindung zu Proton und wird nicht von Proton unterstützt. Wenn du über unsere Empfehlung einen Tarif kaufst, gibt Proton uns einen Teil des Verkaufs ab, ohne dass dir zusätzliche Kosten entstehen. Das hilft, GeoSpoof kostenlos, quelloffen und werbefrei zu halten. Wir empfehlen Proton aufgrund seiner Verdienste (quelloffen, unabhängig geprüft und von Privacy Guides empfohlen), nicht wegen der Provision, und GeoSpoof funktioniert mit jedem VPN, das du bevorzugst.",
    },
  },
  support: {
    meta: {
      title:
        "GeoSpoof-Support — Fälschung, VPN-Synchronisierung und Einrichtung beheben",
      description:
        "Hol dir Hilfe zu GeoSpoof: behebe nicht funktionierende Standortfälschung, löse Zeitüberschreitungen der VPN-Synchronisierung, WebRTC-Probleme und die Einrichtung im Browser oder auf dem Handy — oder kontaktiere unser Team.",
    },
    heading: "Wie können wir helfen?",
    subhead:
      "Die meisten Meldungen lassen sich auf eine der folgenden Ursachen zurückführen. Arbeite die Liste durch und hör auf, sobald die Fälschung funktioniert.",
    symptomsLead: "Was ist los?",
    symptoms: [
      {
        label: "Die Standortfälschung funktioniert nicht",
        target: "troubleshooting",
      },
      {
        label:
          "Die VPN-Synchronisierung schlägt fehl oder läuft in eine Zeitüberschreitung",
        target: "faq-vpn-sync",
      },
      {
        label: "Es funktioniert auf dem Desktop, aber nicht auf meinem Handy",
        target: "faq-mobile",
      },
      { label: "Etwas anderes", target: "questions" },
    ],
    lastUpdatedLabel: "Zuletzt aktualisiert",
    troubleshooting: {
      title: "Die Fälschung funktioniert auf einer Website nicht",
      intro:
        "Sie sind vom häufigsten zum seltensten sortiert. Wahrscheinlich musst du nicht bis zum Ende kommen.",
      browserNote:
        "GeoSpoof läuft auch in Chrome, Edge, Brave und Safari. Die folgenden Schritte sind für Firefox geschrieben, wo diese Konflikte am häufigsten auftreten — wende in anderen Browsern die entsprechenden Einstellungen an.",
      latestReleaseLabel: "Neueste Version",
      latestReleaseCta: "Die neueste Version auf GitHub ansehen",
      badgeActiveLabel: "Aktiv in diesem Tab",
      badgeActiveAlt:
        "GeoSpoof-Symbolleisten-Symbol mit einer Markierung, die anzeigt, dass es im aktuellen Tab aktiv ist",
      badgeDisabledLabel: "Läuft in diesem Tab nicht",
      badgeDisabledAlt:
        "GeoSpoof-Symbolleisten-Symbol mit einer Markierung, die anzeigt, dass es im aktuellen Tab nicht läuft",
      geolocationDeniedAlt:
        "Ein Fingerprint-Testergebnis, das „Geolocation: Denied“ meldet, weil Firefox die Standortanfrage blockiert hat",
      geolocationDeniedCaption:
        "So sieht eine blockierte Standortanfrage bei einem Fingerprint-Test aus.",
      preserveOffAlt:
        "Das GeoSpoof-Popup mit dem deaktivierten Schalter „Standortabfragen beibehalten“",
      preserveOffCaption:
        "GeoSpoof-Popup mit deaktiviertem „Standortabfragen beibehalten“.",
      tzpCta: "Den TZP-Test öffnen",
      featuredLabel: "Beste Diagnose",
      steps: [
        {
          title: "Lade den Tab neu oder öffne ihn erneut",
          featured: false,
          body: "GeoSpoof wirkt nur auf Seiten, die nach dem Aktivieren geladen wurden. Jeder Tab, der beim Installieren, Aktualisieren oder erneuten Aktivieren von GeoSpoof bereits geöffnet war, wird erst gefälscht, wenn er neu lädt. Lade den Tab neu, den du testest — falls das nicht hilft, schließe ihn und öffne ihn erneut.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Auf die neueste Version aktualisieren",
          featured: false,
          body: "Viele Probleme sind in einer neueren Version bereits behoben. Öffne im Popup Details → Erweitert, um deine Version zu sehen, vergleiche sie dann mit der neuesten Version unten und aktualisiere über die Erweiterungsverwaltung deines Browsers, falls du hinterherhinkst.",
          details: [],
          note: "",
          action: "latestRelease",
        },
        {
          title: "Bestätige, dass GeoSpoof auf der Website läuft",
          featured: false,
          body: "Das Symbolleisten-Symbol von GeoSpoof zeigt, ob es im aktuellen Tab aktiv ist. Wenn es nicht aktiv ist, wird nichts gefälscht — meist wegen des im Reiter Filter festgelegten Website-Geltungsbereichs.",
          details: [
            "Zulassungslisten-Modus: nur gelistete Websites werden gefälscht — füge die Website hinzu, die du testest.",
            "Sperrlisten-Modus: stelle sicher, dass die Website nicht auf der Liste steht.",
            "Oder wechsle zu „Alle“, um überall zu fälschen.",
          ],
          note: "",
          action: "badgeCheck",
        },
        {
          title: "Setze die Standortberechtigung der Website zurück",
          featured: false,
          body: "Wenn ein Test „Geolocation: Denied“ meldet, blockiert Firefox die Anfrage — meist, weil die Abfrage einmal mit aktiviertem „Diese Entscheidung merken“ abgelehnt wurde.",
          details: [
            "Klicke auf das Schloss-Symbol in der Adressleiste.",
            "Entferne jede gemerkte Blockierung für den Standort und lade dann die Seite neu.",
            "Bestätige in den Firefox-Einstellungen, dass „Neue Anfragen zum Zugriff auf deinen Standort blockieren“ deaktiviert ist.",
            "Wenn der Schalter „Standortabfragen beibehalten“ von GeoSpoof aktiviert ist und du die Abfrage abgelehnt hast, erlaube sie entweder oder deaktiviere den Schalter, damit GeoSpoof direkt antwortet.",
          ],
          note: "",
          action: "geolocationDenied",
        },
        {
          title: "Starte deinen Browser neu",
          featured: false,
          body: "Manche Browser-APIs werden beim Start eingerichtet, daher greifen eine kürzliche Installation, ein Update oder eine Einstellungsänderung möglicherweise erst, wenn du deinen Browser vollständig schließt und wieder öffnest.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Teste in einem frischen Firefox-Profil",
          featured: true,
          body: "Ein sauberes Profil isoliert GeoSpoof von deiner bestehenden Einrichtung.",
          details: [
            "Öffne about:profiles und erstelle ein neues Profil.",
            "Starte es, installiere GeoSpoof und teste dieselbe Website erneut.",
          ],
          note: "Wenn die Fälschung im sauberen Profil funktioniert, ist mit GeoSpoof selbst alles in Ordnung — etwas in deinem normalen Profil stört, fast immer ein Datenschutz-Tool oder eine Änderung in about:config. Die nächsten beiden Schritte decken das ab.",
          action: "",
        },
        {
          title: "Deaktiviere konkurrierende Datenschutz-Tools",
          featured: false,
          body: "Härtungs-Tools verändern viele derselben Browser-APIs wie GeoSpoof und können es überschreiben. Deaktiviere vorübergehend alle, die du nutzt, und versuche es dann erneut: Arkenfox, Betterfox, LibreWolf, CanvasBlocker, JShelter, Chameleon, Trace oder jeder Fingerprint-Randomizer.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Prüfe about:config (fortgeschritten)",
          featured: false,
          body: "Wenn du Firefox gehärtet hast, bestätige, dass diese Einstellungen deaktiviert sind, starte dann neu und versuche es erneut. Der strenge erweiterte Schutz vor Aktivitätenverfolgung ist in der Regel in Ordnung und muss nicht geändert werden.",
          details: [
            "privacy.resistFingerprinting",
            "privacy.fingerprintingProtection",
            "privacy.fingerprintingProtection.pbmode",
          ],
          note: "",
          action: "",
        },
        {
          title: "Bestätige es mit einem zweiten Fingerprint-Test",
          featured: false,
          body: "Tests messen unterschiedliche APIs und manche sind schlicht fehlerhaft. Bevor du GeoSpoof die Schuld gibst, überprüfe das Ergebnis mit einem anderen angesehenen Test — wir empfehlen den Bereich Region von arkenfox' TZP.",
          details: [],
          note: "",
          action: "tzpTest",
        },
      ],
    },
    commonIssues: "Weitere häufige Fragen",
    faqs: [
      {
        id: "vpn-sync",
        q: "Die VPN-Synchronisierung zeigt eine Zeitüberschreitung oder einen Netzwerkfehler",
        a: "Die VPN-Synchronisierung ruft einige öffentliche IP-Geolocation-Dienste auf, um die Ausgangsregion deines VPN zu erkennen. Manche VPNs oder Firewalls blockieren ausgehende Anfragen an diese Dienste. Versuche, die Firewall oder den Kill Switch deines VPN vorübergehend zu deaktivieren. Falls das Problem bestehen bleibt, nutze stattdessen die Reiter Stadt suchen oder Koordinaten eingeben, um deinen Standort manuell festzulegen.",
      },
      {
        id: "specific-site",
        q: "Eine bestimmte Website wird nicht gefälscht",
        a: "Manche Websites nutzen serverseitige Standorterkennung anhand deiner IP-Adresse statt der Geolocation-API des Browsers. GeoSpoof überschreibt nur Browser-APIs — es ändert nicht deine IP-Adresse. Für vollständige Standortkonsistenz nutze GeoSpoof zusammen mit einem VPN, das auf dieselbe Region zeigt.",
      },
      {
        id: "mobile",
        q: "Die Erweiterung funktioniert auf dem Desktop, aber nicht auf meinem Handy",
        a: "Unter Firefox für Android wird die Erweiterung ab Firefox 140 vollständig unterstützt. Unter Safari auf iOS und macOS ist die Erweiterung über den App Store verfügbar — tippe auf das Puzzleteil-Symbol in der Adressleiste und aktiviere GeoSpoof für die Website, die du schützen möchtest. Chrome für iOS und Android unterstützt keine Erweiterungen.",
      },
      {
        id: "webrtc",
        q: "Der WebRTC-Schutz ist nicht verfügbar / ausgegraut",
        a: "Der WebRTC-Schutz nutzt eine Datenschutz-API des Browsers, die nicht auf allen Plattformen verfügbar ist. Er wird von Firefox und Chromium-basierten Browsern auf dem Desktop unterstützt. In Safari oder Firefox für Android ist er nicht verfügbar.",
      },
      {
        id: "extensions-page",
        q: 'Ich sehe „Erweiterungen können auf dieser Seite nicht ausgeführt werden"',
        a: "Browser verhindern, dass Erweiterungen auf internen Seiten wie about:blank, chrome://, about:newtab und den Seiten der Erweiterungs-Stores laufen. Das ist eine Sicherheitsgrenze des Browsers, die sich nicht umgehen lässt. GeoSpoof funktioniert auf allen normalen Websites.",
      },
    ],
    copy: "Kopieren",
    copied: "✓ Kopiert",
    copyAria: "E-Mail-Adresse kopieren",
    stillNeedHelp: "Brauchst du noch Hilfe?",
    contactBody:
      "Schreib uns eine E-Mail und wir melden uns innerhalb von ein bis zwei Tagen.",
    contactChecklistLead:
      "Gib diese Angaben mit, damit wir schneller helfen können:",
    contactChecklist: [
      "Firefox-Version",
      "Betriebssystem",
      "GeoSpoof-Version",
      "VPN-Anbieter (falls zutreffend)",
      "Die Fingerprint-Testseite, die du nutzt",
      "Ein Screenshot des Ergebnisses",
      "Ob die Fälschung in einem frischen Firefox-Profil funktioniert",
    ],
    reportBugsLead: "Du kannst Fehler auch melden auf ",
  },
  about: {
    meta: {
      title: "Über GeoSpoof — Wer es entwickelt | GeoSpoof",
      description:
        "GeoSpoof ist ein quelloffener Standort- und Zeitzonenfälscher, entwickelt von Anthony Sgro — keine Konten, kein Tracking und ehrlich darüber, was er tut.",
      ogTitle: "Über GeoSpoof",
    },
    greeting: "👋 Hi, ich bin Anthony",
    tagline: "Ich entwickle GeoSpoof.",
    githubAria: "Anthony Sgro auf GitHub",
    linkedinAria: "Anthony Sgro auf LinkedIn",
    p1a: "Ich bin Softwareentwickler, und GeoSpoof begann als ",
    p1strong: "etwas, das ich für mich selbst wollte",
    p1b: ": eine einfache Möglichkeit, den Standort und die Zeitzone zu steuern, die mein Browser preisgab, ohne mich für irgendetwas anzumelden oder meine Daten noch einer weiteren Firma zu geben. Daraus wurde ein Tool, das viele Menschen inzwischen täglich nutzen, was mich immer noch ziemlich verblüfft.",
    p2a: "Es ist quelloffen, ",
    p2strong: "ohne Konten und ohne Anmeldung",
    p2b: ". Deine Einstellungen bleiben einfach in deinem Browser. Und falls du je neugierig bist, was es tatsächlich tut, ist der Code öffentlich und die ",
    verifyLink: "Überprüfungsseite",
    p2c: " zeigt dir genau, was Websites über dich lesen können.",
    p3a: "Es gibt eine optionale Pro-Stufe für die ",
    p3strong: "zusätzlichen Power-Funktionen",
    p3b: ", während die alltägliche Fälschung kostenlos bleibt.",
    p4a: "Hast du eine Frage, eine Idee, oder willst du einfach ",
    p4em: "Hallo sagen",
    p4b: "? Die ",
    supportLink: "Support-Seite",
    p4c: " erreicht mich direkt, oder finde mich oben auf GitHub und LinkedIn. Danke fürs Vorbeischauen.",
  },
  spoofTimezone: {
    meta: {
      title:
        "Fälsche die Zeitzone deines Browsers — kostenlose Erweiterung | GeoSpoof",
      description:
        "Ändere oder fälsche die Zeitzone deines Browsers, damit sie zu jedem Standort passt. GeoSpoof überschreibt Date, Intl und Temporal, damit deine Uhr deine echte Region nicht verraten kann.",
      ogTitle: "Fälsche die Zeitzone deines Browsers",
    },
    hero: {
      breadcrumbHome: "Start",
      breadcrumb: "Zeitzone fälschen",
      badge: "Zeitzonenfälschung",
      headingPre: "Fälsche die ",
      headingEmphasis: "Zeitzone",
      introPre:
        "Websites lesen deine Zeitzone in dem Moment aus, in dem eine Seite lädt — ohne Berechtigungsabfrage — über ",
      introMid: " und ",
      introPost:
        ". GeoSpoof überschreibt sie, damit deine Uhr zum Standort passt, den du wählst, und nicht zu dem, wo du wirklich bist.",
      ctaFallback: "GeoSpoof kostenlos holen",
      testTimezone: "Teste deine Zeitzone",
    },
    whatLeaks: {
      heading: "Was dein Browser preisgibt",
      intro:
        "Anders als die Geolocation-API fragen die Zeitzonen-Schnittstellen nie nach einer Berechtigung — sie antworten in dem Moment, in dem eine Seite lädt. Eine einzige nicht passende Uhr kann einen gefälschten GPS-Standort zunichtemachen.",
      reveals1: "Gibt einen IANA-Namen wie America/New_York zurück.",
      reveals2: "Gibt deinen UTC-Versatz in Minuten zurück.",
      surface3Api: "Temporal und Dokument-Zeitstempel",
      reveals3:
        "Neuere Zeit-APIs und Seiten-Zeitstempel legen dieselbe Zone offen.",
    },
    howTo: {
      heading: "So fälschst du deine Zeitzone",
      schemaName: "So fälschst du die Zeitzone deines Browsers",
      schemaDesc:
        "Ändere die Zeitzone, die dein Browser an Websites meldet, ohne deine Systemuhr zu ändern, mit der kostenlosen GeoSpoof-Erweiterung.",
      steps: [
        {
          name: "GeoSpoof installieren",
          text: "Füge die kostenlose GeoSpoof-Erweiterung für deinen Browser hinzu — Firefox, Chrome, Brave, Edge oder Safari.",
        },
        {
          name: "Standort festlegen",
          text: "Suche nach einer Stadt, gib Koordinaten ein oder nutze die VPN-Synchronisierung, um sie an die Ausgangsregion deines VPN anzugleichen.",
        },
        {
          name: "Zeitzone gleicht sich automatisch an",
          text: "GeoSpoof überschreibt Date, Intl.DateTimeFormat und Temporal, damit jede uhrbasierte API die Zeitzone des von dir gewählten Standorts meldet.",
        },
        {
          name: "Prüfe, ob es funktioniert hat",
          text: "Öffne die GeoSpoof-Überprüfungsseite, um zu bestätigen, dass deine gemeldete Zeitzone zu deinem gefälschten Standort passt.",
        },
      ],
    },
    whyItMatters: {
      heading: "Ein gefälschter Standort braucht eine passende Uhr",
      body: "Ein VPN verschiebt deine IP und GeoSpoof verschiebt deine GPS-Koordinaten — aber wenn deine Zeitzone weiterhin deine echte Region anzeigt, verrät dich die Diskrepanz. GeoSpoof hält deine Zeitzone automatisch an deinen gewählten Standort angeglichen und gleicht sie neu an, wenn dein VPN die Ausgangsserver wechselt, damit deine Geolocation, deine Zeitzone und deine IP dieselbe Geschichte erzählen.",
      blogLinkLead: "Willst du in die technischen Details eintauchen? ",
      blogLinkText: "Lies, warum deine Zeitzone deinen Standort verrät",
    },
    faq: {
      heading: "Häufig gestellte Fragen",
      items: [
        {
          q: "Wie ändere ich die Zeitzone meines Browsers?",
          a: "Browser übernehmen ihre Zeitzone von deinem Betriebssystem, und die meisten lassen dich sie nicht pro Website überschreiben. GeoSpoof ändert die Zeitzone, die dein Browser an Websites meldet, ohne deine Systemuhr anzutasten: installiere die Erweiterung, lege einen Standort fest, und sie überschreibt die JavaScript-Zeitzonen-APIs entsprechend.",
        },
        {
          q: "Kann ich meine Zeitzone fälschen, ohne meine Systemuhr zu ändern?",
          a: "Ja. GeoSpoof arbeitet auf der Ebene der Browser-APIs, ändert also, was Websites lesen (Intl.DateTimeFormat, Date, Temporal), während die tatsächliche Uhr und die Systemeinstellungen deines Computers genau so bleiben, wie sie sind.",
        },
        {
          q: "Ändert ein VPN die Zeitzone meines Browsers?",
          a: "Nein. Ein VPN ändert nur deine IP-Adresse. Dein Browser meldet weiterhin seine eigene Zeitzone von deinem Betriebssystem, sodass ein VPN in einem anderen Land mit deiner Heimatzeitzone eine leicht erkennbare Diskrepanz ist. GeoSpoof gleicht die Zeitzone an deinen gefälschten Standort an, um diese Lücke zu schließen.",
        },
        {
          q: "Warum muss meine Zeitzone zu meinem Standort passen?",
          a: "Wenn du deinen GPS-Standort fälschst oder ein VPN nutzt, aber deine Zeitzone auf deiner echten Region belässt, widersprechen sich beide — und diese Diskrepanz ist ein häufiges, leicht erkennbares Indiz. Deine Zeitzone an deinen gewählten Standort anzugleichen sorgt dafür, dass jedes Signal dieselbe Geschichte erzählt.",
        },
        {
          q: "Fälscht GeoSpoof die Zeitzone automatisch?",
          a: "Ja. Wenn du einen Standort festlegst oder mit deinem VPN synchronisierst, ermittelt GeoSpoof die korrekte Zeitzone für diese Koordinaten und wendet sie automatisch an — auch wenn dein VPN die Ausgangsserver wechselt.",
        },
      ],
    },
  },
  verify: {
    meta: {
      title:
        "Browser-Standorttest — Sieh, was Websites über dich wissen | GeoSpoof",
      description:
        "Kostenloser Browser-Standorttest. Sieh die Geolocation, Zeitzone und IP, die Websites gerade über dich lesen — und ob dein Browser deinen echten Standort verrät.",
    },
    eyebrow: "Überprüfung",
    heading: "Was Websites über dich sehen können",
    refresh: "Aktualisieren",
    refreshAria:
      "Aktualisieren — lade die Seite neu, um deine aktuellsten Werte zu sehen",
    introMobile: "Live-Werte, die Websites gerade über dich lesen können.",
    introDesktop:
      "Live-Werte deines Browsers gerade jetzt — der Standort, die Zeitzone und die IP, die Websites lesen können. Mit aktivem GeoSpoof spiegeln sie deinen gefälschten Standort statt deines echten wider.",
    vpnSyncNote:
      "Nutzt du die automatische VPN-Synchronisierung? Änderungen können bis zu 10 Sekunden dauern — tippe auf Aktualisieren, um den neuesten Stand zu sehen.",
    rows: {
      geolocation: "Geolocation",
      timezone: "Zeitzone",
      currentTime: "Aktuelle Uhrzeit",
      ipAddress: "IP-Adresse",
      webrtc: "WebRTC",
      waitingPermission: "Warte auf Berechtigung…",
      blockedDenied: "Blockiert / verweigert",
      lookingUp: "Suche…",
      lookupFailed: "Suche fehlgeschlagen",
      probing: "Prüfe…",
      noLeak: "Kein IP-Leck erkannt",
    },
    vpnCard: {
      line1:
        "Deine IP-Adresse ist das eine Signal, das GeoSpoof nicht ändern kann. Nur ein VPN kann das.",
      line2: "Das von uns empfohlene gibt es mit bis zu {discount} Rabatt.",
      cta: "Sichere deine IP mit Proton VPN",
      priceNote: "Bis zu {discount} Rabatt",
      guaranteeNote: "30 Tage Garantie",
    },
    apiSection: {
      eyebrow: "Browser-API-Oberfläche",
      description:
        "Zentrale Fingerprinting-Oberflächen, die Angreifer prüfen. Klappe eine beliebige Gruppe auf, um die Werte zu sehen, die sie erhalten — sie sollten alle dieselbe Geschichte erzählen.",
    },
    supportLead: "Siehst du etwas Falsches oder ein unerwartetes Ergebnis? ",
    supportLink: "Support erhalten",
    verdict: {
      running: "Prüfungen laufen…",
      runningSub: "Lese deinen Browser aus und prüfe auf Lecks.",
      allGood: "Alle Prüfungen bestanden",
      allGoodSub: "Nichts, was wir geprüft haben, verrät dich.",
      exposed: "Einige Signale sind offengelegt",
      problemWebrtc: "WebRTC verrät deine echte IP",
      problemGeo: "Standort passt nicht zur IP",
      problemTz: "Zeitzone passt nicht zur IP",
      crossRef:
        "Eine Website, die diese Signale abgleicht, könnte dich markieren.",
      installFree: "GeoSpoof kostenlos installieren",
      alreadyHave: "Hast du GeoSpoof bereits?",
    },
    dialog: {
      title: "Läuft GeoSpoof bereits?",
      description: "Eine kurze Checkliste klärt fast jedes markierte Signal.",
      ipMismatchLocation: "IP passt nicht zu deinem Standort?",
      ipMismatchTimezone: "IP passt nicht zu deiner Zeitzone?",
      ipMismatchBody:
        "Das ist zu erwarten, wenn die VPN-Synchronisierung aus ist — GeoSpoof gleicht deine IP nur an, wenn du sie einschaltest. Falls du deine echte IP behalten wolltest, funktioniert das wie vorgesehen.",
      autoSyncBold: "Gerade die automatische VPN-Synchronisierung aktiviert?",
      autoSyncBody:
        "Gib ihr nach einer Aktualisierung bis zu ~10 Sekunden, um aufzuholen, und prüfe dann erneut — die automatische Synchronisierung ist nicht sofort wie die manuelle.",
      updateBold: "Aktualisiere auf die neueste Version.",
      updateBody: "Neue Fingerprinting-Tricks werden laufend gepatcht. ",
      downloadOptions: "Download-Optionen ansehen",
      checkSiteBold: "Prüfe, ob es für diese Website aktiv ist.",
      checkSiteBody:
        "Sieh dir das Symbol in der Symbolleiste an; wenn du per Zulassungs- oder Sperrliste einschränkst, nimm diese Website auf.",
      reloadBold: "Nach dem Aktivieren oder Aktualisieren neu laden.",
      reloadBody:
        "Manche Oberflächen greifen erst bei einem frischen Seitenladevorgang.",
      stillStuck: "Kommst du nicht weiter? Kontaktiere den Support",
      gotIt: "Verstanden",
    },
    faq: {
      heading: "Häufig gestellte Fragen",
      items: [
        {
          q: "Was ist die Geolocation meines Browsers?",
          a: "Die Geolocation deines Browsers ist der Breiten- und Längengrad, den er über die JavaScript-Geolocation-API an Websites übergibt. Die Karte und die Koordinaten oben zeigen genau, was Websites lesen, wenn sie fragen, wo du bist. Mit aktivem GeoSpoof ist das dein gefälschter Standort statt deines echten.",
        },
        {
          q: "Können Websites meinen echten Standort sehen, selbst wenn ich ein VPN nutze?",
          a: "Ja. Ein VPN ändert nur deine IP-Adresse. Dein Browser meldet weiterhin seine eigene Geolocation auf GPS-Ebene, die System-Zeitzone und das Gebietsschema — und WebRTC kann deine echte IP komplett verraten. Wenn diese Signale nicht mit dem Ausgangsstandort deines VPN übereinstimmen, kann eine Website merken, dass etwas nicht stimmt. Diese Seite markiert genau solche Diskrepanzen.",
        },
        {
          q: "Warum passt meine Zeitzone nicht zu meiner IP-Adresse?",
          a: "Deine Zeitzone kommt von deinem Betriebssystem, während der Standort deiner IP von deinem Netzwerk oder VPN kommt. Wenn du über ein VPN in einem anderen Land verbindest, aber deine Systemuhr auf deiner Heimatzeitzone belässt, passen die beiden nicht zusammen — ein häufiges, leicht erkennbares Indiz. GeoSpoof gleicht deine Zeitzone an deinen gefälschten Standort an, um diese Lücke zu schließen.",
        },
        {
          q: "Was ist ein WebRTC-Leck?",
          a: "WebRTC ist eine Browserfunktion für Echtzeit-Audio, -Video und -Daten. Sie kann deine echten öffentlichen und lokalen IP-Adressen direkt an eine Website verraten — dein VPN umgehend — sofern sie nicht blockiert wird. Die WebRTC-Prüfung oben sucht nach diesem Leck und meldet jede Adresse, die sie offenlegen kann.",
        },
        {
          q: "Ist dieser Browser-Standorttest kostenlos?",
          a: "Ja. Der Test läuft vollständig in deinem Browser, kostet nichts und erfordert kein Konto. Er liest dieselben Signale, die jede Website lesen kann, und zeigt sie dir in verständlicher Sprache zurück.",
        },
      ],
    },
  },
  engineLevel: {
    meta: {
      title:
        "Chromes Leiste „Dieser Browser wird gerade debuggt“ ausblenden | GeoSpoof",
      description:
        "Die Fälschung auf Engine-Ebene von GeoSpoof nutzt Chromes Debugger-API, daher zeigt Chrome eine Debugging-Leiste. Hier erfährst du, was das bedeutet, warum es sicher ist und wie du sie ausblendest.",
      ogTitle: "Chromes Leiste „Dieser Browser wird gerade debuggt“ ausblenden",
    },
    hero: {
      breadcrumbHome: "Start",
      breadcrumb: "Fälschung auf Engine-Ebene",
      badge: "Chrome · Fälschung auf Engine-Ebene",
      headingPre: "Blende Chromes Leiste ",
      headingEmphasis: "„Dieser Browser wird gerade debuggt“",
      headingPost: " aus",
      intro:
        "Chrome zeigt eine Leiste „Dieser Browser wird gerade debuggt“, solange die Fälschung auf Engine-Ebene aktiv ist. Sie ist harmlos — hier erfährst du, wie du sie ausblendest.",
      ctaHowTo: "So blendest du die Leiste aus",
      ctaFallback: "GeoSpoof kostenlos holen",
      figureAlt:
        "Chrome zeigt oben im Fenster eine Benachrichtigungsleiste „GeoSpoof hat begonnen, diesen Browser zu debuggen“, solange die Fälschung auf Engine-Ebene aktiv ist",
      figCaption:
        "Die Leiste „Dieser Browser wird gerade debuggt“, die Chrome zeigt, solange die Fälschung auf Engine-Ebene aktiv ist.",
    },
    whatBar: {
      heading: "Was die Leiste bedeutet",
      intro:
        "Die Fälschung auf Engine-Ebene wendet deine Zeitzone auf Browserebene an, bevor das erste Skript einer Seite läuft, sodass sie auch Hintergrund-Worker abdeckt. Um so tief zu greifen, nutzt GeoSpoof Chromes Debugger-API — und Chrome kündigt das mit einer Benachrichtigungsleiste an.",
      point1Title: "Es ist ein Standardhinweis von Chrome",
      point1Body:
        "Chrome zeigt die Leiste für jede Erweiterung, die die Debugger-API nutzt — dieselbe API, die die DevTools verwenden. Sie erscheint in dem Moment, in dem sich GeoSpoof verbindet, nicht weil etwas schiefgelaufen ist.",
      point2Title: "GeoSpoof legt nur eine Zeitzonen-Überschreibung fest",
      point2Body:
        "Die Debugger-Verbindung wird ausschließlich dazu genutzt, deine gefälschte Zeitzone über Frames und Worker hinweg anzuwenden. Sie liest weder deine Seiteninhalte noch deine Tastatureingaben oder dein Surfverhalten — und der Code ist quelloffen.",
      point3Title: "Die Leiste ist kosmetisch",
      point3Body:
        "Sie ändert nichts daran, wie Websites dich sehen. Sie auszublenden dient allein dazu, den Streifen oben im Fenster zu entfernen.",
    },
    howTo: {
      heading: "So blendest du die Leiste aus",
      introPre: "Starte Chrome mit dem Parameter ",
      introPost:
        ". Beende Chrome zuerst und folge dann den Schritten für dein System.",
    },
    guides: {
      win: {
        step1: "Schließe alle Chrome-Fenster.",
        step2:
          "Klicke mit der rechten Maustaste auf die Chrome-Verknüpfung, die du nutzt (Taskleiste, Desktop oder Startmenü), und wähle Eigenschaften.",
        step3a: "Lass im Feld ",
        step3strong: "Ziel",
        step3mid: " den in Anführungszeichen stehenden Pfad zu ",
        step3code: "chrome.exe",
        step3end:
          " unverändert und füge den Parameter nach dem schließenden Anführungszeichen hinzu (beachte das führende Leerzeichen).",
        step4: "Klicke auf OK und öffne Chrome dann über diese Verknüpfung.",
        note: "Wiederhole das für jede Verknüpfung, über die du Chrome startest (Taskleiste und Startmenü sind separate Verknüpfungen).",
      },
      mac: {
        step1: "Beende Chrome vollständig (⌘Q).",
        step2: "Öffne das Terminal und führe den folgenden Befehl aus.",
        step3a:
          "Chrome öffnet sich ohne die Leiste erneut. Um es jedes Mal so zu starten, speichere den Befehl als Automator-",
        step3strong: "Programm",
        step3end: " oder als Shell-Alias.",
      },
      linux: {
        step1: "Schließe Chrome.",
        step2:
          "Starte es mit dem Parameter oder füge den Parameter zur Zeile Exec= deines .desktop-Starters für Chrome hinzu, um es dauerhaft zu machen.",
        note: "Verwende chromium statt google-chrome, wenn du Chromium nutzt.",
      },
    },
    permanent: {
      heading: "Dauerhaft machen",
      bodyPre:
        "Der Parameter gilt nur für Starts, die ihn enthalten, daher kehrt die Leiste zurück, wenn du Chrome anders öffnest. Um sie dauerhaft ausgeblendet zu halten, füge ",
      bodyMid:
        " der Verknüpfung oder dem Starter hinzu, über die du Chrome täglich öffnest — dem Feld Ziel der Windows-Verknüpfung, einem macOS-Starterprogramm oder deiner Linux-Datei ",
      bodyDesktopCode: ".desktop",
      bodyEnd: ".",
      body2Pre:
        "Willst du dir die Mühe sparen? Lass die Fälschung auf Engine-Ebene aus — der Standardschutz von GeoSpoof fälscht weiterhin deinen ",
      locationLink: "Standort",
      body2Mid: " und deine ",
      timezoneLink: "Zeitzone",
      body2End: " ganz ohne Debugger-Leiste.",
    },
    faq: {
      heading: "Häufig gestellte Fragen",
      items: [
        {
          q: "Warum sagt GeoSpoof, es „debugge“ meinen Browser?",
          a: "Die Fälschung auf Engine-Ebene nutzt Chromes Debugger-API (das Chrome DevTools Protocol) — denselben Mechanismus, den die eigenen DevTools deines Browsers verwenden — um deine Zeitzone tiefer im Browser festzulegen, als es eine normale Erweiterung kann. Immer wenn sich eine Erweiterung mit dieser API verbindet, zeigt Chrome eine Leiste „Dieser Browser wird gerade debuggt“. Das ist ein Standardhinweis von Chrome, kein Zeichen, dass etwas nicht stimmt.",
        },
        {
          q: "Ist das sicher? Liest GeoSpoof meine Daten?",
          a: "GeoSpoof nutzt die Debugger-Verbindung nur, um eine Zeitzonen-Überschreibung anzuwenden. Es liest weder deine Seiteninhalte noch deine Tastatureingaben oder dein Surfverhalten. GeoSpoof ist quelloffen, du kannst auf GitHub also genau nachvollziehen, was es sendet. Falls du es lieber nicht nutzen möchtest, lass die Fälschung auf Engine-Ebene aus, und der Standardschutz von GeoSpoof fälscht weiterhin deinen Standort und deine Zeitzone.",
        },
        {
          q: "Wie blende ich die Leiste „Dieser Browser wird gerade debuggt“ aus?",
          a: "Starte Chrome mit dem Parameter {flag}. Unter Windows füge ihn dem Feld Ziel deiner Chrome-Verknüpfung hinzu; unter macOS starte Chrome mit diesem Parameter aus dem Terminal neu (oder speichere es als Starter); unter Linux füge ihn deinem Chrome-Startbefehl oder der .desktop-Datei hinzu. Die Leiste verschwindet, während die Fälschung weiter funktioniert.",
        },
        {
          q: "Kommt die Leiste zurück, wenn ich Chrome neu starte?",
          a: "Ja, sofern du den Parameter nicht in die Verknüpfung oder den Starter einbaust, die du immer nutzt. Der Parameter wirkt sich nur auf Starts aus, die ihn enthalten, sodass die Leiste zurückkehrt, wenn du Chrome anders öffnest. Füge ihn deinem alltäglichen Starter hinzu, damit er dauerhaft bleibt.",
        },
        {
          q: "Warum kann GeoSpoof die Leiste nicht automatisch für mich ausblenden?",
          a: "Die Leiste wird von Chrome selbst gesteuert, und nur ein Browser-Startparameter kann sie abschalten. Erweiterungen können die Kommandozeilen-Parameter von Chrome nicht setzen, daher muss dieser Schritt einmal von dir erledigt werden. Es ist eine bewusste Schutzmaßnahme von Chrome rund um die Debugger-API.",
        },
        {
          q: "Was ist die Fälschung auf Engine-Ebene?",
          a: "Es ist eine nur in Chrome verfügbare GeoSpoof-Option, die deine Zeitzone auf der Ebene der Browser-Engine fälscht statt über ein Seitenskript. Weil sie greift, bevor das erste Skript einer Seite läuft, und Hintergrund-Worker erreicht, schließt sie Zeitzonen-Lecks, die eine Fälschung auf Seitenebene übersehen kann. Die Geolocation nutzt weiterhin die standardmäßige, abfragefreie Methode von GeoSpoof.",
        },
      ],
    },
    schema: {
      howToStep1Name: "Chrome vollständig beenden",
      howToStep1Text:
        "Schließe jedes Chrome-Fenster, damit der Browser vollständig beendet wird — der Parameter gilt nur für einen frischen Start.",
      howToStep2Name: "Chrome mit dem Parameter neu starten",
      howToStep2Text:
        "Starte Chrome mit dem Kommandozeilen-Parameter {flag}, indem du den Schritten für dein Betriebssystem folgst.",
      howToStep3Name: "Dauerhaft machen (optional)",
      howToStep3Text:
        "Füge den Parameter der Verknüpfung oder dem Starter hinzu, die du normalerweise nutzt, damit die Leiste bei jedem Start ausgeblendet bleibt.",
      howToStep4Name: "GeoSpoof erneut öffnen",
      howToStep4Text:
        "Die Fälschung auf Engine-Ebene funktioniert genau wie zuvor — nur die Benachrichtigungsleiste ist weg.",
      howToName:
        "So blendest du Chromes Leiste „Dieser Browser wird gerade debuggt“ aus",
      howToDesc:
        "Blende die Benachrichtigungsleiste aus, die Chrome zeigt, solange die Fälschung auf Engine-Ebene von GeoSpoof aktiv ist, indem du Chrome mit dem Parameter {flag} startest.",
    },
  },
}
