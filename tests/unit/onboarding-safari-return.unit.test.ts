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
/**
 * The activation URL is assembled in `AppLink`, not in the view that opens it.
 * Read separately so the `safari_ui` assertion can follow it there — it used to be
 * built inline in the onboarding view, and asserting against that file kept passing
 * vacuously right up until the code moved, then failed for the wrong reason.
 */
const model = readFileSync(join(ROOT, "safari", "Shared (App)", "SpoofModel.swift"), "utf8");
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
    //
    // The Device GPS detail is now conditional on ownership — an owner is missing only
    // the Mac — so both branches are asserted rather than a single literal `detail:`.
    // The non-owner branch is the one carrying the refund-relevant claim, and the owner
    // branch has to stay a shared constant so the row and the sheet behind it agree.
    expect(safariReadyView).toContain('"Needs Pro and a Mac"');
    expect(safariReadyView).toContain("DeviceGpsPitch.ownedNeedsMac");
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
    //
    // A plain `.sheet` rather than `adaptiveModalCover`, which is the deliberate
    // choice recorded beside the call: that presenter sends iPad to a fullscreen
    // cover, and this content is a header, three lines and a button, so the cover
    // is mostly empty. `explainerSheetPresentation()` is what sizes it instead, so
    // it is asserted here — without it the sheet reverts to a full-height card and
    // the reason for leaving `adaptiveModalCover` is silently undone.
    expect(safariReadyView).toContain(".sheet(isPresented: $showDeviceGps)");
    expect(safariReadyView).toContain("explainerSheetPresentation()");
    expect(safariReadyCode).not.toContain("adaptiveModalCover");
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

    // The GPS tab embeds the whole pitch view rather than reassembling it from
    // parts. That is what makes divergence structurally impossible, and it is why
    // the old assertion on a `DeviceGpsPitch.point(text)` call site no longer holds:
    // the per-line helper became `PitchPoint` and is now used *inside* the pitch,
    // so the tab has nothing left to get wrong.
    expect(sceneDelegate).toContain("DeviceGpsPitch { router.showPaywall = true }");
    expect(sceneDelegate).toContain("Text(DeviceGpsPitch.compatibilityCaveat)");
    expect(onboarding).toContain("struct PitchPoint");
    expect(onboarding).toMatch(/PitchPoint\("/);
  });

  it("passes the native Safari UI generation to the activation page", () => {
    // Built in `AppLink`, not in the view — see the `model` read above.
    expect(model).toContain("if #available(iOS 26.0, *)");
    expect(model).toContain('URLQueryItem(name: "safari_ui", value: safariUI)');
    expect(activationPage).toContain("resolveSafariSetupVariant");
    expect(activationPage).toContain("safari_ui");
  });

  it("names the same page control in the app as the page it hands off to", () => {
    // The app used to say "page menu" on every OS while the page it opens branched
    // on `safari_ui`, so anyone below iOS 26 read one control name in the app and a
    // different one on the page. Both sides now gate on the same availability check.
    //
    // Asserted as a pair deliberately: either name alone is correct for one cohort
    // and wrong for the other, and the pre-26.2 route spans both.
    expect(onboarding).toContain('return "Tap the page menu"');
    expect(onboarding).toContain('return "Tap Page Settings"');
    expect(activationPage).toContain("waiting.pageSettings");
  });

  it("ships the shared Apple page-control glyph used by both variants", () => {
    expect(existsSync(join(ROOT, "site", "public", "images", "support", "page-menu-ios.png"))).toBe(
      true
    );
  });
});
