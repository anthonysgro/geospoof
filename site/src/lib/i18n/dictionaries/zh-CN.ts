import type { Dictionary } from "./en"
/**
 * Simplified Chinese (zh-CN) dictionary.
 *
 * AI-authored, pending native-speaker QA before it drives rankings.
 *
 * Terminology is aligned with the browser extension (`_locales/zh_CN`):
 *   spoof / spoofing -> 伪造  (伪装 only for the technical "Engine-level
 *   Spoofing" = 引擎级伪装)
 *   geolocation -> 地理位置 · location -> 位置 · timezone -> 时区
 *   Sync with VPN -> 与 VPN 同步 · WebRTC Protection -> WebRTC 保护
 * Brand/technical tokens (GeoSpoof, VPN, WebRTC, Chrome, Firefox, Edge, Safari,
 * Brave, Opera, Chromium, iOS, iPadOS, macOS, Windows, Android, Linux, Proton,
 * Privacy Guides, App Store, Chrome Web Store, Firefox Add-ons, GitHub, API
 * names, flags, placeholders) are left untranslated, with a space between them
 * and adjacent Chinese text per convention (e.g. 与 VPN 同步).
 *
 * Typography: full-width punctuation （，。、；：？！） within Chinese text,
 * curly quotes “ ” for quotations, no inter-character spaces.
 * For search coverage, 修改 / 更改 / 虚拟定位 are woven into meta descriptions
 * and FAQs alongside the brand term 伪造.
 */
export const zhCN: Dictionary = {
  nav: {
    home: "首页",
    features: "功能",
    blog: "博客",
    support: "支持",
    download: "下载",
    buyMeACoffee: "Buy Me a Coffee",
    github: "GitHub 上的 GeoSpoof",
    openMenu: "打开导航菜单",
    brandAria: "GeoSpoof — 首页",
    mainNavAria: "主导航",
  },
  hero: {
    badge: "VPN 好搭档 · 扩展",
    headlinePre: "弥补 ",
    headlineEmphasis: "VPN",
    headlinePost: " 覆盖不到的最后一环",
    subhead:
      "VPN 会更改你的 IP，但浏览器仍会泄露你的真实位置。GeoSpoof 会自动将它与你的 VPN 出口区域同步——并在你切换服务器时保持一致。",
    downloadFree: "免费安装",
    seeWhatSitesDetect: "查看网站能检测到什么",
    allPlatforms: "所有浏览器和平台",
    usersTrust: "深受 {count} 位用户信赖",
    usersShort: "{count} 位用户",
    firefoxRating: "Firefox",
    mainPhoneAlt: "GeoSpoof 应用——主界面",
    secondaryPhoneAlt: "GeoSpoof 应用——次要界面",
  },
  footer: {
    groups: {
      guides: "指南",
      learn: "了解",
      company: "关于",
    },
    links: {
      spoofAllBrowsers: "伪造位置：所有浏览器",
      spoofChrome: "在 Chrome 中伪造位置",
      spoofFirefox: "在 Firefox 中伪造位置",
      spoofEdge: "在 Edge 中伪造位置",
      spoofSafari: "在 Safari 中伪造位置",
      spoofTimezone: "伪造时区",
      gps: "Mac 版 GeoSpoof GPS",
      needVpn: "你需要 VPN 吗？",
      testProtection: "测试你的防护",
      engineLevel: "引擎级伪装（Chrome）",
      blog: "博客",
      support: "支持",
      about: "关于",
      feedback: "反馈",
      privacy: "隐私政策",
      terms: "服务条款",
      github: "GitHub",
    },
    footerNavAria: "页脚导航",
    copyright: "© {year} GeoSpoof。保留所有权利。",
  },
  languageSwitcher: {
    label: "语言",
    suggestion: "本页面提供简体中文版本。",
    switchAction: "查看简体中文",
    dismiss: "关闭",
  },
  storeCta: {
    firefox: "添加到 Firefox",
    chrome: "添加到 Chrome",
    apple: "在 App Store 下载",
  },
  legal: {
    englishNote: "以下法律文本仅提供英文版本。以英文版本为准。",
    privacy: {
      metaTitle: "隐私政策 | GeoSpoof",
      metaDescription:
        "GeoSpoof 隐私政策——了解我们如何保护你的数据并尊重你的隐私。",
      heading: "隐私政策",
      lastUpdated: "最后更新：2026 年 7 月 3 日",
    },
    terms: {
      metaTitle: "服务条款 | GeoSpoof",
      metaDescription: "GeoSpoof 服务条款——了解规范你使用本扩展的相关条款。",
      heading: "服务条款",
      lastUpdated: "最后更新：2026 年 7 月 10 日",
    },
  },
  testimonials: {
    eyebrow: "用户怎么说",
    heading: "深受注重隐私的用户喜爱",
    subhead: "来自 Chrome Web Store、Firefox Add-ons 和 App Store 的真实评价。",
    starsAria: "5 星（满分 5 星）",
    readMoreOn: "查看更多评价：",
  },
  screenshots: {
    eyebrow: "实际效果",
    heading: "在你浏览的每个地方都能用",
    desktopAlt: "在桌面端运行的 GeoSpoof 浏览器扩展——展示位置伪造的实际效果",
  },
  demo: {
    eyebrow: "看它如何运作",
    heading: "几次点击即可伪造你的位置",
    videoAria: "GeoSpoof 演示——用扩展设置伪造的浏览器位置",
    unsupported: "你的浏览器不支持内嵌视频。",
    downloadInstead: "下载演示视频",
    insteadSuffix: "。",
  },
  features: {
    eyebrow: "功能",
    heading: "覆盖每一个信号",
    subhead:
      "网站会通过多个浏览器 API 来判断你的位置。GeoSpoof 会全部覆盖它们——在页面任何脚本运行之前就保持一致。",
    visual: {
      noIpLeak: "无 IP 泄漏",
      noTracking: "无追踪",
      noTelemetry: "无遥测",
      vpnExit: "VPN 出口",
      spoofed: "已伪造",
      synced: "已同步",
      andMore: "等等",
    },
    items: {
      geolocation: {
        title: "位置伪造",
        description:
          "覆盖 navigator.geolocation，让浏览器向网站报告你选择的坐标。可按城市搜索、手动输入坐标，或与你的 VPN 同步。",
      },
      timezone: {
        title: "时区伪造",
        description:
          "伪造 Date、Intl.DateTimeFormat 和 Temporal API，让你的时区与所选位置一致。",
      },
      webrtc: {
        title: "WebRTC 保护",
        description:
          "在 Firefox 和 Chromium 上，借助浏览器隐私 API 防止通过 WebRTC 泄露 IP。",
      },
      vpnSync: {
        title: "与 VPN 同步",
        description:
          "自动检测你的 VPN 出口区域，并将伪造位置与之匹配——只需一次点击。",
      },
      apis: {
        title: "全面 API 防护",
        description:
          "凡是会泄露你位置的浏览器 API 都在防护范围内——先于页面任何脚本运行即注入生效。",
      },
    },
  },
  comparison: {
    eyebrow: "GeoSpoof 有何不同",
    heading: "不只是替换坐标",
    subhead:
      "大多数位置伪造工具只做一件事：给浏览器塞一个假的经纬度。GeoSpoof 覆盖整个信号，让你的位置、时区和 IP 都讲同一个故事。",
    featureHeader: "功能",
    typicalHeader: "其他扩展",
    yesAria: "是",
    limited: "有限",
    noAria: "否",
    features: {
      coordinates: "按坐标伪造地理位置",
      oneIdentity: "在数十个浏览器 API 中保持一致的身份",
      citySearch: "通过城市搜索设置位置",
      webrtc: "WebRTC IP 泄漏防护",
      everyBrowser: "所有主流浏览器 + 完整的 Apple 生态",
      verification: "内置验证页面",
      vpnSync: "与 VPN 同步并自动重新同步",
      perSite: "按站点规则与收藏夹",
    },
    legend: {
      fullSupport: "完全支持",
      limitedDetail: "：部分或基础",
      notSupported: "不支持",
    },
    proAria: "iPhone 和 iPad 上为 Pro",
    proNote: "iPhone 和 iPad 上为 Pro。桌面浏览器和 Safari 免费。",
    ctaLead: "别只听我们说：",
    ctaLink: "测试你的防护",
    ctaTail: "，亲眼看看每一个信号。",
  },
  compatibility: {
    eyebrow: "兼容性",
    heading: "适用于你的所有设备",
    subhead:
      "GeoSpoof 可在所有主流浏览器和平台上运行。一个扩展，在所有设备上保持一致的位置隐私保护。",
    platformHeader: "平台",
    supportedAria: "支持",
    naAria: "不适用",
    notSupportedAria: "不支持",
    legend: {
      supported: "支持",
      notSupported: "不支持",
      na: "N/A — 不适用",
    },
    footnote:
      "Firefox for Android 需要 Firefox 140+。Safari 需要 iOS 16+ 或 macOS 13+。",
    setupLead: "各浏览器设置指南：在 ",
    or: " 或 ",
    alsoLead: " 中伪造你的位置。你还可以",
    timezoneLink: "伪造浏览器时区",
  },
  featuredPost: {
    eyebrow: "来自博客",
    heading: "值得一读",
    allPosts: "全部文章",
    minRead: "分钟阅读",
    readMore: "阅读更多",
  },
  blog: {
    index: {
      metaTitle: "博客 | GeoSpoof",
      metaDescription:
        "关于浏览器位置伪造、时区隐私、WebRTC 泄漏，以及如何用好 GeoSpoof 的指南与深度解析。",
      heading: "GeoSpoof 博客",
      subhead: "关于位置伪造、时区隐私和浏览器指纹的指南与深度解析。",
      empty: "暂无文章——请稍后再来。",
      minRead: "分钟阅读",
    },
    post: {
      breadcrumbHome: "首页",
      breadcrumbBlog: "博客",
      minRead: "分钟阅读",
      faqHeading: "常见问题",
      olderPost: "← 上一篇",
      newerPost: "下一篇 →",
      backToAll: "← 返回全部文章",
      englishNote: "本文仅提供英文版本。",
    },
  },
  download: {
    eyebrow: "下载",
    heading: "免费获取 GeoSpoof",
    subhead: "所有主流浏览器均可使用。无需账户，无遥测，无追踪。",
    recommendedBadge: "为你推荐",
    installFree: "免费安装",
    otherWays: "其他下载方式",
    stores: {
      firefox: {
        description: "桌面端和 Android 上的 Firefox 140+",
        cta: "添加到 Firefox",
      },
      chromium: {
        description: "Chrome、Brave 和 Edge",
        cta: "添加到 Chrome",
      },
      apple: {
        description: "iOS 和 macOS 上的 Safari",
        cta: "在 App Store 下载",
      },
    },
    selfHosted: {
      dmg: {
        name: "直接下载（macOS）",
        description:
          "适用于 macOS 上 Safari 的已公证 DMG。无需 Apple ID。手动更新——重新下载即可升级。",
      },
      xpi: {
        name: "自托管 XPI（Firefox）",
        description:
          "适用于 Firefox 分支或手动安装的已签名 XPI。通过我们的更新清单自动更新。",
      },
      cta: "GitHub 发行版",
    },
  },
  skipLink: {
    toMainContent: "跳到主要内容",
  },
  phoneCarousel: {
    embeddedHeading: "在 iPhone 和 iPad 上也有原生版",
    standaloneHeading: "iOS 与 iPadOS 上的 GeoSpoof",
    screenshotAlt: "iOS 上的 GeoSpoof——截图 {n}",
    goToSlide: "转到第 {n} 张",
    getTheApp: "获取应用",
    appStore: "在 App Store 下载",
    macAppStore: "在 Mac App Store 下载",
  },
  exposureToast: {
    header: "网站能够看到的信息",
    exposed: "已暴露",
    visibleToSites: "网站可见",
    location: "位置",
    timezone: "时区",
    address: "地址",
    webrtc: "WebRTC",
    publicIpLeaking: "公网 IP 泄漏",
    noLeak: "无泄漏",
    yourArea: "你所在的区域",
    hideMyLocation: "隐藏我的位置",
    getGeospoof: "获取 GeoSpoof",
    fullReport: "完整报告",
    dismiss: "关闭",
  },
  themeToggle: {
    switchToLight: "切换到浅色模式",
    switchToDark: "切换到深色模式",
    changedToLight: "已切换到浅色模式",
    changedToDark: "已切换到深色模式",
  },
  carousel: {
    previousSlide: "上一张",
    nextSlide: "下一张",
  },
  spoofLocation: {
    hub: {
      metaTitle: "修改浏览器地理位置与虚拟定位 — 免费扩展 | GeoSpoof",
      metaDescription:
        "在 Chrome、Edge、Firefox 或 Safari 中修改浏览器位置，实现虚拟定位。GeoSpoof 覆盖 Geolocation API 和时区，让浏览器向网站报告你选择的位置。",
      ogTitle: "修改浏览器地理位置",
      badge: "位置伪造",
      headingPre: "伪造浏览器",
      headingEmphasis: "地理位置",
      intro:
        "网站通过浏览器的 Geolocation API 和你的时区来读取你的位置——而 VPN 两者都不会改变。GeoSpoof 会覆盖二者，让浏览器向网站报告你选择的位置，轻松实现虚拟定位。选择你的浏览器即可开始。",
      cardTitle: "在 {name} 中伪造位置",
      openGuide: "打开指南",
    },
    page: {
      browserBadge: "{name} 扩展",
      headingPre: "在 {name} 中伪造位置",
      ctaFallback: "为 {name} 获取 GeoSpoof",
      testLocation: "测试你的位置",
      breadcrumbHome: "首页",
      breadcrumbHub: "伪造位置",
      howToHeading: "如何在 {name} 中伪造位置",
      stepInstallName: "为 {name} 安装 GeoSpoof",
      stepInstallText: "从 {store} 添加免费的 GeoSpoof 扩展。",
      stepEnableName: "在 {name} 中启用",
      stepSetName: "设置你的位置",
      stepSetText:
        "搜索城市、输入坐标，或使用“与 VPN 同步”来匹配你的 VPN 出口区域。",
      stepReportsName: "{name} 会报告你选择的位置",
      stepReportsText:
        "GeoSpoof 会覆盖 Geolocation API 和时区（Date、Intl、Temporal），让每个网站都看到你选择的位置",
      stepReportsWebrtcSuffix: "，同时 WebRTC 保护会阻止你的真实 IP 泄漏",
      webrtcAvailableTitle: "{name} 支持 WebRTC 保护。",
      webrtcAvailableBody:
        "GeoSpoof 还会阻止你的真实 IP 通过 WebRTC 泄漏——否则它可能完全绕过 VPN。",
      webrtcUnavailableTitle: "注意：{name} 不支持 WebRTC 保护。",
      webrtcUnavailableBody:
        "位置和时区伪造完全受支持；但 GeoSpoof 所依赖的 WebRTC 隐私 API 在该浏览器上不可用。",
      faqHeading: "常见问题",
      faqHowQ: "如何在 {name} 中修改或伪造我的位置？",
      faqHowA:
        "安装免费的 GeoSpoof 扩展，设置一个位置（搜索城市、输入坐标，或与你的 VPN 同步），GeoSpoof 就会覆盖 {name} 中的 Geolocation 和时区 API，让浏览器向网站报告你选择的位置而不是真实位置。",
      faqVpnQ: "VPN 会改变我在 {name} 中的位置吗？",
      faqVpnA:
        "不会。VPN 只会更改你的 IP 地址。{name} 仍会报告自己的浏览器地理位置和系统时区，因此它们仍可能暴露你的真实区域。GeoSpoof 会伪造这些浏览器信号；与 VPN 搭配使用可获得一致的位置。",
      faqFreeQ: "GeoSpoof 在 {name} 上免费吗？",
      faqFreeA:
        "免费。GeoSpoof 免费且开源。无需账户、无需登录、也没有追踪——所有设置都保存在你的设备上。",
      crossLinkLead: "使用其他浏览器？请参阅",
      crossLinkText: "在任何浏览器中伪造你的位置",
      schemaSoftwareDesc:
        "用一款免费开源扩展在 {name} 中伪造你的地理位置和时区。",
    },
    browsers: {
      chrome: {
        storeName: "Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Chrome 通过 Geolocation API 把你的位置告诉网站，通过 Intl 和 Date 暴露你的时区——而 VPN 对此毫无作用。GeoSpoof 会在 Chrome 内覆盖这些信号，让浏览器向网站报告你选择的位置。同一版本也可在 Brave、Opera 和其他 Chromium 浏览器中运行。",
        enableStep:
          "在 Chrome 工具栏的拼图（扩展）图标中固定 GeoSpoof，一键即可使用。",
        extraFaqQ: "GeoSpoof 能在 Brave 和其他 Chromium 浏览器中使用吗？",
        extraFaqA:
          "可以。GeoSpoof 从 Chrome Web Store 安装，该商店同时服务 Chrome、Brave、Opera 和其他基于 Chromium 的浏览器。位置和时区伪造在它们之间的表现完全一致。",
        metaTitle: "在 Chrome 中修改位置 — 免费扩展 | GeoSpoof",
        metaDescription:
          "用一款免费扩展在 Chrome 中修改位置、实现虚拟定位。GeoSpoof 覆盖 Geolocation API 和时区，让浏览器向网站报告你选择的位置。Brave 同样适用。",
        ogTitle: "在 Chrome 中修改位置",
      },
      edge: {
        storeName: "Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Microsoft Edge 基于 Chromium，因此它暴露位置的方式与 Chrome 相同——Geolocation API 加上你的系统时区。GeoSpoof 从 Chrome Web Store 安装，可在 Edge 中运行，并覆盖这些 API 以报告你选择的位置。它适用于在 Windows 和 macOS 上的 Edge 中伪造位置。",
        enableStep:
          "当 Edge 提示时，允许来自 Chrome Web Store 的扩展，然后通过扩展（拼图）图标固定 GeoSpoof。",
        extraFaqQ: "我能在 Windows 上的 Edge 中伪造位置吗？",
        extraFaqA:
          "可以。GeoSpoof 可在 Windows 和 macOS 上的 Edge 中运行。它会覆盖浏览器向网站报告的位置和时区；它不会更改 Windows 自身的系统位置设置，因此你的操作系统保持不变。",
        metaTitle: "在 Edge 中修改位置 — 免费扩展 | GeoSpoof",
        metaDescription:
          "用一款免费扩展在 Microsoft Edge 中修改你的位置。GeoSpoof 覆盖 Geolocation API 和时区，让浏览器向网站报告你选择的位置。",
        ogTitle: "在 Edge 中修改位置",
      },
      firefox: {
        storeName: "Firefox Add-ons",
        storeShort: "Firefox Add-ons",
        intro:
          "无论是否使用 VPN，Firefox 都会通过 Geolocation API 把你的位置、通过时区 API 把你的区域交给网站。GeoSpoof 从 Firefox Add-ons 安装并覆盖这些信号。它是唯一也能在 Firefox for Android 上运行的版本，因此你在手机上也能伪造位置。",
        enableStep:
          "从 Firefox Add-ons 添加 GeoSpoof 后，在扩展菜单中将其固定到工具栏，以便快速访问。",
        extraFaqQ: "我能在 Android 上的 Firefox 中伪造位置吗？",
        extraFaqA:
          "可以。Android 上的 Firefox 140+ 支持 GeoSpoof，因此你可以在手机上伪造地理位置和时区——这是移动版 Chrome 做不到的，因为它不支持扩展。",
        metaTitle: "在 Firefox 中修改位置 — 免费附加组件 | GeoSpoof",
        metaDescription:
          "用一款免费开源附加组件在 Firefox 中更改你的位置。GeoSpoof 覆盖 Geolocation API 和时区，让浏览器向网站报告你选择的位置。",
        ogTitle: "在 Firefox 中修改位置",
      },
      safari: {
        storeName: "App Store",
        storeShort: "App Store",
        intro:
          "iOS、iPadOS 和 macOS 上的 Safari 与任何浏览器一样，都会把你的位置和时区报告给网站。GeoSpoof 从 App Store 安装并作为 Safari 扩展运行，覆盖这些 API，让浏览器向网站报告你选择的位置。位置和时区伪造完全受支持；Safari 上不支持 WebRTC 保护。",
        enableStep:
          "从 App Store 安装后，在 Safari 的扩展菜单中启用 GeoSpoof（iOS 上为地址栏中的拼图图标，macOS 上为 Safari → 设置 → 扩展）。",
        extraFaqQ: "位置伪造能在 iPhone 上的 Safari 中使用吗？",
        extraFaqA:
          "可以。GeoSpoof 是一款通过 App Store 提供的 Safari 扩展，适用于 iOS、iPadOS 和 macOS。为某个网站启用后，它会覆盖 Safari 报告的地理位置和时区。WebRTC 保护是 Safari 上唯一不可用的功能。",
        metaTitle: "在 Safari 中修改位置 — 免费扩展 | GeoSpoof",
        metaDescription:
          "用一款免费的 App Store 扩展在 Safari 中修改你的位置。GeoSpoof 在 iOS、iPadOS 和 macOS 上覆盖 Geolocation API 和时区。",
        ogTitle: "在 Safari 中修改位置",
      },
    },
  },
  vpn: {
    meta: {
      title: "使用 GeoSpoof 还需要 VPN 吗？两层隐私防护 | GeoSpoof",
      description:
        "GeoSpoof 隐藏浏览器报告的位置、时区和 WebRTC。无日志 VPN 隐藏你的 IP——这是扩展无法改变的唯一信号。",
      ogTitle: "使用 GeoSpoof 还需要 VPN 吗？",
    },
    hero: {
      mapAlt: "Proton VPN 隐藏你的 IP 地址",
      badge: "位置隐私有两层",
      headingPre: "使用 ",
      headingPost: " 还需要 VPN 吗？",
      answer:
        "GeoSpoof 隐藏你浏览器的位置。VPN 隐藏你的 IP。要获得完整隐私，两者都需要。",
      disclosureBody:
        "我们与 Proton VPN 合作。如果你通过我们的链接订阅，我们会获得一笔佣金，而你无需支付任何额外费用。",
      ctaPlans: "查看 Proton VPN 套餐",
      partnerPricing: "合作伙伴折扣最高 {discount}",
      learnMore: "了解更多",
      moneyBack: "30 天退款保证",
      platformsAria: "Proton VPN 支持 Windows、macOS、Linux、iOS 和 Android",
    },
    twoLayers: {
      heading: "两层防护，两种工具",
      intro:
        "位置隐私有两个相互独立的层面。GeoSpoof 封住浏览器层；VPN 封住网络层。只伪造其中一个而放着另一个不管，二者的矛盾就会暴露你。浏览器显示东京，而你的 IP 仍解析到纽约，一眼就能被识破。",
      browserTitle: "浏览器层",
      browserBody:
        "网站从 Geolocation API 读取你的位置、从时区 API 读取你的区域、从 WebRTC 读取你的本地 IP。GeoSpoof 会覆盖这一切，让它们报告你选择的位置。",
      browserWho: "由 GeoSpoof 负责",
      networkTitle: "网络层",
      networkBody:
        "每个网站还会看到你连接所用的公网 IP 地址，而它对应着一座真实的城市。任何浏览器扩展都无法改变这一点——它位于浏览器之下的网络层。",
      networkWho: "由 VPN 负责",
      primerLead:
        "想要更深入、不偏向厂商的解读？Privacy Guides 的 Jonah Aragon 有一篇清晰的入门文章，讲述",
      primerLink: "VPN 究竟能做什么、不能做什么",
    },
    whyProton: {
      eyebrow: "我们信任的 VPN",
      heading: "为什么选择 Proton VPN",
      intro:
        "GeoSpoof 开源，且不保留任何日志。在隐私领域，唯一值得拥有的信任是可以验证的信任。Proton 也坚持同样的标准：开源应用、经独立审计的无日志政策，以及瑞士司法管辖。",
      reason1Title: "无日志，经独立审计",
      reason1Body:
        "Proton 的无日志政策已多次经过独立审计——不只是声称，还在真实的法律请求中经受了检验。",
      reason2Title: "瑞士管辖，完全开源",
      reason2Body:
        "位于隐私法严格的瑞士，应用完全开源，任何人都可审查——与 GeoSpoof 一样可验证。",
      reason3Title: "配合“与 VPN 同步”使用",
      reason3Body:
        "GeoSpoof 的“与 VPN 同步”会自动让你的伪造位置与 VPN 出口区域保持一致——无论用 Proton 还是你选择的任何其他 VPN。",
      calloutLead: "别只听我们说。",
      calloutBodyPre: " Proton 是少数获得 ",
      calloutLink: "Privacy Guides",
      calloutBodyPost:
        " 推荐的 VPN 之一——这是一个独立、由社区运营的隐私资源。GeoSpoof 可与任何 VPN 搭配使用，你永远不会被绑定；我们基于上述开源、经审计的理由推荐 Proton，但正确的选择是你所信任的那一个。",
    },
    plan: {
      imgAlt: "Proton VPN 应用主界面",
      heading: "选择适合你的套餐",
      body: "GeoSpoof 是开源的。至于 IP 层面，我们会向你推荐 Proton 的 VPN Plus。两年套餐比 Proton 的标准价低 {discount}——每月单价最低，整体性价比最高。想先试试？月付套餐同样可以。",
      cta: "查看 Proton VPN 套餐",
      unlimitedPre: "已经有 VPN，或者想要不止一个工具？Proton 的 ",
      unlimitedLink: "Unlimited 套餐",
      unlimitedPost: " 将 VPN 与 Mail、Pass、Drive 和 Calendar 打包在一起。",
    },
    inlineDisclosure:
      "友情提示——这是一个联盟链接。通过它订阅，Proton 会与我们分成一小部分，而你无需支付任何额外费用。这有助于我们让 GeoSpoof 保持开源和独立。",
    faq: {
      heading: "常见问题",
      items: [
        {
          q: "如果我用 GeoSpoof，还需要 VPN 吗？",
          a: "要获得完整的位置隐私，是的——但这并不是因为 GeoSpoof 有所欠缺。GeoSpoof 会更改浏览器向网站报告的位置、时区和 WebRTC 细节。剩下最强的信号是你的 IP 地址，而只有 VPN 才能改变它。两者覆盖不同的层面；合在一起才能讲出一个一致的故事。",
        },
        {
          q: "我能用其他 VPN 搭配 GeoSpoof 吗？",
          a: "可以。GeoSpoof 可与任何 VPN 搭配使用。没有任何东西被绑定到 Proton，“与 VPN 同步”对所有 VPN 的效果都一样。Mullvad 和 IVPN 是隐私社区中另外几家备受推崇的无日志提供商。我们推荐 Proton，是因为它完全开源、经独立审计并获得 Privacy Guides 推荐，但选择完全由你决定。",
        },
        {
          q: "GeoSpoof 为什么推荐 Proton VPN？",
          a: "Proton 无日志、位于瑞士、完全开源，并多次通过独立审计。这些正是 GeoSpoof 所秉持的、可验证的隐私优先价值观。它也是少数获得 Privacy Guides 推荐的 VPN 之一——这是一个不收取任何联盟佣金的独立资源。“与 VPN 同步”对 Proton 的效果与对任何其他 VPN 完全一样。",
        },
        {
          q: "使用 GeoSpoof 需要 VPN 吗？",
          a: "不需要。GeoSpoof 的核心伪造功能无需 VPN 即可工作。VPN 只会隐藏你的真实 IP 地址——它是一个补充工具，而不是使用 GeoSpoof 的必要条件。",
        },
        {
          q: "如果我注册，GeoSpoof 会赚钱吗？",
          a: "如果你通过我们的链接订阅 Proton，Proton 会与我们分享一部分销售额，而你无需支付任何额外费用。这有助于让 GeoSpoof 保持开源、无广告。我们基于 Proton 自身的优点推荐它（开源、经独立审计、获 Privacy Guides 推荐），佣金并不会改变哪个套餐才真正最适合你。",
        },
      ],
    },
    disclosure: {
      label: "联盟披露：",
      body: "GeoSpoof 是一款独立的开源工具，与 Proton 没有关联，也未获其背书。当你通过我们的推荐购买套餐时，Proton 会与我们分享一部分销售额，而你无需支付任何额外费用。这有助于让 GeoSpoof 保持免费、开源、无广告。我们基于 Proton 自身的优点推荐它（开源、经独立审计、获 Privacy Guides 推荐），而非因为佣金，并且 GeoSpoof 可与你偏好的任何 VPN 搭配使用。",
    },
  },
  support: {
    meta: {
      title: "GeoSpoof 支持 — 修复伪造、与 VPN 同步及设置问题",
      description:
        "获取 GeoSpoof 帮助：修复无法工作的位置伪造，解决与 VPN 同步超时、WebRTC 问题以及浏览器或移动端设置——或联系我们的团队。",
    },
    heading: "有什么可以帮你的？",
    subhead: "大多数问题都源于以下原因之一。请依次排查，一旦伪造生效即可停止。",
    symptomsLead: "你遇到了什么问题？",
    symptoms: [
      { label: "位置伪造不起作用", target: "troubleshooting" },
      { label: "与 VPN 同步失败或超时", target: "faq-vpn-sync" },
      { label: "在桌面端可用，但在手机上不行", target: "faq-mobile" },
      { label: "其他问题", target: "questions" },
    ],
    lastUpdatedLabel: "最后更新",
    troubleshooting: {
      title: "伪造在某个网站上不起作用",
      intro: "以下按从常见到少见排序。你多半用不着看到最后。",
      browserNote:
        "GeoSpoof 也可在 Chrome、Edge、Brave 和 Safari 上运行。以下步骤是针对 Firefox 编写的（这类冲突在 Firefox 上最常见）——在其他浏览器上，请应用对应的设置。",
      latestReleaseLabel: "最新发行版",
      latestReleaseCta: "在 GitHub 上查看最新发行版",
      badgeActiveLabel: "在此标签页已激活",
      badgeActiveAlt: "GeoSpoof 工具栏图标，其角标显示它已在当前标签页激活",
      badgeDisabledLabel: "未在此标签页运行",
      badgeDisabledAlt: "GeoSpoof 工具栏图标，其角标显示它未在当前标签页运行",
      geolocationDeniedAlt:
        "一项指纹测试结果显示“Geolocation: Denied”，因为 Firefox 拦截了位置请求",
      geolocationDeniedCaption: "在指纹测试中，被拦截的位置请求就是这个样子。",
      preserveOffAlt: "GeoSpoof 弹窗中“保留位置提示”开关处于关闭状态",
      preserveOffCaption: "GeoSpoof 弹窗中“保留位置提示”已关闭。",
      tzpCta: "打开 TZP 测试",
      featuredLabel: "最佳诊断",
      steps: [
        {
          title: "刷新标签页，或重新打开它",
          featured: false,
          body: "GeoSpoof 只对在其启用之后加载的页面生效。任何在你安装、更新或重新启用 GeoSpoof 时就已打开的标签页，在重新加载之前都不会被伪造。请刷新你正在测试的标签页——如果没用，就关闭它再重新打开。",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "更新到最新版本",
          featured: false,
          body: "许多问题在较新的发行版中已经修复。在弹窗中打开“详情 → 高级”查看你的版本，然后与下方的最新发行版对比；如果落后了，请通过浏览器的扩展管理器更新。",
          details: [],
          note: "",
          action: "latestRelease",
        },
        {
          title: "确认 GeoSpoof 正在该网站上运行",
          featured: false,
          body: "GeoSpoof 的工具栏图标会显示它是否在当前标签页激活。如果未激活，就不会有任何内容被伪造——最常见的原因是“筛选”标签页中设置的站点范围。",
          details: [
            "白名单模式：只有列表中的网站会被伪造——请把你正在测试的网站加进去。",
            "黑名单模式：确保该网站不在列表中。",
            "或切换到“全部”以在任何地方伪造。",
          ],
          note: "",
          action: "badgeCheck",
        },
        {
          title: "重置该网站的位置权限",
          featured: false,
          body: "如果测试显示“Geolocation: Denied”，说明 Firefox 正在拦截该请求——通常是因为之前在勾选了“记住此决定”的情况下拒绝了提示。",
          details: [
            "点击地址栏中的锁形图标。",
            "清除任何已记住的位置“拦截”设置，然后重新加载页面。",
            "在 Firefox 设置中，确认“阻止访问你的位置的新请求”处于关闭状态。",
            "如果 GeoSpoof 的“保留位置提示”开关已开启，而你拒绝了提示，请要么允许它，要么关闭该开关，让 GeoSpoof 直接作答。",
          ],
          note: "",
          action: "geolocationDenied",
        },
        {
          title: "重启你的浏览器",
          featured: false,
          body: "有些浏览器 API 在启动时就已建立，因此最近的安装、更新或设置更改，可能要等你彻底关闭并重新打开浏览器后才会生效。",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "在全新的 Firefox 配置文件中测试",
          featured: true,
          body: "干净的配置文件能把 GeoSpoof 与你现有的设置隔离开。",
          details: [
            "打开 about:profiles 并创建一个新配置文件。",
            "启动它，安装 GeoSpoof，然后再次测试同一个网站。",
          ],
          note: "如果伪造在干净的配置文件中生效，说明 GeoSpoof 本身没问题——是你常用配置文件中的某些东西在干扰，几乎总是隐私工具或某项 about:config 更改。接下来的两步会处理这些情况。",
          action: "",
        },
        {
          title: "禁用有冲突的隐私工具",
          featured: false,
          body: "加固类工具会更改许多与 GeoSpoof 相同的浏览器 API，并可能覆盖它。请临时禁用你使用的任何此类工具，然后重试：Arkenfox、Betterfox、LibreWolf、CanvasBlocker、JShelter、Chameleon、Trace，或任何指纹随机化工具。",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "检查 about:config（高级）",
          featured: false,
          body: "如果你加固过 Firefox，请确认以下首选项已被禁用，然后重启并重试。严格的“增强型跟踪保护”通常没问题，无需更改。",
          details: [
            "privacy.resistFingerprinting",
            "privacy.fingerprintingProtection",
            "privacy.fingerprintingProtection.pbmode",
          ],
          note: "",
          action: "",
        },
        {
          title: "在第二个指纹测试上验证",
          featured: false,
          body: "不同测试测量不同的 API，有些本身就有 bug。在断定是 GeoSpoof 的问题之前，请在另一个可靠的测试上验证结果——我们推荐 arkenfox TZP 的 Region 部分。",
          details: [],
          note: "",
          action: "tzpTest",
        },
      ],
    },
    commonIssues: "其他常见问题",
    faqs: [
      {
        id: "vpn-sync",
        q: "与 VPN 同步显示超时或网络错误",
        a: "“与 VPN 同步”会调用几个公共 IP 地理定位服务来检测你的 VPN 出口区域。某些 VPN 或防火墙会拦截对这些服务的出站请求。请尝试临时关闭 VPN 的防火墙或断网保护（kill switch）。若问题依旧，请改用“搜索城市”或“输入坐标”标签页手动设置位置。",
      },
      {
        id: "specific-site",
        q: "某个特定网站没有被伪造",
        a: "有些网站基于你的 IP 地址在服务器端判断位置，而非通过浏览器 Geolocation API。GeoSpoof 只覆盖浏览器 API——它不会更改你的 IP 地址。要获得完整的位置一致性，请将 GeoSpoof 与指向同一区域的 VPN 搭配使用。",
      },
      {
        id: "mobile",
        q: "扩展在桌面端可用，但在手机上不行",
        a: "在 Firefox for Android 上，Firefox 140 及更高版本完全支持该扩展。在 iOS 和 macOS 的 Safari 上，可通过 App Store 获取该扩展——点击地址栏中的拼图图标，为你想保护的网站启用 GeoSpoof。iOS 和 Android 上的 Chrome 不支持扩展。",
      },
      {
        id: "webrtc",
        q: "WebRTC 保护不可用 / 呈灰色",
        a: "WebRTC 保护使用的浏览器隐私 API 并非在所有平台上都可用。桌面端的 Firefox 和基于 Chromium 的浏览器支持它。Safari 和 Firefox for Android 不支持。",
      },
      {
        id: "extensions-page",
        q: "我看到“扩展无法在此页面上运行”",
        a: "浏览器会限制扩展在内置页面上运行，例如 about:blank、chrome://、about:newtab 以及扩展商店页面。这是浏览器的安全边界，无法绕过。GeoSpoof 在所有正常网站上都能工作。",
      },
    ],
    copy: "复制",
    copied: "✓ 已复制",
    copyAria: "复制电子邮件地址",
    stillNeedHelp: "仍需要帮助？",
    contactBody: "给我们发邮件，我们会在一两天内回复你。",
    contactChecklistLead: "请附上这些信息，以便我们更快提供帮助：",
    contactChecklist: [
      "Firefox 版本",
      "操作系统",
      "GeoSpoof 版本",
      "VPN 提供商（如适用）",
      "你正在使用的指纹测试网站",
      "结果的截图",
      "在全新的 Firefox 配置文件中伪造是否生效",
    ],
    reportBugsLead: "你也可以报告问题：",
  },
  about: {
    meta: {
      title: "关于 GeoSpoof — 由谁打造 | GeoSpoof",
      description:
        "GeoSpoof 是由 Anthony Sgro 打造的开源位置与时区伪造工具——无账户、无追踪，并对其功能坦诚相待。",
      ogTitle: "关于 GeoSpoof",
    },
    greeting: "👋 你好，我是 Anthony",
    tagline: "GeoSpoof 是我做的。",
    githubAria: "Anthony Sgro 的 GitHub",
    linkedinAria: "Anthony Sgro 的 LinkedIn",
    p1a: "我是一名软件开发者，GeoSpoof 最初只是",
    p1strong: "我为自己想要的东西",
    p1b: "：一种简单的方式来控制浏览器交出去的位置和时区，而无需注册任何东西，也不必把数据交给又一家公司。它后来成长为许多人如今每天都在用的工具，这仍让我有点惊讶。",
    p2a: "它是开源的，",
    p2strong: "没有账户，也不必注册任何东西",
    p2b: "。你的设置就存在你的浏览器里。如果你好奇它到底在做什么，代码是公开的，而",
    verifyLink: "验证页面",
    p2c: "会准确告诉你网站能读取到你的哪些信息。",
    p3a: "还有一个可选的 Pro 层级，提供",
    p3strong: "额外的强力功能",
    p3b: "，而日常的伪造功能始终免费。",
    p4a: "有问题、有想法，或者只是想",
    p4em: "打个招呼",
    p4b: "？",
    supportLink: "支持页面",
    p4c: "可以直接联系到我，或在顶部的 GitHub 和 LinkedIn 找到我。感谢你的到访。",
  },
  spoofTimezone: {
    meta: {
      title: "修改浏览器时区 — 免费扩展 | GeoSpoof",
      description:
        "修改或伪造浏览器时区以匹配任意位置。GeoSpoof 覆盖 Date、Intl 和 Temporal，让你的时钟无法暴露真实区域。",
      ogTitle: "修改浏览器时区",
    },
    hero: {
      breadcrumbHome: "首页",
      breadcrumb: "伪造时区",
      badge: "时区伪造",
      headingPre: "伪造浏览器",
      headingEmphasis: "时区",
      introPre: "网站会在页面加载的瞬间读取你的时区——无需授权提示——通过 ",
      introMid: " 和 ",
      introPost:
        "。GeoSpoof 会覆盖它们，让你的时钟与你选择的位置一致，而不是你真正所在之处。",
      ctaFallback: "免费获取 GeoSpoof",
      testTimezone: "测试你的时区",
    },
    whatLeaks: {
      heading: "你的浏览器泄露了什么",
      intro:
        "与 Geolocation API 不同，时区接口从不请求授权——它们在页面加载时就会作答。一个对不上的时钟就能让伪造的 GPS 位置前功尽弃。",
      reveals1: "返回一个 IANA 名称，例如 America/New_York。",
      reveals2: "以分钟返回你的 UTC 偏移。",
      surface3Api: "Temporal 与文档时间戳",
      reveals3: "更新的时间 API 和页面时间戳会暴露同一时区。",
    },
    howTo: {
      heading: "如何伪造你的时区",
      schemaName: "如何伪造浏览器时区",
      schemaDesc:
        "使用免费的 GeoSpoof 扩展，在不更改系统时钟的情况下，更改浏览器向网站报告的时区。",
      steps: [
        {
          name: "安装 GeoSpoof",
          text: "为你的浏览器添加免费的 GeoSpoof 扩展——Firefox、Chrome、Brave、Edge 或 Safari。",
        },
        {
          name: "设置你的位置",
          text: "搜索城市、输入坐标，或使用“与 VPN 同步”来匹配你的 VPN 出口区域。",
        },
        {
          name: "时区自动对齐",
          text: "GeoSpoof 会覆盖 Date、Intl.DateTimeFormat 和 Temporal，让每一个基于时钟的 API 都报告你所选位置的时区。",
        },
        {
          name: "验证是否生效",
          text: "打开 GeoSpoof 验证页面，确认报告的时区与你伪造的位置一致。",
        },
      ],
    },
    whyItMatters: {
      heading: "伪造的位置需要匹配的时区",
      body: "VPN 改变你的 IP，GeoSpoof 改变你的 GPS 坐标——但如果你的时区仍显示真实区域，二者的矛盾就会暴露你。GeoSpoof 会自动让你的时区与所选位置保持一致，并在你的 VPN 切换出口服务器时重新对齐，让你的地理位置、时区和 IP 都讲同一个故事。",
      blogLinkLead: "想要技术层面的深度解析？",
      blogLinkText: "阅读：为什么时区会暴露你的位置",
    },
    faq: {
      heading: "常见问题",
      items: [
        {
          q: "如何更改浏览器的时区？",
          a: "浏览器的时区取自你的操作系统，而且大多不允许按站点覆盖。GeoSpoof 会在不触碰系统时钟的前提下，更改浏览器向网站报告的时区：安装扩展、设置一个位置，它就会覆盖 JavaScript 时区 API 使之匹配。",
        },
        {
          q: "我能在不更改系统时钟的情况下伪造时区吗？",
          a: "可以。GeoSpoof 工作在浏览器 API 层面，因此它改变的是网站读取到的内容（Intl.DateTimeFormat、Date、Temporal），而你电脑实际的时钟和系统设置保持原样。",
        },
        {
          q: "VPN 会改变浏览器的时区吗？",
          a: "不会。VPN 只会更改你的 IP 地址。你的浏览器仍会从操作系统报告自己的时区，因此在另一个国家用 VPN 却带着你本地的时区，是很容易被识破的矛盾。GeoSpoof 会让时区与你伪造的位置对齐，弥合这一缺口。",
        },
        {
          q: "为什么我的时区需要与位置匹配？",
          a: "如果你伪造了 GPS 位置或使用了 VPN，却把时区留在真实区域，二者就会相互矛盾——而这种矛盾是常见且极易被检测的破绽。让时区与你选择的位置对齐，才能让每一个信号讲出同一个故事。",
        },
        {
          q: "GeoSpoof 会自动伪造时区吗？",
          a: "会。当你设置位置或与 VPN 同步时，GeoSpoof 会为这些坐标解析出正确的时区并自动应用——包括在你的 VPN 切换出口服务器时。",
        },
      ],
    },
  },
  verify: {
    meta: {
      title: "浏览器位置测试 — 看看网站对你了解多少 | GeoSpoof",
      description:
        "免费的浏览器位置测试。查看此刻网站读取到的地理位置、时区和 IP——以及你的浏览器是否泄露了真实位置。",
    },
    eyebrow: "验证",
    heading: "网站能看到你的哪些信息",
    refresh: "刷新",
    refreshAria: "刷新——重新加载页面以查看最新数值",
    introMobile: "此刻网站能读取到的关于你的实时数值。",
    introDesktop:
      "来自你浏览器此刻的实时数值——网站能读取到的位置、时区和 IP。启用 GeoSpoof 后，它们会反映你伪造的位置，而不是真实位置。",
    vpnSyncNote:
      "正在使用自动 VPN 同步？更改最多可能需要 10 秒——点击“刷新”查看最新结果。",
    rows: {
      geolocation: "地理位置",
      timezone: "时区",
      currentTime: "当前时间",
      ipAddress: "IP 地址",
      webrtc: "WebRTC",
      waitingPermission: "正在等待授权……",
      blockedDenied: "已拦截 / 已拒绝",
      lookingUp: "正在查询……",
      lookupFailed: "查询失败",
      probing: "正在探测……",
      noLeak: "未检测到 IP 泄漏",
    },
    vpnCard: {
      line1: "IP 地址是 GeoSpoof 唯一无法改变的信号。只有 VPN 才能改变它。",
      line2: "我们推荐的那一款最高立减 {discount}。",
      cta: "使用 Proton VPN 保护你的 IP",
      priceNote: "最高立减 {discount}",
      guaranteeNote: "30 天保证",
    },
    apiSection: {
      eyebrow: "浏览器 API 面",
      description:
        "攻击者会检查的关键指纹面。展开任意分组查看它们得到的数值——它们都应讲同一个故事。",
    },
    supportLead: "发现有误，或结果与预期不符？",
    supportLink: "获取支持",
    verdict: {
      running: "正在检查……",
      runningSub: "正在读取你的浏览器并探测泄漏。",
      allGood: "所有检查均已通过",
      allGoodSub: "我们检查的项目都不会暴露你。",
      exposed: "部分信号已暴露",
      problemWebrtc: "WebRTC 正在泄露你的真实 IP",
      problemGeo: "位置与 IP 不匹配",
      problemTz: "时区与 IP 不匹配",
      crossRef: "交叉比对这些信号的网站可能会标记你。",
      installFree: "免费安装 GeoSpoof",
      alreadyHave: "已经有 GeoSpoof 了？",
    },
    dialog: {
      title: "已经在运行 GeoSpoof？",
      description: "一份简短的清单几乎能解决所有被标记的信号。",
      ipMismatchLocation: "IP 与你的位置不匹配？",
      ipMismatchTimezone: "IP 与你的时区不匹配？",
      ipMismatchBody:
        "当 VPN 同步关闭时这是正常的——GeoSpoof 只在你开启它时才让位置与 IP 对齐。如果你有意保留真实 IP，那么它正按预期工作。",
      autoSyncBold: "刚开启自动 VPN 同步？",
      autoSyncBody:
        "刷新后给它最多约 10 秒来跟上，然后重新检查——自动同步不像手动同步那样即时。",
      updateBold: "更新到最新版本。",
      updateBody: "新的指纹识别手段会被持续修补。",
      downloadOptions: "查看下载选项",
      checkSiteBold: "确认它已为此站点开启。",
      checkSiteBody:
        "查看工具栏图标；如果你按白名单或黑名单限定范围，请把此站点包含进去。",
      reloadBold: "启用或更新后重新加载。",
      reloadBody: "有些接口只在页面重新加载时才生效。",
      stillStuck: "仍无法解决？联系支持",
      gotIt: "知道了",
    },
    faq: {
      heading: "常见问题",
      items: [
        {
          q: "我的浏览器地理位置是什么？",
          a: "你浏览器的地理位置，是它通过 JavaScript Geolocation API 交给网站的经纬度。上方的地图和坐标准确显示了网站询问你位置时读取到的内容。启用 GeoSpoof 后，那便是你伪造的位置，而非真实位置。",
        },
        {
          q: "即使我用 VPN，网站还能看到我的真实位置吗？",
          a: "能。VPN 只会更改你的 IP 地址。你的浏览器仍会报告自己 GPS 级别的地理位置、系统时区和区域设置——而 WebRTC 甚至可能完全泄露你的真实 IP。如果这些信号与你 VPN 的出口位置相矛盾，网站就能察觉不对劲。本页面正是标记出这些矛盾。",
        },
        {
          q: "为什么我的时区与 IP 地址不匹配？",
          a: "你的时区来自操作系统，而 IP 位置来自你的网络或 VPN。如果你通过另一个国家的 VPN 连接，却把系统时钟留在本地时区，二者就对不上——这是常见且极易被检测的破绽。GeoSpoof 会让时区与你伪造的位置对齐，弥合这一缺口。",
        },
        {
          q: "什么是 WebRTC 泄漏？",
          a: "WebRTC 是浏览器用于实时音频、视频和数据的功能。若不加以拦截，它可能把你真实的公网和本地 IP 地址直接暴露给网站——绕过你的 VPN。上方的 WebRTC 检查会探测这种泄漏，并报告它设法暴露的任何地址。",
        },
        {
          q: "这个浏览器位置测试是免费的吗？",
          a: "是的。该测试完全在你的浏览器中运行，无需费用，也无需账户。它读取任何网站都能读取的相同信号，并用通俗的语言展示给你。",
        },
      ],
    },
  },
  engineLevel: {
    meta: {
      title: "隐藏 Chrome 的“开始调试此浏览器”提示栏 | GeoSpoof",
      description:
        "GeoSpoof 的引擎级伪装使用 Chrome 的调试器 API，因此 Chrome 会显示一条调试提示栏。这是什么意思、为何安全，以及如何隐藏它。",
      ogTitle: "隐藏 Chrome 的“开始调试此浏览器”提示栏",
    },
    hero: {
      breadcrumbHome: "首页",
      breadcrumb: "引擎级伪装",
      badge: "Chrome · 引擎级伪装",
      headingPre: "隐藏 Chrome 的",
      headingEmphasis: "“开始调试此浏览器”",
      headingPost: "提示栏",
      intro:
        "引擎级伪装开启时，Chrome 会显示一条“开始调试此浏览器”的提示栏。它无害——下面教你如何隐藏它。",
      ctaHowTo: "如何隐藏提示栏",
      ctaFallback: "免费获取 GeoSpoof",
      figureAlt:
        "引擎级伪装开启时，Chrome 在窗口顶部显示一条“GeoSpoof 开始调试此浏览器”的通知栏",
      figCaption: "引擎级伪装开启时 Chrome 显示的“开始调试此浏览器”提示栏。",
    },
    whatBar: {
      heading: "这条提示栏的含义",
      intro:
        "引擎级伪装会在浏览器层面、先于页面第一个脚本运行时就应用你的时区，因此它也覆盖后台 worker。为了深入到这一层，GeoSpoof 使用了 Chrome 的调试器 API——Chrome 则以一条通知栏来告知这一点。",
      point1Title: "这是 Chrome 的标准提示",
      point1Body:
        "对于任何使用调试器 API 的扩展，Chrome 都会显示这条提示栏——正是 DevTools 使用的同一个 API。它在 GeoSpoof 附加的那一刻出现，并非因为出了什么问题。",
      point2Title: "GeoSpoof 只设置时区覆盖",
      point2Body:
        "调试器连接仅用于在各框架和 worker 中应用你伪造的时区。它不会读取你的页面内容、按键或浏览记录——而且代码是开源的。",
      point3Title: "这条提示栏只是外观",
      point3Body:
        "它不会改变网站看到你的任何方式。隐藏它纯粹是为了去掉窗口顶部那条横栏。",
    },
    howTo: {
      heading: "如何隐藏提示栏",
      introPre: "使用 ",
      introPost:
        " 标志启动 Chrome。先退出 Chrome，然后按你系统对应的步骤操作。",
    },
    guides: {
      win: {
        step1: "关闭所有 Chrome 窗口。",
        step2:
          "右键点击你使用的 Chrome 快捷方式（任务栏、桌面或开始菜单），选择“属性”。",
        step3a: "在",
        step3strong: "“目标”",
        step3mid: "字段中，保留指向 ",
        step3code: "chrome.exe",
        step3end:
          " 的带引号路径不变，并在结尾引号之后加上该标志（注意开头有一个空格）。",
        step4: "点击“确定”，然后从该快捷方式打开 Chrome。",
        note: "对你启动 Chrome 所用的每个快捷方式都要重复操作（任务栏和开始菜单是不同的快捷方式）。",
      },
      mac: {
        step1: "彻底退出 Chrome（⌘Q）。",
        step2: "打开“终端”并运行下面的命令。",
        step3a:
          "Chrome 会在没有提示栏的情况下重新打开。若要每次都这样启动，可将该命令保存为 Automator ",
        step3strong: "“应用程序”",
        step3end: "或一个 shell 别名。",
      },
      linux: {
        step1: "关闭 Chrome。",
        step2:
          "用该标志启动它，或将该标志加入你的 Chrome .desktop 启动器的 Exec= 行，以使其永久生效。",
        note: "如果你运行的是 Chromium，请把 google-chrome 换成 chromium。",
      },
    },
    permanent: {
      heading: "让它长期生效",
      bodyPre:
        "该标志只对包含它的启动生效，因此如果你以别的方式打开 Chrome，提示栏就会回来。要永久隐藏，请把 ",
      bodyMid:
        " 加入你每天打开 Chrome 所用的快捷方式或启动器——Windows 快捷方式的“目标”、macOS 启动器应用，或你的 Linux ",
      bodyDesktopCode: ".desktop",
      bodyEnd: " 文件。",
      body2Pre:
        "不想折腾？那就让引擎级伪装保持关闭——GeoSpoof 的标准防护仍会伪造你的",
      locationLink: "位置",
      body2Mid: "和",
      timezoneLink: "时区",
      body2End: "，且不会出现任何调试器提示栏。",
    },
    faq: {
      heading: "常见问题",
      items: [
        {
          q: "GeoSpoof 为什么说它在“调试”我的浏览器？",
          a: "引擎级伪装使用 Chrome 的调试器 API（Chrome DevTools Protocol）——正是你浏览器自带 DevTools 所用的机制——从而比普通扩展更深入地设置你的时区。每当任何扩展通过该 API 附加时，Chrome 都会显示一条“开始调试此浏览器”的提示栏。这是 Chrome 的标准提示，并不表示出了什么问题。",
        },
        {
          q: "它安全吗？GeoSpoof 会读取我的数据吗？",
          a: "GeoSpoof 仅用调试器连接来应用时区覆盖。它不会读取你的页面内容、按键或浏览记录。GeoSpoof 是开源的，你可以在 GitHub 上准确查看它发送的内容。如果你不想使用，可让引擎级伪装保持关闭，GeoSpoof 的标准防护仍会伪造你的位置和时区。",
        },
        {
          q: "如何隐藏“开始调试此浏览器”提示栏？",
          a: "用 {flag} 标志启动 Chrome。在 Windows 上，把它加到 Chrome 快捷方式的“目标”字段；在 macOS 上，从“终端”用该标志重新启动 Chrome（或保存为启动器）；在 Linux 上，把它加到你的 Chrome 启动命令或 .desktop 文件。提示栏会消失，而伪造照常工作。",
        },
        {
          q: "重启 Chrome 后提示栏会再出现吗？",
          a: "会，除非你把该标志固化到你始终使用的快捷方式或启动器里。该标志只影响包含它的启动，因此以别的方式打开 Chrome 会让提示栏回来。把它加入你日常的启动器即可让它长期生效。",
        },
        {
          q: "GeoSpoof 为什么不能自动帮我隐藏提示栏？",
          a: "这条提示栏由 Chrome 本身控制，只有浏览器启动标志才能关闭它。扩展无法设置 Chrome 的命令行标志，因此这一步需要你手动做一次。这是 Chrome 围绕调试器 API 的一项刻意保护措施。",
        },
        {
          q: "什么是引擎级伪装？",
          a: "这是 GeoSpoof 仅限 Chrome 的一个选项，它在浏览器引擎层面伪造你的时区，而非从页面脚本进行。由于它先于页面第一个脚本运行并覆盖后台 worker，它能堵住页面级伪造可能遗漏的时区泄漏。地理位置仍使用 GeoSpoof 标准的、无需授权提示的方式。",
        },
      ],
    },
    schema: {
      howToStep1Name: "彻底退出 Chrome",
      howToStep1Text:
        "关闭每一个 Chrome 窗口，让浏览器完全退出——该标志只对全新启动生效。",
      howToStep2Name: "用标志重新启动 Chrome",
      howToStep2Text:
        "按你操作系统对应的步骤，用 {flag} 命令行标志启动 Chrome。",
      howToStep3Name: "使其永久生效（可选）",
      howToStep3Text:
        "把该标志加入你平时使用的快捷方式或启动器，让提示栏在每次启动时都保持隐藏。",
      howToStep4Name: "重新打开 GeoSpoof",
      howToStep4Text: "引擎级伪装会像之前一样照常工作——只是通知栏不见了。",
      howToName: "如何隐藏 Chrome 的“开始调试此浏览器”提示栏",
      howToDesc:
        "通过用 {flag} 标志启动 Chrome，隐藏 GeoSpoof 引擎级伪装开启时 Chrome 显示的通知栏。",
    },
  },
  feedback: {
    meta: {
      title: "发送反馈 — GeoSpoof",
      description:
        "有想法、发现了问题，或者只是想打个招呼？把反馈发送给 GeoSpoof 团队——我们会阅读每一条消息。",
      ogTitle: "向 GeoSpoof 发送反馈",
    },
    heading: "感谢你使用 GeoSpoof",
    subhead:
      "GeoSpoof 由一个很小的团队打造，你的每一条消息都真切地影响着它未来的方向。无论是问题反馈、功能建议，还是只想问声好，我们都很想听到你的声音。",
    emailLabel: "把反馈发送到",
    emailHint: "复制下面的地址，或点击它打开你的邮件应用。",
    copy: "复制",
    copied: "✓ 已复制",
    copyAria: "复制反馈邮箱地址",
    closing: "感谢你帮助 GeoSpoof 变得更好。",
  },
  gps: {
    meta: {
      title: "为 Mac 下载 GeoSpoof GPS | GeoSpoof",
      description:
        "GeoSpoof GPS 是一款 macOS 菜单栏应用，可将已连接 iPhone 的真实 GPS 位置设置为与你的伪装位置一致。下载已签名并公证的 DMG。",
      ogTitle: "为 Mac 下载 GeoSpoof GPS",
    },
    compat: {
      label: "注意",
      body: "GeoSpoof GPS 仅为隐私保护、网页浏览和开发而设计。它不兼容也并非为 Pokémon GO 等 AR 手机游戏而设计。",
    },
    experimental: {
      label: "实验性功能",
      title: "尚处早期的实验性功能",
      body: "GeoSpoof GPS 是新功能，仍在各类设备上验证中，因此可能存在一些粗糙之处，并需要一些一次性设置。它是一个可选的附加功能。GeoSpoof 的其余功能无需它也能正常使用。",
    },
    hero: {
      breadcrumbHome: "首页",
      breadcrumb: "GeoSpoof GPS",
      iconAlt: "GeoSpoof GPS 应用图标",
      badge: "macOS · 菜单栏应用",
      headingPre: "让 iPhone 的",
      headingEmphasis: "真实 GPS",
      headingPost: "与你的伪装位置一致",
      intro:
        "GeoSpoof GPS 是一款 macOS 菜单栏伴侣应用，可将已连接 iPhone 的系统级位置设置为你在 GeoSpoof 中选择的地点。浏览器和手机的真实 GPS 会呈现一致的位置。",
    },
    download: {
      cta: "下载 Mac 版",
      setupCta: "设置指南",
      resolving: "正在获取最新版本…",
      versionLabel: "最新版本",
      note: "面向 Apple Silicon 与 Intel 的通用版本。已使用 Developer ID 签名并经 Apple 公证。",
    },
    setup: {
      title: "设置 GeoSpoof GPS",
      intro:
        "点按菜单栏图标并选择“设置…”。向导会随着你的操作逐项打勾。用数据线连接 iPhone 以完成设置。完成后，GeoSpoof GPS 会继续通过 Wi-Fi 工作。",
      steps: [
        {
          name: "安装应用",
          text: "打开 DMG，将 GeoSpoof GPS 拖入“应用程序”文件夹，然后启动它。它在菜单栏中运行（没有 Dock 图标，也没有窗口），并会在首次启动时打开设置向导。",
        },
        {
          name: "允许访问本地网络",
          text: "首次启动时，macOS 会请求本地网络访问权限。点击“允许”，这样 GeoSpoof GPS 才能找到并与你的 iPhone 通信。没有此权限，应用就看不到你的手机。",
          bullets: [
            "错过了提示？在 系统设置 ▸ 隐私与安全性 ▸ 本地网络 ▸ GeoSpoof GPS 中开启。",
            "一直卡在“未找到设备”，通常就是这个权限被关闭了。",
          ],
        },
        {
          name: "安装 Xcode",
          text: "GeoSpoof GPS 需要 Apple 的开发者磁盘映像，而它随 Xcode 一同提供。请先开始这个下载——它很大（数 GB），让它在后台安装，同时你去完成下面这些快速的 iPhone 步骤。",
          bullets: [
            "从 Mac App Store 免费安装 Xcode 并打开一次。",
            "首次启动时会出现“选择平台”界面。勾选 macOS，其余（包括 iOS）保持不勾选，然后继续——你不需要 iOS SDK 或模拟器；无论如何，开发者映像都属于 Xcode 的基础安装内容。",
            "等待“正在安装组件”完成，然后退出 Xcode。无需项目、无需构建、不用编译任何东西，也不需要付费的 Apple Developer 账号。",
            "已经有开发者映像了？让 GeoSpoof GPS 指向那个文件夹，即可完全跳过 Xcode 的下载。",
          ],
          link: { label: "在 Mac App Store 获取 Xcode" },
        },
        {
          name: "连接 iPhone",
          text: "将 iPhone 连接到 Mac 并解锁。请使用支持数据传输的数据线，因为有些只能充电。如果没有出现，换一根数据线或另一个端口试试。",
        },
        {
          name: "信任此电脑",
          text: "当 iPhone 询问是否信任此电脑时，点按“信任”并输入密码。这样你的 Mac 和手机才能相互通信。",
          bullets: [
            "没有提示？保持手机解锁，然后拔下再插上数据线。该提示只在屏幕解锁时出现。",
            "仍然没有？锁定并解锁手机（或重启），然后重新连接。",
            "仅作为最后手段：设置 ▸ 通用 ▸ 传输或还原 iPhone ▸ 还原 ▸ 还原位置与隐私，然后重新连接并点按“信任”。",
          ],
        },
        {
          name: "开启开发者模式",
          text: "在 iPhone 上前往 设置 ▸ 隐私与安全性 ▸ 开发者模式，将其开启并按提示重启。它只有在 iPhone 至少连接过 Mac 一次之后才会出现。",
        },
        {
          name: "与此 Mac 配对",
          text: "在设置窗口中点击“配对”。这次一次性的安全握手让你的 Mac 能够驱动 iPhone 的 GPS。配对过程中请保持手机解锁并连接。",
        },
        {
          name: "准备开发者映像",
          text: "需要已安装 Xcode（见上）。在 iPhone 已连接并解锁的情况下，点击“准备”。GeoSpoof GPS 会将 Apple 的开发者磁盘映像（DDI）个性化到你的设备并挂载它——正是这个组件让应用能够设置你的真实 GPS 位置。它由 Apple 签名并为你自动完成；无需任何配置。",
          powerUserNote:
            "找不到映像？如果“准备”提示找不到开发者映像，可能是 Xcode 的安装尚未完成铺设。请打开“终端”，运行以下命令，然后再次点击“准备”：",
        },
        {
          name: "在 GeoSpoof 中选择位置",
          text: "像往常一样在 GeoSpoof 中设置位置。iPhone 的系统级 GPS 会随之跟随并保持一致，即使你拔掉数据线切换到 Wi-Fi 也是如此。",
          link: { label: "获取 iPhone 版 GeoSpoof" },
        },
      ],
    },
    requirements: {
      title: "你需要准备",
      macos: "macOS 13（Ventura）或更高版本。",
      appPre: "iPhone 上的 ",
      appLink: "GeoSpoof 应用",
      appPost:
        "，以及 GeoSpoof Pro。这个应用是你的控制中心，由它来设置位置，而更改设备的真实 GPS 是 Pro 功能。",
      iphone: "一部已开启开发者模式的 iPhone，首次设置时通过 USB 数据线连接。",
      xcodePre: "Xcode，Apple 免费的开发者应用，来自 ",
      xcodeLink: "Mac App Store",
      xcodePost:
        "。你无需构建任何东西：安装它，并在连接 iPhone 的情况下打开一次，让它提供 iOS 开发者映像。它的下载很大，请预留约 15 GB 的可用空间。已经有开发者映像了？可以改为让应用指向那个文件夹。",
    },
    howItWorks: {
      title: "工作原理",
      intro:
        "让浏览器和手机保持一致的位置，全部由你已经在用的 GeoSpoof 应用来控制。",
      steps: [
        {
          title: "你来选，它跟随",
          body: "像往常一样在 GeoSpoof 应用里选择位置。这个选择就是唯一的事实来源，Mac 上的 GeoSpoof GPS 会把它同步到你的 iPhone——让浏览器的伪装和设备真实的 GPS 终于说法一致。",
        },
        {
          title: "你的 Mac 来移动 GPS",
          body: "通过一次性的安全配对，菜单栏应用使用 Apple 自带的开发者位置模拟来设置 iPhone 的系统级位置。无需越狱，无需编译任何东西——正是开发者在 Xcode 中已经使用的机制。",
        },
        {
          title: "首次用线，之后无线",
          body: "首次设置需要 USB 数据线。之后便可通过 Wi-Fi 工作，并在手机离开网络又重新加入时自动重连。",
        },
        {
          title: "稳稳保持，干净还原",
          body: "应用会锁定你的位置，选择新地点时立即切换。暂停同步或退出应用，你的 iPhone 会立刻恢复到真实 GPS——不留任何伪装痕迹。",
        },
      ],
      privacyTitle: "只属于你",
      privacyBody:
        "一切都在你的 Mac 与 iPhone 之间直接完成，你的位置绝不会经过我们的服务器。Pro 通过 Apple 签名的收据进行验证，每次更新都经过 Apple 公证，并在安装前校验签名。",
    },
    menuShotAlt: "macOS 上的 GeoSpoof GPS 菜单栏应用",
    screenshotAlt: "iPhone 上的 GeoSpoof GPS，截图 {n}",
    help: {
      title: "仍然卡住了？",
      body: "如果某个步骤无法完成，我们的支持页面还有更多解决办法。发现了 Bug 或有好点子？我们很乐意听听。",
      supportLink: "获取帮助",
      feedbackLink: "发送反馈",
    },
  },
}
