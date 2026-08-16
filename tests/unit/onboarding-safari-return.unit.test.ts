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

  it("closes on the three location layers, not just the Safari one", () => {
    expect(safariReadyView).toContain('Text("Safari is ready")');
    expect(safariReadyView).toContain('Text("Start using GeoSpoof")');

    // All three layers are named. Customers conflate them because the store
    // listing sells browser spoofing as "fake your GPS location", so this screen
    // is the first place the app can separate them — losing a row silently
    // reintroduces the confusion it exists to fix.
    expect(safariReadyView).toContain('title: "Safari location & timezone"');
    expect(safariReadyView).toContain('title: "This iPhone\'s GPS"');
    expect(safariReadyView).toContain('title: "Your IP address"');

    // The two layers GeoSpoof does not move must say why, on the row itself. The
    // Mac requirement in particular is what causes refunds when it is discovered
    // only after purchase.
    expect(safariReadyView).toContain('.unchanged("Needs Pro and a Mac")');
    expect(safariReadyView).toContain('.unchanged("Only a VPN can change this")');

    // Rows stay non-interactive: pushing a Pro screen from inside onboarding
    // would end the flow at a paywall, and this screen is terminal.
    expect(safariReadyView).not.toContain("NavigationLink");
    expect(safariReadyView).not.toContain("ProDetailView");
    expect(safariReadyView).not.toContain("showPaywall");
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
