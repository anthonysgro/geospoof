import Foundation
import Testing

@testable import GeoSpoof

/// Cross-language parity for the coordinate/geohash paste parser.
///
/// The native Swift parser (`CoordinateParser.parse`) must produce the same
/// result as the TypeScript `parseCoordinates` (src/shared/utils/coordinates.ts)
/// for every vector in the shared fixture at
/// `tests/fixtures/coordinate-vectors.json`. The TypeScript side is asserted by
/// `tests/unit/shared/coordinate-vectors.test.ts`; this file pins the Swift side
/// to the same hand-authored contract so the app and the extension read pasted
/// coordinates identically and cannot silently drift apart.
///
/// Latitude/longitude are compared with a small epsilon (1e-9): the parse math
/// is identical IEEE-754 on both platforms, so this only absorbs any float
/// formatting differences, not real disagreement.
///
/// ── One-time wiring (this repo has no Swift test target yet) ──────────────
///   1. In Xcode: File ▸ New ▸ Target… ▸ Unit Testing Bundle, hosted by
///      "GeoSpoof (iOS)" and/or "GeoSpoof (macOS)". Xcode 16+ scaffolds a Swift
///      Testing bundle.
///   2. Add this file (and Coordinates.swift) to the target's "Compile Sources".
///   3. If the app module is not named `GeoSpoof`, update the `@testable import`.
/// The fixture JSON is read straight from the source tree via `#filePath`, so no
/// bundle-resource copying is required.
struct CoordinateParserParityTests {

    private static let epsilon = 1e-9

    private struct ValidVector: Decodable {
        let input: String
        let latitude: Double
        let longitude: Double
    }

    private struct InvalidVector: Decodable {
        let input: String
    }

    /// Only the `valid` and `invalid` arrays are decoded; the fixture's
    /// `_comment` key is ignored (Decodable drops unknown keys).
    private struct Fixture: Decodable {
        let valid: [ValidVector]
        let invalid: [InvalidVector]
    }

    /// Resolve the repo-root fixture from this file's compile-time path:
    /// …/safari/GeoSpoofTests/CoordinateParserParityTests.swift → repo root.
    private static func loadFixture() throws -> Fixture {
        let repoRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // GeoSpoofTests
            .deletingLastPathComponent()  // safari
            .deletingLastPathComponent()  // <repo root>
        let url =
            repoRoot
            .appendingPathComponent("tests")
            .appendingPathComponent("fixtures")
            .appendingPathComponent("coordinate-vectors.json")
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(Fixture.self, from: data)
    }

    @Test("Swift coordinate parser matches the shared cross-language fixture")
    func matchesSharedFixture() throws {
        let fixture = try Self.loadFixture()
        // Guard against a truncated / mis-resolved fixture silently passing.
        #expect(
            fixture.valid.count + fixture.invalid.count >= 30,
            "fixture looks truncated — did it resolve from the right path?")

        for vector in fixture.valid {
            let result = CoordinateParser.parse(vector.input)
            #expect(result != nil, "expected \(vector.input.debugDescription) to parse")
            if let result {
                #expect(
                    abs(result.latitude - vector.latitude) < Self.epsilon
                        && abs(result.longitude - vector.longitude) < Self.epsilon,
                    """
                    parse(\(vector.input.debugDescription)) = \
                    (\(result.latitude), \(result.longitude)), \
                    expected (\(vector.latitude), \(vector.longitude))
                    """)
            }
        }

        for vector in fixture.invalid {
            #expect(
                CoordinateParser.parse(vector.input) == nil,
                "expected \(vector.input.debugDescription) to be rejected (nil)")
        }
    }
}
