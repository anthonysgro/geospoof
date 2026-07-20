//
//  Coordinates.swift
//  Shared (App)
//
//  Coordinate & geohash parsing for convenient pasting.
//
//  A byte-faithful Swift port of the extension's `parseCoordinates` /
//  `decodeGeohash` (src/shared/utils/coordinates.ts). The app and the extension
//  MUST read pasted coordinates identically — a user copies a coordinate from
//  Maps, a spreadsheet, a geocaching site, etc. and pastes it into the manual
//  "Enter Coordinates" field — so both parsers are pinned to one hand-authored
//  contract, the shared fixture at tests/fixtures/coordinate-vectors.json
//  (asserted on the TS side by tests/unit/shared/coordinate-vectors.test.ts and
//  on the Swift side by CoordinateParserParityTests). Keeping them in lockstep
//  means the two implementations cannot silently drift.
//
//  Everything here is PURE and FAIL-SAFE: it returns `nil` for anything it can't
//  confidently interpret and never throws. A `nil` simply means "this paste
//  isn't a complete coordinate" so the caller can leave the field alone.
//

import Foundation

/// A parsed coordinate in signed decimal degrees.
struct ParsedCoordinates: Equatable {
    let latitude: Double
    let longitude: Double
}

enum CoordinateParser {

    /// Geohash base-32 alphabet: digits 0-9 and letters b-z with a, i, l, o
    /// removed (the standard geohash "no ambiguous characters" set).
    private static let geohashBase32 = Array("0123456789bcdefghjkmnpqrstuvwxyz")

    private static let latMin = -90.0
    private static let latMax = 90.0
    private static let lonMin = -180.0
    private static let lonMax = 180.0

    private static func isValidLatitude(_ value: Double) -> Bool {
        value.isFinite && value >= latMin && value <= latMax
    }

    private static func isValidLongitude(_ value: Double) -> Bool {
        value.isFinite && value >= lonMin && value <= lonMax
    }

    /// Parse pasted text into decimal-degree coordinates, or `nil` when it isn't
    /// a coordinate we recognize (or is out of range). A labelled or decimal/DMS
    /// pair takes priority; a bare geohash token is the fallback.
    static func parse(_ input: String) -> ParsedCoordinates? {
        // Normalize the Unicode MINUS SIGN (U+2212) to an ASCII hyphen-minus so a
        // value copied from formatted text — or from the app's own "−90 to 90"
        // labels — parses as negative. Only U+2212 is normalized; en/em dashes
        // are deliberately left alone (ambiguous as minus). Mirrors the TS parser.
        let text = input.replacingOccurrences(of: "\u{2212}", with: "-")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        if text.isEmpty { return nil }

        // Explicitly labelled values ("Latitude … Longitude …", "lat: … long: …")
        // are unambiguous, so try them first — such strings would otherwise be
        // refused by the word-guard in the pair path below.
        if let labelled = parseLabelled(text) { return labelled }

        // A coordinate pair carries separators/signs/hemispheres/DMS symbols a
        // geohash never has, so try it next.
        if let pair = parseLatLonPair(text) { return pair }

        // Otherwise a single token drawn from the geohash alphabet (with at least
        // one letter, so plain integers like "42" aren't mistaken for a geohash)
        // decodes to the center of its cell.
        if isLikelyGeohash(text), let decoded = decodeGeohash(text),
            isValidLatitude(decoded.latitude), isValidLongitude(decoded.longitude)
        {
            return decoded
        }

        return nil
    }

    /// Decode a geohash to the center point of the cell it names, or `nil` if the
    /// string contains any character outside the geohash base-32 alphabet.
    ///
    /// Standard algorithm: each character contributes 5 bits, most-significant
    /// first; bits alternate between refining longitude (first) and latitude,
    /// each halving the remaining interval.
    static func decodeGeohash(_ geohash: String) -> ParsedCoordinates? {
        let gh = geohash.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if gh.isEmpty { return nil }

        var refiningLongitude = true
        var latLo = latMin
        var latHi = latMax
        var lonLo = lonMin
        var lonHi = lonMax

        for char in gh {
            guard let value = geohashBase32.firstIndex(of: char) else { return nil }
            var mask = 0b10000
            while mask > 0 {
                let bitIsSet = (value & mask) != 0
                if refiningLongitude {
                    let mid = (lonLo + lonHi) / 2
                    if bitIsSet { lonLo = mid } else { lonHi = mid }
                } else {
                    let mid = (latLo + latHi) / 2
                    if bitIsSet { latLo = mid } else { latHi = mid }
                }
                refiningLongitude.toggle()
                mask >>= 1
            }
        }

        return ParsedCoordinates(latitude: (latLo + latHi) / 2, longitude: (lonLo + lonHi) / 2)
    }

    // MARK: - Labelled values

    /// Parse text that explicitly labels its values — e.g.
    /// `Latitude 39.6689 Longitude -74.1601`, `lat: 39.6689, long: -74.1601`, or
    /// the space-mangled `Latitude39.6689 DegreesLongitude-74.1601 Degrees`.
    /// Requires BOTH a latitude and a longitude label; the labels (not position)
    /// decide which value is which, so it works regardless of order and tolerates
    /// surrounding words. Returns `nil` if either label is missing or out of range.
    private static func parseLabelled(_ text: String) -> ParsedCoordinates? {
        guard let latitude = firstNumber(after: "lat(?:itude)?", in: text),
            let longitude = firstNumber(after: "(?:lon(?:gitude|g)?|lng)", in: text)
        else { return nil }
        guard isValidLatitude(latitude), isValidLongitude(longitude) else { return nil }
        return ParsedCoordinates(latitude: latitude, longitude: longitude)
    }

    /// Find the first signed decimal that follows the `keyword` pattern, allowing
    /// only non-letter/non-digit/non-sign characters in the gap (so the label may
    /// sit flush against its number and one label can't swallow the other's value).
    private static func firstNumber(after keyword: String, in text: String) -> Double? {
        // Mirrors the TS regexes: /lat(?:itude)?[^a-z\d+-]*([+-]?\d+(?:\.\d+)?)/i etc.
        let pattern = "\(keyword)[^a-z\\d+-]*([+-]?\\d+(?:\\.\\d+)?)"
        guard let match = firstCapture(of: pattern, in: text) else { return nil }
        return Double(match)
    }

    // MARK: - Decimal / DMS pairs

    /// Parse a coordinate pair by splitting into two components and assigning each
    /// to latitude or longitude. Hemisphere letters, when present, decide the axis
    /// (and permit "lon, lat" ordering); otherwise latitude-first is assumed.
    private static func parseLatLonPair(_ text: String) -> ParsedCoordinates? {
        // A clean pair contains only digits, signs, separators, DMS symbols and —
        // at most — N/S/E/W markers. Any OTHER letter (e.g. "lat:", "geo:", prose)
        // means we must not guess: a stray "e"/"n" inside a word would otherwise
        // be misread as a hemisphere and swap/flip the result.
        let letters = text.filter { $0.isLetter }
        if !letters.isEmpty && !letters.allSatisfy({ "nsewNSEW".contains($0) }) {
            return nil
        }

        guard let (first, second) = splitPair(text) else { return nil }
        guard let a = parseAngle(first), let b = parseAngle(second) else { return nil }

        let latitude: Double
        let longitude: Double

        if let axisA = a.axis, let axisB = b.axis {
            if axisA == axisB { return nil }
            latitude = axisA == .lat ? a.value : b.value
            longitude = axisA == .lon ? a.value : b.value
        } else if let axisA = a.axis {
            if axisA == .lat {
                latitude = a.value
                longitude = b.value
            } else {
                longitude = a.value
                latitude = b.value
            }
        } else if let axisB = b.axis {
            if axisB == .lat {
                latitude = b.value
                longitude = a.value
            } else {
                longitude = b.value
                latitude = a.value
            }
        } else {
            latitude = a.value
            longitude = b.value
        }

        guard isValidLatitude(latitude), isValidLongitude(longitude) else { return nil }
        return ParsedCoordinates(latitude: latitude, longitude: longitude)
    }

    /// Split a two-coordinate string into its two component substrings: a comma,
    /// two hemisphere-delimited groups (DMS with internal spaces), or two values
    /// separated by whitespace / a punctuation delimiter. `nil` when it can't
    /// confidently find exactly two components.
    private static func splitPair(_ text: String) -> (String, String)? {
        let chars = Array(text)

        // 1. A comma is the least ambiguous separator; exactly one is expected.
        if let firstComma = chars.firstIndex(of: ",") {
            if chars[(firstComma + 1)...].contains(",") { return nil }
            let head = String(chars[..<firstComma])
            let tail = String(chars[(firstComma + 1)...])
            return (head, tail)
        }

        // 2. Exactly two hemisphere letters delimit the groups, e.g.
        //    `40°42'46"N 74°00'21"W` (trailing) or `N40 W74` (leading).
        let hemisphereIndices = chars.indices.filter { "NSEWnsew".contains(chars[$0]) }
        if hemisphereIndices.count == 2 {
            let firstIndex = hemisphereIndices[0]
            let before = String(chars[..<firstIndex])
            if before.contains(where: { $0.isNumber }) {
                // Trailing style: the first letter closes the first group.
                return (String(chars[...firstIndex]), String(chars[(firstIndex + 1)...]))
            }
            // Leading style: the second letter opens the second group.
            let secondIndex = hemisphereIndices[1]
            return (String(chars[..<secondIndex]), String(chars[secondIndex...]))
        }

        // 3. Two plain values separated by whitespace or a punctuation delimiter,
        //    e.g. `40.7128 -74.0060`, `40.7128/-74.0060`, `40.7128 | -74.0060`.
        //    The minus sign is deliberately NOT a delimiter so a negative second
        //    value stays intact.
        let parts = text.split(whereSeparator: { " \t\n\r/|;".contains($0) }).map(String.init)
        if parts.count == 2 { return (parts[0], parts[1]) }

        return nil
    }

    private enum Axis { case lat, lon }
    private struct AngleComponent {
        let value: Double
        let axis: Axis?
    }

    /// Parse a single coordinate component: a signed decimal degree, or a
    /// degrees[/minutes[/seconds]] group, with an optional N/S/E/W hemisphere on
    /// either side. Returns the signed decimal-degree value and the axis its
    /// hemisphere names (or nil), or `nil` if there's no usable number.
    private static func parseAngle(_ raw: String) -> AngleComponent? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return nil }

        var axis: Axis? = nil
        var hemisphereSign = 1.0
        var core = trimmed

        let hemispheres = trimmed.filter { "NSEWnsew".contains($0) }
        if !hemispheres.isEmpty {
            if hemispheres.count > 1 { return nil }
            let letter = Character(hemispheres.uppercased())
            axis = (letter == "N" || letter == "S") ? .lat : .lon
            if letter == "S" || letter == "W" { hemisphereSign = -1 }
            // Replace the single hemisphere letter with a space.
            if let idx = core.firstIndex(where: { "NSEWnsew".contains($0) }) {
                core.replaceSubrange(idx...idx, with: " ")
            }
        }

        let numbers = allNumbers(in: core)
        if numbers.isEmpty || numbers.count > 3 { return nil }

        let degrees = numbers[0]
        let minutes = numbers.count >= 2 ? numbers[1] : 0
        let seconds = numbers.count >= 3 ? numbers[2] : 0
        if !degrees.isFinite { return nil }

        // Minutes and seconds are only meaningful in [0, 60).
        if numbers.count >= 2 && (minutes < 0 || minutes >= 60) { return nil }
        if numbers.count >= 3 && (seconds < 0 || seconds >= 60) { return nil }

        let magnitude = abs(degrees) + minutes / 60 + seconds / 3600
        // A hemisphere letter dictates the sign; otherwise honor a leading minus.
        let sign = axis != nil ? hemisphereSign : (degrees < 0 ? -1 : 1)

        return AngleComponent(value: sign * magnitude, axis: axis)
    }

    // MARK: - Geohash heuristic

    /// True when `text` is a single token that could be a geohash: no whitespace,
    /// only base-32 characters, and at least one letter (a purely numeric token is
    /// far more likely a stray number than a geohash, so we decline it).
    private static func isLikelyGeohash(_ text: String) -> Bool {
        if text.contains(where: { $0.isWhitespace }) { return false }
        let lower = text.lowercased()
        for char in lower where !geohashBase32.contains(char) { return false }
        // All characters are base-32; a letter here is necessarily a valid geohash
        // letter (a/i/l/o are already excluded by the loop above).
        return lower.contains(where: { $0.isLetter })
    }

    // MARK: - Regex helpers

    /// All signed decimals (`[+-]?\d+(?:\.\d+)?`) in `text`, in order.
    private static func allNumbers(in text: String) -> [Double] {
        matches(of: "[+-]?\\d+(?:\\.\\d+)?", in: text).compactMap { Double($0) }
    }

    /// The first capture group of `pattern` (case-insensitive) in `text`, or nil.
    private static func firstCapture(of pattern: String, in text: String) -> String? {
        guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive])
        else { return nil }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        guard let match = regex.firstMatch(in: text, options: [], range: range),
            match.numberOfRanges > 1,
            let captureRange = Range(match.range(at: 1), in: text)
        else { return nil }
        return String(text[captureRange])
    }

    /// All whole-match strings of `pattern` in `text`, in order.
    private static func matches(of pattern: String, in text: String) -> [String] {
        guard let regex = try? NSRegularExpression(pattern: pattern) else { return [] }
        let range = NSRange(text.startIndex..<text.endIndex, in: text)
        return regex.matches(in: text, options: [], range: range).compactMap {
            Range($0.range, in: text).map { String(text[$0]) }
        }
    }
}
