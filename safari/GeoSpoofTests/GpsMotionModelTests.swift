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
/// ── One-time wiring (this repo has no Swift test target yet) ──────────────────
/// See the header of `GpsDesiredPayloadTests.swift`. Until a target exists these do not run in
/// CI; see task 9.1 of `.kiro/specs/device-gps-motion/tasks.md`.
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
            provenance: "from-app",
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

    private static func askedRoute(startedAt: Double = 1_789_300_000) -> GpsMotionState {
        GpsMotionState(
            mode: .route, routeId: "l-shaped", routeStartedAt: startedAt, routePaused: false,
            steering: nil, lastConfirmedLatitude: nil, lastConfirmedLongitude: nil,
            lastConfirmedAt: nil
        )
    }

    private static func askedSteering(seq: Double = 7) -> GpsMotionState {
        GpsMotionState(
            mode: .steering, routeId: nil, routeStartedAt: nil, routePaused: false,
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
