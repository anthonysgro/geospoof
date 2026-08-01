//
//  ReportedLanguageView.swift
//  GeoSpoof
//
//  Native counterpart to the extension popup's "Reported Language" control:
//  a pushed mode picker, plus a searchable language list for the custom mode.
//

import SwiftUI

extension SpoofLocaleSpoofing {
    /// Short label for a settings row's trailing value, mirroring
    /// `accuracyValueLabel(for:)`. `custom` resolves through `LocaleCatalog` so the
    /// row reads "French (France)" rather than a raw `fr-FR`.
    ///
    /// Lives here rather than on the enum in `SpoofModel.swift` deliberately.
    /// `SpoofModel.swift` is also compiled into `GeoSpoof WidgetExtension`, and a
    /// widget has no Reported Language UI — putting a `LocaleCatalog` reference in
    /// the model would drag the whole ICU-derived catalog (and its ~660-entry
    /// static initializer) into a memory-constrained extension for nothing. Keeping
    /// presentation out of the model is the right layering regardless.
    var rowLabel: String {
        switch self {
        case .off: return "Off"
        case .match: return "Match Location"
        case .custom(let locale): return LocaleCatalog.displayName(for: locale)
        }
    }
}

/// Mode picker for `SpoofLocaleSpoofing`, pushed from the Browser tab.
///
/// Mirrors `AccuracyPickerView`: a checkmark list rather than a `Picker`, so the
/// options can carry their own explanatory copy and so the Pro gate can reject a
/// selection without a segmented control snapping back under the user's finger.
///
/// The custom tag is chosen from a list (`LanguageListView`) rather than typed.
/// The popup can afford a text field because it validates against
/// `Intl.getCanonicalLocales` as you type; on a phone, typing `pt-BR` is not a
/// reasonable ask, and a list makes an invalid tag impossible by construction.
struct ReportedLanguageView: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var pro = ProStore.shared
    @State private var showPaywall = false

    /// Reported Language is a GeoSpoof Pro feature on the Apple apps, matching
    /// `AccuracyPickerView.accuracyLocked` and `SiteFiltersView.filtersLocked`.
    /// The extension enforces the same gate independently via
    /// `computeEffectiveLocaleSpoofing`, which forces `off` whenever the app
    /// reports `proFeaturesBlocked` — so a locked user can't reach a spoofed
    /// locale even if this screen were bypassed. The Chrome/Firefox extensions
    /// don't run this code and keep the feature free.
    private var localeLocked: Bool {
        return !pro.isPro
    }

    var body: some View {
        Form {
            Section {
                ForEach(ReportedLanguageMode.allCases) { mode in
                    Button {
                        select(mode)
                    } label: {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(mode.label).foregroundStyle(.primary)
                                Text(mode.detail)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 12)
                            if currentMode == mode {
                                Image(systemName: "checkmark")
                                    .font(.body.weight(.semibold))
                                    .foregroundStyle(Color.brand)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                }
            } footer: {
                if localeLocked {
                    Text("Reported Language is a GeoSpoof Pro feature. Upgrade to make sites see a language that matches your spoofed location.")
                } else {
                    Text("Changes what websites see: page language, number and date formatting, and the Accept-Language header. Many sites switch language outright, so this is off by default. It does not change GeoSpoof's own language.")
                }
            }

            if case .custom(let tag) = controller.localeSpoofing {
                Section {
                    NavigationLink {
                        LanguageListView(controller: controller, selectedTag: tag)
                    } label: {
                        HStack {
                            Text("Language")
                            Spacer()
                            Text(LocaleCatalog.displayName(for: tag))
                                .foregroundStyle(.secondary)
                        }
                    }
                } footer: {
                    // The raw tag is the thing that actually crosses the bridge and
                    // lands in navigator.language, so surface it rather than hiding
                    // it behind the friendly name.
                    Text("Sites will report \(tag).")
                }
            }
        }
        .navigationTitle("Reported Language")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .sheet(isPresented: $showPaywall) {
            ProPaywallView()
        }
    }

    private var currentMode: ReportedLanguageMode {
        switch controller.localeSpoofing {
        case .off: return .off
        case .match: return .match
        case .custom: return .custom
        }
    }

    private func select(_ mode: ReportedLanguageMode) {
        // Everything except Off is Pro. Pitch the paywall and leave the setting
        // untouched rather than writing a value the extension will refuse.
        if localeLocked && mode != .off {
            showPaywall = true
            return
        }

        switch mode {
        case .off:
            controller.setLocaleSpoofing(.off)
        case .match:
            controller.setLocaleSpoofing(.match)
        case .custom:
            // Seed a concrete tag immediately. `custom` with no locale is not a
            // representable state on the extension side — `validateLocaleSpoofing`
            // collapses it to `off` — so entering this mode must never leave the
            // setting half-configured waiting on a second tap.
            if case .custom = controller.localeSpoofing { return }
            controller.setLocaleSpoofing(.custom(locale: LanguageListView.defaultTag()))
        }
    }
}

/// UI-only mode model for the picker. Maps onto `SpoofLocaleSpoofing`, whose
/// `custom` case carries an associated tag the picker supplies separately.
enum ReportedLanguageMode: String, CaseIterable, Identifiable {
    case off
    case match
    case custom

    var id: String { rawValue }

    var label: String {
        switch self {
        case .off: return "Off"
        case .match: return "Match Location"
        case .custom: return "Choose Language"
        }
    }

    var detail: String {
        switch self {
        case .off: return "Report this device's real language."
        case .match: return "Derive the language from the spoofed location."
        case .custom: return "Report a specific language you pick."
        }
    }
}

/// Searchable list of every tag in `LocaleCatalog`, pushed from the mode picker.
///
/// Selecting a row commits immediately and pops back, which is the standard
/// iOS list-selection behavior (Settings › General › Language & Region) and
/// avoids a redundant confirm step.
struct LanguageListView: View {
    @ObservedObject var controller: SpoofController
    /// The tag selected when this screen appeared, for the checkmark.
    let selectedTag: String

    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    /// The tag to seed `custom` mode with before the user has picked anything.
    ///
    /// Prefers this device's own language when the catalog carries it, so the
    /// first thing shown is familiar and — more importantly — is a real,
    /// coherent tag rather than a placeholder. Falls back to `en-US`, which the
    /// catalog always contains.
    static func defaultTag() -> String {
        if let parts = LocaleCatalog.languageAndRegion(of: Locale.current),
           let candidate = LocaleCatalog.normalizedTag(language: parts.language,
                                                       region: parts.region),
           LocaleCatalog.all.contains(where: { $0.tag == candidate }) {
            return candidate
        }
        return "en-US"
    }

    private var results: [LocaleCatalog.Entry] {
        LocaleCatalog.search(query)
    }

    var body: some View {
        List {
            if results.isEmpty {
                Text("No languages match “\(query)”.")
                    .foregroundStyle(.secondary)
            }
            ForEach(results) { entry in
                Button {
                    controller.setLocaleSpoofing(.custom(locale: entry.tag))
                    dismiss()
                } label: {
                    HStack {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(entry.name).foregroundStyle(.primary)
                            Text(entry.tag)
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                        Spacer(minLength: 12)
                        if entry.tag == selectedTag {
                            Image(systemName: "checkmark")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(Color.brand)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
            }
        }
        .searchable(text: $query, prompt: "Language or region")
        .navigationTitle("Language")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }
}
