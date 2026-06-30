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
  spoofLocation: {
    hub: {
      metaTitle:
        "Falsifiez la position de votre navigateur — extension gratuite | GeoSpoof",
      metaDescription:
        "Falsifiez la position de votre navigateur dans Chrome, Edge, Firefox ou Safari. GeoSpoof remplace l'API de géolocalisation et le fuseau horaire pour que les sites voient la position de votre choix.",
      ogTitle: "Falsifiez la position de votre navigateur",
      badge: "Falsification de position",
      headingPre: "Falsifiez la ",
      headingEmphasis: "position",
      intro:
        "Les sites web lisent votre position via l'API de géolocalisation du navigateur et votre fuseau horaire — un VPN ne change ni l'un ni l'autre. GeoSpoof remplace les deux pour que les sites voient la position que vous choisissez. Choisissez votre navigateur pour commencer.",
      cardTitle: "Falsifier la position dans {name}",
      openGuide: "Ouvrir le guide",
    },
    page: {
      browserBadge: "Extension {name}",
      headingPre: "Falsifiez votre position dans ",
      ctaFallback: "Obtenir GeoSpoof pour {name}",
      testLocation: "Tester votre position",
      breadcrumbHome: "Accueil",
      breadcrumbHub: "Falsifier la position",
      howToHeading: "Comment falsifier votre position dans {name}",
      stepInstallName: "Installer GeoSpoof pour {name}",
      stepInstallText: "Ajoutez l'extension GeoSpoof gratuite depuis {store}.",
      stepEnableName: "L'activer dans {name}",
      stepSetName: "Définir votre position",
      stepSetText:
        "Cherchez une ville, saisissez des coordonnées ou utilisez la Synchronisation VPN pour faire correspondre la région de sortie de votre VPN.",
      stepReportsName: "{name} indique la position que vous avez choisie",
      stepReportsText:
        "GeoSpoof remplace l'API de géolocalisation et le fuseau horaire (Date, Intl, Temporal) afin que chaque site voie la position que vous avez choisie",
      stepReportsWebrtcSuffix:
        ", et la protection WebRTC empêche votre véritable IP de fuiter",
      webrtcAvailableTitle: "La protection WebRTC est disponible dans {name}.",
      webrtcAvailableBody:
        "GeoSpoof empêche aussi votre véritable IP de fuiter via WebRTC, ce qui peut autrement contourner entièrement un VPN.",
      webrtcUnavailableTitle:
        "Remarque : la protection WebRTC n'est pas disponible dans {name}.",
      webrtcUnavailableBody:
        "La falsification de la position et du fuseau horaire est entièrement prise en charge ; l'API de confidentialité WebRTC sur laquelle GeoSpoof s'appuie n'est pas exposée sur ce navigateur.",
      faqHeading: "Questions fréquentes",
      faqHowQ: "Comment falsifier ma position dans {name} ?",
      faqHowA:
        "Installez l'extension GeoSpoof gratuite, définissez une position (cherchez une ville, saisissez des coordonnées ou synchronisez avec votre VPN), et GeoSpoof remplace les API de géolocalisation et de fuseau horaire dans {name} pour que les sites voient la position choisie plutôt que votre véritable position.",
      faqVpnQ: "Un VPN change-t-il ma position dans {name} ?",
      faqVpnA:
        "Non. Un VPN ne change que votre adresse IP. {name} continue d'indiquer sa propre géolocalisation et le fuseau horaire du système, qui peuvent encore révéler votre véritable région. GeoSpoof falsifie les signaux du navigateur ; utilisez-le avec un VPN pour une position cohérente.",
      faqFreeQ: "GeoSpoof est-il gratuit pour {name} ?",
      faqFreeA:
        "Oui. GeoSpoof est gratuit et open source. Aucun compte, aucune connexion, aucun pistage — chaque réglage reste sur votre appareil.",
      crossLinkLead: "Vous utilisez un autre navigateur ? Voir ",
      crossLinkText: "falsifier votre position dans n'importe quel navigateur",
      schemaSoftwareDesc:
        "Falsifiez votre géolocalisation et votre fuseau horaire dans {name} avec une extension gratuite et open source.",
    },
    browsers: {
      chrome: {
        storeName: "le Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Chrome communique votre position aux sites via l'API de géolocalisation et votre fuseau horaire via Intl et Date — et un VPN n'y change rien. GeoSpoof remplace ces signaux à l'intérieur de Chrome pour que les sites voient la position que vous choisissez. La même version fonctionne aussi dans Brave, Opera et les autres navigateurs Chromium.",
        enableStep:
          "Épinglez GeoSpoof depuis l'icône en forme de pièce de puzzle (Extensions) dans la barre d'outils de Chrome pour l'avoir à portée de clic.",
        extraFaqQ:
          "GeoSpoof fonctionne-t-il dans Brave et les autres navigateurs Chromium ?",
        extraFaqA:
          "Oui. GeoSpoof s'installe depuis le Chrome Web Store, qui dessert Chrome, Brave, Opera et les autres navigateurs basés sur Chromium. La falsification de la position et du fuseau horaire fonctionne de façon identique sur tous.",
        metaTitle:
          "Falsifier votre position dans Chrome — extension gratuite | GeoSpoof",
        metaDescription:
          "Falsifiez votre position dans Chrome avec une extension gratuite. GeoSpoof remplace l'API de géolocalisation et le fuseau horaire pour que les sites voient la position de votre choix. Brave aussi.",
        ogTitle: "Falsifier votre position dans Chrome",
      },
      edge: {
        storeName: "le Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Microsoft Edge est basé sur Chromium ; il expose donc votre position de la même façon que Chrome — l'API de géolocalisation et le fuseau horaire de votre système. GeoSpoof s'installe depuis le Chrome Web Store, fonctionne dans Edge et remplace ces API pour indiquer la position que vous choisissez. Cela fonctionne pour falsifier votre position dans Edge sur Windows comme sur macOS.",
        enableStep:
          "Autorisez l'extension depuis le Chrome Web Store lorsque Edge vous le demande, puis épinglez GeoSpoof depuis l'icône Extensions (pièce de puzzle).",
        extraFaqQ: "Puis-je falsifier ma position dans Edge sous Windows ?",
        extraFaqA:
          "Oui. GeoSpoof fonctionne dans Edge sous Windows et macOS. Il remplace la position et le fuseau horaire que votre navigateur communique aux sites ; il ne modifie pas les réglages de localisation du système Windows, votre OS reste donc intact.",
        metaTitle:
          "Falsifier votre position dans Edge — extension gratuite | GeoSpoof",
        metaDescription:
          "Falsifiez votre position dans Microsoft Edge avec une extension gratuite. GeoSpoof remplace l'API de géolocalisation et le fuseau horaire pour que les sites voient la position de votre choix.",
        ogTitle: "Falsifier votre position dans Edge",
      },
      firefox: {
        storeName: "Firefox Add-ons",
        storeShort: "Firefox Add-ons",
        intro:
          "Firefox transmet aux sites votre position via l'API de géolocalisation et votre région via les API de fuseau horaire, quel que soit le VPN. GeoSpoof s'installe depuis Firefox Add-ons et remplace ces signaux. C'est la seule version qui fonctionne aussi sur Firefox pour Android, ce qui vous permet de falsifier votre position sur mobile également.",
        enableStep:
          "Après avoir ajouté GeoSpoof depuis Firefox Add-ons, épinglez-le à la barre d'outils depuis le menu des extensions pour un accès rapide.",
        extraFaqQ: "Puis-je falsifier ma position dans Firefox sur Android ?",
        extraFaqA:
          "Oui. Firefox 140+ sur Android prend en charge GeoSpoof, vous pouvez donc falsifier la géolocalisation et le fuseau horaire sur votre téléphone — ce que Chrome sur mobile ne peut pas faire, car il ne prend pas en charge les extensions.",
        metaTitle:
          "Falsifier votre position dans Firefox — module gratuit | GeoSpoof",
        metaDescription:
          "Falsifiez votre position dans Firefox avec un module gratuit et open source. GeoSpoof remplace l'API de géolocalisation et le fuseau horaire pour que les sites voient la position de votre choix.",
        ogTitle: "Falsifier votre position dans Firefox",
      },
      safari: {
        storeName: "l'App Store",
        storeShort: "App Store",
        intro:
          "Safari sur iOS, iPadOS et macOS communique votre position et votre fuseau horaire aux sites comme n'importe quel navigateur. GeoSpoof s'installe depuis l'App Store et fonctionne comme une extension Safari, remplaçant ces API pour que les sites voient la position que vous choisissez. La falsification de la position et du fuseau horaire est entièrement prise en charge ; la protection WebRTC n'est pas disponible sur Safari.",
        enableStep:
          "Après l'installation depuis l'App Store, activez GeoSpoof depuis le menu des extensions de Safari (la pièce de puzzle dans la barre d'adresse sur iOS, ou Safari → Réglages → Extensions sur macOS).",
        extraFaqQ:
          "La falsification de position fonctionne-t-elle dans Safari sur iPhone ?",
        extraFaqA:
          "Oui. GeoSpoof est une extension Safari disponible sur l'App Store pour iOS, iPadOS et macOS. Une fois activée pour un site, elle remplace la géolocalisation et le fuseau horaire indiqués par Safari. La protection WebRTC est la seule fonctionnalité non disponible sur Safari.",
        metaTitle:
          "Falsifier votre position dans Safari — extension gratuite | GeoSpoof",
        metaDescription:
          "Falsifiez votre position dans Safari avec une extension gratuite de l'App Store. GeoSpoof remplace l'API de géolocalisation et le fuseau horaire sur iOS, iPadOS et macOS.",
        ogTitle: "Falsifier votre position dans Safari",
      },
    },
  },
  vpn: {
    meta: {
      title:
        "Avez-vous besoin d'un VPN avec GeoSpoof ? Deux couches de confidentialité | GeoSpoof",
      description:
        "GeoSpoof masque la position, le fuseau horaire et le WebRTC que votre navigateur communique. Un VPN sans journaux masque votre IP — le seul signal qu'une extension ne peut pas changer.",
      ogTitle: "Avez-vous besoin d'un VPN avec GeoSpoof ?",
    },
    hero: {
      mapAlt: "Proton VPN masque votre adresse IP",
      badge: "La confidentialité de la position a deux couches",
      headingPre: "Avez-vous besoin d'un VPN avec ",
      headingPost: " ?",
      answer:
        "GeoSpoof masque la position de votre navigateur. Un VPN masque votre IP. Pour une confidentialité complète, il vous faut les deux.",
      disclosureLabel: "Divulgation de confidentialité :",
      disclosureBody:
        "Nous sommes partenaires de Proton VPN. Si vous vous abonnez via notre lien, nous percevons une commission sans coût supplémentaire pour vous.",
      ctaPlans: "Voir les offres Proton VPN",
      discountSticker: "Jusqu'à {discount} de réduction",
      learnMore: "En savoir plus",
      moneyBack: "Garantie de remboursement de 30 jours",
      platformsAria:
        "Proton VPN est disponible sur Windows, macOS, Linux, iOS et Android",
    },
    twoLayers: {
      heading: "Deux couches, deux outils",
      intro:
        "La confidentialité de la position repose sur deux couches indépendantes. GeoSpoof scelle la couche du navigateur ; un VPN scelle la couche réseau. Falsifiez l'une mais laissez l'autre, et l'incohérence vous trahit. Un navigateur qui indique Tokyo alors que votre IP pointe encore vers New York est facile à repérer.",
      browserTitle: "La couche du navigateur",
      browserBody:
        "Les sites web lisent votre position via l'API de géolocalisation, votre région via les API de fuseau horaire, et vos IP locales via WebRTC. GeoSpoof remplace tout cela pour qu'ils indiquent la position que vous choisissez.",
      browserWho: "Géré par GeoSpoof",
      networkTitle: "La couche réseau",
      networkBody:
        "Chaque site voit aussi l'adresse IP publique d'où provient votre connexion, qui correspond à une véritable ville. Aucune extension de navigateur ne peut la changer — elle se situe sous le navigateur, au niveau du réseau.",
      networkWho: "Géré par un VPN",
      primerLead:
        "Vous voulez une analyse plus approfondie et neutre ? Jonah Aragon de Privacy Guides propose une présentation claire de ",
      primerLink: "ce qu'un VPN fait réellement et ne fait pas",
    },
    whyProton: {
      eyebrow: "Le VPN en qui nous avons confiance",
      heading: "Pourquoi Proton VPN",
      intro:
        "GeoSpoof est open source et ne conserve aucun journal. En matière de confidentialité, la seule confiance qui vaille est celle que l'on peut vérifier. Proton s'impose les mêmes exigences : des applications open source, une politique sans journaux auditée indépendamment, et une juridiction suisse.",
      reason1Title: "Sans journaux, audité indépendamment",
      reason1Body:
        "La politique sans journaux de Proton a été auditée indépendamment à plusieurs reprises, pas seulement affirmée, et éprouvée par de vraies demandes judiciaires.",
      reason2Title: "Suisse, open source",
      reason2Body:
        "Basé en Suisse, sous une législation stricte sur la vie privée, avec des applications entièrement open source que chacun peut inspecter — la même approche vérifiable que GeoSpoof.",
      reason3Title: "Compatible avec la Synchronisation VPN",
      reason3Body:
        "La Synchronisation VPN de GeoSpoof aligne automatiquement votre position falsifiée sur la région de sortie de votre VPN — avec Proton, ou tout autre VPN de votre choix.",
      calloutLead: "Ne nous croyez pas sur parole.",
      calloutBodyPre: " Proton est l'un des rares VPN recommandés par ",
      calloutLink: "Privacy Guides",
      calloutBodyPost:
        ", une ressource indépendante et communautaire dédiée à la vie privée. GeoSpoof fonctionne avec n'importe quel VPN, vous n'êtes donc jamais prisonnier ; nous recommandons Proton pour les raisons open source et auditées ci-dessus, mais le bon choix reste celui en qui vous avez confiance.",
    },
    plan: {
      imgAlt: "Écran d'accueil de l'application Proton VPN",
      heading: "Choisissez l'offre qui vous convient",
      body: "GeoSpoof est open source. Pour la couche IP, nous vous orienterions vers Proton VPN Plus. L'offre 2 ans est à {discount} de réduction par rapport au tarif standard de Proton — le prix mensuel le plus bas et le meilleur rapport qualité-prix. Vous préférez l'essayer d'abord ? L'offre mensuelle fonctionne aussi.",
      cta: "Voir les offres Proton VPN",
      discountLine: "{discount} de réduction sur l'offre 2 ans",
    },
    inlineDisclosure:
      "À noter — ceci est un lien affilié. Abonnez-vous via ce lien et Proton nous reverse une petite part, sans coût supplémentaire pour vous. C'est ainsi que nous aidons à garder GeoSpoof open source et indépendant.",
    faq: {
      heading: "Questions fréquentes",
      items: [
        {
          q: "Ai-je besoin d'un VPN si j'utilise GeoSpoof ?",
          a: "Pour une confidentialité de position complète, oui — mais pas parce que GeoSpoof serait insuffisant. GeoSpoof change la position, le fuseau horaire et les détails WebRTC que votre navigateur communique aux sites. Le signal le plus fort qui subsiste est votre adresse IP, et seul un VPN peut la changer. Les deux couvrent des couches différentes ; ensemble, ils racontent une histoire cohérente.",
        },
        {
          q: "Puis-je utiliser un autre VPN avec GeoSpoof ?",
          a: "Oui. GeoSpoof fonctionne avec n'importe quel VPN. Rien n'est verrouillé sur Proton, et la Synchronisation VPN fonctionne de la même façon avec tous. Mullvad et IVPN sont d'autres fournisseurs sans journaux bien considérés dans la communauté de la vie privée. Nous recommandons Proton parce qu'il est entièrement open source, audité indépendamment et recommandé par Privacy Guides, mais le choix vous appartient entièrement.",
        },
        {
          q: "Pourquoi GeoSpoof recommande-t-il Proton VPN ?",
          a: "Proton est sans journaux, basé en Suisse, entièrement open source et a passé de nombreux audits indépendants. Ce sont les mêmes valeurs vérifiables et axées sur la vie privée que celles de GeoSpoof. C'est aussi l'un des rares VPN recommandés par Privacy Guides, une ressource indépendante qui n'accepte aucun revenu d'affiliation. La Synchronisation VPN fonctionne avec Proton exactement comme avec n'importe quel autre VPN.",
        },
        {
          q: "Ai-je besoin d'un VPN pour utiliser GeoSpoof ?",
          a: "Non. La falsification au cœur de GeoSpoof fonctionne sans VPN. Un VPN ne fait que masquer votre véritable adresse IP — c'est un outil complémentaire, pas une condition pour utiliser GeoSpoof.",
        },
        {
          q: "GeoSpoof gagne-t-il de l'argent si je m'inscris ?",
          a: "Si vous vous abonnez à Proton via notre lien, Proton nous reverse une partie de la vente, sans coût supplémentaire pour vous. Cela aide à garder GeoSpoof open source et sans publicité. Nous recommandons Proton pour ses mérites (open source, audité indépendamment et recommandé par Privacy Guides), et la commission ne change rien à l'offre qui vous convient réellement le mieux.",
        },
      ],
    },
    disclosure: {
      label: "Divulgation d'affiliation :",
      body: "GeoSpoof est un utilitaire indépendant et open source, sans aucun lien ni approbation de la part de Proton. Lorsque vous achetez une offre via notre recommandation, Proton nous reverse une partie de la vente, sans coût supplémentaire pour vous. Cela aide à garder GeoSpoof gratuit, open source et sans publicité. Nous recommandons Proton pour ses mérites (open source, audité indépendamment et recommandé par Privacy Guides), non pour la commission, et GeoSpoof fonctionne avec n'importe quel VPN de votre choix.",
    },
  },
}
