/**
 * Unit tests for the popup i18n override layer: getMessage-faithful placeholder
 * substitution, and the fetched-catalog override that lets the popup render a
 * language other than the browser UI locale.
 */

import { describe, test, expect, beforeEach, vi } from "vitest";
import { substitutePlaceholders, initI18n, resetI18nOverride, t } from "@/popup/i18n";

const RU = {
  greeting: { message: "Привет" },
  detected: {
    message: "IP: $IP$",
    placeholders: { ip: { content: "$1" } },
  },
};

const EN = {
  greeting: { message: "Hello" },
  onlyInEnglish: { message: "English only" },
  detected: {
    message: "IP: $IP$",
    placeholders: { ip: { content: "$1" } },
  },
};

/** Route fetch to the right catalog by the locale segment in the URL. */
function mockCatalogFetch() {
  const fetchMock = vi.fn((url: string) => {
    const body = url.includes("/ru/") ? RU : url.includes("/en/") ? EN : null;
    return Promise.resolve({
      ok: body !== null,
      json: () => Promise.resolve(body),
    } as Response);
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  return fetchMock;
}

describe("substitutePlaceholders", () => {
  test("resolves a named placeholder to its positional content", () => {
    expect(
      substitutePlaceholders({ message: "IP: $IP$", placeholders: { ip: { content: "$1" } } }, [
        "203.0.113.42",
      ])
    ).toBe("IP: 203.0.113.42");
  });

  test("named placeholder match is case-insensitive", () => {
    expect(
      substitutePlaceholders(
        { message: "Value: $Val$", placeholders: { val: { content: "$1" } } },
        ["x"]
      )
    ).toBe("Value: x");
  });

  test("substitutes bare positional references", () => {
    expect(substitutePlaceholders({ message: "$1 and $2" }, ["a", "b"])).toBe("a and b");
  });

  test("accepts a single string substitution", () => {
    expect(substitutePlaceholders({ message: "Hi $1" }, "there")).toBe("Hi there");
  });

  test("missing substitution becomes an empty string", () => {
    expect(substitutePlaceholders({ message: "[$1]" })).toBe("[]");
  });

  test("unescapes $$ to a literal $", () => {
    expect(substitutePlaceholders({ message: "Cost: $$5" })).toBe("Cost: $5");
  });
});

describe("initI18n override", () => {
  let fetchMock: ReturnType<typeof mockCatalogFetch>;

  beforeEach(() => {
    resetI18nOverride();
    fetchMock = mockCatalogFetch();
  });

  test("t() returns strings from the active override catalog", async () => {
    await initI18n("ru");
    expect(t("greeting")).toBe("Привет");
  });

  test("t() falls back to the English catalog for keys missing in the override", async () => {
    await initI18n("ru");
    expect(t("onlyInEnglish")).toBe("English only");
  });

  test("t() applies substitutions through the override catalog", async () => {
    await initI18n("ru");
    expect(t("detected", ["1.2.3.4"])).toBe("IP: 1.2.3.4");
  });

  test("resetI18nOverride() drops the override (native path yields empty in tests)", async () => {
    await initI18n("ru");
    expect(t("greeting")).toBe("Привет");
    resetI18nOverride();
    // No browser.i18n mock in tests, so the native path returns "".
    expect(t("greeting")).toBe("");
  });

  test("a failed catalog fetch clears the override rather than blanking permanently", async () => {
    global.fetch = vi.fn(() =>
      Promise.resolve({ ok: false, json: () => Promise.resolve(null) } as Response)
    );
    await initI18n("ru");
    // Override not activated; t() defers to the (empty in tests) native path.
    expect(t("greeting")).toBe("");
  });

  test("re-requesting the active locale is a no-op (no extra fetches)", async () => {
    await initI18n("ru");
    const callsAfterFirst = fetchMock.mock.calls.length;
    await initI18n("ru");
    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });
});
