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
    gps: "GPS",
    pro: "Pro",
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
    headlinePre: "Terminez ce que ",
    headlineEmphasis: "votre VPN",
    headlinePost: " a commencé",
    subhead:
      "Un VPN change votre adresse IP, mais votre navigateur dévoile toujours votre véritable position. GeoSpoof l’aligne automatiquement sur votre VPN — et la maintient alignée quand vous changez de serveur.",
    downloadFree: "Télécharger gratuitement",
    seeWhatSitesDetect: "Voyez ce que les sites détectent",
    allPlatforms: "Tous les navigateurs et toutes les plateformes",
    gpsBadge: "Nouveau",
    gpsHint: "Changez le vrai GPS de votre iPhone",
    usersTrust: "Adopté par {count} utilisateurs",
    usersShort: "{count} utilisateurs",
    firefoxRating: "Firefox",
    mainPhoneAlt: "Application GeoSpoof — écran principal",
    secondaryPhoneAlt: "Application GeoSpoof — écran secondaire",
  },
  products: {
    eyebrow: "Produits",
    heading: "Deux produits, une seule histoire de position",
    subhead:
      "Commencez gratuitement dans votre navigateur. Passez au niveau de l’appareil sur votre iPhone quand votre vrai GPS doit suivre.",
    free: {
      badge: "Gratuit",
      title: "GeoSpoof pour votre navigateur",
      description:
        "Simulez votre géolocalisation, votre fuseau horaire et le WebRTC sur Chrome, Firefox, Edge, Brave et Safari. Sans compte, sans traçage.",
    },
    pro: {
      badge: "Pro",
      title: "GeoSpoof GPS",
      description:
        "Réglez le vrai GPS système de votre iPhone pour qu’il corresponde à votre position simulée — piloté depuis une app compagnon sur Mac.",
      cta: "Découvrir GeoSpoof GPS",
      priceNote: "Dès $1.99/mois — ou $24.99 à vie",
    },
  },
  pro: {
    meta: {
      title: "GeoSpoof Pro — Tarifs et fonctionnalités | GeoSpoof",
      description:
        "GeoSpoof Pro débloque le GPS au niveau de l’appareil sur iPhone, la synchronisation VPN automatique, des widgets, le sélecteur MapKit, des filtres par site et plus encore. Dès $1.99 par mois, ou $24.99 une fois — facturé via l’App Store.",
      ogTitle: "GeoSpoof Pro — Tarifs et fonctionnalités",
    },
    hero: {
      breadcrumbHome: "Accueil",
      breadcrumb: "Pro",
      badge: "GeoSpoof Pro",
      heading: "Tout ce que GeoSpoof sait faire, débloqué",
      subhead:
        "Un seul abonnement débloque les outils avancés de GeoSpoof sur iPhone et iPad — dont GeoSpoof GPS, qui définit la position réelle et système de votre appareil.",
    },
    pricing: {
      heading: "Des tarifs simples",
      cta: "Obtenir GeoSpoof Pro",
      fineprint:
        "Facturé via l’App Store. Les prix peuvent varier selon la région. Annulable à tout moment.",
      monthly: {
        name: "Mensuel",
        price: "$1.99",
        period: "/mois",
        note: "",
        badge: "",
      },
      yearly: {
        name: "Annuel",
        price: "$9.99",
        period: "/an",
        note: "Économisez 58% vs mensuel",
        badge: "Le plus populaire",
      },
      lifetime: {
        name: "À vie",
        price: "$24.99",
        period: "une fois",
        note: "Sans abonnement",
        badge: "Meilleur rapport",
      },
    },
    features: {
      heading: "Ce qui est inclus",
      items: {
        everythingFree:
          "Tout ce que propose l’extension GeoSpoof gratuite — simulation de position et de fuseau horaire, protection WebRTC, sur tous les grands navigateurs",
        gps: "GeoSpoof GPS — définissez le vrai GPS système de votre iPhone (avec l’app compagnon Mac)",
        vpnSync:
          "Synchronisation VPN automatique — votre position suit la région de sortie de votre VPN en arrière-plan",
        widgets:
          "Widgets de l’écran d’accueil et commandes du centre de contrôle",
        mapkit:
          "Sélecteur de position MapKit — placez un repère n’importe où sur la carte",
        filters: "Filtres d’autorisation et de blocage par site",
        advanced: "Réglages avancés et personnalisation fine",
        futureUpdates:
          "Toutes les futures mises à jour, incluses dès leur sortie",
      },
    },
  },
  footer: {
    groups: {
      guides: "Guides",
      learn: "Comprendre",
      company: "Entreprise",
    },
    links: {
      spoofAllBrowsers: "Simuler la position : tous les navigateurs",
      spoofChrome: "Simuler la position dans Chrome",
      spoofFirefox: "Simuler la position dans Firefox",
      spoofEdge: "Simuler la position dans Edge",
      spoofSafari: "Simuler la position dans Safari",
      spoofTimezone: "Simuler le fuseau horaire",
      gps: "GeoSpoof GPS pour Mac",
      pro: "GeoSpoof Pro",
      needVpn: "Avez-vous besoin d’un VPN ?",
      testProtection: "Testez votre protection",
      engineLevel: "Simulation au niveau du moteur (Chrome)",
      blog: "Blog",
      support: "Assistance",
      about: "À propos",
      feedback: "Votre avis",
      privacy: "Politique de confidentialité",
      terms: "Conditions d’utilisation",
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
  storeCta: {
    firefox: "Ajouter à Firefox",
    chrome: "Ajouter à Chrome",
    apple: "Télécharger sur l’App Store",
  },
  legal: {
    englishNote:
      "Le texte juridique ci-dessous n’est disponible qu’en anglais. La version anglaise fait foi.",
    privacy: {
      metaTitle: "Politique de confidentialité | GeoSpoof",
      metaDescription:
        "Politique de confidentialité de GeoSpoof — découvrez comment nous protégeons vos données et respectons votre vie privée.",
      heading: "Politique de confidentialité",
      lastUpdated: "Dernière mise à jour : 3 juillet 2026",
    },
    terms: {
      metaTitle: "Conditions d’utilisation | GeoSpoof",
      metaDescription:
        "Conditions d’utilisation de GeoSpoof — comprenez les conditions régissant votre utilisation de l’extension.",
      heading: "Conditions d’utilisation",
      lastUpdated: "Dernière mise à jour : 10 juillet 2026",
    },
  },
  testimonials: {
    eyebrow: "Ce qu’en disent les utilisateurs",
    heading: "Plébiscité par les utilisateurs soucieux de leur vie privée",
    subhead:
      "De vrais avis publiés sur le Chrome Web Store, Firefox Add-ons et l’App Store.",
    starsAria: "5 étoiles sur 5",
    readMoreOn: "Lire d’autres avis sur",
  },
  screenshots: {
    eyebrow: "En action",
    heading: "Fonctionne partout où vous naviguez",
    desktopAlt:
      "L’extension GeoSpoof sur ordinateur — la simulation de position en action",
  },
  demo: {
    eyebrow: "Voyez-la à l’œuvre",
    heading: "Simulez votre position en quelques clics",
    videoAria:
      "Démo GeoSpoof — définir une position de navigateur simulée avec l’extension",
    unsupported: "Votre navigateur ne prend pas en charge la vidéo intégrée.",
    downloadInstead: "Télécharger la démo",
    insteadSuffix: "à la place.",
  },
  features: {
    eyebrow: "Fonctionnalités",
    heading: "Tous les signaux, couverts",
    subhead:
      "Les sites web utilisent plusieurs API du navigateur pour repérer votre position. GeoSpoof les remplace toutes — de façon cohérente, avant l’exécution du moindre script sur la page.",
    visual: {
      noIpLeak: "Aucune fuite d’IP",
      noTracking: "Aucun pistage",
      noTelemetry: "Aucune télémétrie",
      vpnExit: "Serveur VPN",
      spoofed: "Simulée",
      synced: "synchronisé",
      andMore: "et plus",
    },
    items: {
      geolocation: {
        title: "Simulation de la position",
        description:
          "Remplacez navigator.geolocation pour que les sites voient les coordonnées de votre choix. Cherchez par ville, saisissez des coordonnées à la main ou synchronisez avec votre VPN.",
      },
      timezone: {
        title: "Simulation du fuseau horaire",
        description:
          "Simulez Date, Intl.DateTimeFormat et l’API Temporal pour que votre fuseau horaire corresponde à la position choisie.",
      },
      webrtc: {
        title: "Protection WebRTC",
        description:
          "Empêchez les fuites d’IP via WebRTC sur Firefox et Chromium grâce à l’API de confidentialité du navigateur.",
      },
      vpnSync: {
        title: "Synchronisation VPN",
        description:
          "Détectez automatiquement la région de sortie de votre VPN et alignez votre position simulée — en un clic.",
      },
      apis: {
        title: "Couverture complète des API",
        description:
          "Toutes les API du navigateur susceptibles de révéler votre position sont couvertes — injectées dès `document_start`, avant l’exécution du moindre script sur la page.",
      },
    },
  },
  comparison: {
    eyebrow: "GeoSpoof face aux autres",
    heading: "Bien plus qu’un simple changement de coordonnées",
    subhead:
      "La plupart des outils de simulation ne font qu’une chose : injecter une fausse latitude et une fausse longitude dans le navigateur. GeoSpoof couvre l’ensemble du signal, pour que votre position, votre fuseau horaire et votre IP racontent tous la même histoire.",
    featureHeader: "Fonctionnalité",
    typicalHeader: "Classique",
    yesAria: "Oui",
    limited: "Limité",
    noAria: "Non",
    features: {
      coordinates: "Simuler la position par coordonnées",
      oneIdentity:
        "Une identité cohérente sur des dizaines d’API du navigateur",
      citySearch: "Définir votre position par recherche de ville",
      webrtc: "Protection contre les fuites d’IP WebRTC",
      everyBrowser: "Tous les grands navigateurs + tout l’écosystème Apple",
      verification: "Page de vérification intégrée",
      vpnSync: "Synchronisation VPN avec resynchronisation automatique",
      perSite: "Règles par site et favoris enregistrés",
    },
    legend: {
      fullSupport: "Prise en charge complète",
      limitedDetail: " : partielle ou basique",
      notSupported: "Non pris en charge",
    },
    proAria: "Pro sur iPhone et iPad",
    proNote:
      "Pro sur iPhone et iPad. Gratuit sur les navigateurs de bureau et Safari.",
    ctaLead: "Ne nous croyez pas sur parole : ",
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
    setupLead:
      "Guides d’installation par navigateur : simulez votre position dans ",
    or: " ou ",
    alsoLead: ". Vous pouvez aussi ",
    timezoneLink: "simuler le fuseau horaire de votre navigateur",
  },
  featuredPost: {
    eyebrow: "Du blog",
    heading: "À lire",
    allPosts: "Tous les articles",
    minRead: "min de lecture",
    readMore: "Lire la suite",
  },
  blog: {
    index: {
      metaTitle: "Blog | GeoSpoof",
      metaDescription:
        "Guides et analyses approfondies sur la simulation de la localisation du navigateur, la confidentialité du fuseau horaire, les fuites WebRTC et comment tirer le meilleur de GeoSpoof.",
      heading: "Blog GeoSpoof",
      subhead:
        "Guides et analyses approfondies sur la simulation de la localisation, la confidentialité du fuseau horaire et l’empreinte du navigateur.",
      empty: "Pas encore d’articles — revenez bientôt.",
      minRead: "min de lecture",
    },
    post: {
      breadcrumbHome: "Accueil",
      breadcrumbBlog: "Blog",
      minRead: "min de lecture",
      faqHeading: "Questions fréquentes",
      olderPost: "← Article précédent",
      newerPost: "Article suivant →",
      backToAll: "← Retour à tous les articles",
      englishNote: "Cet article n’est disponible qu’en anglais.",
    },
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
        cta: "Télécharger sur l’App Store",
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
    screenshotAlt: "GeoSpoof sur iOS — capture d’écran {n}",
    goToSlide: "Aller à la diapositive {n}",
    getTheApp: "Obtenir l’application",
    appStore: "Télécharger sur l’App Store",
    macAppStore: "Télécharger sur le Mac App Store",
  },
  exposureToast: {
    header: "Ce que voit chaque site",
    exposed: "Exposé",
    visibleToSites: "Visible par les sites",
    location: "Position",
    timezone: "Fuseau horaire",
    address: "Adresse",
    webrtc: "WebRTC",
    publicIpLeaking: "Fuite d’IP publique",
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
  spoofLocation: {
    hub: {
      metaTitle:
        "Simulez la position de votre navigateur — extension gratuite | GeoSpoof",
      metaDescription:
        "Changez ou simulez la position de votre navigateur dans Chrome, Edge, Firefox ou Safari. GeoSpoof remplace l’API de géolocalisation et le fuseau horaire pour que les sites voient la localisation de votre choix.",
      ogTitle: "Simulez la position de votre navigateur",
      badge: "Simulation de position",
      headingPre: "Changez la ",
      headingEmphasis: "position",
      intro:
        "Les sites web lisent votre position via l’API de géolocalisation du navigateur et votre fuseau horaire — un VPN ne change ni l’un ni l’autre. GeoSpoof remplace les deux pour que les sites voient la position que vous choisissez. Choisissez votre navigateur pour commencer.",
      cardTitle: "Simuler la position dans {name}",
      openGuide: "Ouvrir le guide",
    },
    page: {
      browserBadge: "Extension {name}",
      headingPre: "Simulez votre position dans {name}",
      ctaFallback: "Obtenir GeoSpoof pour {name}",
      testLocation: "Tester votre position",
      breadcrumbHome: "Accueil",
      breadcrumbHub: "Simuler la position",
      howToHeading: "Comment simuler votre position dans {name}",
      stepInstallName: "Installer GeoSpoof pour {name}",
      stepInstallText: "Ajoutez l’extension GeoSpoof gratuite depuis {store}.",
      stepEnableName: "Activer l’extension dans {name}",
      stepSetName: "Définir votre position",
      stepSetText:
        "Cherchez une ville, saisissez des coordonnées ou utilisez la Synchronisation VPN pour faire correspondre la région de sortie de votre VPN.",
      stepReportsName: "{name} indique la position que vous avez choisie",
      stepReportsText:
        "GeoSpoof remplace l’API de géolocalisation et le fuseau horaire (Date, Intl, Temporal) afin que chaque site voie la position que vous avez choisie",
      stepReportsWebrtcSuffix:
        ", et la protection WebRTC empêche votre véritable IP de fuiter",
      webrtcAvailableTitle: "La protection WebRTC est disponible dans {name}.",
      webrtcAvailableBody:
        "GeoSpoof empêche aussi votre véritable IP de fuiter via WebRTC, ce qui peut autrement contourner entièrement un VPN.",
      webrtcUnavailableTitle:
        "Remarque : la protection WebRTC n’est pas disponible dans {name}.",
      webrtcUnavailableBody:
        "La simulation de la position et du fuseau horaire est entièrement prise en charge ; l’API de confidentialité WebRTC sur laquelle GeoSpoof s’appuie n’est pas exposée sur ce navigateur.",
      faqHeading: "Questions fréquentes",
      faqHowQ: "Comment changer ou simuler ma position dans {name} ?",
      faqHowA:
        "Installez l’extension GeoSpoof gratuite, définissez ou modifiez une position (cherchez une ville, saisissez des coordonnées ou synchronisez avec votre VPN), et GeoSpoof remplace les API de géolocalisation et de fuseau horaire dans {name} pour que les sites voient la position choisie plutôt que votre véritable position.",
      faqVpnQ: "Un VPN change-t-il ma position dans {name} ?",
      faqVpnA:
        "Non. Un VPN ne change que votre adresse IP. {name} continue d’indiquer sa propre géolocalisation et le fuseau horaire du système, qui peuvent encore révéler votre véritable région. GeoSpoof simule les signaux du navigateur ; utilisez-le avec un VPN pour une position cohérente.",
      faqFreeQ: "GeoSpoof est-il gratuit pour {name} ?",
      faqFreeA:
        "Oui. GeoSpoof est gratuit et open source. Aucun compte, aucune connexion, aucun pistage — chaque réglage reste sur votre appareil.",
      crossLinkLead: "Vous utilisez un autre navigateur ? Voir ",
      crossLinkText: "modifier votre position dans n’importe quel navigateur",
      schemaSoftwareDesc:
        "Simulez votre géolocalisation et votre fuseau horaire dans {name} avec une extension gratuite et open source.",
    },
    browsers: {
      chrome: {
        storeName: "le Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Chrome communique votre position aux sites via l’API de géolocalisation et votre fuseau horaire via Intl et Date — et un VPN n’y change rien. GeoSpoof remplace ces signaux à l’intérieur de Chrome pour que les sites voient la position que vous choisissez. La même version fonctionne aussi dans Brave, Opera et les autres navigateurs Chromium.",
        enableStep:
          "Épinglez GeoSpoof depuis l’icône en forme de pièce de puzzle (Extensions) dans la barre d’outils de Chrome pour l’avoir à portée de clic.",
        extraFaqQ:
          "GeoSpoof fonctionne-t-il dans Brave et les autres navigateurs Chromium ?",
        extraFaqA:
          "Oui. GeoSpoof s’installe depuis le Chrome Web Store, qui dessert Chrome, Brave, Opera et les autres navigateurs basés sur Chromium. La simulation de la position et du fuseau horaire fonctionne de façon identique sur tous.",
        metaTitle:
          "Simuler votre position dans Chrome — extension gratuite | GeoSpoof",
        metaDescription:
          "Changez votre position dans Chrome avec une extension gratuite. GeoSpoof remplace l’API de géolocalisation et le fuseau horaire pour que les sites voient la localisation de votre choix. Brave aussi.",
        ogTitle: "Simuler votre position dans Chrome",
      },
      edge: {
        storeName: "le Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Microsoft Edge est basé sur Chromium ; il expose donc votre position de la même façon que Chrome — l’API de géolocalisation et le fuseau horaire de votre système. GeoSpoof s’installe depuis le Chrome Web Store, fonctionne dans Edge et remplace ces API pour indiquer la position que vous choisissez. Cela fonctionne pour changer votre position dans Edge sur Windows comme sur macOS.",
        enableStep:
          "Autorisez l’extension depuis le Chrome Web Store lorsque Edge vous le demande, puis épinglez GeoSpoof depuis l’icône Extensions (pièce de puzzle).",
        extraFaqQ: "Puis-je simuler ma position dans Edge sous Windows ?",
        extraFaqA:
          "Oui. GeoSpoof fonctionne dans Edge sous Windows et macOS. Il remplace la position et le fuseau horaire que votre navigateur communique aux sites ; il ne modifie pas les réglages de localisation du système Windows, votre OS reste donc intact.",
        metaTitle:
          "Simuler votre position dans Edge — extension gratuite | GeoSpoof",
        metaDescription:
          "Modifiez votre position dans Microsoft Edge avec une extension gratuite. GeoSpoof remplace l’API de géolocalisation et le fuseau horaire pour que les sites voient la localisation de votre choix.",
        ogTitle: "Simuler votre position dans Edge",
      },
      firefox: {
        storeName: "Firefox Add-ons",
        storeShort: "Firefox Add-ons",
        intro:
          "Firefox transmet aux sites votre position via l’API de géolocalisation et votre région via les API de fuseau horaire, quel que soit le VPN. GeoSpoof s’installe depuis Firefox Add-ons et remplace ces signaux. C’est la seule version qui fonctionne aussi sur Firefox pour Android, ce qui vous permet de modifier votre position sur mobile également.",
        enableStep:
          "Après avoir ajouté GeoSpoof depuis Firefox Add-ons, épinglez-le à la barre d’outils depuis le menu des extensions pour un accès rapide.",
        extraFaqQ: "Puis-je simuler ma position dans Firefox sur Android ?",
        extraFaqA:
          "Oui. Firefox 140+ sur Android prend en charge GeoSpoof, vous pouvez donc simuler la géolocalisation et le fuseau horaire sur votre téléphone — ce que Chrome sur mobile ne peut pas faire, car il ne prend pas en charge les extensions.",
        metaTitle:
          "Simuler votre position dans Firefox — module gratuit | GeoSpoof",
        metaDescription:
          "Changez votre localisation dans Firefox avec un module gratuit et open source. GeoSpoof remplace l’API de géolocalisation et le fuseau horaire pour que les sites voient la position de votre choix.",
        ogTitle: "Simuler votre position dans Firefox",
      },
      safari: {
        storeName: "l’App Store",
        storeShort: "App Store",
        intro:
          "Safari sur iOS, iPadOS et macOS communique votre position et votre fuseau horaire aux sites comme n’importe quel navigateur. GeoSpoof s’installe depuis l’App Store et fonctionne comme une extension Safari, remplaçant ces API pour que les sites voient la position que vous choisissez. La simulation de la position et du fuseau horaire est entièrement prise en charge ; la protection WebRTC n’est pas disponible sur Safari.",
        enableStep:
          "Après l’installation depuis l’App Store, activez GeoSpoof depuis le menu des extensions de Safari (la pièce de puzzle dans la barre d’adresse sur iOS, ou Safari → Réglages → Extensions sur macOS).",
        extraFaqQ:
          "La simulation de position fonctionne-t-elle dans Safari sur iPhone ?",
        extraFaqA:
          "Oui. GeoSpoof est une extension Safari disponible sur l’App Store pour iOS, iPadOS et macOS. Une fois activée pour un site, elle remplace la géolocalisation et le fuseau horaire indiqués par Safari. La protection WebRTC est la seule fonctionnalité non disponible sur Safari.",
        metaTitle:
          "Simuler votre position dans Safari — extension gratuite | GeoSpoof",
        metaDescription:
          "Modifiez votre position dans Safari avec une extension gratuite de l’App Store. GeoSpoof remplace l’API de géolocalisation et le fuseau horaire sur iOS, iPadOS et macOS.",
        ogTitle: "Simuler votre position dans Safari",
      },
    },
  },
  vpn: {
    meta: {
      title:
        "Avez-vous besoin d’un VPN avec GeoSpoof ? Deux couches de confidentialité | GeoSpoof",
      description:
        "GeoSpoof masque la position, le fuseau horaire et le WebRTC que votre navigateur communique. Un VPN sans journaux masque votre IP — le seul signal qu’une extension ne peut pas changer.",
      ogTitle: "Avez-vous besoin d’un VPN avec GeoSpoof ?",
    },
    hero: {
      mapAlt: "Proton VPN masque votre adresse IP",
      badge: "La confidentialité de la position a deux couches",
      headingPre: "Avez-vous besoin d’un VPN avec ",
      headingPost: " ?",
      answer:
        "GeoSpoof masque la position de votre navigateur. Un VPN masque votre IP. Pour une confidentialité complète, il vous faut les deux.",
      disclosureBody:
        "Nous sommes partenaires de Proton VPN. Si vous vous abonnez via notre lien, nous percevons une commission sans coût supplémentaire pour vous.",
      ctaPlans: "Voir les offres Proton VPN",
      partnerPricing: "Jusqu’à {discount} de remise partenaire",
      learnMore: "En savoir plus",
      moneyBack: "Garantie de remboursement de 30 jours",
      platformsAria:
        "Proton VPN est disponible sur Windows, macOS, Linux, iOS et Android",
    },
    twoLayers: {
      heading: "Deux couches, deux outils",
      intro:
        "La confidentialité de la position repose sur deux couches indépendantes. GeoSpoof scelle la couche du navigateur ; un VPN scelle la couche réseau. Simulez l’une mais laissez l’autre, et l’incohérence vous trahit. Un navigateur qui indique Tokyo alors que votre IP pointe encore vers New York est facile à repérer.",
      browserTitle: "La couche du navigateur",
      browserBody:
        "Les sites web lisent votre position via l’API de géolocalisation, votre région via les API de fuseau horaire, et vos IP locales via WebRTC. GeoSpoof remplace tout cela pour qu’ils indiquent la position que vous choisissez.",
      browserWho: "Géré par GeoSpoof",
      networkTitle: "La couche réseau",
      networkBody:
        "Chaque site voit aussi l’adresse IP publique d’où provient votre connexion, qui correspond à une véritable ville. Aucune extension de navigateur ne peut la changer — elle se situe sous le navigateur, au niveau du réseau.",
      networkWho: "Géré par un VPN",
      primerLead:
        "Vous voulez une analyse plus approfondie et neutre ? Jonah Aragon de Privacy Guides propose une présentation claire de ",
      primerLink: "ce qu’un VPN fait réellement et ne fait pas",
    },
    whyProton: {
      eyebrow: "Le VPN en qui nous avons confiance",
      heading: "Pourquoi Proton VPN",
      intro:
        "GeoSpoof est open source et ne conserve aucun journal. En matière de confidentialité, la seule confiance qui vaille est celle que l’on peut vérifier. Proton s’impose les mêmes exigences : des applications open source, une politique sans journaux auditée indépendamment, et une juridiction suisse.",
      reason1Title: "Sans journaux, audité indépendamment",
      reason1Body:
        "La politique sans journaux de Proton a été auditée indépendamment à plusieurs reprises, pas seulement affirmée, et éprouvée par de vraies demandes judiciaires.",
      reason2Title: "Suisse, open source",
      reason2Body:
        "Basé en Suisse, sous une législation stricte sur la vie privée, avec des applications entièrement open source que chacun peut inspecter — la même approche vérifiable que GeoSpoof.",
      reason3Title: "Compatible avec la Synchronisation VPN",
      reason3Body:
        "La Synchronisation VPN de GeoSpoof aligne automatiquement votre position simulée sur la région de sortie de votre VPN — avec Proton, ou tout autre VPN de votre choix.",
      calloutLead: "Ne nous croyez pas sur parole.",
      calloutBodyPre: " Proton est l’un des rares VPN recommandés par ",
      calloutLink: "Privacy Guides",
      calloutBodyPost:
        ", une ressource indépendante et communautaire dédiée à la vie privée. GeoSpoof fonctionne avec n’importe quel VPN, vous n’êtes donc jamais prisonnier ; nous recommandons Proton pour les raisons open source et auditées ci-dessus, mais le bon choix reste celui en qui vous avez confiance.",
    },
    plan: {
      imgAlt: "Écran d’accueil de l’application Proton VPN",
      heading: "Choisissez l’offre qui vous convient",
      body: "GeoSpoof est open source. Pour la couche IP, nous vous orienterions vers Proton VPN Plus. L’offre 2 ans est à {discount} de réduction par rapport au tarif standard de Proton — le prix mensuel le plus bas et le meilleur rapport qualité-prix. Vous préférez l’essayer d’abord ? L’offre mensuelle fonctionne aussi.",
      cta: "Voir les offres Proton VPN",
      unlimitedPre:
        "Vous avez déjà un VPN ou vous voulez plus qu’un outil ? L’offre ",
      unlimitedLink: "Unlimited de Proton",
      unlimitedPost: " regroupe le VPN avec Mail, Pass, Drive et Calendar.",
    },
    inlineDisclosure:
      "À noter — ceci est un lien affilié. Abonnez-vous via ce lien et Proton nous reverse une petite part, sans coût supplémentaire pour vous. C’est ainsi que nous aidons à garder GeoSpoof open source et indépendant.",
    faq: {
      heading: "Questions fréquentes",
      items: [
        {
          q: "Ai-je besoin d’un VPN si j’utilise GeoSpoof ?",
          a: "Pour une confidentialité de position complète, oui — mais pas parce que GeoSpoof serait insuffisant. GeoSpoof change la position, le fuseau horaire et les détails WebRTC que votre navigateur communique aux sites. Le signal le plus fort qui subsiste est votre adresse IP, et seul un VPN peut la changer. Les deux couvrent des couches différentes ; ensemble, ils racontent une histoire cohérente.",
        },
        {
          q: "Puis-je utiliser un autre VPN avec GeoSpoof ?",
          a: "Oui. GeoSpoof fonctionne avec n’importe quel VPN. Rien n’est verrouillé sur Proton, et la Synchronisation VPN fonctionne de la même façon avec tous. Mullvad et IVPN sont d’autres fournisseurs sans journaux bien considérés dans la communauté de la vie privée. Nous recommandons Proton parce qu’il est entièrement open source, audité indépendamment et recommandé par Privacy Guides, mais le choix vous appartient entièrement.",
        },
        {
          q: "Pourquoi GeoSpoof recommande-t-il Proton VPN ?",
          a: "Proton est sans journaux, basé en Suisse, entièrement open source et a passé de nombreux audits indépendants. Ce sont les mêmes valeurs vérifiables et axées sur la vie privée que celles de GeoSpoof. C’est aussi l’un des rares VPN recommandés par Privacy Guides, une ressource indépendante qui n’accepte aucun revenu d’affiliation. La Synchronisation VPN fonctionne avec Proton exactement comme avec n’importe quel autre VPN.",
        },
        {
          q: "Ai-je besoin d’un VPN pour utiliser GeoSpoof ?",
          a: "Non. La simulation au cœur de GeoSpoof fonctionne sans VPN. Un VPN ne fait que masquer votre véritable adresse IP — c’est un outil complémentaire, pas une condition pour utiliser GeoSpoof.",
        },
        {
          q: "GeoSpoof gagne-t-il de l’argent si je m’inscris ?",
          a: "Si vous vous abonnez à Proton via notre lien, Proton nous reverse une partie de la vente, sans coût supplémentaire pour vous. Cela aide à garder GeoSpoof open source et sans publicité. Nous recommandons Proton pour ses mérites (open source, audité indépendamment et recommandé par Privacy Guides), et la commission ne change rien à l’offre qui vous convient réellement le mieux.",
        },
      ],
    },
    disclosure: {
      label: "Divulgation d’affiliation :",
      body: "GeoSpoof est un utilitaire indépendant et open source, sans aucun lien ni approbation de la part de Proton. Lorsque vous achetez une offre via notre recommandation, Proton nous reverse une partie de la vente, sans coût supplémentaire pour vous. Cela aide à garder GeoSpoof gratuit, open source et sans publicité. Nous recommandons Proton pour ses mérites (open source, audité indépendamment et recommandé par Privacy Guides), non pour la commission, et GeoSpoof fonctionne avec n’importe quel VPN de votre choix.",
    },
  },
  support: {
    meta: {
      title: "Assistance GeoSpoof — simulation, Synchro VPN et installation",
      description:
        "Obtenez de l’aide sur GeoSpoof : réparez une simulation de position qui ne fonctionne pas, résolvez les délais d’attente de la Synchronisation VPN, les problèmes WebRTC et l’installation sur navigateur ou mobile — ou contactez notre équipe.",
    },
    heading: "Comment pouvons-nous vous aider ?",
    subhead:
      "La plupart des signalements se ramènent à l’une des causes ci-dessous. Parcourez la liste et arrêtez-vous dès que la simulation fonctionne.",
    symptomsLead: "Que se passe-t-il ?",
    symptoms: [
      {
        label: "La simulation de position ne fonctionne pas",
        target: "troubleshooting",
      },
      {
        label: "La Synchronisation VPN échoue ou expire",
        target: "faq-vpn-sync",
      },
      {
        label: "Ça marche sur ordinateur mais pas sur mon téléphone",
        target: "faq-mobile",
      },
      { label: "Autre chose", target: "questions" },
    ],
    lastUpdatedLabel: "Dernière mise à jour",
    troubleshooting: {
      title: "La simulation ne fonctionne pas sur un site",
      intro:
        "Elles sont classées de la plus fréquente à la moins fréquente. Vous n’aurez sans doute pas besoin d’aller jusqu’au bout.",
      browserNote:
        "GeoSpoof fonctionne aussi sur Chrome, Edge, Brave et Safari. Les étapes ci-dessous sont rédigées pour Firefox, où ces conflits sont les plus fréquents — sur les autres navigateurs, appliquez les réglages équivalents.",
      latestReleaseLabel: "Dernière version",
      latestReleaseCta: "Voir la dernière version sur GitHub",
      badgeActiveLabel: "Active sur cet onglet",
      badgeActiveAlt:
        "Icône GeoSpoof dans la barre d’outils, avec un badge indiquant qu’elle est active sur l’onglet actuel",
      badgeDisabledLabel: "Inactive sur cet onglet",
      badgeDisabledAlt:
        "Icône GeoSpoof dans la barre d’outils, avec un badge indiquant qu’elle ne s’exécute pas sur l’onglet actuel",
      geolocationDeniedAlt:
        "Résultat d’un test d’empreinte affichant « Geolocation: Denied » parce que Firefox a bloqué la demande de position",
      geolocationDeniedCaption:
        "À quoi ressemble une demande de position bloquée sur un test d’empreinte.",
      preserveOffAlt:
        "La fenêtre GeoSpoof avec l’option « Conserver les invites de localisation » désactivée",
      preserveOffCaption:
        "Fenêtre GeoSpoof avec « Conserver les invites de localisation » désactivée.",
      tzpCta: "Ouvrir le test TZP",
      featuredLabel: "Meilleur diagnostic",
      steps: [
        {
          title: "Actualisez l’onglet, ou rouvrez-le",
          featured: false,
          body: "GeoSpoof ne prend effet que sur les pages chargées après son activation. Tout onglet déjà ouvert lorsque vous avez installé, mis à jour ou réactivé GeoSpoof ne sera pas simulé tant qu’il n’est pas rechargé. Actualisez l’onglet que vous testez — si cela ne suffit pas, fermez-le puis rouvrez-le.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Mettez à jour vers la dernière version",
          featured: false,
          body: "De nombreux problèmes sont déjà corrigés dans une version plus récente. Dans la fenêtre, ouvrez Détails → Avancé pour voir votre version, puis comparez-la à la dernière version ci-dessous et mettez à jour via le gestionnaire d’extensions de votre navigateur si vous êtes en retard.",
          details: [],
          note: "",
          action: "latestRelease",
        },
        {
          title: "Vérifiez que GeoSpoof s’exécute sur le site",
          featured: false,
          body: "L’icône de GeoSpoof dans la barre d’outils indique si l’extension est active sur l’onglet actuel. Si elle ne l’est pas, rien n’est simulé — le plus souvent à cause de la portée des sites définie dans l’onglet Filtres.",
          details: [
            "Mode Liste d’autorisation : seuls les sites listés sont simulés — ajoutez le site que vous testez.",
            "Mode Liste de blocage : assurez-vous que le site n’est pas dans la liste.",
            "Ou passez sur « Tous » pour simuler partout.",
          ],
          note: "",
          action: "badgeCheck",
        },
        {
          title: "Réinitialisez l’autorisation de position du site",
          featured: false,
          body: "Si un test affiche « Geolocation: Denied », Firefox bloque la demande — généralement parce que l’invite a été refusée une fois avec « Se souvenir de cette décision » cochée.",
          details: [
            "Cliquez sur l’icône de cadenas dans la barre d’adresse.",
            "Effacez tout blocage mémorisé pour la position, puis rechargez la page.",
            "Dans les paramètres de Firefox, vérifiez que « Bloquer les nouvelles demandes d’accès à votre position » est désactivé.",
            "Si l’option « Conserver les invites de localisation » de GeoSpoof est activée et que vous avez refusé l’invite, autorisez-la ou désactivez l’option pour que GeoSpoof réponde directement.",
          ],
          note: "",
          action: "geolocationDenied",
        },
        {
          title: "Redémarrez votre navigateur",
          featured: false,
          body: "Certaines API du navigateur sont mises en place au démarrage ; une installation, une mise à jour ou un changement de réglage récent peut donc ne prendre effet qu’après avoir entièrement fermé puis rouvert votre navigateur.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Testez dans un profil Firefox tout neuf",
          featured: true,
          body: "Un profil vierge isole GeoSpoof de votre configuration existante.",
          details: [
            "Ouvrez about:profiles et créez un nouveau profil.",
            "Lancez-le, installez GeoSpoof et testez à nouveau le même site.",
          ],
          note: "Si la simulation fonctionne dans le profil vierge, GeoSpoof lui-même n’est pas en cause — quelque chose dans votre profil habituel interfère, presque toujours un outil de confidentialité ou une modification dans about:config. Les deux étapes suivantes traitent ces cas.",
          action: "",
        },
        {
          title: "Désactivez les outils de confidentialité en conflit",
          featured: false,
          body: "Les outils de durcissement modifient bon nombre des mêmes API du navigateur que GeoSpoof et peuvent le supplanter. Désactivez temporairement ceux que vous utilisez, puis réessayez : Arkenfox, Betterfox, LibreWolf, CanvasBlocker, JShelter, Chameleon, Trace, ou tout outil de randomisation d’empreinte.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Vérifiez about:config (avancé)",
          featured: false,
          body: "Si vous avez durci Firefox, vérifiez que ces préférences sont désactivées, puis redémarrez et réessayez. La protection renforcée contre le pistage en mode Strict ne pose généralement pas de problème et n’a pas besoin d’être modifiée.",
          details: [
            "privacy.resistFingerprinting",
            "privacy.fingerprintingProtection",
            "privacy.fingerprintingProtection.pbmode",
          ],
          note: "",
          action: "",
        },
        {
          title: "Confirmez avec un second test d’empreinte",
          featured: false,
          body: "Les tests mesurent des API différentes et certains sont tout simplement bogués. Avant de conclure que GeoSpoof est en cause, vérifiez le résultat sur un autre test réputé — nous recommandons la section Region du TZP d’arkenfox.",
          details: [],
          note: "",
          action: "tzpTest",
        },
      ],
    },
    commonIssues: "Autres questions fréquentes",
    faqs: [
      {
        id: "vpn-sync",
        q: "La Synchronisation VPN affiche un délai d’attente ou une erreur réseau",
        a: "La Synchronisation VPN interroge quelques services publics de géolocalisation d’IP pour détecter la région de sortie de votre VPN. Certains VPN ou pare-feux bloquent les requêtes sortantes vers ces services. Essayez de désactiver temporairement le pare-feu ou le kill switch de votre VPN. Si le problème persiste, utilisez plutôt les onglets Rechercher une ville ou Saisir des coordonnées pour définir votre position manuellement.",
      },
      {
        id: "specific-site",
        q: "Un site web précis n’est pas simulé",
        a: "Certains sites détectent la position côté serveur d’après votre adresse IP plutôt que via l’API de géolocalisation du navigateur. GeoSpoof ne remplace que les API du navigateur — il ne change pas votre adresse IP. Pour une cohérence de position complète, utilisez GeoSpoof avec un VPN pointant vers la même région.",
      },
      {
        id: "mobile",
        q: "L’extension fonctionne sur ordinateur mais pas sur mon téléphone",
        a: "Sur Firefox pour Android, l’extension est entièrement prise en charge à partir de Firefox 140. Sur Safari iOS et macOS, l’extension est disponible sur l’App Store — appuyez sur l’icône en forme de pièce de puzzle dans la barre d’adresse et activez GeoSpoof pour le site à protéger. Chrome sur iOS et Android ne prend pas en charge les extensions.",
      },
      {
        id: "webrtc",
        q: "La Protection WebRTC n’est pas disponible / grisée",
        a: "La Protection WebRTC utilise une API de confidentialité du navigateur qui n’est pas disponible sur toutes les plateformes. Elle est prise en charge sur Firefox et les navigateurs basés sur Chromium sur ordinateur. Elle n’est pas disponible sur Safari ni sur Firefox pour Android.",
      },
      {
        id: "extensions-page",
        q: "Le message « Les extensions ne peuvent pas s’exécuter sur cette page » s’affiche",
        a: "Les navigateurs empêchent les extensions de s’exécuter sur les pages intégrées comme about:blank, chrome://, about:newtab et les pages des boutiques d’extensions. Il s’agit d’une limite de sécurité du navigateur qui ne peut pas être contournée. GeoSpoof fonctionne sur tous les sites web normaux.",
      },
    ],
    copy: "Copier",
    copied: "✓ Copié",
    copyAria: "Copier l’adresse e-mail",
    stillNeedHelp: "Besoin d’aide supplémentaire ?",
    contactBody:
      "Envoyez-nous un e-mail et nous vous répondrons d’ici un jour ou deux.",
    contactChecklistLead:
      "Joignez ces informations pour que nous puissions vous aider plus vite :",
    contactChecklist: [
      "Version de Firefox",
      "Système d’exploitation",
      "Version de GeoSpoof",
      "Fournisseur VPN (le cas échéant)",
      "Le site de test d’empreinte que vous utilisez",
      "Une capture d’écran du résultat",
      "Si la simulation fonctionne dans un profil Firefox tout neuf",
    ],
    reportBugsLead: "Vous pouvez aussi signaler des bugs sur ",
  },
  about: {
    meta: {
      title: "À propos de GeoSpoof — qui le développe | GeoSpoof",
      description:
        "GeoSpoof est un outil open source de simulation de position et de fuseau horaire développé par Anthony Sgro — sans compte, sans pistage, et honnête sur ce qu’il fait.",
      ogTitle: "À propos de GeoSpoof",
    },
    greeting: "👋 Salut, je suis Anthony",
    tagline: "Je développe GeoSpoof.",
    githubAria: "Anthony Sgro sur GitHub",
    linkedinAria: "Anthony Sgro sur LinkedIn",
    p1a: "Je suis développeur logiciel, et GeoSpoof a commencé comme ",
    p1strong: "quelque chose que je voulais pour moi-même",
    p1b: " : un moyen simple de contrôler la position et le fuseau horaire que mon navigateur communiquait, sans m’inscrire à quoi que ce soit ni confier mes données à une énième entreprise. C’est devenu un outil que beaucoup de gens utilisent aujourd’hui au quotidien, ce qui m’étonne encore un peu.",
    p2a: "Il est open source, ",
    p2strong: "sans compte ni inscription",
    p2b: ". Vos réglages restent simplement dans votre navigateur. Et si vous êtes curieux de ce qu’il fait réellement, le code est public et la ",
    verifyLink: "page de vérification",
    p2c: " vous montre exactement ce que les sites peuvent lire à votre sujet.",
    p3a: "Il existe une offre Pro optionnelle pour les ",
    p3strong: "fonctionnalités avancées",
    p3b: ", tandis que la simulation du quotidien reste gratuite.",
    p4a: "Une question, une idée, ou juste envie de ",
    p4em: "dire bonjour",
    p4b: " ? La ",
    supportLink: "page d’assistance",
    p4c: " me joint directement, ou retrouvez-moi sur GitHub et LinkedIn en haut. Merci de votre visite.",
  },
  spoofTimezone: {
    meta: {
      title:
        "Simulez le fuseau horaire de votre navigateur — extension gratuite | GeoSpoof",
      description:
        "Changez ou simulez le fuseau horaire de votre navigateur pour qu’il corresponde à n’importe quelle position. GeoSpoof remplace Date, Intl et Temporal pour que votre horloge ne révèle pas votre véritable région.",
      ogTitle: "Simulez le fuseau horaire de votre navigateur",
    },
    hero: {
      breadcrumbHome: "Accueil",
      breadcrumb: "Simuler le fuseau horaire",
      badge: "Simulation du fuseau horaire",
      headingPre: "Simulez le ",
      headingEmphasis: "fuseau horaire",
      introPre:
        "Les sites web lisent votre fuseau horaire dès le chargement d’une page — sans aucune demande d’autorisation — via ",
      introMid: " et ",
      introPost:
        ". GeoSpoof les remplace pour que votre horloge corresponde à la position que vous choisissez, et non à l’endroit où vous êtes réellement.",
      ctaFallback: "Obtenez GeoSpoof gratuitement",
      testTimezone: "Tester votre fuseau horaire",
    },
    whatLeaks: {
      heading: "Ce que votre navigateur dévoile",
      intro:
        "Contrairement à l’API de géolocalisation, les surfaces de fuseau horaire ne demandent jamais d’autorisation — elles répondent dès le chargement d’une page. Une seule horloge incohérente peut anéantir une position GPS simulée.",
      reveals1: "Renvoie un nom IANA comme America/New_York.",
      reveals2: "Renvoie votre décalage UTC en minutes.",
      surface3Api: "Temporal et horodatages de document",
      reveals3:
        "Les API de temps plus récentes et les horodatages de page exposent le même fuseau.",
    },
    howTo: {
      heading: "Comment simuler votre fuseau horaire",
      schemaName: "Comment simuler le fuseau horaire de votre navigateur",
      schemaDesc:
        "Changez le fuseau horaire que votre navigateur communique aux sites, sans modifier l’horloge de votre système, grâce à l’extension gratuite GeoSpoof.",
      steps: [
        {
          name: "Installer GeoSpoof",
          text: "Ajoutez l’extension GeoSpoof gratuite pour votre navigateur — Firefox, Chrome, Brave, Edge ou Safari.",
        },
        {
          name: "Définir votre position",
          text: "Cherchez une ville, saisissez des coordonnées ou utilisez la Synchronisation VPN pour faire correspondre la région de sortie de votre VPN.",
        },
        {
          name: "Le fuseau horaire s’aligne automatiquement",
          text: "GeoSpoof remplace Date, Intl.DateTimeFormat et Temporal pour que chaque API basée sur l’horloge indique le fuseau horaire de la position que vous avez choisie.",
        },
        {
          name: "Vérifier que ça marche",
          text: "Ouvrez la page de vérification de GeoSpoof pour confirmer que le fuseau horaire indiqué correspond à votre position simulée.",
        },
      ],
    },
    whyItMatters: {
      heading: "Une position simulée a besoin d’une horloge cohérente",
      body: "Un VPN déplace votre IP et GeoSpoof déplace vos coordonnées GPS — mais si votre fuseau horaire indique encore votre véritable région, l’incohérence vous trahit. GeoSpoof garde votre fuseau horaire aligné sur la position que vous avez choisie, automatiquement, et le réaligne quand votre VPN change de serveur de sortie, pour que votre géolocalisation, votre fuseau horaire et votre IP racontent tous la même histoire.",
      blogLinkLead: "Vous voulez l’analyse technique détaillée ? ",
      blogLinkText:
        "Découvrez pourquoi votre fuseau horaire révèle votre position",
    },
    faq: {
      heading: "Questions fréquentes",
      items: [
        {
          q: "Comment changer le fuseau horaire de mon navigateur ?",
          a: "Les navigateurs prennent leur fuseau horaire dans votre système d’exploitation, et la plupart ne permettent pas de le remplacer site par site. GeoSpoof change le fuseau horaire que votre navigateur communique aux sites sans toucher à l’horloge de votre système : installez l’extension, définissez une position, et il remplace les API de fuseau horaire JavaScript en conséquence.",
        },
        {
          q: "Puis-je simuler mon fuseau horaire sans changer l’horloge de mon système ?",
          a: "Oui. GeoSpoof agit au niveau des API du navigateur ; il change donc ce que lisent les sites (Intl.DateTimeFormat, Date, Temporal) tandis que l’horloge réelle et les réglages de votre ordinateur restent exactement tels quels.",
        },
        {
          q: "Un VPN change-t-il le fuseau horaire de mon navigateur ?",
          a: "Non. Un VPN ne change que votre adresse IP. Votre navigateur continue d’indiquer son propre fuseau horaire d’après votre système d’exploitation ; un VPN dans un autre pays avec votre fuseau horaire d’origine est donc une incohérence facile à détecter. GeoSpoof aligne le fuseau horaire sur votre position simulée pour combler cet écart.",
        },
        {
          q: "Pourquoi mon fuseau horaire doit-il correspondre à ma position ?",
          a: "Si vous simulez votre position GPS ou utilisez un VPN mais laissez votre fuseau horaire sur votre véritable région, les deux se contredisent — et cette incohérence est un indice courant et facile à détecter. Aligner votre fuseau horaire sur la position choisie fait que chaque signal raconte la même histoire.",
        },
        {
          q: "GeoSpoof simule-t-il le fuseau horaire automatiquement ?",
          a: "Oui. Lorsque vous définissez une position ou synchronisez avec votre VPN, GeoSpoof détermine le bon fuseau horaire pour ces coordonnées et l’applique automatiquement — y compris lorsque votre VPN change de serveur de sortie.",
        },
      ],
    },
  },
  verify: {
    meta: {
      title:
        "Test de position du navigateur — voyez ce que les sites savent de vous | GeoSpoof",
      description:
        "Test gratuit de position du navigateur. Voyez la géolocalisation, le fuseau horaire et l’IP que les sites lisent sur vous en ce moment — et si votre navigateur dévoile votre véritable position.",
    },
    eyebrow: "Vérification",
    heading: "Ce que les sites peuvent voir de vous",
    refresh: "Actualiser",
    refreshAria:
      "Actualiser — rechargez la page pour voir vos valeurs les plus récentes",
    introMobile:
      "Les valeurs en direct que les sites peuvent lire sur vous en ce moment.",
    introDesktop:
      "Les valeurs en direct de votre navigateur en ce moment — la position, le fuseau horaire et l’IP que les sites peuvent lire. Avec GeoSpoof actif, elles reflètent votre position simulée plutôt que votre véritable position.",
    vpnSyncNote:
      "Vous utilisez la Synchronisation VPN automatique ? Les changements peuvent prendre jusqu’à 10 secondes — appuyez sur Actualiser pour voir la dernière valeur.",
    rows: {
      geolocation: "Géolocalisation",
      timezone: "Fuseau horaire",
      currentTime: "Heure actuelle",
      ipAddress: "Adresse IP",
      webrtc: "WebRTC",
      waitingPermission: "En attente d’autorisation…",
      blockedDenied: "Bloqué / refusé",
      lookingUp: "Recherche en cours…",
      lookupFailed: "Échec de la recherche",
      probing: "Analyse en cours…",
      noLeak: "Aucune fuite d’IP détectée",
    },
    vpnCard: {
      line1:
        "Votre adresse IP est le seul signal que GeoSpoof ne peut pas changer. Seul un VPN le peut.",
      line2:
        "Celui que nous recommandons est à jusqu’à {discount} de réduction.",
      cta: "Sécurisez votre IP avec Proton VPN",
      priceNote: "Jusqu’à {discount} de remise",
      guaranteeNote: "Garantie 30 jours",
    },
    apiSection: {
      eyebrow: "Surface des API du navigateur",
      description:
        "Les principales surfaces d’empreinte que vérifient les attaquants. Développez un groupe pour voir les valeurs qu’ils obtiennent — elles devraient toutes raconter la même histoire.",
    },
    supportLead: "Vous voyez une erreur, ou un résultat inattendu ? ",
    supportLink: "Obtenir de l’aide",
    verdict: {
      running: "Vérifications en cours…",
      runningSub: "Lecture de votre navigateur et recherche de fuites.",
      allGood: "Toutes les vérifications sont passées",
      allGoodSub: "Rien de ce que nous avons vérifié ne vous trahit.",
      exposed: "Certains signaux sont exposés",
      problemWebrtc: "WebRTC dévoile votre véritable IP",
      problemGeo: "La position ne correspond pas à l’IP",
      problemTz: "Le fuseau horaire ne correspond pas à l’IP",
      crossRef: "Un site qui recoupe ces signaux pourrait vous repérer.",
      installFree: "Installer GeoSpoof gratuitement",
      alreadyHave: "Vous avez déjà GeoSpoof ?",
    },
    dialog: {
      title: "Vous utilisez déjà GeoSpoof ?",
      description:
        "Une courte liste de vérifications résout presque chaque signal signalé.",
      ipMismatchLocation: "L’IP ne correspond pas à votre position ?",
      ipMismatchTimezone: "L’IP ne correspond pas à votre fuseau horaire ?",
      ipMismatchBody:
        "C’est normal lorsque la Synchronisation VPN est désactivée — GeoSpoof n’aligne votre IP que lorsque vous l’activez. Si vous vouliez garder votre véritable IP, c’est le comportement attendu.",
      autoSyncBold: "Vous venez d’activer la Synchronisation VPN automatique ?",
      autoSyncBody:
        "Laissez-lui jusqu’à ~10 secondes après une actualisation pour se mettre à jour, puis revérifiez — la synchro automatique n’est pas instantanée comme la synchro manuelle.",
      updateBold: "Passez à la dernière version.",
      updateBody:
        "De nouvelles techniques d’empreinte sont corrigées en continu. ",
      downloadOptions: "Voir les options de téléchargement",
      checkSiteBold: "Vérifiez qu’il est actif pour ce site.",
      checkSiteBody:
        "Regardez l’icône dans la barre d’outils ; si vous filtrez par liste d’autorisation ou de blocage, incluez ce site.",
      reloadBold: "Rechargez après l’activation ou la mise à jour.",
      reloadBody:
        "Certaines surfaces ne s’appliquent qu’au chargement d’une nouvelle page.",
      stillStuck: "Toujours bloqué ? Contactez l’assistance",
      gotIt: "Compris",
    },
    faq: {
      heading: "Questions fréquentes",
      items: [
        {
          q: "Quelle est la géolocalisation de mon navigateur ?",
          a: "La géolocalisation de votre navigateur est la latitude et la longitude qu’il transmet aux sites via l’API de géolocalisation JavaScript. La carte et les coordonnées ci-dessus montrent exactement ce que lisent les sites lorsqu’ils demandent où vous êtes. Avec GeoSpoof actif, il s’agit de votre position simulée plutôt que de votre véritable position.",
        },
        {
          q: "Les sites peuvent-ils voir ma véritable position même si j’utilise un VPN ?",
          a: "Oui. Un VPN ne change que votre adresse IP. Votre navigateur continue d’indiquer sa propre géolocalisation de niveau GPS, le fuseau horaire du système et la langue — et WebRTC peut dévoiler entièrement votre véritable IP. Si ces signaux contredisent la position de sortie de votre VPN, un site peut détecter que quelque chose cloche. Cette page signale précisément ces incohérences.",
        },
        {
          q: "Pourquoi mon fuseau horaire ne correspond-il pas à mon adresse IP ?",
          a: "Votre fuseau horaire provient de votre système d’exploitation, tandis que la position de votre IP provient de votre réseau ou de votre VPN. Si vous vous connectez via un VPN dans un autre pays mais laissez l’horloge de votre système sur votre fuseau d’origine, les deux ne concordent pas — un indice courant et facile à détecter. GeoSpoof aligne votre fuseau horaire sur votre position simulée pour combler cet écart.",
        },
        {
          q: "Qu’est-ce qu’une fuite WebRTC ?",
          a: "WebRTC est une fonctionnalité du navigateur pour l’audio, la vidéo et les données en temps réel. Elle peut révéler vos véritables adresses IP publiques et locales directement à un site web — en contournant votre VPN — à moins d’être bloquée. La vérification WebRTC ci-dessus recherche cette fuite et signale toute adresse qu’elle parvient à exposer.",
        },
        {
          q: "Ce test de position du navigateur est-il gratuit ?",
          a: "Oui. Le test s’exécute entièrement dans votre navigateur, ne coûte rien et ne nécessite aucun compte. Il lit les mêmes signaux que n’importe quel site web peut lire et vous les montre en langage clair.",
        },
      ],
    },
  },
  engineLevel: {
    meta: {
      title:
        "Masquer la barre « débogage de ce navigateur » de Chrome | GeoSpoof",
      description:
        "La simulation au niveau du moteur de GeoSpoof utilise l’API de débogage de Chrome ; Chrome affiche donc une barre de débogage. Voici ce que cela signifie, pourquoi c’est sans danger, et comment la masquer.",
      ogTitle: "Masquer la barre « débogage de ce navigateur » de Chrome",
    },
    hero: {
      breadcrumbHome: "Accueil",
      breadcrumb: "Simulation au niveau du moteur",
      badge: "Chrome · Simulation au niveau du moteur",
      headingPre: "Masquer la barre ",
      headingEmphasis: "« a démarré le débogage de ce navigateur »",
      headingPost: " de Chrome",
      intro:
        "Chrome affiche une barre « a démarré le débogage de ce navigateur » lorsque la simulation au niveau du moteur est active. Elle est sans danger — voici comment la masquer.",
      ctaHowTo: "Comment masquer la barre",
      ctaFallback: "Obtenez GeoSpoof gratuitement",
      figureAlt:
        "Chrome affichant une barre de notification « GeoSpoof a démarré le débogage de ce navigateur » en haut de la fenêtre lorsque la simulation au niveau du moteur est active",
      figCaption:
        "La barre « a démarré le débogage de ce navigateur » que Chrome affiche lorsque la simulation au niveau du moteur est active.",
    },
    whatBar: {
      heading: "Ce que signifie cette barre",
      intro:
        "La simulation au niveau du moteur applique votre fuseau horaire au niveau du navigateur, avant l’exécution du premier script d’une page, et couvre donc aussi les workers en arrière-plan. Pour atteindre ce niveau, GeoSpoof utilise l’API de débogage de Chrome — et Chrome le signale par une barre de notification.",
      point1Title: "C’est un avis standard de Chrome",
      point1Body:
        "Chrome affiche cette barre pour toute extension qui utilise l’API de débogage — la même API que les outils de développement. Elle apparaît dès que GeoSpoof s’y attache, non parce que quelque chose a mal tourné.",
      point2Title: "GeoSpoof ne définit qu’un remplacement de fuseau horaire",
      point2Body:
        "La connexion de débogage sert uniquement à appliquer votre fuseau horaire simulé à travers les cadres et les workers. Elle ne lit pas le contenu de vos pages, vos frappes au clavier ni votre navigation — et le code est open source.",
      point3Title: "La barre est purement cosmétique",
      point3Body:
        "Elle ne change rien à la façon dont les sites vous voient. La masquer sert uniquement à retirer le bandeau en haut de la fenêtre.",
    },
    howTo: {
      heading: "Comment masquer la barre",
      introPre: "Lancez Chrome avec l’option ",
      introPost:
        ". Quittez d’abord Chrome, puis suivez les étapes correspondant à votre système.",
    },
    guides: {
      win: {
        step1: "Fermez toutes les fenêtres de Chrome.",
        step2:
          "Faites un clic droit sur le raccourci Chrome que vous utilisez (barre des tâches, bureau ou menu Démarrer) et choisissez Propriétés.",
        step3a: "Dans le champ ",
        step3strong: "Cible",
        step3mid: ", laissez le chemin entre guillemets vers ",
        step3code: "chrome.exe",
        step3end:
          " tel quel et ajoutez l’option après le guillemet fermant (notez l’espace au début).",
        step4: "Cliquez sur OK, puis ouvrez Chrome depuis ce raccourci.",
        note: "Répétez l’opération pour chaque raccourci depuis lequel vous lancez Chrome (la barre des tâches et le menu Démarrer sont des raccourcis distincts).",
      },
      mac: {
        step1: "Quittez complètement Chrome (⌘Q).",
        step2: "Ouvrez le Terminal et exécutez la commande ci-dessous.",
        step3a:
          "Chrome se rouvre sans la barre. Pour le lancer ainsi à chaque fois, enregistrez la commande comme une ",
        step3strong: "application",
        step3end: " Automator ou un alias shell.",
      },
      linux: {
        step1: "Fermez Chrome.",
        step2:
          "Lancez-le avec l’option, ou ajoutez l’option à la ligne Exec= de votre lanceur .desktop de Chrome pour la rendre permanente.",
        note: "Utilisez chromium à la place de google-chrome si vous utilisez Chromium.",
      },
    },
    permanent: {
      heading: "Rendre le changement permanent",
      bodyPre:
        "L’option ne s’applique qu’aux lancements qui l’incluent ; la barre revient donc si vous ouvrez Chrome d’une autre façon. Pour la garder masquée durablement, ajoutez ",
      bodyMid:
        " au raccourci ou au lanceur depuis lequel vous ouvrez Chrome chaque jour — la Cible du raccourci Windows, une application de lancement macOS, ou votre fichier ",
      bodyDesktopCode: ".desktop",
      bodyEnd: " Linux.",
      body2Pre:
        "Vous préférez ne pas vous en soucier ? Laissez la simulation au niveau du moteur désactivée — la protection standard de GeoSpoof simule toujours votre ",
      locationLink: "position",
      body2Mid: " et votre ",
      timezoneLink: "fuseau horaire",
      body2End: " sans aucune barre de débogage.",
    },
    faq: {
      heading: "Questions fréquentes",
      items: [
        {
          q: "Pourquoi GeoSpoof indique-t-il qu’il « débogue » mon navigateur ?",
          a: "La simulation au niveau du moteur utilise l’API de débogage de Chrome (le Chrome DevTools Protocol) — le mécanisme même qu’utilisent les outils de développement de votre navigateur — pour définir votre fuseau horaire plus en profondeur qu’une extension normale ne le peut. Dès qu’une extension s’y attache via cette API, Chrome affiche une barre « a démarré le débogage de ce navigateur ». C’est un avis standard de Chrome, pas le signe d’un problème.",
        },
        {
          q: "Est-ce sans danger ? GeoSpoof lit-il mes données ?",
          a: "GeoSpoof n’utilise la connexion de débogage que pour appliquer un remplacement de fuseau horaire. Il ne lit pas le contenu de vos pages, vos frappes au clavier ni votre navigation. GeoSpoof est open source, vous pouvez donc vérifier exactement ce qu’il envoie sur GitHub. Si vous préférez ne pas l’utiliser, laissez la simulation au niveau du moteur désactivée et la protection standard de GeoSpoof simule toujours votre position et votre fuseau horaire.",
        },
        {
          q: "Comment masquer la barre « a démarré le débogage de ce navigateur » ?",
          a: "Lancez Chrome avec l’option {flag}. Sous Windows, ajoutez-la au champ Cible du raccourci de Chrome ; sur macOS, relancez Chrome depuis le Terminal avec cette option (ou enregistrez-la comme lanceur) ; sous Linux, ajoutez-la à votre commande de lancement de Chrome ou au fichier .desktop. La barre disparaît tandis que la simulation continue de fonctionner.",
        },
        {
          q: "La barre reviendra-t-elle quand je redémarrerai Chrome ?",
          a: "Oui, à moins d’intégrer l’option au raccourci ou au lanceur que vous utilisez toujours. L’option n’affecte que les lancements qui l’incluent ; ouvrir Chrome d’une autre façon fait donc revenir la barre. Ajoutez-la à votre lanceur habituel pour qu’elle reste masquée.",
        },
        {
          q: "Pourquoi GeoSpoof ne peut-il pas masquer la barre automatiquement pour moi ?",
          a: "La barre est contrôlée par Chrome lui-même, et seule une option de lancement du navigateur peut la désactiver. Les extensions ne peuvent pas définir les options de ligne de commande de Chrome ; cette étape doit donc être effectuée une fois par vous. C’est une protection délibérée de Chrome autour de l’API de débogage.",
        },
        {
          q: "Qu’est-ce que la simulation au niveau du moteur ?",
          a: "C’est une option de GeoSpoof réservée à Chrome qui simule votre fuseau horaire au niveau du moteur du navigateur plutôt que depuis un script de page. Comme elle s’applique avant l’exécution du premier script d’une page et atteint les workers en arrière-plan, elle comble des fuites de fuseau horaire que la simulation au niveau de la page peut manquer. La géolocalisation continue d’utiliser la méthode standard et sans autorisation de GeoSpoof.",
        },
      ],
    },
    schema: {
      howToStep1Name: "Quittez complètement Chrome",
      howToStep1Text:
        "Fermez toutes les fenêtres de Chrome pour que le navigateur se ferme entièrement — l’option ne s’applique qu’à un nouveau lancement.",
      howToStep2Name: "Relancez Chrome avec l’option",
      howToStep2Text:
        "Démarrez Chrome avec l’option de ligne de commande {flag} en suivant les étapes propres à votre système d’exploitation.",
      howToStep3Name: "Rendre le changement permanent (facultatif)",
      howToStep3Text:
        "Ajoutez l’option au raccourci ou au lanceur que vous utilisez habituellement, pour que la barre reste masquée à chaque lancement.",
      howToStep4Name: "Rouvrez GeoSpoof",
      howToStep4Text:
        "La simulation au niveau du moteur continue de fonctionner exactement comme avant — seule la barre de notification a disparu.",
      howToName:
        "Comment masquer la barre « a démarré le débogage de ce navigateur » de Chrome",
      howToDesc:
        "Masquez la barre de notification que Chrome affiche lorsque la simulation au niveau du moteur de GeoSpoof est active, en lançant Chrome avec l’option {flag}.",
    },
  },
  feedback: {
    meta: {
      title: "Envoyer un avis — GeoSpoof",
      description:
        "Une idée, un bug à signaler ou juste envie de dire bonjour ? Envoyez votre avis à l'équipe GeoSpoof — nous lisons chaque message.",
      ogTitle: "Envoyer un avis à GeoSpoof",
    },
    heading: "Merci d'utiliser GeoSpoof",
    subhead:
      "GeoSpoof est développé par une toute petite équipe, et chaque message aide vraiment à façonner la suite. Qu'il s'agisse d'un bug, d'une idée de fonctionnalité ou d'un simple bonjour, nous serions ravis de vous lire.",
    emailLabel: "Envoyez votre avis à",
    emailHint:
      "Copiez l'adresse ci-dessous ou touchez-la pour ouvrir votre application de messagerie.",
    copy: "Copier",
    copied: "✓ Copié",
    copyAria: "Copier l'adresse e-mail pour les avis",
    closing: "Merci de nous aider à améliorer GeoSpoof.",
  },
  gps: {
    meta: {
      title: "Télécharger GeoSpoof GPS pour Mac | GeoSpoof",
      description:
        "GeoSpoof GPS est une app de barre de menus macOS qui aligne la position GPS réelle de votre iPhone connecté sur votre position simulée. Téléchargez le DMG signé et notarié.",
      ogTitle: "Télécharger GeoSpoof GPS pour Mac",
    },
    compat: {
      label: "Remarque",
      body: "GeoSpoof GPS est conçu uniquement pour la confidentialité, la navigation web et le développement. Il n'est pas compatible avec les jeux mobiles en réalité augmentée comme Pokémon GO, ni conçu pour eux.",
    },
    experimental: {
      label: "Expérimental",
      title: "Une fonctionnalité récente et expérimentale",
      body: "GeoSpoof GPS est récent et encore en cours de validation selon les appareils, alors attendez-vous à quelques imperfections et à une configuration initiale. C'est un module optionnel. Le reste de GeoSpoof fonctionne très bien sans lui.",
    },
    hero: {
      breadcrumbHome: "Accueil",
      breadcrumb: "GeoSpoof GPS",
      iconAlt: "Icône de l’app GeoSpoof GPS",
      badge: "macOS · App de barre de menus",
      headingPre: "Alignez le ",
      headingEmphasis: "vrai GPS",
      headingPost: " de votre iPhone sur votre position simulée",
      intro:
        "GeoSpoof GPS est un compagnon de barre de menus macOS qui règle la position système d'un iPhone connecté sur le lieu que vous choisissez dans GeoSpoof. Votre navigateur et le GPS réel de votre téléphone racontent la même histoire.",
    },
    download: {
      cta: "Télécharger pour Mac",
      setupCta: "Guide de configuration",
      resolving: "Recherche de la dernière version…",
      versionLabel: "Dernière version",
      iosNote: "Vous aurez aussi besoin de l'app GeoSpoof pour iPhone (Pro).",
      iosCta: "Obtenir GeoSpoof pour iPhone",
    },
    setup: {
      title: "Configurer GeoSpoof GPS",
      intro:
        "Ouvrez l'icône de la barre de menus et choisissez « Configurer… ». L'assistant coche chaque étape au fur et à mesure. Connectez votre iPhone avec un câble pour terminer la configuration. Ensuite, GeoSpoof GPS continue de fonctionner en Wi-Fi.",
      steps: [
        {
          name: "Installez l'app",
          text: "Ouvrez le DMG, glissez GeoSpoof GPS dans Applications, puis lancez-la. Elle s'exécute depuis la barre de menus (sans icône dans le Dock ni fenêtre) et ouvre l'assistant de configuration au premier lancement.",
        },
        {
          name: "Autorisez l'accès au réseau local",
          text: "Au premier lancement, macOS demande l'accès au réseau local. Cliquez sur Autoriser pour que GeoSpoof GPS puisse trouver votre iPhone et communiquer avec lui. Sans cela, l'app ne voit pas votre téléphone.",
          bullets: [
            "Invite manquée ? Activez-le dans Réglages Système ▸ Confidentialité et sécurité ▸ Réseau local ▸ GeoSpoof GPS.",
            "Un « Aucun appareil trouvé » qui reste bloqué indique généralement que cette autorisation est désactivée.",
          ],
        },
        {
          name: "Installez Xcode",
          text: "GeoSpoof GPS a besoin de l'image disque de développeur d'Apple, et elle est fournie avec Xcode. Lancez d'abord ce téléchargement — il est volumineux (plusieurs Go), laissez-le donc s'installer en arrière-plan pendant que vous faites les étapes rapides de l'iPhone ci-dessous.",
          bullets: [
            "Installez Xcode (gratuit) depuis le Mac App Store et ouvrez-le une fois.",
            "Au premier lancement, un écran « Sélectionner les plateformes » apparaît. Cochez macOS et laissez les autres (y compris iOS) décochées, puis continuez — vous n'avez besoin ni du SDK iOS ni du Simulateur ; l'image de développeur fait de toute façon partie de la configuration de base de Xcode.",
            "Laissez « Installation des composants » se terminer, puis quittez Xcode. Aucun projet, aucune compilation, rien à construire, et aucun compte Apple Developer payant.",
            "Vous avez déjà une image de développeur ? Indiquez ce dossier à GeoSpoof GPS et évitez complètement le téléchargement de Xcode.",
          ],
          link: { label: "Obtenir Xcode sur le Mac App Store" },
        },
        {
          name: "Connectez votre iPhone",
          text: "Branchez votre iPhone sur votre Mac et déverrouillez-le. Utilisez un câble capable de transférer des données, car certains ne servent qu'à charger. S'il n'apparaît pas, essayez un autre câble ou un autre port.",
        },
        {
          name: "Faites confiance à cet ordinateur",
          text: "Lorsque votre iPhone demande s'il faut se fier à cet ordinateur, touchez Se fier et saisissez votre code. Cela permet à votre Mac et à votre téléphone de communiquer.",
          bullets: [
            "Pas d'invite ? Gardez le téléphone déverrouillé, puis débranchez et rebranchez le câble. L'alerte ne s'affiche que lorsque l'écran est déverrouillé.",
            "Toujours rien ? Verrouillez puis déverrouillez le téléphone (ou redémarrez-le) et reconnectez.",
            "En tout dernier recours : Réglages ▸ Général ▸ Transférer ou réinitialiser l'iPhone ▸ Réinitialiser ▸ Réinitialiser localisation et confidentialité, puis reconnectez et touchez Se fier.",
          ],
        },
        {
          name: "Activez le mode développeur",
          text: "Sur votre iPhone, allez dans Réglages ▸ Confidentialité et sécurité ▸ Mode développeur, activez-le et redémarrez lorsqu'on vous le demande. Il n'apparaît qu'après avoir connecté l'iPhone à votre Mac au moins une fois.",
        },
        {
          name: "Jumelez avec ce Mac",
          text: "Dans la fenêtre de configuration, cliquez sur Jumeler. Cet échange sécurisé unique permet à votre Mac de piloter le GPS de l'iPhone. Gardez le téléphone déverrouillé et connecté pendant l'opération.",
        },
        {
          name: "Préparez l'image de développeur",
          text: "Nécessite Xcode installé (ci-dessus). iPhone connecté et déverrouillé, cliquez sur Préparer. GeoSpoof GPS personnalise l'image disque de développeur (DDI) d'Apple pour votre appareil et la monte — l'élément qui permet à une app de définir votre position GPS réelle. Elle est signée par Apple et gérée pour vous ; il n'y a rien à configurer.",
          powerUserNote:
            "Image introuvable ? Si Préparer indique qu'il ne trouve pas l'image de développeur, la configuration de Xcode n'est peut-être pas terminée. Ouvrez le Terminal, exécutez ceci, puis cliquez de nouveau sur Préparer :",
        },
        {
          name: "Choisissez un lieu dans GeoSpoof",
          text: "Définissez votre position comme d'habitude dans GeoSpoof. Le GPS système de votre iPhone la suit et reste aligné, même après avoir débranché le câble et être passé en Wi-Fi.",
          link: { label: "Obtenir GeoSpoof pour iPhone" },
        },
      ],
    },
    requirements: {
      title: "Ce qu'il vous faut",
      macos: "macOS 13 (Ventura) ou version ultérieure.",
      appPre: "L'",
      appLink: "app GeoSpoof pour iPhone",
      appPost:
        " avec GeoSpoof Pro. L'app est votre poste de commande qui définit la position, et déplacer le vrai GPS de l'appareil est une fonctionnalité Pro.",
      iphone:
        "Un iPhone avec le mode développeur activé, connecté par câble USB pour la première configuration.",
      xcodePre: "Xcode, l'app de développement gratuite d'Apple, sur le ",
      xcodeLink: "Mac App Store",
      xcodePost:
        ". Vous ne compilez rien : installez-le et ouvrez-le une fois avec votre iPhone connecté pour qu'il fournisse l'image de développeur iOS. C'est un gros téléchargement, alors prévoyez environ 15 Go d'espace libre. Vous avez déjà une image de développeur ? Vous pouvez plutôt indiquer ce dossier à l'app.",
    },
    howItWorks: {
      title: "Comment ça marche",
      intro:
        "Une localisation cohérente entre votre navigateur et votre téléphone, entièrement pilotée depuis l'app GeoSpoof que vous utilisez déjà.",
      steps: [
        {
          title: "Vous choisissez, il suit",
          body: "Choisissez un lieu dans l'app GeoSpoof comme d'habitude. Ce choix est la seule source de vérité, et GeoSpoof GPS sur votre Mac le reflète sur votre iPhone — pour que le spoof du navigateur et le vrai GPS de l'appareil racontent enfin la même histoire.",
        },
        {
          title: "Votre Mac déplace le GPS",
          body: "Via un appairage sécurisé et unique, l'app de la barre de menus utilise la simulation de localisation développeur d'Apple pour définir la position système de votre iPhone. Aucun jailbreak, rien à compiler — le même mécanisme que les développeurs utilisent déjà dans Xcode.",
        },
        {
          title: "Le câble une fois, puis sans fil",
          body: "La configuration initiale passe par un câble USB. Ensuite, tout fonctionne en Wi-Fi et se reconnecte tout seul lorsque votre téléphone quitte le réseau puis le rejoint.",
        },
        {
          title: "Reste stable, revient proprement",
          body: "L'app maintient votre position et bascule instantanément quand vous en choisissez une autre. Mettez la synchronisation en pause ou quittez l'app, et votre iPhone revient aussitôt à son vrai GPS — sans spoof résiduel.",
        },
      ],
      privacyTitle: "Rien qu'à vous",
      privacyBody:
        "Tout se passe directement entre votre Mac et votre iPhone : votre position ne touche jamais nos serveurs. Pro est vérifié à l'aide de reçus signés par Apple, et chaque mise à jour est notariée par Apple et sa signature est contrôlée avant l'installation.",
    },
    menuShotAlt: "App GeoSpoof GPS dans la barre de menus sur macOS",
    screenshotAlt: "GeoSpoof GPS sur iPhone, capture {n}",
    help: {
      title: "Toujours bloqué ?",
      body: "Si une étape ne se termine pas, notre page d'assistance propose d'autres solutions. Vous avez trouvé un bug ou une idée ? Nous serions ravis de vous lire.",
      supportLink: "Obtenir de l'aide",
      feedbackLink: "Envoyer un avis",
    },
  },
}
