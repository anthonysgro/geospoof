import type { Dictionary } from "./en"

/**
 * Brazilian Portuguese dictionary.
 *
 * Typed as `Dictionary`, so a missing or misnamed key fails the build. Copy is
 * hand-written (not machine-translated) — Google suppresses thin auto-translated
 * content in local results, so quality matters for the SEO payoff.
 */
export const ptBR: Dictionary = {
  nav: {
    home: "Início",
    features: "Recursos",
    blog: "Blog",
    support: "Suporte",
    download: "Baixar",
    buyMeACoffee: "Me pague um café",
    github: "GeoSpoof no GitHub",
    openMenu: "Abrir o menu de navegação",
    brandAria: "GeoSpoof - Início",
    mainNavAria: "Navegação principal",
  },
  hero: {
    badge: "Complemento para o seu VPN · Extensão",
    headlinePre: "Termine o que ",
    headlineEmphasis: "o seu VPN",
    headlinePost: " começou",
    subhead:
      "Um VPN muda o seu IP, mas o seu navegador continua revelando a sua localização real. O GeoSpoof a alinha automaticamente ao seu VPN — e a mantém alinhada quando você troca de servidor.",
    downloadFree: "Baixar grátis",
    seeWhatSitesDetect: "Veja o que os sites detectam",
    allPlatforms: "Todas as plataformas e navegadores",
    usersTrust: "Com a confiança de {count} usuários",
    usersShort: "{count} usuários",
    firefoxRating: "Firefox",
    mainPhoneAlt: "Aplicativo GeoSpoof — tela principal",
    secondaryPhoneAlt: "Aplicativo GeoSpoof — tela secundária",
  },
  footer: {
    groups: {
      guides: "Guias",
      learn: "Aprender",
      company: "Empresa",
    },
    links: {
      spoofAllBrowsers: "Falsificar a localização: todos os navegadores",
      spoofChrome: "Falsificar a localização no Chrome",
      spoofFirefox: "Falsificar a localização no Firefox",
      spoofEdge: "Falsificar a localização no Edge",
      spoofSafari: "Falsificar a localização no Safari",
      spoofTimezone: "Falsificar o fuso horário",
      needVpn: "Você precisa de um VPN?",
      testProtection: "Teste a sua proteção",
      engineLevel: "Falsificação no nível do motor (Chrome)",
      blog: "Blog",
      support: "Suporte",
      about: "Sobre",
      privacy: "Política de Privacidade",
      terms: "Termos de Serviço",
      github: "GitHub",
    },
    footerNavAria: "Navegação do rodapé",
    copyright: "© {year} GeoSpoof. Todos os direitos reservados.",
  },
  languageSwitcher: {
    label: "Idioma",
    suggestion: "Esta página está disponível em português.",
    switchAction: "Ver em português",
    dismiss: "Dispensar",
  },
  storeCta: {
    firefox: "Adicionar ao Firefox",
    chrome: "Adicionar ao Chrome",
    apple: "Baixar na App Store",
  },
  legal: {
    englishNote:
      "O texto jurídico abaixo está disponível apenas em inglês. A versão em inglês é a que prevalece.",
    privacy: {
      metaTitle: "Política de Privacidade | GeoSpoof",
      metaDescription:
        "Política de Privacidade do GeoSpoof — saiba como protegemos os seus dados e respeitamos a sua privacidade.",
      heading: "Política de Privacidade",
      lastUpdated: "Última atualização: 3 de julho de 2026",
    },
    terms: {
      metaTitle: "Termos de Serviço | GeoSpoof",
      metaDescription:
        "Termos de Serviço do GeoSpoof — entenda os termos que regem o uso da extensão.",
      heading: "Termos de Serviço",
      lastUpdated: "Última atualização: 3 de julho de 2026",
    },
  },
  testimonials: {
    eyebrow: "O que os usuários estão dizendo",
    heading: "Amado por quem se importa com a privacidade",
    subhead:
      "Avaliações reais da Chrome Web Store, do Firefox Add-ons e da App Store.",
    starsAria: "5 de 5 estrelas",
    readMoreOn: "Leia mais avaliações em",
  },
  screenshots: {
    eyebrow: "Veja em ação",
    heading: "Funciona em tudo que você navega",
    desktopAlt:
      "A extensão GeoSpoof rodando no desktop — a falsificação de localização em ação",
  },
  demo: {
    eyebrow: "Veja funcionando",
    heading: "Falsifique a sua localização em poucos cliques",
    videoAria:
      "Demo do GeoSpoof — definindo uma localização de navegador falsificada com a extensão",
    unsupported: "O seu navegador não suporta vídeo incorporado.",
    downloadInstead: "Baixar a demo",
    insteadSuffix: "em vez disso.",
  },
  features: {
    eyebrow: "Recursos",
    heading: "Cada sinal, coberto",
    subhead:
      "Os sites usam várias APIs do navegador para detectar a sua localização. O GeoSpoof substitui todas elas — de forma consistente, antes que qualquer script da página seja executado.",
    visual: {
      noIpLeak: "Sem vazamento de IP",
      noTracking: "Sem rastreamento",
      noTelemetry: "Sem telemetria",
      vpnExit: "Saída do VPN",
      spoofed: "Falsificada",
      synced: "sincronizada",
      andMore: "e mais",
    },
    items: {
      geolocation: {
        title: "Falsificação de localização",
        description:
          "Substitua navigator.geolocation para que os sites vejam as coordenadas que você escolher. Busque por cidade, insira coordenadas manualmente ou sincronize com o seu VPN.",
      },
      timezone: {
        title: "Falsificação de fuso horário",
        description:
          "Falsifique Date, Intl.DateTimeFormat e a API Temporal para que o seu fuso horário combine com a localização escolhida.",
      },
      webrtc: {
        title: "Proteção WebRTC",
        description:
          "Evite vazamentos de IP pelo WebRTC no Firefox e no Chromium usando a API de privacidade do navegador.",
      },
      vpnSync: {
        title: "Sincronização com VPN",
        description:
          "Detecte a região de saída do seu VPN automaticamente e ajuste a sua localização falsificada para combinar — com um clique.",
      },
      apis: {
        title: "Cobertura completa de APIs",
        description:
          "Toda API do navegador que revela a sua localização está coberta — injetada em document_start, antes que qualquer script da página seja executado.",
      },
    },
  },
  comparison: {
    eyebrow: "Como o GeoSpoof se compara",
    heading: "Mais do que uma troca de coordenadas",
    subhead:
      "A maioria dos falsificadores de localização faz uma coisa só: colocar uma latitude e longitude falsas no navegador. O GeoSpoof cobre todo o sinal, para que a sua localização, o seu fuso horário e o seu IP contem a mesma história.",
    featureHeader: "Recurso",
    typicalHeader: "Comum",
    yesAria: "Sim",
    limited: "Limitado",
    noAria: "Não",
    features: {
      coordinates: "Falsificar a geolocalização por coordenadas",
      oneIdentity: "Uma identidade consistente em dezenas de APIs do navegador",
      citySearch: "Definir a sua localização por busca de cidade",
      webrtc: "Proteção contra vazamento de IP por WebRTC",
      everyBrowser:
        "Todos os principais navegadores + todo o ecossistema Apple",
      verification: "Página de verificação integrada",
      vpnSync: "Sincronização com VPN e ressincronização automática",
      perSite: "Regras por site e favoritos salvos",
    },
    legend: {
      fullSupport: "Suporte completo",
      limitedDetail: ": parcial ou básico",
      notSupported: "Não suportado",
    },
    proAria: "Pro no iPhone e iPad",
    proNote:
      "Pro no iPhone e iPad. Grátis em navegadores de desktop e no Safari.",
    ctaLead: "Não acredite só na nossa palavra: ",
    ctaLink: "teste a sua proteção",
    ctaTail: " e veja cada sinal você mesmo.",
  },
  compatibility: {
    eyebrow: "Compatibilidade",
    heading: "Funciona em todos os seus dispositivos",
    subhead:
      "O GeoSpoof roda em todos os principais navegadores e plataformas. Uma extensão, proteção consistente em todo lugar.",
    platformHeader: "Plataforma",
    supportedAria: "Suportado",
    naAria: "Não aplicável",
    notSupportedAria: "Não suportado",
    legend: {
      supported: "Suportado",
      notSupported: "Não suportado",
      na: "N/D — Não aplicável",
    },
    footnote:
      "O Firefox para Android requer Firefox 140+. O Safari requer iOS 16+ ou macOS 13+.",
    setupLead:
      "Guias de configuração por navegador: falsifique a sua localização no ",
    or: " ou ",
    alsoLead: ". Você também pode ",
    timezoneLink: "falsificar o fuso horário do seu navegador",
  },
  featuredPost: {
    eyebrow: "Do blog",
    heading: "Vale a leitura",
    allPosts: "Todos os artigos",
    minRead: "min de leitura",
    readMore: "Leia mais",
  },
  blog: {
    index: {
      metaTitle: "Blog | GeoSpoof",
      metaDescription:
        "Guias e análises aprofundadas sobre falsificação de localização no navegador, privacidade de fuso horário, vazamentos de WebRTC e como aproveitar ao máximo o GeoSpoof.",
      heading: "Blog do GeoSpoof",
      subhead:
        "Guias e análises aprofundadas sobre falsificação de localização, privacidade de fuso horário e fingerprinting do navegador.",
      empty: "Ainda não há artigos — volte em breve.",
      minRead: "min de leitura",
    },
    post: {
      breadcrumbHome: "Início",
      breadcrumbBlog: "Blog",
      minRead: "min de leitura",
      faqHeading: "Perguntas frequentes",
      olderPost: "← Artigo anterior",
      newerPost: "Artigo mais recente →",
      backToAll: "← Voltar para todos os artigos",
      englishNote: "Este artigo está disponível apenas em inglês.",
    },
  },
  download: {
    eyebrow: "Baixar",
    heading: "Baixe o GeoSpoof grátis",
    subhead:
      "Disponível em todos os principais navegadores. Sem conta, sem telemetria, sem rastreamento.",
    recommendedBadge: "Recomendado para você",
    installFree: "Instalar grátis",
    otherWays: "Outras formas de baixar",
    stores: {
      firefox: {
        description: "Firefox 140+ no desktop e no Android",
        cta: "Adicionar ao Firefox",
      },
      chromium: {
        description: "Chrome, Brave e Edge",
        cta: "Adicionar ao Chrome",
      },
      apple: {
        description: "Safari no iOS e no macOS",
        cta: "Baixar na App Store",
      },
    },
    selfHosted: {
      dmg: {
        name: "Download direto (macOS)",
        description:
          "DMG autenticado para o Safari no macOS. Não requer Apple ID. Atualizações manuais — baixe novamente para atualizar.",
      },
      xpi: {
        name: "XPI auto-hospedado (Firefox)",
        description:
          "XPI assinado para forks do Firefox ou instalações manuais. Atualiza automaticamente pelo nosso manifesto de atualização.",
      },
      cta: "Versões no GitHub",
    },
  },
  skipLink: {
    toMainContent: "Pular para o conteúdo principal",
  },
  phoneCarousel: {
    embeddedHeading: "E nativo no iPhone e iPad",
    standaloneHeading: "GeoSpoof no iOS e iPadOS",
    screenshotAlt: "GeoSpoof no iOS — captura de tela {n}",
    goToSlide: "Ir para o slide {n}",
    getTheApp: "Baixe o app",
    appStore: "Baixar na App Store",
    macAppStore: "Baixar na Mac App Store",
  },
  exposureToast: {
    header: "O que cada site vê",
    exposed: "Exposto",
    visibleToSites: "Visível para os sites",
    location: "Localização",
    timezone: "Fuso horário",
    address: "Endereço",
    webrtc: "WebRTC",
    publicIpLeaking: "IP público vazando",
    noLeak: "Sem vazamento",
    yourArea: "a sua região",
    hideMyLocation: "Ocultar a minha localização",
    getGeospoof: "Baixar o GeoSpoof",
    fullReport: "Relatório completo",
    dismiss: "Dispensar",
  },
  themeToggle: {
    switchToLight: "Mudar para o modo claro",
    switchToDark: "Mudar para o modo escuro",
    changedToLight: "Tema alterado para o modo claro",
    changedToDark: "Tema alterado para o modo escuro",
  },
  carousel: {
    previousSlide: "Slide anterior",
    nextSlide: "Próximo slide",
  },
  spoofLocation: {
    hub: {
      metaTitle:
        "Falsifique a localização do seu navegador — extensão grátis | GeoSpoof",
      metaDescription:
        "Falsifique a localização do seu navegador no Chrome, Edge, Firefox ou Safari. O GeoSpoof substitui a API de geolocalização e o fuso horário para que os sites vejam a localização que você escolher.",
      ogTitle: "Falsifique a localização do seu navegador",
      badge: "Falsificação de localização",
      headingPre: "Falsifique a ",
      headingEmphasis: "localização",
      intro:
        "Os sites leem a sua localização pela API de geolocalização do navegador e o seu fuso horário — um VPN não muda nenhum dos dois. O GeoSpoof substitui ambos para que os sites vejam a localização que você escolher. Escolha o seu navegador para começar.",
      cardTitle: "Falsificar a localização no {name}",
      openGuide: "Abrir o guia",
    },
    page: {
      browserBadge: "Extensão para {name}",
      headingPre: "Falsifique a sua localização no {name}",
      ctaFallback: "Baixar o GeoSpoof para {name}",
      testLocation: "Teste a sua localização",
      breadcrumbHome: "Início",
      breadcrumbHub: "Falsificar a localização",
      howToHeading: "Como falsificar a sua localização no {name}",
      stepInstallName: "Instale o GeoSpoof para {name}",
      stepInstallText: "Adicione a extensão grátis GeoSpoof em {store}.",
      stepEnableName: "Ative no {name}",
      stepSetName: "Defina a sua localização",
      stepSetText:
        "Busque por uma cidade, insira coordenadas ou use a Sincronização com VPN para combinar com a região de saída do seu VPN.",
      stepReportsName: "O {name} informa a localização que você escolheu",
      stepReportsText:
        "O GeoSpoof substitui a API de geolocalização e o fuso horário (Date, Intl, Temporal) para que cada site veja a localização que você escolheu",
      stepReportsWebrtcSuffix:
        ", e a proteção WebRTC impede que o seu IP real vaze",
      webrtcAvailableTitle: "A proteção WebRTC está disponível no {name}.",
      webrtcAvailableBody:
        "O GeoSpoof também impede que o seu IP real vaze pelo WebRTC, que de outra forma pode contornar um VPN por completo.",
      webrtcUnavailableTitle:
        "Observação: a proteção WebRTC não está disponível no {name}.",
      webrtcUnavailableBody:
        "A falsificação de localização e de fuso horário é totalmente suportada; a API de privacidade do WebRTC em que o GeoSpoof se apoia não é exposta neste navegador.",
      faqHeading: "Perguntas frequentes",
      faqHowQ: "Como falsifico a minha localização no {name}?",
      faqHowA:
        "Instale a extensão grátis GeoSpoof, defina uma localização (busque uma cidade, insira coordenadas ou sincronize com o seu VPN), e o GeoSpoof substitui as APIs de geolocalização e de fuso horário no {name} para que os sites vejam a localização escolhida em vez da real.",
      faqVpnQ: "Um VPN muda a minha localização no {name}?",
      faqVpnA:
        "Não. Um VPN muda apenas o seu endereço IP. O {name} continua informando a própria geolocalização do navegador e o fuso horário do sistema, então eles ainda podem revelar a sua região real. O GeoSpoof falsifica os sinais do navegador; use-o junto com um VPN para uma localização consistente.",
      faqFreeQ: "O GeoSpoof é grátis para o {name}?",
      faqFreeA:
        "Sim. O GeoSpoof é grátis e de código aberto. Não há conta, nem login, nem rastreamento — cada configuração fica no seu dispositivo.",
      crossLinkLead: "Usa outro navegador? Veja ",
      crossLinkText: "falsificar a sua localização em qualquer navegador",
      schemaSoftwareDesc:
        "Falsifique a sua geolocalização e o seu fuso horário no {name} com uma extensão grátis e de código aberto.",
    },
    browsers: {
      chrome: {
        storeName: "a Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "O Chrome informa aos sites onde você está pela API de geolocalização e o seu fuso horário pelo Intl e pelo Date — e um VPN não muda nada disso. O GeoSpoof substitui esses sinais dentro do Chrome para que os sites vejam a localização que você escolher. A mesma versão também roda no Brave, Opera e outros navegadores Chromium.",
        enableStep:
          "Fixe o GeoSpoof pelo ícone de peça de quebra-cabeça (Extensões) na barra de ferramentas do Chrome para tê-lo a um clique de distância.",
        extraFaqQ:
          "O GeoSpoof funciona no Brave e em outros navegadores Chromium?",
        extraFaqA:
          "Sim. O GeoSpoof é instalado pela Chrome Web Store, que atende Chrome, Brave, Opera e outros navegadores baseados em Chromium. A falsificação de localização e de fuso horário funciona de forma idêntica em todos eles.",
        metaTitle:
          "Falsifique a sua localização no Chrome — extensão grátis | GeoSpoof",
        metaDescription:
          "Falsifique a sua localização no Chrome com uma extensão grátis. O GeoSpoof substitui a API de geolocalização e o fuso horário para que os sites vejam a localização que você escolher. O Brave também.",
        ogTitle: "Falsifique a sua localização no Chrome",
      },
      edge: {
        storeName: "a Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "O Microsoft Edge é baseado em Chromium, então expõe a sua localização da mesma forma que o Chrome — a API de geolocalização mais o fuso horário do seu sistema. O GeoSpoof é instalado pela Chrome Web Store, roda no Edge e substitui essas APIs para informar a localização que você escolher. Funciona para falsificar a sua localização no Edge tanto no Windows quanto no macOS.",
        enableStep:
          "Permita a extensão pela Chrome Web Store quando o Edge solicitar, depois fixe o GeoSpoof pelo ícone de Extensões (peça de quebra-cabeça).",
        extraFaqQ: "Posso falsificar a minha localização no Edge no Windows?",
        extraFaqA:
          "Sim. O GeoSpoof roda no Edge no Windows e no macOS. Ele substitui a localização e o fuso horário que o seu navegador informa aos sites; não muda as configurações de localização do próprio Windows, então o seu SO permanece intacto.",
        metaTitle:
          "Falsifique a sua localização no Edge — extensão grátis | GeoSpoof",
        metaDescription:
          "Falsifique a sua localização no Microsoft Edge com uma extensão grátis. O GeoSpoof substitui a API de geolocalização e o fuso horário para que os sites vejam a localização que você escolher.",
        ogTitle: "Falsifique a sua localização no Edge",
      },
      firefox: {
        storeName: "o Firefox Add-ons",
        storeShort: "Firefox Add-ons",
        intro:
          "O Firefox entrega aos sites a sua localização pela API de geolocalização e a sua região pelas APIs de fuso horário, independentemente de qualquer VPN. O GeoSpoof é instalado pelo Firefox Add-ons e substitui esses sinais. É a única versão que também roda no Firefox para Android, então você pode falsificar a sua localização no celular também.",
        enableStep:
          "Depois de adicionar o GeoSpoof pelo Firefox Add-ons, fixe-o na barra de ferramentas pelo menu de extensões para acesso rápido.",
        extraFaqQ:
          "Posso falsificar a minha localização no Firefox no Android?",
        extraFaqA:
          "Sim. O Firefox 140+ no Android suporta o GeoSpoof, então você pode falsificar a geolocalização e o fuso horário no seu celular — algo que o Chrome no celular não consegue fazer, já que não suporta extensões.",
        metaTitle:
          "Falsifique a sua localização no Firefox — complemento grátis | GeoSpoof",
        metaDescription:
          "Falsifique a sua localização no Firefox com um complemento grátis e de código aberto. O GeoSpoof substitui a API de geolocalização e o fuso horário para que os sites vejam a localização que você escolher.",
        ogTitle: "Falsifique a sua localização no Firefox",
      },
      safari: {
        storeName: "a App Store",
        storeShort: "App Store",
        intro:
          "O Safari no iOS, iPadOS e macOS informa a sua localização e o seu fuso horário aos sites como qualquer navegador. O GeoSpoof é instalado pela App Store e roda como uma extensão do Safari, substituindo essas APIs para que os sites vejam a localização que você escolher. A falsificação de localização e de fuso horário é totalmente suportada; a proteção WebRTC não está disponível no Safari.",
        enableStep:
          "Depois de instalar pela App Store, ative o GeoSpoof pelo menu de extensões do Safari (a peça de quebra-cabeça na barra de endereços no iOS, ou Safari → Configurações → Extensões no macOS).",
        extraFaqQ:
          "A falsificação de localização funciona no Safari no iPhone?",
        extraFaqA:
          "Sim. O GeoSpoof é uma extensão do Safari disponível pela App Store para iOS, iPadOS e macOS. Uma vez ativada para um site, ela substitui a geolocalização e o fuso horário que o Safari informa. A proteção WebRTC é o único recurso indisponível no Safari.",
        metaTitle:
          "Falsifique a sua localização no Safari — extensão grátis | GeoSpoof",
        metaDescription:
          "Falsifique a sua localização no Safari com uma extensão grátis da App Store. O GeoSpoof substitui a API de geolocalização e o fuso horário no iOS, iPadOS e macOS.",
        ogTitle: "Falsifique a sua localização no Safari",
      },
    },
  },
  vpn: {
    meta: {
      title:
        "Você precisa de um VPN com o GeoSpoof? Duas camadas de privacidade | GeoSpoof",
      description:
        "O GeoSpoof oculta a localização, o fuso horário e o WebRTC que o seu navegador informa. Um VPN sem registros oculta o seu IP — o único sinal que uma extensão não consegue mudar.",
      ogTitle: "Você precisa de um VPN com o GeoSpoof?",
    },
    hero: {
      mapAlt: "O Proton VPN oculta o seu endereço IP",
      badge: "A privacidade de localização tem duas camadas",
      headingPre: "Você precisa de um VPN com o ",
      headingPost: "?",
      answer:
        "O GeoSpoof oculta a localização do seu navegador. Um VPN oculta o seu IP. Para privacidade completa, você quer os dois.",
      disclosureBody:
        "Somos parceiros do Proton VPN. Se você assinar pelo nosso link, ganhamos uma comissão sem custo adicional para você.",
      ctaPlans: "Ver os planos do Proton VPN",
      partnerPricing: "Até {discount} de desconto de parceiro",
      learnMore: "Saiba mais",
      moneyBack: "Garantia de reembolso de 30 dias",
      platformsAria:
        "O Proton VPN está disponível para Windows, macOS, Linux, iOS e Android",
    },
    twoLayers: {
      heading: "Duas camadas, duas ferramentas",
      intro:
        "A privacidade de localização tem duas camadas independentes. O GeoSpoof veda a camada do navegador; um VPN veda a camada de rede. Falsifique uma mas deixe a outra e a incoerência entrega você. Um navegador informando Tóquio enquanto o seu IP ainda aponta para Nova York é fácil de sinalizar.",
      browserTitle: "A camada do navegador",
      browserBody:
        "Os sites leem a sua localização pela API de geolocalização, a sua região pelas APIs de fuso horário e os seus IPs locais pelo WebRTC. O GeoSpoof substitui tudo isso para que informem a localização que você escolher.",
      browserWho: "Tratado pelo GeoSpoof",
      networkTitle: "A camada de rede",
      networkBody:
        "Cada site também vê o endereço IP público de onde a sua conexão vem, que corresponde a uma cidade real. Nenhuma extensão de navegador pode mudá-lo — ele fica abaixo do navegador, na rede.",
      networkWho: "Tratado por um VPN",
      primerLead:
        "Quer uma análise mais aprofundada e imparcial? Jonah Aragon, do Privacy Guides, tem uma introdução clara sobre ",
      primerLink: "o que um VPN realmente faz e não faz",
    },
    whyProton: {
      eyebrow: "O VPN em que confiamos",
      heading: "Por que o Proton VPN",
      intro:
        "O GeoSpoof é de código aberto e não guarda nenhum registro. Em privacidade, a única confiança que vale é a que se pode verificar. A Proton se mantém no mesmo nível: apps de código aberto, uma política sem registros auditada de forma independente e jurisdição suíça.",
      reason1Title: "Sem registros, auditada de forma independente",
      reason1Body:
        "A política sem registros da Proton foi auditada de forma independente repetidas vezes, não apenas afirmada, e testada em pedidos judiciais reais.",
      reason2Title: "Suíça, de código aberto",
      reason2Body:
        "Sediada na Suíça sob uma forte lei de privacidade, com apps totalmente de código aberto que qualquer um pode inspecionar — a mesma abordagem verificável do GeoSpoof.",
      reason3Title: "Funciona com a Sincronização com VPN",
      reason3Body:
        "A Sincronização com VPN do GeoSpoof mantém a sua localização falsificada alinhada à região de saída do seu VPN automaticamente — com a Proton, ou qualquer outro VPN que você escolher.",
      calloutLead: "Não acredite só na nossa palavra.",
      calloutBodyPre: " A Proton é um dos poucos VPNs recomendados pelo ",
      calloutLink: "Privacy Guides",
      calloutBodyPost:
        ", um recurso de privacidade independente e mantido pela comunidade. O GeoSpoof funciona com qualquer VPN, então você nunca fica preso; recomendamos a Proton pelos motivos de código aberto e auditoria acima, mas a escolha certa é aquela em que você confia.",
    },
    plan: {
      imgAlt: "Tela inicial do app do Proton VPN",
      heading: "Escolha o plano que combina com você",
      body: "O GeoSpoof é de código aberto. Para a camada de IP, indicaríamos o Proton VPN Plus. O plano de 2 anos tem {discount} de desconto sobre a tarifa padrão da Proton — o menor preço por mês e o melhor custo-benefício geral. Prefere experimentar antes? O plano mensal também funciona.",
      cta: "Ver os planos do Proton VPN",
      unlimitedPre: "Já tem uma VPN ou quer mais de uma ferramenta? O plano ",
      unlimitedLink: "Unlimited da Proton",
      unlimitedPost: " reúne VPN com Mail, Pass, Drive e Calendar.",
    },
    inlineDisclosure:
      "Atenção — este é um link de afiliado. Assine por ele e a Proton nos repassa uma pequena parte, sem custo adicional para você. É assim que ajudamos a manter o GeoSpoof de código aberto e independente.",
    faq: {
      heading: "Perguntas frequentes",
      items: [
        {
          q: "Preciso de um VPN se eu usar o GeoSpoof?",
          a: "Para privacidade de localização completa, sim — mas não porque o GeoSpoof fique aquém. O GeoSpoof muda a localização, o fuso horário e os detalhes do WebRTC que o seu navegador informa aos sites. O sinal mais forte que resta é o seu endereço IP, e só um VPN pode mudá-lo. Os dois cobrem camadas diferentes; juntos, contam uma história consistente.",
        },
        {
          q: "Posso usar um VPN diferente com o GeoSpoof?",
          a: "Sim. O GeoSpoof funciona com qualquer VPN. Nada fica preso à Proton, e a Sincronização com VPN funciona da mesma forma com todos. Mullvad e IVPN são outros provedores sem registros bem conceituados na comunidade de privacidade. Recomendamos a Proton porque é totalmente de código aberto, auditada de forma independente e recomendada pelo Privacy Guides, mas a escolha é inteiramente sua.",
        },
        {
          q: "Por que o GeoSpoof recomenda o Proton VPN?",
          a: "A Proton é sem registros, sediada na Suíça, totalmente de código aberto e passou por repetidas auditorias independentes. Esses são os mesmos valores verificáveis e voltados à privacidade sobre os quais o GeoSpoof é construído. É também um dos poucos VPNs recomendados pelo Privacy Guides, um recurso independente que não aceita dinheiro de afiliação. A Sincronização com VPN funciona com a Proton exatamente como com qualquer outro VPN.",
        },
        {
          q: "Preciso de um VPN para usar o GeoSpoof?",
          a: "Não. A falsificação principal do GeoSpoof funciona sem um VPN. Um VPN só oculta o seu endereço IP real — é uma ferramenta complementar, não um requisito para usar o GeoSpoof.",
        },
        {
          q: "O GeoSpoof ganha dinheiro se eu me inscrever?",
          a: "Se você assinar a Proton pelo nosso link, a Proton nos repassa uma parte da venda, sem custo adicional para você. Isso ajuda a manter o GeoSpoof de código aberto e sem anúncios. Recomendamos a Proton pelos seus méritos (código aberto, auditada de forma independente e recomendada pelo Privacy Guides), e a comissão não muda qual plano é de fato o melhor para você.",
        },
      ],
    },
    disclosure: {
      label: "Aviso de afiliação:",
      body: "O GeoSpoof é um utilitário independente e de código aberto, e não tem vínculo nem endosso da Proton. Quando você compra um plano pela nossa recomendação, a Proton nos repassa uma parte da venda, sem custo adicional para você. Isso ajuda a manter o GeoSpoof grátis, de código aberto e sem anúncios. Recomendamos a Proton pelos seus méritos (código aberto, auditada de forma independente e recomendada pelo Privacy Guides), não pela comissão, e o GeoSpoof funciona com qualquer VPN que você preferir.",
    },
  },
  support: {
    meta: {
      title:
        "Suporte do GeoSpoof — resolva falsificação, Sincronização com VPN e configuração",
      description:
        "Obtenha ajuda com o GeoSpoof: resolva a falsificação de localização que não funciona, tempos limite da Sincronização com VPN, problemas de WebRTC e a configuração no navegador ou celular — ou fale com a nossa equipe.",
    },
    heading: "Como podemos ajudar?",
    subhead:
      "A maioria dos relatos se resume a uma das causas abaixo. Percorra a lista e pare quando a falsificação funcionar.",
    symptomsLead: "O que está acontecendo?",
    symptoms: [
      {
        label: "A falsificação de localização não está funcionando",
        target: "troubleshooting",
      },
      {
        label: "A Sincronização com VPN falha ou expira",
        target: "faq-vpn-sync",
      },
      {
        label: "Funciona no desktop mas não no meu celular",
        target: "faq-mobile",
      },
      { label: "Outra coisa", target: "questions" },
    ],
    lastUpdatedLabel: "Última atualização",
    troubleshooting: {
      title: "A falsificação não está funcionando em um site",
      intro:
        "Estão ordenados do mais comum ao menos comum. Provavelmente você não precisará chegar ao fim.",
      browserNote:
        "O GeoSpoof também funciona no Chrome, Edge, Brave e Safari. Os passos abaixo foram escritos para o Firefox, onde esses conflitos são mais comuns — em outros navegadores, aplique as configurações equivalentes.",
      latestReleaseLabel: "Versão mais recente",
      latestReleaseCta: "Ver a versão mais recente no GitHub",
      badgeActiveLabel: "Ativo nesta aba",
      badgeActiveAlt:
        "Ícone do GeoSpoof na barra de ferramentas com um selo mostrando que está ativo na aba atual",
      badgeDisabledLabel: "Não está em execução nesta aba",
      badgeDisabledAlt:
        "Ícone do GeoSpoof na barra de ferramentas com um selo mostrando que não está em execução na aba atual",
      geolocationDeniedAlt:
        'Um resultado de teste de fingerprint informando "Geolocation: Denied" porque o Firefox bloqueou a solicitação de localização',
      geolocationDeniedCaption:
        "Como uma solicitação de localização bloqueada aparece em um teste de fingerprint.",
      preserveOffAlt:
        'O popup do GeoSpoof com a opção "Preservar solicitações de localização" desativada',
      preserveOffCaption:
        'Popup do GeoSpoof com "Preservar solicitações de localização" desativado.',
      tzpCta: "Abrir o teste TZP",
      featuredLabel: "Melhor diagnóstico",
      steps: [
        {
          title: "Atualize a aba, ou reabra-a",
          featured: false,
          body: "O GeoSpoof só passa a valer em páginas carregadas depois de ele ser ativado. Qualquer aba que já estava aberta quando você instalou, atualizou ou reativou o GeoSpoof não será falsificada até recarregar. Atualize a aba que você está testando — se isso não ajudar, feche-a e abra de novo.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Atualize para a versão mais recente",
          featured: false,
          body: "Muitos problemas já estão corrigidos em uma versão mais nova. No popup, abra Detalhes → Avançado para ver a sua versão, depois compare com a versão mais recente abaixo e atualize pelo gerenciador de extensões do seu navegador se estiver atrasado.",
          details: [],
          note: "",
          action: "latestRelease",
        },
        {
          title: "Confirme que o GeoSpoof está em execução no site",
          featured: false,
          body: "O ícone do GeoSpoof na barra de ferramentas mostra se ele está ativo na aba atual. Se não estiver ativo, nada é falsificado — na maioria das vezes por causa do escopo de sites definido na aba Filtros.",
          details: [
            "Modo de lista de permitidos: apenas os sites listados são falsificados — adicione o site que você está testando.",
            "Modo de lista de bloqueados: certifique-se de que o site não esteja na lista.",
            'Ou mude para "Tudo" para falsificar em todo lugar.',
          ],
          note: "",
          action: "badgeCheck",
        },
        {
          title: "Redefina a permissão de localização do site",
          featured: false,
          body: 'Se um teste informar "Geolocation: Denied", o Firefox está bloqueando a solicitação — geralmente porque o aviso já foi negado uma vez com "Lembrar desta decisão" marcado.',
          details: [
            "Clique no ícone de cadeado na barra de endereços.",
            "Limpe qualquer Bloquear lembrado para localização, depois recarregue a página.",
            'Nas configurações do Firefox, confirme que "Bloquear novas solicitações que pedem acesso à sua localização" está desativado.',
            'Se a opção "Preservar solicitações de localização" do GeoSpoof estiver ativada e você negou o aviso, permita-o ou desative a opção para que o GeoSpoof responda diretamente.',
          ],
          note: "",
          action: "geolocationDenied",
        },
        {
          title: "Reinicie o navegador",
          featured: false,
          body: "Algumas APIs do navegador são configuradas na inicialização, então uma instalação, atualização ou mudança de configuração recente pode não valer até você fechar e reabrir o navegador por completo.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Teste em um perfil novo do Firefox",
          featured: true,
          body: "Um perfil limpo isola o GeoSpoof da sua configuração atual.",
          details: [
            "Abra about:profiles e crie um novo perfil.",
            "Inicie-o, instale o GeoSpoof e teste o mesmo site de novo.",
          ],
          note: "Se a falsificação funcionar no perfil limpo, o GeoSpoof em si está bem — algo no seu perfil normal está interferindo, quase sempre uma ferramenta de privacidade ou uma mudança no about:config. Os próximos dois passos cobrem isso.",
          action: "",
        },
        {
          title: "Desative ferramentas de privacidade em conflito",
          featured: false,
          body: "Ferramentas de reforço mudam muitas das mesmas APIs do navegador que o GeoSpoof e podem sobrepô-lo. Desative temporariamente as que você usa, depois tente de novo: Arkenfox, Betterfox, LibreWolf, CanvasBlocker, JShelter, Chameleon, Trace ou qualquer randomizador de fingerprint.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Verifique o about:config (avançado)",
          featured: false,
          body: "Se você reforçou o Firefox, confirme que estas preferências estão desativadas, depois reinicie e tente de novo. A Proteção Aprimorada contra Rastreamento no modo Estrito geralmente está bem e não precisa ser alterada.",
          details: [
            "privacy.resistFingerprinting",
            "privacy.fingerprintingProtection",
            "privacy.fingerprintingProtection.pbmode",
          ],
          note: "",
          action: "",
        },
        {
          title: "Confirme em um segundo teste de fingerprint",
          featured: false,
          body: "Os testes medem APIs diferentes e alguns simplesmente têm bugs. Antes de presumir que o GeoSpoof é o culpado, verifique o resultado em outro teste confiável — recomendamos a seção Region do TZP do arkenfox.",
          details: [],
          note: "",
          action: "tzpTest",
        },
      ],
    },
    commonIssues: "Outras perguntas comuns",
    faqs: [
      {
        id: "vpn-sync",
        q: "A Sincronização com VPN mostra um tempo limite ou erro de rede",
        a: "A Sincronização com VPN consulta alguns serviços públicos de geolocalização por IP para detectar a região de saída do seu VPN. Alguns VPNs ou firewalls bloqueiam solicitações de saída para esses serviços. Tente desativar temporariamente o firewall ou o kill switch do seu VPN. Se o problema continuar, use as abas Buscar Cidade ou Inserir Coordenadas para definir a sua localização manualmente.",
      },
      {
        id: "specific-site",
        q: "Um site específico não está sendo falsificado",
        a: "Alguns sites usam detecção de localização no servidor com base no seu endereço IP, e não na API de geolocalização do navegador. O GeoSpoof substitui apenas APIs do navegador — não muda o seu endereço IP. Para consistência total de localização, use o GeoSpoof junto com um VPN apontado para a mesma região.",
      },
      {
        id: "mobile",
        q: "A extensão funciona no desktop mas não no meu celular",
        a: "No Firefox para Android, a extensão é totalmente suportada no Firefox 140 e posteriores. No Safari do iOS e do macOS, a extensão está disponível pela App Store — toque no ícone de peça de quebra-cabeça na barra de endereços e ative o GeoSpoof para o site que você quer proteger. O Chrome para iOS e Android não suporta extensões.",
      },
      {
        id: "webrtc",
        q: "A Proteção WebRTC não está disponível / está esmaecida",
        a: "A Proteção WebRTC usa uma API de privacidade do navegador que não está disponível em todas as plataformas. Ela é suportada no Firefox e em navegadores baseados em Chromium no desktop. Não está disponível no Safari nem no Firefox para Android.",
      },
      {
        id: "extensions-page",
        q: 'Vejo "As extensões não podem ser executadas nesta página"',
        a: "Os navegadores impedem que as extensões sejam executadas em páginas internas como about:blank, chrome://, about:newtab e as páginas das lojas de extensões. Esse é um limite de segurança do navegador que não pode ser contornado. O GeoSpoof funciona em todos os sites normais.",
      },
    ],
    copy: "Copiar",
    copied: "✓ Copiado",
    copyAria: "Copiar o endereço de e-mail",
    stillNeedHelp: "Ainda precisa de ajuda?",
    contactBody: "Envie um e-mail e retornaremos em um ou dois dias.",
    contactChecklistLead:
      "Inclua estes itens para podermos ajudar mais rápido:",
    contactChecklist: [
      "Versão do Firefox",
      "Sistema operacional",
      "Versão do GeoSpoof",
      "Provedor de VPN (se aplicável)",
      "O site de teste de fingerprint que você está usando",
      "Uma captura de tela do resultado",
      "Se a falsificação funciona em um perfil novo do Firefox",
    ],
    reportBugsLead: "Você também pode relatar bugs no ",
  },
  about: {
    meta: {
      title: "Sobre o GeoSpoof — Quem o cria | GeoSpoof",
      description:
        "O GeoSpoof é um falsificador de localização e fuso horário de código aberto criado por Anthony Sgro — sem contas, sem rastreamento e honesto sobre o que faz.",
      ogTitle: "Sobre o GeoSpoof",
    },
    greeting: "👋 Oi, eu sou o Anthony",
    tagline: "Eu faço o GeoSpoof.",
    githubAria: "Anthony Sgro no GitHub",
    linkedinAria: "Anthony Sgro no LinkedIn",
    p1a: "Eu sou desenvolvedor de software, e o GeoSpoof começou como ",
    p1strong: "algo que eu queria para mim mesmo",
    p1b: ": um jeito fácil de controlar a localização e o fuso horário que o meu navegador estava revelando, sem me inscrever em nada ou dar os meus dados para mais uma empresa. Virou uma ferramenta que muita gente usa todos os dias agora, o que ainda me deixa meio impressionado.",
    p2a: "É de código aberto, ",
    p2strong: "sem contas e sem nada para se inscrever",
    p2b: ". As suas configurações simplesmente ficam no seu navegador. E se você algum dia ficar curioso sobre o que ele realmente faz, o código é público e a ",
    verifyLink: "página de verificação",
    p2c: " mostra exatamente o que os sites podem ler sobre você.",
    p3a: "Há um nível Pro opcional para os ",
    p3strong: "recursos extras avançados",
    p3b: ", enquanto a falsificação do dia a dia continua grátis.",
    p4a: "Tem uma pergunta, uma ideia, ou só quer ",
    p4em: "dar um oi",
    p4b: "? A ",
    supportLink: "página de suporte",
    p4c: " chega direto a mim, ou me encontre no GitHub e no LinkedIn lá em cima. Obrigado por passar por aqui.",
  },
  spoofTimezone: {
    meta: {
      title:
        "Falsifique o fuso horário do seu navegador — extensão grátis | GeoSpoof",
      description:
        "Mude ou falsifique o fuso horário do seu navegador para combinar com qualquer localização. O GeoSpoof substitui Date, Intl e Temporal para que o seu relógio não revele a sua região real.",
      ogTitle: "Falsifique o fuso horário do seu navegador",
    },
    hero: {
      breadcrumbHome: "Início",
      breadcrumb: "Falsificar o fuso horário",
      badge: "Falsificação de fuso horário",
      headingPre: "Falsifique o ",
      headingEmphasis: "fuso horário",
      introPre:
        "Os sites leem o seu fuso horário no instante em que uma página carrega — sem pedir permissão — por ",
      introMid: " e ",
      introPost:
        ". O GeoSpoof os substitui para que o seu relógio combine com a localização que você escolher, não com onde você realmente está.",
      ctaFallback: "Baixar o GeoSpoof grátis",
      testTimezone: "Teste o seu fuso horário",
    },
    whatLeaks: {
      heading: "O que o seu navegador entrega",
      intro:
        "Diferente da API de geolocalização, as superfícies de fuso horário nunca pedem permissão — elas respondem no momento em que uma página carrega. Um único relógio incompatível pode desfazer uma localização GPS falsificada.",
      reveals1: "Retorna um nome IANA como America/New_York.",
      reveals2: "Retorna o seu deslocamento UTC em minutos.",
      surface3Api: "Temporal e marcações de tempo do documento",
      reveals3:
        "APIs de tempo mais novas e as marcações de tempo da página expõem a mesma zona.",
    },
    howTo: {
      heading: "Como falsificar o seu fuso horário",
      schemaName: "Como falsificar o fuso horário do seu navegador",
      schemaDesc:
        "Mude o fuso horário que o seu navegador informa aos sites, sem mudar o relógio do seu sistema, usando a extensão grátis GeoSpoof.",
      steps: [
        {
          name: "Instale o GeoSpoof",
          text: "Adicione a extensão grátis GeoSpoof para o seu navegador — Firefox, Chrome, Brave, Edge ou Safari.",
        },
        {
          name: "Defina a sua localização",
          text: "Busque por uma cidade, insira coordenadas ou use a Sincronização com VPN para combinar com a região de saída do seu VPN.",
        },
        {
          name: "O fuso horário se alinha automaticamente",
          text: "O GeoSpoof substitui Date, Intl.DateTimeFormat e Temporal para que cada API baseada em relógio informe o fuso horário da localização que você escolheu.",
        },
        {
          name: "Verifique se funcionou",
          text: "Abra a página de verificação do GeoSpoof para confirmar que o fuso horário informado combina com a sua localização falsificada.",
        },
      ],
    },
    whyItMatters: {
      heading: "Uma localização falsificada precisa de um relógio compatível",
      body: "Um VPN move o seu IP e o GeoSpoof move as suas coordenadas GPS — mas se o seu fuso horário ainda mostra a sua região real, a incoerência entrega você. O GeoSpoof mantém o seu fuso horário alinhado à localização escolhida automaticamente, e o realinha quando o seu VPN troca de servidor de saída, para que a sua geolocalização, o seu fuso horário e o seu IP contem a mesma história.",
      blogLinkLead: "Quer o mergulho técnico? ",
      blogLinkText: "Leia por que o seu fuso horário revela a sua localização",
    },
    faq: {
      heading: "Perguntas frequentes",
      items: [
        {
          q: "Como mudo o fuso horário do meu navegador?",
          a: "Os navegadores pegam o fuso horário do seu sistema operacional, e a maioria não deixa você substituí-lo por site. O GeoSpoof muda o fuso horário que o seu navegador informa aos sites sem tocar no relógio do seu sistema: instale a extensão, defina uma localização, e ele substitui as APIs de fuso horário do JavaScript para combinar.",
        },
        {
          q: "Posso falsificar o meu fuso horário sem mudar o relógio do meu sistema?",
          a: "Sim. O GeoSpoof funciona no nível das APIs do navegador, então muda o que os sites leem (Intl.DateTimeFormat, Date, Temporal) enquanto o relógio real e as configurações do seu computador permanecem exatamente como estão.",
        },
        {
          q: "Um VPN muda o fuso horário do meu navegador?",
          a: "Não. Um VPN muda apenas o seu endereço IP. O seu navegador continua informando o próprio fuso horário do seu sistema operacional, então um VPN em outro país com o fuso horário da sua casa é uma incompatibilidade fácil de detectar. O GeoSpoof alinha o fuso horário à sua localização falsificada para fechar essa brecha.",
        },
        {
          q: "Por que o meu fuso horário precisa combinar com a minha localização?",
          a: "Se você falsifica a sua localização GPS ou usa um VPN mas deixa o seu fuso horário na sua região real, os dois se contradizem — e essa incompatibilidade é um indício comum e fácil de detectar. Alinhar o seu fuso horário à localização escolhida faz cada sinal contar a mesma história.",
        },
        {
          q: "O GeoSpoof falsifica o fuso horário automaticamente?",
          a: "Sim. Quando você define uma localização ou sincroniza com o seu VPN, o GeoSpoof determina o fuso horário correto para essas coordenadas e o aplica automaticamente — inclusive quando o seu VPN troca de servidor de saída.",
        },
      ],
    },
  },
  verify: {
    meta: {
      title:
        "Teste de localização do navegador — Veja o que os sites sabem sobre você | GeoSpoof",
      description:
        "Teste grátis de localização do navegador. Veja a geolocalização, o fuso horário e o IP que os sites leem sobre você agora mesmo — e se o seu navegador revela a sua localização real.",
    },
    eyebrow: "Verificação",
    heading: "O que os sites podem ver sobre você",
    refresh: "Atualizar",
    refreshAria:
      "Atualizar — recarregue a página para ver os seus valores mais recentes",
    introMobile:
      "Valores ao vivo que os sites podem ler sobre você agora mesmo.",
    introDesktop:
      "Valores ao vivo do seu navegador agora mesmo — a localização, o fuso horário e o IP que os sites podem ler. Com o GeoSpoof ativo, eles refletem a sua localização falsificada em vez da real.",
    vpnSyncNote:
      "Usando a Sincronização automática com VPN? As mudanças podem levar até 10 segundos — toque em Atualizar para ver o mais recente.",
    rows: {
      geolocation: "Geolocalização",
      timezone: "Fuso horário",
      currentTime: "Hora atual",
      ipAddress: "Endereço IP",
      webrtc: "WebRTC",
      waitingPermission: "Aguardando permissão…",
      blockedDenied: "Bloqueado / negado",
      lookingUp: "Consultando…",
      lookupFailed: "Consulta falhou",
      probing: "Sondando…",
      noLeak: "Nenhum vazamento de IP detectado",
    },
    vpnCard: {
      line1:
        "O seu endereço IP é o único sinal que o GeoSpoof não pode mudar. Só um VPN pode.",
      line2: "O que recomendamos está com até {discount} de desconto.",
      cta: "Proteja seu IP com o Proton VPN",
      priceNote: "Até {discount} de desconto",
      guaranteeNote: "Garantia de 30 dias",
    },
    apiSection: {
      eyebrow: "Superfície das APIs do navegador",
      description:
        "Superfícies-chave de fingerprinting que os atacantes verificam. Expanda qualquer grupo para ver os valores que eles obtêm — todos devem contar a mesma história.",
    },
    supportLead: "Viu algo errado, ou um resultado que você não esperava? ",
    supportLink: "Obter suporte",
    verdict: {
      running: "Executando verificações…",
      runningSub: "Lendo o seu navegador e sondando por vazamentos.",
      allGood: "Todas as verificações passaram",
      allGoodSub: "Nada do que verificamos entrega você.",
      exposed: "Alguns sinais estão expostos",
      problemWebrtc: "WebRTC vazando o seu IP real",
      problemGeo: "A localização não combina com o IP",
      problemTz: "O fuso horário não combina com o IP",
      crossRef: "Um site que cruzar esses sinais pode sinalizar você.",
      installFree: "Instalar o GeoSpoof grátis",
      alreadyHave: "Já tem o GeoSpoof?",
    },
    dialog: {
      title: "Já está rodando o GeoSpoof?",
      description:
        "Uma checklist rápida resolve quase todos os sinais sinalizados.",
      ipMismatchLocation: "O IP não combina com a sua localização?",
      ipMismatchTimezone: "O IP não combina com o seu fuso horário?",
      ipMismatchBody:
        "Isso é esperado quando a Sincronização com VPN está desligada — o GeoSpoof só alinha o seu IP quando você a liga. Se a intenção era manter o seu IP real, isso está funcionando como previsto.",
      autoSyncBold: "Acabou de ligar a Sincronização automática com VPN?",
      autoSyncBody:
        "Dê a ela até ~10 segundos depois de atualizar para se ajustar, então verifique de novo — a sincronização automática não é instantânea como a manual.",
      updateBold: "Atualize para a versão mais recente.",
      updateBody:
        "Novos truques de fingerprinting são corrigidos continuamente. ",
      downloadOptions: "Ver opções de download",
      checkSiteBold: "Verifique se está ativo para este site.",
      checkSiteBody:
        "Olhe o ícone na barra de ferramentas; se você limita por lista de permitidos ou bloqueados, inclua este site.",
      reloadBold: "Recarregue depois de ativar ou atualizar.",
      reloadBody:
        "Algumas superfícies só se aplicam quando a página carrega do zero.",
      stillStuck: "Ainda travado? Fale com o suporte",
      gotIt: "Entendi",
    },
    faq: {
      heading: "Perguntas frequentes",
      items: [
        {
          q: "O que é a geolocalização do meu navegador?",
          a: "A geolocalização do seu navegador é a latitude e a longitude que ele entrega aos sites pela API de geolocalização do JavaScript. O mapa e as coordenadas acima mostram exatamente o que os sites leem quando perguntam onde você está. Com o GeoSpoof ativo, essa é a sua localização falsificada em vez da real.",
        },
        {
          q: "Os sites podem ver a minha localização real mesmo quando uso um VPN?",
          a: "Sim. Um VPN muda apenas o seu endereço IP. O seu navegador continua informando a própria geolocalização em nível de GPS, o fuso horário do sistema e o idioma — e o WebRTC pode vazar o seu IP real por completo. Se esses sinais discordarem da localização de saída do seu VPN, um site pode perceber que algo está errado. Esta página sinaliza exatamente essas incompatibilidades.",
        },
        {
          q: "Por que o meu fuso horário não combina com o meu endereço IP?",
          a: "O seu fuso horário vem do seu sistema operacional, enquanto a localização do seu IP vem da sua rede ou VPN. Se você conecta por um VPN em outro país mas deixa o relógio do seu sistema no fuso horário da sua casa, os dois não vão bater — um indício comum e fácil de detectar. O GeoSpoof alinha o seu fuso horário à sua localização falsificada para fechar essa brecha.",
        },
        {
          q: "O que é um vazamento de WebRTC?",
          a: "O WebRTC é um recurso do navegador para áudio, vídeo e dados em tempo real. Ele pode revelar os seus endereços IP reais, público e local, diretamente a um site — contornando o seu VPN — a menos que seja bloqueado. A verificação de WebRTC acima sonda esse vazamento e informa qualquer endereço que conseguir expor.",
        },
        {
          q: "Este teste de localização do navegador é grátis?",
          a: "Sim. O teste roda inteiramente no seu navegador, não custa nada e não requer conta. Ele lê os mesmos sinais que qualquer site pode ler e os mostra de volta para você em linguagem clara.",
        },
      ],
    },
  },
  engineLevel: {
    meta: {
      title:
        "Oculte a barra “começou a depurar este navegador” do Chrome | GeoSpoof",
      description:
        "A Falsificação no nível do motor do GeoSpoof usa a API de depuração do Chrome, então o Chrome mostra uma barra de depuração. Veja o que ela significa, por que é segura e como ocultá-la.",
      ogTitle: "Oculte a barra “começou a depurar este navegador” do Chrome",
    },
    hero: {
      breadcrumbHome: "Início",
      breadcrumb: "Falsificação no nível do motor",
      badge: "Chrome · Falsificação no nível do motor",
      headingPre: "Oculte a barra ",
      headingEmphasis: "“começou a depurar este navegador”",
      headingPost: " do Chrome",
      intro:
        "O Chrome mostra uma barra “começou a depurar este navegador” enquanto a Falsificação no nível do motor está ativa. Ela é inofensiva — veja como ocultá-la.",
      ctaHowTo: "Como ocultar a barra",
      ctaFallback: "Baixar o GeoSpoof grátis",
      figureAlt:
        "O Chrome mostrando uma barra de notificação “O GeoSpoof começou a depurar este navegador” no topo da janela enquanto a Falsificação no nível do motor está ativa",
      figCaption:
        "A barra “começou a depurar este navegador” que o Chrome mostra enquanto a Falsificação no nível do motor está ativa.",
    },
    whatBar: {
      heading: "O que a barra significa",
      intro:
        "A Falsificação no nível do motor aplica o seu fuso horário no nível do navegador, antes que o primeiro script de uma página rode, então ela também cobre os workers em segundo plano. Para chegar tão fundo, o GeoSpoof usa a API de depuração do Chrome — e o Chrome anuncia isso com uma barra de notificação.",
      point1Title: "É um aviso padrão do Chrome",
      point1Body:
        "O Chrome mostra a barra para qualquer extensão que use a API de depuração — a mesma API que as DevTools usam. Ela aparece no momento em que o GeoSpoof se conecta, não porque algo deu errado.",
      point2Title: "O GeoSpoof só define uma substituição de fuso horário",
      point2Body:
        "A conexão de depuração é usada apenas para aplicar o seu fuso horário falsificado em frames e workers. Ela não lê o conteúdo da sua página, as suas teclas digitadas nem a sua navegação — e o código é de código aberto.",
      point3Title: "A barra é cosmética",
      point3Body:
        "Ela não muda nada sobre como os sites veem você. Ocultá-la serve apenas para remover a faixa no topo da janela.",
    },
    howTo: {
      heading: "Como ocultar a barra",
      introPre: "Inicie o Chrome com a flag ",
      introPost:
        ". Feche o Chrome primeiro, depois siga os passos para o seu sistema.",
    },
    guides: {
      win: {
        step1: "Feche todas as janelas do Chrome.",
        step2:
          "Clique com o botão direito no atalho do Chrome que você usa (barra de tarefas, área de trabalho ou menu Iniciar) e escolha Propriedades.",
        step3a: "No campo ",
        step3strong: "Destino",
        step3mid: ", deixe o caminho entre aspas para o ",
        step3code: "chrome.exe",
        step3end:
          " como está e adicione a flag depois das aspas de fechamento (note o espaço inicial).",
        step4: "Clique em OK, depois abra o Chrome por esse atalho.",
        note: "Repita para cada atalho pelo qual você inicia o Chrome (a barra de tarefas e o menu Iniciar são atalhos separados).",
      },
      mac: {
        step1: "Feche o Chrome completamente (⌘Q).",
        step2: "Abra o Terminal e execute o comando abaixo.",
        step3a:
          "O Chrome reabre sem a barra. Para iniciar assim toda vez, salve o comando como um ",
        step3strong: "Aplicativo",
        step3end: " do Automator ou um alias de shell.",
      },
      linux: {
        step1: "Feche o Chrome.",
        step2:
          "Inicie-o com a flag, ou adicione a flag à linha Exec= do seu lançador .desktop do Chrome para torná-la permanente.",
        note: "Use chromium no lugar de google-chrome se você usa o Chromium.",
      },
    },
    permanent: {
      heading: "Faça ficar permanente",
      bodyPre:
        "A flag só se aplica às inicializações que a incluem, então a barra volta se você abrir o Chrome de outra forma. Para mantê-la oculta de vez, adicione ",
      bodyMid:
        " ao atalho ou lançador pelo qual você abre o Chrome todo dia — o campo Destino do atalho do Windows, um app lançador do macOS ou o seu arquivo ",
      bodyDesktopCode: ".desktop",
      bodyEnd: " do Linux.",
      body2Pre:
        "Prefere não se preocupar? Deixe a Falsificação no nível do motor desligada — a proteção padrão do GeoSpoof ainda falsifica a sua ",
      locationLink: "localização",
      body2Mid: " e o seu ",
      timezoneLink: "fuso horário",
      body2End: " sem nenhuma barra de depuração.",
    },
    faq: {
      heading: "Perguntas frequentes",
      items: [
        {
          q: "Por que o GeoSpoof diz que está “depurando” o meu navegador?",
          a: "A Falsificação no nível do motor usa a API de depuração do Chrome (o Chrome DevTools Protocol) — o mesmo mecanismo que as próprias DevTools do seu navegador usam — para definir o seu fuso horário mais fundo no navegador do que uma extensão normal consegue. Sempre que qualquer extensão se conecta com essa API, o Chrome mostra uma barra “começou a depurar este navegador”. É um aviso padrão do Chrome, não um sinal de que algo está errado.",
        },
        {
          q: "É seguro? O GeoSpoof está lendo os meus dados?",
          a: "O GeoSpoof usa a conexão de depuração apenas para aplicar uma substituição de fuso horário. Ele não lê o conteúdo da sua página, as suas teclas digitadas nem a sua navegação. O GeoSpoof é de código aberto, então você pode revisar exatamente o que ele envia no GitHub. Se você preferir não usar, deixe a Falsificação no nível do motor desligada e a proteção padrão do GeoSpoof ainda falsifica a sua localização e o seu fuso horário.",
        },
        {
          q: "Como oculto a barra “começou a depurar este navegador”?",
          a: "Inicie o Chrome com a flag {flag}. No Windows, adicione-a ao campo Destino do atalho do Chrome; no macOS, reinicie o Chrome pelo Terminal com essa flag (ou salve-a como um lançador); no Linux, adicione-a ao seu comando de inicialização do Chrome ou ao arquivo .desktop. A barra desaparece enquanto a falsificação continua funcionando.",
        },
        {
          q: "A barra vai voltar quando eu reiniciar o Chrome?",
          a: "Sim, a menos que você incorpore a flag ao atalho ou lançador que você sempre usa. A flag só afeta as inicializações que a incluem, então abrir o Chrome de outra forma traz a barra de volta. Adicione-a ao seu lançador do dia a dia para fazer ficar permanente.",
        },
        {
          q: "Por que o GeoSpoof não pode ocultar a barra por mim automaticamente?",
          a: "A barra é controlada pelo próprio Chrome, e só uma flag de inicialização do navegador pode desligá-la. As extensões não podem definir as flags de linha de comando do Chrome, então este passo precisa ser feito uma vez por você. É uma proteção deliberada do Chrome em torno da API de depuração.",
        },
        {
          q: "O que é a Falsificação no nível do motor?",
          a: "É uma opção do GeoSpoof exclusiva do Chrome que falsifica o seu fuso horário no nível do motor do navegador em vez de por um script de página. Como ela se aplica antes que o primeiro script de uma página rode e alcança os workers em segundo plano, fecha vazamentos de fuso horário que a falsificação em nível de página pode deixar passar. A geolocalização continua usando o método padrão do GeoSpoof, sem pedir permissão.",
        },
      ],
    },
    schema: {
      howToStep1Name: "Feche o Chrome completamente",
      howToStep1Text:
        "Feche todas as janelas do Chrome para que o navegador saia por completo — a flag só se aplica a uma inicialização nova.",
      howToStep2Name: "Reinicie o Chrome com a flag",
      howToStep2Text:
        "Inicie o Chrome com a flag de linha de comando {flag} usando os passos para o seu sistema operacional.",
      howToStep3Name: "Torne permanente (opcional)",
      howToStep3Text:
        "Adicione a flag ao atalho ou lançador que você normalmente usa, para que a barra continue oculta em cada inicialização.",
      howToStep4Name: "Reabra o GeoSpoof",
      howToStep4Text:
        "A Falsificação no nível do motor continua funcionando exatamente como antes — só a barra de notificação sumiu.",
      howToName:
        "Como ocultar a barra “começou a depurar este navegador” do Chrome",
      howToDesc:
        "Oculte a barra de notificação que o Chrome mostra enquanto a Falsificação no nível do motor do GeoSpoof está ativa, iniciando o Chrome com a flag {flag}.",
    },
  },
}
