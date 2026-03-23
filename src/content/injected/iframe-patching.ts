/**
 * Iframe toString patching.
 *
 * Fingerprinting scripts create iframes to get a "clean" Function.prototype.toString
 * reference and cross-check our overrides. We intercept contentWindow access
 * so the iframe's toString is patched synchronously before the caller can use it.
 * This defeats the arkenfox test which grabs iframeWindow immediately after
 * appending the iframe to the DOM.
 */

import type { AnyFunction } from "./types";
import { overrideRegistry } from "./state";
import {
  registerOverride,
  disguiseAsNative,
  stripConstruct,
  nativeTypeErrorMessage,
} from "./function-masking";
import { createLogger } from "@/shared/utils/debug-logger";

const logger = createLogger("INJ");

// Track which iframe windows have already been patched to avoid re-patching
const patchedIframeWindows = new WeakSet<Window>();

/** Patch an iframe window's Function.prototype.toString to use the shared override registry. */
export function patchIframeWindow(iframeWindow: Window): void {
  if (patchedIframeWindows.has(iframeWindow)) return;
  patchedIframeWindows.add(iframeWindow);

  try {
    logger.trace("Patching iframe window toString");
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const iframeFnProto = (iframeWindow as any).Function.prototype as {
      toString: AnyFunction;
      call: typeof Function.prototype.call;
    };
    const iframeOrigToString = iframeFnProto.toString;
    const iframeOrigCall = iframeFnProto.call;

    // Use method shorthand so the patched toString has no prototype/[[Construct]]
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: method shorthand destructuring for anti-fingerprint
    iframeFnProto.toString = {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      toString(this: any): string {
        const nativeName = overrideRegistry.get(this as AnyFunction);
        if (nativeName !== undefined) {
          return `function ${nativeName}() { [native code] }`;
        }
        // Pre-check: throw TypeError directly for non-functions (same
        // reason as the main window override — single stack frame).
        if (typeof this !== "function") {
          throw new TypeError(nativeTypeErrorMessage);
        }
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-explicit-any
        return (iframeOrigCall as any).call(iframeOrigToString, this) as string;
      },
    }.toString;
  } catch {
    // Cross-origin iframes throw SecurityError — silently ignore
  }
}

/** Scan a node (and descendants) for iframes and patch their windows. */
export function scanAndPatchIframes(node: Node): void {
  if (node instanceof HTMLIFrameElement) {
    if (node.contentWindow) {
      try {
        logger.trace("Iframe patching: scanning iframe", { src: node.src || "(no src)" });
        patchIframeWindow(node.contentWindow);
      } catch {
        /* cross-origin */
      }
    }
  }
  if (node instanceof Element) {
    for (const iframe of Array.from(node.querySelectorAll("iframe"))) {
      if (iframe.contentWindow) {
        try {
          logger.trace("Iframe patching: scanning iframe", { src: iframe.src || "(no src)" });
          patchIframeWindow(iframe.contentWindow);
        } catch {
          /* cross-origin */
        }
      }
    }
  }
}

/**
 * Install contentWindow/contentDocument getter overrides on HTMLIFrameElement.prototype.
 * Called by index.ts during initialization.
 */
export function installIframePatching(): void {
  // Override HTMLIFrameElement.prototype.contentWindow getter to patch
  // the iframe's toString synchronously on first access.
  const iframeContentWindowDesc = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    "contentWindow"
  );
  if (iframeContentWindowDesc?.get) {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the wrapper
    const originalContentWindowGet = iframeContentWindowDesc.get;
    // Wrap via stripConstruct so the getter has no prototype/[[Construct]]

    const contentWindowGetter = stripConstruct(function (
      this: HTMLIFrameElement
    ): WindowProxy | null {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const win = originalContentWindowGet.call(this);
      if (win) {
        try {
          // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
          patchIframeWindow(win);
        } catch {
          // Ignore cross-origin errors
        }
      }
      return win;
    });
    registerOverride(contentWindowGetter, "contentWindow");
    disguiseAsNative(contentWindowGetter, "contentWindow", 0);
    Object.defineProperty(HTMLIFrameElement.prototype, "contentWindow", {
      get: contentWindowGetter,
      configurable: iframeContentWindowDesc.configurable,
      enumerable: iframeContentWindowDesc.enumerable,
    });
  }

  // Also intercept contentDocument for completeness — some tests access
  // the iframe's document to get Function.prototype.toString from there.
  const iframeContentDocDesc = Object.getOwnPropertyDescriptor(
    HTMLIFrameElement.prototype,
    "contentDocument"
  );
  if (iframeContentDocDesc?.get) {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the wrapper
    const originalContentDocGet = iframeContentDocDesc.get;

    const contentDocGetter = stripConstruct(function (this: HTMLIFrameElement): Document | null {
      // Trigger contentWindow patching first
      const win = this.contentWindow; // uses our patched getter above
      void win; // ensure side-effect
      return originalContentDocGet.call(this);
    });
    registerOverride(contentDocGetter, "contentDocument");
    disguiseAsNative(contentDocGetter, "contentDocument", 0);
    Object.defineProperty(HTMLIFrameElement.prototype, "contentDocument", {
      get: contentDocGetter,
      configurable: iframeContentDocDesc.configurable,
      enumerable: iframeContentDocDesc.enumerable,
    });
  }
}
