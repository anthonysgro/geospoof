//
//  LocaleCatalog.swift
//  GeoSpoof
//
//  The set of BCP-47 language tags the Reported Language picker offers, plus the
//  display-name lookup shared by the picker and the settings rows.
//

import Foundation

/// Language tags offered for `SpoofLocaleSpoofing.custom`, derived from ICU at
/// runtime rather than hand-maintained.
///
/// ── Why derive instead of ship a list ───────────────────────────────────────
///
/// The browser popup takes a free-text tag and validates it with
/// `Intl.getCanonicalLocales` + a runtime support probe. A phone can't offer a
/// text field for this — nobody types `pt-BR` — so the native picker needs a
/// concrete list. Deriving it from `Locale.availableIdentifiers` means the list
/// tracks whatever ICU the OS ships and never drifts out of date, and it's the
/// same ICU that backs JavaScriptCore's `Intl` in Safari, so a tag offered here
/// is a tag the extension can actually resolve.
///
/// ── Why language+region, dropping script ────────────────────────────────────
///
/// ICU canonicalizes Chinese to `zh_Hans_CN`, Serbian to `sr_Cyrl_RS`, and so on.
/// Emitting those verbatim would be *less* realistic, not more: a real browser
/// reports `zh-CN` and `sr-RS`, and the region already implies the script
/// (`zh-CN` → Hans, `zh-TW` → Hant). Since the entire point is to look like an
/// ordinary browser, we collapse to `language-REGION` and let ICU infer the
/// script — which it does identically on both sides of the bridge.
///
/// Yields ~660 tags, every one of which resolves to a localized display name.
enum LocaleCatalog {

    /// A single offering: the BCP-47 tag plus its name in the user's own language.
    struct Entry: Identifiable, Hashable {
        /// BCP-47 tag, hyphenated — exactly what crosses the bridge (`fr-FR`).
        let tag: String
        /// Localized display name for the current UI language ("French (France)").
        let name: String

        var id: String { tag }
    }

    /// Every offered tag, sorted by display name in the user's locale so the list
    /// reads alphabetically to *them* rather than in tag order.
    ///
    /// Computed once. The derivation walks ~1000 ICU identifiers and does a
    /// localized-name lookup per surviving tag, which is far too much to redo on
    /// every SwiftUI body evaluation or search keystroke.
    static let all: [Entry] = buildCatalog()

    /// Tag → display name, for O(1) row labels.
    private static let namesByTag: [String: String] = Dictionary(
        all.map { ($0.tag, $0.name) },
        uniquingKeysWith: { first, _ in first }
    )

    /// Display name for a tag, falling back to the tag itself.
    ///
    /// The fallback matters: a tag can arrive over the bridge from the browser
    /// popup, where any canonical tag is accepted, including ones ICU on this
    /// device won't name (or script-qualified forms the catalog doesn't list). A
    /// row showing `zh-Hans-CN` is honest; a row showing "Unknown" or an empty
    /// string would not be.
    static func displayName(for tag: String) -> String {
        let trimmed = tag.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return tag }
        if let known = namesByTag[trimmed] { return known }
        // Not in the catalog — ask ICU directly before giving up on it.
        let icu = trimmed.replacingOccurrences(of: "-", with: "_")
        if let named = Locale.current.localizedString(forIdentifier: icu), !named.isEmpty {
            return named
        }
        return trimmed
    }

    /// Case- and diacritic-insensitive filter over both the display name and the
    /// tag, so "france", "French", and "fr-FR" all find `fr-FR`.
    static func search(_ query: String) -> [Entry] {
        let trimmed = query.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return all }
        return all.filter { entry in
            entry.name.range(of: trimmed, options: [.caseInsensitive, .diacriticInsensitive]) != nil
                || entry.tag.range(of: trimmed, options: .caseInsensitive) != nil
        }
    }

    // MARK: - Derivation

    /// The language and region of a locale, as plain subtag strings.
    ///
    /// `Locale.language` / `Locale.region` are iOS 16 / macOS 13, and the app still
    /// ships to iOS 15, so the deprecated `languageCode` / `regionCode` remain the
    /// fallback. Both spellings resolve a script-qualified identifier the same way
    /// (`zh_Hans_CN` → `zh` + `CN`), which is what the catalog relies on. Branching
    /// in one place keeps the availability check off the call sites.
    static func languageAndRegion(of locale: Locale) -> (language: String, region: String)? {
        if #available(iOS 16.0, macOS 13.0, *) {
            guard let language = locale.language.languageCode?.identifier,
                  let region = locale.region?.identifier else { return nil }
            return (language, region)
        } else {
            guard let language = locale.languageCode,
                  let region = locale.regionCode else { return nil }
            return (language, region)
        }
    }

    /// Normalize a language/region pair into the BCP-47 form the bridge carries,
    /// or `nil` when the pair isn't a plain `language-REGION`.
    ///
    /// Rejects UN M.49 numeric regions (`es-419`): valid BCP-47, but not something
    /// a browser reports as its locale, so offering it would be a tell.
    static func normalizedTag(language: String, region: String) -> String? {
        guard (2...3).contains(language.count),
              language.allSatisfy({ $0.isLetter }),
              region.count == 2,
              region.allSatisfy({ $0.isLetter }) else { return nil }
        return "\(language.lowercased())-\(region.uppercased())"
    }

    private static func buildCatalog() -> [Entry] {
        var tags = Set<String>()

        for identifier in Locale.availableIdentifiers {
            let locale = Locale(identifier: identifier)
            guard let parts = languageAndRegion(of: locale),
                  let tag = normalizedTag(language: parts.language, region: parts.region)
            else { continue }
            tags.insert(tag)
        }

        let current = Locale.current
        let entries: [Entry] = tags.compactMap { tag in
            let icu = tag.replacingOccurrences(of: "-", with: "_")
            guard let name = current.localizedString(forIdentifier: icu), !name.isEmpty else {
                // Unnameable on this device: omit rather than show a bare tag in a
                // list people scan by name. (Zero occurrences observed, but the
                // catalog must not depend on that.)
                return nil
            }
            return Entry(tag: tag, name: name)
        }

        return entries.sorted {
            $0.name.localizedCaseInsensitiveCompare($1.name) == .orderedAscending
        }
    }
}
