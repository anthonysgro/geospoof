import Foundation
import Testing
@testable import GeoSpoof

/// Cross-language parity for the Reported Language (locale spoofing) setting.
///
/// `SpoofLocaleSpoofing.fromJSON` / `.toJSON` are the Swift half of a bridge
/// contract whose other half is `validateLocaleSpoofing` in
/// `src/shared/locale/resolver.ts`. The setting crosses the App Group as a JSON
/// string in both directions, so the two decoders must agree on every input —
/// especially on what counts as malformed, because they disagree *silently*: a
/// mismatch doesn't crash, it just means the app displays one thing and websites
/// see another.
///
/// The TypeScript contract these vectors encode (resolver.ts:338):
///   • `off` / `match`                → pass through
///   • `custom` with a usable tag     → `custom`
///   • anything else, including a
///     missing/empty/blank/non-string
///     locale on a `custom`           → falls back to `off`
///
/// Swift deliberately does NOT replicate the TS canonicalization
/// (`Intl.getCanonicalLocales`) or the `engineSupportsLocale` probe — it has no
/// JS engine to ask. It doesn't need to: the picker only offers ICU-derived tags
/// from `LocaleCatalog`, and the extension re-validates on adopt and falls back
/// to `off`, so an unsupported tag cannot take effect. These tests pin the part
/// Swift *is* responsible for: structural validity and the fail-closed default.
///
/// ── One-time wiring (this repo has no Swift test target yet) ──────────────
///   1. In Xcode: File ▸ New ▸ Target… ▸ Unit Testing Bundle, hosted by
///      "GeoSpoof (iOS)" and/or "GeoSpoof (macOS)".
///   2. Add this file to the target's "Compile Sources" (SpoofModel.swift and
///      LocaleCatalog.swift already build as part of the app targets).
///   3. If the app module is not named `GeoSpoof`, update the `@testable import`.
struct LocaleSpoofingParityTests {

    // MARK: - Decoding

    @Test("off and match decode as themselves")
    func decodesSimpleModes() {
        #expect(SpoofLocaleSpoofing.fromJSON("{\"mode\":\"off\"}") == .off)
        #expect(SpoofLocaleSpoofing.fromJSON("{\"mode\":\"match\"}") == .match)
    }

    @Test("custom decodes with its tag, and the tag is trimmed")
    func decodesCustom() {
        #expect(
            SpoofLocaleSpoofing.fromJSON("{\"mode\":\"custom\",\"locale\":\"fr-FR\"}")
                == .custom(locale: "fr-FR")
        )
        // The popup trims before committing, but the app must not trust that: a
        // hand-edited App Group value could carry padding.
        #expect(
            SpoofLocaleSpoofing.fromJSON("{\"mode\":\"custom\",\"locale\":\"  ja-JP \"}")
                == .custom(locale: "ja-JP")
        )
    }

    /// Every one of these collapses to `off` in `validateLocaleSpoofing`, so every
    /// one must collapse to `.off` here. This is the half of the contract that
    /// actually protects users: failing closed means "report the real locale",
    /// never "report a half-configured one".
    @Test("malformed input falls back to off, matching validateLocaleSpoofing", arguments: [
        nil,
        "",
        "   ",
        "not json at all",
        "[]",
        "\"a string\"",
        "17",
        "null",
        "{}",
        "{\"mode\":\"bogus\"}",
        "{\"mode\":17}",
        "{\"mode\":null}",
        "{\"locale\":\"fr-FR\"}",
        "{\"mode\":\"custom\"}",
        "{\"mode\":\"custom\",\"locale\":\"\"}",
        "{\"mode\":\"custom\",\"locale\":\"   \"}",
        "{\"mode\":\"custom\",\"locale\":17}",
        "{\"mode\":\"custom\",\"locale\":null}",
        "{\"mode\":\"custom\",\"locale\":[\"fr-FR\"]}",
    ] as [String?])
    func malformedFallsBackToOff(_ json: String?) {
        #expect(SpoofLocaleSpoofing.fromJSON(json) == .off)
    }

    // MARK: - Encoding

    @Test("off and match encode to the exact shape the extension expects")
    func encodesSimpleModes() {
        #expect(SpoofLocaleSpoofing.off.toJSON() == "{\"mode\":\"off\"}")
        #expect(SpoofLocaleSpoofing.match.toJSON() == "{\"mode\":\"match\"}")
    }

    /// Compared as parsed JSON, not as a string: `JSONSerialization` does not
    /// promise key order, and the TS side does a `JSON.parse` so it doesn't care.
    /// Asserting on the literal string would be testing Foundation's whims.
    @Test("custom encodes mode and locale as JSON object members")
    func encodesCustom() throws {
        let json = SpoofLocaleSpoofing.custom(locale: "pt-BR").toJSON()
        let data = try #require(json.data(using: .utf8))
        let object = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        let dict = try #require(object)
        #expect(dict["mode"] as? String == "custom")
        #expect(dict["locale"] as? String == "pt-BR")
        #expect(dict.count == 2, "no extra keys — the TS type is a closed union")
    }

    @Test("an empty custom tag encodes as off rather than an invalid custom")
    func encodesEmptyCustomAsOff() {
        // Not reachable through the picker, but `custom` carries a free String, so
        // the encoder has to fail closed rather than emit
        // {"mode":"custom","locale":""} — which the extension would reject anyway,
        // silently reverting the user's setting.
        #expect(SpoofLocaleSpoofing.custom(locale: "").toJSON() == "{\"mode\":\"off\"}")
        #expect(SpoofLocaleSpoofing.custom(locale: "   ").toJSON() == "{\"mode\":\"off\"}")
    }

    // MARK: - Round trip

    @Test("the three modes survive a round trip")
    func roundTripsModes() {
        for setting: SpoofLocaleSpoofing in [.off, .match, .custom(locale: "de-DE")] {
            #expect(SpoofLocaleSpoofing.fromJSON(setting.toJSON()) == setting)
        }
    }

    /// The picker can only produce tags from the catalog, so every catalog tag has
    /// to survive the bridge unchanged. Catches any future encoder change that
    /// mangles a tag containing characters the current catalog happens not to use.
    @Test("every catalog tag round trips unchanged")
    func roundTripsEveryCatalogTag() {
        for entry in LocaleCatalog.all {
            let setting = SpoofLocaleSpoofing.custom(locale: entry.tag)
            #expect(
                SpoofLocaleSpoofing.fromJSON(setting.toJSON()) == setting,
                "tag \(entry.tag) did not survive the round trip"
            )
        }
    }

    // MARK: - Catalog

    @Test("the catalog is non-empty and every entry is nameable")
    func catalogIsPopulated() {
        #expect(LocaleCatalog.all.count > 100)
        for entry in LocaleCatalog.all {
            #expect(!entry.name.isEmpty, "\(entry.tag) has no display name")
            #expect(entry.tag.contains("-"), "\(entry.tag) is not language-REGION")
        }
    }

    /// Chinese is the regression guard. Deriving the catalog by splitting ICU's
    /// raw identifiers on `_` drops it entirely, because ICU canonicalizes it to
    /// `zh_Hans_CN` — a script-qualified three-part form. Reading language+region
    /// off `Locale` instead is what keeps it in.
    @Test("major locales are offered, including script-qualified ones", arguments: [
        "en-US", "en-GB", "fr-FR", "de-DE", "ja-JP", "ko-KR", "ru-RU",
        "es-ES", "es-MX", "pt-BR", "pt-PT", "hi-IN", "ar-AE",
        "zh-CN", "zh-TW", "zh-HK",
    ])
    func catalogOffersMajorLocales(_ tag: String) {
        #expect(
            LocaleCatalog.all.contains { $0.tag == tag },
            "\(tag) missing from the catalog"
        )
    }

    @Test("the catalog carries no UN M.49 numeric regions")
    func catalogExcludesNumericRegions() {
        // `es-419` (Latin America) is valid BCP-47 but is not something a browser
        // reports as its locale, so offering it would be a fingerprinting tell.
        for entry in LocaleCatalog.all {
            let region = entry.tag.split(separator: "-").last.map(String.init) ?? ""
            #expect(
                region.allSatisfy { $0.isLetter },
                "\(entry.tag) has a non-alphabetic region"
            )
        }
    }

    @Test("search matches display name, tag, and is diacritic-insensitive")
    func searchFindsByNameAndTag() {
        #expect(LocaleCatalog.search("fr-FR").contains { $0.tag == "fr-FR" })
        #expect(LocaleCatalog.search("french").contains { $0.tag == "fr-FR" })
        #expect(LocaleCatalog.search("FRENCH").contains { $0.tag == "fr-FR" })
        // Empty query is the unfiltered list, so the list renders before typing.
        #expect(LocaleCatalog.search("").count == LocaleCatalog.all.count)
        #expect(LocaleCatalog.search("   ").count == LocaleCatalog.all.count)
        #expect(LocaleCatalog.search("zzzznotalanguage").isEmpty)
    }

    @Test("displayName falls back to the tag for anything unknown")
    func displayNameFallsBack() {
        // A script-qualified tag can arrive from the browser popup, which accepts
        // any canonical tag. Showing the raw tag is honest; showing "" is not.
        #expect(!LocaleCatalog.displayName(for: "zz-ZZ").isEmpty)
        #expect(LocaleCatalog.displayName(for: "fr-FR") != "fr-FR")
    }

    // MARK: - Row labels

    @Test("row labels are human-readable for every mode")
    func rowLabels() {
        #expect(SpoofLocaleSpoofing.off.rowLabel == "Off")
        #expect(SpoofLocaleSpoofing.match.rowLabel == "Match Location")
        // Resolves through the catalog rather than showing the bare tag.
        #expect(SpoofLocaleSpoofing.custom(locale: "fr-FR").rowLabel != "fr-FR")
        #expect(!SpoofLocaleSpoofing.custom(locale: "fr-FR").rowLabel.isEmpty)
    }
}
