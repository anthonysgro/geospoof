/**
 * Public, data-minimal handshake used by geospoof.com/activate to confirm that
 * the GeoSpoof MAIN-world spoofing engine is installed, configured, and active
 * on that page. Keep these wire values in parity with
 * site/src/lib/activation/protocol.ts.
 */
export const ACTIVATION_PROTOCOL_VERSION = 2 as const;
export const ACTIVATION_PAGE_SOURCE = "com.geospoof.activation-page" as const;
export const ACTIVATION_EXTENSION_SOURCE = "com.moonloaf.geospoof.extension" as const;
export const ACTIVATION_PING_TYPE = "GEOSPOOF_ACTIVATION_PING" as const;
export const ACTIVATION_READY_TYPE = "GEOSPOOF_ACTIVATION_READY" as const;
/**
 * DOM-event transport used by Safari. WebKit can preserve an extension
 * execution realm on same-window postMessage events, which makes the page and
 * extension disagree about MessageEvent.source/origin even though both scripts
 * run against the same document. CustomEvent already forms GeoSpoof's proven
 * Safari page-world bridge for settings, so activation uses it as the primary
 * transport and retains postMessage as a cross-browser fallback.
 */
export const ACTIVATION_PING_EVENT = "geospoof:activation-ping:v2" as const;
export const ACTIVATION_READY_EVENT = "geospoof:activation-ready:v2" as const;

export interface ActivationPingMessage {
  source: typeof ACTIVATION_PAGE_SOURCE;
  type: typeof ACTIVATION_PING_TYPE;
  protocolVersion: typeof ACTIVATION_PROTOCOL_VERSION;
  nonce: string;
}

export interface ActivationReadyMessage {
  source: typeof ACTIVATION_EXTENSION_SOURCE;
  type: typeof ACTIVATION_READY_TYPE;
  protocolVersion: typeof ACTIVATION_PROTOCOL_VERSION;
  nonce: string;
}

export function isActivationPingMessage(value: unknown): value is ActivationPingMessage {
  if (typeof value !== "object" || value === null) return false;

  const candidate = value as Record<string, unknown>;
  return (
    candidate.source === ACTIVATION_PAGE_SOURCE &&
    candidate.type === ACTIVATION_PING_TYPE &&
    candidate.protocolVersion === ACTIVATION_PROTOCOL_VERSION &&
    typeof candidate.nonce === "string" &&
    candidate.nonce.length >= 16 &&
    candidate.nonce.length <= 128 &&
    /^[A-Za-z0-9_-]+$/.test(candidate.nonce)
  );
}

export function makeActivationReady(nonce: string): ActivationReadyMessage {
  return {
    source: ACTIVATION_EXTENSION_SOURCE,
    type: ACTIVATION_READY_TYPE,
    protocolVersion: ACTIVATION_PROTOCOL_VERSION,
    nonce,
  };
}
