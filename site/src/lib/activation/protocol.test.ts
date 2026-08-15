import { describe, expect, it } from "vitest"

import {
  ACTIVATION_EXTENSION_SOURCE,
  ACTIVATION_PROTOCOL_VERSION,
  ACTIVATION_READY_TYPE,
  detectActivationBrowser,
  isActivationReadyMessage,
  makeActivationPing,
} from "./protocol"

describe("activation protocol", () => {
  it("builds a minimal nonce-bound ping", () => {
    expect(makeActivationPing("request-123")).toEqual({
      source: "com.geospoof.activation-page",
      type: "GEOSPOOF_ACTIVATION_PING",
      protocolVersion: 1,
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
})
