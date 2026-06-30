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
}
