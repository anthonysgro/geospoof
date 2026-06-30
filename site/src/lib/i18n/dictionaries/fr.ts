import type { Dictionary } from "./en"

/**
 * French dictionary.
 *
 * Typed as `Dictionary`, so a missing or misnamed key fails the build. Copy is
 * hand-written (not machine-translated) — Google suppresses thin auto-translated
 * content in local results, so quality matters for the SEO payoff.
 */
export const fr: Dictionary = {
  nav: {
    home: "Accueil",
    features: "Fonctionnalités",
    blog: "Blog",
    support: "Assistance",
    download: "Télécharger",
    buyMeACoffee: "Offrez-moi un café",
    github: "GeoSpoof sur GitHub",
    openMenu: "Ouvrir le menu de navigation",
    brandAria: "GeoSpoof - Accueil",
    mainNavAria: "Navigation principale",
  },
  hero: {
    badge: "Compagnon VPN · Extension",
    headlinePre: "Terminez ce que ",
    headlineEmphasis: "votre VPN",
    headlinePost: " a commencé",
    subhead:
      "Un VPN change votre adresse IP, mais votre navigateur dévoile toujours votre véritable position. GeoSpoof l'aligne automatiquement sur votre VPN — et la garde alignée quand vous changez de serveur.",
    downloadFree: "Télécharger gratuitement",
    seeWhatSitesDetect: "Voyez ce que les sites détectent",
    allPlatforms: "Toutes les plateformes et navigateurs",
    usersSuffix: "utilisateurs",
    firefoxRating: "Firefox",
    mainPhoneAlt: "Application GeoSpoof — vue principale",
    secondaryPhoneAlt: "Application GeoSpoof — vue secondaire",
  },
  footer: {
    groups: {
      guides: "Guides",
      learn: "Comprendre",
      company: "Entreprise",
    },
    links: {
      spoofAllBrowsers: "Falsifier la position : tous les navigateurs",
      spoofChrome: "Falsifier la position dans Chrome",
      spoofFirefox: "Falsifier la position dans Firefox",
      spoofEdge: "Falsifier la position dans Edge",
      spoofSafari: "Falsifier la position dans Safari",
      spoofTimezone: "Falsifier le fuseau horaire",
      needVpn: "Avez-vous besoin d'un VPN ?",
      testProtection: "Testez votre protection",
      engineLevel: "Falsification au niveau du moteur (Chrome)",
      blog: "Blog",
      support: "Assistance",
      about: "À propos",
      privacy: "Politique de confidentialité",
      terms: "Conditions d'utilisation",
      github: "GitHub",
    },
    footerNavAria: "Navigation du pied de page",
    copyright: "© {year} GeoSpoof. Tous droits réservés.",
  },
  languageSwitcher: {
    label: "Langue",
    suggestion: "Cette page est disponible en français.",
    switchAction: "Voir en français",
    dismiss: "Fermer",
  },
  testimonials: {
    eyebrow: "Ce qu'en disent les utilisateurs",
    heading: "Plébiscité par les utilisateurs soucieux de leur vie privée",
    subhead:
      "De vrais avis publiés sur le Chrome Web Store, Firefox Add-ons et l'App Store.",
    starsAria: "5 étoiles sur 5",
    readMoreOn: "Lire d'autres avis sur",
  },
  screenshots: {
    eyebrow: "En action",
    heading: "Fonctionne partout où vous naviguez",
    desktopAlt:
      "L'extension GeoSpoof sur ordinateur — la falsification de position en action",
  },
  demo: {
    eyebrow: "Voyez-la à l'œuvre",
    heading: "Falsifiez votre position en quelques clics",
    videoAria:
      "Démo GeoSpoof — définir une position de navigateur falsifiée avec l'extension",
    unsupported: "Votre navigateur ne prend pas en charge la vidéo intégrée.",
    downloadInstead: "Téléchargez la démo",
    insteadSuffix: "à la place.",
  },
  features: {
    eyebrow: "Fonctionnalités",
    heading: "Tous les signaux, couverts",
    subhead:
      "Les sites web utilisent plusieurs API du navigateur pour repérer votre position. GeoSpoof les neutralise toutes — de façon cohérente, avant l'exécution du moindre script de la page.",
    visual: {
      noIpLeak: "Aucune fuite d'IP",
      noTracking: "Aucun pistage",
      noTelemetry: "Aucune télémétrie",
      vpnExit: "Sortie VPN",
      spoofed: "Falsifiée",
      synced: "synchronisé",
      andMore: "et plus",
    },
    items: {
      geolocation: {
        title: "Falsification de la position",
        description:
          "Remplacez navigator.geolocation pour que les sites voient les coordonnées de votre choix. Cherchez par ville, saisissez des coordonnées à la main ou synchronisez avec votre VPN.",
      },
      timezone: {
        title: "Falsification du fuseau horaire",
        description:
          "Falsifiez Date, Intl.DateTimeFormat et l'API Temporal pour que votre fuseau horaire corresponde à la position choisie.",
      },
      webrtc: {
        title: "Protection WebRTC",
        description:
          "Empêchez les fuites d'IP via WebRTC sur Firefox et Chromium grâce à l'API de confidentialité du navigateur.",
      },
      vpnSync: {
        title: "Synchronisation VPN",
        description:
          "Détectez automatiquement la région de sortie de votre VPN et alignez votre position falsifiée — en un clic.",
      },
      apis: {
        title: "Couverture complète des API",
        description:
          "Chaque API du navigateur qui révèle votre position est couverte — injectée dès document_start, avant l'exécution du moindre script de la page.",
      },
    },
  },
  comparison: {
    eyebrow: "GeoSpoof face aux autres",
    heading: "Bien plus qu'un simple changement de coordonnées",
    subhead:
      "La plupart des outils de falsification ne font qu'une chose : injecter une fausse latitude et une fausse longitude dans le navigateur. GeoSpoof couvre l'ensemble du signal, pour que votre position, votre fuseau horaire et votre IP racontent tous la même histoire.",
    featureHeader: "Fonctionnalité",
    typicalHeader: "Classique",
    yesAria: "Oui",
    limited: "Limité",
    noAria: "Non",
    features: {
      coordinates: "Falsifier la position par coordonnées",
      oneIdentity: "Une identité cohérente sur des dizaines d'API du navigateur",
      citySearch: "Définir votre position par recherche de ville",
      webrtc: "Protection contre les fuites d'IP WebRTC",
      everyBrowser: "Tous les grands navigateurs + tout l'écosystème Apple",
      verification: "Page de vérification intégrée",
      vpnSync: "Synchronisation VPN avec resynchronisation automatique",
      perSite: "Règles par site et favoris enregistrés",
    },
    legend: {
      fullSupport: "Prise en charge complète",
      limitedDetail: " : partielle ou basique",
      notSupported: "Non pris en charge",
    },
    proAria: "Pro sur iPhone et iPad",
    proNote:
      "Pro sur iPhone et iPad. Gratuit sur les navigateurs de bureau et Safari.",
    ctaLead: "Ne nous croyez pas sur parole : ",
    ctaLink: "testez votre protection",
    ctaTail: " et constatez chaque signal par vous-même.",
  },
  compatibility: {
    eyebrow: "Compatibilité",
    heading: "Fonctionne sur tous vos appareils",
    subhead:
      "GeoSpoof fonctionne sur tous les grands navigateurs et plateformes. Une seule extension, une protection cohérente partout.",
    platformHeader: "Plateforme",
    supportedAria: "Pris en charge",
    naAria: "Non applicable",
    notSupportedAria: "Non pris en charge",
    legend: {
      supported: "Pris en charge",
      notSupported: "Non pris en charge",
      na: "N/A — Non applicable",
    },
    footnote:
      "Firefox pour Android nécessite Firefox 140+. Safari nécessite iOS 16+ ou macOS 13+.",
    setupLead: "Guides d'installation par navigateur : falsifiez votre position dans ",
    or: " ou ",
    alsoLead: ". Vous pouvez aussi ",
    timezoneLink: "falsifier le fuseau horaire de votre navigateur",
  },
  featuredPost: {
    eyebrow: "Du blog",
    heading: "À lire",
    allPosts: "Tous les articles",
    minRead: "min de lecture",
    readMore: "Lire la suite",
  },
  download: {
    eyebrow: "Télécharger",
    heading: "Obtenez GeoSpoof gratuitement",
    subhead:
      "Disponible sur tous les grands navigateurs. Sans compte, sans télémétrie, sans pistage.",
    recommendedBadge: "Recommandé pour vous",
    installFree: "Installer gratuitement",
    otherWays: "Autres façons de télécharger",
    stores: {
      firefox: {
        description: "Firefox 140+ sur ordinateur et Android",
        cta: "Ajouter à Firefox",
      },
      chromium: {
        description: "Chrome, Brave et Edge",
        cta: "Ajouter à Chrome",
      },
      apple: {
        description: "Safari sur iOS et macOS",
        cta: "Télécharger sur l'App Store",
      },
    },
    selfHosted: {
      dmg: {
        name: "Téléchargement direct (macOS)",
        description:
          "DMG notarié pour Safari sur macOS. Aucun identifiant Apple requis. Mises à jour manuelles — re-téléchargez pour mettre à jour.",
      },
      xpi: {
        name: "XPI auto-hébergé (Firefox)",
        description:
          "XPI signé pour les forks de Firefox ou les installations manuelles. Mises à jour automatiques via notre manifeste de mise à jour.",
      },
      cta: "Versions GitHub",
    },
  },
  skipLink: {
    toMainContent: "Aller au contenu principal",
  },
  phoneCarousel: {
    embeddedHeading: "Et native sur iPhone et iPad",
    standaloneHeading: "GeoSpoof sur iOS et iPadOS",
    screenshotAlt: "GeoSpoof sur iOS — capture d'écran {n}",
    goToSlide: "Aller à la diapositive {n}",
    getTheApp: "Obtenir l'application",
    appStore: "Télécharger dans l'App Store",
    macAppStore: "Télécharger dans le Mac App Store",
  },
  exposureToast: {
    header: "Ce que voit chaque site",
    exposed: "Exposé",
    visibleToSites: "Visible par les sites",
    location: "Position",
    timezone: "Fuseau horaire",
    address: "Adresse",
    webrtc: "WebRTC",
    publicIpLeaking: "Fuite d'IP publique",
    noLeak: "Aucune fuite",
    yourArea: "votre région",
    hideMyLocation: "Masquer ma position",
    getGeospoof: "Installer GeoSpoof",
    fullReport: "Rapport complet",
    dismiss: "Fermer",
  },
  themeToggle: {
    switchToLight: "Passer en mode clair",
    switchToDark: "Passer en mode sombre",
    changedToLight: "Thème passé en mode clair",
    changedToDark: "Thème passé en mode sombre",
  },
  carousel: {
    previousSlide: "Diapositive précédente",
    nextSlide: "Diapositive suivante",
  },
}
