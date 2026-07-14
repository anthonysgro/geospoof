import type { Dictionary } from "./en"

/**
 * Indonesian dictionary.
 *
 * Typed as `Dictionary`, so a missing or misnamed key fails the build. Copy is
 * hand-written (not machine-translated) — Google suppresses thin auto-translated
 * content in local results, so quality matters for the SEO payoff.
 */
export const id: Dictionary = {
  nav: {
    home: "Beranda",
    features: "Fitur",
    blog: "Blog",
    support: "Dukungan",
    download: "Unduh",
    buyMeACoffee: "Traktir saya kopi",
    github: "GeoSpoof di GitHub",
    openMenu: "Buka menu navigasi",
    brandAria: "GeoSpoof - Beranda",
    mainNavAria: "Navigasi utama",
  },
  hero: {
    badge: "Pendamping VPN · Ekstensi",
    headlinePre: "Selesaikan apa yang ",
    headlineEmphasis: "VPN Anda",
    headlinePost: " mulai",
    subhead:
      "VPN mengubah IP Anda, tetapi browser Anda tetap membocorkan lokasi asli Anda. GeoSpoof menyesuaikannya dengan VPN Anda secara otomatis — dan menjaganya tetap selaras saat Anda berganti server.",
    downloadFree: "Unduh Gratis",
    seeWhatSitesDetect: "Lihat apa yang dideteksi situs",
    allPlatforms: "Semua platform & browser",
    usersTrust: "Dipercaya oleh {count} pengguna",
    usersShort: "{count} pengguna",
    firefoxRating: "Firefox",
    mainPhoneAlt: "Aplikasi GeoSpoof — tampilan utama",
    secondaryPhoneAlt: "Aplikasi GeoSpoof — tampilan kedua",
  },
  footer: {
    groups: {
      guides: "Panduan",
      learn: "Pelajari",
      company: "Perusahaan",
    },
    links: {
      spoofAllBrowsers: "Palsukan lokasi: semua browser",
      spoofChrome: "Palsukan lokasi di Chrome",
      spoofFirefox: "Palsukan lokasi di Firefox",
      spoofEdge: "Palsukan lokasi di Edge",
      spoofSafari: "Palsukan lokasi di Safari",
      spoofTimezone: "Palsukan zona waktu",
      gps: "GeoSpoof GPS untuk Mac",
      needVpn: "Apakah Anda perlu VPN?",
      testProtection: "Uji perlindungan Anda",
      engineLevel: "Pemalsuan tingkat mesin (Chrome)",
      blog: "Blog",
      support: "Dukungan",
      about: "Tentang",
      feedback: "Masukan",
      privacy: "Kebijakan Privasi",
      terms: "Ketentuan Layanan",
      github: "GitHub",
    },
    footerNavAria: "Navigasi footer",
    copyright: "© {year} GeoSpoof. Semua hak dilindungi.",
  },
  languageSwitcher: {
    label: "Bahasa",
    suggestion: "Halaman ini tersedia dalam bahasa Indonesia.",
    switchAction: "Lihat dalam bahasa Indonesia",
    dismiss: "Tutup",
  },
  storeCta: {
    firefox: "Tambahkan ke Firefox",
    chrome: "Tambahkan ke Chrome",
    apple: "Dapatkan di App Store",
  },
  legal: {
    englishNote:
      "Teks hukum di bawah ini hanya tersedia dalam bahasa Inggris. Versi bahasa Inggris yang berlaku.",
    privacy: {
      metaTitle: "Kebijakan Privasi | GeoSpoof",
      metaDescription:
        "Kebijakan Privasi GeoSpoof — pelajari cara kami melindungi data Anda dan menghormati privasi Anda.",
      heading: "Kebijakan Privasi",
      lastUpdated: "Terakhir Diperbarui: 3 Juli 2026",
    },
    terms: {
      metaTitle: "Ketentuan Layanan | GeoSpoof",
      metaDescription:
        "Ketentuan Layanan GeoSpoof — pahami ketentuan yang mengatur penggunaan ekstensi.",
      heading: "Ketentuan Layanan",
      lastUpdated: "Terakhir Diperbarui: 10 Juli 2026",
    },
  },
  testimonials: {
    eyebrow: "Apa kata pengguna",
    heading: "Disukai oleh pengguna yang peduli privasi",
    subhead:
      "Ulasan asli dari Chrome Web Store, Firefox Add-ons, dan App Store.",
    starsAria: "5 dari 5 bintang",
    readMoreOn: "Baca ulasan lainnya di",
  },
  screenshots: {
    eyebrow: "Lihat langsung",
    heading: "Berfungsi di mana pun Anda menjelajah",
    desktopAlt:
      "Ekstensi browser GeoSpoof berjalan di desktop — pemalsuan lokasi yang sedang bekerja",
  },
  demo: {
    eyebrow: "Lihat cara kerjanya",
    heading: "Palsukan lokasi Anda dalam beberapa klik",
    videoAria:
      "Demo GeoSpoof — menetapkan lokasi browser palsu dengan ekstensi",
    unsupported: "Browser Anda tidak mendukung video tersemat.",
    downloadInstead: "Unduh demo",
    insteadSuffix: "sebagai gantinya.",
  },
  features: {
    eyebrow: "Fitur",
    heading: "Setiap sinyal, tercakup",
    subhead:
      "Situs web menggunakan beberapa API browser untuk mendeteksi lokasi Anda. GeoSpoof menimpa semuanya — secara konsisten, sebelum skrip halaman apa pun berjalan.",
    visual: {
      noIpLeak: "Tanpa kebocoran IP",
      noTracking: "Tanpa pelacakan",
      noTelemetry: "Tanpa telemetri",
      vpnExit: "Keluar VPN",
      spoofed: "Dipalsukan",
      synced: "tersinkron",
      andMore: "& lainnya",
    },
    items: {
      geolocation: {
        title: "Pemalsuan lokasi",
        description:
          "Timpa navigator.geolocation agar situs melihat koordinat yang Anda pilih. Cari berdasarkan kota, masukkan koordinat secara manual, atau sinkronkan dengan VPN Anda.",
      },
      timezone: {
        title: "Pemalsuan zona waktu",
        description:
          "Palsukan Date, Intl.DateTimeFormat, dan Temporal API agar zona waktu Anda cocok dengan lokasi yang Anda pilih.",
      },
      webrtc: {
        title: "Perlindungan WebRTC",
        description:
          "Cegah kebocoran IP melalui WebRTC di Firefox dan Chromium menggunakan API privasi browser.",
      },
      vpnSync: {
        title: "Sinkronisasi VPN",
        description:
          "Deteksi wilayah keluar VPN Anda secara otomatis dan atur lokasi palsu Anda agar cocok — satu klik.",
      },
      apis: {
        title: "Cakupan API lengkap",
        description:
          "Setiap API browser yang membocorkan lokasi Anda tercakup — disuntikkan di document_start sebelum skrip halaman apa pun berjalan.",
      },
    },
  },
  comparison: {
    eyebrow: "Bagaimana GeoSpoof dibandingkan",
    heading: "Lebih dari sekadar menukar koordinat",
    subhead:
      "Sebagian besar pemalsu lokasi hanya melakukan satu hal: memasukkan lintang dan bujur palsu ke browser. GeoSpoof mencakup seluruh sinyal, sehingga lokasi, zona waktu, dan IP Anda semuanya menceritakan hal yang sama.",
    featureHeader: "Fitur",
    typicalHeader: "Biasa",
    yesAria: "Ya",
    limited: "Terbatas",
    noAria: "Tidak",
    features: {
      coordinates: "Palsukan geolokasi berdasarkan koordinat",
      oneIdentity: "Satu identitas konsisten di puluhan API browser",
      citySearch: "Tetapkan lokasi Anda dengan pencarian kota",
      webrtc: "Perlindungan kebocoran IP WebRTC",
      everyBrowser: "Semua browser utama + seluruh ekosistem Apple",
      verification: "Halaman verifikasi bawaan",
      vpnSync: "Sinkronisasi VPN dengan sinkronisasi ulang otomatis",
      perSite: "Aturan per situs & favorit tersimpan",
    },
    legend: {
      fullSupport: "Dukungan penuh",
      limitedDetail: ": sebagian atau dasar",
      notSupported: "Tidak didukung",
    },
    proAria: "Pro di iPhone dan iPad",
    proNote: "Pro di iPhone & iPad. Gratis di browser desktop dan Safari.",
    ctaLead: "Jangan hanya percaya kata kami: ",
    ctaLink: "uji perlindungan Anda",
    ctaTail: " dan lihat sendiri setiap sinyalnya.",
  },
  compatibility: {
    eyebrow: "Kompatibilitas",
    heading: "Berfungsi di semua perangkat Anda",
    subhead:
      "GeoSpoof berjalan di setiap browser dan platform utama. Satu ekstensi, perlindungan konsisten di mana saja.",
    platformHeader: "Platform",
    supportedAria: "Didukung",
    naAria: "Tidak berlaku",
    notSupportedAria: "Tidak didukung",
    legend: {
      supported: "Didukung",
      notSupported: "Tidak didukung",
      na: "T/B — Tidak berlaku",
    },
    footnote:
      "Firefox untuk Android memerlukan Firefox 140+. Safari memerlukan iOS 16+ atau macOS 13+.",
    setupLead: "Panduan penyiapan khusus browser: palsukan lokasi Anda di ",
    or: ", atau ",
    alsoLead: ". Anda juga dapat ",
    timezoneLink: "memalsukan zona waktu browser Anda",
  },
  featuredPost: {
    eyebrow: "Dari blog",
    heading: "Layak dibaca",
    allPosts: "Semua artikel",
    minRead: "menit baca",
    readMore: "Baca selengkapnya",
  },
  blog: {
    index: {
      metaTitle: "Blog | GeoSpoof",
      metaDescription:
        "Panduan dan ulasan mendalam tentang pemalsuan lokasi browser, privasi zona waktu, kebocoran WebRTC, dan cara memaksimalkan GeoSpoof.",
      heading: "Blog GeoSpoof",
      subhead:
        "Panduan dan ulasan mendalam tentang pemalsuan lokasi, privasi zona waktu, dan fingerprinting browser.",
      empty: "Belum ada artikel — periksa kembali nanti.",
      minRead: "menit baca",
    },
    post: {
      breadcrumbHome: "Beranda",
      breadcrumbBlog: "Blog",
      minRead: "menit baca",
      faqHeading: "Pertanyaan yang sering diajukan",
      olderPost: "← Artikel sebelumnya",
      newerPost: "Artikel lebih baru →",
      backToAll: "← Kembali ke semua artikel",
      englishNote: "Artikel ini hanya tersedia dalam bahasa Inggris.",
    },
  },
  download: {
    eyebrow: "Unduh",
    heading: "Dapatkan GeoSpoof gratis",
    subhead:
      "Tersedia di semua browser utama. Tanpa akun, tanpa telemetri, tanpa pelacakan.",
    recommendedBadge: "Direkomendasikan untuk Anda",
    installFree: "Instal gratis",
    otherWays: "Cara lain untuk mengunduh",
    stores: {
      firefox: {
        description: "Firefox 140+ di desktop dan Android",
        cta: "Tambahkan ke Firefox",
      },
      chromium: {
        description: "Chrome, Brave, dan Edge",
        cta: "Tambahkan ke Chrome",
      },
      apple: {
        description: "Safari di iOS dan macOS",
        cta: "Dapatkan di App Store",
      },
    },
    selfHosted: {
      dmg: {
        name: "Unduhan langsung (macOS)",
        description:
          "DMG ternotarisasi untuk Safari di macOS. Tidak perlu Apple ID. Pembaruan manual — unduh ulang untuk memperbarui.",
      },
      xpi: {
        name: "XPI hosting mandiri (Firefox)",
        description:
          "XPI bertanda tangan untuk fork Firefox atau instalasi manual. Diperbarui otomatis melalui manifes pembaruan kami.",
      },
      cta: "Rilis GitHub",
    },
  },
  skipLink: {
    toMainContent: "Lewati ke konten utama",
  },
  phoneCarousel: {
    embeddedHeading: "Dan native di iPhone & iPad",
    standaloneHeading: "GeoSpoof di iOS & iPadOS",
    screenshotAlt: "GeoSpoof di iOS — tangkapan layar {n}",
    goToSlide: "Ke slide {n}",
    getTheApp: "Dapatkan aplikasinya",
    appStore: "Unduh di App Store",
    macAppStore: "Unduh di Mac App Store",
  },
  exposureToast: {
    header: "Apa yang dilihat setiap situs",
    exposed: "Terekspos",
    visibleToSites: "Terlihat oleh situs",
    location: "Lokasi",
    timezone: "Zona waktu",
    address: "Alamat",
    webrtc: "WebRTC",
    publicIpLeaking: "IP publik bocor",
    noLeak: "Tanpa kebocoran",
    yourArea: "wilayah Anda",
    hideMyLocation: "Sembunyikan lokasi saya",
    getGeospoof: "Dapatkan GeoSpoof",
    fullReport: "Laporan lengkap",
    dismiss: "Tutup",
  },
  themeToggle: {
    switchToLight: "Beralih ke mode terang",
    switchToDark: "Beralih ke mode gelap",
    changedToLight: "Tema diubah ke mode terang",
    changedToDark: "Tema diubah ke mode gelap",
  },
  carousel: {
    previousSlide: "Slide sebelumnya",
    nextSlide: "Slide berikutnya",
  },
  spoofLocation: {
    hub: {
      metaTitle: "Palsukan Lokasi Browser Anda — Ekstensi Gratis | GeoSpoof",
      metaDescription:
        "Palsukan lokasi browser Anda di Chrome, Edge, Firefox, atau Safari. GeoSpoof menimpa Geolocation API dan zona waktu agar situs melihat lokasi yang Anda pilih.",
      ogTitle: "Palsukan lokasi browser Anda",
      badge: "Pemalsuan lokasi",
      headingPre: "Palsukan ",
      headingEmphasis: "lokasi",
      intro:
        "Situs web membaca lokasi Anda melalui Geolocation API browser dan zona waktu Anda — VPN tidak mengubah keduanya. GeoSpoof menimpa keduanya agar situs melihat lokasi yang Anda pilih. Pilih browser Anda untuk memulai.",
      cardTitle: "Palsukan lokasi Anda di {name}",
      openGuide: "Buka panduan",
    },
    page: {
      browserBadge: "Ekstensi {name}",
      headingPre: "Palsukan lokasi Anda di {name}",
      ctaFallback: "Dapatkan GeoSpoof untuk {name}",
      testLocation: "Uji lokasi Anda",
      breadcrumbHome: "Beranda",
      breadcrumbHub: "Palsukan Lokasi",
      howToHeading: "Cara memalsukan lokasi Anda di {name}",
      stepInstallName: "Instal GeoSpoof untuk {name}",
      stepInstallText: "Tambahkan ekstensi gratis GeoSpoof dari {store}.",
      stepEnableName: "Aktifkan di {name}",
      stepSetName: "Tetapkan lokasi Anda",
      stepSetText:
        "Cari kota, masukkan koordinat, atau gunakan Sinkronisasi VPN agar cocok dengan wilayah keluar VPN Anda.",
      stepReportsName: "{name} melaporkan lokasi yang Anda pilih",
      stepReportsText:
        "GeoSpoof menimpa Geolocation API dan zona waktu (Date, Intl, Temporal) agar setiap situs melihat lokasi yang Anda pilih",
      stepReportsWebrtcSuffix:
        ", dan perlindungan WebRTC mencegah IP asli Anda bocor",
      webrtcAvailableTitle: "Perlindungan WebRTC tersedia di {name}.",
      webrtcAvailableBody:
        "GeoSpoof juga mencegah IP asli Anda bocor melalui WebRTC, yang jika tidak dapat sepenuhnya melewati VPN.",
      webrtcUnavailableTitle:
        "Catatan: perlindungan WebRTC tidak tersedia di {name}.",
      webrtcUnavailableBody:
        "Pemalsuan lokasi dan zona waktu sepenuhnya didukung; API privasi WebRTC yang diandalkan GeoSpoof tidak diekspos di browser ini.",
      faqHeading: "Pertanyaan yang sering diajukan",
      faqHowQ: "Bagaimana cara memalsukan lokasi saya di {name}?",
      faqHowA:
        "Instal ekstensi gratis GeoSpoof, tetapkan lokasi (cari kota, masukkan koordinat, atau sinkronkan dengan VPN Anda), dan GeoSpoof menimpa Geolocation dan zona waktu API di {name} agar situs melihat lokasi yang Anda pilih, bukan yang asli.",
      faqVpnQ: "Apakah VPN mengubah lokasi saya di {name}?",
      faqVpnA:
        "Tidak. VPN hanya mengubah alamat IP Anda. {name} tetap melaporkan geolokasi browsernya sendiri dan zona waktu sistem, sehingga keduanya masih dapat mengungkap wilayah asli Anda. GeoSpoof memalsukan sinyal browser; gunakan bersama VPN untuk lokasi yang konsisten.",
      faqFreeQ: "Apakah GeoSpoof gratis untuk {name}?",
      faqFreeA:
        "Ya. GeoSpoof gratis dan open source. Tidak ada akun, tidak ada login, dan tidak ada pelacakan — setiap pengaturan tetap di perangkat Anda.",
      crossLinkLead: "Menggunakan browser lain? Lihat ",
      crossLinkText: "palsukan lokasi Anda di browser mana pun",
      schemaSoftwareDesc:
        "Palsukan geolokasi dan zona waktu Anda di {name} dengan ekstensi gratis dan open source.",
    },
    browsers: {
      chrome: {
        storeName: "Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Chrome melaporkan keberadaan Anda ke situs web melalui Geolocation API dan zona waktu Anda melalui Intl dan Date — dan VPN tidak mengubah semua itu. GeoSpoof menimpa sinyal tersebut di dalam Chrome agar situs melihat lokasi yang Anda pilih. Build yang sama juga berjalan di Brave, Opera, dan browser Chromium lainnya.",
        enableStep:
          "Sematkan GeoSpoof dari ikon potongan puzzle (Ekstensi) di bilah alat Chrome agar hanya satu klik saja.",
        extraFaqQ:
          "Apakah GeoSpoof berfungsi di Brave dan browser Chromium lainnya?",
        extraFaqA:
          "Ya. GeoSpoof diinstal dari Chrome Web Store, yang melayani Chrome, Brave, Opera, dan browser berbasis Chromium lainnya. Pemalsuan lokasi dan zona waktu berfungsi identik di semuanya.",
        metaTitle:
          "Palsukan Lokasi Anda di Chrome — Ekstensi Gratis | GeoSpoof",
        metaDescription:
          "Palsukan lokasi Anda di Chrome dengan ekstensi gratis. GeoSpoof menimpa Geolocation API dan zona waktu agar situs melihat lokasi yang Anda pilih. Brave juga.",
        ogTitle: "Palsukan lokasi Anda di Chrome",
      },
      edge: {
        storeName: "Chrome Web Store",
        storeShort: "Chrome Web Store",
        intro:
          "Microsoft Edge dibangun di atas Chromium, jadi ia mengekspos lokasi Anda dengan cara yang sama seperti Chrome — Geolocation API ditambah zona waktu sistem Anda. GeoSpoof diinstal dari Chrome Web Store, berjalan di Edge, dan menimpa API tersebut untuk melaporkan lokasi yang Anda pilih. Ini berfungsi untuk memalsukan lokasi Anda di Edge baik di Windows maupun macOS.",
        enableStep:
          "Izinkan ekstensi dari Chrome Web Store saat Edge meminta, lalu sematkan GeoSpoof dari ikon Ekstensi (potongan puzzle).",
        extraFaqQ: "Bisakah saya memalsukan lokasi saya di Edge pada Windows?",
        extraFaqA:
          "Ya. GeoSpoof berjalan di Edge pada Windows dan macOS. Ia menimpa lokasi dan zona waktu yang dilaporkan browser Anda ke situs; ia tidak mengubah pengaturan lokasi sistem Windows itu sendiri, jadi OS Anda tetap utuh.",
        metaTitle: "Palsukan Lokasi Anda di Edge — Ekstensi Gratis | GeoSpoof",
        metaDescription:
          "Palsukan lokasi Anda di Microsoft Edge dengan ekstensi gratis. GeoSpoof menimpa Geolocation API dan zona waktu agar situs melihat lokasi yang Anda pilih.",
        ogTitle: "Palsukan lokasi Anda di Edge",
      },
      firefox: {
        storeName: "Firefox Add-ons",
        storeShort: "Firefox Add-ons",
        intro:
          "Firefox menyerahkan lokasi Anda ke situs web melalui Geolocation API dan wilayah Anda melalui API zona waktu, terlepas dari VPN apa pun. GeoSpoof diinstal dari Firefox Add-ons dan menimpa sinyal tersebut. Ini adalah satu-satunya build yang juga berjalan di Firefox untuk Android, jadi Anda dapat memalsukan lokasi Anda di ponsel juga.",
        enableStep:
          "Setelah menambahkan GeoSpoof dari Firefox Add-ons, sematkan ke bilah alat dari menu ekstensi untuk akses cepat.",
        extraFaqQ:
          "Bisakah saya memalsukan lokasi saya di Firefox pada Android?",
        extraFaqA:
          "Ya. Firefox 140+ di Android mendukung GeoSpoof, jadi Anda dapat memalsukan geolokasi dan zona waktu di ponsel Anda — sesuatu yang tidak bisa dilakukan Chrome di ponsel, karena tidak mendukung ekstensi.",
        metaTitle: "Palsukan Lokasi Anda di Firefox — Add-on Gratis | GeoSpoof",
        metaDescription:
          "Palsukan lokasi Anda di Firefox dengan add-on gratis dan open source. GeoSpoof menimpa Geolocation API dan zona waktu agar situs melihat lokasi yang Anda pilih.",
        ogTitle: "Palsukan lokasi Anda di Firefox",
      },
      safari: {
        storeName: "App Store",
        storeShort: "App Store",
        intro:
          "Safari di iOS, iPadOS, dan macOS melaporkan lokasi dan zona waktu Anda ke situs web seperti browser mana pun. GeoSpoof diinstal dari App Store dan berjalan sebagai ekstensi Safari, menimpa API tersebut agar situs melihat lokasi yang Anda pilih. Pemalsuan lokasi dan zona waktu sepenuhnya didukung; perlindungan WebRTC tidak tersedia di Safari.",
        enableStep:
          "Setelah menginstal dari App Store, aktifkan GeoSpoof dari menu ekstensi Safari (potongan puzzle di bilah alamat pada iOS, atau Safari → Pengaturan → Ekstensi pada macOS).",
        extraFaqQ: "Apakah pemalsuan lokasi berfungsi di Safari pada iPhone?",
        extraFaqA:
          "Ya. GeoSpoof adalah ekstensi Safari yang tersedia melalui App Store untuk iOS, iPadOS, dan macOS. Setelah diaktifkan untuk suatu situs, ia menimpa geolokasi dan zona waktu yang dilaporkan Safari. Perlindungan WebRTC adalah satu-satunya fitur yang tidak tersedia di Safari.",
        metaTitle:
          "Palsukan Lokasi Anda di Safari — Ekstensi Gratis | GeoSpoof",
        metaDescription:
          "Palsukan lokasi Anda di Safari dengan ekstensi App Store gratis. GeoSpoof menimpa Geolocation API dan zona waktu di iOS, iPadOS, dan macOS.",
        ogTitle: "Palsukan lokasi Anda di Safari",
      },
    },
  },
  vpn: {
    meta: {
      title:
        "Apakah Anda Perlu VPN dengan GeoSpoof? Dua Lapis Privasi | GeoSpoof",
      description:
        "GeoSpoof menyembunyikan lokasi, zona waktu, dan WebRTC yang dilaporkan browser Anda. VPN tanpa log menyembunyikan IP Anda — satu-satunya sinyal yang tidak bisa diubah ekstensi.",
      ogTitle: "Apakah Anda perlu VPN dengan GeoSpoof?",
    },
    hero: {
      mapAlt: "Proton VPN menyembunyikan alamat IP Anda",
      badge: "Privasi lokasi memiliki dua lapis",
      headingPre: "Apakah Anda perlu VPN dengan ",
      headingPost: "?",
      answer:
        "GeoSpoof menyembunyikan lokasi browser Anda. VPN menyembunyikan IP Anda. Untuk privasi penuh, Anda ingin keduanya.",
      disclosureBody:
        "Kami bermitra dengan Proton VPN. Jika Anda berlangganan melalui tautan kami, kami mendapat komisi tanpa biaya tambahan bagi Anda.",
      ctaPlans: "Lihat paket Proton VPN",
      partnerPricing: "Diskon mitra hingga {discount}",
      learnMore: "Pelajari lebih lanjut",
      moneyBack: "Garansi uang kembali 30 hari",
      platformsAria:
        "Proton VPN tersedia di Windows, macOS, Linux, iOS, dan Android",
    },
    twoLayers: {
      heading: "Dua lapis, dua alat",
      intro:
        "Privasi lokasi memiliki dua lapis yang independen. GeoSpoof menyegel lapis browser; VPN menyegel lapis jaringan. Palsukan satu tetapi biarkan yang lain, dan ketidakcocokan itu membongkar Anda. Browser yang melaporkan Tokyo sementara IP Anda masih mengarah ke New York mudah ditandai.",
      browserTitle: "Lapis browser",
      browserBody:
        "Situs web membaca lokasi Anda dari Geolocation API, wilayah Anda dari API zona waktu, dan IP lokal Anda dari WebRTC. GeoSpoof menimpa semua ini agar melaporkan lokasi yang Anda pilih.",
      browserWho: "Ditangani oleh GeoSpoof",
      networkTitle: "Lapis jaringan",
      networkBody:
        "Setiap situs juga melihat alamat IP publik asal koneksi Anda, yang memetakan ke kota nyata. Tidak ada ekstensi browser yang bisa mengubah ini — ia berada di bawah browser, di jaringan.",
      networkWho: "Ditangani oleh VPN",
      primerLead:
        "Ingin ulasan yang lebih dalam dan netral? Jonah Aragon dari Privacy Guides memiliki pengantar yang jelas tentang ",
      primerLink: "apa yang sebenarnya dilakukan dan tidak dilakukan VPN",
    },
    whyProton: {
      eyebrow: "VPN yang kami percaya",
      heading: "Mengapa Proton VPN",
      intro:
        "GeoSpoof bersifat open source dan tidak menyimpan log sama sekali. Dalam hal privasi, satu-satunya kepercayaan yang berharga adalah yang bisa Anda verifikasi. Proton menerapkan standar yang sama pada dirinya: aplikasi open source, kebijakan tanpa log yang diaudit secara independen, dan yurisdiksi Swiss.",
      reason1Title: "Tanpa log, diaudit secara independen",
      reason1Body:
        "Kebijakan tanpa log Proton telah diaudit secara independen berulang kali, bukan hanya diklaim, dan diuji dalam permintaan hukum yang nyata.",
      reason2Title: "Swiss, open source",
      reason2Body:
        "Berbasis di Swiss di bawah undang-undang privasi yang kuat, dengan aplikasi yang sepenuhnya open source yang bisa diperiksa siapa saja — pendekatan yang dapat diverifikasi yang sama dengan GeoSpoof.",
      reason3Title: "Berfungsi dengan Sinkronisasi VPN",
      reason3Body:
        "Sinkronisasi VPN GeoSpoof menjaga lokasi palsu Anda tetap cocok dengan wilayah keluar VPN Anda secara otomatis — dengan Proton, atau VPN lain apa pun yang Anda pilih.",
      calloutLead: "Jangan hanya percaya kata kami.",
      calloutBodyPre:
        " Proton adalah salah satu dari sedikit VPN yang direkomendasikan oleh ",
      calloutLink: "Privacy Guides",
      calloutBodyPost:
        ", sumber daya privasi independen yang dikelola komunitas. GeoSpoof berfungsi dengan VPN apa pun, jadi Anda tidak pernah terkunci; kami merekomendasikan Proton karena alasan open source dan audit di atas, tetapi pilihan yang tepat adalah yang Anda percayai.",
    },
    plan: {
      imgAlt: "Layar beranda aplikasi Proton VPN",
      heading: "Pilih paket yang cocok",
      body: "GeoSpoof bersifat open source. Untuk lapis IP, kami akan mengarahkan Anda ke Proton VPN Plus. Paket 2 tahun berdiskon {discount} dari tarif standar Proton — harga per bulan terendah dan nilai keseluruhan terbaik. Ingin mencobanya dulu? Paket bulanan juga tersedia.",
      cta: "Lihat paket Proton VPN",
      unlimitedPre: "Sudah punya VPN, atau ingin lebih dari satu alat? Paket ",
      unlimitedLink: "Unlimited dari Proton",
      unlimitedPost:
        " menggabungkan VPN dengan Mail, Pass, Drive, dan Calendar.",
    },
    inlineDisclosure:
      "Perhatian — ini adalah tautan afiliasi. Berlanggananlah melaluinya dan Proton membagi sedikit bagian kepada kami, tanpa biaya tambahan bagi Anda. Begitulah cara kami membantu menjaga GeoSpoof tetap open source dan independen.",
    faq: {
      heading: "Pertanyaan yang sering diajukan",
      items: [
        {
          q: "Apakah saya perlu VPN jika saya menggunakan GeoSpoof?",
          a: "Untuk privasi lokasi yang penuh, ya — tetapi bukan karena GeoSpoof kurang. GeoSpoof mengubah lokasi, zona waktu, dan detail WebRTC yang dilaporkan browser Anda ke situs web. Sinyal terkuat yang tersisa adalah alamat IP Anda, dan hanya VPN yang bisa mengubahnya. Keduanya mencakup lapis yang berbeda; bersama-sama mereka menceritakan satu hal yang konsisten.",
        },
        {
          q: "Bisakah saya menggunakan VPN lain dengan GeoSpoof?",
          a: "Ya. GeoSpoof berfungsi dengan VPN apa pun. Tidak ada yang terkunci ke Proton, dan Sinkronisasi VPN berfungsi sama dengan semuanya. Mullvad dan IVPN adalah penyedia tanpa log lainnya yang dihormati di komunitas privasi. Kami merekomendasikan Proton karena sepenuhnya open source, diaudit secara independen, dan direkomendasikan oleh Privacy Guides, tetapi pilihan sepenuhnya milik Anda.",
        },
        {
          q: "Mengapa GeoSpoof merekomendasikan Proton VPN?",
          a: "Proton tanpa log, berbasis di Swiss, sepenuhnya open source, dan telah lolos audit independen berulang kali. Itu adalah nilai-nilai yang dapat diverifikasi dan mengutamakan privasi yang sama yang menjadi dasar GeoSpoof. Ia juga salah satu dari sedikit VPN yang direkomendasikan oleh Privacy Guides, sumber daya independen yang tidak menerima uang afiliasi. Sinkronisasi VPN berfungsi dengan Proton persis seperti dengan VPN lainnya.",
        },
        {
          q: "Apakah saya perlu VPN untuk menggunakan GeoSpoof?",
          a: "Tidak. Pemalsuan inti GeoSpoof berfungsi tanpa VPN. VPN hanya menyembunyikan alamat IP asli Anda — ia adalah alat pelengkap, bukan syarat untuk menggunakan GeoSpoof.",
        },
        {
          q: "Apakah GeoSpoof menghasilkan uang jika saya mendaftar?",
          a: "Jika Anda berlangganan Proton melalui tautan kami, Proton membagi sebagian penjualan kepada kami, tanpa biaya tambahan bagi Anda. Ini membantu menjaga GeoSpoof tetap open source dan bebas iklan. Kami merekomendasikan Proton berdasarkan kelebihannya (open source, diaudit secara independen, dan direkomendasikan oleh Privacy Guides), dan komisi tidak mengubah paket mana yang sebenarnya terbaik untuk Anda.",
        },
      ],
    },
    disclosure: {
      label: "Pengungkapan afiliasi:",
      body: "GeoSpoof adalah utilitas independen dan open source serta tidak berafiliasi dengan atau didukung oleh Proton. Saat Anda membeli paket melalui rekomendasi kami, Proton membagi sebagian penjualan kepada kami, tanpa biaya tambahan bagi Anda. Ini membantu menjaga GeoSpoof tetap gratis, open source, dan bebas iklan. Kami merekomendasikan Proton berdasarkan kelebihannya (open source, diaudit secara independen, dan direkomendasikan oleh Privacy Guides), bukan karena komisi, dan GeoSpoof berfungsi dengan VPN apa pun yang Anda sukai.",
    },
  },
  support: {
    meta: {
      title:
        "Dukungan GeoSpoof — Perbaiki Pemalsuan, Sinkronisasi VPN & Penyiapan",
      description:
        "Dapatkan bantuan dengan GeoSpoof: perbaiki pemalsuan lokasi yang tidak berfungsi, atasi waktu habis Sinkronisasi VPN, masalah WebRTC, dan penyiapan browser atau ponsel — atau hubungi tim kami.",
    },
    heading: "Bagaimana kami bisa membantu?",
    subhead:
      "Sebagian besar laporan berujung pada salah satu penyebab di bawah ini. Telusuri daftar dari atas dan berhenti saat pemalsuan berfungsi.",
    symptomsLead: "Apa yang terjadi?",
    symptoms: [
      { label: "Pemalsuan lokasi tidak berfungsi", target: "troubleshooting" },
      {
        label: "Sinkronisasi VPN gagal atau kehabisan waktu",
        target: "faq-vpn-sync",
      },
      {
        label: "Berfungsi di desktop tetapi tidak di ponsel saya",
        target: "faq-mobile",
      },
      { label: "Sesuatu yang lain", target: "questions" },
    ],
    lastUpdatedLabel: "Terakhir diperbarui",
    troubleshooting: {
      title: "Pemalsuan tidak berfungsi di sebuah situs",
      intro:
        "Ini diurutkan dari yang paling umum ke yang paling jarang. Anda kemungkinan tidak perlu sampai ke akhir.",
      browserNote:
        "GeoSpoof juga berjalan di Chrome, Edge, Brave, dan Safari. Langkah-langkah di bawah ditulis untuk Firefox, tempat konflik ini paling umum — di browser lain, terapkan pengaturan yang setara.",
      latestReleaseLabel: "Rilis terbaru",
      latestReleaseCta: "Lihat rilis terbaru di GitHub",
      badgeActiveLabel: "Aktif di tab ini",
      badgeActiveAlt:
        "Ikon bilah alat GeoSpoof dengan lencana yang menunjukkan bahwa ia aktif di tab saat ini",
      badgeDisabledLabel: "Tidak berjalan di tab ini",
      badgeDisabledAlt:
        "Ikon bilah alat GeoSpoof dengan lencana yang menunjukkan bahwa ia tidak berjalan di tab saat ini",
      geolocationDeniedAlt:
        'Hasil uji fingerprint yang melaporkan "Geolocation: Denied" karena Firefox memblokir permintaan lokasi',
      geolocationDeniedCaption:
        "Seperti inilah tampilan permintaan lokasi yang diblokir pada uji fingerprint.",
      preserveOffAlt:
        'Popup GeoSpoof dengan tombol "Pertahankan permintaan izin lokasi" dinonaktifkan',
      preserveOffCaption:
        'Popup GeoSpoof dengan "Pertahankan permintaan izin lokasi" dinonaktifkan.',
      tzpCta: "Buka uji TZP",
      featuredLabel: "Diagnostik terbaik",
      steps: [
        {
          title: "Muat ulang tab, atau buka kembali",
          featured: false,
          body: "GeoSpoof hanya berlaku pada halaman yang dimuat setelah ia diaktifkan. Tab mana pun yang sudah terbuka saat Anda menginstal, memperbarui, atau mengaktifkan kembali GeoSpoof tidak akan dipalsukan sampai dimuat ulang. Muat ulang tab yang Anda uji — jika itu tidak membantu, tutup dan buka lagi.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Perbarui ke versi terbaru",
          featured: false,
          body: "Banyak masalah sudah diperbaiki di rilis yang lebih baru. Di popup, buka Detail → Lanjutan untuk melihat versi Anda, lalu bandingkan dengan rilis terbaru di bawah dan perbarui melalui pengelola ekstensi browser Anda jika Anda tertinggal.",
          details: [],
          note: "",
          action: "latestRelease",
        },
        {
          title: "Pastikan GeoSpoof berjalan di situs tersebut",
          featured: false,
          body: "Ikon bilah alat GeoSpoof menunjukkan apakah ia aktif di tab saat ini. Jika tidak aktif, tidak ada yang dipalsukan — paling sering karena cakupan situs yang diatur di tab Filter.",
          details: [
            "Mode daftar izin: hanya situs yang terdaftar yang dipalsukan — tambahkan situs yang Anda uji.",
            "Mode daftar blokir: pastikan situs tidak ada dalam daftar.",
            'Atau beralih ke "Semua" untuk memalsukan di mana saja.',
          ],
          note: "",
          action: "badgeCheck",
        },
        {
          title: "Atur ulang izin lokasi situs",
          featured: false,
          body: 'Jika sebuah uji melaporkan "Geolocation: Denied", Firefox memblokir permintaan — biasanya karena permintaan izin pernah ditolak dengan "Remember this decision" dicentang.',
          details: [
            "Klik ikon gembok di bilah alamat.",
            "Hapus setiap Block lokasi yang diingat, lalu muat ulang halaman.",
            'Di pengaturan Firefox, pastikan "Block new requests asking to access your location" dinonaktifkan.',
            'Jika tombol "Pertahankan permintaan izin lokasi" GeoSpoof aktif dan Anda menolak permintaan itu, izinkan atau nonaktifkan tombol tersebut agar GeoSpoof menjawab langsung.',
          ],
          note: "",
          action: "geolocationDenied",
        },
        {
          title: "Mulai ulang browser Anda",
          featured: false,
          body: "Beberapa API browser diatur saat startup, jadi pemasangan, pembaruan, atau perubahan pengaturan yang baru dilakukan mungkin tidak berlaku sampai Anda menutup dan membuka kembali browser sepenuhnya.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Uji di profil Firefox yang baru",
          featured: true,
          body: "Profil bersih mengisolasi GeoSpoof dari penyiapan Anda yang ada.",
          details: [
            "Buka about:profiles dan buat profil baru.",
            "Jalankan, instal GeoSpoof, dan uji situs yang sama lagi.",
          ],
          note: "Jika pemalsuan berfungsi di profil bersih, GeoSpoof sendiri baik-baik saja — ada sesuatu di profil normal Anda yang mengganggu, hampir selalu berupa alat privasi atau perubahan about:config. Dua langkah berikutnya membahas hal itu.",
          action: "",
        },
        {
          title: "Nonaktifkan alat privasi yang berkonflik",
          featured: false,
          body: "Alat penguatan mengubah banyak API browser yang sama dengan GeoSpoof dan bisa menimpanya. Nonaktifkan sementara yang Anda gunakan, lalu coba lagi: Arkenfox, Betterfox, LibreWolf, CanvasBlocker, JShelter, Chameleon, Trace, atau perandom fingerprint apa pun.",
          details: [],
          note: "",
          action: "",
        },
        {
          title: "Periksa about:config (lanjutan)",
          featured: false,
          body: "Jika Anda telah memperkuat Firefox, pastikan preferensi ini dinonaktifkan, lalu mulai ulang dan coba lagi. Enhanced Tracking Protection mode Strict biasanya baik-baik saja dan tidak perlu diubah.",
          details: [
            "privacy.resistFingerprinting",
            "privacy.fingerprintingProtection",
            "privacy.fingerprintingProtection.pbmode",
          ],
          note: "",
          action: "",
        },
        {
          title: "Konfirmasi pada uji fingerprint kedua",
          featured: false,
          body: "Uji mengukur API yang berbeda dan sebagian memang bermasalah. Sebelum menganggap GeoSpoof yang salah, verifikasi hasilnya pada uji tepercaya lain — kami merekomendasikan bagian Region dari TZP milik arkenfox.",
          details: [],
          note: "",
          action: "tzpTest",
        },
      ],
    },
    commonIssues: "Pertanyaan umum lainnya",
    faqs: [
      {
        id: "vpn-sync",
        q: "Sinkronisasi VPN menampilkan waktu habis atau kesalahan jaringan",
        a: "Sinkronisasi VPN memanggil beberapa layanan geolokasi IP publik untuk mendeteksi wilayah keluar VPN Anda. Beberapa VPN atau firewall memblokir permintaan keluar ke layanan ini. Coba nonaktifkan sementara firewall atau kill switch VPN Anda. Jika masalah berlanjut, gunakan tab Cari Kota atau Masukkan Koordinat untuk menetapkan lokasi Anda secara manual.",
      },
      {
        id: "specific-site",
        q: "Situs web tertentu tidak dipalsukan",
        a: "Beberapa situs menggunakan deteksi lokasi sisi server berdasarkan alamat IP Anda alih-alih Geolocation API browser. GeoSpoof hanya menimpa API browser — ia tidak mengubah alamat IP Anda. Untuk konsistensi lokasi penuh, gunakan GeoSpoof bersama VPN yang mengarah ke wilayah yang sama.",
      },
      {
        id: "mobile",
        q: "Ekstensi berfungsi di desktop tetapi tidak di ponsel saya",
        a: "Di Firefox untuk Android, ekstensi sepenuhnya didukung pada Firefox 140 dan yang lebih baru. Di Safari iOS dan macOS, ekstensi tersedia melalui App Store — ketuk ikon potongan puzzle di bilah alamat dan aktifkan GeoSpoof untuk situs yang ingin Anda lindungi. Chrome untuk iOS dan Android tidak mendukung ekstensi.",
      },
      {
        id: "webrtc",
        q: "Perlindungan WebRTC tidak tersedia / berwarna abu-abu",
        a: "Perlindungan WebRTC menggunakan API privasi browser yang tidak tersedia di semua platform. Ia didukung di Firefox dan browser berbasis Chromium di desktop. Ia tidak tersedia di Safari atau Firefox untuk Android.",
      },
      {
        id: "extensions-page",
        q: 'Saya melihat "Ekstensi tidak dapat berjalan di halaman ini"',
        a: "Browser membatasi ekstensi agar tidak berjalan di halaman bawaan seperti about:blank, chrome://, about:newtab, dan halaman toko ekstensi. Ini adalah batas keamanan browser yang tidak dapat dilewati. GeoSpoof berfungsi di semua situs web normal.",
      },
    ],
    copy: "Salin",
    copied: "✓ Disalin",
    copyAria: "Salin alamat email",
    stillNeedHelp: "Masih perlu bantuan?",
    contactBody:
      "Kirimi kami email dan kami akan membalas dalam satu atau dua hari.",
    contactChecklistLead: "Sertakan ini agar kami bisa membantu lebih cepat:",
    contactChecklist: [
      "Versi Firefox",
      "Sistem operasi",
      "Versi GeoSpoof",
      "Penyedia VPN (jika ada)",
      "Situs uji fingerprint yang Anda gunakan",
      "Tangkapan layar hasilnya",
      "Apakah pemalsuan berfungsi di profil Firefox yang baru",
    ],
    reportBugsLead: "Anda juga dapat melaporkan bug di ",
  },
  about: {
    meta: {
      title: "Tentang GeoSpoof — Siapa yang Membuatnya | GeoSpoof",
      description:
        "GeoSpoof adalah pemalsu lokasi dan zona waktu open source yang dibuat oleh Anthony Sgro — tanpa akun, tanpa pelacakan, dan jujur tentang apa yang dilakukannya.",
      ogTitle: "Tentang GeoSpoof",
    },
    greeting: "👋 Hai, saya Anthony",
    tagline: "Saya membuat GeoSpoof.",
    githubAria: "Anthony Sgro di GitHub",
    linkedinAria: "Anthony Sgro di LinkedIn",
    p1a: "Saya seorang pengembang perangkat lunak, dan GeoSpoof dimulai sebagai ",
    p1strong: "sesuatu yang saya inginkan untuk diri saya sendiri",
    p1b: ": cara mudah untuk mengendalikan lokasi dan zona waktu yang dibocorkan browser saya, tanpa mendaftar apa pun atau memberikan data saya ke satu perusahaan lagi. Ini tumbuh menjadi alat yang kini digunakan banyak orang setiap hari, yang masih membuat saya takjub.",
    p2a: "Ini open source, ",
    p2strong: "tanpa akun dan tidak ada yang perlu didaftarkan",
    p2b: ". Pengaturan Anda hanya tersimpan di browser Anda. Dan jika Anda penasaran apa yang sebenarnya dilakukannya, kodenya bersifat publik dan ",
    verifyLink: "halaman verifikasi",
    p2c: " menunjukkan dengan tepat apa yang bisa dibaca situs web tentang Anda.",
    p3a: "Ada tingkat Pro opsional untuk ",
    p3strong: "fitur unggulan tambahan",
    p3b: ", sementara pemalsuan sehari-hari tetap gratis.",
    p4a: "Punya pertanyaan, ide, atau hanya ingin ",
    p4em: "menyapa",
    p4b: "? ",
    supportLink: "Halaman dukungan",
    p4c: " langsung sampai ke saya, atau temukan saya di GitHub dan LinkedIn di atas. Terima kasih telah mampir.",
  },
  spoofTimezone: {
    meta: {
      title: "Palsukan Zona Waktu Browser Anda — Ekstensi Gratis | GeoSpoof",
      description:
        "Ubah atau palsukan zona waktu browser Anda agar cocok dengan lokasi mana pun. GeoSpoof menimpa Date, Intl, dan Temporal agar jam Anda tidak bisa mengungkap wilayah asli Anda.",
      ogTitle: "Palsukan zona waktu browser Anda",
    },
    hero: {
      breadcrumbHome: "Beranda",
      breadcrumb: "Palsukan Zona Waktu",
      badge: "Pemalsuan zona waktu",
      headingPre: "Palsukan ",
      headingEmphasis: "zona waktu",
      introPre:
        "Situs web membaca zona waktu Anda begitu halaman dimuat — tanpa permintaan izin — melalui ",
      introMid: " dan ",
      introPost:
        ". GeoSpoof menimpanya agar jam Anda cocok dengan lokasi yang Anda pilih, bukan tempat Anda sebenarnya berada.",
      ctaFallback: "Dapatkan GeoSpoof gratis",
      testTimezone: "Uji zona waktu Anda",
    },
    whatLeaks: {
      heading: "Apa yang dibocorkan browser Anda",
      intro:
        "Tidak seperti Geolocation API, permukaan zona waktu tidak pernah meminta izin — mereka menjawab begitu halaman dimuat. Satu jam yang tidak cocok saja bisa membatalkan lokasi GPS palsu.",
      reveals1: "Mengembalikan nama IANA seperti America/New_York.",
      reveals2: "Mengembalikan offset UTC Anda dalam menit.",
      surface3Api: "Temporal & stempel waktu dokumen",
      reveals3:
        "API waktu yang lebih baru dan stempel waktu halaman mengekspos zona yang sama.",
    },
    howTo: {
      heading: "Cara memalsukan zona waktu Anda",
      schemaName: "Cara memalsukan zona waktu browser Anda",
      schemaDesc:
        "Ubah zona waktu yang dilaporkan browser Anda ke situs web, tanpa mengubah jam sistem Anda, menggunakan ekstensi gratis GeoSpoof.",
      steps: [
        {
          name: "Instal GeoSpoof",
          text: "Tambahkan ekstensi gratis GeoSpoof untuk browser Anda — Firefox, Chrome, Brave, Edge, atau Safari.",
        },
        {
          name: "Tetapkan lokasi Anda",
          text: "Cari kota, masukkan koordinat, atau gunakan Sinkronisasi VPN agar cocok dengan wilayah keluar VPN Anda.",
        },
        {
          name: "Zona waktu menyelaraskan otomatis",
          text: "GeoSpoof menimpa Date, Intl.DateTimeFormat, dan Temporal agar setiap API berbasis jam melaporkan zona waktu lokasi yang Anda pilih.",
        },
        {
          name: "Verifikasi berhasil",
          text: "Buka halaman verifikasi GeoSpoof untuk memastikan zona waktu yang dilaporkan cocok dengan lokasi palsu Anda.",
        },
      ],
    },
    whyItMatters: {
      heading: "Lokasi palsu memerlukan jam yang cocok",
      body: "VPN memindahkan IP Anda dan GeoSpoof memindahkan koordinat GPS Anda — tetapi jika zona waktu Anda masih menunjukkan wilayah asli Anda, ketidakcocokan itu membongkar Anda. GeoSpoof menjaga zona waktu Anda tetap selaras dengan lokasi yang Anda pilih secara otomatis, dan menyelaraskannya kembali saat VPN Anda berganti server keluar, sehingga geolokasi, zona waktu, dan IP Anda semuanya menceritakan hal yang sama.",
      blogLinkLead: "Ingin ulasan teknis mendalam? ",
      blogLinkText: "Baca mengapa zona waktu Anda mengungkap lokasi Anda",
    },
    faq: {
      heading: "Pertanyaan yang sering diajukan",
      items: [
        {
          q: "Bagaimana cara mengubah zona waktu browser saya?",
          a: "Browser mengambil zona waktu dari sistem operasi Anda, dan sebagian besar tidak mengizinkan Anda menimpanya per situs. GeoSpoof mengubah zona waktu yang dilaporkan browser Anda ke situs web tanpa menyentuh jam sistem Anda: instal ekstensi, tetapkan lokasi, dan ia menimpa API zona waktu JavaScript agar cocok.",
        },
        {
          q: "Bisakah saya memalsukan zona waktu saya tanpa mengubah jam sistem saya?",
          a: "Ya. GeoSpoof bekerja di tingkat API browser, jadi ia mengubah apa yang dibaca situs web (Intl.DateTimeFormat, Date, Temporal) sementara jam sebenarnya dan pengaturan sistem komputer Anda tetap persis seperti apa adanya.",
        },
        {
          q: "Apakah VPN mengubah zona waktu browser saya?",
          a: "Tidak. VPN hanya mengubah alamat IP Anda. Browser Anda tetap melaporkan zona waktunya sendiri dari sistem operasi Anda, jadi VPN di negara lain dengan zona waktu rumah Anda adalah ketidakcocokan yang mudah dideteksi. GeoSpoof menyelaraskan zona waktu dengan lokasi palsu Anda untuk menutup celah itu.",
        },
        {
          q: "Mengapa zona waktu saya perlu cocok dengan lokasi saya?",
          a: "Jika Anda memalsukan lokasi GPS atau menggunakan VPN tetapi membiarkan zona waktu Anda di wilayah asli, keduanya berselisih — dan ketidakcocokan itu adalah petunjuk yang umum dan mudah dideteksi. Menyelaraskan zona waktu Anda dengan lokasi yang Anda pilih membuat setiap sinyal menceritakan hal yang sama.",
        },
        {
          q: "Apakah GeoSpoof memalsukan zona waktu secara otomatis?",
          a: "Ya. Saat Anda menetapkan lokasi atau menyinkronkan dengan VPN Anda, GeoSpoof menentukan zona waktu yang benar untuk koordinat tersebut dan menerapkannya secara otomatis — termasuk saat VPN Anda berganti server keluar.",
        },
      ],
    },
  },
  verify: {
    meta: {
      title:
        "Uji Lokasi Browser — Lihat Apa yang Diketahui Situs Web Tentang Anda | GeoSpoof",
      description:
        "Uji lokasi browser gratis. Lihat geolokasi, zona waktu, dan IP yang dibaca situs web tentang Anda sekarang — dan apakah browser Anda membocorkan lokasi asli Anda.",
    },
    eyebrow: "Verifikasi",
    heading: "Apa yang bisa dilihat situs web tentang Anda",
    refresh: "Muat ulang",
    refreshAria:
      "Muat ulang — muat ulang halaman untuk melihat nilai terbaru Anda",
    introMobile:
      "Nilai langsung yang bisa dibaca situs web tentang Anda sekarang.",
    introDesktop:
      "Nilai langsung dari browser Anda sekarang — lokasi, zona waktu, dan IP yang bisa dibaca situs web. Dengan GeoSpoof aktif, mereka mencerminkan lokasi palsu Anda alih-alih yang asli.",
    vpnSyncNote:
      "Menggunakan Sinkronisasi VPN otomatis? Perubahan bisa memakan waktu hingga 10 detik — ketuk Muat ulang untuk melihat yang terbaru.",
    rows: {
      geolocation: "Geolokasi",
      timezone: "Zona waktu",
      currentTime: "Waktu saat ini",
      ipAddress: "Alamat IP",
      webrtc: "WebRTC",
      waitingPermission: "Menunggu izin…",
      blockedDenied: "Diblokir / ditolak",
      lookingUp: "Mencari…",
      lookupFailed: "Pencarian gagal",
      probing: "Menyelidiki…",
      noLeak: "Tidak ada kebocoran IP terdeteksi",
    },
    vpnCard: {
      line1:
        "Alamat IP Anda adalah satu-satunya sinyal yang tidak bisa diubah GeoSpoof. Hanya VPN yang bisa.",
      line2: "Yang kami rekomendasikan berdiskon hingga {discount}.",
      cta: "Amankan IP Anda dengan Proton VPN",
      priceNote: "Diskon hingga {discount}",
      guaranteeNote: "Garansi 30 hari",
    },
    apiSection: {
      eyebrow: "Permukaan API browser",
      description:
        "Permukaan fingerprinting utama yang diperiksa penyerang. Perluas grup mana pun untuk melihat nilai yang mereka dapatkan — semuanya harus menceritakan hal yang sama.",
    },
    supportLead:
      "Melihat sesuatu yang salah, atau hasil yang tidak Anda duga? ",
    supportLink: "Dapatkan dukungan",
    verdict: {
      running: "Menjalankan pemeriksaan…",
      runningSub: "Membaca browser Anda dan menyelidiki kebocoran.",
      allGood: "Semua pemeriksaan lolos",
      allGoodSub: "Tidak ada yang kami periksa yang membongkar Anda.",
      exposed: "Beberapa sinyal terekspos",
      problemWebrtc: "WebRTC membocorkan IP asli Anda",
      problemGeo: "Lokasi tidak cocok dengan IP",
      problemTz: "Zona waktu tidak cocok dengan IP",
      crossRef: "Situs yang menyilangkan sinyal-sinyal ini bisa menandai Anda.",
      installFree: "Instal GeoSpoof gratis",
      alreadyHave: "Sudah punya GeoSpoof?",
    },
    dialog: {
      title: "Sudah menjalankan GeoSpoof?",
      description:
        "Daftar periksa singkat mengatasi hampir setiap sinyal yang ditandai.",
      ipMismatchLocation: "IP tidak cocok dengan lokasi Anda?",
      ipMismatchTimezone: "IP tidak cocok dengan zona waktu Anda?",
      ipMismatchBody:
        "Itu wajar saat Sinkronisasi VPN mati — GeoSpoof hanya menyelaraskan IP Anda saat Anda menyalakannya. Jika Anda memang ingin mempertahankan IP asli, ini berfungsi sebagaimana mestinya.",
      autoSyncBold: "Baru saja menyalakan sinkronisasi VPN otomatis?",
      autoSyncBody:
        "Beri waktu hingga ~10 detik setelah memuat ulang untuk menyusul, lalu periksa lagi — sinkronisasi otomatis tidak instan seperti sinkronisasi manual.",
      updateBold: "Perbarui ke versi terbaru.",
      updateBody: "Trik fingerprinting baru ditambal terus-menerus. ",
      downloadOptions: "Lihat opsi unduhan",
      checkSiteBold: "Periksa apakah aktif untuk situs ini.",
      checkSiteBody:
        "Lihat ikon bilah alat; jika Anda membatasi dengan daftar izin atau daftar blokir, sertakan situs ini.",
      reloadBold: "Muat ulang setelah mengaktifkan atau memperbarui.",
      reloadBody: "Beberapa permukaan hanya berlaku saat halaman dimuat ulang.",
      stillStuck: "Masih macet? Hubungi dukungan",
      gotIt: "Mengerti",
    },
    faq: {
      heading: "Pertanyaan yang sering diajukan",
      items: [
        {
          q: "Apa itu geolokasi browser saya?",
          a: "Geolokasi browser Anda adalah lintang dan bujur yang diserahkannya ke situs web melalui Geolocation API JavaScript. Peta dan koordinat di atas menunjukkan dengan tepat apa yang dibaca situs saat mereka menanyakan di mana Anda berada. Dengan GeoSpoof aktif, itu adalah lokasi palsu Anda alih-alih yang asli.",
        },
        {
          q: "Bisakah situs web melihat lokasi asli saya meski saya menggunakan VPN?",
          a: "Ya. VPN hanya mengubah alamat IP Anda. Browser Anda tetap melaporkan geolokasi tingkat GPS-nya sendiri, zona waktu sistem, dan lokal — dan WebRTC bisa membocorkan IP asli Anda sepenuhnya. Jika sinyal-sinyal itu berselisih dengan lokasi keluar VPN Anda, situs bisa tahu ada yang tidak beres. Halaman ini menandai persis ketidakcocokan tersebut.",
        },
        {
          q: "Mengapa zona waktu saya tidak cocok dengan alamat IP saya?",
          a: "Zona waktu Anda berasal dari sistem operasi Anda, sementara lokasi IP Anda berasal dari jaringan atau VPN Anda. Jika Anda terhubung melalui VPN di negara lain tetapi membiarkan jam sistem Anda di zona waktu rumah, keduanya tidak akan sejajar — petunjuk yang umum dan mudah dideteksi. GeoSpoof menyelaraskan zona waktu Anda dengan lokasi palsu Anda untuk menutup celah itu.",
        },
        {
          q: "Apa itu kebocoran WebRTC?",
          a: "WebRTC adalah fitur browser untuk audio, video, dan data waktu nyata. Ia bisa mengungkap alamat IP publik dan lokal asli Anda langsung ke situs web — melewati VPN Anda — kecuali diblokir. Pemeriksaan WebRTC di atas menyelidiki kebocoran itu dan melaporkan alamat apa pun yang berhasil diekspos.",
        },
        {
          q: "Apakah uji lokasi browser ini gratis?",
          a: "Ya. Uji ini berjalan sepenuhnya di browser Anda, tidak dikenai biaya, dan tidak memerlukan akun. Ia membaca sinyal yang sama yang bisa dibaca situs web mana pun dan menunjukkannya kembali kepada Anda dalam bahasa yang jelas.",
        },
      ],
    },
  },
  engineLevel: {
    meta: {
      title:
        "Sembunyikan Bilah “mulai men-debug browser ini” Chrome | GeoSpoof",
      description:
        "Pemalsuan tingkat mesin GeoSpoof menggunakan API debugger Chrome, jadi Chrome menampilkan bilah debug. Berikut artinya, mengapa aman, dan cara menyembunyikannya.",
      ogTitle: "Sembunyikan bilah “mulai men-debug browser ini” Chrome",
    },
    hero: {
      breadcrumbHome: "Beranda",
      breadcrumb: "Pemalsuan Tingkat Mesin",
      badge: "Chrome · Pemalsuan Tingkat Mesin",
      headingPre: "Sembunyikan bilah ",
      headingEmphasis: "“mulai men-debug browser ini”",
      headingPost: " Chrome",
      intro:
        "Chrome menampilkan bilah “mulai men-debug browser ini” saat Pemalsuan Tingkat Mesin aktif. Ini tidak berbahaya — berikut cara menyembunyikannya.",
      ctaHowTo: "Cara menyembunyikan bilah",
      ctaFallback: "Dapatkan GeoSpoof gratis",
      figureAlt:
        "Chrome menampilkan bilah notifikasi “GeoSpoof mulai men-debug browser ini” di bagian atas jendela saat Pemalsuan Tingkat Mesin aktif",
      figCaption:
        "Bilah “mulai men-debug browser ini” yang ditampilkan Chrome saat Pemalsuan Tingkat Mesin aktif.",
    },
    whatBar: {
      heading: "Apa arti bilah itu",
      intro:
        "Pemalsuan Tingkat Mesin menerapkan zona waktu Anda di tingkat browser, sebelum skrip pertama halaman berjalan, sehingga ia juga mencakup worker latar belakang. Untuk mencapai sedalam itu, GeoSpoof menggunakan API debugger Chrome — dan Chrome mengumumkannya dengan bilah notifikasi.",
      point1Title: "Ini adalah pemberitahuan standar Chrome",
      point1Body:
        "Chrome menampilkan bilah untuk ekstensi apa pun yang menggunakan API debugger — API yang sama yang digunakan DevTools. Ia muncul saat GeoSpoof terhubung, bukan karena ada yang salah.",
      point2Title: "GeoSpoof hanya menetapkan penimpaan zona waktu",
      point2Body:
        "Koneksi debugger hanya digunakan untuk menerapkan zona waktu palsu Anda di seluruh frame dan worker. Ia tidak membaca konten halaman, ketikan, atau penjelajahan Anda — dan kodenya open source.",
      point3Title: "Bilah itu bersifat kosmetik",
      point3Body:
        "Ia tidak mengubah apa pun tentang bagaimana situs melihat Anda. Menyembunyikannya semata-mata untuk menghilangkan strip di bagian atas jendela.",
    },
    howTo: {
      heading: "Cara menyembunyikan bilah",
      introPre: "Jalankan Chrome dengan flag ",
      introPost:
        ". Tutup Chrome terlebih dahulu, lalu ikuti langkah untuk sistem Anda.",
    },
    guides: {
      win: {
        step1: "Tutup semua jendela Chrome.",
        step2:
          "Klik kanan pintasan Chrome yang Anda gunakan (bilah tugas, desktop, atau menu Start) dan pilih Properti.",
        step3a: "Di kolom ",
        step3strong: "Target",
        step3mid: ", biarkan jalur dalam tanda kutip ke ",
        step3code: "chrome.exe",
        step3end:
          " apa adanya dan tambahkan flag setelah tanda kutip penutup (perhatikan spasi di awal).",
        step4: "Klik OK, lalu buka Chrome dari pintasan itu.",
        note: "Ulangi untuk setiap pintasan yang Anda gunakan untuk membuka Chrome (bilah tugas dan menu Start adalah pintasan terpisah).",
      },
      mac: {
        step1: "Tutup Chrome sepenuhnya (⌘Q).",
        step2: "Buka Terminal dan jalankan perintah di bawah.",
        step3a:
          "Chrome terbuka kembali tanpa bilah. Untuk menjalankannya seperti ini setiap kali, simpan perintah sebagai ",
        step3strong: "Aplikasi",
        step3end: " Automator atau alias shell.",
      },
      linux: {
        step1: "Tutup Chrome.",
        step2:
          "Jalankan dengan flag, atau tambahkan flag ke baris Exec= peluncur .desktop Chrome Anda untuk membuatnya permanen.",
        note: "Gunakan chromium sebagai ganti google-chrome jika Anda menjalankan Chromium.",
      },
    },
    permanent: {
      heading: "Buat tetap",
      bodyPre:
        "Flag hanya berlaku untuk peluncuran yang menyertakannya, jadi bilah kembali jika Anda membuka Chrome dengan cara lain. Untuk menjaganya tetap tersembunyi selamanya, tambahkan ",
      bodyMid:
        " ke pintasan atau peluncur yang Anda gunakan untuk membuka Chrome setiap hari — kolom Target pintasan Windows, aplikasi peluncur macOS, atau berkas ",
      bodyDesktopCode: ".desktop",
      bodyEnd: " Linux Anda.",
      body2Pre:
        "Lebih suka tidak repot? Biarkan Pemalsuan Tingkat Mesin mati — perlindungan standar GeoSpoof tetap memalsukan ",
      locationLink: "lokasi",
      body2Mid: " dan ",
      timezoneLink: "zona waktu",
      body2End: " Anda tanpa bilah debugger apa pun.",
    },
    faq: {
      heading: "Pertanyaan yang sering diajukan",
      items: [
        {
          q: "Mengapa GeoSpoof mengatakan sedang “men-debug” browser saya?",
          a: "Pemalsuan Tingkat Mesin menggunakan API debugger Chrome (Chrome DevTools Protocol) — mekanisme yang sama yang digunakan DevTools browser Anda sendiri — untuk menetapkan zona waktu Anda lebih dalam di browser daripada yang bisa dilakukan ekstensi biasa. Setiap kali ekstensi terhubung dengan API itu, Chrome menampilkan bilah “mulai men-debug browser ini”. Ini adalah pemberitahuan standar Chrome, bukan tanda ada yang salah.",
        },
        {
          q: "Apakah aman? Apakah GeoSpoof membaca data saya?",
          a: "GeoSpoof menggunakan koneksi debugger hanya untuk menerapkan penimpaan zona waktu. Ia tidak membaca konten halaman, ketikan, atau penjelajahan Anda. GeoSpoof open source, jadi Anda bisa meninjau dengan tepat apa yang dikirimnya di GitHub. Jika Anda lebih suka tidak menggunakannya, biarkan Pemalsuan Tingkat Mesin mati dan perlindungan standar GeoSpoof tetap memalsukan lokasi dan zona waktu Anda.",
        },
        {
          q: "Bagaimana cara menyembunyikan bilah “mulai men-debug browser ini”?",
          a: "Jalankan Chrome dengan flag {flag}. Di Windows, tambahkan ke kolom Target pintasan Chrome Anda; di macOS, jalankan ulang Chrome dari Terminal dengan flag itu (atau simpan sebagai peluncur); di Linux, tambahkan ke perintah peluncuran Chrome Anda atau berkas .desktop. Bilah menghilang sementara pemalsuan tetap berfungsi.",
        },
        {
          q: "Apakah bilah akan kembali saat saya memulai ulang Chrome?",
          a: "Ya, kecuali Anda menyematkan flag ke pintasan atau peluncur yang selalu Anda gunakan. Flag hanya memengaruhi peluncuran yang menyertakannya, jadi membuka Chrome dengan cara lain akan memunculkan kembali bilah itu. Tambahkan ke peluncur harian Anda agar tetap.",
        },
        {
          q: "Mengapa GeoSpoof tidak bisa menyembunyikan bilah untuk saya secara otomatis?",
          a: "Bilah dikendalikan oleh Chrome sendiri, dan hanya flag peluncuran browser yang bisa mematikannya. Ekstensi tidak bisa menetapkan flag baris perintah Chrome, jadi langkah ini harus dilakukan sekali oleh Anda. Ini adalah pengaman Chrome yang disengaja di sekitar API debugger.",
        },
        {
          q: "Apa itu Pemalsuan Tingkat Mesin?",
          a: "Ini adalah opsi GeoSpoof khusus Chrome yang memalsukan zona waktu Anda di tingkat mesin browser alih-alih dari skrip halaman. Karena ia berlaku sebelum skrip pertama halaman berjalan dan mencapai worker latar belakang, ia menutup kebocoran zona waktu yang bisa terlewat oleh pemalsuan tingkat halaman. Geolokasi tetap menggunakan metode standar GeoSpoof yang tanpa permintaan izin.",
        },
      ],
    },
    schema: {
      howToStep1Name: "Tutup Chrome sepenuhnya",
      howToStep1Text:
        "Tutup setiap jendela Chrome agar browser keluar sepenuhnya — flag hanya berlaku untuk peluncuran baru.",
      howToStep2Name: "Jalankan ulang Chrome dengan flag",
      howToStep2Text:
        "Mulai Chrome dengan flag baris perintah {flag} menggunakan langkah untuk sistem operasi Anda.",
      howToStep3Name: "Buat permanen (opsional)",
      howToStep3Text:
        "Tambahkan flag ke pintasan atau peluncur yang biasa Anda gunakan, agar bilah tetap tersembunyi di setiap peluncuran.",
      howToStep4Name: "Buka kembali GeoSpoof",
      howToStep4Text:
        "Pemalsuan Tingkat Mesin tetap berfungsi persis seperti sebelumnya — hanya bilah notifikasi yang hilang.",
      howToName:
        "Cara menyembunyikan bilah “mulai men-debug browser ini” Chrome",
      howToDesc:
        "Sembunyikan bilah notifikasi yang ditampilkan Chrome saat Pemalsuan Tingkat Mesin GeoSpoof aktif, dengan menjalankan Chrome menggunakan flag {flag}.",
    },
  },
  feedback: {
    meta: {
      title: "Kirim Masukan — GeoSpoof",
      description:
        "Punya ide, bug untuk dilaporkan, atau sekadar ingin menyapa? Kirim masukan Anda ke tim GeoSpoof — kami membaca setiap pesan.",
      ogTitle: "Kirim masukan ke GeoSpoof",
    },
    heading: "Terima kasih telah menggunakan GeoSpoof",
    subhead:
      "GeoSpoof dibuat oleh tim yang sangat kecil, dan setiap pesan benar-benar membantu menentukan arah pengembangannya. Baik itu bug, ide fitur, atau sekadar sapaan — kami senang mendengar dari Anda.",
    emailLabel: "Kirim masukan Anda ke",
    emailHint:
      "Salin alamat di bawah, atau ketuk untuk membuka aplikasi email Anda.",
    copy: "Salin",
    copied: "✓ Tersalin",
    copyAria: "Salin alamat email untuk masukan",
    closing: "Terima kasih telah membantu membuat GeoSpoof lebih baik.",
  },
  gps: {
    meta: {
      title: "Unduh GeoSpoof GPS untuk Mac | GeoSpoof",
      description:
        "GeoSpoof GPS adalah aplikasi bilah menu macOS yang menyetel lokasi GPS asli iPhone yang terhubung agar sesuai dengan lokasi palsu Anda. Unduh DMG yang ditandatangani dan dinotarisasi.",
      ogTitle: "Unduh GeoSpoof GPS untuk Mac",
    },
    compat: {
      label: "Catatan",
      body: "GeoSpoof GPS dirancang khusus untuk privasi, penjelajahan web, dan pengembangan. Aplikasi ini tidak kompatibel dengan, dan tidak dirancang untuk, gim seluler AR seperti Pokémon GO.",
    },
    experimental: {
      label: "Eksperimental",
      title: "Fitur baru yang masih eksperimental",
      body: "GeoSpoof GPS masih baru dan sedang diuji di berbagai perangkat, jadi harap maklum jika ada beberapa kekurangan dan sedikit penyiapan awal. Ini tambahan opsional. Bagian lain GeoSpoof tetap berfungsi baik tanpanya.",
    },
    hero: {
      breadcrumbHome: "Beranda",
      breadcrumb: "GeoSpoof GPS",
      iconAlt: "Ikon aplikasi GeoSpoof GPS",
      badge: "macOS · Aplikasi bilah menu",
      headingPre: "Samakan ",
      headingEmphasis: "GPS asli",
      headingPost: " iPhone Anda dengan lokasi palsu Anda",
      intro:
        "GeoSpoof GPS adalah pendamping bilah menu macOS yang menyetel lokasi tingkat sistem iPhone yang terhubung ke tempat yang Anda pilih di GeoSpoof. Browser dan GPS asli ponsel Anda menyampaikan cerita yang sama.",
    },
    download: {
      cta: "Unduh untuk Mac",
      setupCta: "Panduan penyiapan",
      resolving: "Mencari versi terbaru…",
      versionLabel: "Versi terbaru",
      note: "Build universal untuk Apple Silicon dan Intel. Ditandatangani dengan Developer ID dan dinotarisasi oleh Apple.",
    },
    setup: {
      title: "Siapkan GeoSpoof GPS",
      intro:
        "Buka ikon bilah menu dan pilih “Siapkan…”. Panduan akan menandai setiap langkah saat Anda mengerjakannya. Hubungkan iPhone dengan kabel untuk menyelesaikan penyiapan. Setelah itu, GeoSpoof GPS tetap bekerja melalui Wi-Fi.",
      steps: [
        {
          name: "Pasang aplikasinya",
          text: "Buka DMG, seret GeoSpoof GPS ke folder Applications, lalu jalankan. Aplikasi berjalan dari bilah menu (tanpa ikon Dock, tanpa jendela) dan membuka panduan penyiapan saat pertama kali dijalankan.",
        },
        {
          name: "Izinkan akses Jaringan Lokal",
          text: "Saat pertama kali dijalankan, macOS meminta akses Jaringan Lokal. Klik Izinkan agar GeoSpoof GPS dapat menemukan iPhone Anda dan berkomunikasi dengannya. Tanpa izin ini, aplikasi tidak dapat melihat ponsel Anda.",
          bullets: [
            "Melewatkan permintaannya? Aktifkan di Pengaturan Sistem ▸ Privasi & Keamanan ▸ Jaringan Lokal ▸ GeoSpoof GPS.",
            "Pesan “Perangkat tidak ditemukan” yang macet biasanya menandakan izin ini mati.",
          ],
        },
        {
          name: "Pasang Xcode",
          text: "GeoSpoof GPS membutuhkan Developer Disk Image dari Apple, dan itu disertakan di dalam Xcode. Mulai unduhan ini lebih dulu — ukurannya besar (beberapa GB), jadi biarkan terpasang di latar belakang sambil Anda mengerjakan langkah-langkah iPhone yang cepat di bawah.",
          bullets: [
            "Pasang Xcode (gratis) dari Mac App Store dan buka sekali.",
            "Pada peluncuran pertama muncul layar “Select platforms”. Centang macOS dan biarkan sisanya (termasuk iOS) tidak dicentang, lalu lanjutkan — Anda tidak memerlukan SDK iOS atau Simulator; citra pengembang tetap menjadi bagian dari penyiapan dasar Xcode.",
            "Biarkan “Installing components” selesai, lalu tutup Xcode. Tanpa proyek, tanpa build, tidak ada yang perlu dikompilasi, dan tanpa akun Apple Developer berbayar.",
            "Sudah punya citra pengembang? Arahkan GeoSpoof GPS ke folder itu dan lewati unduhan Xcode sepenuhnya.",
          ],
          link: { label: "Dapatkan Xcode di Mac App Store" },
        },
        {
          name: "Hubungkan iPhone Anda",
          text: "Sambungkan iPhone ke Mac Anda dan buka kuncinya. Gunakan kabel yang mendukung data, karena sebagian hanya untuk mengisi daya. Jika tidak muncul, coba kabel atau port lain.",
        },
        {
          name: "Percayai komputer ini",
          text: "Saat iPhone bertanya apakah akan mempercayai komputer ini, ketuk Percayai dan masukkan kode sandi Anda. Ini memungkinkan Mac dan ponsel Anda saling berkomunikasi.",
          bullets: [
            "Tidak ada permintaan? Jaga ponsel tetap tidak terkunci, lalu cabut dan colokkan kembali kabelnya. Peringatan hanya muncul saat layar tidak terkunci.",
            "Masih tidak ada? Kunci dan buka kunci ponsel (atau mulai ulang) lalu sambungkan kembali.",
            "Hanya sebagai upaya terakhir: Pengaturan ▸ Umum ▸ Transfer atau Atur Ulang iPhone ▸ Atur Ulang ▸ Atur Ulang Lokasi & Privasi, lalu sambungkan kembali dan ketuk Percayai.",
          ],
        },
        {
          name: "Aktifkan Mode Pengembang",
          text: "Di iPhone Anda, buka Pengaturan ▸ Privasi & Keamanan ▸ Mode Pengembang, aktifkan, lalu mulai ulang saat diminta. Ini baru muncul setelah ponsel terhubung ke Mac Anda setidaknya sekali.",
        },
        {
          name: "Pasangkan dengan Mac ini",
          text: "Di jendela penyiapan, klik Pasangkan. Jabat tangan aman sekali jalan ini memungkinkan Mac Anda mengendalikan GPS iPhone. Jaga ponsel tetap tidak terkunci dan terhubung selama prosesnya.",
        },
        {
          name: "Siapkan citra pengembang",
          text: "Memerlukan Xcode terpasang (di atas). Dengan iPhone terhubung dan tidak terkunci, klik Siapkan. GeoSpoof GPS mempersonalisasi Developer Disk Image (DDI) dari Apple untuk perangkat Anda dan memasangnya — komponen yang memungkinkan sebuah aplikasi menyetel lokasi GPS asli Anda. Ini bertanda tangan Apple dan dikerjakan untuk Anda; tidak ada yang perlu dikonfigurasi.",
          powerUserNote:
            "Citra tidak ditemukan? Jika Siapkan mengatakan tidak dapat menemukan citra pengembang, penyiapan Xcode mungkin belum selesai memasangnya. Buka Terminal, jalankan ini, lalu klik Siapkan lagi:",
        },
        {
          name: "Pilih lokasi di GeoSpoof",
          text: "Setel lokasi Anda seperti biasa di GeoSpoof. GPS tingkat sistem iPhone Anda mengikutinya dan tetap selaras, bahkan setelah Anda mencabut kabel dan beralih ke Wi-Fi.",
          link: { label: "Dapatkan GeoSpoof untuk iPhone" },
        },
      ],
    },
    requirements: {
      title: "Yang Anda perlukan",
      macos: "macOS 13 (Ventura) atau lebih baru.",
      appPre: "Aplikasi ",
      appLink: "GeoSpoof untuk iPhone",
      appPost:
        " dengan GeoSpoof Pro. Aplikasi ini adalah pusat kendali Anda yang menyetel lokasi, dan memindahkan GPS asli perangkat adalah fitur Pro.",
      iphone:
        "iPhone dengan Mode Pengembang aktif, terhubung lewat kabel USB untuk penyiapan pertama.",
      xcodePre: "Xcode, aplikasi pengembang gratis dari Apple, di ",
      xcodeLink: "Mac App Store",
      xcodePost:
        ". Anda tidak membangun apa pun: pasang lalu buka sekali dengan iPhone terhubung agar ia menyediakan citra pengembang iOS. Ini unduhan besar, jadi sisakan sekitar 15 GB ruang kosong. Sudah punya citra pengembang? Anda bisa mengarahkan aplikasi ke folder itu.",
    },
    howItWorks: {
      title: "Cara kerjanya",
      intro:
        "Satu lokasi yang konsisten di browser dan ponsel Anda, sepenuhnya dikendalikan dari aplikasi GeoSpoof yang sudah Anda pakai.",
      steps: [
        {
          title: "Anda memilih, ia mengikuti",
          body: "Pilih lokasi di aplikasi GeoSpoof seperti biasa. Pilihan itu adalah satu-satunya sumber kebenaran, dan GeoSpoof GPS di Mac Anda mencerminkannya ke iPhone — sehingga spoof browser dan GPS asli perangkat akhirnya menceritakan hal yang sama.",
        },
        {
          title: "Mac Anda menggerakkan GPS",
          body: "Melalui pemasangan yang aman dan sekali saja, aplikasi bilah menu memakai simulasi lokasi developer milik Apple untuk mengatur lokasi tingkat sistem iPhone Anda. Tanpa jailbreak, tanpa membangun apa pun — mekanisme yang sama yang sudah dipakai developer di Xcode.",
        },
        {
          title: "Kabel sekali, lalu nirkabel",
          body: "Penyiapan pertama kali dilakukan lewat kabel USB. Setelah itu ia bekerja melalui Wi-Fi, dan menyambung kembali dengan sendirinya saat ponsel Anda keluar dari jaringan lalu bergabung lagi.",
        },
        {
          title: "Tetap stabil, kembali bersih",
          body: "Aplikasi menjaga lokasi Anda tetap terkunci dan berpindah seketika saat Anda memilih tempat baru. Jeda sinkronisasi atau tutup aplikasinya, dan iPhone Anda langsung kembali ke GPS aslinya — tanpa spoof yang tertinggal.",
        },
      ],
      privacyTitle: "Hanya milik Anda",
      privacyBody:
        "Semuanya terjadi langsung antara Mac dan iPhone Anda, jadi lokasi Anda tidak pernah menyentuh server kami. Pro diverifikasi dengan tanda terima bertanda tangan Apple, dan setiap pembaruan dinotarisasi oleh Apple serta diperiksa tanda tangannya sebelum dipasang.",
    },
    menuShotAlt: "Aplikasi bilah menu GeoSpoof GPS di macOS",
    screenshotAlt: "GeoSpoof GPS di iPhone, tangkapan layar {n}",
    help: {
      title: "Masih terkendala?",
      body: "Jika sebuah langkah tidak selesai, halaman dukungan kami punya lebih banyak solusi. Menemukan bug atau punya ide? Kami senang mendengarnya.",
      supportLink: "Dapatkan bantuan",
      feedbackLink: "Kirim masukan",
    },
  },
}
