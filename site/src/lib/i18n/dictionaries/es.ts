import type { Dictionary } from "./en"

/**
 * Spanish dictionary.
 *
 * Typed as `Dictionary`, so a missing or misnamed key fails the build. Copy is
 * hand-written (not machine-translated) — Google suppresses thin auto-translated
 * content in local results, so quality matters for the SEO payoff.
 */
export const es: Dictionary = {
  nav: {
    home: "Inicio",
    features: "Funciones",
    blog: "Blog",
    support: "Soporte",
    download: "Descargar",
    buyMeACoffee: "Invítame a un café",
    github: "GeoSpoof en GitHub",
    openMenu: "Abrir el menú de navegación",
    brandAria: "GeoSpoof - Inicio",
    mainNavAria: "Navegación principal",
  },
  hero: {
    badge: "Complemento para tu VPN · Extensión",
    headlinePre: "Termina lo que ",
    headlineEmphasis: "tu VPN",
    headlinePost: " empezó",
    subhead:
      "Una VPN cambia tu IP, pero tu navegador sigue revelando tu ubicación real. GeoSpoof la ajusta automáticamente a tu VPN — y la mantiene sincronizada cuando cambias de servidor.",
    downloadFree: "Descargar gratis",
    seeWhatSitesDetect: "Ve lo que detectan los sitios",
    allPlatforms: "Todas las plataformas y navegadores",
    usersSuffix: "usuarios",
    firefoxRating: "Firefox",
    mainPhoneAlt: "Aplicación GeoSpoof — vista principal",
    secondaryPhoneAlt: "Aplicación GeoSpoof — vista secundaria",
  },
  footer: {
    groups: {
      guides: "Guías",
      learn: "Aprender",
      company: "Empresa",
    },
    links: {
      spoofAllBrowsers: "Falsear la ubicación: todos los navegadores",
      spoofChrome: "Falsear la ubicación en Chrome",
      spoofFirefox: "Falsear la ubicación en Firefox",
      spoofEdge: "Falsear la ubicación en Edge",
      spoofSafari: "Falsear la ubicación en Safari",
      spoofTimezone: "Falsear la zona horaria",
      needVpn: "¿Necesitas una VPN?",
      testProtection: "Prueba tu protección",
      engineLevel: "Falseo a nivel de motor (Chrome)",
      blog: "Blog",
      support: "Soporte",
      about: "Acerca de",
      privacy: "Política de privacidad",
      terms: "Términos del servicio",
      github: "GitHub",
    },
    footerNavAria: "Navegación del pie de página",
    copyright: "© {year} GeoSpoof. Todos los derechos reservados.",
  },
  languageSwitcher: {
    label: "Idioma",
    suggestion: "Esta página está disponible en español.",
    switchAction: "Ver en español",
    dismiss: "Descartar",
  },
  storeCta: {
    firefox: "Añadir a Firefox",
    chrome: "Añadir a Chrome",
    apple: "Descargar en el App Store",
  },
  legal: {
    englishNote:
      "El texto legal que aparece a continuación solo está disponible en inglés. La versión en inglés es la que prevalece.",
    privacy: {
      metaTitle: "Política de privacidad | GeoSpoof",
      metaDescription:
        "Política de privacidad de GeoSpoof — descubre cómo protegemos tus datos y respetamos tu privacidad.",
      heading: "Política de privacidad",
      lastUpdated: "Última actualización: 22 de junio de 2026",
    },
    terms: {
      metaTitle: "Términos del servicio | GeoSpoof",
      metaDescription:
        "Términos del servicio de GeoSpoof — conoce las condiciones que rigen el uso de la extensión.",
      heading: "Términos del servicio",
      lastUpdated: "Última actualización: 20 de junio de 2026",
    },
  },
  testimonials: {
    eyebrow: "Lo que dicen los usuarios",
    heading: "Preferido por quienes cuidan su privacidad",
    subhead:
      "Reseñas reales de la Chrome Web Store, Firefox Add-ons y el App Store.",
    starsAria: "5 de 5 estrellas",
    readMoreOn: "Lee más reseñas en",
  },
  screenshots: {
    eyebrow: "Míralo en acción",
    heading: "Funciona en todo lo que navegas",
    desktopAlt:
      "La extensión GeoSpoof funcionando en el escritorio — el falseo de ubicación en acción",
  },
  demo: {
    eyebrow: "Míralo funcionar",
    heading: "Falsea tu ubicación en unos pocos clics",
    videoAria:
      "Demo de GeoSpoof — configurar una ubicación de navegador falseada con la extensión",
    unsupported: "Tu navegador no admite vídeo integrado.",
    downloadInstead: "Descargar la demo",
    insteadSuffix: "en su lugar.",
  },
  features: {
    eyebrow: "Funciones",
    heading: "Todas las señales, cubiertas",
    subhead:
      "Los sitios web usan varias API del navegador para detectar tu ubicación. GeoSpoof las reemplaza todas — de forma coherente, antes de que se ejecute cualquier script de la página.",
    visual: {
      noIpLeak: "Sin fugas de IP",
      noTracking: "Sin rastreo",
      noTelemetry: "Sin telemetría",
      vpnExit: "Salida VPN",
      spoofed: "Falseada",
      synced: "sincronizada",
      andMore: "y más",
    },
    items: {
      geolocation: {
        title: "Falseo de ubicación",
        description:
          "Reemplaza navigator.geolocation para que los sitios vean las coordenadas que elijas. Busca por ciudad, introduce coordenadas manualmente o sincroniza con tu VPN.",
      },
      timezone: {
        title: "Falseo de zona horaria",
        description:
          "Falsea Date, Intl.DateTimeFormat y la API Temporal para que tu zona horaria coincida con la ubicación elegida.",
      },
      webrtc: {
        title: "Protección WebRTC",
        description:
          "Evita fugas de IP a través de WebRTC en Firefox y Chromium mediante la API de privacidad del navegador.",
      },
      vpnSync: {
        title: "Sincronización con VPN",
        description:
          "Detecta automáticamente la región de salida de tu VPN y ajusta tu ubicación falseada para que coincida — con un solo clic.",
      },
      apis: {
        title: "Cobertura completa de API",
        description:
          "Todas las API del navegador que revelan tu ubicación están cubiertas — inyectadas en document_start, antes de que se ejecute cualquier script de la página.",
      },
    },
  },
  comparison: {
    eyebrow: "Cómo se compara GeoSpoof",
    heading: "Mucho más que cambiar unas coordenadas",
    subhead:
      "La mayoría de los falseadores de ubicación hacen una sola cosa: colocar una latitud y una longitud falsas en el navegador. GeoSpoof cubre toda la señal, para que tu ubicación, tu zona horaria y tu IP cuenten la misma historia.",
    featureHeader: "Función",
    typicalHeader: "Habitual",
    yesAria: "Sí",
    limited: "Limitado",
    noAria: "No",
    features: {
      coordinates: "Falsear la geolocalización por coordenadas",
      oneIdentity:
        "Una identidad coherente en decenas de API del navegador",
      citySearch: "Definir tu ubicación buscando una ciudad",
      webrtc: "Protección contra fugas de IP por WebRTC",
      everyBrowser:
        "Todos los navegadores principales + todo el ecosistema Apple",
      verification: "Página de verificación integrada",
      vpnSync: "Sincronización con VPN y resincronización automática",
      perSite: "Reglas por sitio y favoritos guardados",
    },
    legend: {
      fullSupport: "Compatibilidad completa",
      limitedDetail: ": parcial o básica",
      notSupported: "No compatible",
    },
    proAria: "Pro en iPhone y iPad",
    proNote:
      "Pro en iPhone y iPad. Gratis en navegadores de escritorio y Safari.",
    ctaLead: "No nos creas sin más: ",
    ctaLink: "prueba tu protección",
    ctaTail: " y comprueba cada señal por ti mismo.",
  },
  compatibility: {
    eyebrow: "Compatibilidad",
    heading: "Funciona en todos tus dispositivos",
    subhead:
      "GeoSpoof funciona en todos los navegadores y plataformas principales. Una sola extensión, protección coherente en todas partes.",
    platformHeader: "Plataforma",
    supportedAria: "Compatible",
    naAria: "No aplicable",
    notSupportedAria: "No compatible",
    legend: {
      supported: "Compatible",
      notSupported: "No compatible",
      na: "N/D — No aplicable",
    },
    footnote:
      "Firefox para Android requiere Firefox 140+. Safari requiere iOS 16+ o macOS 13+.",
    setupLead:
      "Guías de configuración por navegador: falsea tu ubicación en ",
    or: " o ",
    alsoLead: ". También puedes ",
    timezoneLink: "falsear la zona horaria de tu navegador",
  },
  featuredPost: {
    eyebrow: "Del blog",
    heading: "Vale la pena leerlo",
    allPosts: "Todos los artículos",
    minRead: "min de lectura",
    readMore: "Leer más",
  },
  blog: {
    index: {
      metaTitle: "Blog | GeoSpoof",
      metaDescription:
        "Guías y análisis a fondo sobre el falseo de la ubicación del navegador, la privacidad de la zona horaria, las fugas de WebRTC y cómo sacar el máximo partido a GeoSpoof.",
      heading: "Blog de GeoSpoof",
      subhead:
        "Guías y análisis a fondo sobre el falseo de ubicación, la privacidad de la zona horaria y la huella digital del navegador.",
      empty: "Aún no hay artículos — vuelve pronto.",
      minRead: "min de lectura",
    },
    post: {
      breadcrumbHome: "Inicio",
      breadcrumbBlog: "Blog",
      minRead: "min de lectura",
      faqHeading: "Preguntas frecuentes",
      olderPost: "← Artículo anterior",
      newerPost: "Artículo siguiente →",
      backToAll: "← Volver a todos los artículos",
      englishNote: "Este artículo solo está disponible en inglés.",
    },
  },
  download: {
    eyebrow: "Descargar",
    heading: "Consigue GeoSpoof gratis",
    subhead:
      "Disponible en todos los navegadores principales. Sin cuenta, sin telemetría, sin rastreo.",
    recommendedBadge: "Recomendado para ti",
    installFree: "Instalar gratis",
    otherWays: "Otras formas de descargar",
    stores: {
      firefox: {
        description: "Firefox 140+ en escritorio y Android",
        cta: "Añadir a Firefox",
      },
      chromium: {
        description: "Chrome, Brave y Edge",
        cta: "Añadir a Chrome",
      },
      apple: {
        description: "Safari en iOS y macOS",
        cta: "Descargar en el App Store",
      },
    },
    selfHosted: {
      dmg: {
        name: "Descarga directa (macOS)",
        description:
          "DMG notarizado para Safari en macOS. No requiere Apple ID. Actualizaciones manuales — vuelve a descargarlo para actualizar.",
      },
      xpi: {
        name: "XPI autoalojado (Firefox)",
        description:
          "XPI firmado para forks de Firefox o instalaciones manuales. Se actualiza automáticamente mediante nuestro manifiesto de actualización.",
      },
      cta: "Versiones en GitHub",
    },
  },
  skipLink: {
    toMainContent: "Saltar al contenido principal",
  },
  phoneCarousel: {
    embeddedHeading: "Y nativo en iPhone y iPad",
    standaloneHeading: "GeoSpoof en iOS y iPadOS",
    screenshotAlt: "GeoSpoof en iOS — captura de pantalla {n}",
    goToSlide: "Ir a la diapositiva {n}",
    getTheApp: "Consigue la app",
    appStore: "Descargar en el App Store",
    macAppStore: "Descargar en el Mac App Store",
  },
  exposureToast: {
    header: "Lo que ve cada sitio",
    exposed: "Expuesto",
    visibleToSites: "Visible para los sitios",
    location: "Ubicación",
    timezone: "Zona horaria",
    address: "Dirección",
    webrtc: "WebRTC",
    publicIpLeaking: "Fuga de IP pública",
    noLeak: "Sin fugas",
    yourArea: "tu zona",
    hideMyLocation: "Ocultar mi ubicación",
    getGeospoof: "Instalar GeoSpoof",
    fullReport: "Informe completo",
    dismiss: "Descartar",
  },
  themeToggle: {
    switchToLight: "Cambiar al modo claro",
    switchToDark: "Cambiar al modo oscuro",
    changedToLight: "Tema cambiado al modo claro",
    changedToDark: "Tema cambiado al modo oscuro",
  },
  carousel: {
    previousSlide: "Diapositiva anterior",
    nextSlide: "Diapositiva siguiente",
  },
  spoofLocation: {
    hub: {
      metaTitle:
        "Falsea la ubicación de tu navegador — extensión gratuita | GeoSpoof",
      metaDescription:
        "Falsea la ubicación de tu navegador en Chrome, Edge, Firefox o Safari. GeoSpoof reemplaza la API de geolocalización y la zona horaria para que los sitios vean la ubicación que elijas.",
      ogTitle: "Falsea la ubicación de tu navegador",
      badge: "Falseo de ubicación",
      headingPre: "Falsea la ",
      headingEmphasis: "ubicación",
      intro:
        "Los sitios web leen tu ubicación a través de la API de geolocalización del navegador y tu zona horaria — una VPN no cambia ninguna de las dos. GeoSpoof reemplaza ambas para que los sitios vean la ubicación que elijas. Elige tu navegador para empezar.",
      cardTitle: "Falsear la ubicación en {name}",
      openGuide: "Abrir la guía",
    },
    page: {
      browserBadge: "Extensión para {name}",
      headingPre: "Falsea tu ubicación en {name}",
      ctaFallback: "Consigue GeoSpoof para {name}",
      testLocation: "Prueba tu ubicación",
      breadcrumbHome: "Inicio",
      breadcrumbHub: "Falsear la ubicación",
      howToHeading: "Cómo falsear tu ubicación en {name}",
      stepInstallName: "Instala GeoSpoof para {name}",
      stepInstallText: "Añade la extensión gratuita GeoSpoof desde {store}.",
      stepEnableName: "Actívala en {name}",
      stepSetName: "Define tu ubicación",
      stepSetText:
        "Busca una ciudad, introduce coordenadas o usa la Sincronización con VPN para que coincida con la región de salida de tu VPN.",
      stepReportsName: "{name} informa de la ubicación que elegiste",
      stepReportsText:
        "GeoSpoof reemplaza la API de geolocalización y la zona horaria (Date, Intl, Temporal) para que cada sitio vea la ubicación que elegiste",
      stepReportsWebrtcSuffix:
        ", y la protección WebRTC impide que se filtre tu IP real",
      webrtcAvailableTitle: "La protección WebRTC está disponible en {name}.",
      webrtcAvailableBody:
        "GeoSpoof también impide que tu IP real se filtre a través de WebRTC, que de otro modo puede eludir por completo una VPN.",
      webrtcUnavailableTitle:
        "Nota: la protección WebRTC no está disponible en {name}.",
      webrtcUnavailableBody:
        "El falseo de ubicación y de zona horaria es totalmente compatible; la API de privacidad de WebRTC en la que se apoya GeoSpoof no está expuesta en este navegador.",
      faqHeading: "Preguntas frecuentes",
      faqHowQ: "¿Cómo falseo mi ubicación en {name}?",
      faqHowA:
        "Instala la extensión gratuita GeoSpoof, define una ubicación (busca una ciudad, introduce coordenadas o sincroniza con tu VPN) y GeoSpoof reemplaza las API de geolocalización y de zona horaria en {name} para que los sitios vean la ubicación elegida en lugar de la real.",
      faqVpnQ: "¿Una VPN cambia mi ubicación en {name}?",
      faqVpnA:
        "No. Una VPN solo cambia tu dirección IP. {name} sigue informando de su propia geolocalización del navegador y de la zona horaria del sistema, así que estas pueden seguir revelando tu región real. GeoSpoof falsea las señales del navegador; úsalo junto con una VPN para una ubicación coherente.",
      faqFreeQ: "¿GeoSpoof es gratis para {name}?",
      faqFreeA:
        "Sí. GeoSpoof es gratuito y de código abierto. No hay cuenta, ni inicio de sesión, ni rastreo — cada ajuste permanece en tu dispositivo.",
      crossLinkLead: "¿Usas otro navegador? Consulta ",
      crossLinkText: "falsear tu ubicación en cualquier navegador",
      schemaSoftwareDesc:
        "Falsea tu geolocalización y tu zona horaria en {name} con una extensión gratuita y de código abierto.",
    },
    browsers: {
      chrome: {
        storeName: "la Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Chrome comunica tu ubicación a los sitios web a través de la API de geolocalización y tu zona horaria a través de Intl y Date — y una VPN no cambia nada de eso. GeoSpoof reemplaza esas señales dentro de Chrome para que los sitios vean la ubicación que elijas. La misma versión funciona también en Brave, Opera y otros navegadores Chromium.",
        enableStep:
          "Fija GeoSpoof desde el icono de la pieza de puzle (Extensiones) en la barra de herramientas de Chrome para tenerlo a un clic de distancia.",
        extraFaqQ: "¿GeoSpoof funciona en Brave y otros navegadores Chromium?",
        extraFaqA:
          "Sí. GeoSpoof se instala desde la Chrome Web Store, que da servicio a Chrome, Brave, Opera y otros navegadores basados en Chromium. El falseo de ubicación y de zona horaria funciona de forma idéntica en todos ellos.",
        metaTitle:
          "Falsea tu ubicación en Chrome — extensión gratuita | GeoSpoof",
        metaDescription:
          "Falsea tu ubicación en Chrome con una extensión gratuita. GeoSpoof reemplaza la API de geolocalización y la zona horaria para que los sitios vean la ubicación que elijas. Brave también.",
        ogTitle: "Falsea tu ubicación en Chrome",
      },
      edge: {
        storeName: "la Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Microsoft Edge está basado en Chromium, así que expone tu ubicación igual que Chrome — la API de geolocalización más la zona horaria de tu sistema. GeoSpoof se instala desde la Chrome Web Store, funciona en Edge y reemplaza esas API para informar de la ubicación que elijas. Funciona para falsear tu ubicación en Edge tanto en Windows como en macOS.",
        enableStep:
          "Permite la extensión desde la Chrome Web Store cuando Edge te lo solicite, luego fija GeoSpoof desde el icono de Extensiones (pieza de puzle).",
        extraFaqQ: "¿Puedo falsear mi ubicación en Edge en Windows?",
        extraFaqA:
          "Sí. GeoSpoof funciona en Edge en Windows y macOS. Reemplaza la ubicación y la zona horaria que tu navegador comunica a los sitios web; no cambia los ajustes de ubicación del propio sistema Windows, así que tu SO permanece intacto.",
        metaTitle:
          "Falsea tu ubicación en Edge — extensión gratuita | GeoSpoof",
        metaDescription:
          "Falsea tu ubicación en Microsoft Edge con una extensión gratuita. GeoSpoof reemplaza la API de geolocalización y la zona horaria para que los sitios vean la ubicación que elijas.",
        ogTitle: "Falsea tu ubicación en Edge",
      },
      firefox: {
        storeName: "Firefox Add-ons",
        storeShort: "Firefox Add-ons",
        intro:
          "Firefox entrega a los sitios web tu ubicación a través de la API de geolocalización y tu región a través de las API de zona horaria, sin importar la VPN. GeoSpoof se instala desde Firefox Add-ons y reemplaza esas señales. Es la única versión que también funciona en Firefox para Android, así que puedes falsear tu ubicación en el móvil también.",
        enableStep:
          "Después de añadir GeoSpoof desde Firefox Add-ons, fíjalo a la barra de herramientas desde el menú de extensiones para acceder rápidamente.",
        extraFaqQ: "¿Puedo falsear mi ubicación en Firefox en Android?",
        extraFaqA:
          "Sí. Firefox 140+ en Android es compatible con GeoSpoof, así que puedes falsear la geolocalización y la zona horaria en tu teléfono — algo que Chrome en el móvil no puede hacer, porque no admite extensiones.",
        metaTitle:
          "Falsea tu ubicación en Firefox — complemento gratuito | GeoSpoof",
        metaDescription:
          "Falsea tu ubicación en Firefox con un complemento gratuito y de código abierto. GeoSpoof reemplaza la API de geolocalización y la zona horaria para que los sitios vean la ubicación que elijas.",
        ogTitle: "Falsea tu ubicación en Firefox",
      },
      safari: {
        storeName: "el App Store",
        storeShort: "App Store",
        intro:
          "Safari en iOS, iPadOS y macOS comunica tu ubicación y tu zona horaria a los sitios web como cualquier navegador. GeoSpoof se instala desde el App Store y funciona como una extensión de Safari, reemplazando esas API para que los sitios vean la ubicación que elijas. El falseo de ubicación y de zona horaria es totalmente compatible; la protección WebRTC no está disponible en Safari.",
        enableStep:
          "Después de instalarlo desde el App Store, activa GeoSpoof desde el menú de extensiones de Safari (la pieza de puzle en la barra de direcciones en iOS, o Safari → Ajustes → Extensiones en macOS).",
        extraFaqQ: "¿Funciona el falseo de ubicación en Safari en el iPhone?",
        extraFaqA:
          "Sí. GeoSpoof es una extensión de Safari disponible en el App Store para iOS, iPadOS y macOS. Una vez activada para un sitio, reemplaza la geolocalización y la zona horaria que Safari informa. La protección WebRTC es la única función no disponible en Safari.",
        metaTitle:
          "Falsea tu ubicación en Safari — extensión gratuita | GeoSpoof",
        metaDescription:
          "Falsea tu ubicación en Safari con una extensión gratuita del App Store. GeoSpoof reemplaza la API de geolocalización y la zona horaria en iOS, iPadOS y macOS.",
        ogTitle: "Falsea tu ubicación en Safari",
      },
    },
  },
  vpn: {
    meta: {
      title:
        "¿Necesitas una VPN con GeoSpoof? Dos capas de privacidad | GeoSpoof",
      description:
        "GeoSpoof oculta la ubicación, la zona horaria y el WebRTC que tu navegador informa. Una VPN sin registros oculta tu IP — la única señal que una extensión no puede cambiar.",
      ogTitle: "¿Necesitas una VPN con GeoSpoof?",
    },
    hero: {
      mapAlt: "Proton VPN oculta tu dirección IP",
      badge: "La privacidad de la ubicación tiene dos capas",
      headingPre: "¿Necesitas una VPN con ",
      headingPost: "?",
      answer:
        "GeoSpoof oculta la ubicación de tu navegador. Una VPN oculta tu IP. Para una privacidad completa, quieres las dos.",
      disclosureLabel: "Aviso de afiliación:",
      disclosureBody:
        "Colaboramos con Proton VPN. Si te suscribes a través de nuestro enlace, ganamos una comisión sin coste adicional para ti.",
      ctaPlans: "Ver los planes de Proton VPN",
      discountSticker: "Hasta un {discount} de descuento",
      learnMore: "Saber más",
      moneyBack: "Garantía de devolución de 30 días",
      platformsAria:
        "Proton VPN está disponible en Windows, macOS, Linux, iOS y Android",
    },
    twoLayers: {
      heading: "Dos capas, dos herramientas",
      intro:
        "La privacidad de la ubicación tiene dos capas independientes. GeoSpoof sella la capa del navegador; una VPN sella la capa de red. Falsea una pero deja la otra y la incoherencia te delata. Un navegador que informa Tokio mientras tu IP sigue apuntando a Nueva York es fácil de detectar.",
      browserTitle: "La capa del navegador",
      browserBody:
        "Los sitios web leen tu ubicación desde la API de geolocalización, tu región desde las API de zona horaria y tus IP locales desde WebRTC. GeoSpoof reemplaza todo esto para que informen la ubicación que elijas.",
      browserWho: "Gestionado por GeoSpoof",
      networkTitle: "La capa de red",
      networkBody:
        "Cada sitio también ve la dirección IP pública desde la que llega tu conexión, que corresponde a una ciudad real. Ninguna extensión del navegador puede cambiarla — está por debajo del navegador, en la red.",
      networkWho: "Gestionado por una VPN",
      primerLead:
        "¿Quieres un análisis más profundo y neutral? Jonah Aragon de Privacy Guides tiene una introducción clara sobre ",
      primerLink: "lo que una VPN hace y no hace realmente",
    },
    whyProton: {
      eyebrow: "La VPN en la que confiamos",
      heading: "Por qué Proton VPN",
      intro:
        "GeoSpoof es de código abierto y no guarda ningún registro. En privacidad, la única confianza que vale es la que se puede verificar. Proton se exige el mismo listón: apps de código abierto, una política sin registros auditada de forma independiente y jurisdicción suiza.",
      reason1Title: "Sin registros, auditada de forma independiente",
      reason1Body:
        "La política sin registros de Proton ha sido auditada de forma independiente en repetidas ocasiones, no solo afirmada, y puesta a prueba en solicitudes legales reales.",
      reason2Title: "Suiza, de código abierto",
      reason2Body:
        "Con sede en Suiza bajo una sólida ley de privacidad, con apps totalmente de código abierto que cualquiera puede inspeccionar — el mismo enfoque verificable que GeoSpoof.",
      reason3Title: "Funciona con la Sincronización con VPN",
      reason3Body:
        "La Sincronización con VPN de GeoSpoof mantiene tu ubicación falseada ajustada a la región de salida de tu VPN automáticamente — con Proton, o cualquier otra VPN que elijas.",
      calloutLead: "No nos creas sin más.",
      calloutBodyPre: " Proton es una de las pocas VPN recomendadas por ",
      calloutLink: "Privacy Guides",
      calloutBodyPost:
        ", un recurso de privacidad independiente y gestionado por la comunidad. GeoSpoof funciona con cualquier VPN, así que nunca quedas atado; recomendamos Proton por las razones de código abierto y auditoría que mencionamos arriba, pero la decisión correcta es aquella en la que confíes.",
    },
    plan: {
      imgAlt: "Pantalla de inicio de la app de Proton VPN",
      heading: "Elige el plan que mejor te venga",
      body: "GeoSpoof es de código abierto. Para la capa de IP, te orientaríamos hacia Proton VPN Plus. El plan de 2 años tiene un {discount} de descuento sobre la tarifa estándar de Proton — el precio mensual más bajo y la mejor relación calidad-precio en general. ¿Prefieres probarlo antes? El plan mensual también funciona.",
      cta: "Ver los planes de Proton VPN",
      discountLine: "{discount} de descuento en el plan de 2 años",
    },
    inlineDisclosure:
      "Aviso — este es un enlace de afiliado. Suscríbete a través de él y Proton nos comparte una pequeña parte, sin coste adicional para ti. Así es como ayudamos a mantener GeoSpoof de código abierto e independiente.",
    faq: {
      heading: "Preguntas frecuentes",
      items: [
        {
          q: "¿Necesito una VPN si uso GeoSpoof?",
          a: "Para una privacidad de ubicación completa, sí — pero no porque GeoSpoof se quede corto. GeoSpoof cambia la ubicación, la zona horaria y los datos de WebRTC que tu navegador comunica a los sitios web. La señal más fuerte que queda es tu dirección IP, y solo una VPN puede cambiarla. Las dos cubren capas distintas; juntas cuentan una única historia coherente.",
        },
        {
          q: "¿Puedo usar una VPN distinta con GeoSpoof?",
          a: "Sí. GeoSpoof funciona con cualquier VPN. Nada está atado a Proton, y la Sincronización con VPN funciona igual con todas. Mullvad e IVPN son otros proveedores sin registros bien valorados en la comunidad de la privacidad. Recomendamos Proton porque es totalmente de código abierto, auditado de forma independiente y recomendado por Privacy Guides, pero la decisión es totalmente tuya.",
        },
        {
          q: "¿Por qué GeoSpoof recomienda Proton VPN?",
          a: "Proton no guarda registros, tiene su sede en Suiza, es totalmente de código abierto y ha superado repetidas auditorías independientes. Esos son los mismos valores verificables y centrados en la privacidad sobre los que se construye GeoSpoof. También es una de las pocas VPN recomendadas por Privacy Guides, un recurso independiente que no acepta dinero de afiliación. La Sincronización con VPN funciona con Proton exactamente igual que con cualquier otra VPN.",
        },
        {
          q: "¿Necesito una VPN para usar GeoSpoof?",
          a: "No. El falseo principal de GeoSpoof funciona sin una VPN. Una VPN solo oculta tu dirección IP real — es una herramienta complementaria, no un requisito para usar GeoSpoof.",
        },
        {
          q: "¿GeoSpoof gana dinero si me registro?",
          a: "Si te suscribes a Proton a través de nuestro enlace, Proton nos comparte una parte de la venta, sin coste adicional para ti. Ayuda a mantener GeoSpoof de código abierto y sin publicidad. Recomendamos Proton por sus méritos (código abierto, auditado de forma independiente y recomendado por Privacy Guides), y la comisión no cambia cuál es el plan realmente mejor para ti.",
        },
      ],
    },
    disclosure: {
      label: "Aviso de afiliación:",
      body: "GeoSpoof es una utilidad independiente y de código abierto, y no está afiliada ni respaldada por Proton. Cuando compras un plan a través de nuestra recomendación, Proton nos comparte una parte de la venta, sin coste adicional para ti. Ayuda a mantener GeoSpoof gratuito, de código abierto y sin publicidad. Recomendamos Proton por sus méritos (código abierto, auditado de forma independiente y recomendado por Privacy Guides), no por la comisión, y GeoSpoof funciona con cualquier VPN que prefieras.",
    },
  },
  support: {
    meta: {
      title: "Soporte de GeoSpoof — arregla el falseo, la Sincro VPN y la configuración",
      description:
        "Obtén ayuda con GeoSpoof: arregla el falseo de ubicación que no funciona, resuelve tiempos de espera de la Sincronización con VPN, problemas de WebRTC y la configuración en navegador o móvil — o contacta con nuestro equipo.",
    },
    heading: "¿Cómo podemos ayudarte?",
    subhead:
      "Encuentra respuestas a los problemas comunes más abajo, o contáctanos directamente.",
    commonIssues: "Problemas comunes",
    faqs: [
      {
        q: "El falseo no funciona después de instalar la extensión",
        a: "La extensión se inyecta en las páginas al cargarlas, así que las pestañas que ya estaban abiertas cuando la instalaste o la activaste aún no estarán protegidas. Recarga cada pestaña que quieras proteger tras activar la Protección de ubicación. Si sigue sin funcionar, prueba a desactivar y reactivar la extensión, y luego recarga de nuevo.",
      },
      {
        q: "La Sincronización con VPN muestra un tiempo de espera o un error de red",
        a: "La Sincronización con VPN consulta algunos servicios públicos de geolocalización por IP para detectar la región de salida de tu VPN. Algunas VPN o cortafuegos bloquean las solicitudes salientes a estos servicios. Prueba a desactivar temporalmente el cortafuegos o el kill switch de tu VPN. Si el problema persiste, usa las pestañas Buscar ciudad o Introducir coordenadas para definir tu ubicación manualmente.",
      },
      {
        q: "El falseo dejó de funcionar tras una actualización del navegador",
        a: "Las actualizaciones del navegador cambian a veces cómo interactúan las extensiones con las API de las páginas. Asegúrate de tener la última versión de GeoSpoof. Comprueba la versión en la pestaña Detalles del popup y compárala con la última versión en GitHub. Si vas por detrás, actualiza a través del gestor de extensiones de tu navegador.",
      },
      {
        q: "Un sitio web concreto no se está falseando",
        a: "Algunos sitios usan detección de ubicación en el servidor basada en tu dirección IP en lugar de la API de geolocalización del navegador. GeoSpoof solo reemplaza las API del navegador — no cambia tu dirección IP. Para una coherencia de ubicación total, usa GeoSpoof junto con una VPN apuntada a la misma región.",
      },
      {
        q: "La extensión funciona en el escritorio pero no en mi teléfono",
        a: "En Firefox para Android, la extensión es totalmente compatible con Firefox 140 y posteriores. En Safari de iOS y macOS, la extensión está disponible en el App Store — toca el icono de la pieza de puzle en la barra de direcciones y activa GeoSpoof para el sitio que quieras proteger. Chrome para iOS y Android no admite extensiones.",
      },
      {
        q: "La Protección WebRTC no está disponible / aparece atenuada",
        a: "La Protección WebRTC usa una API de privacidad del navegador que no está disponible en todas las plataformas. Es compatible con Firefox y los navegadores basados en Chromium en el escritorio. No está disponible en Safari ni en Firefox para Android.",
      },
      {
        q: 'Veo "Las extensiones no pueden ejecutarse en esta página"',
        a: "Los navegadores impiden que las extensiones se ejecuten en páginas internas como about:blank, chrome://, about:newtab y las páginas de las tiendas de extensiones. Es un límite de seguridad del navegador que no se puede eludir. GeoSpoof funciona en todos los sitios web normales.",
      },
    ],
    copy: "Copiar",
    copied: "✓ Copiado",
    copyAria: "Copiar la dirección de correo",
    stillNeedHelp: "¿Aún necesitas ayuda?",
    contactBody:
      "Envíanos un correo y te responderemos en uno o dos días.",
    reportBugsLead: "También puedes reportar errores en ",
  },
  about: {
    meta: {
      title: "Acerca de GeoSpoof — Quién lo crea | GeoSpoof",
      description:
        "GeoSpoof es un falseador de ubicación y zona horaria de código abierto creado por Anthony Sgro — sin cuentas, sin rastreo y honesto sobre lo que hace.",
      ogTitle: "Acerca de GeoSpoof",
    },
    greeting: "👋 Hola, soy Anthony",
    tagline: "Yo hago GeoSpoof.",
    githubAria: "Anthony Sgro en GitHub",
    linkedinAria: "Anthony Sgro en LinkedIn",
    p1a: "Soy desarrollador de software, y GeoSpoof empezó como ",
    p1strong: "algo que quería para mí mismo",
    p1b: ": una forma sencilla de controlar la ubicación y la zona horaria que mi navegador iba revelando, sin registrarme en nada ni entregar mis datos a otra empresa más. Se convirtió en una herramienta que mucha gente usa ahora a diario, algo que todavía me sorprende.",
    p2a: "Es de código abierto, ",
    p2strong: "sin cuentas y sin nada que registrar",
    p2b: ". Tus ajustes simplemente viven en tu navegador. Y si alguna vez tienes curiosidad por lo que hace en realidad, el código es público y la ",
    verifyLink: "página de verificación",
    p2c: " te muestra exactamente lo que los sitios web pueden leer sobre ti.",
    p3a: "Hay un nivel Pro opcional para las ",
    p3strong: "funciones avanzadas",
    p3b: ", mientras que el falseo del día a día sigue siendo gratis.",
    p4a: "¿Tienes una pregunta, una idea, o simplemente quieres ",
    p4em: "saludar",
    p4b: "? La ",
    supportLink: "página de soporte",
    p4c: " me llega directamente, o encuéntrame en GitHub y LinkedIn arriba. Gracias por pasarte.",
  },
  spoofTimezone: {
    meta: {
      title:
        "Falsea la zona horaria de tu navegador — extensión gratuita | GeoSpoof",
      description:
        "Cambia o falsea la zona horaria de tu navegador para que coincida con cualquier ubicación. GeoSpoof reemplaza Date, Intl y Temporal para que tu reloj no revele tu región real.",
      ogTitle: "Falsea la zona horaria de tu navegador",
    },
    hero: {
      breadcrumbHome: "Inicio",
      breadcrumb: "Falsear la zona horaria",
      badge: "Falseo de zona horaria",
      headingPre: "Falsea la ",
      headingEmphasis: "zona horaria",
      introPre:
        "Los sitios web leen tu zona horaria en el instante en que carga una página — sin pedir permiso — a través de ",
      introMid: " y ",
      introPost:
        ". GeoSpoof los reemplaza para que tu reloj coincida con la ubicación que elijas, no con el lugar donde realmente estás.",
      ctaFallback: "Consigue GeoSpoof gratis",
      testTimezone: "Prueba tu zona horaria",
    },
    whatLeaks: {
      heading: "Lo que revela tu navegador",
      intro:
        "A diferencia de la API de geolocalización, las superficies de zona horaria nunca piden permiso — responden en el momento en que carga una página. Un solo reloj que no coincide puede echar por tierra una ubicación GPS falseada.",
      reveals1: "Devuelve un nombre IANA como America/New_York.",
      reveals2: "Devuelve tu desfase UTC en minutos.",
      surface3Api: "Temporal y marcas de tiempo del documento",
      reveals3:
        "Las API de tiempo más nuevas y las marcas de tiempo de la página exponen la misma zona.",
    },
    howTo: {
      heading: "Cómo falsear tu zona horaria",
      schemaName: "Cómo falsear la zona horaria de tu navegador",
      schemaDesc:
        "Cambia la zona horaria que tu navegador informa a los sitios web, sin cambiar el reloj de tu sistema, usando la extensión gratuita GeoSpoof.",
      steps: [
        {
          name: "Instala GeoSpoof",
          text: "Añade la extensión gratuita GeoSpoof para tu navegador — Firefox, Chrome, Brave, Edge o Safari.",
        },
        {
          name: "Define tu ubicación",
          text: "Busca una ciudad, introduce coordenadas o usa la Sincronización con VPN para que coincida con la región de salida de tu VPN.",
        },
        {
          name: "La zona horaria se ajusta automáticamente",
          text: "GeoSpoof reemplaza Date, Intl.DateTimeFormat y Temporal para que cada API basada en el reloj informe la zona horaria de la ubicación que elegiste.",
        },
        {
          name: "Verifica que funcionó",
          text: "Abre la página de verificación de GeoSpoof para confirmar que la zona horaria informada coincide con tu ubicación falseada.",
        },
      ],
    },
    whyItMatters: {
      heading: "Una ubicación falseada necesita un reloj que coincida",
      body: "Una VPN mueve tu IP y GeoSpoof mueve tus coordenadas GPS — pero si tu zona horaria sigue marcando tu región real, la incoherencia te delata. GeoSpoof mantiene tu zona horaria ajustada a la ubicación que elijas automáticamente, y la reajusta cuando tu VPN cambia de servidor de salida, para que tu geolocalización, tu zona horaria y tu IP cuenten la misma historia.",
      blogLinkLead: "¿Quieres el análisis técnico a fondo? ",
      blogLinkText: "Lee por qué tu zona horaria revela tu ubicación",
    },
    faq: {
      heading: "Preguntas frecuentes",
      items: [
        {
          q: "¿Cómo cambio la zona horaria de mi navegador?",
          a: "Los navegadores toman su zona horaria de tu sistema operativo, y la mayoría no te deja anularla por sitio. GeoSpoof cambia la zona horaria que tu navegador informa a los sitios web sin tocar el reloj de tu sistema: instala la extensión, define una ubicación y reemplaza las API de zona horaria de JavaScript para que coincidan.",
        },
        {
          q: "¿Puedo falsear mi zona horaria sin cambiar el reloj de mi sistema?",
          a: "Sí. GeoSpoof funciona a nivel de las API del navegador, así que cambia lo que leen los sitios web (Intl.DateTimeFormat, Date, Temporal) mientras el reloj real y los ajustes de tu ordenador permanecen exactamente como están.",
        },
        {
          q: "¿Una VPN cambia la zona horaria de mi navegador?",
          a: "No. Una VPN solo cambia tu dirección IP. Tu navegador sigue informando su propia zona horaria desde tu sistema operativo, así que una VPN en otro país con la zona horaria de tu casa es una incoherencia fácil de detectar. GeoSpoof ajusta la zona horaria a tu ubicación falseada para cerrar esa brecha.",
        },
        {
          q: "¿Por qué mi zona horaria tiene que coincidir con mi ubicación?",
          a: "Si falseas tu ubicación GPS o usas una VPN pero dejas tu zona horaria en tu región real, las dos no concuerdan — y esa incoherencia es una pista común y fácil de detectar. Ajustar tu zona horaria a la ubicación que elijas hace que cada señal cuente la misma historia.",
        },
        {
          q: "¿GeoSpoof falsea la zona horaria automáticamente?",
          a: "Sí. Cuando defines una ubicación o sincronizas con tu VPN, GeoSpoof resuelve la zona horaria correcta para esas coordenadas y la aplica automáticamente — incluso cuando tu VPN cambia de servidor de salida.",
        },
      ],
    },
  },
  verify: {
    meta: {
      title:
        "Prueba de ubicación del navegador — Ve lo que los sitios saben de ti | GeoSpoof",
      description:
        "Prueba gratuita de ubicación del navegador. Ve la geolocalización, la zona horaria y la IP que los sitios web leen sobre ti ahora mismo — y si tu navegador revela tu ubicación real.",
    },
    eyebrow: "Verificación",
    heading: "Lo que los sitios web pueden ver de ti",
    refresh: "Actualizar",
    refreshAria: "Actualizar — recarga la página para ver tus últimos valores",
    introMobile: "Valores en vivo que los sitios web pueden leer de ti ahora mismo.",
    introDesktop:
      "Valores en vivo de tu navegador ahora mismo — la ubicación, la zona horaria y la IP que los sitios web pueden leer. Con GeoSpoof activo, reflejan tu ubicación falseada en lugar de la real.",
    vpnSyncNote:
      "¿Usas la Sincronización automática con VPN? Los cambios pueden tardar hasta 10 segundos — toca Actualizar para ver lo más reciente.",
    rows: {
      geolocation: "Geolocalización",
      timezone: "Zona horaria",
      currentTime: "Hora actual",
      ipAddress: "Dirección IP",
      webrtc: "WebRTC",
      waitingPermission: "Esperando permiso…",
      blockedDenied: "Bloqueado / denegado",
      lookingUp: "Buscando…",
      lookupFailed: "Búsqueda fallida",
      probing: "Sondeando…",
      noLeak: "No se detectan fugas de IP",
    },
    vpnCard: {
      line1:
        "Tu dirección IP es la única señal que GeoSpoof no puede cambiar. Solo una VPN puede.",
      line2: "La que recomendamos tiene hasta un {discount} de descuento.",
      cta: "Ver la VPN sin registros que recomendamos",
    },
    apiSection: {
      eyebrow: "Superficie de las API del navegador",
      description:
        "Superficies clave de huella digital que revisan los atacantes. Expande cualquier grupo para ver los valores que obtienen — todos deberían contar la misma historia.",
    },
    supportLead: "¿Ves algo mal, o un resultado que no esperabas? ",
    supportLink: "Obtén soporte",
    verdict: {
      running: "Ejecutando comprobaciones…",
      runningSub: "Leyendo tu navegador y sondeando en busca de fugas.",
      allGood: "Todas las comprobaciones superadas",
      allGoodSub: "Nada de lo que comprobamos te delata.",
      exposed: "Algunas señales están expuestas",
      problemWebrtc: "WebRTC filtra tu IP real",
      problemGeo: "La ubicación no coincide con la IP",
      problemTz: "La zona horaria no coincide con la IP",
      crossRef:
        "Un sitio que cruce estas señales podría marcarte como sospechoso.",
      installFree: "Instala GeoSpoof gratis",
      alreadyHave: "¿Ya tienes GeoSpoof?",
    },
    dialog: {
      title: "¿Ya tienes GeoSpoof en marcha?",
      description:
        "Una lista de comprobación rápida resuelve casi todas las señales marcadas.",
      ipMismatchLocation: "¿La IP no coincide con tu ubicación?",
      ipMismatchTimezone: "¿La IP no coincide con tu zona horaria?",
      ipMismatchBody:
        "Es lo esperado cuando la Sincronización con VPN está desactivada — GeoSpoof solo ajusta tu IP cuando la activas. Si querías mantener tu IP real, esto funciona según lo previsto.",
      autoSyncBold: "¿Acabas de activar la Sincronización automática con VPN?",
      autoSyncBody:
        "Dale hasta ~10 segundos después de actualizar para ponerse al día, luego vuelve a comprobar — la sincronización automática no es instantánea como la manual.",
      updateBold: "Actualiza a la última versión.",
      updateBody: "Los nuevos trucos de huella digital se parchean continuamente. ",
      downloadOptions: "Ver opciones de descarga",
      checkSiteBold: "Comprueba que está activo para este sitio.",
      checkSiteBody:
        "Mira el icono de la barra de herramientas; si limitas por lista de permitidos o de bloqueados, incluye este sitio.",
      reloadBold: "Recarga tras activar o actualizar.",
      reloadBody: "Algunas superficies solo se aplican al cargar la página de nuevo.",
      stillStuck: "¿Sigues atascado? Contacta con soporte",
      gotIt: "Entendido",
    },
    faq: {
      heading: "Preguntas frecuentes",
      items: [
        {
          q: "¿Cuál es la geolocalización de mi navegador?",
          a: "La geolocalización de tu navegador es la latitud y la longitud que entrega a los sitios web a través de la API de geolocalización de JavaScript. El mapa y las coordenadas de arriba muestran exactamente lo que leen los sitios cuando preguntan dónde estás. Con GeoSpoof activo, esa es tu ubicación falseada en lugar de la real.",
        },
        {
          q: "¿Pueden los sitios web ver mi ubicación real aunque use una VPN?",
          a: "Sí. Una VPN solo cambia tu dirección IP. Tu navegador sigue informando su propia geolocalización a nivel de GPS, la zona horaria del sistema y la configuración regional — y WebRTC puede filtrar tu IP real por completo. Si esas señales no concuerdan con la ubicación de salida de tu VPN, un sitio puede darse cuenta de que algo no encaja. Esta página marca exactamente esas incoherencias.",
        },
        {
          q: "¿Por qué mi zona horaria no coincide con mi dirección IP?",
          a: "Tu zona horaria proviene de tu sistema operativo, mientras que la ubicación de tu IP proviene de tu red o VPN. Si te conectas a través de una VPN en otro país pero dejas el reloj de tu sistema en la zona horaria de tu casa, las dos no cuadrarán — una pista común y fácil de detectar. GeoSpoof ajusta tu zona horaria a tu ubicación falseada para cerrar esa brecha.",
        },
        {
          q: "¿Qué es una fuga de WebRTC?",
          a: "WebRTC es una función del navegador para audio, vídeo y datos en tiempo real. Puede revelar tus direcciones IP reales, pública y local, directamente a un sitio web — eludiendo tu VPN — a menos que se bloquee. La comprobación de WebRTC de arriba sondea esa fuga e informa cualquier dirección que consiga exponer.",
        },
        {
          q: "¿Es gratuita esta prueba de ubicación del navegador?",
          a: "Sí. La prueba se ejecuta por completo en tu navegador, no cuesta nada y no requiere cuenta. Lee las mismas señales que puede leer cualquier sitio web y te las muestra en lenguaje claro.",
        },
      ],
    },
  },
  engineLevel: {
    meta: {
      title:
        "Oculta la barra “empezó a depurar este navegador” de Chrome | GeoSpoof",
      description:
        "El Falseo a nivel de motor de GeoSpoof usa la API de depuración de Chrome, así que Chrome muestra una barra de depuración. Aquí te explicamos qué significa, por qué es seguro y cómo ocultarla.",
      ogTitle: "Oculta la barra “empezó a depurar este navegador” de Chrome",
    },
    hero: {
      breadcrumbHome: "Inicio",
      breadcrumb: "Falseo a nivel de motor",
      badge: "Chrome · Falseo a nivel de motor",
      headingPre: "Oculta la barra ",
      headingEmphasis: "“empezó a depurar este navegador”",
      headingPost: " de Chrome",
      intro:
        "Chrome muestra una barra de “empezó a depurar este navegador” mientras el Falseo a nivel de motor está activado. Es inofensiva — aquí te explicamos cómo ocultarla.",
      ctaHowTo: "Cómo ocultar la barra",
      ctaFallback: "Consigue GeoSpoof gratis",
      figureAlt:
        "Chrome mostrando una barra de notificación “GeoSpoof empezó a depurar este navegador” en la parte superior de la ventana mientras el Falseo a nivel de motor está activado",
      figCaption:
        "La barra de “empezó a depurar este navegador” que Chrome muestra mientras el Falseo a nivel de motor está activado.",
    },
    whatBar: {
      heading: "Qué significa la barra",
      intro:
        "El Falseo a nivel de motor aplica tu zona horaria a nivel del navegador, antes de que se ejecute el primer script de una página, así que también cubre los procesos en segundo plano. Para llegar tan profundo, GeoSpoof usa la API de depuración de Chrome — y Chrome lo anuncia con una barra de notificación.",
      point1Title: "Es un aviso estándar de Chrome",
      point1Body:
        "Chrome muestra la barra para cualquier extensión que use la API de depuración — la misma API que usan las DevTools. Aparece en el momento en que GeoSpoof se conecta, no porque algo haya salido mal.",
      point2Title: "GeoSpoof solo establece una anulación de zona horaria",
      point2Body:
        "La conexión de depuración se usa únicamente para aplicar tu zona horaria falseada en los marcos y procesos. No lee el contenido de tu página, tus pulsaciones de teclas ni tu navegación — y el código es de código abierto.",
      point3Title: "La barra es cosmética",
      point3Body:
        "No cambia nada sobre cómo te ven los sitios. Ocultarla consiste únicamente en quitar la franja de la parte superior de la ventana.",
    },
    howTo: {
      heading: "Cómo ocultar la barra",
      introPre: "Inicia Chrome con el parámetro ",
      introPost:
        ". Cierra Chrome primero, luego sigue los pasos para tu sistema.",
    },
    guides: {
      win: {
        step1: "Cierra todas las ventanas de Chrome.",
        step2:
          "Haz clic derecho en el acceso directo de Chrome que uses (barra de tareas, escritorio o menú Inicio) y elige Propiedades.",
        step3a: "En el campo ",
        step3strong: "Destino",
        step3mid: ", deja tal cual la ruta entre comillas a ",
        step3code: "chrome.exe",
        step3end:
          " y añade el parámetro después de la comilla de cierre (ten en cuenta el espacio inicial).",
        step4: "Haz clic en Aceptar, luego abre Chrome desde ese acceso directo.",
        note: "Repite esto para cada acceso directo desde el que inicies Chrome (la barra de tareas y el menú Inicio son accesos directos distintos).",
      },
      mac: {
        step1: "Cierra Chrome por completo (⌘Q).",
        step2: "Abre Terminal y ejecuta el comando de abajo.",
        step3a:
          "Chrome se vuelve a abrir sin la barra. Para iniciarlo así siempre, guarda el comando como una ",
        step3strong: "Aplicación",
        step3end: " de Automator o un alias de shell.",
      },
      linux: {
        step1: "Cierra Chrome.",
        step2:
          "Inícialo con el parámetro, o añade el parámetro a la línea Exec= de tu lanzador .desktop de Chrome para hacerlo permanente.",
        note: "Usa chromium en lugar de google-chrome si usas Chromium.",
      },
    },
    permanent: {
      heading: "Haz que se mantenga",
      bodyPre:
        "El parámetro solo se aplica a los inicios que lo incluyen, así que la barra vuelve si abres Chrome de otra manera. Para mantenerla oculta para siempre, añade ",
      bodyMid:
        " al acceso directo o lanzador desde el que abres Chrome cada día — el campo Destino del acceso directo de Windows, una app lanzadora de macOS o tu archivo ",
      bodyDesktopCode: ".desktop",
      bodyEnd: " de Linux.",
      body2Pre:
        "¿Prefieres no complicarte? Deja el Falseo a nivel de motor desactivado — la protección estándar de GeoSpoof sigue falseando tu ",
      locationLink: "ubicación",
      body2Mid: " y tu ",
      timezoneLink: "zona horaria",
      body2End: " sin ninguna barra de depuración.",
    },
    faq: {
      heading: "Preguntas frecuentes",
      items: [
        {
          q: "¿Por qué GeoSpoof dice que está “depurando” mi navegador?",
          a: "El Falseo a nivel de motor usa la API de depuración de Chrome (el Protocolo DevTools de Chrome) — el mismo mecanismo que usan las propias DevTools de tu navegador — para establecer tu zona horaria más profundamente en el navegador de lo que puede una extensión normal. Siempre que cualquier extensión se conecta con esa API, Chrome muestra una barra de “empezó a depurar este navegador”. Es un aviso estándar de Chrome, no una señal de que algo va mal.",
        },
        {
          q: "¿Es seguro? ¿GeoSpoof está leyendo mis datos?",
          a: "GeoSpoof usa la conexión de depuración solo para aplicar una anulación de zona horaria. No lee el contenido de tu página, tus pulsaciones de teclas ni tu navegación. GeoSpoof es de código abierto, así que puedes revisar exactamente lo que envía en GitHub. Si prefieres no usarlo, deja el Falseo a nivel de motor desactivado y la protección estándar de GeoSpoof sigue falseando tu ubicación y tu zona horaria.",
        },
        {
          q: "¿Cómo oculto la barra “empezó a depurar este navegador”?",
          a: "Inicia Chrome con el parámetro {flag}. En Windows, añádelo al campo Destino del acceso directo de Chrome; en macOS, vuelve a iniciar Chrome desde Terminal con ese parámetro (o guárdalo como un lanzador); en Linux, añádelo a tu comando de inicio de Chrome o al archivo .desktop. La barra desaparece mientras el falseo sigue funcionando.",
        },
        {
          q: "¿Volverá la barra cuando reinicie Chrome?",
          a: "Sí, a menos que incluyas el parámetro en el acceso directo o lanzador que usas siempre. El parámetro solo afecta a los inicios que lo incluyen, así que abrir Chrome de otra manera hace que la barra vuelva. Añádelo a tu lanzador de cada día para que se mantenga.",
        },
        {
          q: "¿Por qué GeoSpoof no puede ocultar la barra por mí automáticamente?",
          a: "La barra la controla el propio Chrome, y solo un parámetro de inicio del navegador puede desactivarla. Las extensiones no pueden establecer los parámetros de línea de comandos de Chrome, así que este paso tienes que hacerlo tú una vez. Es una salvaguarda deliberada de Chrome en torno a la API de depuración.",
        },
        {
          q: "¿Qué es el Falseo a nivel de motor?",
          a: "Es una opción de GeoSpoof solo para Chrome que falsea tu zona horaria a nivel del motor del navegador en lugar de desde un script de página. Como se aplica antes de que se ejecute el primer script de una página y alcanza los procesos en segundo plano, cierra fugas de zona horaria que el falseo a nivel de página puede pasar por alto. La geolocalización sigue usando el método estándar de GeoSpoof, sin solicitudes de permiso.",
        },
      ],
    },
    schema: {
      howToStep1Name: "Cierra Chrome por completo",
      howToStep1Text:
        "Cierra todas las ventanas de Chrome para que el navegador se cierre del todo — el parámetro solo se aplica a un inicio nuevo.",
      howToStep2Name: "Vuelve a iniciar Chrome con el parámetro",
      howToStep2Text:
        "Inicia Chrome con el parámetro de línea de comandos {flag} siguiendo los pasos para tu sistema operativo.",
      howToStep3Name: "Hazlo permanente (opcional)",
      howToStep3Text:
        "Añade el parámetro al acceso directo o lanzador que usas normalmente, para que la barra siga oculta en cada inicio.",
      howToStep4Name: "Vuelve a abrir GeoSpoof",
      howToStep4Text:
        "El Falseo a nivel de motor sigue funcionando exactamente igual que antes — solo desaparece la barra de notificación.",
      howToName:
        "Cómo ocultar la barra “empezó a depurar este navegador” de Chrome",
      howToDesc:
        "Oculta la barra de notificación que Chrome muestra mientras el Falseo a nivel de motor de GeoSpoof está activado, iniciando Chrome con el parámetro {flag}.",
    },
  },
}
