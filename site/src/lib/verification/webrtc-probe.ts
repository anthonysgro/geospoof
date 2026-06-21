/**
 * WebRTC public-IP leak probe for the /verify page.
 *
 * Runs two independent gathers in parallel:
 *   A) Top-level RTCPeerConnection — checks SDP candidates AND getStats()
 *      in a single pass (stats collected after gathering settles).
 *   B) Iframe-realm RTCPeerConnection — checks contentWindow.RTC bypass.
 *
 * This is intentionally separate from the full test-suite runner.
 * The test suite serialises its shared gather + stats gather + iframe gather
 * across three separate RTCPeerConnection lifetimes with an 8s budget each.
 * Here we do two parallel gathers (top-level + iframe), collect stats inline
 * on the top-level one, and bail as soon as a public IP is seen — so the
 * result arrives in ~1-3s on a normal network instead of up to 8s.
 */

export interface WebrtcResult {
  /** Deduplicated public IPs found across all surfaces. Empty = no leak. */
  publicIps: Array<string>
  /** Human-readable label of which surfaces leaked. Empty when clean. */
  leakDetail: string
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STUN_URL = "stun:stun.l.google.com:19302"

/**
 * Per-gather budget. We bail early when a public IP is detected, so
 * this only fires when gathering runs to completion without finding one.
 * 5s is enough for srflx on any healthy network; the test suite uses 8s
 * but that's conservative for a full battery run.
 */
const GATHER_BUDGET_MS = 5_000
const SDP_POLL_MS = 250
const IFRAME_LOAD_TIMEOUT_MS = 3_000

// ---------------------------------------------------------------------------
// IP classification — IPv4 only
// ---------------------------------------------------------------------------
//
// The /verify verdict compares the IPs WebRTC surfaces against the visitor's
// connection IP (see network-identity.ts, which resolves over the IPv4-only
// `ipv4.geojs.io` endpoint). An IPv6 WebRTC candidate can never string-match an
// IPv4 connection IP, so flagging it produced a false "WebRTC not protected —
// IPv6 leaking" verdict even when the IPv6 was the same egress. Scoping this
// probe to IPv4 keeps the comparison apples-to-apples: every surface here
// (top-level SDP, getStats(), iframe realm) routes through `isPublicAddress`,
// so IPv6 candidates are uniformly ignored rather than mis-reported as leaks.

function isPublicIpv4(address: string): boolean {
  const parts = address.split(".").map((p) => Number.parseInt(p, 10))
  if (parts.length !== 4 || parts.some((p) => !Number.isFinite(p))) return false
  const [a, b] = parts
  if (a === 10) return false
  if (a === 127) return false
  if (a === 169 && b === 254) return false
  if (a === 172 && b >= 16 && b <= 31) return false
  if (a === 192 && b === 168) return false
  if (a === 100 && b >= 64 && b <= 127) return false
  if (a === 0) return false
  return true
}

function isPublicAddress(address: string | undefined): boolean {
  if (!address) return false
  if (address.endsWith(".local")) return false
  // Ignore IPv6 entirely — the connection-IP baseline this probe is compared
  // against is IPv4-only, so an IPv6 candidate can't be matched and would only
  // produce a false leak verdict.
  if (address.includes(":")) return false
  return isPublicIpv4(address)
}

// ---------------------------------------------------------------------------
// Extract IP from a single SDP candidate line
// ---------------------------------------------------------------------------

const IP_RE =
  /([0-9]{1,3}(?:\.[0-9]{1,3}){3}|(?:[0-9a-f]{1,4}:){2,7}[0-9a-f]{0,4}(?::[0-9a-f]{1,4})*)/i

function extractCandidateIp(line: string): string | undefined {
  return IP_RE.exec(line)?.[1]
}

// ---------------------------------------------------------------------------
// Core gather — one RTCPeerConnection, returns public IPs + stats IPs
// ---------------------------------------------------------------------------

interface GatherOutcome {
  /** Public IPs from SDP candidates. */
  sdpLeaks: Array<string>
  /** Public IPs from getStats() local-candidate reports. */
  statsLeaks: Array<string>
}

async function gatherOnce(
  Ctor: new (config?: RTCConfiguration) => RTCPeerConnection
): Promise<GatherOutcome> {
  let pc: RTCPeerConnection
  try {
    pc = new Ctor({ iceServers: [{ urls: STUN_URL }] })
  } catch {
    return { sdpLeaks: [], statsLeaks: [] }
  }

  const sdpPublicIps = new Set<string>()
  const seen = new Set<string>()

  const ingestLine = (line: string): boolean => {
    if (seen.has(line)) return false
    seen.add(line)
    const ip = extractCandidateIp(line)
    if (isPublicAddress(ip)) {
      sdpPublicIps.add(ip!)
      return true
    }
    return false
  }

  const pollSdp = (): boolean => {
    const sdp = pc.localDescription?.sdp
    if (!sdp) return false
    let foundPublic = false
    for (const raw of sdp.split(/\r?\n/)) {
      const line = raw.trim()
      if (!line.includes("candidate:")) continue
      const text = line.startsWith("a=") ? line.slice(2) : line
      if (ingestLine(text)) foundPublic = true
    }
    return foundPublic
  }

  pc.addEventListener("icecandidate", (ev) => {
    const line = ev.candidate?.candidate
    if (line) ingestLine(line)
  })

  try {
    pc.createDataChannel("probe")
  } catch {
    pc.close()
    return { sdpLeaks: [], statsLeaks: [] }
  }

  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    } as RTCOfferOptions)
    await pc.setLocalDescription(offer)
  } catch {
    try { pc.close() } catch { /* ignore */ }
    return { sdpLeaks: [], statsLeaks: [] }
  }

  await new Promise<void>((resolve) => {
    let done = false

    const onState = (): void => {
      if (pc.iceGatheringState === "complete") finish()
    }

    // Firefox's disable_non_proxied_udp protection signature:
    // iceConnectionState jumps straight to "failed" without gathering.
    const onConnState = (): void => {
      if (pc.iceConnectionState === "failed" || pc.iceConnectionState === "closed") finish()
    }

    const finish = (): void => {
      if (done) return
      done = true
      clearInterval(poll)
      clearTimeout(deadline)
      pc.removeEventListener("icegatheringstatechange", onState)
      pc.removeEventListener("iceconnectionstatechange", onConnState)
      resolve()
    }

    const poll = setInterval(() => {
      if (pollSdp()) finish() // bail early on first public IP
    }, SDP_POLL_MS)

    pc.addEventListener("icegatheringstatechange", onState)
    pc.addEventListener("iceconnectionstatechange", onConnState)

    if (pc.iceGatheringState === "complete") {
      setTimeout(finish, 0)
    }

    const deadline = setTimeout(finish, GATHER_BUDGET_MS)
  })

  // Final SDP drain (critical on Firefox — populates SDP only at complete)
  pollSdp()

  // Collect stats while the pc is still open
  const statsLeaks: Array<string> = []
  try {
    const stats = await pc.getStats()
    stats.forEach((report) => {
      if (report.type === "local-candidate") {
        const r = report as Record<string, unknown>
        const addr = (r["address"] ?? r["ip"]) as string | undefined
        if (typeof addr === "string" && isPublicAddress(addr)) {
          statsLeaks.push(addr)
        }
      }
    })
  } catch {
    // stats unavailable — not a problem
  }

  try { pc.close() } catch { /* ignore */ }

  return {
    sdpLeaks: Array.from(sdpPublicIps),
    statsLeaks: [...new Set(statsLeaks)],
  }
}

// ---------------------------------------------------------------------------
// Iframe gather
// ---------------------------------------------------------------------------

async function gatherViaIframe(): Promise<Array<string>> {
  if (typeof document === "undefined") return []

  const iframe = document.createElement("iframe")
  iframe.style.display = "none"
  iframe.src = "about:blank"

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      try { iframe.remove() } catch { /* ignore */ }
      reject(new Error("iframe timed out"))
    }, IFRAME_LOAD_TIMEOUT_MS)
    iframe.addEventListener("load", () => {
      clearTimeout(timer)
      resolve()
    }, { once: true })
    document.body.appendChild(iframe)
    if (iframe.contentDocument?.readyState === "complete") {
      clearTimeout(timer)
      resolve()
    }
  }).catch(() => null)

  try {
    const win = iframe.contentWindow
    if (!win) return []
    const IframeCtor = (win as unknown as { RTCPeerConnection?: new (c?: RTCConfiguration) => RTCPeerConnection }).RTCPeerConnection
    if (typeof IframeCtor !== "function") return []
    const { sdpLeaks } = await gatherOnce(IframeCtor)
    return sdpLeaks
  } finally {
    try { iframe.remove() } catch { /* ignore */ }
  }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export async function probeWebrtc(): Promise<WebrtcResult> {
  if (typeof RTCPeerConnection === "undefined") {
    return { publicIps: [], leakDetail: "" }
  }

  // Run top-level gather and iframe gather in parallel
  const [topLevel, iframeLeaks] = await Promise.all([
    gatherOnce(RTCPeerConnection),
    gatherViaIframe(),
  ])

  const allIps = new Set<string>()
  const surfaces: Array<string> = []

  if (topLevel.sdpLeaks.length > 0) {
    topLevel.sdpLeaks.forEach((ip) => allIps.add(ip))
    surfaces.push("SDP candidates")
  }
  if (topLevel.statsLeaks.length > 0) {
    topLevel.statsLeaks.forEach((ip) => allIps.add(ip))
    surfaces.push("getStats() API")
  }
  if (iframeLeaks.length > 0) {
    iframeLeaks.forEach((ip) => allIps.add(ip))
    surfaces.push("iframe realm")
  }

  return {
    publicIps: Array.from(allIps),
    leakDetail: surfaces.length > 0 ? `Leaked via: ${surfaces.join(", ")}` : "",
  }
}
