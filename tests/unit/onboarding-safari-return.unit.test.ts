/**
 * Source-level guards for the hosted Safari activation -> native onboarding
 * handoff. The repository has no wired Swift test target, so these assertions
 * keep the website URL, SceneDelegate route, one-shot app router, and onboarding
 * destination from silently drifting apart.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = join(__dirname, "..", "..");
const sceneDelegate = readFileSync(
  join(ROOT, "safari", "iOS (App)", "SceneDelegate.swift"),
  "utf8"
);
const appRouter = readFileSync(
  join(ROOT, "safari", "Shared (App)", "ProPaywallView.swift"),
  "utf8"
);
const onboarding = readFileSync(
  join(ROOT, "safari", "Shared (App)", "SpoofDetailsView.swift"),
  "utf8"
);
const activationPage = readFileSync(
  join(ROOT, "site", "src", "routes", "{-$locale}.activate.tsx"),
  "utf8"
);
const safariReadyStart = onboarding.indexOf("private struct OnboardingSafariReadyView");
const safariReadyEnd = onboarding.indexOf("\n}\n#endif", safariReadyStart);
const safariReadyView = onboarding.slice(safariReadyStart, safariReadyEnd);
/**
 * The same view with comment lines dropped, for assertions about copy that must
 * *not* appear. Comments in this file explain which phrasings were rejected and
 * why, so matching against raw source would flag the explanation as the offence.
 */
const safariReadyCode = safariReadyView
  .split("\n")
  .filter((line) => !line.trim().startsWith("//"))
  .join("\n");

describe("Safari onboarding return contract", () => {
  it("keeps the hosted return URL aligned with SceneDelegate", () => {
    expect(activationPage).toContain(
      'const APP_RETURN_URL = "geospoof://onboarding/safari-complete"'
    );
    expect(sceneDelegate).toContain('ctx.url.scheme == "geospoof"');
    expect(sceneDelegate).toContain('ctx.url.host == "onboarding"');
    expect(sceneDelegate).toContain('ctx.url.path == "/safari-complete"');
  });

  it("routes both cold and warm URL opens through the same handler", () => {
    expect(sceneDelegate.match(/handleDeepLinks\(/g)?.length).toBe(3);
    expect(sceneDelegate).toContain("handleDeepLinks(connectionOptions.urlContexts)");
    expect(sceneDelegate).toContain("handleDeepLinks(URLContexts)");
  });

  it("uses a consumable process-local request instead of persisted completion", () => {
    expect(appRouter).toContain(
      "@Published private(set) var safariOnboardingCompletionRequested = false"
    );
    expect(appRouter).toContain("func requestSafariOnboardingCompletion()");
    expect(appRouter).toContain("func consumeSafariOnboardingCompletion() -> Bool");
    expect(appRouter).toContain("safariOnboardingCompletionRequested = false");
    expect(sceneDelegate).toContain("router.requestSafariOnboardingCompletion()");
  });

  it("closes onboarding immediately after verified Safari success", () => {
    expect(onboarding).toContain("[.welcome, .location, .enable, .safariReady]");
    expect(onboarding).toContain("OnboardingSafariReadyView(");
    expect(onboarding).toContain("onFinish: onDone");
    expect(onboarding).not.toContain("onLearnAboutGPS: showGPSDetails");
  });

  it("names all three location layers on the close screen", () => {
    expect(safariReadyView).toContain('Text("Safari is ready")');
    expect(safariReadyView).toContain('Text("Start using GeoSpoof")');

    // Customers conflate browser geolocation, device GPS, and IP location —
    // partly because the store listing sells browser spoofing as "fake your GPS
    // location". This screen is the first place the app can separate them, so
    // losing a row silently reintroduces the confusion it exists to fix.
    expect(safariReadyView).toContain('Text("Safari location & timezone")');
    expect(safariReadyView).toContain('title: "Device GPS"');
    expect(safariReadyView).toContain('title: "IP address"');

    // Each row says what would move it. The Mac requirement especially: it is
    // what produces refunds when discovered only after purchase.
    expect(safariReadyView).toContain('detail: "Needs Pro and a Mac"');
    expect(safariReadyView).toContain('detail: "Only a VPN can change this"');

    // The section header names a category, never a capability. GeoSpoof does
    // change device GPS with Pro and a Mac, so any header phrased as "GeoSpoof
    // doesn't change these" contradicts the product to the customer who bought it
    // for exactly that.
    expect(safariReadyView).toContain('Text("Other location signals")');
    expect(safariReadyCode).not.toMatch(/GeoSpoof (doesn't|does not) change/);

    // "Device GPS" is the app's own term for this layer. The GPS tab uses it too,
    // and the two must not drift into separate vocabularies.
    expect(onboarding).toContain('Text("Device GPS")');
  });

  it("opens Device GPS as a sheet, and closes it before the paywall", () => {
    // A sheet, not a push: the close screen hides its navigation bar, so a pushed
    // detail would strand the user with no way back.
    expect(safariReadyView).toContain("adaptiveModalCover(isPresented: $showDeviceGps)");
    expect(safariReadyView).not.toContain("NavigationLink");

    // The paywall is presented by RootView, which also hosts this flow, so the
    // sheet has to come down first or one modal stacks on the other.
    expect(safariReadyView).toMatch(/showDeviceGps = false\s*\n\s*router\.showPaywall = true/);
  });

  it("shares one Device GPS pitch between onboarding and the GPS tab", () => {
    // Same explanation, same person, two moments — a customer who reads both must
    // not find two different accounts of what they would be buying.
    expect(onboarding).toContain("struct DeviceGpsPitch");
    expect(onboarding).toContain("struct DeviceGpsSheet");
    expect(sceneDelegate).toContain("DeviceGpsPitch { router.showPaywall = true }");
    expect(sceneDelegate).toContain("DeviceGpsPitch.point(text)");
  });

  it("passes the native Safari UI generation to the activation page", () => {
    expect(onboarding).toContain("if #available(iOS 26.0, *)");
    expect(onboarding).toContain('URLQueryItem(name: "safari_ui", value: safariUI)');
    expect(activationPage).toContain("resolveSafariSetupVariant");
    expect(activationPage).toContain("safari_ui");
  });

  it("ships the shared Apple page-control glyph used by both variants", () => {
    expect(existsSync(join(ROOT, "site", "public", "images", "support", "page-menu-ios.png"))).toBe(
      true
    );
  });
});
