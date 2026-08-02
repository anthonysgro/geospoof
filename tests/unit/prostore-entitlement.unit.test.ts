/**
 * Source-level invariants for ProStore's entitlement handling.
 *
 * These encode bugs found from a TestFlight report ("I paid and it still doesn't
 * show Pro", "founder status appears in TestFlight, which shouldn't happen").
 * None of them are visible at compile time, and the Swift test target is not
 * wired into the project, so this guards them from the outside.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const SRC = join(__dirname, "..", "..", "safari", "Shared (App)", "ProStore.swift");
const swift = readFileSync(SRC, "utf8");

/** Body of a `func name(...)` up to the next same-indentation closing brace. */
function funcBody(signature: string): string {
  const start = swift.indexOf(signature);
  expect(start, `${signature} not found — renamed?`).toBeGreaterThan(-1);
  const end = swift.indexOf("\n    }", start);
  expect(end).toBeGreaterThan(start);
  return swift.slice(start, end);
}

describe("lastError lifecycle", () => {
  // The paywall renders `store.lastError` inline for as long as it is non-nil.
  // It used to have five writes and zero clears, so a stale
  // `.appStoreUnreachable` from a timed-out Restore sat on the paywall through a
  // later *successful* purchase — the user saw Apple's "purchase completed"
  // alert and "couldn't reach the App Store" simultaneously.
  it.each([
    ["func loadProducts() async {", "loadProducts"],
    ["func purchase(_ product: Product) async -> Bool {", "purchase"],
    ["func restore() async {", "restore"],
  ])("%s clears lastError before starting", (signature) => {
    expect(funcBody(signature)).toContain("lastError = nil");
  });

  it("still has somewhere to report failures from", () => {
    const writes = [...swift.matchAll(/lastError = \.(\w+)/g)].map((m) => m[1]);
    expect(writes).toContain("appStoreUnreachable");
    expect(writes).toContain("purchaseUnverified");
  });

  it("does not surface a sync timeout when entitlements resolved anyway", () => {
    // AppStore.sync() timing out is routine in the sandbox. If the entitlement
    // scan still found Pro, the warning contradicts what the user can see.
    const body = funcBody("func restore() async {");
    const guarded = /if\s+!didSync\s*\{[\s\S]*?if\s+isPro\s*\{/.test(body);
    expect(guarded, "the !didSync branch must check isPro before setting lastError").toBe(true);
    // and the scan has to happen before that decision
    expect(body.indexOf("await refreshEntitlements()")).toBeLessThan(
      body.indexOf("lastError = .appStoreUnreachable")
    );
  });
});

describe("entitlements are rescanned on foreground", () => {
  const body = funcBody("private func appBecameActive() {");

  it("calls refreshEntitlements", () => {
    // Without this, a purchase that lands while backgrounded (Ask-to-Buy, SCA,
    // or sandbox lag) is never picked up: Transaction.updates does not re-yield
    // a transaction we already finished, so the unlock waited for a cold launch.
    expect(body).toContain("refreshEntitlements()");
  });

  // Match the executable guard statements, not any mention of them — the
  // explanatory comments name both guards above the call site.
  const code = body
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");

  it("rescans BEFORE the founder-suppression guard", () => {
    // founderSuppressedByEnvironment is latched on for the whole session in
    // TestFlight. A rescan placed after that guard would never run in exactly
    // the builds where this bug was reported.
    const rescan = code.indexOf("refreshEntitlements()");
    const guard = code.indexOf("if self.founderSuppressedByEnvironment { return }");
    expect(rescan).toBeGreaterThan(-1);
    expect(guard).toBeGreaterThan(-1);
    expect(
      rescan,
      "refreshEntitlements() must come before the founderSuppressedByEnvironment guard"
    ).toBeLessThan(guard);
  });

  it("rescans before the debug-override guard too", () => {
    const rescan = code.indexOf("refreshEntitlements()");
    const guard = code.indexOf("if self.debugProOverride() != .auto { return }");
    expect(guard).toBeGreaterThan(-1);
    expect(rescan).toBeLessThan(guard);
  });
});

describe("sandbox environment latch", () => {
  it("is written when a verified transaction proves non-production", () => {
    expect(swift).toMatch(/cache\.set\(true, forKey: Key\.sandboxEnvironment\)/);
  });

  it("is applied synchronously in init, before any async resolution", () => {
    const init = swift.slice(
      swift.indexOf("private init() {"),
      swift.indexOf("updatesTask = listenForTransactions()")
    );
    expect(
      init,
      "init must apply the latch, or the first frame shows a cached production " +
        "grant and hides the paywall for the whole session"
    ).toContain("cache.bool(forKey: Key.sandboxEnvironment)");
    expect(init).toContain("founderSuppressedByEnvironment = true");
  });

  it("is cleared only by a verified production transaction", () => {
    expect(swift).toMatch(/cache\.set\(false, forKey: Key\.sandboxEnvironment\)/);
  });

  it("never persists a false founder grant", () => {
    // suppressFounderForNonProduction must not write `false` to the founder key
    // or the cloud rails — a real production grant on this device has to survive.
    const body = funcBody("private func suppressFounderForNonProduction() {");
    expect(body).not.toMatch(/cache\.set\(false, forKey: Key\.isFounder\)/);
    expect(body).not.toMatch(/cloud\.set\(false/);
  });
});

describe("diagnostics use a level that actually emits", () => {
  // AppLogger.info/debug/trace are gated behind AppLogGate.allows(), which reads
  // `app_log_enabled` from UserDefaults and defaults to FALSE. Only error and
  // warn always emit. So anything needed to diagnose a failure must not be at
  // info level, or it is invisible in exactly the situation it exists for.
  it("reports a purchase that did not unlock at error level", () => {
    const body = funcBody("func purchase(_ product: Product) async -> Bool {");
    const at = body.indexOf("PURCHASE DID NOT UNLOCK");
    expect(at, "the did-not-unlock diagnostic is missing").toBeGreaterThan(-1);
    const line = body.slice(body.lastIndexOf("Log.pro", at), at);
    expect(line, "must be error/warn — info is gated off by default").toMatch(
      /Log\.pro\.(error|warn)/
    );
  });

  it("reports accepted-nothing entitlement scans at warn level", () => {
    const body = funcBody("func refreshEntitlements() async {");
    const at = body.indexOf("none were accepted");
    expect(at).toBeGreaterThan(-1);
    const line = body.slice(body.lastIndexOf("Log.pro", at), at);
    expect(line).toMatch(/Log\.pro\.(error|warn)/);
  });

  it("still logs the routine success case at info", () => {
    // The happy path is high-volume-ish and not a diagnostic, so it stays gated.
    expect(swift).toMatch(/Log\.pro\.info\("Post-purchase state: isPro=true/);
  });
});

describe("purchase diagnostics survive Release", () => {
  // TestFlight and App Review builds are Release. DEBUG-gating the diagnostics
  // meant the only builds that could be diagnosed were the ones that never
  // exhibit the problem.
  it.each([
    "refreshEntitlements: seen=",
    "Post-purchase state:",
    "Purchase pending for",
    "Purchase userCancelled for",
  ])("%s is logged unconditionally", (needle) => {
    const at = swift.indexOf(needle);
    expect(at, `${needle} not found`).toBeGreaterThan(-1);
    // Walk back to the nearest #if DEBUG / #endif and make sure the log is not
    // inside a DEBUG-only region.
    const before = swift.slice(0, at);
    const lastIf = before.lastIndexOf("#if DEBUG");
    const lastEndif = before.lastIndexOf("#endif");
    expect(lastIf < lastEndif || lastIf === -1, `${needle} sits inside a #if DEBUG block`).toBe(
      true
    );
  });

  it("keeps the unverified-transaction escape hatch DEBUG-only", () => {
    // The opposite direction: accepting an unverified transaction must NEVER
    // compile into a release build.
    const body = funcBody("    ) -> StoreKit.Transaction? {");
    expect(body).toContain("#if DEBUG");
    const at = body.indexOf("return transaction\n            #else");
    expect(
      at,
      "the unverified branch must return the transaction only under #if DEBUG"
    ).toBeGreaterThan(-1);
  });
});

describe("pending purchases are reported", () => {
  const paywall = readFileSync(
    join(__dirname, "..", "..", "safari", "Shared (App)", "ProPaywallView.swift"),
    "utf8"
  );

  it("StoreKit's .pending sets a user-visible state", () => {
    // Returning false silently is what produced "it let me pay and nothing
    // happened" — the paywall stayed unchanged after an authorised payment.
    const body = funcBody("func purchase(_ product: Product) async -> Bool {");
    const pendingAt = body.indexOf("case .pending:");
    expect(pendingAt).toBeGreaterThan(-1);
    const arm = body.slice(pendingAt, body.indexOf("return false", pendingAt));
    expect(arm).toContain("lastError = .purchasePending");
  });

  it("is classified as informational, not a failure", () => {
    expect(swift).toMatch(/var isInformational: Bool \{ self == \.purchasePending \}/);
  });

  it("is rendered in the neutral style rather than red", () => {
    // Red would tell the user something broke when the payment is simply
    // awaiting approval.
    expect(paywall).toContain("err.isInformational");
    const render = paywall.slice(
      paywall.indexOf("if let err = store.lastError {"),
      paywall.indexOf("restoreButton")
    );
    expect(render).toContain("isInformational");
    expect(render).toContain(".red");
  });

  it("has copy for every case the store can set", () => {
    const cases = [...swift.matchAll(/lastError = \.(\w+)/g)].map((m) => m[1]);
    for (const c of new Set(cases)) {
      if (c === "system") continue;
      expect(paywall, `ProStoreError.text has no arm for .${c}`).toContain(`case .${c}:`);
    }
  });
});

describe("the Pro gate stays observable", () => {
  it("every input to isPro is @Published", () => {
    // isPro is computed, so the paywall's .onChange(of: store.isPro) only fires
    // if its inputs publish. If one loses @Published the paywall silently stops
    // dismissing after a successful purchase.
    const gate = swift.match(/var isPro: Bool \{([^}]*)\}/);
    expect(gate).toBeTruthy();
    const inputs = ["isFounder", "ownsLifetime", "activeProductIDs"];
    for (const name of inputs) {
      expect(gate![1], `isPro should read ${name}`).toContain(name);
      expect(swift, `${name} feeds isPro, so it must be @Published`).toMatch(
        new RegExp(`@Published[^\\n]*\\b${name}\\b`)
      );
    }
  });

  it("gates on product identifiers, never on localized text", () => {
    // A localized displayName in the gate would make Pro status depend on the
    // device language.
    const gate = swift.match(/var isPro: Bool \{([^}]*)\}/)![1];
    expect(gate).not.toContain("displayName");
    const status = swift.slice(
      swift.indexOf("var status: ProStatus {"),
      swift.indexOf("/// True while an auto-renewable subscription")
    );
    expect(status).not.toContain("displayName");
  });
});
