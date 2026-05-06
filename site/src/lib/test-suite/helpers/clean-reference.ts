/**
 * Clean-reference helper.
 *
 * Creates a detached same-origin iframe and exposes its prototypes so tests
 * can compare patched implementations against pristine ones. Same-origin
 * iframes ARE patched by the extension's iframe-patching module, so this
 * is NOT a bypass of the extension — it's a tool for showing tests whether
 * the patched versions are distinguishable.
 *
 * On Firefox, same-origin iframes get patched synchronously when their
 * contentWindow is accessed, so the "clean" reference is actually
 * equivalent to the main frame. That's fine — if the patches are
 * indistinguishable from native, the comparisons will still match.
 *
 * The iframe is reused across calls via a module-level cache.
 */

let cachedIframe: HTMLIFrameElement | null = null

/**
 * Create or reuse a detached iframe and return its contentWindow.
 *
 * Returns null if the iframe cannot be created (e.g. during SSR or if
 * the DOM isn't ready). Callers should handle null by skipping cross-realm
 * checks gracefully.
 */
function getIframeWindow(): Window | null {
  if (typeof document === "undefined") return null

  if (cachedIframe?.contentWindow) {
    return cachedIframe.contentWindow
  }

  try {
    const iframe = document.createElement("iframe")
    iframe.src = "about:blank"
    iframe.style.display = "none"
    iframe.setAttribute("aria-hidden", "true")
    document.documentElement.appendChild(iframe)
    cachedIframe = iframe
    return iframe.contentWindow
  } catch {
    return null
  }
}

/**
 * Get a clean (same-origin iframe) reference to a prototype chain member.
 *
 * `accessor` receives the iframe's `window` and should return the reference
 * the caller wants. Examples:
 *   getCleanReference((w) => w.Date.prototype.getTimezoneOffset)
 *   getCleanReference((w) => w.Intl.DateTimeFormat)
 *
 * Returns null if the iframe is unavailable or the accessor throws.
 */
export function getCleanReference<T>(
  accessor: (win: Window & typeof globalThis) => T
): T | null {
  const win = getIframeWindow()
  if (!win) return null
  try {
    return accessor(win as Window & typeof globalThis)
  } catch {
    return null
  }
}
