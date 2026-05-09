/**
 * WebRTC leak battery.
 *
 * WebRTC exposes several independent detection surfaces that a
 * fingerprinting script can use to recover the user's real public
 * IP or LAN layout even when `navigator.geolocation` is spoofed.
 * Each surface has a different mitigation, so coverage needs its
 * own test:
 *
 *   1. Public IP via server-reflexive (srflx) ICE candidate — the
 *      classic vector. STUN binding echoes the public IP back in
 *      the SDP. Mitigated by `disable_non_proxied_udp` (Chromium-
 *      strict) or by overriding `RTCPeerConnection` in the content
 *      script to force `iceTransportPolicy: "relay"`.
 *
 *   2. LAN IP via unobfuscated host candidate — historical leak
 *      before mDNS. Modern engines emit `<uuid>.local` instead of
 *      `192.168.x.y`, but a broken profile or stripped pref can
 *      regress this.
 *
 *   3. Iframe-realm bypass — the parent calls
 *      `iframe.contentWindow.RTCPeerConnection(...)` to bypass
 *      overrides installed on the top-level window.
 *
 *   4. `RTCPeerConnection.getStats()` leak — even when SDP candidate
 *      emission is suppressed, some engines still expose the local
 *      candidate's `address` / `ip` field through stats reports.
 *      A spoofer that only wraps SDP emission misses this.
 *
 * All four tests share the same low-level gathering helpers
 * (`gatherCandidates`, `isPublicAddress`, etc.) and the same
 * detection philosophy: poll `pc.localDescription.sdp` directly,
 * matching the browserleaks probe. Events are treated as hints,
 * not the source of truth, because Firefox can silently drop the
 * `icecandidate` stream while still populating the SDP.
 *
 * ### What counts as a public (leak-worthy) address
 *
 *   - Public IPv4 — any address outside RFC1918 private (10/8,
 *     172.16/12, 192.168/16), loopback (127/8), link-local
 *     (169.254/16), or CGNAT (100.64/10).
 *   - Public IPv6 — any address outside link-local (fe80::/10),
 *     unique local (fc00::/7), or loopback (::1, ::).
 *
 * Non-leaks: `.local` mDNS hostnames, RFC1918 addresses, loopback,
 * link-local, ULA. Relay (TURN) addresses are never configured here
 * so shouldn't appear; if they did they'd be the TURN server's
 * address, not the client's.
 *
 * ### Run-scoped candidate cache
 *
 * Tests #1 and #2 are two views of the *same* top-level gather, so
 * running separate gathers for each would double the runtime for
 * no new information. `getSharedCandidates(ctx)` gathers once per
 * test run (keyed by `ctx.signal`, same pattern as
 * `getSharedPosition`) and hands both tests the same result.
 *
 * Tests #3 (iframe) and #4 (stats API) need their own gather
 * because they probe different surfaces.
 */

import { SkipTestError, buildBehavioralTest } from "../helpers/behavioral"
import type { TestDefinition, TestRunContext } from "../types"

// ---------------------------------------------------------------------------
// Debug logging
// ---------------------------------------------------------------------------

/**
 * Set `window.__GEOSPOOF_WEBRTC_DEBUG__ = true` in DevTools BEFORE the
 * suite runs (then hard-reload so Vite HMR picks up the fresh module)
 * to log every ICE gathering step: constructor config, candidate
 * events, SDP poll results, state transitions, final outcome.
 */
const DEBUG_FORCE = false
function debugEnabled(): boolean {
  if (DEBUG_FORCE) return true
  try {
    const w = globalThis as unknown as { __GEOSPOOF_WEBRTC_DEBUG__?: boolean }
    return w.__GEOSPOOF_WEBRTC_DEBUG__ === true
  } catch {
    return false
  }
}
function log(...args: Array<unknown>): void {
  if (!debugEnabled()) return
   
  console.log("[webrtc-leak]", ...args)
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Max time we spend polling for candidates on a single gather.
 * Runner's per-test ceiling is 10s; 8s leaves headroom for the
 * expected/observe wrapper and final comparison. Firefox's srflx
 * gathering usually lands in 1-3s on a healthy network, so 8s is
 * plenty without tripping the runner's force-kill.
 */
const GATHERING_BUDGET_MS = 8_000

/** How often we re-inspect the SDP for new candidate lines. */
const SDP_POLL_INTERVAL_MS = 500

/**
 * Single Google STUN endpoint — same as browserleaks. Multiple STUN
 * servers serialise binding requests and slow gathering without
 * adding coverage; one public endpoint is the well-tested minimum.
 */
const STUN_URL = "stun:stun.l.google.com:19302"

/** How long to wait for a same-origin iframe's `load` event. */
const IFRAME_LOAD_TIMEOUT_MS = 3_000

// ---------------------------------------------------------------------------
// Parsing / classification
// ---------------------------------------------------------------------------

/**
 * IP-address regex, IPv4 or IPv6, matching anywhere in a line.
 * Adapted from the browserleaks probe — intentionally avoids
 * tokenising SDP by position because implementations differ on
 * whitespace and field ordering.
 */
const IP_EXTRACT =
  /([0-9]{1,3}(\.[0-9]{1,3}){3}|(([0-9a-f]{1,4}:){7}([0-9a-f]{1,4}|:))|(([0-9a-f]{1,4}:){1,7}:)|(([0-9a-f]{1,4}:){1,6}:[0-9a-f]{1,4})|(([0-9a-f]{1,4}:){1,5}(:[0-9a-f]{1,4}){1,2})|(([0-9a-f]{1,4}:){1,4}(:[0-9a-f]{1,4}){1,3})|(([0-9a-f]{1,4}:){1,3}(:[0-9a-f]{1,4}){1,4})|(([0-9a-f]{1,4}:){1,2}(:[0-9a-f]{1,4}){1,5})|([0-9a-f]{1,4}:((:[0-9a-f]{1,4}){1,6}))|(:((:[0-9a-f]{1,4}){1,7}|:)))/i

/** Extract the `typ` field from a candidate line, for reporting. */
const TYP_EXTRACT = /\btyp\s+(\w+)/

interface GatheredCandidate {
  /** Raw SDP candidate line. */
  raw: string
  /** Parsed address field. */
  address: string | undefined
  /** Parsed candidate type: host / srflx / prflx / relay. */
  type: string | undefined
}

interface GatherResult {
  candidates: Array<GatheredCandidate>
  finalGatheringState: string
  finalConnectionState: string
  /**
   * Convenience hook for tests that want to consult `getStats()`
   * against the peer connection after gathering settles. `null`
   * when the pc was closed before stats could be collected.
   */
  stats: RTCStatsReport | null
}

/**
 * Decide whether an address is a public (routable, geolocatable)
 * IP. Non-public: `.local`, RFC1918, loopback, link-local, CGNAT,
 * IPv6 ULA/link-local.
 */
function isPublicAddress(address: string | undefined): boolean {
  if (!address) return false
  if (address.endsWith(".local")) return false

  if (address.includes(":")) {
    const lower = address.toLowerCase()
    if (lower === "::1" || lower === "::") return false
    if (lower.startsWith("fe80:") || lower.startsWith("fe80::")) return false
    if (/^(fc|fd)/.test(lower)) return false
    return true
  }

  const parts = address.split(".").map((p) => Number.parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) {
    return false
  }
  const [a, b] = parts
  if (a === 10) return false
  if (a === 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 100 && b >= 64 && b <= 127) return false // CGNAT
  if (a === 0) return false
  return true
}

/**
 * Decide whether a host-candidate address is a *raw* LAN IP (an
 * unobfuscated RFC1918/loopback/link-local/ULA address). This is
 * the "host-candidate leak" signal: if the browser emits the raw
 * LAN IP rather than a `<uuid>.local` mDNS hostname, a page can
 * enumerate the local network for fingerprinting even without
 * learning the public IP.
 *
 * Returns `true` for addresses that look like an IPv4/IPv6 literal
 * other than a `.local` hostname. Returns `false` for `.local` and
 * anything unparseable.
 */
function isRawLanIp(address: string | undefined): boolean {
  if (!address) return false
  if (address.endsWith(".local")) return false
  if (address.includes(":")) {
    // Any IPv6 literal in a host candidate is an un-obfuscated
    // reveal — mDNS replaces the literal entirely.
    return /^[0-9a-f:]+$/i.test(address)
  }
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(address)
}

/** Extract `{ address, type }` from a single `candidate:...` line. */
function parseCandidateLine(line: string): {
  address: string | undefined
  type: string | undefined
} {
  const ipMatch = IP_EXTRACT.exec(line)
  const address = ipMatch?.[1]
  const typMatch = TYP_EXTRACT.exec(line)
  const type = typMatch?.[1]
  return { address, type }
}

// ---------------------------------------------------------------------------
// Core gathering loop
// ---------------------------------------------------------------------------

/**
 * Drive ICE gathering on a prepared `RTCPeerConnection` and collect
 * every candidate line that appears in the SDP or in an
 * `icecandidate` event within the budget. Closes the peer
 * connection after stats are collected (if requested) so callers
 * don't need to.
 *
 * `collectStats: true` captures `pc.getStats()` after gathering
 * settles so the stats-API-leak test can inspect it. Skipped by
 * default — the two-second stats wait adds latency the other tests
 * don't need.
 */
async function gatherCandidates(
  pc: RTCPeerConnection,
  opts: { collectStats?: boolean } = {},
): Promise<GatherResult> {
  const collected: Array<GatheredCandidate> = []
  const seenLines = new Set<string>()

  const ingestLine = (
    line: string,
    source: "event" | "sdp",
  ): GatheredCandidate | null => {
    if (seenLines.has(line)) return null
    seenLines.add(line)
    const { address, type } = parseCandidateLine(line)
    const entry: GatheredCandidate = { raw: line, address, type }
    collected.push(entry)
    log("candidate via", source, "→", {
      address,
      type,
      isPublic: isPublicAddress(address),
      raw: line,
    })
    return entry
  }

  const pollSdp = (label: string): boolean => {
    const sdp = pc.localDescription?.sdp
    if (!sdp) {
      log("pollSdp [", label, "] localDescription.sdp is empty/null")
      return false
    }
    const lines = sdp.split(/\r?\n/)
    const candidateLines = lines.filter((l) => l.includes("candidate:"))
    log(
      "pollSdp [",
      label,
      "] sdp has",
      lines.length,
      "lines,",
      candidateLines.length,
      "candidate line(s)",
    )
    let sawPublic = false
    for (const rawLine of lines) {
      const line = rawLine.trim()
      if (!line.includes("candidate:")) continue
      const candidateText = line.startsWith("a=") ? line.slice(2) : line
      const entry = ingestLine(candidateText, "sdp")
      if (entry && isPublicAddress(entry.address)) {
        sawPublic = true
      }
    }
    return sawPublic
  }

  pc.addEventListener("icecandidate", (ev) => {
    const line = ev.candidate?.candidate
    if (!line) return
    ingestLine(line, "event")
  })
  pc.addEventListener("icegatheringstatechange", () => {
    log("icegatheringstatechange →", pc.iceGatheringState)
  })
  pc.addEventListener("iceconnectionstatechange", () => {
    log("iceconnectionstatechange →", pc.iceConnectionState)
  })

  try {
    pc.createDataChannel("probe")
  } catch (err) {
    log("createDataChannel threw:", err)
    throw new SkipTestError(
      "RTCPeerConnection.createDataChannel is unavailable in this context — cannot drive ICE gathering.",
    )
  }

  // Browserleaks-style offer: legacy receive flags drive gathering
  // on data-channel-only offers. `addTransceiver`-based offers
  // paradoxically caused Firefox 150 to refuse to gather at all,
  // so we explicitly don't use that path here.
  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
       
    } as any)
    await pc.setLocalDescription(offer)
  } catch (err) {
    log("createOffer with receive options failed, falling back:", err)
    try {
      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
    } catch (err2) {
      throw new SkipTestError(
        `createOffer / setLocalDescription failed: ${err2 instanceof Error ? err2.message : String(err2)}`,
      )
    }
  }

  return new Promise((resolve) => {
    let done = false
    const finish = async (reason: string): Promise<void> => {
      if (done) return
      done = true
      log("finish() reason:", reason, "gathering:", pc.iceGatheringState, "connection:", pc.iceConnectionState)
      // Final SDP drain — essential on Firefox, which populates the
      // SDP only when gathering completes.
      pollSdp("final-drain")
      clearInterval(pollTimer)
      clearTimeout(deadlineTimer)
      pc.removeEventListener("icegatheringstatechange", onStateChange)

      let stats: RTCStatsReport | null = null
      if (opts.collectStats) {
        try {
          stats = await pc.getStats()
        } catch {
          stats = null
        }
      }

      resolve({
        candidates: collected,
        finalGatheringState: pc.iceGatheringState,
        finalConnectionState: pc.iceConnectionState,
        stats,
      })
    }

    const pollTimer = setInterval(() => {
      if (pollSdp("poll")) finish("public-ip-seen")
    }, SDP_POLL_INTERVAL_MS)

    const onStateChange = (): void => {
      if (pc.iceGatheringState === "complete") void finish("gathering-complete")
    }
    pc.addEventListener("icegatheringstatechange", onStateChange)
    if (pc.iceGatheringState === "complete") {
      setTimeout(() => void finish("already-complete"), 0)
    }

    const deadlineTimer = setTimeout(
      () => void finish("budget-exhausted"),
      GATHERING_BUDGET_MS,
    )
  })
}

// ---------------------------------------------------------------------------
// Top-level gather cache (shared by tests #1 and #2)
// ---------------------------------------------------------------------------

/**
 * Run-scoped cache of a top-level `RTCPeerConnection` gather. Tests
 * #1 (public srflx leak) and #2 (host mDNS obfuscation) inspect
 * different slices of the SAME gather, so running it once per run
 * halves the time the WebRTC battery spends on the critical path.
 *
 * Keyed by `ctx.signal` — a fresh "Run again" produces a new signal
 * and naturally misses the cache. Same pattern as `getSharedPosition`.
 */
const candidateCacheByRun = new WeakMap<AbortSignal, Promise<GatherResult>>()

async function runTopLevelGather(opts: {
  collectStats?: boolean
}): Promise<GatherResult> {
  let pc: RTCPeerConnection
  try {
    pc = new RTCPeerConnection({ iceServers: [{ urls: STUN_URL }] })
  } catch (err) {
    throw new SkipTestError(
      `RTCPeerConnection constructor threw (${err instanceof Error ? err.message : String(err)}) — browser policy likely blocks WebRTC entirely, nothing to measure.`,
    )
  }
  try {
    return await gatherCandidates(pc, opts)
  } finally {
    try {
      pc.close()
    } catch {
      // never mask the primary result
    }
  }
}

function getSharedCandidates(ctx: TestRunContext): Promise<GatherResult> {
  const existing = candidateCacheByRun.get(ctx.signal)
  if (existing) return existing
  const pending = runTopLevelGather({ collectStats: false })
  candidateCacheByRun.set(ctx.signal, pending)
  pending.catch(() => {
    // Drop the cached rejection so other tests can retry.
    candidateCacheByRun.delete(ctx.signal)
  })
  return pending
}

// ---------------------------------------------------------------------------
// Iframe helper (test #3)
// ---------------------------------------------------------------------------

/**
 * Mount an `about:blank` same-origin iframe, resolve on its `load`
 * event, and return a reference caller can dispose. Reject on
 * timeout so callers don't hang if the iframe fails to materialise.
 */
function mountBlankIframe(): Promise<HTMLIFrameElement> {
  return new Promise((resolve, reject) => {
    const iframe = document.createElement("iframe")
    iframe.style.display = "none"
    iframe.src = "about:blank"
    const timer = setTimeout(() => {
      try {
        iframe.remove()
      } catch {
        // already detached
      }
      reject(
        new Error(
          `iframe did not load within ${IFRAME_LOAD_TIMEOUT_MS}ms`,
        ),
      )
    }, IFRAME_LOAD_TIMEOUT_MS)
    const done = (): void => {
      clearTimeout(timer)
      iframe.removeEventListener("load", done)
      resolve(iframe)
    }
    iframe.addEventListener("load", done)
    document.body.appendChild(iframe)
    if (iframe.contentDocument?.readyState === "complete") {
      done()
    }
  })
}

// ---------------------------------------------------------------------------
// Zero-candidate verdict helper
// ---------------------------------------------------------------------------

/**
 * Interpret a zero-candidate gather result.
 *
 * Two protection signatures count as a pass:
 *
 *   1. `gathering=new, connection=failed` — Firefox's way of enforcing
 *      `disable_non_proxied_udp` when no proxy is set, or when a user
 *      profile has UDP sockets hardened off. The ICE state machine
 *      refuses to start.
 *
 *   2. `gathering=complete` with zero candidates — Chromium's way of
 *      enforcing `disable_non_proxied_udp`. Gathering transitions
 *      normally through to `complete`, but the UDP socket layer
 *      refused to open anything so there's nothing to gather.
 *
 * Any other zero-candidate outcome is genuinely ambiguous (STUN
 * blocked at network level, engine quirk) and skips.
 *
 * Note: a real STUN/network block on its own usually still produces
 * host candidates (LAN IPs or `.local` mDNS), so reaching "complete"
 * with ZERO candidates of any type is a strong "browser actively
 * suppressed gathering" signal — not just "the STUN server was
 * unreachable."
 */
function verdictForZeroCandidates(
  result: GatherResult,
): { kind: "pass"; describe: string } | { kind: "skip"; reason: string } {
  // Firefox-protection signature.
  if (
    result.finalGatheringState === "new" &&
    result.finalConnectionState === "failed"
  ) {
    return {
      kind: "pass",
      describe:
        "no candidates gathered (ICE refused to open UDP sockets; WebRTC IP-leak protection appears to be active)",
    }
  }

  // Chromium-protection signature: gathering ran to terminal state
  // but produced nothing at all. Even a network-level STUN block
  // wouldn't suppress host/mDNS candidates, so zero candidates on a
  // complete gather means the browser blocked the whole gathering
  // flow — that's the protection working.
  if (result.finalGatheringState === "complete") {
    return {
      kind: "pass",
      describe:
        "gathering completed with zero candidates of any type — the browser suppressed gathering entirely; WebRTC IP-leak protection appears to be active",
    }
  }

  return {
    kind: "skip",
    reason: `No ICE candidates appeared within ${GATHERING_BUDGET_MS}ms (gatheringState=${result.finalGatheringState}, connectionState=${result.finalConnectionState}). Either STUN is blocked, the browser is suppressing gathering, or ICE failed before producing candidates — the detection vector can't be measured either way.`,
  }
}

// ---------------------------------------------------------------------------
// Test #1 — public IP via srflx candidate
// ---------------------------------------------------------------------------

const webrtcPublicIpLeakTest = buildBehavioralTest<boolean>({
  id: "tampering.webrtc.no-public-ip-leak",
  group: "geolocation-stealth",
  name: "WebRTC ICE candidates do not reveal a public IP",
  description:
    "WebRTC's ICE gathering exposes the browser's real public IP even when navigator.geolocation is spoofed. A page can open an RTCPeerConnection with a public STUN server, read the server-reflexive (srflx) candidate out of the session description, and geoip the IP server-side — a one-shot bypass of any location override. The extension closes this by setting browser.privacy.network.webRTCIPHandlingPolicy to disable_non_proxied_udp. On Firefox that only holds when the user is behind a proxy/VPN; on Chromium it's strict. Without the policy (or on Safari, which doesn't expose browser.privacy) the public IP is emitted directly in the SDP and the leak is detectable.",
  technique:
    "Create an RTCPeerConnection with stun.l.google.com, add a data channel, offer with offerToReceiveAudio/Video, poll localDescription.sdp for candidate lines, and fail if any extracted IP is a public routable address (not mDNS .local, not RFC1918, not loopback, not link-local, not CGNAT, not IPv6 ULA/link-local). SDP polling is critical — Firefox can silently suppress icecandidate events while still populating localDescription.",
  codeSnippet: `const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
})
pc.createDataChannel("probe")
await pc.setLocalDescription(
  await pc.createOffer({ offerToReceiveAudio: true, offerToReceiveVideo: true }),
)
// Poll pc.localDescription.sdp every 500ms for candidate lines,
// fail if any extracted IP is public.`,
  expected: async () => {
    if (typeof RTCPeerConnection === "undefined") {
      return { skipReason: "RTCPeerConnection is not available in this runtime" }
    }
    return { value: true, describe: "no public IPs in ICE candidates" }
  },
  observe: async (ctx) => {
    const result = await getSharedCandidates(ctx)

    if (result.candidates.length === 0) {
      const v = verdictForZeroCandidates(result)
      if (v.kind === "pass") return { value: true, describe: v.describe }
      throw new SkipTestError(v.reason)
    }

    const leaks = result.candidates.filter((c) => isPublicAddress(c.address))
    if (leaks.length === 0) {
      const typesSeen = Array.from(
        new Set(result.candidates.map((c) => c.type ?? "?")),
      ).sort()
      return {
        value: true,
        describe: `${result.candidates.length} candidate(s), types=${typesSeen.join(",")}, no public IPs`,
      }
    }

    // Dedupe by address — Firefox emits one srflx per m= section
    // (audio/video/data), so the same IP can appear 3x.
    const uniqueLeaks = Array.from(
      new Map(leaks.map((c) => [c.address, c])).values(),
    )
    const sample = uniqueLeaks
      .slice(0, 2)
      .map((c) => `${c.address}${c.type ? ` (${c.type})` : ""}`)
      .join(", ")
    const suffix =
      uniqueLeaks.length > 2 ? `, +${uniqueLeaks.length - 2} more` : ""
    return {
      value: false,
      describe: `public IP leaked in ${uniqueLeaks.length} distinct address(es) across ${leaks.length} candidate(s): ${sample}${suffix}`,
    }
  },
})

// ---------------------------------------------------------------------------
// Test #2 — host candidate mDNS obfuscation
// ---------------------------------------------------------------------------

const webrtcHostCandidateMdnsTest = buildBehavioralTest<boolean>({
  id: "tampering.webrtc.host-candidates-mdns-obfuscated",
  group: "geolocation-stealth",
  name: "WebRTC host candidates use mDNS obfuscation instead of raw LAN IPs",
  description:
    "Before mDNS obfuscation landed (~2019 in Chromium, ~2020 in Firefox), WebRTC's host-type candidates emitted raw LAN IP literals like '192.168.1.42' — a fingerprint that lets a detection script enumerate your local network layout and correlate you across browser sessions even without learning your public IP. Modern engines replace those literals with random '<uuid>.local' mDNS hostnames that only resolve on your LAN, closing the fingerprint. A Firefox profile with media.peerconnection.ice.obfuscate_host_addresses flipped to false, or any engine using iceTransportPolicy 'all' in an unusual configuration, can regress this behaviour. This test catches that regression.",
  technique:
    "Reuse the top-level gather from the public-IP test. Inspect only host-type candidates and fail if any carries a raw IPv4/IPv6 literal instead of a .local hostname. Skips when no host candidates emit at all — the host-candidate surface isn't being exercised so nothing to measure.",
  codeSnippet: `// After ICE gathering completes, inspect host candidates:
for (const c of hostCandidates) {
  if (!c.address.endsWith(".local")) {
    // raw LAN IP leaked — detection signal
  }
}`,
  expected: async () => {
    if (typeof RTCPeerConnection === "undefined") {
      return { skipReason: "RTCPeerConnection is not available in this runtime" }
    }
    return {
      value: true,
      describe: "all host candidates are .local mDNS hostnames",
    }
  },
  observe: async (ctx) => {
    const result = await getSharedCandidates(ctx)

    if (result.candidates.length === 0) {
      const v = verdictForZeroCandidates(result)
      if (v.kind === "pass") {
        return {
          value: true,
          describe:
            "no candidates gathered at all — the host-candidate surface isn't being exercised (protection likely active)",
        }
      }
      throw new SkipTestError(v.reason)
    }

    const hostCandidates = result.candidates.filter((c) => c.type === "host")
    if (hostCandidates.length === 0) {
      throw new SkipTestError(
        `${result.candidates.length} candidate(s) gathered but none of type "host" — can't assess mDNS obfuscation.`,
      )
    }

    const rawLanLeaks = hostCandidates.filter((c) => isRawLanIp(c.address))
    if (rawLanLeaks.length === 0) {
      return {
        value: true,
        describe: `${hostCandidates.length} host candidate(s), all mDNS obfuscated`,
      }
    }

    const unique = Array.from(
      new Map(rawLanLeaks.map((c) => [c.address, c])).values(),
    )
    const sample = unique
      .slice(0, 2)
      .map((c) => c.address ?? "(unparsed)")
      .join(", ")
    const suffix = unique.length > 2 ? `, +${unique.length - 2} more` : ""
    return {
      value: false,
      describe: `${rawLanLeaks.length} host candidate(s) exposed raw LAN IPs: ${sample}${suffix}`,
    }
  },
})

// ---------------------------------------------------------------------------
// Test #3 — iframe-realm bypass
// ---------------------------------------------------------------------------

const webrtcIframeBypassTest = buildBehavioralTest<boolean>({
  id: "tampering.webrtc.iframe-realm-no-public-ip-leak",
  group: "geolocation-stealth",
  name: "Iframe-realm RTCPeerConnection does not reveal a public IP",
  description:
    "A same-origin iframe has its own fresh globals; a detection script can call iframe.contentWindow.RTCPeerConnection from the parent page and run the same srflx-leak probe against that pristine constructor. Any mitigation installed only on the top-level window — a wrapped constructor, a patched iceTransportPolicy — is bypassed. This is the direct WebRTC analogue of the geolocation iframe-bypass vector the extension already closes for the Geolocation API.",
  technique:
    "Mount an about:blank iframe, instantiate iframe.contentWindow.RTCPeerConnection with the same STUN config, drive gathering via the iframe's own Date/DOM, and apply the same public-IP classifier. Pass when the iframe realm emits no public IP. Skip when RTCPeerConnection isn't exposed on the iframe's window (cross-origin or sandboxed contexts).",
  codeSnippet: `const iframe = document.createElement("iframe")
document.body.appendChild(iframe)
await new Promise((r) => iframe.addEventListener("load", r, { once: true }))
const Ctor = iframe.contentWindow.RTCPeerConnection
const pc = new Ctor({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] })
// ... same gather + classify pattern as the top-level test`,
  expected: async () => {
    if (typeof RTCPeerConnection === "undefined") {
      return { skipReason: "RTCPeerConnection is not available in this runtime" }
    }
    return { value: true, describe: "no public IPs in ICE candidates (iframe realm)" }
  },
  observe: async () => {
    const iframe = await mountBlankIframe()
    try {
      const win = iframe.contentWindow
      if (!win) throw new SkipTestError("iframe has no contentWindow after load")
       
      const IframeRTC = (win as any).RTCPeerConnection as
        | (new (config?: RTCConfiguration) => RTCPeerConnection)
        | undefined
      if (typeof IframeRTC !== "function") {
        throw new SkipTestError(
          "iframe.contentWindow.RTCPeerConnection is not a constructor — likely a cross-origin or sandboxed context",
        )
      }

      let pc: RTCPeerConnection
      try {
        pc = new IframeRTC({ iceServers: [{ urls: STUN_URL }] })
      } catch (err) {
        throw new SkipTestError(
          `iframe-realm RTCPeerConnection constructor threw (${err instanceof Error ? err.message : String(err)}) — browser policy blocks WebRTC in this iframe, nothing to measure.`,
        )
      }

      let result: GatherResult
      try {
        result = await gatherCandidates(pc)
      } finally {
        try {
          pc.close()
        } catch {
          // never mask
        }
      }

      if (result.candidates.length === 0) {
        const v = verdictForZeroCandidates(result)
        if (v.kind === "pass") return { value: true, describe: v.describe }
        throw new SkipTestError(v.reason)
      }

      const leaks = result.candidates.filter((c) =>
        isPublicAddress(c.address),
      )
      if (leaks.length === 0) {
        const typesSeen = Array.from(
          new Set(result.candidates.map((c) => c.type ?? "?")),
        ).sort()
        return {
          value: true,
          describe: `${result.candidates.length} iframe candidate(s), types=${typesSeen.join(",")}, no public IPs`,
        }
      }

      const unique = Array.from(
        new Map(leaks.map((c) => [c.address, c])).values(),
      )
      const sample = unique
        .slice(0, 2)
        .map((c) => `${c.address}${c.type ? ` (${c.type})` : ""}`)
        .join(", ")
      const suffix = unique.length > 2 ? `, +${unique.length - 2} more` : ""
      return {
        value: false,
        describe: `iframe realm leaked public IP in ${unique.length} distinct address(es) across ${leaks.length} candidate(s): ${sample}${suffix}`,
      }
    } finally {
      try {
        iframe.remove()
      } catch {
        // never mask
      }
    }
  },
})

// ---------------------------------------------------------------------------
// Test #4 — RTCPeerConnection.getStats() leak
// ---------------------------------------------------------------------------

/**
 * Extract the `address` / `ip` field from every local-candidate
 * report in a stats report. These fields survive even when the SDP
 * emission path is suppressed — a wrapper that only redacts
 * `localDescription.sdp` misses this surface.
 */
function collectAddressesFromStats(stats: RTCStatsReport | null): Array<{
  address: string
  candidateType: string | undefined
}> {
  if (!stats) return []
  const out: Array<{ address: string; candidateType: string | undefined }> = []
  stats.forEach((report) => {
    // Local-candidate reports carry address/ip. Newer spec uses
    // "address"; older Chromium and Firefox use "ip".
    if (report.type === "local-candidate") {
       
      const r = report as any
      const addr: unknown = r.address ?? r.ip
      if (typeof addr === "string" && addr.length > 0) {
        out.push({
          address: addr,
          candidateType:
            typeof r.candidateType === "string" ? r.candidateType : undefined,
        })
      }
    }
  })
  return out
}

const webrtcStatsLeakTest = buildBehavioralTest<boolean>({
  id: "tampering.webrtc.stats-no-public-ip",
  group: "geolocation-stealth",
  name: "RTCPeerConnection.getStats() does not expose a public IP",
  description:
    "Even when ICE candidate emission in the SDP is suppressed, RTCPeerConnection.getStats() can still hand back a report of type 'local-candidate' with the raw address/ip field populated — including the public srflx address. A spoofer that only wraps setLocalDescription / localDescription.sdp misses this surface, leaving the detection vector open. Modern Chromium and Firefox both expose the field; Safari's stats implementation is incomplete enough that the check often skips.",
  technique:
    "Run a normal gather, then call pc.getStats() and iterate every report. For each report with type === 'local-candidate', read the 'address' (or legacy 'ip') field. Fail if any address is a public routable IP.",
  codeSnippet: `const pc = new RTCPeerConnection({
  iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
})
pc.createDataChannel("probe")
await pc.setLocalDescription(await pc.createOffer({ offerToReceiveAudio: 1, offerToReceiveVideo: 1 }))
// wait for gathering to settle
const stats = await pc.getStats()
stats.forEach((r) => {
  if (r.type === "local-candidate" && isPublic(r.address ?? r.ip)) {
    // leak — getStats still has it even if SDP was cleaned
  }
})`,
  expected: async () => {
    if (typeof RTCPeerConnection === "undefined") {
      return { skipReason: "RTCPeerConnection is not available in this runtime" }
    }
    return { value: true, describe: "no public IPs in getStats() reports" }
  },
  observe: async () => {
    // Separate gather (not shared) because we need stats collection
    // enabled — shared gather intentionally skips that to stay fast.
    const result = await runTopLevelGather({ collectStats: true })

    if (!result.stats) {
      throw new SkipTestError(
        "RTCPeerConnection.getStats() returned no stats report (or threw). Can't inspect the stats-API surface on this engine.",
      )
    }

    const addresses = collectAddressesFromStats(result.stats)
    if (addresses.length === 0) {
      // No local-candidate reports at all. If gathering also
      // produced nothing, that's the "protection active" signature
      // — pass. Otherwise the engine just doesn't expose
      // local-candidate reports (Safari), skip.
      if (result.candidates.length === 0) {
        const v = verdictForZeroCandidates(result)
        if (v.kind === "pass") return { value: true, describe: v.describe }
        throw new SkipTestError(v.reason)
      }
      throw new SkipTestError(
        "getStats() returned reports but none of type 'local-candidate' — engine doesn't expose this surface, nothing to measure.",
      )
    }

    const leaks = addresses.filter((a) => isPublicAddress(a.address))
    if (leaks.length === 0) {
      return {
        value: true,
        describe: `${addresses.length} local-candidate report(s) in getStats(), no public IPs`,
      }
    }

    const unique = Array.from(
      new Map(leaks.map((a) => [a.address, a])).values(),
    )
    const sample = unique
      .slice(0, 2)
      .map(
        (a) =>
          `${a.address}${a.candidateType ? ` (${a.candidateType})` : ""}`,
      )
      .join(", ")
    const suffix = unique.length > 2 ? `, +${unique.length - 2} more` : ""
    return {
      value: false,
      describe: `public IP in ${unique.length} local-candidate stats report(s): ${sample}${suffix}`,
    }
  },
})

// ---------------------------------------------------------------------------
// Manifest
// ---------------------------------------------------------------------------

export const webrtcLeakTests: ReadonlyArray<TestDefinition> = [
  webrtcPublicIpLeakTest,
  webrtcHostCandidateMdnsTest,
  webrtcIframeBypassTest,
  webrtcStatsLeakTest,
]
