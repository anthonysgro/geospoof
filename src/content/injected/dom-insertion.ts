/**
 * DOM insertion method wrapping.
 *
 * Arkenfox creates iframes via innerHTML + appendChild and immediately
 * accesses window[numberOfIframes] synchronously. MutationObserver is
 * async and fires too late. We wrap DOM insertion methods to synchronously
 * scan inserted nodes for iframes and patch them before the next line
 * of JS executes.
 */

import { scanAndPatchIframes } from "./iframe-patching";
import {
  originalAppendChild,
  originalInsertBefore,
  originalReplaceChild,
  originalAppend,
  originalPrepend,
  originalReplaceWith,
  originalInsertAdjacentElement,
  originalInsertAdjacentHTML,
} from "./state";
import {
  installOverride,
  registerOverride,
  disguiseAsNative,
  stripConstruct,
} from "./function-masking";

/**
 * Install DOM insertion method wrappers and MutationObserver fallback.
 * Called by index.ts during initialization.
 */
export function installDomInsertionWrapping(): void {
  // Wrap Node.prototype.appendChild
  // When a DocumentFragment is appended, its children move to the parent
  // and the fragment becomes empty. We snapshot children before insertion.
  installOverride(Node.prototype, "appendChild", function <T extends Node>(this: Node, node: T): T {
    const isFragment = node instanceof DocumentFragment;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const children: Node[] = isFragment ? Array.from((node as any).childNodes as NodeList) : [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const result = originalAppendChild.call(this, node) as any;
    if (isFragment) {
      for (const child of children) scanAndPatchIframes(child);
    } else {
      scanAndPatchIframes(node);
    }

    return result;
  });

  // Wrap Node.prototype.insertBefore
  installOverride(Node.prototype, "insertBefore", function <
    T extends Node,
  >(this: Node, node: T, ref: Node | null): T {
    const isFragment = node instanceof DocumentFragment;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const children: Node[] = isFragment ? Array.from((node as any).childNodes as NodeList) : [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const result = originalInsertBefore.call(this, node, ref) as any;
    if (isFragment) {
      for (const child of children) scanAndPatchIframes(child);
    } else {
      scanAndPatchIframes(node);
    }

    return result;
  });

  // Wrap Node.prototype.replaceChild
  installOverride(Node.prototype, "replaceChild", function <
    T extends Node,
  >(this: Node, node: Node, old: T): T {
    const isFragment = node instanceof DocumentFragment;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const children: Node[] = isFragment ? Array.from((node as any).childNodes as NodeList) : [];
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
    const result = originalReplaceChild.call(this, node, old) as any;
    if (isFragment) {
      for (const child of children) scanAndPatchIframes(child);
    } else {
      scanAndPatchIframes(node);
    }

    return result;
  });

  // Wrap Element.prototype.append
  installOverride(
    Element.prototype,
    "append",
    function (this: Element, ...nodes: (Node | string)[]): void {
      originalAppend.apply(this, nodes);
      for (const n of nodes) {
        if (n instanceof Node) scanAndPatchIframes(n);
      }
    }
  );

  // Wrap Element.prototype.prepend
  installOverride(
    Element.prototype,
    "prepend",
    function (this: Element, ...nodes: (Node | string)[]): void {
      originalPrepend.apply(this, nodes);
      for (const n of nodes) {
        if (n instanceof Node) scanAndPatchIframes(n);
      }
    }
  );

  // Wrap Element.prototype.replaceWith
  installOverride(
    Element.prototype,
    "replaceWith",
    function (this: Element, ...nodes: (Node | string)[]): void {
      originalReplaceWith.apply(this, nodes);
      for (const n of nodes) {
        if (n instanceof Node) scanAndPatchIframes(n);
      }
    }
  );

  // Wrap Element.prototype.insertAdjacentElement
  installOverride(
    Element.prototype,
    "insertAdjacentElement",
    function (this: Element, position: InsertPosition, element: Element): Element | null {
      const result = originalInsertAdjacentElement.call(this, position, element);
      scanAndPatchIframes(element);
      return result;
    }
  );

  // Wrap Element.prototype.insertAdjacentHTML — parses HTML string which
  // may contain <iframe> elements. After insertion we scan the parent.
  installOverride(
    Element.prototype,
    "insertAdjacentHTML",
    function (this: Element, position: InsertPosition, text: string): void {
      originalInsertAdjacentHTML.call(this, position, text);
      scanAndPatchIframes(this.parentElement ?? this);
    }
  );

  // Wrap innerHTML setter — arkenfox uses div.innerHTML = `<iframe>` then
  // appends the div. We intercept innerHTML to patch iframes immediately.
  const innerHTMLDesc = Object.getOwnPropertyDescriptor(Element.prototype, "innerHTML");
  if (innerHTMLDesc?.set) {
    // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: re-bound via .call(this) inside the wrapper
    const originalInnerHTMLSet = innerHTMLDesc.set;

    const innerHTMLSetter = stripConstruct(function (this: Element, value: string) {
      originalInnerHTMLSet.call(this, value);
      scanAndPatchIframes(this);
    });
    registerOverride(innerHTMLSetter, "innerHTML");
    disguiseAsNative(innerHTMLSetter, "innerHTML", 1);
    Object.defineProperty(Element.prototype, "innerHTML", {
      // eslint-disable-next-line @typescript-eslint/unbound-method -- intentional: passing original getter descriptor to Object.defineProperty
      get: innerHTMLDesc.get,
      set: innerHTMLSetter,
      configurable: innerHTMLDesc.configurable,
      enumerable: innerHTMLDesc.enumerable,
    });
  }

  // Fallback: MutationObserver for edge cases (e.g., iframes created by
  // browser internals or patterns we haven't wrapped).
  const iframeObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        scanAndPatchIframes(node);
      }
    }
  });

  if (document.documentElement) {
    iframeObserver.observe(document.documentElement, { childList: true, subtree: true });
  }
}
