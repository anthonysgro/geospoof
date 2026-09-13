import Foundation
import Testing
@testable import GeoSpoof

/// The shared route-id contract, read from the golden fixture.
///
/// The route id is implemented **twice, in two languages, in two repositories**, and nothing compiles
/// both halves. `tests/fixtures/route-id-fixture.json` is byte-identical with the copy in
/// `geospoof-gps` and is the only thing that keeps the two honest. The Rust side reads it in
/// `agent/src/route_id_fixture.rs`; this is the Swift half.
///
/// **Both sides must read it, or it protects nothing.** A fixture only one side checks is a comment.
///
/// ## Three layers, and the second two are the ones that matter
///
/// 1. **Expected ids.** Catches an implementation that gets the byte layout wrong.
/// 2. **`must_share_an_id`.** Routes that differ in excluded or normalised fields and must therefore
///    hash the same.
/// 3. **`must_all_differ`.** Routes that differ in a field a consumer acts on.
///
/// Layer 1 alone is weak in a specific way: someone who changes the algorithm and regenerates the
/// whole file makes every id assertion pass again. Layers 2 and 3 are properties of the *scheme*
/// rather than of any particular hash, so **they survive regeneration.** A regenerated fixture that
/// has quietly lost a distinction passes layer 1 and fails these — which is exactly how the
/// `speed_kind = 2 unknown` divergence would have been caught before it shipped.
///
/// ## Reading the shared-id group
///
/// `as-recorded == unknown-speed-kind == mixed-offsets == non-monotonic-offsets` encodes four
/// decisions, not arithmetic:
///
/// - an unrecognised `speed.kind` normalises to `as-recorded`
/// - partial offsets are dropped from the whole route
/// - non-monotonic offsets are dropped from the whole route, never repaired
/// - `name`, `id` and `version` are excluded from the hash
///
/// **If one of these goes red, read the fixture's `why` before regenerating anything.** The expected
/// value is a decision someone made deliberately; a red assertion may mean the decision was reverted
/// rather than that the fixture is stale.
///
/// ── One-time wiring (this repo has no Swift test target yet) ──────────────────
/// See the header of `GpsDesiredPayloadTests.swift`. Until a target exists these do not run in CI;
/// see task 9.1 of `.kiro/specs/device-gps-motion/tasks.md`.
@Suite("Route id shared fixture")
struct RouteIdFixtureTests {

    // MARK: Fixture decoding

    private struct Fixture: Decodable {
        var algorithm: String
        var cases: [Case]
        var mustShareAnID: [[String]]
        var mustAllDiffer: [[String]]

        enum CodingKeys: String, CodingKey {
            case algorithm, cases
            case mustShareAnID = "must_share_an_id"
            case mustAllDiffer = "must_all_differ"
        }
    }

    private struct Case: Decodable {
        var name: String
        var why: String
        var route: GpsRoute
        var id: String
        /// The route is given as a *source file* supplies it, so importer normalisation must run
        /// before hashing. Absent means the route is already normalised — and layer 4 below asserts
        /// that normalising it again changes nothing, so a case can't drift into describing a file no
        /// importer would ever produce.
        var normaliseFirst: Bool?

        enum CodingKeys: String, CodingKey {
            case name, why, route, id
            case normaliseFirst = "normalise_first"
        }
    }

    private static let fixture: Fixture = {
        // Four levels up from `safari/GeoSpoofTests/` to the repo root. Resolved from `#filePath`
        // rather than a bundle resource so the fixture needn't be copied into the test target — the
        // copy is the thing being verified, and a second copy would defeat the point.
        let root = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // GeoSpoofTests
            .deletingLastPathComponent()  // safari
            .deletingLastPathComponent()  // repo root
        let url = root
            .appendingPathComponent("tests/fixtures/route-id-fixture.json")
        let data = try! Data(contentsOf: url)
        return try! JSONDecoder().decode(Fixture.self, from: data)
    }()

    private static func route(named name: String) -> GpsRoute {
        guard let c = fixture.cases.first(where: { $0.name == name }) else {
            fatalError("fixture has no case named \(name)")
        }
        return c.normaliseFirst == true ? c.route.normalisedForImport() : c.route
    }

    // MARK: Layer 0 — the fixture itself

    @Test("the fixture is the algorithm this build implements")
    func algorithmMatches() {
        // A future `r2-` would need a migration, not a silently different id.
        #expect(Self.fixture.algorithm == "r1")
        #expect(Self.fixture.cases.count == 13)
    }

    @Test("every case is named by at least one relationship group")
    func everyCaseIsConstrained() {
        // Mirrors the assertion on the Rust side. Without it a case can be added that only confirms
        // this build agrees with itself — passing layer 1 while pinning nothing.
        let grouped = Set(Self.fixture.mustShareAnID.flatMap { $0 })
            .union(Self.fixture.mustAllDiffer.flatMap { $0 })
        for c in Self.fixture.cases {
            #expect(grouped.contains(c.name), "\(c.name) is in no relationship group")
        }
    }

    // MARK: Layer 1 — expected ids

    @Test("every case hashes to its recorded id")
    func idsMatch() {
        for c in Self.fixture.cases {
            let route = c.normaliseFirst == true ? c.route.normalisedForImport() : c.route
            #expect(
                route.derivedID == c.id,
                "\(c.name): got \(route.derivedID), fixture says \(c.id) — \(c.why)"
            )
        }
    }

    // MARK: Layer 2 — routes that must share an id

    @Test("routes differing only in excluded or normalised fields share an id")
    func sharedIds() {
        for group in Self.fixture.mustShareAnID {
            let ids = group.map { Self.route(named: $0).derivedID }
            let distinct = Set(ids)
            #expect(
                distinct.count == 1,
                "these must share an id but produced \(distinct.count): "
                    + zip(group, ids).map { "\($0) -> \($1)" }.joined(separator: ", ")
            )
        }
    }

    // MARK: Layer 3 — routes that must differ

    @Test("routes differing in a field a consumer acts on get different ids")
    func distinctIds() {
        for group in Self.fixture.mustAllDiffer {
            var seen: [String: String] = [:]
            for name in group {
                let id = Self.route(named: name).derivedID
                if let clash = seen[id] {
                    // A collision here means two routes that play differently would share the
                    // agent's cache entry — so one would be played at the other's pace, not merely
                    // deduplicated wrongly.
                    Issue.record("\(name) and \(clash) must differ but both hash to \(id)")
                }
                seen[id] = name
            }
        }
    }

    // MARK: Layer 4 — normalisation is idempotent

    @Test("a case not marked normalise_first is already normalised")
    func alreadyNormalisedCasesAreStable() {
        for c in Self.fixture.cases where c.normaliseFirst != true {
            #expect(
                c.route.normalisedForImport().derivedID == c.route.derivedID,
                "\(c.name) changes under normalisation but isn't marked normalise_first"
            )
        }
    }

    @Test("normalisation is idempotent")
    func normalisationIsIdempotent() {
        for c in Self.fixture.cases {
            let once = c.route.normalisedForImport()
            #expect(once.derivedID == once.normalisedForImport().derivedID, c.name)
        }
    }

    // MARK: The layout details a port gets wrong

    @Test("a non-finite offset encodes as absent, not as present-with-zero")
    func nonFiniteOffsetIsAbsent() {
        // Flagged by the agent side as the live divergence risk for a Swift port, and they were
        // right that the natural spelling gets it wrong: `if let offset = point.offsetSecs` writes
        // the present byte for a NaN.
        //
        // Unreachable through JSON, which has no NaN literal — but reachable in memory, which is
        // where the id is computed, and an importer subtracting two dates produces one from a single
        // bad timestamp. Rust matches playback here: a non-finite offset takes the same branch as a
        // missing one, so encoding it as present would describe a pace no consumer would play.
        let base = GpsRoute(
            id: "x", name: nil,
            points: [
                GpsRoutePoint(lat: 1, lon: 2, offsetSecs: nil),
                GpsRoutePoint(lat: 3, lon: 4, offsetSecs: nil),
            ],
            speed: .asRecorded, repeats: false
        )
        for bad in [Double.nan, .infinity, -.infinity] {
            let withBad = GpsRoute(
                id: "x", name: nil,
                points: [
                    GpsRoutePoint(lat: 1, lon: 2, offsetSecs: bad),
                    GpsRoutePoint(lat: 3, lon: 4, offsetSecs: nil),
                ],
                speed: .asRecorded, repeats: false
            )
            #expect(withBad.canonicalBytes == base.canonicalBytes)
        }
    }

    @Test("negative zero and positive zero are the same bytes")
    func negativeZeroNormalises() {
        // What integer units buy over formatted decimals: one position cannot yield two ids.
        let positive = GpsRoute(
            id: "x", name: nil, points: [GpsRoutePoint(lat: 0.0, lon: 0.0, offsetSecs: nil)],
            speed: .asRecorded, repeats: false
        )
        let negative = GpsRoute(
            id: "x", name: nil, points: [GpsRoutePoint(lat: -0.0, lon: -0.0, offsetSecs: nil)],
            speed: .asRecorded, repeats: false
        )
        #expect(positive.derivedID == negative.derivedID)
    }

    @Test("per-point framing is fixed width, so a duplicated point differs from a single one")
    func framingIsFixedWidth() {
        let one = GpsRoute(
            id: "x", name: nil, points: [GpsRoutePoint(lat: 1, lon: 2, offsetSecs: nil)],
            speed: .asRecorded, repeats: false
        )
        let two = GpsRoute(
            id: "x", name: nil,
            points: [
                GpsRoutePoint(lat: 1, lon: 2, offsetSecs: nil),
                GpsRoutePoint(lat: 1, lon: 2, offsetSecs: nil),
            ],
            speed: .asRecorded, repeats: false
        )
        #expect(one.derivedID != two.derivedID)
        // 25 bytes per point plus a 10-byte trailer.
        #expect(one.canonicalBytes.count == 35)
        #expect(two.canonicalBytes.count == 60)
    }

    @Test("bookkeeping and display fields are excluded")
    func excludedFields() {
        let a = GpsRoute(
            id: "one", name: "Morning run",
            points: [GpsRoutePoint(lat: 1, lon: 2, offsetSecs: nil)],
            speed: .asRecorded, repeats: false
        )
        var b = a
        b.id = "two"
        b.name = "Something else"
        // Renaming a route in the UI must not restart playback, which is what a changed id would do.
        #expect(a.derivedID == b.derivedID)
    }

    // MARK: Importer obligations

    @Test("offsets are all-or-nothing")
    func partialOffsetsDropped() {
        let partial = GpsRoute(
            id: "x", name: nil,
            points: [
                GpsRoutePoint(lat: 1, lon: 2, offsetSecs: 0),
                GpsRoutePoint(lat: 3, lon: 4, offsetSecs: nil),
                GpsRoutePoint(lat: 5, lon: 6, offsetSecs: 20),
            ],
            speed: .asRecorded, repeats: false
        )
        #expect(partial.normalisedForImport().points.allSatisfy { $0.offsetSecs == nil })
    }

    @Test("non-monotonic offsets are dropped, never repaired")
    func nonMonotonicDropped() {
        let backwards = GpsRoute(
            id: "x", name: nil,
            points: [
                GpsRoutePoint(lat: 1, lon: 2, offsetSecs: 0),
                GpsRoutePoint(lat: 3, lon: 4, offsetSecs: 50),
                GpsRoutePoint(lat: 5, lon: 6, offsetSecs: 10),
            ],
            speed: .asRecorded, repeats: false
        )
        let normalised = backwards.normalisedForImport()
        #expect(normalised.points.allSatisfy { $0.offsetSecs == nil })
        // Specifically NOT clamped, sorted or interpolated. A repaired route plays confidently and
        // wrongly — which is how `fells_loop.gpx` walked a 7-mile loop over five months.
        #expect(normalised.points.map(\.offsetSecs) == [nil, nil, nil])
    }

    @Test("repeated timestamps are kept — the rule is non-decreasing, not strictly increasing")
    func repeatedTimestampsKept() {
        // A stationary pause is a recording, not a fault. If either side tightened this to `>`, the
        // fixture's `repeated-timestamps` case would lose its offsets and layer 1 would go red.
        let paused = GpsRoute(
            id: "x", name: nil,
            points: [
                GpsRoutePoint(lat: 1, lon: 2, offsetSecs: 0),
                GpsRoutePoint(lat: 3, lon: 4, offsetSecs: 10),
                GpsRoutePoint(lat: 5, lon: 6, offsetSecs: 10),
                GpsRoutePoint(lat: 7, lon: 8, offsetSecs: 20),
            ],
            speed: .asRecorded, repeats: false
        )
        #expect(paused.normalisedForImport().points.map(\.offsetSecs) == [0, 10, 10, 20])
    }

    @Test("storage is rounded, so the artefact can't disagree with its own id")
    func roundingAtImport() {
        let raw = GpsRoute(
            id: "x", name: nil,
            points: [GpsRoutePoint(lat: 35.6812361111, lon: 139.7671249999, offsetSecs: 1.00049)],
            speed: .asRecorded, repeats: false
        )
        let stored = raw.normalisedForImport()
        // Coordinates to 6 decimals, offsets to milliseconds.
        #expect(stored.points[0].lat == 35.681236)
        #expect(abs(stored.points[0].offsetSecs! - 1.0) < 1e-9)
        // And rounding is half-away-from-zero, not half-to-even: 0.0000005 goes up, where
        // `String(format:)` would take it down.
        let half = GpsRoute(
            id: "x", name: nil, points: [GpsRoutePoint(lat: 1.0000005, lon: 0, offsetSecs: nil)],
            speed: .asRecorded, repeats: false
        )
        #expect(half.normalisedForImport().points[0].lat == 1.000001)
    }
}
