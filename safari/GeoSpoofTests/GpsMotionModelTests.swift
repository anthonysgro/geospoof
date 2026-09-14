import Foundation
import Testing
@testable import GeoSpoof

/// The pure half of device-GPS motion: route geometry, and the echo gate that decides which parts
/// of an agent report may be believed.
///
/// Both are pure functions of their inputs, which is deliberate — they encode the two places this
/// feature can lie to a customer without crashing:
///
///   * **Geometry.** Position during route playback is our own polyline walked to the agent's
///     `travelled_m`. If that disagrees with the agent's own integration, the map marker and the
///     device drift apart and the browser reports a place the phone isn't.
///   * **The echo gate.** For a moment after every write the freshest report describes the
///     *previous* intent. Believing it produces a countdown that reads "expired" while the device
///     is still moving, and a progress bar that shows 80% then snaps to 0%.
///
/// Neither failure throws. Both just quietly show the wrong thing, which is why they are worth
/// pinning.
///
/// ── Running these ─────────────────────────────────────────────────────────────
/// See the header of `GpsDesiredPayloadTests.swift`, or `CONTRIBUTING.md` ▸ Swift tests.
@Suite("GPS motion model")
struct GpsMotionModelTests {

    // MARK: Fixtures

    /// Two legs, each about 1 km, heading north then east. Chosen so the leg lengths are easy to
    /// reason about and the turn is unambiguous.
    private static let lShaped = GpsRoute(
        id: "l-shaped",
        name: "L",
        points: [
            GpsRoutePoint(lat: 35.0000, lon: 139.0000, offsetSecs: 0),
            GpsRoutePoint(lat: 35.0090, lon: 139.0000, offsetSecs: 600),
            GpsRoutePoint(lat: 35.0090, lon: 139.0110, offsetSecs: 1200),
        ],
        speed: .fixed(mps: 1.4),
        repeats: false
    )

    private static func status(
        session: String = "spoofing",
        motion: String? = nil,
        route: GpsRouteStatus? = nil,
        steering: GpsSteeringStatus? = nil
    ) -> GpsStatus {
        GpsStatus(
            version: 1,
            agentVersion: "0.2.0",
            connected: true,
            device: nil,
            session: session,
            provenanceRaw: "from-app",
            remediation: "",
            error: nil,
            pro: true,
            updatedAt: 1_789_300_123,
            motionRaw: motion,
            transportRaw: "wireless",
            pairingRepairNeeded: nil,
            route: route,
            steering: steering
        )
    }

    private static func askedRoute(
        startedAt: Double = 1_789_300_000,
        repeats: Bool = false
    ) -> GpsMotionState {
        GpsMotionState(
            mode: .route, routeId: "l-shaped", routeStartedAt: startedAt, routePaused: false,
            routeRepeats: repeats,
            steering: nil, lastConfirmedLatitude: nil, lastConfirmedLongitude: nil,
            lastConfirmedAt: nil
        )
    }

    private static func askedSteering(seq: Double = 7) -> GpsMotionState {
        GpsMotionState(
            mode: .steering, routeId: nil, routeStartedAt: nil, routePaused: false,
            routeRepeats: false,
            steering: GpsSteeringVector(seq: seq, headingDeg: 90, speedMps: 3, ttlSecs: 900),
            lastConfirmedLatitude: nil, lastConfirmedLongitude: nil, lastConfirmedAt: nil
        )
    }

    // MARK: Geometry

    @Test("distance between two points is plausible for a known separation")
    func haversineSanity() {
        // 0.009° of latitude is very close to 1 km. Loose bounds on purpose: this is asserting
        // the formula isn't wrong by an order of magnitude or a unit, not re-deriving geodesy.
        let d = GpsRoute.metersBetween(
            GpsRoutePoint(lat: 35.0, lon: 139.0, offsetSecs: nil),
            GpsRoutePoint(lat: 35.009, lon: 139.0, offsetSecs: nil)
        )
        #expect(d > 950 && d < 1050)
    }

    @Test("a route's length is the sum of its legs")
    func routeLength() {
        let legs = GpsRoute.metersBetween(Self.lShaped.points[0], Self.lShaped.points[1])
            + GpsRoute.metersBetween(Self.lShaped.points[1], Self.lShaped.points[2])
        #expect(abs(Self.lShaped.lengthMeters - legs) < 0.001)
    }

    @Test("zero and negative travelled distance give the first point")
    func clampsAtStart() {
        // Negative shouldn't happen, but a clamp is cheaper than a crash and the honest answer
        // is "you haven't started".
        for travelled in [0.0, -1.0, -10_000.0] {
            let p = Self.lShaped.position(atTravelled: travelled)
            #expect(p?.lat == Self.lShaped.points[0].lat)
            #expect(p?.lon == Self.lShaped.points[0].lon)
        }
    }

    @Test("travelling past the end gives the last point")
    func clampsAtEnd() {
        // Also the correct answer for a finished route, where the agent holds the final point
        // rather than reverting.
        let p = Self.lShaped.position(atTravelled: Self.lShaped.lengthMeters + 5_000)
        #expect(p?.lat == Self.lShaped.points.last?.lat)
        #expect(p?.lon == Self.lShaped.points.last?.lon)
    }

    @Test("halfway along the first leg interpolates, and stays on that leg")
    func interpolatesWithinLeg() {
        let firstLeg = GpsRoute.metersBetween(Self.lShaped.points[0], Self.lShaped.points[1])
        let p = Self.lShaped.position(atTravelled: firstLeg / 2)
        // The first leg runs due north, so longitude must not move — a marker that drifts
        // sideways on a straight path is the visible symptom of interpolating wrongly.
        #expect(abs((p?.lon ?? 0) - 139.0) < 1e-9)
        #expect(abs((p?.lat ?? 0) - 35.0045) < 1e-4)
    }

    @Test("exactly at the corner gives the corner")
    func atLegBoundary() {
        let firstLeg = GpsRoute.metersBetween(Self.lShaped.points[0], Self.lShaped.points[1])
        let p = Self.lShaped.position(atTravelled: firstLeg)
        #expect(abs((p?.lat ?? 0) - 35.0090) < 1e-6)
        #expect(abs((p?.lon ?? 0) - 139.0000) < 1e-6)
    }

    @Test("past the corner moves along the second leg only")
    func interpolatesSecondLeg() {
        let firstLeg = GpsRoute.metersBetween(Self.lShaped.points[0], Self.lShaped.points[1])
        let p = Self.lShaped.position(atTravelled: firstLeg + 100)
        // Second leg runs due east, so latitude holds and longitude advances.
        #expect(abs((p?.lat ?? 0) - 35.0090) < 1e-6)
        #expect((p?.lon ?? 0) > 139.0)
    }

    @Test("a single-point route always resolves to that point")
    func singlePointRoute() {
        let route = GpsRoute(
            id: "pin", name: nil,
            points: [GpsRoutePoint(lat: 1, lon: 2, offsetSecs: nil)],
            speed: .fixed(mps: 1.4), repeats: false
        )
        #expect(route.lengthMeters == 0)
        #expect(route.position(atTravelled: 0)?.lat == 1)
        #expect(route.position(atTravelled: 500)?.lat == 1)
    }

    @Test("an empty route has no position")
    func emptyRoute() {
        let route = GpsRoute(
            id: "empty", name: nil, points: [], speed: .fixed(mps: 1.4), repeats: false
        )
        #expect(route.position(atTravelled: 0) == nil)
    }

    @Test("duplicate consecutive points don't stall progress")
    func zeroLengthLegSkipped() {
        // A drawn or imported route can contain repeated points. A zero-length leg must be
        // stepped over, not divided by.
        let route = GpsRoute(
            id: "dupes", name: nil,
            points: [
                GpsRoutePoint(lat: 35.0, lon: 139.0, offsetSecs: nil),
                GpsRoutePoint(lat: 35.0, lon: 139.0, offsetSecs: nil),
                GpsRoutePoint(lat: 35.009, lon: 139.0, offsetSecs: nil),
            ],
            speed: .fixed(mps: 1.4), repeats: false
        )
        let p = route.position(atTravelled: 500)
        #expect(p != nil)
        #expect((p?.lat ?? 0) > 35.0)
    }

    // MARK: Validation

    @Test("validation rejects what the agent would refuse")
    func validation() {
        let ok = Self.lShaped
        #expect(ok.validationFailure == nil)

        let empty = GpsRoute(id: "e", name: nil, points: [], speed: .fixed(mps: 1), repeats: false)
        #expect(empty.validationFailure == .noPoints)

        let badCoord = GpsRoute(
            id: "b", name: nil,
            points: [GpsRoutePoint(lat: 91, lon: 0, offsetSecs: nil)],
            speed: .fixed(mps: 1), repeats: false
        )
        #expect(badCoord.validationFailure == .invalidCoordinate)

        let nonFinite = GpsRoute(
            id: "n", name: nil,
            points: [GpsRoutePoint(lat: .nan, lon: 0, offsetSecs: nil)],
            speed: .fixed(mps: 1), repeats: false
        )
        #expect(nonFinite.validationFailure == .invalidCoordinate)

        // Zero would park the user on the start line forever, which is why it is refused rather
        // than clamped.
        for bad in [0.0, -1.0, Double.infinity] {
            let badSpeed = GpsRoute(
                id: "s", name: nil,
                points: [GpsRoutePoint(lat: 0, lon: 0, offsetSecs: nil)],
                speed: .fixed(mps: bad), repeats: false
            )
            #expect(badSpeed.validationFailure == .invalidSpeed)
        }
    }

    @Test("the point cap refuses and reports the count, so the message can be specific")
    func pointCap() {
        let over = GpsRoute(
            id: "big", name: nil,
            points: Array(
                repeating: GpsRoutePoint(lat: 35, lon: 139, offsetSecs: nil),
                count: GpsRoute.maxPoints + 1
            ),
            speed: .fixed(mps: 1.4), repeats: false
        )
        #expect(over.validationFailure == .tooManyPoints(GpsRoute.maxPoints + 1))

        let atCap = GpsRoute(
            id: "cap", name: nil,
            points: Array(
                repeating: GpsRoutePoint(lat: 35, lon: 139, offsetSecs: nil),
                count: GpsRoute.maxPoints
            ),
            speed: .fixed(mps: 1.4), repeats: false
        )
        #expect(atCap.validationFailure == nil)
    }

    // MARK: Speed wire form

    @Test("speed round-trips through its tagged wire form")
    func speedCodable() {
        for speed in [GpsRouteSpeed.fixed(mps: 8), .asRecorded] {
            let data = try! JSONEncoder().encode(speed)
            #expect(try! JSONDecoder().decode(GpsRouteSpeed.self, from: data) == speed)
        }
        let fixed = try! JSONSerialization.jsonObject(
            with: try! JSONEncoder().encode(GpsRouteSpeed.fixed(mps: 8))
        ) as? [String: Any]
        #expect(fixed?["kind"] as? String == "fixed")
        #expect(fixed?["mps"] as? Double == 8)
    }

    @Test("an unknown speed kind degrades to the agent's own fallback")
    func unknownSpeedKindDegrades() {
        // The contract's rule: a future `speed.kind` an older reader doesn't know falls back to a
        // default pace rather than refusing the route. `asRecorded` is the branch that lands on
        // the agent's documented walking fallback, so both sides agree rather than diverging.
        let data = "{\"kind\":\"warp\",\"factor\":9}".data(using: .utf8)!
        #expect(try! JSONDecoder().decode(GpsRouteSpeed.self, from: data) == .asRecorded)
    }

    @Test("a route round-trips through the wire format")
    func routeCodable() {
        let data = try! JSONEncoder().encode(Self.lShaped)
        #expect(try! JSONDecoder().decode(GpsRoute.self, from: data) == Self.lShaped)
        // `repeat` is a Swift keyword, so the key mapping is easy to get wrong and silently
        // produce a route the agent never loops.
        let obj = try! JSONSerialization.jsonObject(with: data) as? [String: Any]
        #expect(obj?["repeat"] as? Bool == false)
        #expect(obj?["repeats"] == nil)
    }

    // MARK: The delivery grace — a request needs time to arrive

    @Test("a report predating the request does not read as a refusal")
    func youngRequestIsNotARefusal() {
        // The bug this pins, reported from hardware: "this computer isn't following your route"
        // flashed up for about a second every time a route started. The freshest report at that
        // moment was written *before* the request existed, so it said `still` — and the echo rule
        // was applied instantly, turning a report about an older question into an accusation.
        let justAsked = Self.askedRoute(startedAt: Date().timeIntervalSince1970)
        let gate = GpsEchoGate(status: Self.status(motion: "still"), asked: justAsked)
        #expect(gate.requestTooYoungToJudge())
    }

    @Test("once the grace window is up, silence does mean something")
    func oldRequestIsJudged() {
        // The other half: the grace must expire, or a genuinely outdated agent would never be
        // reported and the user would wait forever for a route that is never going to play.
        let longAgo = Date().timeIntervalSince1970 - (GpsEchoGate.deliveryGrace + 5)
        let gate = GpsEchoGate(
            status: Self.status(motion: "still"), asked: Self.askedRoute(startedAt: longAgo)
        )
        #expect(gate.requestTooYoungToJudge() == false)
    }

    @Test("the grace sits inside the agent's own cadence bracket")
    func graceIsBracketed() {
        // Not a chosen number. Above the agent's worst-case publish interval — POLL_INTERVAL (1s)
        // plus PASS_HARVEST_BUDGET (5s) — so a legitimately slow acknowledgement isn't called a
        // refusal. Below the 20s freshness window, or a report would go stale before we were ever
        // willing to judge it, and the message could never appear at all.
        #expect(GpsEchoGate.deliveryGrace > 6)
        #expect(GpsEchoGate.deliveryGrace < GpsStatusStore.freshWindow)
    }

    @Test("steering requests are aged from seq, which is a millisecond timestamp")
    func steeringRequestAge() {
        let now = Date(timeIntervalSince1970: 2_000_000)
        // `seq` is stamped in milliseconds on our own clock, so it doubles as "when we asked" —
        // deliberately not compared against the report's `updatedAt`, which is the computer's clock.
        var asked = Self.askedSteering(seq: (now.timeIntervalSince1970 - 3) * 1000)
        asked.mode = .steering
        let gate = GpsEchoGate(status: Self.status(motion: "steering"), asked: asked)
        let age = gate.requestAge(now: now)
        #expect(age != nil)
        #expect(abs((age ?? 0) - 3) < 0.001)
    }

    @Test("a still request has no age, so it is never suppressed")
    func stillRequestHasNoAge() {
        // Nothing was asked for, so there is nothing awaiting delivery and no window to wait out.
        let gate = GpsEchoGate(status: Self.status(motion: "still"), asked: .idle)
        #expect(gate.requestAge() == nil)
        #expect(gate.requestTooYoungToJudge() == false)
    }

    @Test("a clock that moved backwards suppresses rather than accuses")
    func negativeAgeSuppresses() {
        // A future timestamp yields a negative age. Suppressing is the recoverable direction: the
        // next report resolves it either way, whereas a wrong accusation sends someone to update
        // software that is already current.
        let future = Date().timeIntervalSince1970 + 3600
        let gate = GpsEchoGate(
            status: Self.status(motion: "still"), asked: Self.askedRoute(startedAt: future)
        )
        #expect(gate.requestTooYoungToJudge())
    }

    // MARK: Echo gate — steering

    @Test("timing is withheld until seq matches, and the position never is")
    func steeringEchoGating() {
        let asked = Self.askedSteering(seq: 7)
        // The report still describes the previous gesture. Note heading and speed match ours
        // exactly, which is why they cannot be used to detect this and `seq` must be.
        let stale = GpsSteeringStatus(
            seq: 6, headingDeg: 90, speedMps: 3,
            latitude: 35.5, longitude: 139.5, travelledM: 100,
            ttlSecs: 900, expiresInSecs: 12, held: false, expired: false, rejected: nil
        )
        let gate = GpsEchoGate(status: Self.status(motion: "steering", steering: stale), asked: asked)

        #expect(gate.steeringEchoMatches == false)
        // Withheld: a deadline built from 12s would say "expired" while the device moves.
        #expect(gate.steeringDeadline() == nil)
        #expect(gate.confirmedSpeedMps == nil)
        // NOT withheld: the integrated position is the best answer whichever vector produced it.
        #expect(gate.steeringPosition?.latitude == 35.5)
    }

    @Test("a matching seq releases the timing fields")
    func steeringEchoMatched() {
        let asked = Self.askedSteering(seq: 7)
        let fresh = GpsSteeringStatus(
            seq: 7, headingDeg: 90, speedMps: 3,
            latitude: 35.5, longitude: 139.5, travelledM: 100,
            ttlSecs: 900, expiresInSecs: 540, held: false, expired: false, rejected: nil
        )
        let now = Date(timeIntervalSince1970: 1_000_000)
        let gate = GpsEchoGate(status: Self.status(motion: "steering", steering: fresh), asked: asked)

        #expect(gate.steeringEchoMatches)
        #expect(gate.confirmedSpeedMps == 3)
        #expect(gate.steeringDeadline(now: now) == now.addingTimeInterval(540))
    }

    @Test("the pace shown is the agent's, not ours, so a clamp is visible")
    func clampedSpeedIsSurfaced() {
        // We asked for 3; suppose the agent is running something else. Echoing our own value back
        // would display a pace that isn't happening.
        var asked = Self.askedSteering(seq: 7)
        asked.steering = GpsSteeringVector(seq: 7, headingDeg: 90, speedMps: 999, ttlSecs: 900)
        let clamped = GpsSteeringStatus(
            seq: 7, headingDeg: 90, speedMps: 100,
            latitude: nil, longitude: nil, travelledM: nil,
            ttlSecs: 900, expiresInSecs: 100, held: false, expired: false, rejected: nil
        )
        let gate = GpsEchoGate(
            status: Self.status(motion: "steering", steering: clamped), asked: asked
        )
        #expect(gate.confirmedSpeedMps == 100)
    }

    @Test("an expired vector reports a deadline of now, not a negative one")
    func expiredDeadlineFloorsAtNow() {
        let asked = Self.askedSteering(seq: 7)
        let expired = GpsSteeringStatus(
            seq: 7, headingDeg: 90, speedMps: 3,
            latitude: nil, longitude: nil, travelledM: nil,
            ttlSecs: 60, expiresInSecs: 0, held: false, expired: true, rejected: nil
        )
        let now = Date(timeIntervalSince1970: 1_000_000)
        let gate = GpsEchoGate(
            status: Self.status(motion: "steering", steering: expired), asked: asked
        )
        #expect(gate.steeringDeadline(now: now) == now)
    }

    @Test("with no vector asked for, nothing steering-related is believed")
    func noVectorAsked() {
        let gate = GpsEchoGate(
            status: Self.status(
                motion: "steering",
                steering: GpsSteeringStatus(
                    seq: 7, headingDeg: 0, speedMps: 1, latitude: 1, longitude: 2,
                    travelledM: 0, ttlSecs: 60, expiresInSecs: 60, held: false,
                    expired: false, rejected: nil
                )
            ),
            asked: .idle
        )
        #expect(gate.steeringEchoMatches == false)
        #expect(gate.steeringDeadline() == nil)
    }

    // MARK: Echo gate — routes

    @Test("progress is withheld until the run marker matches")
    func routeEchoGating() {
        // The user pressed restart, so we bumped the marker. The agent hasn't noticed yet and is
        // still reporting the previous run — which was nearly finished.
        let asked = Self.askedRoute(startedAt: 2_000)
        let previousRun = GpsRouteStatus(
            id: "l-shaped", startedAt: 1_000, name: "L",
            travelledM: 1_800, totalM: 2_000, remainingSecs: 140,
            paused: false, finished: false, speedDefaulted: false
        )
        let gate = GpsEchoGate(status: Self.status(motion: "route", route: previousRun), asked: asked)

        #expect(gate.routeEchoMatches == false)
        // Believing this would render 90% and then snap to 0%.
        #expect(gate.confirmedRouteProgress == nil)
    }

    @Test("a matching run marker releases progress, passing remaining time through")
    func routeEchoMatched() {
        let asked = Self.askedRoute(startedAt: 1_000)
        let current = GpsRouteStatus(
            id: "l-shaped", startedAt: 1_000, name: "L",
            travelledM: 500, totalM: 2_000, remainingSecs: 1_071,
            paused: false, finished: false, speedDefaulted: false
        )
        let gate = GpsEchoGate(status: Self.status(motion: "route", route: current), asked: asked)

        #expect(gate.routeEchoMatches)
        let progress = gate.confirmedRouteProgress
        #expect(progress?.travelledM == 500)
        #expect(progress?.totalM == 2_000)
        // Passed through, never derived: for an as-recorded route the pace varies along the
        // track, so (total - travelled) / speed is wrong and only the agent knows the truth.
        #expect(progress?.remainingSecs == 1_071)
    }

    @Test("a repeating route reports progress with no remaining time")
    func repeatingRouteProgress() {
        let asked = Self.askedRoute(startedAt: 1_000)
        let looping = GpsRouteStatus(
            id: "l-shaped", startedAt: 1_000, name: "L",
            travelledM: 120, totalM: 800, remainingSecs: nil,
            paused: false, finished: false, speedDefaulted: false
        )
        let gate = GpsEchoGate(status: Self.status(motion: "route", route: looping), asked: asked)
        let progress = gate.confirmedRouteProgress
        // Per-lap progress is meaningful; a total duration is not, because there is no end.
        #expect(progress?.travelledM == 120)
        #expect(progress?.remainingSecs == nil)
    }

    // MARK: Position resolution

    @Test("steering resolves to the agent's integrated position")
    func resolveSteering() {
        let gate = GpsEchoGate(
            status: Self.status(
                motion: "steering",
                steering: GpsSteeringStatus(
                    seq: 7, headingDeg: 90, speedMps: 3,
                    latitude: 35.67049, longitude: 139.70035, travelledM: 32,
                    ttlSecs: 900, expiresInSecs: 540, held: false, expired: false, rejected: nil
                )
            ),
            asked: Self.askedSteering(seq: 7)
        )
        let p = gate.resolvedPosition(route: nil, chosen: SpoofLocation(latitude: 1, longitude: 2))
        #expect(p?.latitude == 35.67049)
        #expect(p?.longitude == 139.70035)
    }

    @Test("a route resolves to our polyline walked to the agent's travelled_m")
    func resolveRoute() {
        let firstLeg = GpsRoute.metersBetween(Self.lShaped.points[0], Self.lShaped.points[1])
        let asked = Self.askedRoute(startedAt: 1_000)
        let gate = GpsEchoGate(
            status: Self.status(
                motion: "route",
                route: GpsRouteStatus(
                    id: "l-shaped", startedAt: 1_000, name: nil,
                    travelledM: firstLeg, totalM: Self.lShaped.lengthMeters,
                    remainingSecs: 600, paused: false, finished: false, speedDefaulted: false
                )
            ),
            asked: asked
        )
        let p = gate.resolvedPosition(route: Self.lShaped, chosen: nil)
        // travelled_m of exactly one leg puts us at the corner.
        #expect(abs((p?.latitude ?? 0) - 35.0090) < 1e-6)
        #expect(abs((p?.longitude ?? 0) - 139.0000) < 1e-6)
    }

    @Test("a route with unconfirmed progress resolves to nothing, not to a guess")
    func resolveRouteUnconfirmed() {
        let asked = Self.askedRoute(startedAt: 2_000)
        let gate = GpsEchoGate(
            status: Self.status(
                motion: "route",
                route: GpsRouteStatus(
                    id: "l-shaped", startedAt: 1_000, name: nil,
                    travelledM: 1_800, totalM: 2_000, remainingSecs: 140,
                    paused: false, finished: false, speedDefaulted: false
                )
            ),
            asked: asked
        )
        // The caller must then leave the last position alone. Guessing here is how a stale
        // coordinate gets written back and drags the device.
        #expect(gate.resolvedPosition(route: Self.lShaped, chosen: nil) == nil)
    }

    @Test("still resolves to the coordinate we chose")
    func resolveStill() {
        let gate = GpsEchoGate(status: Self.status(motion: "still"), asked: .idle)
        let p = gate.resolvedPosition(
            route: nil, chosen: SpoofLocation(latitude: 48.8584, longitude: 2.2945)
        )
        #expect(p?.latitude == 48.8584)
    }

    @Test("a computer that isn't spoofing resolves to nothing")
    func resolveIdle() {
        // The trap in report form: absent `motion` on an idle computer means nothing is driving a
        // location, not that a capability is missing. Either way there is no position to claim.
        let gate = GpsEchoGate(status: Self.status(session: "idle", motion: nil), asked: .idle)
        #expect(
            gate.resolvedPosition(
                route: nil, chosen: SpoofLocation(latitude: 1, longitude: 2)
            ) == nil
        )
    }

    @Test("an unknown delivered mode resolves to nothing")
    func resolveUnknownMode() {
        let gate = GpsEchoGate(status: Self.status(motion: "orbital-drift"), asked: .idle)
        #expect(
            gate.resolvedPosition(
                route: nil, chosen: SpoofLocation(latitude: 1, longitude: 2)
            ) == nil
        )
    }
}

/// The two presentation-layer rules that were previously enforced only by which sections a phase
/// happened to list.
///
/// Neither of these is arithmetic, and that is exactly why they are pinned here. Both encode a
/// decision that reads as obvious once stated and had already been got wrong in code — the kind of
/// rule that a refactor silently reverts because nothing anywhere says it out loud.
@Suite("GPS presentation rules")
struct GpsPresentationRuleTests {

    // MARK: The master switch stays reachable

    /// Every phase except `notPro` must render the four zones, because zone 4 carries the Sync
    /// toggle — the only control that returns the device's real GPS.
    ///
    /// This is the regression test for a real defect: `chooseController` and `entitlementRejected`
    /// each rendered their own section and no toggle, so a customer with two computers and no pick,
    /// or one whose entitlement the agent refused, had their real system GPS moved with no in-app way
    /// to switch it back.
    @Test("only the non-Pro phase may replace the screen, so the Sync toggle is always reachable")
    func onlyNotProReplacesTheScreen() {
        let everyOtherPhase: [GpsPhase] = [
            .waitingForComputer,
            .chooseController,
            .entitlementRejected,
            .setupNeeded(""),
            .setupNeeded("Pro required"),
            .ready,
            .spoofing(.still),
            .spoofing(.route(Self.progress)),
            .spoofing(.steering(Self.steering)),
            .spoofing(.notDelivered(asked: .route)),
            .lost,
        ]
        #expect(GpsPhase.notPro.replacesScreenWithPitch)
        for phase in everyOtherPhase {
            #expect(
                !phase.replacesScreenWithPitch,
                "this phase would hide the Sync toggle, leaving the device's real GPS moved with no way back"
            )
        }
    }

    // MARK: Motion supersedes provenance

    /// While a route plays, the route **is** the source.
    ///
    /// The coordinate the route started from is not what the device is reporting any more, so naming
    /// the original pick would be stale. Expressed structurally in `GpsDriver` — `still` is the only
    /// case carrying a provenance — and asserted here because the structure is easy to widen later.
    @Test("a playing route supersedes the provenance the coordinate came from")
    func routeSupersedesProvenance() {
        let driver = GpsDriver(motion: .route(Self.progress), provenance: .vpnSync)
        #expect(driver == .route(name: "Morning Run"))
        #expect(driver.detail == "Morning Run")
    }

    @Test("a steering vector supersedes provenance too")
    func steeringSupersedesProvenance() {
        #expect(GpsDriver(motion: .steering(Self.steering), provenance: .manual) == .steering)
    }

    /// Holding a coordinate is the one case where provenance is the answer, because nothing is being
    /// done to the coordinate and where it came from is all there is to say.
    @Test("a held coordinate reports its provenance")
    func stillReportsProvenance() {
        #expect(GpsDriver(motion: .still, provenance: .vpnSync) == .still(.vpnSync))
        #expect(GpsDriver(motion: .still, provenance: .manual) == .still(.manual))
        #expect(GpsDriver(motion: .still, provenance: .fromApp) == .still(.fromApp))
    }

    /// `nil` motion is "no computer is spoofing", which is **not** the same as holding a coordinate.
    /// Conflating the two would report a held position as nothing happening.
    @Test("no spoofing computer is not the same as holding a coordinate")
    func noMotionIsNotStill() {
        #expect(GpsDriver(motion: nil, provenance: .manual) == .notDriving)
        #expect(GpsDriver(motion: .still, provenance: .manual) != .notDriving)
    }

    /// A mode the computer isn't delivering must not read as though it were working.
    @Test("an undelivered mode is marked a problem rather than a state")
    func undeliveredIsAProblem() {
        let driver = GpsDriver(motion: .notDelivered(asked: .route), provenance: .vpnSync)
        #expect(driver == .undelivered(asked: .route))
        #expect(driver.isProblem)
        #expect(!GpsDriver(motion: .still, provenance: .vpnSync).isProblem)
    }

    // MARK: Provenance decoding

    /// An unrecognised provenance draws **no** source row rather than one reading "unknown" — a word
    /// that describes our parser, not the customer's device. `title` returning `nil` is the signal.
    @Test("an unnameable provenance yields no source row")
    func unknownProvenanceHasNoTitle() {
        #expect(GpsProvenance(reported: "teleportation") == .unknown)
        #expect(GpsProvenance(reported: "") == .unknown)
        #expect(GpsProvenance.unknown.label == nil)
        #expect(GpsDriver(motion: .still, provenance: .unknown).title == nil)
    }

    /// The wire values, pinned. These are the agent's spelling and a rename here would silently stop
    /// matching every report.
    @Test("provenance wire values match the agent contract")
    func provenanceWireValues() {
        #expect(GpsProvenance(reported: "vpn-sync") == .vpnSync)
        #expect(GpsProvenance(reported: "manual") == .manual)
        #expect(GpsProvenance(reported: "from-app") == .fromApp)
    }

    // MARK: Fixtures

    static let progress = GpsRouteProgress(
        name: "Morning Run",
        travelledM: 400,
        totalM: 1_000,
        remainingSecs: 500,
        paused: false,
        finished: false,
        speedDefaulted: false,
        repeats: false
    )

    static let steering = GpsSteeringDetail(
        headingDeg: 90,
        speedMps: 1.4,
        travelledM: 120,
        deadline: nil,
        held: false,
        expired: false
    )
}

/// The route library: the identity split it exists to enforce, and the recovery path that keeps a
/// derived index from being able to lose somebody's routes.
///
/// The identity tests need no filesystem and are the load-bearing ones. The store tests get a
/// temporary directory through `GpsRouteStore(root:)` — the reason that type takes its root as a
/// property instead of reading Application Support from a static.
@Suite("GPS route library")
struct GpsRouteLibraryTests {

    // MARK: Entity id vs content id
    //
    // The whole reason `GpsSavedRoute` exists rather than storing a `GpsRoute` directly.

    /// Changing the pace derives a **new** content id — that is required, because the agent caches by
    /// id and would otherwise keep playing the old pace — while the library entry stays one entry.
    ///
    /// A library keyed by the content hash would have grown a duplicate on every pace change.
    @Test("a pace change moves the content id and keeps the entity id")
    func paceChangeKeepsEntityID() {
        var saved = Self.sample(speed: .fixed(mps: 1.4))
        let entityID = saved.id
        let contentBefore = saved.playbackRoute().id

        saved.speed = .fixed(mps: 6)
        let contentAfter = saved.playbackRoute().id

        #expect(contentBefore != contentAfter, "the agent would serve its cached route at the old pace")
        #expect(saved.id == entityID, "the library would show this as a second, duplicate route")
    }

    /// `repeat` is in the hash for the same reason pace is, and must behave the same way.
    @Test("toggling repeat moves the content id and keeps the entity id")
    func repeatToggleKeepsEntityID() {
        var saved = Self.sample()
        let entityID = saved.id
        let before = saved.playbackRoute().id
        saved.repeats = true
        #expect(saved.playbackRoute().id != before)
        #expect(saved.id == entityID)
    }

    /// `name` is excluded from the hash, so renaming must not restart playback.
    @Test("renaming changes neither id")
    func renameChangesNeitherID() {
        var saved = Self.sample()
        let entityID = saved.id
        let contentID = saved.playbackRoute().id
        saved.name = "Something else entirely"
        #expect(saved.playbackRoute().id == contentID, "a rename would restart the route mid-playback")
        #expect(saved.id == entityID)
    }

    /// The playback route carries the user's chosen name, so the agent's report names what they named.
    @Test("the playback route takes the entry's display name")
    func playbackRouteCarriesName() {
        #expect(Self.sample().playbackRoute().name == "Morning Run")
    }

    // MARK: Tolerant decoding

    /// A field added in a later build must not cost somebody their saved routes. The store falls back
    /// rather than throwing, so a strict decoder would silently drop every entry written by an older
    /// build — the same hazard `GpsMotionState` was fixed for.
    @Test("a saved route decodes with fields missing")
    func decodesWithMissingFields() throws {
        let json = Data(#"{"name":"Partial","points":[{"lat":1,"lon":2}]}"#.utf8)
        let saved = try JSONDecoder().decode(GpsSavedRoute.self, from: json)
        #expect(saved.name == "Partial")
        #expect(saved.points.count == 1)
        #expect(saved.speed == .asRecorded)
        #expect(!saved.repeats)
        #expect(saved.source == .unknown)
    }

    /// An unrecognised `source` degrades rather than failing the entry's decode.
    @Test("an unknown source decodes to unknown rather than throwing")
    func unknownSourceDecodes() throws {
        let json = Data(#"{"name":"X","source":"telepathy","points":[{"lat":1,"lon":2}]}"#.utf8)
        #expect(try JSONDecoder().decode(GpsSavedRoute.self, from: json).source == .unknown)
    }

    @Test("the wire key for repeat is repeat, not repeats")
    func repeatWireKey() throws {
        let json = Data(#"{"name":"X","repeat":true,"points":[{"lat":1,"lon":2}]}"#.utf8)
        #expect(try JSONDecoder().decode(GpsSavedRoute.self, from: json).repeats)
    }

    // MARK: Store behaviour

    @Test("a saved route round-trips through the store")
    func saveAndLoad() throws {
        let store = try Self.temporaryStore()
        let saved = Self.sample()
        #expect(store.save(saved) == nil)

        let loaded = store.load(id: saved.id)
        #expect(loaded?.id == saved.id)
        #expect(loaded?.name == "Morning Run")
        #expect(store.summaries().map(\.id) == [saved.id])
    }

    /// The index is a cache. Deleting it must cost nothing, because the files are the truth.
    @Test("a deleted index is rebuilt from the route files")
    func rebuildsAMissingIndex() throws {
        let store = try Self.temporaryStore()
        let a = Self.sample(name: "A")
        let b = Self.sample(name: "B")
        #expect(store.save(a) == nil)
        #expect(store.save(b) == nil)

        let index = try #require(store.root).appendingPathComponent(GpsRouteStore.indexFilename)
        try FileManager.default.removeItem(at: index)

        #expect(Set(store.summaries().map(\.id)) == Set([a.id, b.id]))
        #expect(FileManager.default.fileExists(atPath: index.path), "the rebuild should rewrite it")
    }

    /// A stale index must not produce a phantom row. This is the failure direction that matters: a
    /// route listed but absent is a tap that goes nowhere.
    @Test("an index naming a route that no longer exists is corrected")
    func staleIndexIsCorrected() throws {
        let store = try Self.temporaryStore()
        let a = Self.sample(name: "A")
        let b = Self.sample(name: "B")
        #expect(store.save(a) == nil)
        #expect(store.save(b) == nil)

        // Remove a route file behind the store's back, as a partial restore or a user with a file
        // browser could.
        let root = try #require(store.root)
        try FileManager.default.removeItem(
            at: root.appendingPathComponent("\(b.id.uuidString).json")
        )

        #expect(store.summaries().map(\.id) == [a.id], "b is gone from disk and must go from the list")
    }

    /// And the other direction: a route file the index doesn't know about must not stay hidden.
    @Test("a route file missing from the index is picked up")
    func unlistedRouteIsPickedUp() throws {
        let store = try Self.temporaryStore()
        let a = Self.sample(name: "A")
        #expect(store.save(a) == nil)

        let b = Self.sample(name: "B")
        let root = try #require(store.root)
        try JSONEncoder().encode(b).write(
            to: root.appendingPathComponent("\(b.id.uuidString).json")
        )

        #expect(Set(store.summaries().map(\.id)) == Set([a.id, b.id]))
    }

    /// **Refused, not evicted.** Deleting a route somebody chose to keep, to make room for one they
    /// didn't ask to replace it, is the worse outcome.
    @Test("the library refuses a new route past the cap rather than evicting one")
    func capRefusesRatherThanEvicts() throws {
        let store = try Self.temporaryStore()
        var first: GpsSavedRoute?
        for i in 0..<GpsRouteStore.maxEntries {
            let route = Self.sample(name: "Route \(i)")
            if i == 0 { first = route }
            #expect(store.save(route) == nil)
        }
        #expect(store.summaries().count == GpsRouteStore.maxEntries)

        #expect(
            store.save(Self.sample(name: "One too many"))
                == .libraryFull(limit: GpsRouteStore.maxEntries)
        )
        // Nothing was dropped to make room.
        #expect(store.summaries().count == GpsRouteStore.maxEntries)
        #expect(store.load(id: try #require(first).id) != nil)
    }

    /// The cap must not block editing an entry that already exists, or a rename would start failing
    /// once the library filled up.
    @Test("a full library still accepts an edit to an existing entry")
    func fullLibraryAllowsEdits() throws {
        let store = try Self.temporaryStore()
        var routes: [GpsSavedRoute] = []
        for i in 0..<GpsRouteStore.maxEntries {
            let route = Self.sample(name: "Route \(i)")
            routes.append(route)
            #expect(store.save(route) == nil)
        }
        #expect(store.rename(id: routes[3].id, to: "Renamed"))
        #expect(store.load(id: routes[3].id)?.name == "Renamed")
        #expect(store.summaries().count == GpsRouteStore.maxEntries)
    }

    /// Validation runs on **load**, not only at save, because a file here was not necessarily written
    /// by us — a partial restore, a truncated write, or the desktop's own output.
    @Test("a route file that doesn't validate is absent from the library rather than unplayable in it")
    func invalidFileIsNotServed() throws {
        let store = try Self.temporaryStore()
        let root = try #require(store.root)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)

        let id = UUID()
        // A coordinate the agent would refuse at its door.
        let json = #"{"id":"\#(id.uuidString)","name":"Broken","points":[{"lat":999,"lon":0}]}"#
        try Data(json.utf8).write(to: root.appendingPathComponent("\(id.uuidString).json"))

        #expect(store.load(id: id) == nil)
        #expect(store.summaries().isEmpty, "an unplayable entry is better absent than listed")
    }

    @Test("saving refuses an invalid route")
    func saveRefusesInvalid() throws {
        let store = try Self.temporaryStore()
        let empty = GpsSavedRoute(
            name: "Nothing", source: .gpxImport, points: [], speed: .asRecorded, repeats: false
        )
        #expect(store.save(empty) == .invalid(.noPoints))
        #expect(store.summaries().isEmpty)
    }

    @Test("deleting removes the entry and its index row")
    func deleteRemoves() throws {
        let store = try Self.temporaryStore()
        let saved = Self.sample()
        #expect(store.save(saved) == nil)
        #expect(store.delete(id: saved.id))
        #expect(store.load(id: saved.id) == nil)
        #expect(store.summaries().isEmpty)
    }

    @Test("renaming to whitespace is refused rather than blanking the name")
    func renameRefusesBlank() throws {
        let store = try Self.temporaryStore()
        let saved = Self.sample()
        #expect(store.save(saved) == nil)
        #expect(!store.rename(id: saved.id, to: "   "))
        #expect(store.load(id: saved.id)?.name == "Morning Run")
    }

    /// A store whose directory can't be resolved behaves as an empty, unwritable library rather than
    /// crashing — the same direction `GpsMotionStateStore.load` fails in.
    @Test("a store with no resolvable root degrades instead of crashing")
    func nilRootDegrades() {
        let store = GpsRouteStore(root: nil)
        #expect(store.summaries().isEmpty)
        #expect(store.load(id: UUID()) == nil)
        #expect(store.save(Self.sample()) == .writeFailed)
        #expect(!store.delete(id: UUID()))
    }

    // MARK: Summaries

    @Test("a summary describes the route without carrying its points")
    func summaryMetadata() {
        let summary = Self.sample().summary
        #expect(summary.pointCount == 3)
        #expect(summary.lengthMeters > 0)
        #expect(summary.name == "Morning Run")
        // The sample's points carry no offsets, so `asRecorded` must not be offered for it.
        #expect(!summary.hasTimings)
    }

    @Test("a fully timed route reports usable timings")
    func timedRouteHasTimings() {
        let timed = GpsSavedRoute(
            name: "Timed",
            source: .gpxImport,
            points: [
                GpsRoutePoint(lat: 51.5, lon: -0.1, offsetSecs: 0),
                GpsRoutePoint(lat: 51.501, lon: -0.1, offsetSecs: 60),
            ],
            speed: .asRecorded,
            repeats: false
        )
        #expect(timed.hasTimings)
    }

    // MARK: Adoption

    @Test("adopting a route takes its own name, falling back when it has none")
    func adoptionNaming() {
        let route = GpsRoute(
            id: "ignored", name: "  Coastal Path  ", points: Self.points,
            speed: .fixed(mps: 1.4), repeats: false
        )
        #expect(GpsSavedRoute(adopting: route, source: .desktop, fallbackName: "fb").name == "Coastal Path")

        let unnamed = GpsRoute(
            id: "ignored", name: nil, points: Self.points, speed: .fixed(mps: 1.4), repeats: false
        )
        #expect(GpsSavedRoute(adopting: unnamed, source: .desktop, fallbackName: "fb").name == "fb")
    }

    /// Adoption normalises, so an entry from the desktop is stored at the resolution its id is
    /// computed at — the property the agent's cache relies on.
    @Test("adoption stores the normalised form")
    func adoptionNormalises() {
        let route = GpsRoute(
            id: "ignored",
            name: "Precise",
            points: [GpsRoutePoint(lat: 51.50000009, lon: -0.10000004, offsetSecs: nil)],
            speed: .fixed(mps: 1.4),
            repeats: false
        )
        let adopted = GpsSavedRoute(adopting: route, source: .desktop, fallbackName: "fb")
        #expect(adopted.points[0].lat == 51.5)
        #expect(adopted.points[0].lon == -0.1)
    }

    // MARK: Fixtures

    static let points = [
        GpsRoutePoint(lat: 51.5007, lon: -0.1246, offsetSecs: nil),
        GpsRoutePoint(lat: 51.5010, lon: -0.1250, offsetSecs: nil),
        GpsRoutePoint(lat: 51.5015, lon: -0.1255, offsetSecs: nil),
    ]

    static func sample(
        name: String = "Morning Run",
        speed: GpsRouteSpeed = .fixed(mps: 1.4)
    ) -> GpsSavedRoute {
        GpsSavedRoute(name: name, source: .gpxImport, points: points, speed: speed, repeats: false)
    }

    /// A store rooted in a fresh temporary directory, so tests never touch the real library.
    static func temporaryStore() throws -> GpsRouteStore {
        let root = URL(fileURLWithPath: NSTemporaryDirectory(), isDirectory: true)
            .appendingPathComponent("route-library-tests/\(UUID().uuidString)", isDirectory: true)
        try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
        return GpsRouteStore(root: root)
    }
}

/// When a tapped playback control counts as answered.
///
/// This is the logic that decides whether a spinner clears, so getting it wrong either strands the
/// control forever or clears it on a report that doesn't describe the request. Both were live risks:
/// `stop` inverts — anything that *isn't* a route confirms it — and reusing the "is it a route?" test
/// for every kind would have left stop spinning until it timed out.
@Suite("GPS pending actions")
struct GpsPendingActionTests {

    @Test("pause is confirmed only once the report says paused")
    func pauseConfirmation() {
        let action = Self.action(.pause)
        #expect(!action.isConfirmed(by: .route(Self.progress(paused: false))))
        #expect(action.isConfirmed(by: .route(Self.progress(paused: true))))
    }

    @Test("resume is confirmed only once the report says it's moving again")
    func resumeConfirmation() {
        let action = Self.action(.resume)
        #expect(!action.isConfirmed(by: .route(Self.progress(paused: true))))
        #expect(action.isConfirmed(by: .route(Self.progress(paused: false))))
        // A finished route is not a resumed one; treating it as confirmation would clear the spinner
        // on a route that never restarted.
        #expect(!action.isConfirmed(by: .route(Self.progress(paused: false, finished: true))))
    }

    @Test("a replay is confirmed by a run that is neither finished nor paused")
    func restartConfirmation() {
        let action = Self.action(.restart)
        #expect(!action.isConfirmed(by: .route(Self.progress(paused: false, finished: true))))
        #expect(action.isConfirmed(by: .route(Self.progress(paused: false))))
    }

    /// **The inverted one.** Stop asks for the route to go away, so a report still describing a route
    /// is the *unconfirmed* case and everything else is confirmation.
    @Test("stop is confirmed by the absence of a route, not its presence")
    func stopConfirmation() {
        let action = Self.action(.stop)
        #expect(!action.isConfirmed(by: .route(Self.progress(paused: false))))
        #expect(action.isConfirmed(by: .still))
        #expect(action.isConfirmed(by: nil))
        #expect(action.isConfirmed(by: .steering(GpsPresentationRuleTests.steering)))
    }

    /// **Regression, found on device.** Right after Start Route is tapped the phase is still `.ready` —
    /// the agent has not picked the request up yet — so the motion detail is `nil`. That must read as
    /// "no answer yet", not as "done".
    ///
    /// It was not this function that got it wrong: `resolvePendingAction` carried a second copy of the
    /// decision that cleared every pending kind on a not-spoofing phase, so the spinner was thrown away
    /// on the first poll and the label snapped back from "Starting…" to "Start Route" within a second.
    /// The timeout could never fire either, so a start that never happened reported nothing. The caller
    /// now routes every kind through here, which is why this input is worth naming on its own.
    @Test("a start is not confirmed merely because nothing is spoofing yet")
    func startIsNotConfirmedByNotSpoofingYet() {
        #expect(!Self.action(.start).isConfirmed(by: nil))
        #expect(!Self.action(.restart).isConfirmed(by: nil))
        // And the counterpart that makes the shared path correct rather than merely uniform: for stop,
        // the same input *is* the answer.
        #expect(Self.action(.stop).isConfirmed(by: nil))
    }

    /// A computer that stopped spoofing, or one that declined the mode, must not read as confirmation
    /// for a request that asked for motion — the caller drops those requests explicitly rather than
    /// letting them resolve as success.
    @Test("a mode the computer isn't delivering never confirms a motion request")
    func notDeliveredNeverConfirms() {
        for kind in [GpsPendingAction.Kind.pause, .resume, .restart, .start] {
            #expect(!Self.action(kind).isConfirmed(by: .notDelivered(asked: .route)))
            #expect(!Self.action(kind).isConfirmed(by: .still))
            #expect(!Self.action(kind).isConfirmed(by: nil))
        }
    }

    /// Every kind needs an in-flight label, and it must describe the request rather than the state it
    /// asks for — "Pausing…", never "Paused". Rendering the destination state is the optimistic lie the
    /// echo gate exists to prevent.
    @Test("every kind has a present-continuous progress label")
    func everyKindHasAProgressLabel() {
        // Compared as `LocalizedStringKey`, which is `Equatable` — enough to assert each kind resolves
        // to a distinct, non-placeholder key without pinning the English wording here.
        let labels = [
            GpsPendingAction.Kind.pause.progressLabel,
            GpsPendingAction.Kind.resume.progressLabel,
            GpsPendingAction.Kind.stop.progressLabel,
        ]
        #expect(Set(labels.map { String(describing: $0) }).count == labels.count)
        // Start and restart deliberately share one label: both begin a route from its first point, and
        // two words for one outcome is noise for a translator.
        #expect(GpsPendingAction.Kind.start.progressLabel == GpsPendingAction.Kind.restart.progressLabel)
    }

    // MARK: Fixtures

    static func action(_ kind: GpsPendingAction.Kind) -> GpsPendingAction {
        GpsPendingAction(kind: kind, startedAt: Date(timeIntervalSince1970: 1_789_300_000))
    }

    static func progress(paused: Bool, finished: Bool = false) -> GpsRouteProgress {
        GpsRouteProgress(
            name: "Morning Run",
            travelledM: 400,
            totalM: 1_000,
            remainingSecs: 500,
            paused: paused,
            finished: finished,
            speedDefaulted: false,
            repeats: false
        )
    }
}
