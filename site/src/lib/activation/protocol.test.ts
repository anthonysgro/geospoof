import { describe, expect, it } from "vitest"

import {
  ACTIVATION_EXTENSION_SOURCE,
  ACTIVATION_PING_EVENT,
  ACTIVATION_PROTOCOL_VERSION,
  ACTIVATION_READY_EVENT,
  ACTIVATION_READY_TYPE,
  detectActivationBrowser,
  isActivationReadyMessage,
  makeActivationPing,
  resolveSafariSetupVariant,
} from "./protocol"

describe("activation protocol", () => {
  it("uses stable versioned DOM event channels", () => {
    expect(ACTIVATION_PING_EVENT).toBe("geospoof:activation-ping:v2")
    expect(ACTIVATION_READY_EVENT).toBe("geospoof:activation-ready:v2")
  })

  it("builds a minimal nonce-bound ping", () => {
    expect(makeActivationPing("request-123")).toEqual({
      source: "com.geospoof.activation-page",
      type: "GEOSPOOF_ACTIVATION_PING",
      protocolVersion: 2,
      nonce: "request-123",
    })
  })

  it("accepts only the matching extension response", () => {
    const message = {
      source: ACTIVATION_EXTENSION_SOURCE,
      type: ACTIVATION_READY_TYPE,
      protocolVersion: ACTIVATION_PROTOCOL_VERSION,
      nonce: "request-123",
    }

    expect(isActivationReadyMessage(message, "request-123")).toBe(true)
    expect(isActivationReadyMessage(message, "different-request")).toBe(false)
    expect(
      isActivationReadyMessage(
        { ...message, protocolVersion: 1 },
        "request-123"
      )
    ).toBe(false)
    expect(
      isActivationReadyMessage(
        { ...message, source: "another-extension" },
        "request-123"
      )
    ).toBe(false)
  })
})

describe("activation browser detection", () => {
  it("recognizes Mobile Safari", () => {
    expect(
      detectActivationBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        "iPhone",
        5
      )
    ).toBe("safari")
  })

  it("does not mistake iOS Chrome for Safari", () => {
    expect(
      detectActivationBrowser(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 CriOS/140.0 Mobile/15E148 Safari/604.1",
        "iPhone",
        5
      )
    ).toBe("other-ios")
  })

  it("recognizes iPadOS when it reports a Mac platform", () => {
    expect(
      detectActivationBrowser(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1",
        "MacIntel",
        5
      )
    ).toBe("safari")
  })

  it("routes desktop Chrome to the non-Safari fallback", () => {
    expect(
      detectActivationBrowser(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36",
        "MacIntel",
        0
      )
    ).toBe("other")
  })

  it("separates desktop Safari from mobile Safari", () => {
    // No touch points and no Mobile token: a real Mac, which cannot follow any of
    // the tap-based instructions this page renders.
    expect(
      detectActivationBrowser(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/18.0 Safari/605.1.15",
        "MacIntel",
        0
      )
    ).toBe("safari-desktop")
  })
})

describe("Safari setup variant", () => {
  const ios18UserAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1"
  const ios26UserAgent =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 Version/26.0 Mobile/15E148 Safari/604.1"

  it("prefers the native app hint over user-agent detection", () => {
    expect(resolveSafariSetupVariant("18", ios26UserAgent)).toBe("ios18")
    expect(resolveSafariSetupVariant("26", ios18UserAgent)).toBe("ios26")
  })

  it("recognizes iPhone and iPadOS 18 user agents on direct visits", () => {
    expect(resolveSafariSetupVariant(null, ios18UserAgent)).toBe("ios18")
    expect(
      resolveSafariSetupVariant(
        null,
        "Mozilla/5.0 (iPad; CPU OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1"
      )
    ).toBe("ios18")
  })

  it("uses current instructions for modern or unidentifiable browsers", () => {
    expect(resolveSafariSetupVariant(undefined, ios26UserAgent)).toBe("ios26")
    expect(resolveSafariSetupVariant("unexpected", "")).toBe("ios26")
  })
})
