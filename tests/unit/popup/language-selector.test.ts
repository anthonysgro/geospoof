/**
 * Verifies the Advanced-section language selector is present in popup.html with
 * the "System" (follow-browser) option shipped in markup. The remaining locale
 * options are appended at runtime from SUPPORTED_UI_LOCALES, so only the System
 * option is asserted here.
 */

import { describe, test, expect, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

describe("Popup language selector", () => {
  let document: Document;

  beforeEach(() => {
    const html = fs.readFileSync(path.join(__dirname, "../../../assets/popup.html"), "utf8");
    document = new DOMParser().parseFromString(html, "text/html");
  });

  test("has a #languageSelect dropdown", () => {
    const select = document.querySelector<HTMLSelectElement>("#languageSelect");
    expect(select).toBeTruthy();
    expect(select!.tagName.toLowerCase()).toBe("select");
  });

  test("ships the System option with the follow-browser value and i18n key", () => {
    const options = document.querySelectorAll<HTMLOptionElement>("#languageSelect option");
    // Only the System option is in markup; locale options are added at runtime.
    expect(options.length).toBe(1);

    const system = options[0];
    expect(system.value).toBe("");
    expect(system.getAttribute("data-i18n")).toBe("advanced_language_system");
  });

  test("has a translated label bound to advanced_language", () => {
    const label = document.querySelector(
      'label[for="languageSelect"] [data-i18n="advanced_language"]'
    );
    expect(label).toBeTruthy();
  });
});
