import Foundation
import Testing
@testable import GeoSpoof

/// The `desired.json` payload contract, and in particular the one guarantee in it that is
/// *negative*: an unrelated write must not disturb motion the user asked for.
///
/// `SpoofController.buildGpsDesiredPayload` is the Swift half of a wire format whose other half
/// is `DesiredState` in the geospoof-gps `contract` crate, documented in
/// `geospoof-gps/APP_CONTRACT.md`. It is deliberately pure — every input is a parameter — so
/// the contract can be asserted with no host app, no App Group container, and no device.
///
/// ── Why the central test here exists ─────────────────────────────────────────
/// `writePending()` has many callers: enabling protection, `setLocation`, timezone resolution,
/// entitlement refresh, favorites, scope changes. Each one rewrites `desired.json`. If any of
/// them serialized motion from foreground view state instead of the persisted record, the
/// symptom would be:
///
///   • for a route — playback silently stops, or restarts from the first point
///   • for steering — worse. Omitting the `steering` object does not merely fail to update it,
///     it *ends* the session. The agent then falls back to `latitude`/`longitude`, which during
///     steering is the stale seed from where the session began, and the device jumps backwards.
///
/// A user reports that as "it randomly jumped". It is silent, intermittent, and untraceable
/// from the outside, which is exactly the class of defect worth spending a test on.
///
/// ── Running these ─────────────────────────────────────────────────────────────
/// Target `GeoSpoofTests`, hosted by "GeoSpoof (iOS)", on the `GeoSpoof-iOS` scheme.
/// `CONTRIBUTING.md` ▸ Swift tests has the command.
///
/// **A new test file must be added to the target explicitly.** The target uses explicit file
/// references rather than a synchronized folder, so a file merely sitting in this directory
/// compiles nowhere and runs nowhere, silently.
///
/// Not yet part of CI — `xcodebuild test` needs a simulator. Task 9.1a of
/// `.kiro/specs/device-gps-motion/tasks.md`. So these guard whoever runs them locally.
@Suite("GPS desired.json payload")
struct GpsDesiredPayloadTests {

    // MARK: Helpers

    /// A route loaded and playing.
    private static func playingRoute(
        id: String = "morning-run",
        startedAt: Double = 1_789_300_000,
        paused: Bool = false,
        repeats: Bool = false,
        startTravelledM: Double? = nil
    ) -> GpsMotionState {
        GpsMotionState(
            mode: .route,
            routeId: id,
            routeStartedAt: startedAt,
            routePaused: paused,
            routeRepeats: repeats,
            routeStartTravelledM: startTravelledM,
            steering: nil,
            lastConfirmedLatitude: nil,
            lastConfirmedLongitude: nil,
            lastConfirmedAt: nil
        )
    }

    /// A steering session under way, with a position the agent has confirmed.
    private static func steeringSession(
        seq: Double = 7,
        heading: Double = 90,
        speed: Double = 3,
        ttl: Double = 900,
        confirmedAt coordinate: (Double, Double)? = (35.67049, 139.70035)
    ) -> GpsMotionState {
        GpsMotionState(
            mode: .steering,
            routeId: nil,
            routeStartedAt: nil,
            routePaused: false,
            routeRepeats: false,
            steering: GpsSteeringVector(
                seq: seq, headingDeg: heading, speedMps: speed, ttlSecs: ttl
            ),
            lastConfirmedLatitude: coordinate?.0,
            lastConfirmedLongitude: coordinate?.1,
            lastConfirmedAt: coordinate == nil ? nil : 1_789_300_100
        )
    }

    private static func payload(
        motion: GpsMotionState,
        active: Bool = true,
        provenance: String = "manual",
        coordinate: (latitude: Double, longitude: Double)? = (35.6762, 139.6503),
        pro: Bool = true,
        appTransactionJWS: String? = nil,
        entitlementTransactionsJWS: [String] = [],
        ownerId: String? = nil
    ) -> [String: Any] {
        SpoofController.buildGpsDesiredPayload(
            active: active,
            provenance: provenance,
            coordinate: coordinate,
            motion: motion,
            pro: pro,
            appTransactionJWS: appTransactionJWS,
            entitlementTransactionsJWS: entitlementTransactionsJWS,
            ownerId: ownerId
        )
    }

    /// The keys that carry motion intent. Everything this suite protects is in here.
    private static let motionKeys = [
        "motion", "route_id", "route_paused", "route_started_at", "route_start_travelled_m", "steering",
    ]

    private static func motionSlice(_ obj: [String: Any]) -> String {
        // Compared as sorted JSON rather than field by field, so a key *added* to the payload
        // in future is caught too — a new motion field that varies with unrelated input is the
        // same bug wearing a different name.
        let slice = obj.filter { motionKeys.contains($0.key) }
        let data = try! JSONSerialization.data(withJSONObject: slice, options: [.sortedKeys])
        return String(decoding: data, as: UTF8.self)
    }

    // MARK: The Requirement 2.6 guard

    /// One stand-in for a real `writePending()` trigger that has nothing to do with motion.
    ///
    /// A named closure rather than a dictionary of `Any`, because the varying inputs include a
    /// coordinate tuple and Swift cannot conditionally cast `Any` to a tuple type.
    private struct UnrelatedChange {
        let what: String
        let build: (GpsMotionState) -> [String: Any]
    }

    private static let unrelatedChanges: [UnrelatedChange] = [
        UnrelatedChange(what: "provenance flipped to vpn-sync") {
            Self.payload(motion: $0, provenance: "vpn-sync")
        },
        UnrelatedChange(what: "the chosen coordinate moved to Paris") {
            Self.payload(motion: $0, coordinate: (latitude: 48.8584, longitude: 2.2945))
        },
        UnrelatedChange(what: "no coordinate at all") {
            Self.payload(motion: $0, coordinate: nil)
        },
        UnrelatedChange(what: "entitlement lapsed") {
            Self.payload(motion: $0, pro: false)
        },
        UnrelatedChange(what: "a signed app transaction arrived") {
            Self.payload(motion: $0, appTransactionJWS: "signed-app-transaction")
        },
        UnrelatedChange(what: "entitlement transactions arrived") {
            Self.payload(motion: $0, entitlementTransactionsJWS: ["tx-a", "tx-b"])
        },
        UnrelatedChange(what: "a controlling computer was chosen") {
            Self.payload(motion: $0, ownerId: "mac-abc123")
        },
    ]

    @Test("an unrelated write cannot disturb a playing route")
    func routeSurvivesUnrelatedWrites() {
        let motion = Self.playingRoute()
        let baseline = Self.motionSlice(Self.payload(motion: motion))

        for change in Self.unrelatedChanges {
            #expect(
                Self.motionSlice(change.build(motion)) == baseline,
                "\(change.what) changed the motion payload"
            )
        }
    }

    @Test("an unrelated write cannot drop a steering vector")
    func steeringSurvivesUnrelatedWrites() {
        let motion = Self.steeringSession()
        let baseline = Self.motionSlice(Self.payload(motion: motion))

        for change in Self.unrelatedChanges {
            let obj = change.build(motion)
            #expect(
                Self.motionSlice(obj) == baseline,
                "\(change.what) changed the motion payload"
            )
            // Asserted separately from the slice comparison, because this is the specific
            // failure that *moves the device* rather than merely confusing the UI.
            #expect(obj["steering"] != nil, "\(change.what) dropped the steering vector")
        }
    }

    // MARK: `motion` is always explicit

    @Test("motion is written even when still")
    func stillIsStated() {
        let obj = Self.payload(motion: .idle)
        #expect(obj["motion"] as? String == "still")
        // A loaded-but-unstarted route is `still` WITH a route id — the state inference cannot
        // express, and the reason writing `motion` explicitly is not merely tidy.
        var loadedNotStarted = Self.playingRoute()
        loadedNotStarted.mode = .still
        let held = Self.payload(motion: loadedNotStarted)
        #expect(held["motion"] as? String == "still")
        #expect(held["route_id"] as? String == "morning-run")
    }

    @Test("an unknown mode is never sent to the agent")
    func unknownModeDegradesToStill() {
        // `unknown` exists to absorb a *future agent's* vocabulary on the read side. Asking for
        // it would be requesting a mode we cannot ourselves name; `still` asks the agent to
        // hold the coordinate, which is the safe direction and matches "never invent motion".
        var motion = GpsMotionState.idle
        motion.mode = .unknown
        #expect(Self.payload(motion: motion)["motion"] as? String == "still")
    }

    // MARK: Route fields

    @Test("route fields appear only with a route, and carry the run marker verbatim")
    func routeFields() {
        let obj = Self.payload(motion: Self.playingRoute(startedAt: 1_789_300_000))
        #expect(obj["route_id"] as? String == "morning-run")
        #expect(obj["route_paused"] as? Bool == false)
        // Must be the stored value, not the current clock. Deriving it at serialization time
        // restarts the route on every incidental write, which is the same class of defect as
        // dropping it.
        #expect(obj["route_started_at"] as? Double == 1_789_300_000)

        let idle = Self.payload(motion: .idle)
        #expect(idle["route_id"] == nil)
        #expect(idle["route_paused"] == nil)
        #expect(idle["route_started_at"] == nil)
    }

    @Test("pause is expressed as route_paused, not by disabling")
    func pauseIsNotDisable() {
        let obj = Self.payload(motion: Self.playingRoute(paused: true), active: true)
        #expect(obj["route_paused"] as? Bool == true)
        // The distinction the contract warns about: pause freezes in place and keeps spoofing,
        // disabling reverts to the phone's real GPS. One button must not do both.
        #expect(obj["enabled"] as? Bool == true)
    }

    @Test("an empty route id is treated as no route")
    func emptyRouteIdOmitted() {
        let obj = Self.payload(motion: Self.playingRoute(id: ""))
        #expect(obj["route_id"] == nil)
    }

    // MARK: Steering

    @Test("the steering object carries the vector and no coordinate")
    func steeringShape() {
        let obj = Self.payload(motion: Self.steeringSession(seq: 7, heading: 90, speed: 3, ttl: 900))
        let steering = obj["steering"] as? [String: Any]
        #expect(steering?["seq"] as? Double == 7)
        #expect(steering?["heading_deg"] as? Double == 90)
        #expect(steering?["speed_mps"] as? Double == 3)
        // Always explicit: the agent's default for an absent TTL is short, which is right for a
        // forgetful writer and wrong for a dial someone holds while gaming, where it reads as
        // an unexplained stop.
        #expect(steering?["ttl_secs"] as? Double == 900)
        // The agent owns the position while a vector runs. A coordinate in here would be us
        // asserting something we cannot know from a suspended process.
        #expect(steering?["latitude"] == nil)
        #expect(steering?["longitude"] == nil)
    }

    @Test("zero speed is a real vector, not an absent one")
    func zeroSpeedIsHeld() {
        // Zero means "wait here": vector live, position held. It is what the Live Activity's
        // hold control writes, precisely because it needs no knowledge of the coordinate and so
        // cannot cause a snap-back.
        let obj = Self.payload(motion: Self.steeringSession(speed: 0))
        let steering = obj["steering"] as? [String: Any]
        #expect(steering != nil)
        #expect(steering?["speed_mps"] as? Double == 0)
    }

    @Test("during steering the fallback coordinate is the last confirmed position")
    func steeringPrefersConfirmedPosition() {
        // The seed is only consulted for the first gesture of a session, but if it ever is,
        // the last confirmed position is the better answer and can never be worse than the
        // coordinate the session started from.
        let motion = Self.steeringSession(confirmedAt: (35.67049, 139.70035))
        let coordinate = motion.fallbackCoordinate(chosen: SpoofLocation(latitude: 1, longitude: 2))
        #expect(coordinate?.latitude == 35.67049)
        #expect(coordinate?.longitude == 139.70035)

        // With nothing confirmed yet, the chosen location is the seed.
        let fresh = Self.steeringSession(confirmedAt: nil)
        let seeded = fresh.fallbackCoordinate(chosen: SpoofLocation(latitude: 1, longitude: 2))
        #expect(seeded?.latitude == 1)
        #expect(seeded?.longitude == 2)
    }

    // MARK: Envelope

    @Test("absent means absent — optional keys are omitted, never null")
    func absentKeysOmitted() {
        let obj = Self.payload(motion: .idle, ownerId: nil)
        // The contract distinguishes "nothing to say" from "explicitly nothing", so we must not
        // write nulls into the gaps.
        for key in ["owner_id", "entitlement", "route_id", "steering"] {
            #expect(obj[key] == nil, "\(key) should be omitted entirely")
        }
    }

    @Test("an empty owner id is omitted, so a sole computer still drives")
    func emptyOwnerIdOmitted() {
        #expect(Self.payload(motion: .idle, ownerId: "")["owner_id"] == nil)
    }

    @Test("signed entitlement is sent, and empty halves are omitted")
    func entitlementShape() {
        let both = Self.payload(
            motion: .idle,
            appTransactionJWS: "app-tx",
            entitlementTransactionsJWS: ["tx-a"]
        )
        let entitlement = both["entitlement"] as? [String: Any]
        #expect(entitlement?["app_transaction"] as? String == "app-tx")
        #expect((entitlement?["transactions"] as? [String])?.count == 1)

        // A pure founder has no purchase transactions; sending an empty array would imply
        // material we don't have.
        let founderOnly = Self.payload(motion: .idle, appTransactionJWS: "app-tx")
        #expect((founderOnly["entitlement"] as? [String: Any])?["transactions"] == nil)
    }

    @Test("no coordinate is written while disabled")
    func disabledOmitsCoordinate() {
        let obj = Self.payload(motion: .idle, active: false)
        #expect(obj["enabled"] as? Bool == false)
        #expect(obj["latitude"] == nil)
        #expect(obj["longitude"] == nil)
    }

    // MARK: seq

    @Test("a fresh seq differs from the previous one")
    func seqChanges() {
        // The contract only requires the value to *change* to re-anchor. A timestamp is used
        // rather than a counter because the app and an App Intent are separate processes and a
        // shared counter races between read and write.
        let first = GpsMotionState.newSeq(now: Date(timeIntervalSince1970: 1_789_300_000.000))
        let second = GpsMotionState.newSeq(now: Date(timeIntervalSince1970: 1_789_300_000.050))
        #expect(first != second)
        #expect(second > first)
    }

    // MARK: Persistence round-trip

    @Test("motion state survives a round trip through its codable form")
    func motionStateRoundTrips() {
        // The record crosses a process boundary, so a field that fails to encode would present
        // as an App Intent's gesture being forgotten — indistinguishable from the write never
        // having happened.
        for state in [GpsMotionState.idle, Self.playingRoute(), Self.steeringSession()] {
            let data = try! JSONEncoder().encode(state)
            let back = try! JSONDecoder().decode(GpsMotionState.self, from: data)
            #expect(back == state)
        }
    }
}

/// `route_start_travelled_m` — beginning a run partway along a route.
///
/// See `.kiro/specs/device-gps-motion/route-seek-agreement.md`. The agent reads this field only on the
/// transition into a new run, so the property that matters most is the one asserted last: an incidental
/// write must never invent or move it. A seek that re-fired would drag a playing device backwards, which
/// is the snap-back bug the Requirement 2.6 guard exists for.
@Suite("GPS route seek payload")
struct GpsRouteSeekPayloadTests {

    @Test("a seek is emitted when a run begins partway along")
    func seekEmitted() {
        let obj = Self.payload(motion: Self.route(startTravelledM: 412.5))
        #expect(obj["route_start_travelled_m"] as? Double == 412.5)
    }

    /// Absence is how "from the first point" is spelled on the wire, so the common case must add nothing
    /// to the file. A `0` would occupy a key to say exactly what its own absence says.
    @Test("no seek means no key, and zero is treated as no seek")
    func seekOmitted() {
        #expect(Self.payload(motion: Self.route()).keys.contains("route_start_travelled_m") == false)
        #expect(
            Self.payload(motion: Self.route(startTravelledM: 0))
                .keys.contains("route_start_travelled_m") == false
        )
    }

    /// A NaN would serialize into JSON and the agent treats non-finite as absent anyway — but emitting
    /// one is a defect on our side, so it is filtered at the door.
    @Test("a non-finite or negative seek is never written")
    func nonFiniteSeekFiltered() {
        for bad in [Double.nan, .infinity, -.infinity, -50] {
            #expect(
                Self.payload(motion: Self.route(startTravelledM: bad))
                    .keys.contains("route_start_travelled_m") == false,
                "a non-finite or negative seek must not reach the file"
            )
        }
    }

    /// The seek belongs to the route payload, so it must not appear without one — the agent would have
    /// nothing to apply it to.
    @Test("a seek is not emitted when no route is loaded")
    func seekRequiresARoute() {
        var still = GpsMotionState.idle
        still.routeStartTravelledM = 412.5
        #expect(Self.payload(motion: still).keys.contains("route_start_travelled_m") == false)
    }

    /// **The Requirement 2.6 guard, extended to the seek.**
    ///
    /// Every unrelated `writePending()` trigger must leave it exactly as it was. This is the assertion
    /// that would catch a future refactor deriving the seek from live progress at serialization time —
    /// the same mistake `route_started_at`'s doc comment warns about, with a worse symptom: a route that
    /// silently rewinds every time anything else in the app writes.
    @Test("no unrelated write invents, moves, or drops a seek")
    func unrelatedWritesPreserveTheSeek() {
        let seeked = Self.route(startTravelledM: 412.5)
        let baseline = Self.payload(motion: seeked)["route_start_travelled_m"] as? Double
        #expect(baseline == 412.5)

        for change in Self.unrelatedWrites {
            let after = change.build(seeked)["route_start_travelled_m"] as? Double
            #expect(after == baseline, "\(change.what) changed the seek")
        }

        // And the inverse: an unrelated write must not conjure one onto a run that has none.
        let plain = Self.route()
        for change in Self.unrelatedWrites {
            #expect(
                change.build(plain).keys.contains("route_start_travelled_m") == false,
                "\(change.what) invented a seek"
            )
        }
    }

    // MARK: Fixtures
    //
    // Local rather than shared with `GpsDesiredPayloadTests`, whose helpers are private to that suite.

    private static func route(
        startTravelledM: Double? = nil,
        repeats: Bool = false
    ) -> GpsMotionState {
        GpsMotionState(
            mode: .route,
            routeId: "morning-run",
            routeStartedAt: 1_789_300_000,
            routePaused: false,
            routeRepeats: repeats,
            routeStartTravelledM: startTravelledM,
            steering: nil,
            lastConfirmedLatitude: nil,
            lastConfirmedLongitude: nil,
            lastConfirmedAt: nil
        )
    }

    private static func payload(
        motion: GpsMotionState,
        active: Bool = true,
        provenance: String = "manual",
        coordinate: (latitude: Double, longitude: Double)? = (35.6762, 139.6503),
        pro: Bool = true,
        ownerId: String? = nil
    ) -> [String: Any] {
        SpoofController.buildGpsDesiredPayload(
            active: active,
            provenance: provenance,
            coordinate: coordinate,
            motion: motion,
            pro: pro,
            appTransactionJWS: nil,
            entitlementTransactionsJWS: [],
            ownerId: ownerId
        )
    }

    private struct UnrelatedWrite {
        let what: String
        let build: (GpsMotionState) -> [String: Any]
    }

    /// Stand-ins for the real `writePending()` triggers — enable, `setLocation`, timezone resolve,
    /// entitlement refresh, favorites, scope changes, controller selection.
    private static let unrelatedWrites: [UnrelatedWrite] = [
        UnrelatedWrite(what: "provenance flipped to vpn-sync") {
            Self.payload(motion: $0, provenance: "vpn-sync")
        },
        UnrelatedWrite(what: "the chosen coordinate moved") {
            Self.payload(motion: $0, coordinate: (latitude: 48.8584, longitude: 2.2945))
        },
        UnrelatedWrite(what: "the coordinate was cleared") {
            Self.payload(motion: $0, coordinate: nil)
        },
        UnrelatedWrite(what: "the entitlement lapsed") { Self.payload(motion: $0, pro: false) },
        UnrelatedWrite(what: "a controlling computer was chosen") {
            Self.payload(motion: $0, ownerId: "mac-studio")
        },
        // Device GPS switched off. The motion payload is gated on `motion.routeId`, not on `active`, so
        // the route keys are still written — only the coordinate drops out. Added after a mutation test
        // caught this suite passing while the seek was made to vary with `active`: without this case the
        // guard had a hole in exactly the shape of the bug it exists to catch.
        UnrelatedWrite(what: "device GPS was switched off") { Self.payload(motion: $0, active: false) },
    ]
}

/// `SpoofController.seekOrigin` — the clamp we apply before sending a seek.
///
/// The agent clamps too. This is belt-and-braces on the one boundary that reads as a silent failure.
@Suite("GPS seek origin clamping")
struct GpsSeekOriginTests {

    /// **The boundary that matters.** On a repeating route the agent computes `target_m % total_m`, so a
    /// seek of exactly `total_m` wraps to distance zero — indistinguishable, on screen, from the seek
    /// having been ignored. Holding strictly inside one lap means we never send the ambiguous number.
    @Test("a repeating route is held strictly inside one lap")
    func repeatingClampsBelowTotal() {
        let route = Self.route(repeats: true)
        let total = route.lengthMeters
        let clamped = SpoofController.seekOrigin(total, in: route)
        #expect(clamped != nil)
        #expect((clamped ?? 0) < total, "exactly one lap would wrap to the start line")
        #expect((clamped ?? 0) > total - 1, "and it must still be at the end of the lap, not near it")
    }

    /// A one-shot route has an end, so landing exactly on it is meaningful: the run is finished.
    @Test("a one-shot route clamps to its full length")
    func oneShotClampsToTotal() {
        let route = Self.route(repeats: false)
        let total = route.lengthMeters
        #expect(SpoofController.seekOrigin(total * 2, in: route) == total)
    }

    /// All three collapse to "from the start", which is what absence means on the wire.
    @Test("nil, zero, negative and non-finite all mean no seek")
    func noSeekCases() {
        let route = Self.route()
        #expect(SpoofController.seekOrigin(nil, in: route) == nil)
        #expect(SpoofController.seekOrigin(0, in: route) == nil)
        #expect(SpoofController.seekOrigin(-1, in: route) == nil)
        #expect(SpoofController.seekOrigin(.nan, in: route) == nil)
        #expect(SpoofController.seekOrigin(.infinity, in: route) == nil)
    }

    @Test("a distance inside the route passes through untouched")
    func insideRoutePassesThrough() {
        #expect(SpoofController.seekOrigin(50, in: Self.route()) == 50)
    }

    /// A degenerate route has no distance to seek into, and dividing the lap would be meaningless.
    @Test("a zero-length route accepts no seek")
    func zeroLengthRoute() {
        let degenerate = GpsRoute(
            id: "r", name: nil,
            points: [GpsRoutePoint(lat: 51.5, lon: -0.1, offsetSecs: nil)],
            speed: .fixed(mps: 1.4), repeats: false
        )
        #expect(SpoofController.seekOrigin(10, in: degenerate) == nil)
    }

    private static func route(repeats: Bool = false) -> GpsRoute {
        GpsRoute(
            id: "r1-test",
            name: "Test",
            points: [
                GpsRoutePoint(lat: 51.5000, lon: -0.1000, offsetSecs: nil),
                GpsRoutePoint(lat: 51.5100, lon: -0.1000, offsetSecs: nil),
                GpsRoutePoint(lat: 51.5200, lon: -0.1000, offsetSecs: nil),
            ],
            speed: .fixed(mps: 1.4),
            repeats: repeats
        )
    }
}
