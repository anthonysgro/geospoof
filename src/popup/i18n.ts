/**
 * Popup Internationalization
 *
 * Thin wrapper over `browser.i18n.getMessage` plus a DOM walker that
 * translates any element carrying a `data-i18n*` attribute.
 *
 * The popup HTML ships English text in its markup as the static
 * fallback; when the popup opens, `applyI18n()` replaces those nodes
 * with localized strings pulled from `_locales/<lang>/messages.json`.
 *
 * Supported attributes:
 *   data-i18n              — element.textContent
 *   data-i18n-placeholder  — element.placeholder (inputs)
 *   data-i18n-title        — element.title (tooltips)
 *   data-i18n-aria-label   — element.setAttribute("aria-label", …)
 *
 * Missing keys return the empty string from `getMessage`, in which
 * case we leave the original English markup in place rather than
 * blanking the node.
 */

/**
 * Look up a localized message, with optional positional substitutions.
 * Returns the empty string if the key is not defined in any loaded
 * `_locales/<lang>/messages.json`.
 */
export function t(key: string, substitutions?: string | string[]): string {
  try {
    return browser.i18n.getMessage(key, substitutions) || "";
  } catch {
    // Defensive: `browser.i18n` is always present in extension contexts,
    // but if the popup is ever opened in a bare page context (tests,
    // standalone preview) fall through to the empty string so the
    // English fallback in the markup is preserved.
    return "";
  }
}

type I18nAttribute = {
  /** HTML attribute to read the message key from. */
  dataAttr: string;
  /** Applies the resolved message to the element. */
  apply(el: HTMLElement, msg: string): void;
};

const ATTRIBUTES: I18nAttribute[] = [
  {
    dataAttr: "data-i18n",
    apply: (el, msg) => {
      el.textContent = msg;
    },
  },
  {
    dataAttr: "data-i18n-placeholder",
    apply: (el, msg) => {
      if ("placeholder" in el) {
        (el as HTMLInputElement).placeholder = msg;
      }
    },
  },
  {
    dataAttr: "data-i18n-title",
    apply: (el, msg) => {
      el.title = msg;
    },
  },
  {
    dataAttr: "data-i18n-aria-label",
    apply: (el, msg) => {
      el.setAttribute("aria-label", msg);
    },
  },
];

/**
 * Walk `root` and translate every element tagged with a `data-i18n*`
 * attribute. Safe to call multiple times (idempotent).
 */
export function applyI18n(root: ParentNode = document): void {
  for (const attr of ATTRIBUTES) {
    const els = Array.from(root.querySelectorAll<HTMLElement>(`[${attr.dataAttr}]`));
    for (const el of els) {
      const key = el.getAttribute(attr.dataAttr);
      if (!key) continue;
      const msg = t(key);
      if (msg) attr.apply(el, msg);
    }
  }
}
