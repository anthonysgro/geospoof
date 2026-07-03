import type { Dictionary } from "./en"

/**
 * Japanese dictionary.
 *
 * Typed as `Dictionary`, so a missing or misnamed key fails the build. Copy is
 * hand-written (not machine-translated) — Google suppresses thin auto-translated
 * content in local results, so quality matters for the SEO payoff.
 */
export const ja: Dictionary = {
  nav: {
    home: "ホーム",
    features: "機能",
    blog: "ブログ",
    support: "サポート",
    download: "ダウンロード",
    buyMeACoffee: "コーヒーをおごる",
    github: "GitHub の GeoSpoof",
    openMenu: "ナビゲーションメニューを開く",
    brandAria: "GeoSpoof - ホーム",
    mainNavAria: "メインナビゲーション",
  },
  hero: {
    badge: "VPN のお供 · 拡張機能",
    headlinePre: "あなたの VPN が",
    headlineEmphasis: "始めたこと",
    headlinePost: "を、やり遂げる",
    subhead:
      "VPN は IP を変えても、ブラウザは本当の位置情報を漏らし続けます。GeoSpoof はそれを自動で VPN に合わせ、サーバーを切り替えても合致した状態を保ちます。",
    downloadFree: "無料でダウンロード",
    seeWhatSitesDetect: "サイトが検出する内容を見る",
    allPlatforms: "すべてのプラットフォームとブラウザ",
    usersTrust: "{count}のユーザーに信頼されています",
    usersShort: "{count}のユーザー",
    firefoxRating: "Firefox",
    mainPhoneAlt: "GeoSpoof アプリ — メイン画面",
    secondaryPhoneAlt: "GeoSpoof アプリ — サブ画面",
  },
  footer: {
    groups: {
      guides: "ガイド",
      learn: "学ぶ",
      company: "会社情報",
    },
    links: {
      spoofAllBrowsers: "位置情報の偽装：全ブラウザ",
      spoofChrome: "Chrome で位置情報を偽装",
      spoofFirefox: "Firefox で位置情報を偽装",
      spoofEdge: "Edge で位置情報を偽装",
      spoofSafari: "Safari で位置情報を偽装",
      spoofTimezone: "タイムゾーンを偽装",
      needVpn: "VPN は必要ですか？",
      testProtection: "保護状況をテスト",
      engineLevel: "エンジンレベルの偽装（Chrome）",
      blog: "ブログ",
      support: "サポート",
      about: "概要",
      privacy: "プライバシーポリシー",
      terms: "利用規約",
      github: "GitHub",
    },
    footerNavAria: "フッターナビゲーション",
    copyright: "© {year} GeoSpoof. 無断転載を禁じます。",
  },
  languageSwitcher: {
    label: "言語",
    suggestion: "このページは日本語でご覧いただけます。",
    switchAction: "日本語で表示",
    dismiss: "閉じる",
  },
  storeCta: {
    firefox: "Firefox に追加",
    chrome: "Chrome に追加",
    apple: "App Store で入手",
  },
  legal: {
    englishNote: "以下の法的文書は英語のみで提供されます。英語版が正文です。",
    privacy: {
      metaTitle: "プライバシーポリシー | GeoSpoof",
      metaDescription:
        "GeoSpoof のプライバシーポリシー — 私たちがどのようにあなたのデータを保護し、プライバシーを尊重するかをご確認ください。",
      heading: "プライバシーポリシー",
      lastUpdated: "最終更新日：2026年7月3日",
    },
    terms: {
      metaTitle: "利用規約 | GeoSpoof",
      metaDescription:
        "GeoSpoof の利用規約 — 拡張機能の利用を規定する条件をご確認ください。",
      heading: "利用規約",
      lastUpdated: "最終更新日：2026年7月3日",
    },
  },
  testimonials: {
    eyebrow: "ユーザーの声",
    heading: "プライバシー志向のユーザーに支持されています",
    subhead:
      "Chrome ウェブストア、Firefox アドオン、App Store に寄せられた実際のレビュー。",
    starsAria: "5つ星のうち5つ",
    readMoreOn: "さらにレビューを読む",
  },
  screenshots: {
    eyebrow: "実際の動作を見る",
    heading: "あなたが閲覧するあらゆる場所で機能します",
    desktopAlt:
      "デスクトップで動作する GeoSpoof ブラウザ拡張機能 — 位置情報の偽装が実際に動作している様子",
  },
  demo: {
    eyebrow: "動作を見る",
    heading: "数クリックで位置情報を偽装",
    videoAria:
      "GeoSpoof のデモ — 拡張機能で偽装したブラウザの位置情報を設定する様子",
    unsupported: "お使いのブラウザは埋め込み動画に対応していません。",
    downloadInstead: "デモをダウンロード",
    insteadSuffix: "してください。",
  },
  features: {
    eyebrow: "機能",
    heading: "あらゆるシグナルをカバー",
    subhead:
      "ウェブサイトは複数のブラウザ API を使ってあなたの位置情報を検出します。GeoSpoof はそのすべてを、ページのスクリプトが実行される前に、一貫して上書きします。",
    visual: {
      noIpLeak: "IP 漏れなし",
      noTracking: "トラッキングなし",
      noTelemetry: "テレメトリなし",
      vpnExit: "VPN の出口",
      spoofed: "偽装済み",
      synced: "同期済み",
      andMore: "その他",
    },
    items: {
      geolocation: {
        title: "位置情報の偽装",
        description:
          "navigator.geolocation を上書きし、選んだ座標をサイトに見せます。都市名で検索したり、座標を手動で入力したり、VPN と同期したりできます。",
      },
      timezone: {
        title: "タイムゾーンの偽装",
        description:
          "Date、Intl.DateTimeFormat、Temporal API を偽装し、タイムゾーンを選んだ位置に合わせます。",
      },
      webrtc: {
        title: "WebRTC 保護",
        description:
          "ブラウザのプライバシー API を使って、Firefox と Chromium で WebRTC 経由の IP 漏れを防ぎます。",
      },
      vpnSync: {
        title: "VPN 同期",
        description:
          "VPN の出口リージョンを自動検出し、偽装した位置情報をそれに合わせます — ワンクリックで。",
      },
      apis: {
        title: "API の完全カバー",
        description:
          "位置情報を漏らすブラウザ API はすべてカバー済み — ページのスクリプトが実行される前の document_start で注入されます。",
      },
    },
  },
  comparison: {
    eyebrow: "GeoSpoof の比較",
    heading: "単なる座標の差し替えにとどまりません",
    subhead:
      "ほとんどの位置情報偽装ツールは1つのことしかしません。偽の緯度と経度をブラウザに入れるだけです。GeoSpoof はシグナル全体をカバーするので、位置情報・タイムゾーン・IP がすべて同じ内容を示します。",
    featureHeader: "機能",
    typicalHeader: "一般的なツール",
    yesAria: "対応",
    limited: "限定的",
    noAria: "非対応",
    features: {
      coordinates: "座標による位置情報の偽装",
      oneIdentity: "数十のブラウザ API にわたる一貫した1つの identity",
      citySearch: "都市名検索で位置を設定",
      webrtc: "WebRTC の IP 漏れ保護",
      everyBrowser: "主要ブラウザすべて + Apple エコシステム全体",
      verification: "組み込みの検証ページ",
      vpnSync: "自動再同期付きの VPN 同期",
      perSite: "サイトごとのルールと保存したお気に入り",
    },
    legend: {
      fullSupport: "完全対応",
      limitedDetail: "：部分的または基本的な対応",
      notSupported: "非対応",
    },
    proAria: "iPhone と iPad では Pro",
    proNote:
      "iPhone と iPad では Pro。デスクトップブラウザと Safari では無料。",
    ctaLead: "言葉だけで信じないでください。",
    ctaLink: "保護状況をテスト",
    ctaTail: "して、各シグナルをご自分で確かめてください。",
  },
  compatibility: {
    eyebrow: "対応状況",
    heading: "お使いのすべてのデバイスで機能します",
    subhead:
      "GeoSpoof は主要なブラウザとプラットフォームすべてで動作します。1つの拡張機能で、どこでも一貫した保護を。",
    platformHeader: "プラットフォーム",
    supportedAria: "対応",
    naAria: "該当なし",
    notSupportedAria: "非対応",
    legend: {
      supported: "対応",
      notSupported: "非対応",
      na: "N/A — 該当なし",
    },
    footnote:
      "Firefox for Android には Firefox 140 以降が必要です。Safari には iOS 16 以降または macOS 13 以降が必要です。",
    setupLead: "ブラウザ別の設定ガイド：位置情報を偽装するには ",
    or: " または ",
    alsoLead: "。さらに、",
    timezoneLink: "ブラウザのタイムゾーンを偽装",
  },
  featuredPost: {
    eyebrow: "ブログから",
    heading: "一読の価値あり",
    allPosts: "すべての記事",
    minRead: "分で読めます",
    readMore: "続きを読む",
  },
  blog: {
    index: {
      metaTitle: "ブログ | GeoSpoof",
      metaDescription:
        "ブラウザの位置情報偽装、タイムゾーンのプライバシー、WebRTC 漏れ、そして GeoSpoof を最大限に活用する方法についてのガイドと詳細な解説。",
      heading: "GeoSpoof ブログ",
      subhead:
        "位置情報の偽装、タイムゾーンのプライバシー、ブラウザのフィンガープリンティングについてのガイドと詳細な解説。",
      empty: "まだ記事はありません — またお越しください。",
      minRead: "分で読めます",
    },
    post: {
      breadcrumbHome: "ホーム",
      breadcrumbBlog: "ブログ",
      minRead: "分で読めます",
      faqHeading: "よくある質問",
      olderPost: "← 前の記事",
      newerPost: "次の記事 →",
      backToAll: "← すべての記事に戻る",
      englishNote: "この記事は英語のみで提供されます。",
    },
  },
  download: {
    eyebrow: "ダウンロード",
    heading: "GeoSpoof を無料で入手",
    subhead:
      "主要なブラウザすべてで利用可能。アカウント不要、テレメトリなし、トラッキングなし。",
    recommendedBadge: "あなたへのおすすめ",
    installFree: "無料でインストール",
    otherWays: "その他のダウンロード方法",
    stores: {
      firefox: {
        description: "デスクトップと Android の Firefox 140+",
        cta: "Firefox に追加",
      },
      chromium: {
        description: "Chrome、Brave、Edge",
        cta: "Chrome に追加",
      },
      apple: {
        description: "iOS と macOS の Safari",
        cta: "App Store で入手",
      },
    },
    selfHosted: {
      dmg: {
        name: "直接ダウンロード（macOS）",
        description:
          "macOS の Safari 用に公証された DMG。Apple ID 不要。更新は手動 — アップグレードするには再ダウンロードしてください。",
      },
      xpi: {
        name: "セルフホスト型 XPI（Firefox）",
        description:
          "Firefox のフォークや手動インストール用の署名済み XPI。更新マニフェストにより自動更新されます。",
      },
      cta: "GitHub リリース",
    },
  },
  skipLink: {
    toMainContent: "メインコンテンツにスキップ",
  },
  phoneCarousel: {
    embeddedHeading: "そして iPhone と iPad ではネイティブ対応",
    standaloneHeading: "iOS と iPadOS の GeoSpoof",
    screenshotAlt: "iOS の GeoSpoof — スクリーンショット {n}",
    goToSlide: "スライド {n} へ移動",
    getTheApp: "アプリを入手",
    appStore: "App Store でダウンロード",
    macAppStore: "Mac App Store でダウンロード",
  },
  exposureToast: {
    header: "各サイトに見えている内容",
    exposed: "露出",
    visibleToSites: "サイトに見える",
    location: "位置情報",
    timezone: "タイムゾーン",
    address: "住所",
    webrtc: "WebRTC",
    publicIpLeaking: "パブリック IP が漏れています",
    noLeak: "漏れなし",
    yourArea: "あなたの地域",
    hideMyLocation: "位置情報を隠す",
    getGeospoof: "GeoSpoof を入手",
    fullReport: "詳細レポート",
    dismiss: "閉じる",
  },
  themeToggle: {
    switchToLight: "ライトモードに切り替え",
    switchToDark: "ダークモードに切り替え",
    changedToLight: "テーマをライトモードに変更しました",
    changedToDark: "テーマをダークモードに変更しました",
  },
  carousel: {
    previousSlide: "前のスライド",
    nextSlide: "次のスライド",
  },
  spoofLocation: {
    hub: {
      metaTitle: "ブラウザの位置情報を偽装 — 無料拡張機能 | GeoSpoof",
      metaDescription:
        "Chrome、Edge、Firefox、Safari でブラウザの位置情報を偽装。GeoSpoof は Geolocation API とタイムゾーンを上書きし、あなたが選んだ位置をサイトに見せます。",
      ogTitle: "ブラウザの位置情報を偽装",
      badge: "位置情報の偽装",
      headingPre: "ブラウザの",
      headingEmphasis: "位置情報",
      intro:
        "ウェブサイトはブラウザの Geolocation API であなたの位置を、タイムゾーンで地域を読み取ります — VPN はどちらも変えません。GeoSpoof は両方を上書きし、あなたが選んだ位置をサイトに見せます。まずはブラウザを選んでください。",
      cardTitle: "{name} で位置情報を偽装",
      openGuide: "ガイドを開く",
    },
    page: {
      browserBadge: "{name} 拡張機能",
      headingPre: "{name} で位置情報を偽装",
      ctaFallback: "{name} 用の GeoSpoof を入手",
      testLocation: "位置情報をテスト",
      breadcrumbHome: "ホーム",
      breadcrumbHub: "位置情報を偽装",
      howToHeading: "{name} で位置情報を偽装する方法",
      stepInstallName: "{name} 用の GeoSpoof をインストール",
      stepInstallText: "{store} から無料の GeoSpoof 拡張機能を追加します。",
      stepEnableName: "{name} で有効化",
      stepSetName: "位置を設定",
      stepSetText:
        "都市を検索するか、座標を入力するか、VPN 同期を使って VPN の出口リージョンに合わせます。",
      stepReportsName: "{name} が、あなたが選んだ位置を報告します",
      stepReportsText:
        "GeoSpoof は Geolocation API とタイムゾーン（Date、Intl、Temporal）を上書きし、すべてのサイトがあなたの選んだ位置を見るようにします",
      stepReportsWebrtcSuffix:
        "。さらに WebRTC 保護が、あなたの本当の IP の漏れを防ぎます",
      webrtcAvailableTitle: "{name} では WebRTC 保護が利用できます。",
      webrtcAvailableBody:
        "GeoSpoof は、VPN を完全にすり抜けかねない WebRTC 経由の本当の IP の漏れも防ぎます。",
      webrtcUnavailableTitle: "注意：{name} では WebRTC 保護は利用できません。",
      webrtcUnavailableBody:
        "位置情報とタイムゾーンの偽装は完全に対応していますが、GeoSpoof が利用する WebRTC のプライバシー API はこのブラウザでは公開されていません。",
      faqHeading: "よくある質問",
      faqHowQ: "{name} で位置情報を偽装するには？",
      faqHowA:
        "無料の GeoSpoof 拡張機能をインストールし、位置を設定（都市を検索、座標を入力、または VPN と同期）すると、GeoSpoof が {name} の Geolocation API とタイムゾーン API を上書きし、サイトには本当の位置ではなく選んだ位置が見えるようになります。",
      faqVpnQ: "VPN は {name} の位置情報を変えますか？",
      faqVpnA:
        "いいえ。VPN が変えるのは IP アドレスだけです。{name} は依然として自身のブラウザ位置情報とシステムのタイムゾーンを報告するため、それらが本当の地域を明かしてしまう可能性があります。GeoSpoof はブラウザのシグナルを偽装します。一貫した位置のために VPN と併用してください。",
      faqFreeQ: "GeoSpoof は {name} で無料ですか？",
      faqFreeA:
        "はい。GeoSpoof は無料でオープンソースです。アカウントもログインもトラッキングもなく、すべての設定はお使いのデバイスに保存されます。",
      crossLinkLead: "別のブラウザをお使いですか？ こちらもご覧ください：",
      crossLinkText: "任意のブラウザで位置情報を偽装",
      schemaSoftwareDesc:
        "無料でオープンソースの拡張機能で、{name} の位置情報とタイムゾーンを偽装します。",
    },
    browsers: {
      chrome: {
        storeName: "Chrome ウェブストア",
        storeShort: "Chrome ウェブストア",
        intro:
          "Chrome は Geolocation API であなたの居場所を、Intl と Date でタイムゾーンをサイトに伝えます — そして VPN はそれを何も変えません。GeoSpoof は Chrome の内部でこれらのシグナルを上書きし、あなたが選んだ位置をサイトに見せます。同じビルドは Brave、Opera、その他の Chromium ブラウザでも動作します。",
        enableStep:
          "Chrome ツールバーのパズルピース（拡張機能）アイコンから GeoSpoof をピン留めし、ワンクリックで使えるようにします。",
        extraFaqQ:
          "GeoSpoof は Brave やその他の Chromium ブラウザで動作しますか？",
        extraFaqA:
          "はい。GeoSpoof は Chrome、Brave、Opera など Chromium ベースのブラウザに対応する Chrome ウェブストアからインストールします。位置情報とタイムゾーンの偽装は、すべてで同じように機能します。",
        metaTitle: "Chrome で位置情報を偽装 — 無料拡張機能 | GeoSpoof",
        metaDescription:
          "無料拡張機能で Chrome の位置情報を偽装。GeoSpoof は Geolocation API とタイムゾーンを上書きし、あなたが選んだ位置をサイトに見せます。Brave にも対応。",
        ogTitle: "Chrome で位置情報を偽装",
      },
      edge: {
        storeName: "Chrome ウェブストア",
        storeShort: "Chrome ウェブストア",
        intro:
          "Microsoft Edge は Chromium ベースなので、Chrome と同じように位置情報を露出します — Geolocation API とシステムのタイムゾーンです。GeoSpoof は Chrome ウェブストアからインストールでき、Edge で動作し、これらの API を上書きしてあなたが選んだ位置を報告します。Windows でも macOS でも、Edge での位置情報の偽装に使えます。",
        enableStep:
          "Edge から求められたら Chrome ウェブストアの拡張機能を許可し、拡張機能（パズルピース）アイコンから GeoSpoof をピン留めします。",
        extraFaqQ: "Windows の Edge で位置情報を偽装できますか？",
        extraFaqA:
          "はい。GeoSpoof は Windows と macOS の Edge で動作します。ブラウザがサイトに報告する位置情報とタイムゾーンを上書きしますが、Windows 自体の位置情報設定は変更しないため、OS はそのままです。",
        metaTitle: "Edge で位置情報を偽装 — 無料拡張機能 | GeoSpoof",
        metaDescription:
          "無料拡張機能で Microsoft Edge の位置情報を偽装。GeoSpoof は Geolocation API とタイムゾーンを上書きし、あなたが選んだ位置をサイトに見せます。",
        ogTitle: "Edge で位置情報を偽装",
      },
      firefox: {
        storeName: "Firefox アドオン",
        storeShort: "Firefox アドオン",
        intro:
          "Firefox は Geolocation API であなたの位置を、タイムゾーン API で地域を、VPN の有無にかかわらずサイトに渡します。GeoSpoof は Firefox アドオンからインストールし、これらのシグナルを上書きします。Firefox for Android でも動作する唯一のビルドなので、モバイルでも位置情報を偽装できます。",
        enableStep:
          "Firefox アドオンから GeoSpoof を追加した後、拡張機能メニューからツールバーにピン留めすると素早くアクセスできます。",
        extraFaqQ: "Android の Firefox で位置情報を偽装できますか？",
        extraFaqA:
          "はい。Android の Firefox 140+ は GeoSpoof に対応しているので、スマートフォンで位置情報とタイムゾーンを偽装できます — モバイルの Chrome は拡張機能に対応していないため、これはできません。",
        metaTitle: "Firefox で位置情報を偽装 — 無料アドオン | GeoSpoof",
        metaDescription:
          "無料でオープンソースのアドオンで Firefox の位置情報を偽装。GeoSpoof は Geolocation API とタイムゾーンを上書きし、あなたが選んだ位置をサイトに見せます。",
        ogTitle: "Firefox で位置情報を偽装",
      },
      safari: {
        storeName: "App Store",
        storeShort: "App Store",
        intro:
          "iOS、iPadOS、macOS の Safari は、他のブラウザと同じように位置情報とタイムゾーンをサイトに報告します。GeoSpoof は App Store からインストールし、Safari 拡張機能として動作し、これらの API を上書きしてあなたが選んだ位置をサイトに見せます。位置情報とタイムゾーンの偽装は完全に対応していますが、WebRTC 保護は Safari では利用できません。",
        enableStep:
          "App Store からインストールした後、Safari の拡張機能メニューから GeoSpoof を有効にします（iOS ではアドレスバーのパズルピース、macOS では Safari → 設定 → 機能拡張）。",
        extraFaqQ: "iPhone の Safari で位置情報の偽装は機能しますか？",
        extraFaqA:
          "はい。GeoSpoof は iOS、iPadOS、macOS 向けに App Store で提供される Safari 拡張機能です。あるサイトで有効にすると、Safari が報告する位置情報とタイムゾーンを上書きします。WebRTC 保護は Safari で利用できない唯一の機能です。",
        metaTitle: "Safari で位置情報を偽装 — 無料拡張機能 | GeoSpoof",
        metaDescription:
          "App Store の無料拡張機能で Safari の位置情報を偽装。GeoSpoof は iOS、iPadOS、macOS で Geolocation API とタイムゾーンを上書きします。",
        ogTitle: "Safari で位置情報を偽装",
      },
    },
  },
  vpn: {
    meta: {
      title: "GeoSpoof に VPN は必要？ プライバシーの2つの層 | GeoSpoof",
      description:
        "GeoSpoof はブラウザが報告する位置情報・タイムゾーン・WebRTC を隠します。ノーログの VPN は IP を隠します — 拡張機能では変えられない唯一のシグナルです。",
      ogTitle: "GeoSpoof に VPN は必要？",
    },
    hero: {
      mapAlt: "Proton VPN があなたの IP アドレスを隠します",
      badge: "位置情報のプライバシーには2つの層があります",
      headingPre: "",
      headingPost: " に VPN は必要？",
      answer:
        "GeoSpoof はブラウザの位置情報を隠します。VPN は IP を隠します。完全なプライバシーには、両方が必要です。",
      disclosureBody:
        "私たちは Proton VPN と提携しています。当社のリンク経由でご契約いただくと、追加費用なしで私たちに手数料が入ります。",
      ctaPlans: "Proton VPN のプランを見る",
      partnerPricing: "パートナー割引 最大 {discount}",
      learnMore: "詳しく見る",
      moneyBack: "30日間の返金保証",
      platformsAria:
        "Proton VPN は Windows、macOS、Linux、iOS、Android で利用できます",
    },
    twoLayers: {
      heading: "2つの層、2つのツール",
      intro:
        "位置情報のプライバシーには独立した2つの層があります。GeoSpoof はブラウザの層を、VPN はネットワークの層を封じます。一方だけ偽装してもう一方を放置すると、その食い違いがあなたを暴きます。ブラウザが東京を示しているのに IP がまだニューヨークを指していれば、簡単に見破られます。",
      browserTitle: "ブラウザの層",
      browserBody:
        "ウェブサイトは Geolocation API から位置情報を、タイムゾーン API から地域を、WebRTC からローカル IP を読み取ります。GeoSpoof はこれらすべてを上書きし、あなたが選んだ位置を報告させます。",
      browserWho: "GeoSpoof が担当",
      networkTitle: "ネットワークの層",
      networkBody:
        "各サイトは、あなたの接続元であるパブリック IP アドレスも見ています。これは実在の都市に対応します。ブラウザ拡張機能ではこれを変えられません — ブラウザの下、ネットワークにあるからです。",
      networkWho: "VPN が担当",
      primerLead:
        "より深く、中立的な解説をお求めですか？ Privacy Guides の Jonah Aragon が、",
      primerLink: "VPN が実際にできること・できないこと",
    },
    whyProton: {
      eyebrow: "私たちが信頼する VPN",
      heading: "なぜ Proton VPN なのか",
      intro:
        "GeoSpoof はオープンソースで、ログを一切保存しません。プライバシーにおいて、価値ある信頼とは検証できる信頼だけです。Proton も同じ基準を自らに課しています — オープンソースのアプリ、独立監査を受けたノーログポリシー、そしてスイスの法域です。",
      reason1Title: "ノーログ、独立監査済み",
      reason1Body:
        "Proton のノーログポリシーは、主張されているだけでなく、独立監査を繰り返し受け、実際の法的要請でも検証されています。",
      reason2Title: "スイス、オープンソース",
      reason2Body:
        "強力なプライバシー法のもとスイスを拠点とし、誰でも検査できる完全なオープンソースのアプリを提供 — GeoSpoof と同じ検証可能なアプローチです。",
      reason3Title: "VPN 同期に対応",
      reason3Body:
        "GeoSpoof の VPN 同期は、偽装した位置を VPN の出口リージョンに自動で合わせ続けます — Proton でも、あなたが選ぶ他のどの VPN でも。",
      calloutLead: "言葉だけで信じないでください。",
      calloutBodyPre: " Proton は、",
      calloutLink: "Privacy Guides",
      calloutBodyPost:
        "（独立したコミュニティ運営のプライバシー情報源）が推奨する数少ない VPN の1つです。GeoSpoof はどの VPN でも機能するので、囲い込まれることはありません。上記のオープンソースと監査の理由から Proton を推奨しますが、正しい選択はあなたが信頼するものです。",
    },
    plan: {
      imgAlt: "Proton VPN アプリのホーム画面",
      heading: "自分に合うプランを選ぶ",
      body: "GeoSpoof はオープンソースです。IP の層については、Proton の VPN Plus をおすすめします。2年プランは Proton の標準料金より {discount} オフで、月あたりの料金が最も安く、総合的に最もお得です。まず試してみたいですか？ 月額プランもあります。",
      cta: "Proton VPN のプランを見る",
      unlimitedPre:
        "すでに VPN をお持ちですか？もっと多くの機能が必要ですか？Proton の",
      unlimitedLink: "Unlimited プラン",
      unlimitedPost: "なら、VPN に Mail・Pass・Drive・Calendar が含まれます。",
    },
    inlineDisclosure:
      "ご注意 — これはアフィリエイトリンクです。これを経由してご契約いただくと、追加費用なしで Proton が私たちに少額を分配します。これにより GeoSpoof をオープンソースかつ独立に保つ助けになっています。",
    faq: {
      heading: "よくある質問",
      items: [
        {
          q: "GeoSpoof を使うなら VPN は必要ですか？",
          a: "完全な位置情報プライバシーのためには、はい — ただし GeoSpoof が不十分だからではありません。GeoSpoof は、ブラウザがサイトに報告する位置情報・タイムゾーン・WebRTC の詳細を変えます。残る最も強いシグナルは IP アドレスで、それを変えられるのは VPN だけです。両者は異なる層をカバーし、合わせて1つの一貫した内容を示します。",
        },
        {
          q: "GeoSpoof で別の VPN を使えますか？",
          a: "はい。GeoSpoof はどの VPN でも機能します。Proton に縛られることはなく、VPN 同期はすべてで同じように動作します。Mullvad と IVPN も、プライバシーコミュニティで高く評価されているノーログのプロバイダーです。私たちは完全なオープンソースで、独立監査済み、Privacy Guides の推奨という理由で Proton を推奨しますが、選択は完全にあなた次第です。",
        },
        {
          q: "なぜ GeoSpoof は Proton VPN を推奨するのですか？",
          a: "Proton はノーログで、スイスを拠点とし、完全なオープンソースで、独立監査を繰り返し通過しています。これらは GeoSpoof が拠って立つのと同じ、検証可能でプライバシー第一の価値観です。また、アフィリエイト収入を一切受け取らない独立した情報源である Privacy Guides が推奨する数少ない VPN の1つでもあります。VPN 同期は、他のどの VPN とも同じように Proton でも機能します。",
        },
        {
          q: "GeoSpoof を使うのに VPN は必要ですか？",
          a: "いいえ。GeoSpoof の中核となる偽装は VPN なしで機能します。VPN は本当の IP アドレスを隠すだけの補完的なツールであり、GeoSpoof を使うための必須条件ではありません。",
        },
        {
          q: "私が契約すると GeoSpoof は収益を得ますか？",
          a: "当社のリンク経由で Proton をご契約いただくと、追加費用なしで Proton が売上の一部を私たちに分配します。これにより GeoSpoof をオープンソースかつ広告なしに保つ助けになります。私たちは Proton をその実力（オープンソース、独立監査済み、Privacy Guides の推奨）で推奨しており、手数料が、実際にあなたに最適なプランを左右することはありません。",
        },
      ],
    },
    disclosure: {
      label: "アフィリエイトに関する開示：",
      body: "GeoSpoof は独立したオープンソースのユーティリティであり、Proton とは提携も推薦もされていません。当社の推奨経由でプランをご購入いただくと、追加費用なしで Proton が売上の一部を私たちに分配します。これにより GeoSpoof を無料・オープンソース・広告なしに保つ助けになります。私たちは Proton を手数料のためではなくその実力（オープンソース、独立監査済み、Privacy Guides の推奨）で推奨しており、GeoSpoof はあなたが好むどの VPN でも機能します。",
    },
  },
  support: {
    meta: {
      title: "GeoSpoof サポート — 偽装・VPN 同期・設定の問題を解決",
      description:
        "GeoSpoof のヘルプ：機能しない位置情報の偽装、VPN 同期のタイムアウト、WebRTC の問題、ブラウザやモバイルの設定の解決 — またはチームへのお問い合わせ。",
    },
    heading: "どのようにお手伝いできますか？",
    subhead: "以下でよくある問題の答えを見つけるか、直接お問い合わせください。",
    commonIssues: "よくある問題",
    faqs: [
      {
        q: "拡張機能をインストールした後、偽装が機能しない",
        a: "拡張機能は読み込み時にページへ注入されるため、インストールまたは有効化した時点で既に開いていたタブはまだ保護されません。位置情報保護を有効にした後、保護したいタブをすべて再読み込みしてください。それでも機能しない場合は、拡張機能を無効にしてから再度有効にし、もう一度再読み込みしてみてください。",
      },
      {
        q: "VPN 同期でタイムアウトまたはネットワークエラーが表示される",
        a: "VPN 同期は、VPN の出口リージョンを検出するためにいくつかのパブリック IP ジオロケーションサービスを呼び出します。一部の VPN やファイアウォールは、これらのサービスへの送信リクエストをブロックします。VPN のファイアウォールやキルスイッチを一時的に無効にしてみてください。問題が続く場合は、代わりに「都市を検索」または「座標を入力」タブで位置を手動設定してください。",
      },
      {
        q: "ブラウザの更新後に偽装が機能しなくなった",
        a: "ブラウザの更新により、拡張機能とページ API のやり取りが変わることが時々あります。GeoSpoof が最新バージョンであることを確認してください。ポップアップの「詳細」タブでバージョンを確認し、GitHub の最新リリースと比較してください。遅れている場合は、ブラウザの拡張機能マネージャーから更新してください。",
      },
      {
        q: "特定のウェブサイトが偽装されない",
        a: "一部のサイトは、ブラウザの Geolocation API ではなく IP アドレスに基づくサーバー側の位置検出を使います。GeoSpoof はブラウザ API のみを上書きし、IP アドレスは変えません。位置の完全な一貫性のためには、同じ地域を指す VPN と GeoSpoof を併用してください。",
      },
      {
        q: "デスクトップでは動くのにスマートフォンで動かない",
        a: "Firefox for Android では、Firefox 140 以降で拡張機能が完全に対応しています。iOS と macOS の Safari では、拡張機能は App Store で提供されます — アドレスバーのパズルピースアイコンをタップし、保護したいサイトで GeoSpoof を有効にしてください。iOS と Android の Chrome は拡張機能に対応していません。",
      },
      {
        q: "WebRTC 保護が利用できない / グレーアウトしている",
        a: "WebRTC 保護は、すべてのプラットフォームで利用できるわけではないブラウザのプライバシー API を使います。デスクトップの Firefox と Chromium ベースのブラウザで対応しています。Safari と Firefox for Android では利用できません。",
      },
      {
        q: "「拡張機能はこのページでは実行できません」と表示される",
        a: "ブラウザは、about:blank、chrome://、about:newtab、拡張機能ストアのページなどの組み込みページで拡張機能が実行されるのを制限します。これは回避できないブラウザのセキュリティ境界です。GeoSpoof はすべての通常のウェブサイトで機能します。",
      },
    ],
    copy: "コピー",
    copied: "✓ コピーしました",
    copyAria: "メールアドレスをコピー",
    stillNeedHelp: "まだお困りですか？",
    contactBody: "メールをお送りいただければ、1〜2日以内に返信いたします。",
    reportBugsLead: "バグの報告もこちらから：",
  },
  about: {
    meta: {
      title: "GeoSpoof について — 誰が作っているのか | GeoSpoof",
      description:
        "GeoSpoof は Anthony Sgro が作るオープンソースの位置情報・タイムゾーン偽装ツールです — アカウントなし、トラッキングなし、そして何をするかについて正直です。",
      ogTitle: "GeoSpoof について",
    },
    greeting: "👋 こんにちは、Anthony です",
    tagline: "私が GeoSpoof を作っています。",
    githubAria: "GitHub の Anthony Sgro",
    linkedinAria: "LinkedIn の Anthony Sgro",
    p1a: "私はソフトウェア開発者で、GeoSpoof は",
    p1strong: "自分自身が欲しかったもの",
    p1b: "として始まりました。何にも登録せず、また別の会社に自分のデータを渡すこともなく、ブラウザが明かす位置情報とタイムゾーンを手軽に制御する方法です。それが今では多くの人が毎日使うツールに育ち、いまだに少し驚いています。",
    p2a: "オープンソースで、",
    p2strong: "アカウントもなく、登録すべきものも何もありません",
    p2b: "。設定はお使いのブラウザに残るだけです。そして実際に何をしているのか気になったら、コードは公開されており、",
    verifyLink: "検証ページ",
    p2c: "では、ウェブサイトがあなたについて何を読み取れるかを正確に確認できます。",
    p3a: "オプションの Pro ティアには",
    p3strong: "追加の強力な機能",
    p3b: "があり、日常の偽装は無料のままです。",
    p4a: "質問やアイデアがあったり、ただ",
    p4em: "あいさつ",
    p4b: "したいですか？ ",
    supportLink: "サポートページ",
    p4c: "から私に直接届きます。または上部の GitHub や LinkedIn で見つけてください。お立ち寄りいただきありがとうございます。",
  },
  spoofTimezone: {
    meta: {
      title: "ブラウザのタイムゾーンを偽装 — 無料拡張機能 | GeoSpoof",
      description:
        "ブラウザのタイムゾーンを任意の位置に合わせて変更・偽装。GeoSpoof は Date、Intl、Temporal を上書きし、時計があなたの本当の地域を明かさないようにします。",
      ogTitle: "ブラウザのタイムゾーンを偽装",
    },
    hero: {
      breadcrumbHome: "ホーム",
      breadcrumb: "タイムゾーンを偽装",
      badge: "タイムゾーンの偽装",
      headingPre: "ブラウザの",
      headingEmphasis: "タイムゾーン",
      introPre:
        "ウェブサイトは、ページが読み込まれた瞬間に — 許可を求めることなく — ",
      introMid: " と ",
      introPost:
        " を通じてあなたのタイムゾーンを読み取ります。GeoSpoof はこれらを上書きし、時計を、あなたが実際にいる場所ではなく選んだ位置に合わせます。",
      ctaFallback: "GeoSpoof を無料で入手",
      testTimezone: "タイムゾーンをテスト",
    },
    whatLeaks: {
      heading: "ブラウザが明かしてしまうもの",
      intro:
        "Geolocation API とは異なり、タイムゾーンの経路は決して許可を求めません — ページが読み込まれた瞬間に応答します。時計が1つ食い違うだけで、偽装した GPS 位置が台無しになりかねません。",
      reveals1: "America/New_York のような IANA 名を返します。",
      reveals2: "UTC からのオフセットを分単位で返します。",
      surface3Api: "Temporal とドキュメントのタイムスタンプ",
      reveals3:
        "新しい時刻 API とページのタイムスタンプも同じゾーンを露出します。",
    },
    howTo: {
      heading: "タイムゾーンを偽装する方法",
      schemaName: "ブラウザのタイムゾーンを偽装する方法",
      schemaDesc:
        "無料の GeoSpoof 拡張機能を使い、システムの時計を変えずに、ブラウザがサイトに報告するタイムゾーンを変更します。",
      steps: [
        {
          name: "GeoSpoof をインストール",
          text: "お使いのブラウザ — Firefox、Chrome、Brave、Edge、Safari — 用に無料の GeoSpoof 拡張機能を追加します。",
        },
        {
          name: "位置を設定",
          text: "都市を検索するか、座標を入力するか、VPN 同期を使って VPN の出口リージョンに合わせます。",
        },
        {
          name: "タイムゾーンが自動で揃う",
          text: "GeoSpoof は Date、Intl.DateTimeFormat、Temporal を上書きし、時計ベースのすべての API が選んだ位置のタイムゾーンを報告するようにします。",
        },
        {
          name: "動作を検証",
          text: "GeoSpoof の検証ページを開き、報告されるタイムゾーンが偽装した位置と一致することを確認します。",
        },
      ],
    },
    whyItMatters: {
      heading: "偽装した位置には、それに合う時計が必要",
      body: "VPN は IP を、GeoSpoof は GPS 座標を移します — しかしタイムゾーンが本当の地域を示したままだと、その食い違いがあなたを暴きます。GeoSpoof はタイムゾーンを選んだ位置に自動で合わせ続け、VPN が出口サーバーを切り替えても再調整します。こうして位置情報・タイムゾーン・IP がすべて同じ内容を示します。",
      blogLinkLead: "技術的に深く知りたいですか？ ",
      blogLinkText: "なぜタイムゾーンが位置を明かすのかを読む",
    },
    faq: {
      heading: "よくある質問",
      items: [
        {
          q: "ブラウザのタイムゾーンを変えるには？",
          a: "ブラウザはタイムゾーンをオペレーティングシステムから取得し、ほとんどの場合サイトごとに上書きできません。GeoSpoof は、システムの時計に触れずに、ブラウザがサイトに報告するタイムゾーンを変えます。拡張機能をインストールし、位置を設定すると、それに合わせて JavaScript のタイムゾーン API を上書きします。",
        },
        {
          q: "システムの時計を変えずにタイムゾーンを偽装できますか？",
          a: "はい。GeoSpoof はブラウザ API のレベルで動作するため、サイトが読み取る内容（Intl.DateTimeFormat、Date、Temporal）を変える一方で、コンピューターの実際の時計やシステム設定はそのまま保たれます。",
        },
        {
          q: "VPN はブラウザのタイムゾーンを変えますか？",
          a: "いいえ。VPN が変えるのは IP アドレスだけです。ブラウザは依然としてオペレーティングシステムから自身のタイムゾーンを報告するため、別の国の VPN を使いながら自宅のタイムゾーンのままだと、簡単に見破れる食い違いになります。GeoSpoof はそのギャップを埋めるため、タイムゾーンを偽装した位置に合わせます。",
        },
        {
          q: "なぜタイムゾーンは位置と一致する必要があるのですか？",
          a: "GPS 位置を偽装したり VPN を使ったりしても、タイムゾーンを本当の地域のままにしておくと、両者が食い違います — これはよくある、見破りやすい手がかりです。タイムゾーンを選んだ位置に合わせることで、すべてのシグナルが同じ内容を示すようになります。",
        },
        {
          q: "GeoSpoof はタイムゾーンを自動で偽装しますか？",
          a: "はい。位置を設定したり VPN と同期したりすると、GeoSpoof はその座標に対応する正しいタイムゾーンを解決し、自動で適用します — VPN が出口サーバーを切り替えるときも含めて。",
        },
      ],
    },
  },
  verify: {
    meta: {
      title:
        "ブラウザ位置情報テスト — ウェブサイトがあなたについて知っていることを確認 | GeoSpoof",
      description:
        "無料のブラウザ位置情報テスト。ウェブサイトが今あなたについて読み取っている位置情報・タイムゾーン・IP を確認 — そしてブラウザが本当の位置を漏らしているかどうかも。",
    },
    eyebrow: "検証",
    heading: "ウェブサイトがあなたについて見られること",
    refresh: "更新",
    refreshAria: "更新 — ページを再読み込みして最新の値を表示します",
    introMobile: "ウェブサイトが今あなたについて読み取れるライブの値。",
    introDesktop:
      "今この瞬間のブラウザのライブの値 — ウェブサイトが読み取れる位置情報・タイムゾーン・IP。GeoSpoof が有効なら、本当の位置ではなく偽装した位置が反映されます。",
    vpnSyncNote:
      "自動 VPN 同期をお使いですか？ 変更が反映されるまで最大10秒かかることがあります — 「更新」をタップして最新を表示してください。",
    rows: {
      geolocation: "位置情報",
      timezone: "タイムゾーン",
      currentTime: "現在時刻",
      ipAddress: "IP アドレス",
      webrtc: "WebRTC",
      waitingPermission: "許可を待っています…",
      blockedDenied: "ブロック / 拒否",
      lookingUp: "検索中…",
      lookupFailed: "検索に失敗しました",
      probing: "調査中…",
      noLeak: "IP 漏れは検出されませんでした",
    },
    vpnCard: {
      line1:
        "IP アドレスは、GeoSpoof が変えられない唯一のシグナルです。変えられるのは VPN だけです。",
      line2: "私たちのおすすめは最大 {discount} オフです。",
      cta: "Proton VPN で IP を保護",
      priceNote: "最大 {discount} オフ",
      guaranteeNote: "30日間保証",
    },
    apiSection: {
      eyebrow: "ブラウザ API のサーフェス",
      description:
        "攻撃者が確認する主要なフィンガープリンティングのサーフェス。任意のグループを展開して、取得される値を確認してください — すべてが同じ内容を示すはずです。",
    },
    supportLead: "何かおかしい、または予期しない結果が出ましたか？ ",
    supportLink: "サポートを受ける",
    verdict: {
      running: "チェックを実行中…",
      runningSub: "ブラウザを読み取り、漏れを調査しています。",
      allGood: "すべてのチェックに合格",
      allGoodSub: "私たちが確認した限り、あなたを暴くものはありません。",
      exposed: "一部のシグナルが露出しています",
      problemWebrtc: "WebRTC が本当の IP を漏らしています",
      problemGeo: "位置情報が IP と一致しません",
      problemTz: "タイムゾーンが IP と一致しません",
      crossRef: "これらのシグナルを照合するサイトは、あなたを検出できます。",
      installFree: "GeoSpoof を無料でインストール",
      alreadyHave: "すでに GeoSpoof をお持ちですか？",
    },
    dialog: {
      title: "すでに GeoSpoof を実行中ですか？",
      description:
        "簡単なチェックリストで、検出されたほぼすべてのシグナルが解消します。",
      ipMismatchLocation: "IP が位置と一致しませんか？",
      ipMismatchTimezone: "IP がタイムゾーンと一致しませんか？",
      ipMismatchBody:
        "VPN 同期がオフのときは、これが正常です — GeoSpoof は、オンにしたときだけ IP を合わせます。本当の IP を保つつもりだったなら、これは意図どおりの動作です。",
      autoSyncBold: "自動 VPN 同期をオンにしたばかりですか？",
      autoSyncBody:
        "更新後、追いつくまで最大10秒ほど待ってから再確認してください — 自動同期は手動同期のように即時ではありません。",
      updateBold: "最新バージョンに更新してください。",
      updateBody:
        "新しいフィンガープリンティングの手口は継続的に修正されています。 ",
      downloadOptions: "ダウンロードオプションを見る",
      checkSiteBold: "このサイトで有効になっているか確認してください。",
      checkSiteBody:
        "ツールバーのアイコンを確認してください。許可リストや拒否リストで範囲を限定している場合は、このサイトを含めてください。",
      reloadBold: "有効化または更新の後に再読み込みしてください。",
      reloadBody:
        "一部のサーフェスは、ページを新しく読み込んだときにのみ適用されます。",
      stillStuck: "まだ解決しませんか？ サポートにお問い合わせください",
      gotIt: "了解",
    },
    faq: {
      heading: "よくある質問",
      items: [
        {
          q: "ブラウザの位置情報とは何ですか？",
          a: "ブラウザの位置情報とは、JavaScript の Geolocation API を通じてウェブサイトに渡す緯度と経度のことです。上の地図と座標は、サイトがあなたの居場所を尋ねたときに読み取る内容そのものを示しています。GeoSpoof が有効なら、それは本当の位置ではなく偽装した位置です。",
        },
        {
          q: "VPN を使っていても、ウェブサイトは私の本当の位置を見られますか？",
          a: "はい。VPN が変えるのは IP アドレスだけです。ブラウザは依然として自身の GPS レベルの位置情報、システムのタイムゾーン、ロケールを報告し、WebRTC は本当の IP を丸ごと漏らすことがあります。これらのシグナルが VPN の出口位置と食い違えば、サイトは何かおかしいと気づけます。このページはまさにそうした食い違いを検出します。",
        },
        {
          q: "なぜタイムゾーンが IP アドレスと一致しないのですか？",
          a: "タイムゾーンはオペレーティングシステムから、IP の位置はネットワークや VPN から来ます。別の国の VPN 経由で接続しながらシステムの時計を自宅のタイムゾーンのままにすると、両者は揃いません — これはよくある、見破りやすい手がかりです。GeoSpoof はそのギャップを埋めるため、タイムゾーンを偽装した位置に合わせます。",
        },
        {
          q: "WebRTC 漏れとは何ですか？",
          a: "WebRTC は、リアルタイムの音声・映像・データのためのブラウザ機能です。ブロックしない限り、あなたの本当のパブリック IP とローカル IP をウェブサイトに直接明かし — VPN をすり抜け — かねません。上の WebRTC チェックはその漏れを調査し、露出できたアドレスを報告します。",
        },
        {
          q: "このブラウザ位置情報テストは無料ですか？",
          a: "はい。このテストは完全にブラウザ内で実行され、費用はかからず、アカウントも不要です。どのウェブサイトも読み取れるのと同じシグナルを読み取り、分かりやすい言葉であなたに示します。",
        },
      ],
    },
  },
  engineLevel: {
    meta: {
      title:
        "Chrome の「このブラウザをデバッグしています」バーを非表示にする | GeoSpoof",
      description:
        "GeoSpoof のエンジンレベルの偽装は Chrome のデバッガー API を使うため、Chrome はデバッグバーを表示します。その意味、安全な理由、非表示にする方法を解説します。",
      ogTitle:
        "Chrome の「このブラウザをデバッグしています」バーを非表示にする",
    },
    hero: {
      breadcrumbHome: "ホーム",
      breadcrumb: "エンジンレベルの偽装",
      badge: "Chrome · エンジンレベルの偽装",
      headingPre: "Chrome の",
      headingEmphasis: "「このブラウザをデバッグしています」",
      headingPost: "バーを非表示にする",
      intro:
        "エンジンレベルの偽装が有効な間、Chrome は「このブラウザをデバッグしています」バーを表示します。無害です — 非表示にする方法を解説します。",
      ctaHowTo: "バーを非表示にする方法",
      ctaFallback: "GeoSpoof を無料で入手",
      figureAlt:
        "エンジンレベルの偽装が有効な間、Chrome がウィンドウ上部に「GeoSpoof がこのブラウザのデバッグを開始しました」という通知バーを表示している様子",
      figCaption:
        "エンジンレベルの偽装が有効な間に Chrome が表示する「このブラウザをデバッグしています」バー。",
    },
    whatBar: {
      heading: "バーの意味",
      intro:
        "エンジンレベルの偽装は、ページの最初のスクリプトが実行される前に、ブラウザレベルでタイムゾーンを適用するため、バックグラウンドのワーカーもカバーします。そこまで深く到達するために、GeoSpoof は Chrome のデバッガー API を使い、Chrome はそれを通知バーで知らせます。",
      point1Title: "これは Chrome の標準的な通知です",
      point1Body:
        "Chrome は、デバッガー API を使うすべての拡張機能にこのバーを表示します — DevTools が使うのと同じ API です。何か問題が起きたからではなく、GeoSpoof が接続した瞬間に表示されます。",
      point2Title: "GeoSpoof はタイムゾーンの上書きを設定するだけ",
      point2Body:
        "デバッガー接続は、偽装したタイムゾーンをフレームやワーカー全体に適用するためだけに使われます。ページの内容やキー入力、閲覧履歴は読み取りません — そしてコードはオープンソースです。",
      point3Title: "バーは見た目上のものです",
      point3Body:
        "サイトからあなたがどう見えるかは何も変わりません。非表示にするのは、ウィンドウ上部の帯を取り除くためだけです。",
    },
    howTo: {
      heading: "バーを非表示にする方法",
      introPre: "Chrome を ",
      introPost:
        " フラグ付きで起動します。まず Chrome を終了し、お使いのシステム向けの手順に従ってください。",
    },
    guides: {
      win: {
        step1: "Chrome のウィンドウをすべて閉じます。",
        step2:
          "使用している Chrome のショートカット（タスクバー、デスクトップ、スタートメニュー）を右クリックし、「プロパティ」を選びます。",
        step3a: "",
        step3strong: "リンク先",
        step3mid: " フィールドで、",
        step3code: "chrome.exe",
        step3end:
          " への引用符付きパスはそのままにし、閉じ引用符の後にフラグを追加します（先頭のスペースに注意）。",
        step4: "「OK」をクリックし、そのショートカットから Chrome を開きます。",
        note: "Chrome を起動する各ショートカットで繰り返してください（タスクバーとスタートメニューは別々のショートカットです）。",
      },
      mac: {
        step1: "Chrome を完全に終了します（⌘Q）。",
        step2: "ターミナルを開き、下のコマンドを実行します。",
        step3a:
          "Chrome がバーなしで再び開きます。毎回この方法で起動するには、コマンドを Automator の",
        step3strong: "アプリケーション",
        step3end: "またはシェルのエイリアスとして保存してください。",
      },
      linux: {
        step1: "Chrome を閉じます。",
        step2:
          "フラグ付きで起動するか、Chrome の .desktop ランチャーの Exec= 行にフラグを追加して永続化します。",
        note: "Chromium を使っている場合は、google-chrome の代わりに chromium を使ってください。",
      },
    },
    permanent: {
      heading: "設定を維持する",
      bodyPre:
        "フラグは、それを含む起動にのみ適用されるため、別の方法で Chrome を開くとバーが戻ります。ずっと非表示のままにするには、毎日 Chrome を開くショートカットやランチャーに ",
      bodyMid:
        " を追加してください — Windows ショートカットのリンク先、macOS のランチャーアプリ、または Linux の ",
      bodyDesktopCode: ".desktop",
      bodyEnd: " ファイルです。",
      body2Pre:
        "面倒なら？ エンジンレベルの偽装をオフのままにしてください — GeoSpoof の標準保護は、デバッガーバーなしで引き続きあなたの",
      locationLink: "位置情報",
      body2Mid: "と",
      timezoneLink: "タイムゾーン",
      body2End: "を偽装します。",
    },
    faq: {
      heading: "よくある質問",
      items: [
        {
          q: "なぜ GeoSpoof は私のブラウザを「デバッグ」していると表示するのですか？",
          a: "エンジンレベルの偽装は Chrome のデバッガー API（Chrome DevTools Protocol）を使います — ブラウザ自身の DevTools が使うのと同じ仕組みで、通常の拡張機能よりも深いところでタイムゾーンを設定します。拡張機能がその API で接続するたびに、Chrome は「このブラウザをデバッグしています」バーを表示します。これは Chrome の標準的な通知であり、何か問題があるしるしではありません。",
        },
        {
          q: "安全ですか？ GeoSpoof は私のデータを読んでいますか？",
          a: "GeoSpoof はデバッガー接続を、タイムゾーンの上書きを適用するためだけに使います。ページの内容やキー入力、閲覧履歴は読み取りません。GeoSpoof はオープンソースなので、何を送信しているかを GitHub で正確に確認できます。使いたくない場合は、エンジンレベルの偽装をオフのままにすれば、GeoSpoof の標準保護が引き続き位置情報とタイムゾーンを偽装します。",
        },
        {
          q: "「このブラウザをデバッグしています」バーを非表示にするには？",
          a: "Chrome を {flag} フラグ付きで起動します。Windows では Chrome ショートカットのリンク先フィールドに追加します。macOS ではそのフラグ付きでターミナルから Chrome を再起動します（またはランチャーとして保存します）。Linux では Chrome の起動コマンドまたは .desktop ファイルに追加します。偽装が機能し続けたまま、バーは消えます。",
        },
        {
          q: "Chrome を再起動するとバーは戻りますか？",
          a: "はい。いつも使うショートカットやランチャーにフラグを組み込まない限り戻ります。フラグは、それを含む起動にのみ影響するため、別の方法で Chrome を開くとバーが戻ります。維持するには、毎日使うランチャーに追加してください。",
        },
        {
          q: "なぜ GeoSpoof は自動でバーを非表示にできないのですか？",
          a: "バーは Chrome 自身が制御しており、オフにできるのはブラウザの起動フラグだけです。拡張機能は Chrome のコマンドラインフラグを設定できないため、この手順は一度あなたが行う必要があります。これはデバッガー API を巡る Chrome の意図的な安全策です。",
        },
        {
          q: "エンジンレベルの偽装とは何ですか？",
          a: "これは Chrome 専用の GeoSpoof のオプションで、ページのスクリプトからではなく、ブラウザエンジンのレベルでタイムゾーンを偽装します。ページの最初のスクリプトが実行される前に適用され、バックグラウンドのワーカーにも到達するため、ページレベルの偽装が見逃しかねないタイムゾーンの漏れを塞ぎます。位置情報は引き続き、GeoSpoof の標準的な、許可を求めない方法を使います。",
        },
      ],
    },
    schema: {
      howToStep1Name: "Chrome を完全に終了する",
      howToStep1Text:
        "すべての Chrome ウィンドウを閉じ、ブラウザを完全に終了させます — フラグは新しい起動にのみ適用されます。",
      howToStep2Name: "フラグ付きで Chrome を再起動する",
      howToStep2Text:
        "お使いのオペレーティングシステム向けの手順で、{flag} コマンドラインフラグを付けて Chrome を起動します。",
      howToStep3Name: "永続化する（任意）",
      howToStep3Text:
        "普段使うショートカットやランチャーにフラグを追加し、起動のたびにバーが非表示のままになるようにします。",
      howToStep4Name: "GeoSpoof を再び開く",
      howToStep4Text:
        "エンジンレベルの偽装はこれまでどおり機能します — 消えるのは通知バーだけです。",
      howToName:
        "Chrome の「このブラウザをデバッグしています」バーを非表示にする方法",
      howToDesc:
        "Chrome を {flag} フラグ付きで起動して、GeoSpoof のエンジンレベルの偽装が有効な間に Chrome が表示する通知バーを非表示にします。",
    },
  },
}
