import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("activation handshake execution boundary", () => {
  it("is installed by the MAIN-world engine, never by the isolated relay", () => {
    const root = resolve(import.meta.dirname, "../../..");
    const isolatedEntry = readFileSync(resolve(root, "src/content/index.ts"), "utf8");
    const mainEntry = readFileSync(resolve(root, "src/content/injected/index.ts"), "utf8");

    expect(isolatedEntry).not.toContain("installActivationResponder");
    expect(mainEntry).toContain("import { installActivationResponder }");
    expect(mainEntry).toContain("settingsReceived && spoofingEnabled && spoofedLocation !== null");
  });
});
