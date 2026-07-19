import Foundation
import Testing

@testable import GeoSpoof

/// Cross-language parity for the Advanced Filtering pattern parser.
///
/// The native Swift parser (`SpoofController.normalizePatternInput`) must
/// produce byte-identical canonical output to the TypeScript `parsePattern`
/// (src/shared/utils/scope.ts) for every vector in the shared fixture at
/// `tests/fixtures/pattern-vectors.json`. The TypeScript side is asserted by
/// `tests/unit/shared/pattern-vectors.test.ts`; this file pins the Swift side to
/// the same hand-authored contract so the two parsers cannot silently drift —
/// which matters because scope lists round-trip across the App Group bridge and
/// are deduped against each other's canonical form.
///
/// ── One-time wiring (this repo has no Swift test target yet) ──────────────
///   1. In Xcode: File ▸ New ▸ Target… ▸ Unit Testing Bundle. Set the host
///      application to "GeoSpoof (iOS)" (and/or add a second bundle hosted by
///      "GeoSpoof (macOS)"). Xcode 16+ scaffolds a Swift Testing bundle.
///   2. Add this file to that test target's "Compile Sources".
///   3. If the app module is not named `GeoSpoof`, update the `@testable import`
///      above to match PRODUCT_MODULE_NAME.
/// The fixture JSON is read straight from the source tree via `#filePath`, so no
/// bundle-resource copying is required.
struct PatternParserParityTests {

    private struct Vector: Decodable {
        let input: String
        let expected: String?
    }

    /// Only the `valid` and `invalid` arrays are decoded; the fixture's
    /// `_comment` key is ignored (Decodable drops unknown keys).
    private struct Fixture: Decodable {
        let valid: [Vector]
        let invalid: [Vector]
    }

    /// Resolve the repo-root fixture from this file's compile-time path:
    /// …/safari/GeoSpoofTests/PatternParserParityTests.swift → repo root.
    private static func loadFixture() throws -> Fixture {
        let repoRoot = URL(fileURLWithPath: #filePath)
            .deletingLastPathComponent()  // GeoSpoofTests
            .deletingLastPathComponent()  // safari
            .deletingLastPathComponent()  // <repo root>
        let url =
            repoRoot
            .appendingPathComponent("tests")
            .appendingPathComponent("fixtures")
            .appendingPathComponent("pattern-vectors.json")
        let data = try Data(contentsOf: url)
        return try JSONDecoder().decode(Fixture.self, from: data)
    }

    @Test("Swift parser matches the shared cross-language fixture")
    func matchesSharedFixture() throws {
        let fixture = try Self.loadFixture()
        // Guard against a truncated / mis-resolved fixture silently passing.
        #expect(
            fixture.valid.count + fixture.invalid.count >= 40,
            "fixture looks truncated — did it resolve from the right path?")

        for vector in fixture.valid + fixture.invalid {
            let actual = SpoofController.normalizePatternInput(vector.input)
            #expect(
                actual == vector.expected,
                """
                normalizePatternInput(\(vector.input.debugDescription)) \
                = \(actual.debugDescription), expected \(vector.expected.debugDescription)
                """)
        }
    }

    @Test("Swift parser rejects over-length input")
    func rejectsOverLengthInput() {
        // Mirror of the TS over-length guard; not encoded in the JSON fixture.
        let tooLong = String(repeating: "a.", count: 1025) + "com"
        #expect(tooLong.utf16.count > 2048)
        #expect(SpoofController.normalizePatternInput(tooLong) == nil)
    }
}
