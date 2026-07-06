//
//  SpoofModel.swift
//  Shared (App)
//
//  Data models, the shared SpoofController view-model, and a few modern-SwiftUI
//  helpers (Liquid Glass + adaptive navigation) used by the native control
//  panel. This is the SwiftUI counterpart to the extension popup.
//
//  NOTE: This layer is intentionally UI-first. Location set / clear / enable
//  reuse the *already-working* App Group "pending" bridge (see
//  SafariWebExtensionHandler.swift + src/background/app-bridge.ts). Everything
//  else — city search results, VPN exit-IP detection, timezone resolution — is
//  local placeholder data marked `// MOCK` until the bridge is extended.
//

import Combine
import SwiftUI
import Foundation
import CoreLocation
import Network
import os
import WidgetKit
// DispatchWorkItem / DispatchQueue are pre-concurrency types; this suppresses
// the Sendable-capture warnings they raise inside the @Sendable NWConnection
// callbacks in StunClient.query.
@preconcurrency import Dispatch
#if os(iOS)
import UIKit
#else
import AppKit
#endif

// MARK: - App Group

enum AppGroup {
    static let suite = "group.com.moonloaf.geospoof"

    // Extension -> App: "last seen" heartbeat (Unix seconds). Written on every
    // native-handler invocation, so the app can tell whether GeoSpoof is
    // actually running in Safari.
    static let extensionLastSeenAt = "extension_lastSeenAt"

    // Extension -> App (current active region, for display).
    static let regionEnabled     = "region_enabled"
    static let regionDisplayName = "region_displayName"
    static let regionCity        = "region_city"
    static let regionCountry     = "region_country"
    static let regionLatitude    = "region_latitude"
    static let regionLongitude   = "region_longitude"
    static let regionUpdatedAt   = "region_updatedAt"
    static let regionWebrtc      = "region_webrtc"
    static let regionPreservePrompt = "region_preservePrompt"
    static let regionVpnSync     = "region_vpnSync"
    static let regionIp          = "region_ip"
    static let regionTzId        = "region_tzId"
    static let regionTzOffset    = "region_tzOffset"
    static let regionTzDst       = "region_tzDst"
    static let regionFavorites   = "region_favorites"
    static let regionScopeMode   = "region_scopeMode"
    static let regionAllowlist   = "region_allowlist"
    static let regionDenylist    = "region_denylist"
    static let regionAccuracySetting = "region_accuracySetting"

    // App -> Extension (a full desired-state snapshot the extension adopts on
    // next launch / tab activity, last-writer-wins by `pending_updatedAt`).
    static let pendingEnabled     = "pending_enabled"
    static let pendingDisplayName = "pending_displayName"
    static let pendingCity        = "pending_city"
    static let pendingCountry     = "pending_country"
    static let pendingTzId        = "pending_tzId"
    static let pendingLatitude    = "pending_latitude"
    static let pendingLongitude   = "pending_longitude"
    static let pendingUpdatedAt   = "pending_updatedAt"
    static let pendingWebrtc      = "pending_webrtc"
    static let pendingPreservePrompt = "pending_preservePrompt"
    static let pendingVpnSync     = "pending_vpnSync"
    static let pendingCleared     = "pending_cleared"
    static let pendingResync      = "pending_resync"
    static let pendingFavorites   = "pending_favorites"
    static let pendingScopeMode   = "pending_scopeMode"
    static let pendingAllowlist   = "pending_allowlist"
    static let pendingDenylist    = "pending_denylist"
    static let pendingAccuracySetting = "pending_accuracySetting"

    // App -> Extension: automatic-background-sync gate. `pending_autoSyncBlocked`
    // is the computed value the extension reads (true = don't auto-sync). It's
    // an inherent Pro capability now — always on for Pro on iOS, with no user
    // toggle — so the app no longer bridges a separate user preference.
    static let pendingAutoSyncBlocked = "pending_autoSyncBlocked"
    static let pendingProFeaturesBlocked = "pending_proFeaturesBlocked"

    // Widget-internal: timestamp of the last widget-initiated re-sync, so the
    // widget button can show a spinner for a minimum window. Written by the
    // resync App Intent.
    static let widgetSyncingAt    = "widget_syncingAt"
    // Widget/Control -> App: timestamp written when a non-Pro user taps a locked
    // widget/control surface. The app consumes it on next activation to present
    // the Pro paywall (the widget can't show a sheet itself). Cleared on read.
    static let widgetRequestPaywall = "widget_requestPaywall"
}

extension Notification.Name {
    /// Posted by ProStore (app target only) whenever Pro entitlement is
    /// resolved or changes. SpoofController observes it to keep the bridged
    /// auto-sync gate current. Decoupled via NotificationCenter so SpoofModel
    /// (which also compiles into the widget target) never references ProStore.
    static let proEntitlementDidChange = Notification.Name("com.moonloaf.geospoof.proEntitlementDidChange")
}

// MARK: - Domain models (mirror src/shared/types/settings.ts)

struct SpoofLocation: Equatable {
    var latitude: Double
    var longitude: Double
    var accuracy: Double = 100
}

struct SpoofLocationName: Equatable {
    var city: String
    var country: String
    var displayName: String
}

struct SpoofTimezone: Equatable {
    var identifier: String
    /// Minutes from UTC (e.g. -480 for PST).
    var offsetMinutes: Int
    var dstOffsetMinutes: Int
    var fallback: Bool = false

    var utcOffsetText: String {
        let sign = offsetMinutes >= 0 ? "+" : "-"
        let mins = abs(offsetMinutes)
        return String(format: "UTC%@%02d:%02d", sign, mins / 60, mins % 60)
    }
}

struct SpoofFavorite: Identifiable, Equatable, Codable {
    let id: String
    var latitude: Double
    var longitude: Double
    var city: String
    var country: String
    var displayName: String
    var label: String?

    /// Chip label priority: user label → city → truncated display name.
    var chipTitle: String {
        if let label, !label.trimmingCharacters(in: .whitespaces).isEmpty { return label }
        if !city.isEmpty { return city }
        if displayName.count > 20 { return String(displayName.prefix(20)) + "…" }
        return displayName
    }

    enum CodingKeys: String, CodingKey {
        case id, latitude, longitude, city, country, displayName, label
    }

    /// Encode `label` explicitly as JSON `null` when nil. Swift's synthesized
    /// Codable omits the key for nil optionals, but the extension validates
    /// favorites against the contract `label: string | null` and rejects a
    /// missing key (`undefined`) — silently dropping every app-created favorite
    /// (which start with `label: nil`) on sync. Emitting `null` honors the
    /// contract so the extension accepts them. (Decoding stays synthesized and
    /// tolerant — a missing key still decodes to nil.)
    func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        try c.encode(id, forKey: .id)
        try c.encode(latitude, forKey: .latitude)
        try c.encode(longitude, forKey: .longitude)
        try c.encode(city, forKey: .city)
        try c.encode(country, forKey: .country)
        try c.encode(displayName, forKey: .displayName)
        if let label {
            try c.encode(label, forKey: .label)
        } else {
            try c.encodeNil(forKey: .label)
        }
    }
}

/// Site-scoping mode (mirrors `ScopeMode` in src/shared/types/settings.ts).
/// "all" preserves the pre-1.1 global behavior.
enum ScopeMode: String, CaseIterable, Identifiable {
    case all
    case allowlist
    case denylist

    var id: String { rawValue }

    var label: String {
        switch self {
        case .all: return "All"
        case .allowlist: return "Allowlist"
        case .denylist: return "Denylist"
        }
    }

    /// One-line description shown under the mode picker (mirrors the popup).
    var detail: String {
        switch self {
        case .all: return "Spoofing applies to every site."
        case .allowlist: return "Spoofing applies only to listed sites."
        case .denylist: return "Spoofing applies to every site except listed ones."
        }
    }

    /// Header label for the active list section.
    var listTitle: String {
        switch self {
        case .denylist: return "Blocked Sites"
        default: return "Allowed Sites"
        }
    }
}

/// Outcome of attempting to add a domain to a scope list, so the UI can show an
/// accurate hint instead of a single catch-all "invalid" message.
enum ScopeAddResult {
    case added
    case duplicate
    case invalid
}

/// How the spoofed `GeolocationCoordinates.accuracy` value is produced. Mirrors
/// the `AccuracySetting` union in src/shared/types/settings.ts:
///   `{"mode":"auto"}` | `{"mode":"fixed","meters":N}` | `{"mode":"range","min":N,"max":N}`
/// (numbers are plain JSON numbers). Bridged through the App Group as a JSON
/// string (passthrough both ways); `accuracySeed` is per-install and stays
/// owned by the extension, so it is intentionally NOT modeled here.
enum SpoofAccuracySetting: Equatable {
    case auto
    case fixed(meters: Int)
    case range(min: Int, max: Int)

    /// Inclusive bounds the emitted accuracy is constrained to (mirrors the
    /// extension's ACCURACY_MIN_M / ACCURACY_MAX_M).
    private static let minMeters = 1
    private static let maxMeters = 10000

    private static func clamp(_ value: Int) -> Int {
        Swift.min(maxMeters, Swift.max(minMeters, value))
    }

    /// Round a JSON number to an integer and clamp into [1, 10000].
    private static func clamp(_ value: Double) -> Int {
        clamp(Int(value.rounded()))
    }

    /// Decode from the JSON string stored in the App Group. Returns `.auto` on
    /// any malformed/unknown input (mirrors the extension's
    /// `validateAccuracySetting`): parses defensively via JSONSerialization,
    /// switches on `mode`, and clamps numbers into [1, 10000].
    static func fromJSON(_ json: String?) -> SpoofAccuracySetting {
        guard let json,
              let data = json.data(using: .utf8),
              let obj = try? JSONSerialization.jsonObject(with: data),
              let dict = obj as? [String: Any],
              let mode = dict["mode"] as? String else {
            return .auto
        }

        switch mode {
        case "auto":
            return .auto
        case "fixed":
            guard let meters = (dict["meters"] as? NSNumber)?.doubleValue,
                  meters.isFinite else { return .auto }
            return .fixed(meters: clamp(meters))
        case "range":
            guard let minRaw = (dict["min"] as? NSNumber)?.doubleValue,
                  let maxRaw = (dict["max"] as? NSNumber)?.doubleValue,
                  minRaw.isFinite, maxRaw.isFinite else { return .auto }
            var lo = minRaw
            var hi = maxRaw
            if lo > hi { swap(&lo, &hi) }
            return .range(min: clamp(lo), max: clamp(hi))
        default:
            return .auto
        }
    }

    /// Encode to the compact JSON the extension expects. Meters/min/max are
    /// rounded + clamped into [1, 10000] for safety.
    func toJSON() -> String {
        switch self {
        case .auto:
            return "{\"mode\":\"auto\"}"
        case .fixed(let meters):
            return "{\"mode\":\"fixed\",\"meters\":\(Self.clamp(meters))}"
        case .range(let lo, let hi):
            let clampedLo = Self.clamp(lo)
            let clampedHi = Self.clamp(hi)
            return "{\"mode\":\"range\",\"min\":\(clampedLo),\"max\":\(clampedHi)}"
        }
    }
}

enum AppLogLevel: Int, CaseIterable, Identifiable {
    case error = 0
    case warn = 1
    case info = 2
    case debug = 3
    case trace = 4

    var id: Int { rawValue }
    var label: String {
        switch self {
        case .error: return "Error"
        case .warn: return "Warning"
        case .info: return "Info"
        case .debug: return "Debug"
        case .trace: return "Trace"
        }
    }
}

/// Persisted keys for the logging controls (read by both the UI via `@AppStorage`
/// and the logger directly via `UserDefaults`).
enum LogSettingsKey {
    nonisolated static let enabled = "app_log_enabled"
    nonisolated static let level = "app_log_level"
}

/// Shared gate for the level-based loggers. ERROR/WARNING always emit;
/// INFO/DEBUG/TRACE require logging enabled and respect the verbosity threshold.
/// State lives in `UserDefaults` so it's readable from any isolation context.
enum AppLogGate {
    nonisolated static var isEnabled: Bool {
        UserDefaults.standard.bool(forKey: LogSettingsKey.enabled)
    }
    nonisolated static var level: AppLogLevel {
        let raw = UserDefaults.standard.object(forKey: LogSettingsKey.level) as? Int
        return AppLogLevel(rawValue: raw ?? AppLogLevel.info.rawValue) ?? .info
    }
    nonisolated static func allows(_ threshold: AppLogLevel) -> Bool {
        isEnabled && level.rawValue >= threshold.rawValue
    }
}

/// A category-scoped, OSLog-backed logger mirroring the extension's
/// `debug-logger`. Each instance maps to a Console.app *category* under the
/// app's subsystem so events can be filtered by area (VPN, Bridge, Location, …).
/// Messages are tagged with a level prefix for quick scanning.
///
/// Usage: `Log.vpn.info("…")`, `Log.bridge.debug("…")`.
struct AppLogger: Sendable {
    let category: String
    private let logger: Logger

    nonisolated static let subsystem = Bundle.main.bundleIdentifier ?? "com.moonloaf.geospoof"

    nonisolated init(_ category: String) {
        self.category = category
        self.logger = Logger(subsystem: AppLogger.subsystem, category: category)
    }

    nonisolated func error(_ message: @autoclosure () -> String) {
        let msg = message()
        logger.error("[ERROR] \(msg, privacy: .public)")
    }
    nonisolated func warn(_ message: @autoclosure () -> String) {
        let msg = message()
        logger.warning("[WARN] \(msg, privacy: .public)")
    }
    nonisolated func info(_ message: @autoclosure () -> String) {
        guard AppLogGate.allows(.info) else { return }
        let msg = message()
        logger.info("[INFO] \(msg, privacy: .public)")
    }
    nonisolated func debug(_ message: @autoclosure () -> String) {
        guard AppLogGate.allows(.debug) else { return }
        let msg = message()
        logger.debug("[DEBUG] \(msg, privacy: .public)")
    }
    nonisolated func trace(_ message: @autoclosure () -> String) {
        guard AppLogGate.allows(.trace) else { return }
        let msg = message()
        logger.debug("[TRACE] \(msg, privacy: .public)")
    }
}

/// Category loggers. Filter Console.app by these category names under the
/// app's bundle-id subsystem.
enum Log {
    /// App/scene lifecycle, foregrounding, init.
    static let app = AppLogger("Lifecycle")
    /// Location set/clear, protection + WebRTC toggles, favorites.
    static let location = AppLogger("Location")
    /// VPN sync: manual, auto-resync poll, path/foreground triggers.
    static let vpn = AppLogger("VPN")
    /// App Group bridge reads/writes to/from the extension.
    static let bridge = AppLogger("Bridge")
    /// Timezone resolution (geocoder, boundary dataset, cache, fallback).
    static let timezone = AppLogger("Timezone")
    /// Bundled data loading (city catalog, timezone boundaries).
    static let data = AppLogger("Data")
    /// Pro entitlement: founder grant resolution, the CloudKit/KVS sync rails,
    /// product loading, purchase + restore. Never log PII here (no Apple ID,
    /// receipt, or account data) — `AppLogger` emits `.public`.
    static let pro = AppLogger("Pro")
}

/// A geocoding-style search hit. Bundled offline sample data for now.
struct PlaceResult: Identifiable, Equatable {
    var id: String { "\(latitude),\(longitude)" }
    let name: String
    let city: String
    let country: String
    let latitude: Double
    let longitude: Double
    let timezoneID: String
    var countryCode: String = ""
    var continent: String = ""

    /// Emoji flag derived from the ISO 3166-1 alpha-2 country code.
    var flag: String {
        let scalars = countryCode.uppercased().unicodeScalars
        guard countryCode.count == 2 else { return "🏳️" }
        var emoji = ""
        for s in scalars where s.value >= 65 && s.value <= 90 {
            if let flagScalar = Unicode.Scalar(0x1F1E6 + s.value - 65) {
                emoji.unicodeScalars.append(flagScalar)
            }
        }
        return emoji.isEmpty ? "🏳️" : emoji
    }
}

// MARK: - City database

/// Small built-in fallback used only if the bundled `cities.json` is missing
/// (e.g. the build script wasn't run). The real catalog (~33k cities) is loaded
/// by `CityStore` from the bundled resource.
enum SamplePlaces {
    static let fallback: [PlaceResult] = [
        PlaceResult(name: "Tokyo, Japan", city: "Tokyo", country: "Japan", latitude: 35.6762, longitude: 139.6503, timezoneID: "Asia/Tokyo", countryCode: "JP"),
        PlaceResult(name: "San Francisco, United States", city: "San Francisco", country: "United States", latitude: 37.7749, longitude: -122.4194, timezoneID: "America/Los_Angeles", countryCode: "US"),
        PlaceResult(name: "New York, United States", city: "New York", country: "United States", latitude: 40.7128, longitude: -74.0060, timezoneID: "America/New_York", countryCode: "US"),
        PlaceResult(name: "London, United Kingdom", city: "London", country: "United Kingdom", latitude: 51.5074, longitude: -0.1278, timezoneID: "Europe/London", countryCode: "GB"),
        PlaceResult(name: "Paris, France", city: "Paris", country: "France", latitude: 48.8566, longitude: 2.3522, timezoneID: "Europe/Paris", countryCode: "FR"),
        PlaceResult(name: "Sydney, Australia", city: "Sydney", country: "Australia", latitude: -33.8688, longitude: 151.2093, timezoneID: "Australia/Sydney", countryCode: "AU"),
    ]
}

/// Loads the bundled offline city catalog (`cities.json`, generated by
/// `safari/scripts/build-cities.mjs`) and serves search / popular queries.
///
/// The catalog is parsed off the main thread once at launch; rows arrive
/// pre-sorted by population, so filtering preserves a sensible ranking for free.
@MainActor
final class CityStore: ObservableObject {
    static let shared = CityStore()

    @Published private(set) var cities: [PlaceResult] = []
    @Published private(set) var isLoaded = false

    /// Lowercased "city country" strings, parallel to `cities`, for fast matching.
    private var index: [String] = []
    private var loading = false

    /// Kick off a one-time background load. Safe to call repeatedly.
    func preload() {
        guard !isLoaded && !loading else { return }
        loading = true
        Log.data.debug("City catalog: loading bundled cities.json")
        Task {
            let loaded = await Self.parseBundle()
            self.cities = loaded.isEmpty ? SamplePlaces.fallback : loaded
            self.index = self.cities.map { "\($0.city.lowercased()) \($0.country.lowercased())" }
            self.isLoaded = true
            self.loading = false
            if loaded.isEmpty {
                Log.data.warn("City catalog: bundled cities.json missing/empty — using \(SamplePlaces.fallback.count)-city fallback")
            } else {
                Log.data.info("City catalog loaded: \(self.cities.count) cities")
            }
        }
    }

    /// A curated, continent-diverse set of recognizable cities for the empty
    /// search state. Matched by (city name, ISO country code) against the
    /// catalog; any that can't be found fall through to the population-based
    /// continent algorithm so the list is always full.
    private static let curatedPopular: [(name: String, cc: String)] = [
        ("New York City", "US"),  // North America
        ("London", "GB"),         // Europe
        ("Tokyo", "JP"),          // Asia
        ("Dubai", "AE"),          // Middle East / Asia
        ("São Paulo", "BR"),      // South America
        ("Sydney", "AU"),         // Oceania
        ("Cape Town", "ZA"),      // Africa
    ]

    /// Recognizable cities spanning continents, with a population-based
    /// continent fallback so the list is never short.
    func popular(_ limit: Int = 7) -> [PlaceResult] {
        var out: [PlaceResult] = []
        var usedCountries = Set<String>()

        for pick in Self.curatedPopular {
            if let match = cities.first(where: { $0.city == pick.name && $0.countryCode == pick.cc }) {
                out.append(match)
                usedCountries.insert(countryKey(match))
                if out.count >= limit { return out }
            }
        }

        // Fallback fill — one largest city per still-unused continent, then by
        // population from unused countries.
        var usedContinents = Set(out.map { $0.continent })
        for city in cities {
            let continent = city.continent
            guard !continent.isEmpty, continent != "AN", !usedContinents.contains(continent) else { continue }
            guard !usedCountries.contains(countryKey(city)) else { continue }
            usedContinents.insert(continent)
            usedCountries.insert(countryKey(city))
            out.append(city)
            if out.count >= limit { return out }
        }
        for city in cities {
            guard !usedCountries.contains(countryKey(city)) else { continue }
            usedCountries.insert(countryKey(city))
            out.append(city)
            if out.count >= limit { break }
        }
        return out
    }

    private func countryKey(_ city: PlaceResult) -> String {
        city.countryCode.isEmpty ? city.country : city.countryCode
    }

    /// Prefix matches first (in population order), then substring matches.
    func search(_ query: String, limit: Int = 60) -> [PlaceResult] {
        let q = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        guard q.count >= 1 else { return [] }

        var prefix: [PlaceResult] = []
        var contains: [PlaceResult] = []
        for (i, key) in index.enumerated() {
            if key.hasPrefix(q) {
                prefix.append(cities[i])
                if prefix.count >= limit { break }
            } else if key.contains(q) && contains.count < limit {
                contains.append(cities[i])
            }
        }
        return Array((prefix + contains).prefix(limit))
    }

    /// Parses the bundled JSON (array-of-arrays) off the main actor.
    nonisolated private static func parseBundle() async -> [PlaceResult] {
        guard let url = Bundle.main.url(forResource: "cities", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let raw = try? JSONSerialization.jsonObject(with: data) as? [[Any]] else {
            return []
        }
        var result: [PlaceResult] = []
        result.reserveCapacity(raw.count)
        for row in raw where row.count >= 6 {
            guard let name = row[0] as? String,
                  let country = row[1] as? String,
                  let lat = (row[2] as? NSNumber)?.doubleValue,
                  let lon = (row[3] as? NSNumber)?.doubleValue else { continue }
            let tz = row[4] as? String ?? ""
            let cc = row.count >= 7 ? (row[6] as? String ?? "") : ""
            let continent = row.count >= 8 ? (row[7] as? String ?? "") : ""
            result.append(PlaceResult(
                name: "\(name), \(country)",
                city: name,
                country: country,
                latitude: lat,
                longitude: lon,
                timezoneID: tz,
                countryCode: cc,
                continent: continent
            ))
        }
        return result
    }
}

// MARK: - SpoofController

/// Shared observable model backing the native control panel. Mirrors the
/// extension's `Settings` shape. Location set/clear/enable write the App Group
/// "pending" record the extension already adopts; all other state is local.
@MainActor
final class SpoofController: ObservableObject {
    @Published var enabled = false
    @Published var location: SpoofLocation?
    @Published var locationName: SpoofLocationName?
    @Published var timezone: SpoofTimezone?
    @Published var webrtcProtection = false
    /// "Preserve location prompts" — when on, spoofed sites show the browser's
    /// native geolocation permission prompt (and real permission state) instead
    /// of silently auto-granting spoofed coords. A plain bool bridged like
    /// `webrtcProtection`. Pro-gated on the Apple apps (see the UI setter);
    /// adoption in refreshFromExtension / restoreLocalPending sets it directly.
    @Published var preserveGeolocationPrompt = false
    @Published var vpnSyncEnabled = false
    /// "Sync my iPhone's system GPS" — the Pro device-GPS layer (design §13).
    /// Independent of the browser spoof: when on (and a location is chosen) the
    /// GeoSpoof GPS desktop agent drives the iPhone's REAL system GPS to the same
    /// location. Default off — moving the real device location is consequential
    /// (Find My, every app), so it's an explicit opt-in, never automatic.
    @Published var deviceGpsEnabled = false
    /// Site-scoping state. Mutated via the explicit setters below (which write
    /// the pending bridge record) and by adoption in refreshFromExtension /
    /// restoreLocalPending (which set them directly, no echo). No didSet, so
    /// adoption never bounces back as a pending write.
    @Published var scopeMode: ScopeMode = .all
    @Published var allowlist: [String] = []
    @Published var denylist: [String] = []
    /// Spoofed-accuracy setting. Like `scopeMode`, mutated via the explicit
    /// setter below (which writes the pending bridge record) and by adoption in
    /// refreshFromExtension / restoreLocalPending (which set it directly, no
    /// echo). No didSet, so adoption never bounces back as a pending write.
    /// `accuracySeed` is per-install / extension-owned and is not modeled here.
    @Published var accuracySetting: SpoofAccuracySetting = .auto
    @Published var favorites: [SpoofFavorite] = [] {
        didSet {
            saveFavorites()
            // Propagate favorite edits to the extension via the bridge, unless
            // we're currently adopting the extension's own list.
            if !isApplyingRemoteState { writePending() }
        }
    }

    // VPN sync UI state
    @Published var isSyncing = false
    @Published var lastSyncedIP: String?
    @Published var vpnError: String?

    /// Inline "list full" flag for the favorites star, auto-clears after a beat.
    @Published var atCapacity = false

    /// When the extension last checked in via the App Group, or nil if we've
    /// never heard from it. Drives the "running in Safari" status. Updated on
    /// every refresh, independent of whether region state changed.
    @Published var extensionLastSeen: Date?

    /// Best-effort "GeoSpoof is running in Safari" signal: the extension has
    /// checked in recently. Proves the extension is enabled and its background
    /// is alive — not necessarily that it's been granted on the current site.
    var isActiveInSafari: Bool {
        guard let extensionLastSeen else { return false }
        return Date().timeIntervalSince(extensionLastSeen) < 7 * 24 * 60 * 60
    }

    let favoritesCapacity = 10

    private let suite = AppGroup.suite

    /// Unix seconds of the most recent local (user-initiated) change. Used for
    /// symmetric last-writer-wins: `refreshFromExtension` only overwrites local
    /// state when the extension's region is newer than our last local change,
    /// so a change made here isn't clobbered before the extension adopts it.
    private var lastLocalChangeAt: TimeInterval = 0

    /// Set while adopting state pushed from the extension, so the `favorites`
    /// didSet doesn't echo that same list straight back into a pending write
    /// (which would bump our local timestamp and cause needless churn).
    private var isApplyingRemoteState = false

    private var foregroundObserver: NSObjectProtocol?
    private var backgroundObserver: NSObjectProtocol?
    /// NWPathMonitor + dedicated queue for OS-level VPN change detection.
    private var pathMonitor: NWPathMonitor?
    private var pathMonitorQueue: DispatchQueue?
    /// Cancels any in-flight debounce + resync task when a newer change arrives.
    private var vpnResyncTask: Task<Void, Never>?
    /// Observes Pro entitlement changes so the auto-sync gate bridged to the
    /// extension stays current (e.g. the moment a user subscribes).
    private var proObserver: NSObjectProtocol?
    /// Last known Pro entitlement, fed by `proEntitlementDidChange`. Decouples
    /// the gate from ProStore (which isn't in the widget target). Defaults
    /// false — the safe state — until ProStore resolves and broadcasts.
    private var cachedIsPro = false
    /// Periodic exit-IP check while VPN sync is on. Catches same-tunnel VPN
    /// server switches, which fire no NWPathMonitor event. On macOS it runs
    /// continuously (the app keeps running when not frontmost); on iOS it's
    /// paused while the app is backgrounded (the OS suspends it anyway).
    private var heartbeatTask: Task<Void, Never>?
    /// Heartbeat cadence. STUN is a single cheap UDP round-trip with no
    /// rate-limit risk, so we poll briskly for a near-instant feel. A tick with
    /// no exit-IP change costs one UDP packet (the IP-diff gate stops there).
    private static let heartbeatInterval: Double = 5

    init() {
        Log.app.info("SpoofController init")
        loadFavorites()
        // Restore the device-GPS opt-in (§13) so the toggle survives relaunch.
        deviceGpsEnabled = UserDefaults(suiteName: suite)?.bool(forKey: "gps_deviceEnabled") ?? false
        // Restore our own last-written desired state BEFORE reconciling with the
        // extension. The app keeps no other durable copy of its toggle/location
        // state, so on a cold launch (iOS terminating the backgrounded app, or
        // the user swiping it away) this is what prevents it from forgetting what
        // the user set and falling back to defaults ("everything off").
        restoreLocalPending()
        refreshFromExtension()
        CityStore.shared.preload()
        startForegroundObserver()
        startNetworkWatcher()
        startHeartbeat()
        observeProEntitlement()
    }

    /// Refresh from the extension whenever the app returns to the foreground
    /// (iOS uses UIKit hosting, so SwiftUI's scenePhase doesn't fire reliably).
    /// Also kicks a VPN re-check, because a VPN *server switch* often reuses the
    /// same tunnel interface and produces no NWPathMonitor callback — opening the
    /// app is then the most reliable signal that the exit IP may have moved.
    /// Set up outside `init` so the escaping closure doesn't capture `self`
    /// mid-initialization (a Swift 6 concurrency error).
    private func startForegroundObserver() {
        #if os(iOS)
        let activeName = UIApplication.didBecomeActiveNotification
        #else
        let activeName = NSApplication.didBecomeActiveNotification
        #endif
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: activeName,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                Log.app.debug("App foregrounded — refreshing from extension + VPN re-check")
                self.refreshFromExtension()
                // Resume the network watcher + heartbeat that were torn down on
                // background, then take a single fresh sample (the network is
                // already settled when the app is opened, so no need to poll —
                // a no-op when the exit IP hasn't moved).
                self.startNetworkWatcher()
                self.startHeartbeat()
                self.scheduleVpnResync(initialDelay: 0, pollFor: 0)
            }
        }
        // iOS suspends background apps, so pause the constant heartbeat poll
        // when backgrounded and resume on foreground. The NWPathMonitor stays
        // up (see pauseBackgroundActivity) so a VPN connect/switch is still
        // caught while the app isn't foregrounded. macOS keeps running when not
        // frontmost, so the heartbeat there runs continuously (started in init).
        #if os(iOS)
        backgroundObserver = NotificationCenter.default.addObserver(
            forName: UIApplication.didEnterBackgroundNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in self?.pauseBackgroundActivity() }
        }
        #endif
    }

    /// Pause only the constant 5s heartbeat poll while backgrounded. The
    /// NWPathMonitor is deliberately left running: it's the event-driven signal
    /// that catches a VPN connect/switch while the app isn't foregrounded (a VPN
    /// change moves the network path), and it's near-free when idle — it fires
    /// only on an actual network change, not on a timer. Any in-flight resync is
    /// left to finish so a switch-then-lock still applies. The per-connection
    /// STUN teardown (see StunClient.query) is what keeps this from leaking.
    private func pauseBackgroundActivity() {
        stopHeartbeat()
    }

    /// Start the foreground heartbeat: a light STUN exit-IP check every
    /// `heartbeatInterval` seconds while VPN sync is on. The IP-diff gate makes
    /// each tick a no-op unless the exit actually moved, so this is the thing
    /// that picks up same-tunnel server switches without any user action.
    private func startHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: UInt64(Self.heartbeatInterval * 1_000_000_000))
                guard !Task.isCancelled else { return }
                guard let self, self.vpnSyncEnabled, !self.autoSyncBlocked else { continue }
                Log.vpn.trace("Heartbeat tick")
                self.scheduleVpnResync(initialDelay: 0, pollFor: 0)
            }
        }
    }

    private func stopHeartbeat() {
        heartbeatTask?.cancel()
        heartbeatTask = nil
    }

    /// Watches for OS-level network path changes (VPN connect/switch/disconnect)
    /// using NWPathMonitor — a push signal, no polling. Every path update funnels
    /// into the shared `scheduleVpnResync` gate; the IP-diff check and steady-
    /// state floor there make redundant callbacks cheap no-ops, so we don't try
    /// to pre-filter path updates (a server switch can reuse the same interface
    /// and would be wrongly suppressed by a description diff).
    private func startNetworkWatcher() {
        guard pathMonitor == nil else { return }
        let monitor = NWPathMonitor()
        let queue = DispatchQueue(label: "com.moonloaf.geospoof.pathmonitor", qos: .utility)
        pathMonitor = monitor
        pathMonitorQueue = queue
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                Log.vpn.debug("Network path changed (status: \(String(describing: path.status)))")
                // A path change may have a transition still settling, so poll
                // briefly for the new exit IP to appear. Short initial delay —
                // by the time the path reports "satisfied" the new exit is
                // usually already live, and the confirm-steady step guards the
                // kill-switch flash.
                self?.scheduleVpnResync(initialDelay: 0.4, pollFor: Self.pathChangePollWindow)
            }
        }
        monitor.start(queue: queue)
    }

    /// Centralized VPN resync gate, shared by the path monitor and the
    /// foreground observer (mirrors `resync-core.ts`'s `triggerResyncCheck`).
    /// Debounces by cancelling any pending task, then polls for the exit IP to
    /// change — firing the moment the new IP is live rather than after a fixed
    /// wait. `initialDelay` gives the VPN a brief head start before the first
    /// sample (0 from the foreground path, where the network is already stable).
    private func scheduleVpnResync(initialDelay: Double, pollFor: Double) {
        guard vpnSyncEnabled, !autoSyncBlocked else { return }
        Log.vpn.debug("scheduleVpnResync(initialDelay: \(initialDelay), pollFor: \(pollFor))")
        vpnResyncTask?.cancel()
        vpnResyncTask = Task { [weak self] in
            guard let self else { return }
            if initialDelay > 0 {
                try? await Task.sleep(nanoseconds: UInt64(initialDelay * 1_000_000_000))
            }
            guard !Task.isCancelled, self.vpnSyncEnabled else { return }
            await self.runVpnResyncCheck(pollFor: pollFor)
        }
    }

    /// Confirm-steady delay: a switch can briefly surface the real ISP IP, so a
    /// changed IP must hold across this window before we commit. Kept short — the
    /// real-IP flash is sub-second — so syncs stay snappy.
    private static let confirmSteadyDelay: Double = 1.0
    /// How long the path-change trigger keeps re-sampling for the new exit IP.
    private static let pathChangePollWindow: Double = 12
    /// Backoff bounds between IP polls.
    private static let pollMinDelay: Double = 0.6
    private static let pollMaxDelay: Double = 2.5

    /// Check the exit IP, and if it changed, confirm it's steady before
    /// geolocating + applying. When `pollFor > 0`, keeps re-sampling with backoff
    /// until the IP changes or the window elapses — so an in-flight VPN switch is
    /// caught the moment its new exit comes up. When `pollFor == 0`, samples
    /// exactly once (the network is already settled; no transition to wait for).
    private func runVpnResyncCheck(pollFor: Double) async {
        Log.vpn.info("VPN resync check started (lastSyncedIP: \(self.lastSyncedIP ?? "none"), pollFor: \(pollFor)s)")
        let deadline = Date().addingTimeInterval(pollFor)
        var delay = Self.pollMinDelay
        var firstPass = true

        while firstPass || Date() < deadline {
            firstPass = false
            guard !Task.isCancelled, vpnSyncEnabled else { return }
            if let ip = try? await VpnLookup.detectPublicIP(), ip != lastSyncedIP {
                Log.vpn.debug("Exit IP changed → \(ip); confirming steady")
                // Confirm-steady before committing.
                try? await Task.sleep(nanoseconds: UInt64(Self.confirmSteadyDelay * 1_000_000_000))
                guard !Task.isCancelled, vpnSyncEnabled else { return }
                if let confirm = try? await VpnLookup.detectPublicIP(), confirm == ip {
                    // Geolocate with one retry — the tunnel may still be routing
                    // when the first request fires, especially on macOS.
                    var geo = try? await VpnLookup.geolocate(ip)
                    if geo == nil {
                        Log.vpn.debug("Geolocate failed for \(ip); retrying in 2s")
                        try? await Task.sleep(nanoseconds: 2_000_000_000)
                        guard !Task.isCancelled, vpnSyncEnabled else { return }
                        geo = try? await VpnLookup.geolocate(ip)
                    }
                    guard let geo else {
                        Log.vpn.warn("Geolocation failed for \(ip) after retry")
                        return
                    }
                    guard !Task.isCancelled, vpnSyncEnabled else { return }
                    applyVpnGeo(geo)
                    return
                }
                Log.vpn.trace("IP still settling; continuing to poll")
                // Still settling — fall through and keep polling.
            }
            // Don't sleep past the deadline (and never sleep in single-shot mode).
            if Date().addingTimeInterval(delay) >= deadline { break }
            try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000_000))
            delay = min(delay * 1.4, Self.pollMaxDelay)
        }
        Log.vpn.debug("VPN resync check ended (no committed change)")
    }

    /// Apply a resolved VPN exit-IP geolocation to local state + the bridge.
    private func applyVpnGeo(_ geo: VpnLookup.Result) {
        Log.vpn.info("VPN synced → \(geo.city.isEmpty ? geo.ip : geo.city), \(geo.country) (\(geo.latitude), \(geo.longitude)) tz=\(geo.timezoneID.isEmpty ? "?" : geo.timezoneID)")
        lastSyncedIP = geo.ip
        location = SpoofLocation(latitude: geo.latitude, longitude: geo.longitude)
        locationName = SpoofLocationName(
            city: geo.city,
            country: geo.country,
            displayName: Self.displayName(
                city: geo.city, country: geo.country,
                lat: geo.latitude, lon: geo.longitude
            )
        )
        // Prefer the geo provider's IANA zone (authoritative for the exit IP and
        // a valid polygon for the map); refine via geocoder only if absent.
        timezone = Self.resolveTimezone(
            latitude: geo.latitude,
            longitude: geo.longitude,
            identifier: geo.timezoneID.isEmpty ? nil : geo.timezoneID
        )
        if geo.timezoneID.isEmpty {
            resolveExactTimezone(latitude: geo.latitude, longitude: geo.longitude)
        }
        if !enabled { enabled = true }
        vpnSyncEnabled = true
        writePending(resync: true)
        Haptics.notify(.success)
    }

    deinit {
        if let foregroundObserver {
            NotificationCenter.default.removeObserver(foregroundObserver)
        }
        if let backgroundObserver {
            NotificationCenter.default.removeObserver(backgroundObserver)
        }
        pathMonitor?.cancel()
        vpnResyncTask?.cancel()
        heartbeatTask?.cancel()
    }

    // MARK: Derived

    var hasLocation: Bool { location != nil }

    /// True when the active location matches a saved favorite (4-dp rounding).
    var activeFavorite: SpoofFavorite? {
        guard let location else { return nil }
        return Self.matchFavorite(location, in: favorites)
    }

    var isActiveFavorite: Bool { activeFavorite != nil }

    static func round4(_ v: Double) -> Double { (v * 10000).rounded() / 10000 }

    static func matchFavorite(_ loc: SpoofLocation, in favorites: [SpoofFavorite]) -> SpoofFavorite? {
        let lat = round4(loc.latitude), lon = round4(loc.longitude)
        return favorites.first { round4($0.latitude) == lat && round4($0.longitude) == lon }
    }

    // MARK: Intents

    func setLocation(latitude: Double, longitude: Double, name: SpoofLocationName?, timezoneID: String? = nil) {
        Log.location.info("setLocation → \(name?.displayName ?? "(\(latitude), \(longitude))") tz=\(timezoneID ?? "resolve")")
        location = SpoofLocation(latitude: latitude, longitude: longitude)
        locationName = name
        timezone = Self.resolveTimezone(latitude: latitude, longitude: longitude, identifier: timezoneID)
        // Setting a location turns protection on, mirroring the popup's flow
        // where a freshly chosen location is immediately active.
        if !enabled { enabled = true }
        vpnSyncEnabled = false
        writePending()

        // When no IANA id was supplied (manual coordinates), refine the
        // estimated zone to the real one via offline point-in-polygon against
        // the bundled boundaries — so the displayed zone and map highlight match
        // what the extension applies.
        if timezoneID == nil {
            resolveExactTimezone(latitude: latitude, longitude: longitude)
        }
    }

    /// Refine an estimated timezone to the real IANA zone for a coordinate.
    ///
    /// Resolution order, best-first:
    ///   1. Apple's native geocoding service (`CLGeocoder` → `placemark.timeZone`)
    ///      — high quality, no API key, requires network.
    ///   2. Offline point-in-polygon over the bundled boundaries — last-resort
    ///      fallback when the device is offline or the geocoder yields nothing.
    /// The crude longitude estimate set by `resolveTimezone` remains visible
    /// until one of these resolves.
    private func resolveExactTimezone(latitude: Double, longitude: Double) {
        Task { @MainActor in
            let resolved = await Self.bestTimezoneID(latitude: latitude, longitude: longitude)
            guard let tzid = resolved else {
                Log.timezone.warn("Exact timezone unresolved for (\(latitude), \(longitude)); keeping estimate")
                return
            }
            // Ignore if the user has since changed/cleared the location.
            guard let current = location,
                  current.latitude == latitude, current.longitude == longitude else {
                Log.timezone.trace("Timezone resolution stale (location changed); discarding \(tzid)")
                return
            }
            Log.timezone.info("Timezone refined → \(tzid) for (\(latitude), \(longitude))")
            timezone = Self.resolveTimezone(latitude: latitude, longitude: longitude, identifier: tzid)
            // Propagate the refined zone to the bridge so the widget (and the
            // extension's adopted record) reflect the accurate IANA zone rather
            // than the longitude estimate written synchronously above.
            writePending(resync: vpnSyncEnabled)
        }
    }

    /// Resolve a coordinate to an IANA timezone id using Apple's geocoding
    /// service first, then the offline boundary dataset as a fallback. Results
    /// are cached by rounded coordinate so repeated activations (favorites, the
    /// VPN watcher re-firing, re-selecting a place) never re-hit any service.
    private static func bestTimezoneID(latitude: Double, longitude: Double) async -> String? {
        let key = coordKey(latitude, longitude)
        if let cached = timezoneIDCache[key] {
            Log.timezone.debug("Timezone cache hit \(key) → \(cached)")
            return cached
        }

        let coord = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        var resolved = await reverseGeocodeTimezoneID(coord)
        if resolved == nil {
            Log.timezone.debug("Geocoder gave no zone for \(key); trying offline boundaries")
            resolved = await TimezoneShapeStore.shared.resolveTimezoneID(for: coord)
        } else {
            Log.timezone.trace("Geocoder resolved \(key) → \(resolved ?? "?")")
        }
        if let resolved { timezoneIDCache[key] = resolved }
        return resolved
    }

    /// In-memory coordinate→timezone cache (rounded to 2 dp ≈ 1 km), capping
    /// CLGeocoder / boundary lookups for coordinates we've already resolved.
    private static var timezoneIDCache: [String: String] = [:]

    private static func coordKey(_ lat: Double, _ lon: Double) -> String {
        String(format: "%.2f,%.2f", lat, lon)
    }

    /// Apple native reverse-geocode → IANA timezone identifier. Returns nil on
    /// failure (offline, throttled, or no placemark) so the caller can fall back.
    private static func reverseGeocodeTimezoneID(_ coordinate: CLLocationCoordinate2D) async -> String? {
        let location = CLLocation(latitude: coordinate.latitude, longitude: coordinate.longitude)
        let placemarks = try? await CLGeocoder().reverseGeocodeLocation(location)
        return placemarks?.first?.timeZone?.identifier
    }

    func setLocation(from place: PlaceResult) {
        setLocation(
            latitude: place.latitude,
            longitude: place.longitude,
            name: SpoofLocationName(city: place.city, country: place.country, displayName: place.name),
            timezoneID: place.timezoneID
        )
    }

    func clearLocation() {
        Log.location.info("Location cleared")
        location = nil
        locationName = nil
        timezone = nil
        vpnSyncEnabled = false
        Haptics.impact(.medium)
        writePending()
    }

    func setEnabled(_ value: Bool) {
        Log.location.info("Protection \(value ? "enabled" : "disabled")")
        enabled = value
        writePending()
    }

    func setWebRTCProtection(_ value: Bool) {
        Log.location.info("WebRTC protection \(value ? "enabled" : "disabled")")
        webrtcProtection = value
        writePending()
    }

    /// Toggle the device-GPS sync layer (§13). Persists the opt-in (so it
    /// survives relaunch) and rewrites `desired.json` so the desktop agent
    /// picks up the change on its next tick.
    func setDeviceGpsEnabled(_ value: Bool) {
        Log.location.info("Device GPS sync \(value ? "enabled" : "disabled")")
        deviceGpsEnabled = value
        UserDefaults(suiteName: suite)?.set(value, forKey: "gps_deviceEnabled")
        writePending()
    }

    /// Toggle "preserve location prompts". Mirrors `setWebRTCProtection`: writes
    /// the pending bridge record so the extension adopts it last-writer-wins.
    /// The Pro gate lives in the UI (the toggle bounces non-Pro users to the
    /// paywall); the extension independently forces the free behavior for a
    /// non-Pro user, so this setter itself stays entitlement-agnostic.
    func setPreserveGeolocationPrompt(_ value: Bool) {
        Log.location.info("Preserve location prompts \(value ? "enabled" : "disabled")")
        preserveGeolocationPrompt = value
        writePending()
    }

    // MARK: Site-scoping

    /// Switch the scope mode. The allow/deny lists are kept independently, so
    /// switching modes never discards the other list's entries.
    func setScopeMode(_ value: ScopeMode) {
        guard scopeMode != value else { return }
        Log.location.info("Scope mode → \(value.rawValue)")
        scopeMode = value
        writePending()
    }

    /// Change the spoofed-accuracy setting. Mirrors `setScopeMode`: writes the
    /// pending bridge record so the extension adopts it last-writer-wins. The
    /// `writePending` call bumps `lastLocalChangeAt`.
    func setAccuracySetting(_ setting: SpoofAccuracySetting) {
        guard setting != accuracySetting else { return }
        Log.location.info("Accuracy setting → \(setting.toJSON())")
        accuracySetting = setting
        writePending()
    }

    /// Add a domain to the given list. The input is lightly normalized here for
    /// immediate display; the extension re-normalizes authoritatively on adopt
    /// and pushes the canonical list back. The result distinguishes an invalid
    /// domain from one that's already present, so the UI can show an accurate
    /// hint rather than a generic "invalid" message.
    @discardableResult
    func addScopeSite(_ raw: String, to mode: ScopeMode) -> ScopeAddResult {
        guard let domain = Self.normalizeDomainInput(raw) else { return .invalid }
        switch mode {
        case .allowlist:
            guard !allowlist.contains(domain) else { return .duplicate }
            allowlist.append(domain)
        case .denylist:
            guard !denylist.contains(domain) else { return .duplicate }
            denylist.append(domain)
        case .all:
            return .invalid
        }
        Log.location.info("Scope site added to \(mode.rawValue): \(domain)")
        Haptics.impact(.light)
        writePending()
        return .added
    }

    /// Remove a domain from the given list.
    func removeScopeSite(_ domain: String, from mode: ScopeMode) {
        switch mode {
        case .allowlist: allowlist.removeAll { $0 == domain }
        case .denylist: denylist.removeAll { $0 == domain }
        case .all: return
        }
        Log.location.info("Scope site removed from \(mode.rawValue): \(domain)")
        Haptics.impact(.light)
        writePending()
    }

    /// The list backing the active mode (empty for `.all`).
    var activeScopeList: [String] {
        switch scopeMode {
        case .allowlist: return allowlist
        case .denylist: return denylist
        case .all: return []
        }
    }

    /// Light domain cleanup mirroring `normalizeDomain` in
    /// src/shared/utils/scope.ts: trim, lowercase, strip scheme / a single
    /// leading `www.` / path / port / query / fragment, and require at least one
    /// dot with DNS-legal characters. Returns nil for unusable input. The
    /// extension is the authoritative normalizer; this just keeps obvious junk
    /// out of the UI and out of the pending record.
    static func normalizeDomainInput(_ raw: String) -> String? {
        guard raw.count <= 2048 else { return nil }
        var s = raw.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        if s.hasPrefix("https://") { s.removeFirst("https://".count) }
        else if s.hasPrefix("http://") { s.removeFirst("http://".count) }
        while s.hasPrefix("www.") { s.removeFirst("www.".count) }
        if let cut = s.firstIndex(where: { $0 == "/" || $0 == ":" || $0 == "?" || $0 == "#" }) {
            s = String(s[s.startIndex..<cut])
        }
        guard !s.isEmpty, s.contains(".") else { return nil }
        let labels = s.split(separator: ".", omittingEmptySubsequences: false)
        let allowed = CharacterSet(charactersIn: "abcdefghijklmnopqrstuvwxyz0123456789-")
        for label in labels {
            if label.isEmpty || label.count > 63 { return nil }
            if label.hasPrefix("-") || label.hasSuffix("-") { return nil }
            if label.unicodeScalars.contains(where: { !allowed.contains($0) }) { return nil }
        }
        return s.count <= 253 ? s : nil
    }


    // MARK: Favorites

    func toggleFavorite() {
        guard let location else { return }
        if let match = Self.matchFavorite(location, in: favorites) {
            favorites.removeAll { $0.id == match.id }
            Log.location.info("Favorite removed (toggle): \(match.chipTitle)")
            Haptics.impact(.light)
            return
        }
        guard favorites.count < favoritesCapacity else {
            Log.location.debug("Favorite add rejected — at capacity (\(favoritesCapacity))")
            Haptics.notify(.warning)
            flashCapacity()
            return
        }
        let name = locationName
        favorites.append(
            SpoofFavorite(
                id: String(Int(Date().timeIntervalSince1970 * 1000)),
                latitude: location.latitude,
                longitude: location.longitude,
                city: name?.city ?? "",
                country: name?.country ?? "",
                displayName: name?.displayName ?? String(format: "%.5f, %.5f", location.latitude, location.longitude),
                label: nil
            )
        )
        Log.location.info("Favorite added: \(name?.displayName ?? "(\(location.latitude), \(location.longitude))") [\(favorites.count)/\(favoritesCapacity)]")
        Haptics.impact(.light)
    }

    func removeFavorite(_ favorite: SpoofFavorite) {
        favorites.removeAll { $0.id == favorite.id }
        Log.location.info("Favorite removed: \(favorite.chipTitle)")
        Haptics.impact(.light)
    }

    func renameFavorite(_ favorite: SpoofFavorite, to label: String) {
        guard let idx = favorites.firstIndex(where: { $0.id == favorite.id }) else { return }
        let trimmed = label.trimmingCharacters(in: .whitespacesAndNewlines)
        favorites[idx].label = trimmed.isEmpty ? nil : trimmed
        Log.location.debug("Favorite renamed → \(trimmed.isEmpty ? "(cleared)" : trimmed)")
    }

    func activate(_ favorite: SpoofFavorite) {
        Log.location.debug("Activating favorite: \(favorite.chipTitle)")
        Haptics.impact(.light)
        setLocation(
            latitude: favorite.latitude,
            longitude: favorite.longitude,
            name: SpoofLocationName(city: favorite.city, country: favorite.country, displayName: favorite.displayName)
        )
    }

    private func flashCapacity() {
        atCapacity = true
        Task { @MainActor in
            try? await Task.sleep(nanoseconds: 3_000_000_000)
            atCapacity = false
        }
    }

    /// Pull-to-refresh handler: re-reads the latest state the extension wrote to
    /// shared storage. Does NOT trigger a VPN resync (that's the extension's job
    /// on tab activity, and the NWPathMonitor push path). A brief minimum
    /// duration keeps the refresh spinner from flickering on an instant read.
    func refreshFromExtensionInteractive() async {
        Log.bridge.debug("Pull-to-refresh: re-reading extension state")
        let start = Date()
        refreshFromExtension()
        let elapsed = Date().timeIntervalSince(start)
        if elapsed < 0.4 {
            try? await Task.sleep(nanoseconds: UInt64((0.4 - elapsed) * 1_000_000_000))
        }
    }

    // MARK: VPN sync

    /// Run a VPN sync from the app: detect the public IP + geolocate it (the app
    /// shares Safari's egress, so this matches the browser's exit IP), apply the
    /// result locally, and push it to the extension as a VPN-synced location. If
    /// the app-side lookup fails, the pending `resync` request still lets the
    /// extension perform its own (more robust) sync when Safari next runs.
    func syncVPN(force: Bool) {
        Task { @MainActor in await performVpnSync() }
    }

    /// Awaitable VPN sync used by the button and by pull-to-refresh. Detects the
    /// public IP + geolocates it (the app shares Safari's egress, so this matches
    /// the browser's exit IP), applies the result, and pushes it to the
    /// extension. On failure the pending `resync` request lets the extension do
    /// its own sync when Safari next runs.
    func performVpnSync() async {
        Log.vpn.info("Manual VPN sync requested")
        vpnSyncEnabled = true
        vpnError = nil
        isSyncing = true
        writePending(resync: true) // record the request immediately (extension fallback)

        do {
            let r = try await VpnLookup.sync()
            Log.vpn.info("Manual VPN sync → \(r.city.isEmpty ? r.ip : r.city), \(r.country) (\(r.latitude), \(r.longitude))")
            lastSyncedIP = r.ip
            location = SpoofLocation(latitude: r.latitude, longitude: r.longitude)
            locationName = SpoofLocationName(
                city: r.city,
                country: r.country,
                displayName: Self.displayName(city: r.city, country: r.country, lat: r.latitude, lon: r.longitude)
            )
            timezone = Self.resolveTimezone(latitude: r.latitude, longitude: r.longitude, identifier: r.timezoneID.isEmpty ? nil : r.timezoneID)
            if !enabled { enabled = true }
            vpnSyncEnabled = true
            writePending(resync: true) // now with resolved coords for the extension to adopt
            Haptics.notify(.success)
            // If the geo provider didn't report a zone, refine the longitude
            // estimate via Apple's geocoder / offline boundaries.
            if r.timezoneID.isEmpty {
                resolveExactTimezone(latitude: r.latitude, longitude: r.longitude)
            }
        } catch {
            Log.vpn.warn("Manual VPN sync failed: \(error.localizedDescription)")
            vpnError = "Couldn't detect your VPN location. Check your connection and try again."
            Haptics.notify(.error)
        }
        isSyncing = false
    }

    func setVPNSync(_ value: Bool) {
        if value {
            Log.vpn.info("VPN sync enabled")
            // Enabling sync immediately resolves the current exit IP.
            syncVPN(force: true)
        } else {
            Log.vpn.info("VPN sync disabled — clearing synced location")
            vpnSyncEnabled = false
            lastSyncedIP = nil
            vpnError = nil
            location = nil
            locationName = nil
            timezone = nil
            writePending()
        }
    }

    /// Whether automatic background VPN re-sync is *blocked* for this user.
    /// Background re-sync is a Pro capability on the Apple apps (iOS + macOS):
    /// when VPN sync is active it auto-follows the exit IP, but only for Pro
    /// (founders/subscribers, via `cachedIsPro`). The browser extensions on
    /// Chrome/Firefox/Android don't run this code and are unaffected (their flag
    /// defaults false). This single value is bridged to the extension as
    /// `pending_autoSyncBlocked` — the extension can't tell iOS from macOS, so
    /// the app is the authority.
    var autoSyncBlocked: Bool {
        return !cachedIsPro
    }

    /// Whether Pro-only *configuration* features (per-site filtering, custom
    /// accuracy) are blocked for this user. Gated on Pro across the Apple apps
    /// (iOS + macOS); founders/subscribers are exempt via `cachedIsPro`. The
    /// Chrome/Firefox/Android extensions don't run this code and keep these
    /// features free (their flag defaults false). Bridged to the extension as
    /// `pending_proFeaturesBlocked` so it can enforce (e.g. force scope "all").
    var proFeaturesBlocked: Bool {
        return !cachedIsPro
    }

    /// Re-publish the auto-sync gate to the extension whenever Pro entitlement
    /// changes (subscribe, founder resolve, lapse). Driven by a NotificationCenter
    /// broadcast from ProStore — no direct type coupling, so SpoofModel still
    /// compiles in the widget target (which doesn't include ProStore).
    private func observeProEntitlement() {
        proObserver = NotificationCenter.default.addObserver(
            forName: .proEntitlementDidChange,
            object: nil,
            queue: .main
        ) { [weak self] note in
            // Pull the Sendable value out of the (non-Sendable) Notification
            // *before* hopping to the MainActor Task — capturing `note` itself
            // in the @Sendable closure is an error under Swift 6.
            let isPro = note.userInfo?["isPro"] as? Bool
            Task { @MainActor [weak self] in
                guard let self else { return }
                if let isPro { self.cachedIsPro = isPro }
                if self.autoSyncBlocked { self.vpnResyncTask?.cancel() }
                self.writePending()
            }
        }
    }

    private static func displayName(city: String, country: String, lat: Double, lon: Double) -> String {
        let parts = [city, country].filter { !$0.isEmpty }
        return parts.isEmpty ? String(format: "%.5f, %.5f", lat, lon) : parts.joined(separator: ", ")
    }

    // MARK: App Group bridge

    /// Persisted favorites. Stored in standard (app-local) defaults, not the App
    /// Group — favorites aren't shared with the extension, and touching the
    /// group container at launch triggers a slow cfprefsd detach.
    private static let favoritesKey = "app_favorites"

    private func loadFavorites() {
        guard let data = UserDefaults.standard.data(forKey: Self.favoritesKey),
              let decoded = try? JSONDecoder().decode([SpoofFavorite].self, from: data) else { return }
        // Guard the assignment so the `favorites` didSet doesn't fire writePending
        // during launch — that would stamp the current (still-default, off) state
        // over the persisted pending_* snapshot before restoreLocalPending can
        // read it, wiping the user's saved location/toggles on every cold launch.
        isApplyingRemoteState = true
        favorites = decoded
        isApplyingRemoteState = false
    }

    private func saveFavorites() {
        if let data = try? JSONEncoder().encode(favorites) {
            UserDefaults.standard.set(data, forKey: Self.favoritesKey)
        }
    }

    /// Write the full desired-state snapshot for the extension to adopt. The
    /// extension reconciles last-writer-wins by `pending_updatedAt`.
    /// Writes directly to the App Group plist file, bypassing UserDefaults
    /// (which uses kCFPreferencesAnyUser against a container, triggering a slow
    /// cfprefsd detach warning every call).
    func writePending(resync: Bool = false) {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: suite) else {
            Log.bridge.error("writePending: App Group container unavailable (\(self.suite))")
            return
        }

        let plistURL = container.appendingPathComponent("Library/Preferences/\(suite).plist")
        let now = Date().timeIntervalSince1970
        lastLocalChangeAt = now

        // Read the existing plist so we only overwrite the pending_ keys,
        // leaving the region_ keys the extension writes intact.
        var dict: [String: Any] = (NSDictionary(contentsOf: plistURL) as? [String: Any]) ?? [:]

        dict[AppGroup.pendingEnabled] = enabled
        dict[AppGroup.pendingWebrtc] = webrtcProtection
        dict[AppGroup.pendingPreservePrompt] = preserveGeolocationPrompt
        dict[AppGroup.pendingVpnSync] = vpnSyncEnabled
        dict[AppGroup.pendingResync] = resync
        dict[AppGroup.pendingAutoSyncBlocked] = autoSyncBlocked
        dict[AppGroup.pendingProFeaturesBlocked] = proFeaturesBlocked
        dict[AppGroup.pendingUpdatedAt] = now

        // Favorites travel as a JSON string (passthrough via the native handler).
        if let data = try? JSONEncoder().encode(favorites),
           let json = String(data: data, encoding: .utf8) {
            dict[AppGroup.pendingFavorites] = json
        }

        // Site-scoping: mode scalar + allow/deny lists as JSON strings.
        dict[AppGroup.pendingScopeMode] = scopeMode.rawValue
        if let data = try? JSONEncoder().encode(allowlist),
           let json = String(data: data, encoding: .utf8) {
            dict[AppGroup.pendingAllowlist] = json
        }
        if let data = try? JSONEncoder().encode(denylist),
           let json = String(data: data, encoding: .utf8) {
            dict[AppGroup.pendingDenylist] = json
        }

        // Spoofed-accuracy setting as a JSON string (passthrough via the native
        // handler). accuracySeed is extension-owned and is not written here.
        dict[AppGroup.pendingAccuracySetting] = accuracySetting.toJSON()

        // Location + its derived display fields. The three cases collapse to:
        //   • location present → publish coords + display fields, not cleared.
        //   • no location, VPN-sync ON → mid-sync (e.g. detecting exit IP); keep
        //     cleared=false so the extension doesn't wipe the location, but drop
        //     all display fields so nothing stale lingers.
        //   • no location, VPN-sync OFF → an explicit clear; cleared=true.
        // `pendingCleared` semantics are unchanged from before (the extension's
        // app-bridge depends on them); only the stale-display-field leak is fixed.
        if let location {
            dict[AppGroup.pendingCleared] = false
            dict[AppGroup.pendingLatitude] = location.latitude
            dict[AppGroup.pendingLongitude] = location.longitude
            dict[AppGroup.pendingDisplayName] = locationName?.displayName ?? ""
            dict[AppGroup.pendingCity] = locationName?.city ?? ""
            dict[AppGroup.pendingCountry] = locationName?.country ?? ""
        } else {
            dict[AppGroup.pendingCleared] = !vpnSyncEnabled
            dict.removeValue(forKey: AppGroup.pendingLatitude)
            dict.removeValue(forKey: AppGroup.pendingLongitude)
            dict.removeValue(forKey: AppGroup.pendingDisplayName)
            dict.removeValue(forKey: AppGroup.pendingCity)
            dict.removeValue(forKey: AppGroup.pendingCountry)
        }

        // Timezone identifier travels with the pending record so the widget can
        // show the correct zone immediately (the extension recomputes its own
        // zone from coords; this key is for app/widget display only). Present
        // only alongside a location.
        if location != nil, let tzId = timezone?.identifier, !tzId.isEmpty {
            dict[AppGroup.pendingTzId] = tzId
        } else {
            dict.removeValue(forKey: AppGroup.pendingTzId)
        }

        // Ensure parent directory exists, then write atomically.
        let prefsDir = plistURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: prefsDir, withIntermediateDirectories: true)
        (dict as NSDictionary).write(to: plistURL, atomically: true)
        Log.bridge.debug("writePending → enabled=\(enabled) vpnSync=\(vpnSyncEnabled) resync=\(resync) loc=\(location.map { "\($0.latitude),\($0.longitude)" } ?? "nil")")

        // Mirror the chosen location into the app's Documents as desired.json so
        // the GeoSpoof GPS desktop agent can read it over AFC/house_arrest and
        // drive the iPhone's system GPS to match (design §10i).
        writeGpsDesiredState()

        // Reload widgets. Debounced so rapid successive writePending calls
        // (e.g. enable + setLocation + timezone resolve all firing together)
        // coalesce into one reload instead of hammering WidgetKit's rate limit.
        Self.scheduleWidgetReload()
    }

    /// Write the current desired location to `Documents/desired.json` for the
    /// GeoSpoof GPS desktop agent (design §10i). The agent reads this over
    /// AFC/house_arrest (which vends the app's Documents) and drives the iPhone's
    /// real system GPS to match — so the browser spoof, VPN exit, and device GPS
    /// all agree on one location. Schema mirrors the agent's `DesiredState`
    /// (`version`/`enabled`/`latitude`/`longitude`/`provenance`); written
    /// atomically so the agent never reads a half-written file. Metadata only —
    /// no effect on the extension bridge above.
    private func writeGpsDesiredState() {
        guard let docs = FileManager.default
            .urls(for: .documentDirectory, in: .userDomainMask).first else {
            Log.bridge.error("GPS desired.json: Documents directory unavailable")
            return
        }
        let url = docs.appendingPathComponent("desired.json")

        // Device GPS is its own opt-in (`deviceGpsEnabled`), decoupled from the
        // browser spoof: it applies whenever the user enabled the GPS layer AND a
        // location is chosen. Default off, so the real device location never moves
        // without explicit consent (Find My, every app is affected).
        let active = deviceGpsEnabled && location != nil
        let provenance = vpnSyncEnabled ? "vpn-sync" : "manual"
        // Pass our StoreKit entitlement to the desktop agent as the source of truth for
        // the GPS Pro gate (design §18) — the phone already knows (founder / lifetime /
        // active subscription) via ProStore, bridged here as `cachedIsPro`. The agent
        // reads this over the link instead of relying on a local dev stub, so a real Pro
        // member is never wrongly told "GeoSpoof Pro required". Refreshed on every
        // entitlement change (observeProEntitlement → writePending).
        var obj: [String: Any] = [
            "version": 1,
            "enabled": active,
            "provenance": provenance,
            "pro": cachedIsPro,
        ]
        if active, let location {
            obj["latitude"] = location.latitude
            obj["longitude"] = location.longitude
        }

        guard let data = try? JSONSerialization.data(
            withJSONObject: obj, options: [.prettyPrinted, .sortedKeys]
        ) else {
            Log.bridge.error("GPS desired.json: serialization failed")
            return
        }
        do {
            try data.write(to: url, options: .atomic)
            Log.bridge.debug("GPS desired.json → enabled=\(active) provenance=\(provenance)")
        } catch {
            Log.bridge.error("GPS desired.json write failed: \(error.localizedDescription)")
        }
    }

    /// Debounce token for widget reloads — ensures at most one reload fires
    /// per 0.5s window regardless of how many writePending calls occur.
    private static var widgetReloadTask: Task<Void, Never>?

    private static func scheduleWidgetReload() {
        widgetReloadTask?.cancel()
        widgetReloadTask = Task {
            try? await Task.sleep(nanoseconds: 500_000_000) // 0.5s
            guard !Task.isCancelled else { return }
            WidgetCenter.shared.reloadAllTimelines()
        }
    }

    /// Restore the app's own last-written desired state from the `pending_*`
    /// keys it persisted via `writePending`. Called once at launch, before
    /// `refreshFromExtension`.
    ///
    /// This is the durable local copy of the app's state. Without it a cold
    /// launch loses everything the user set in the app: the in-memory
    /// `lastLocalChangeAt` resets to 0, so `refreshFromExtension` would adopt
    /// whatever `region_*` snapshot exists — even a stale one older than the
    /// user's most recent app change, or fall back to defaults if the extension
    /// hadn't pushed a `region_*` snapshot at all. Restoring `pending_updatedAt`
    /// into `lastLocalChangeAt` also repairs the last-writer-wins comparison, so
    /// the extension's region only wins when it's genuinely newer.
    private func restoreLocalPending() {
        guard let dict = Self.readSharedPrefs(suite: suite),
              let pendingAt = dict[AppGroup.pendingUpdatedAt] as? Double else {
            Log.bridge.trace("restoreLocalPending: no pending snapshot to restore")
            return
        }

        lastLocalChangeAt = pendingAt

        enabled = (dict[AppGroup.pendingEnabled] as? Bool) ?? enabled
        webrtcProtection = (dict[AppGroup.pendingWebrtc] as? Bool) ?? webrtcProtection
        preserveGeolocationPrompt = (dict[AppGroup.pendingPreservePrompt] as? Bool) ?? preserveGeolocationPrompt
        vpnSyncEnabled = (dict[AppGroup.pendingVpnSync] as? Bool) ?? vpnSyncEnabled

        if let raw = dict[AppGroup.pendingScopeMode] as? String, let mode = ScopeMode(rawValue: raw) {
            scopeMode = mode
        }
        if let list = Self.decodeStringList(dict[AppGroup.pendingAllowlist]) { allowlist = list }
        if let list = Self.decodeStringList(dict[AppGroup.pendingDenylist]) { denylist = list }

        if let raw = dict[AppGroup.pendingAccuracySetting] as? String {
            accuracySetting = SpoofAccuracySetting.fromJSON(raw)
        }

        if let lat = dict[AppGroup.pendingLatitude] as? Double,
           let lon = dict[AppGroup.pendingLongitude] as? Double {
            location = SpoofLocation(latitude: lat, longitude: lon)
            let display = dict[AppGroup.pendingDisplayName] as? String ?? ""
            locationName = display.isEmpty ? nil : SpoofLocationName(
                city: dict[AppGroup.pendingCity] as? String ?? "",
                country: dict[AppGroup.pendingCountry] as? String ?? "",
                displayName: display
            )
            // pending only carries the IANA id; rebuild the full zone (offset/DST)
            // from it, falling back to the longitude estimate if it's absent.
            let tzId = dict[AppGroup.pendingTzId] as? String
            timezone = Self.resolveTimezone(
                latitude: lat,
                longitude: lon,
                identifier: (tzId?.isEmpty == false) ? tzId : nil
            )
        } else {
            location = nil
            locationName = nil
            timezone = nil
        }

        Log.bridge.debug("restoreLocalPending: restored enabled=\(self.enabled) vpnSync=\(self.vpnSyncEnabled) loc=\(self.location.map { "\($0.latitude),\($0.longitude)" } ?? "nil") (updatedAt \(pendingAt))")
    }

    /// Adopt the extension's last-written region state, but only when it's
    /// newer than our last local change (symmetric last-writer-wins).
    func refreshFromExtension() {
        let prefs = Self.readSharedPrefs(suite: suite)

        // Heartbeat: update "last seen in Safari" regardless of the region gate
        // below, so the status reflects the extension running even when no
        // spoof state actually changed (e.g. a plain pending-settings poll).
        if let seen = prefs?[AppGroup.extensionLastSeenAt] as? Double {
            let date = Date(timeIntervalSince1970: seen)
            if extensionLastSeen != date {
                extensionLastSeen = date
                // The extension can't reload widgets itself, so when the app
                // notices a changed heartbeat (e.g. the user just granted Safari
                // access), refresh widgets so the "Running in Safari" status
                // isn't stuck until WidgetKit's slow periodic refresh.
                Self.scheduleWidgetReload()
            }
        }

        guard let dict = prefs,
              let regionAt = dict[AppGroup.regionUpdatedAt] as? Double,
              regionAt > lastLocalChangeAt else {
            Log.bridge.trace("refreshFromExtension: no newer extension state to adopt")
            return
        }
        Log.bridge.debug("refreshFromExtension: adopting extension region (updatedAt \(regionAt))")

        enabled = (dict[AppGroup.regionEnabled] as? Bool) ?? enabled
        webrtcProtection = (dict[AppGroup.regionWebrtc] as? Bool) ?? webrtcProtection
        preserveGeolocationPrompt = (dict[AppGroup.regionPreservePrompt] as? Bool) ?? preserveGeolocationPrompt
        vpnSyncEnabled = (dict[AppGroup.regionVpnSync] as? Bool) ?? vpnSyncEnabled

        if let lat = dict[AppGroup.regionLatitude] as? Double,
           let lon = dict[AppGroup.regionLongitude] as? Double {
            location = SpoofLocation(latitude: lat, longitude: lon)
        } else {
            location = nil
        }

        let display = dict[AppGroup.regionDisplayName] as? String ?? ""
        locationName = display.isEmpty ? nil : SpoofLocationName(
            city: dict[AppGroup.regionCity] as? String ?? "",
            country: dict[AppGroup.regionCountry] as? String ?? "",
            displayName: display
        )

        if let tzId = dict[AppGroup.regionTzId] as? String, !tzId.isEmpty {
            timezone = SpoofTimezone(
                identifier: tzId,
                offsetMinutes: Int(dict[AppGroup.regionTzOffset] as? Double ?? 0),
                dstOffsetMinutes: Int(dict[AppGroup.regionTzDst] as? Double ?? 0)
            )
        } else if location == nil {
            timezone = nil
        }

        let ip = dict[AppGroup.regionIp] as? String ?? ""
        if !ip.isEmpty { lastSyncedIP = ip }

        // Adopt the extension's favorites list (JSON string). Guarded so the
        // resulting `favorites` didSet doesn't echo it back as a pending write.
        if let favoritesJSON = dict[AppGroup.regionFavorites] as? String,
           let data = favoritesJSON.data(using: .utf8),
           let decoded = try? JSONDecoder().decode([SpoofFavorite].self, from: data),
           decoded != favorites {
            isApplyingRemoteState = true
            favorites = decoded
            isApplyingRemoteState = false
        }

        // Adopt the extension's scope state (mode + lists). These props have no
        // didSet, so setting them directly never echoes back as a pending write.
        if let raw = dict[AppGroup.regionScopeMode] as? String, let mode = ScopeMode(rawValue: raw) {
            scopeMode = mode
        }
        if let list = Self.decodeStringList(dict[AppGroup.regionAllowlist]) { allowlist = list }
        if let list = Self.decodeStringList(dict[AppGroup.regionDenylist]) { denylist = list }

        // Adopt the extension's spoofed-accuracy setting (JSON string). Like the
        // scope props it has no didSet, so assigning it never echoes back as a
        // pending write. accuracySeed is extension-owned and never read here.
        if let raw = dict[AppGroup.regionAccuracySetting] as? String {
            accuracySetting = SpoofAccuracySetting.fromJSON(raw)
        }
    }

    private static func readSharedPrefs(suite: String) -> [String: Any]? {
        // Read the App Group preferences file directly. We deliberately avoid
        // `UserDefaults(suiteName:).dictionaryRepresentation()` as a fallback:
        // against an app-group container it uses kCFPreferencesAnyUser, which
        // the system rejects ("detaching from cfprefsd") — that detach stalls
        // launch. A missing file (nothing written yet) simply returns nil.
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: suite) else { return nil }
        let url = container.appendingPathComponent("Library/Preferences/\(suite).plist")
        return NSDictionary(contentsOf: url) as? [String: Any]
    }

    /// Decode a JSON-encoded `[String]` (the scope allow/deny lists) stored in
    /// the App Group plist. Returns nil when the key is absent or malformed, so
    /// callers can leave existing state untouched rather than clobbering it.
    private static func decodeStringList(_ value: Any?) -> [String]? {
        guard let json = value as? String,
              let data = json.data(using: .utf8),
              let decoded = try? JSONDecoder().decode([String].self, from: data) else { return nil }
        return decoded
    }

    // MARK: Timezone resolution (IANA id when known, else offline lookup, else longitude estimate)

    static func resolveTimezone(latitude: Double, longitude: Double, identifier: String?) -> SpoofTimezone {
        if let identifier, !identifier.isEmpty, let tz = TimeZone(identifier: identifier) {
            let offset = tz.secondsFromGMT() / 60
            let dst = Int(tz.daylightSavingTimeOffset()) / 60
            return SpoofTimezone(identifier: identifier, offsetMinutes: offset, dstOffsetMinutes: dst)
        }
        // Estimate from longitude (15° per hour). Marked as a fallback so the UI
        // can show a warning. Use a fixed-offset zone for the offset calculation
        // but keep the identifier human-readable (UTC±HH:MM) rather than the
        // confusing POSIX-inverted Etc/GMT±N that TimeZone(secondsFromGMT:) returns.
        let estOffsetHours = Int((longitude / 15).rounded())
        let estOffsetMinutes = estOffsetHours * 60
        let sign = estOffsetHours >= 0 ? "+" : "-"
        let estID = String(format: "UTC%@%02d:00", sign, abs(estOffsetHours))
        Log.timezone.warn("Timezone fallback to longitude estimate \(estID) (requested id: \(identifier ?? "none"))")
        return SpoofTimezone(identifier: estID, offsetMinutes: estOffsetMinutes, dstOffsetMinutes: 0, fallback: true)
    }
}

// MARK: - Brand palette (mirrors the extension's CSS design tokens)
extension Color {
    /// Brand green (`--brand: #4caf50`). Theme-invariant, like the extension.
    static let brand = Color(red: 0x4C / 255, green: 0xAF / 255, blue: 0x50 / 255)
    /// Brand green pressed/hover (`--brand-hover: #45a049`).
    static let brandHover = Color(red: 0x45 / 255, green: 0xA0 / 255, blue: 0x49 / 255)
    /// Deeper brand green for the macOS header/sidebar top — rich and on-brand,
    /// but dark enough that the bright macOS traffic-light buttons (especially
    /// the green fullscreen dot) stay clearly legible against it.
    static let brandDeep = Color(red: 0x2E / 255, green: 0x7D / 255, blue: 0x32 / 255)
    /// Favorite-star amber (`--accent: #f5a623`).
    static let starAccent = Color(red: 0xF5 / 255, green: 0xA6 / 255, blue: 0x23 / 255)
    /// Timezone-overlay color — a vivid orange that reads clearly over the
    /// green/blue satellite earth (the brand green blends in).
    static let mapHighlight = Color(red: 1.0, green: 0.45, blue: 0.0)
    /// Warm off-white / nude — a soft, charming neutral used (at low opacity)
    /// alongside the brand green in the menu bar location header.
    static let nude = Color(red: 0.96, green: 0.93, blue: 0.87)
}

// MARK: - STUN client (public IP via UDP)

/// Minimal STUN (RFC 5389) client that discovers the device's public exit IP
/// with a single UDP binding request. Used as the primary IP-detection method
/// on native apps: STUN servers (Google, Cloudflare) are built for hyperscale
/// and don't rate-limit, so a shared VPN exit IP can't get users blocked.
enum StunClient {
    struct Server: Sendable { let host: String; let port: UInt16 }

    /// Tried in order; first to answer wins. Cloudflare leads (privacy-conscious
    /// users reasonably prefer not to send signals to Google STUN). Google is
    /// kept as a last-resort fallback given its massive reliability.
    nonisolated static let servers: [Server] = [
        Server(host: "stun.cloudflare.com", port: 3478),
        Server(host: "stun.l.google.com", port: 19302),
    ]

    enum StunError: Error { case timeout, connection, parse, allFailed }

    /// Resolve the public IP, trying each server until one answers.
    ///
    /// IPv4 is strongly preferred: geolocation databases resolve an IPv4 address
    /// to a city far more reliably than IPv6. Many residential IPv6 blocks only
    /// resolve to the country centroid (e.g. a Verizon IPv6 geolocating to the US
    /// geographic center in Kansas instead of the user's actual city), whereas
    /// the same connection's IPv4 resolves correctly. NWConnection's default
    /// Happy-Eyeballs behavior prefers IPv6 on a dual-stack network, so we pin
    /// the family explicitly: try every server over IPv4 first, and only fall
    /// back to IPv6 if all IPv4 attempts fail (e.g. an IPv6-only network).
    nonisolated static func publicIP() async throws -> String {
        var lastError: Error = StunError.allFailed
        for ipVersion in [NWProtocolIP.Options.Version.v4, .v6] {
            for server in servers {
                do { return try await query(server, ipVersion: ipVersion) } catch { lastError = error }
            }
        }
        throw lastError
    }

    /// Single binding request to one server over a specific IP version.
    nonisolated private static func query(_ server: Server, ipVersion: NWProtocolIP.Options.Version, timeoutSeconds: Double = 2.5) async throws -> String {
        // 20-byte binding request: type(0x0001) + length(0) + magic cookie + 96-bit txid.
        let cookie: [UInt8] = [0x21, 0x12, 0xA4, 0x42]
        var txidBuilder = [UInt8]()
        for _ in 0..<12 { txidBuilder.append(UInt8.random(in: 0...255)) }
        let txid = txidBuilder
        var requestBuilder = Data([0x00, 0x01, 0x00, 0x00])
        requestBuilder.append(contentsOf: cookie)
        requestBuilder.append(contentsOf: txid)
        let request = requestBuilder

        guard let port = NWEndpoint.Port(rawValue: server.port) else { throw StunError.connection }
        // Pin the connection to the requested IP family. Without this, NWConnection's
        // Happy-Eyeballs prefers IPv6 on a dual-stack network, which makes the STUN
        // server reflect the (poorly-geolocating) IPv6 exit address.
        let params = NWParameters.udp
        if let ipOptions = params.defaultProtocolStack.internetProtocol as? NWProtocolIP.Options {
            ipOptions.version = ipVersion
        }
        let connection = NWConnection(host: NWEndpoint.Host(server.host), port: port, using: params)
        let once = ResumeOnce()

        return try await withCheckedThrowingContinuation { (cont: CheckedContinuation<String, Error>) in
            // Single terminal path: cancel the timeout, drop the state handler
            // (breaking the connection<->handler retain cycle so the NWConnection
            // is reclaimed promptly rather than lingering), tear down the socket,
            // and resume exactly once.
            func finish(_ result: Swift.Result<String, Error>) {
                guard once.claim() else { return }
                connection.stateUpdateHandler = nil
                connection.cancel()
                cont.resume(with: result)
            }

            let timeout = DispatchWorkItem { finish(.failure(StunError.timeout)) }
            DispatchQueue.global().asyncAfter(deadline: .now() + timeoutSeconds, execute: timeout)

            connection.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    connection.send(content: request, completion: .contentProcessed { _ in })
                    connection.receiveMessage { data, _, _, _ in
                        timeout.cancel()
                        guard let data, let ip = parseMappedAddress(data, txid: txid) else {
                            finish(.failure(StunError.parse))
                            return
                        }
                        finish(.success(ip))
                    }
                case .failed, .cancelled:
                    timeout.cancel()
                    finish(.failure(StunError.connection))
                default:
                    break
                }
            }
            connection.start(queue: DispatchQueue.global(qos: .userInitiated))
        }
    }

    /// Parse XOR-MAPPED-ADDRESS (0x0020) or MAPPED-ADDRESS (0x0001) from a STUN
    /// success response. Returns a dotted IPv4 or colon IPv6 string.
    nonisolated private static func parseMappedAddress(_ data: Data, txid: [UInt8]) -> String? {
        let b = [UInt8](data)
        // Header is 20 bytes: type(2) length(2) cookie(4) txid(12).
        guard b.count >= 20 else { return nil }
        let cookie: [UInt8] = [0x21, 0x12, 0xA4, 0x42]

        var offset = 20
        while offset + 4 <= b.count {
            let type = (UInt16(b[offset]) << 8) | UInt16(b[offset + 1])
            let len = Int((UInt16(b[offset + 2]) << 8) | UInt16(b[offset + 3]))
            let valueStart = offset + 4
            guard valueStart + len <= b.count else { break }

            if type == 0x0020 || type == 0x0001, len >= 8 {
                let xor = (type == 0x0020)
                let family = b[valueStart + 1]
                if family == 0x01 { // IPv4
                    var addr = Array(b[(valueStart + 4)..<(valueStart + 8)])
                    if xor { for i in 0..<4 { addr[i] ^= cookie[i] } }
                    return addr.map(String.init).joined(separator: ".")
                } else if family == 0x02, len >= 20 { // IPv6
                    var addr = Array(b[(valueStart + 4)..<(valueStart + 20)])
                    if xor {
                        let key = cookie + txid // 16-byte XOR key
                        for i in 0..<16 { addr[i] ^= key[i] }
                    }
                    var groups: [String] = []
                    var i = 0
                    while i < 16 { groups.append(String(format: "%02x%02x", addr[i], addr[i + 1])); i += 2 }
                    return groups.joined(separator: ":")
                }
            }
            // Advance, honoring 4-byte attribute padding.
            offset = valueStart + len + ((len % 4 == 0) ? 0 : (4 - len % 4))
        }
        return nil
    }
}

/// One-shot guard so a continuation is resumed exactly once across the several
/// callbacks/timeout that race to finish a STUN query.
private final class ResumeOnce: @unchecked Sendable {
    private let lock = NSLock()
    nonisolated(unsafe) private var done = false
    nonisolated init() {}
    nonisolated func claim() -> Bool {
        lock.lock(); defer { lock.unlock() }
        if done { return false }
        done = true
        return true
    }
}

// MARK: - VPN lookup (app-side IP + geolocation)

/// Detects the device's public IP and geolocates it, mirroring the extension's
/// pipeline (ipify → geojs). The app shares Safari's network egress, so the IP
/// it sees matches the browser's exit IP — letting "Sync with VPN" resolve
/// instantly in the app instead of waiting for the extension to run.
enum VpnLookup {
    struct Result: Sendable {
        let latitude: Double
        let longitude: Double
        let city: String
        let country: String
        let ip: String
        /// IANA timezone identifier reported by the geo provider (may be empty).
        let timezoneID: String
        /// Which provider produced this result (for logging).
        var source: String = ""
    }

    enum LookupError: Error { case ip, geo }

    /// A URLSession that never serves cached responses — essential here, since a
    /// cached ipify hit after a VPN switch would return the *old* exit IP and the
    /// resync would wrongly conclude nothing changed.
    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        config.urlCache = nil
        // Fail fast during a VPN switch: the tunnel teardown leaves dead sockets
        // that would otherwise stall on the default 60s timeout. A short timeout
        // lets the poll loop retry against the recovered tunnel instead of hanging.
        config.timeoutIntervalForRequest = 6
        config.timeoutIntervalForResource = 10
        config.waitsForConnectivity = false
        return URLSession(configuration: config)
    }()

    private static func noCacheRequest(_ url: URL) -> URLRequest {
        var req = URLRequest(url: url)
        req.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        return req
    }

    static func detectPublicIP() async throws -> String {
        // STUN first: a single UDP round-trip to a hyperscale STUN server
        // (Google / Cloudflare) returns our public exit IP. These servers are
        // built for massive volume and don't rate-limit, so a shared VPN exit IP
        // can't get our users blocked the way a small HTTP IP-echo service might.
        if let ip = try? await StunClient.publicIP() {
            Log.vpn.trace("STUN → \(ip)")
            return ip
        }
        Log.vpn.debug("STUN failed; falling back to HTTP IP echo")
        return try await detectPublicIPViaHTTP()
    }

    /// HTTP fallback for public-IP detection (used only when STUN is blocked,
    /// e.g. a VPN that drops UDP).
    private static func detectPublicIPViaHTTP() async throws -> String {
        let url = URL(string: "https://api.ipify.org?format=json")!
        let (data, response) = try await session.data(for: noCacheRequest(url))
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let obj = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let ip = obj["ip"] as? String, !ip.isEmpty else {
            Log.vpn.error("ipify: failed to detect public IP (status \((response as? HTTPURLResponse)?.statusCode ?? -1))")
            throw LookupError.ip
        }
        Log.vpn.trace("ipify → \(ip)")
        return ip
    }

    static func geolocate(_ ip: String) async throws -> Result {
        // Two-tier resolution mirroring the extension (src/background/vpn-sync.ts):
        //
        // PRIMARY — geojs + freeipapi: providers that resolve a VPN/hosting exit
        // IP to its actual deployment city. geojs leads; freeipapi joins after a
        // short head start so geojs usually wins on latency.
        //
        // FALLBACK — reallyfreegeoip + ipinfo: consulted ONLY if every primary
        // provider fails. Keyless ipinfo returns the IP range's *registration*
        // city, which is wrong for VPN exits (e.g. Frankfurt for a Datacamp
        // "Tashkent" exit IP). Keeping it out of the primary race means it can
        // never win over geojs/freeipapi — it's a true last resort.
        //
        // Within a tier, selection is quality-aware but fastest-wins: the first
        // result with a city wins; a city-less country-centroid is held and
        // returned only if no provider in that tier produced a city. The fallback
        // tier is reached only when every primary provider errors outright (a
        // city-less primary result is still accepted).
        let headStart: UInt64 = 900_000_000 // 0.9s

        if let result = await raceTier(
            [(delay: 0, fetch: { @Sendable addr in try await geolocateGeoJs(addr) }),
             (delay: headStart, fetch: { @Sendable addr in try await geolocateFreeIpApi(addr) })],
            ip: ip
        ) {
            Log.vpn.info("[geo] winner \(result.source): \(result.city.isEmpty ? "?" : result.city), \(result.country) (\(result.latitude), \(result.longitude)) tz=\(result.timezoneID.isEmpty ? "?" : result.timezoneID)")
            return result
        }

        Log.vpn.warn("[geo] all primary providers failed; consulting fallback tier (reallyfreegeoip, ipinfo)")
        if let result = await raceTier(
            [(delay: 0, fetch: { @Sendable addr in try await geolocateReallyFreeGeoIp(addr) }),
             (delay: 0, fetch: { @Sendable addr in try await geolocateIpInfo(addr) })],
            ip: ip
        ) {
            Log.vpn.info("[geo] winner \(result.source) (fallback): \(result.city.isEmpty ? "?" : result.city), \(result.country) (\(result.latitude), \(result.longitude)) tz=\(result.timezoneID.isEmpty ? "?" : result.timezoneID)")
            return result
        }

        Log.vpn.error("All geolocation providers failed for \(ip)")
        throw LookupError.geo
    }

    /// Race one provider tier. Returns the first city-level result
    /// (fastest-wins), or the best city-less country-centroid if no provider in
    /// the tier produced a city, or nil if every provider in the tier errored.
    /// Mirrors the extension's `raceGeoForBestResult` within a single tier.
    private static func raceTier(
        _ providers: [(delay: UInt64, fetch: @Sendable (String) async throws -> Result)],
        ip: String
    ) async -> Result? {
        await withTaskGroup(of: Result?.self) { group in
            for (delay, fetch) in providers {
                group.addTask {
                    if delay > 0 {
                        try? await Task.sleep(nanoseconds: delay)
                        if Task.isCancelled { return nil }
                    }
                    return try? await fetch(ip)
                }
            }

            var cityless: Result? // best result with no city — country centroid
            for await next in group {
                guard let result = next else { continue }
                if !result.city.isEmpty {
                    // Pinpointed to a city — accept the first to arrive.
                    group.cancelAll()
                    return result
                }
                // City-less (country centroid). Hold one, preferring a provider
                // that at least supplied a timezone.
                if cityless == nil || (cityless!.timezoneID.isEmpty && !result.timezoneID.isEmpty) {
                    cityless = result
                }
            }
            return cityless
        }
    }

    /// Log a provider's result (so the parallel responses can be compared in the
    /// console) and pass it through.
    private static func logResult(_ r: Result) -> Result {
        Log.vpn.debug("[geo] \(r.source): \(r.city.isEmpty ? "?" : r.city), \(r.country) (\(r.latitude), \(r.longitude)) tz=\(r.timezoneID.isEmpty ? "?" : r.timezoneID)")
        return r
    }

    // MARK: Individual providers

    /// geojs.io — primary. Returns lat/lng as strings; includes IANA timezone.
    private static func geolocateGeoJs(_ ip: String) async throws -> Result {
        let url = URL(string: "https://get.geojs.io/v1/ip/geo/\(ip).json")!
        let (data, response) = try await session.data(for: noCacheRequest(url))
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let lat = Double((o["latitude"] as? String) ?? ""),
              let lon = Double((o["longitude"] as? String) ?? ""),
              isValidCoord(lat, lon) else {
            throw LookupError.geo
        }
        return logResult(Result(
            latitude: lat, longitude: lon,
            city: o["city"] as? String ?? "",
            country: o["country"] as? String ?? "",
            ip: o["ip"] as? String ?? ip,
            timezoneID: o["timezone"] as? String ?? "",
            source: "geojs"
        ))
    }

    /// freeipapi.com — fallback #1. Numeric lat/lng. Captures the timezone only
    /// when unambiguous (see below).
    private static func geolocateFreeIpApi(_ ip: String) async throws -> Result {
        let url = URL(string: "https://free.freeipapi.com/api/json/\(ip)")!
        let (data, response) = try await session.data(for: noCacheRequest(url))
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let lat = numeric(o["latitude"]), let lon = numeric(o["longitude"]),
              isValidCoord(lat, lon) else {
            throw LookupError.geo
        }
        // freeipapi returns `timeZones` (plural) — the list of ALL IANA zones in
        // the IP's COUNTRY, alphabetical, not the city's zone. Only trust it when
        // it's unambiguous (a single-zone country, one element); a multi-zone
        // list can't pinpoint the city and its first entry is just alphabetical
        // (e.g. America/Adak for any US IP). Mirrors the extension
        // (src/background/vpn-sync.ts). A missing/multi-zone value is left empty
        // and refined downstream by resolveExactTimezone.
        let timeZones = o["timeZones"] as? [String]
        let timezoneID: String
        if let timeZones, timeZones.count == 1 {
            timezoneID = timeZones[0]
        } else {
            timezoneID = o["timeZone"] as? String ?? ""
        }
        return logResult(Result(
            latitude: lat, longitude: lon,
            city: o["cityName"] as? String ?? "",
            country: o["countryName"] as? String ?? "",
            ip: o["ipAddress"] as? String ?? ip,
            timezoneID: timezoneID,
            source: "freeipapi"
        ))
    }

    /// reallyfreegeoip.org — fallback #2. Numeric lat/lng.
    private static func geolocateReallyFreeGeoIp(_ ip: String) async throws -> Result {
        let url = URL(string: "https://reallyfreegeoip.org/json/\(ip)")!
        let (data, response) = try await session.data(for: noCacheRequest(url))
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let lat = numeric(o["latitude"]), let lon = numeric(o["longitude"]),
              isValidCoord(lat, lon) else {
            throw LookupError.geo
        }
        return logResult(Result(
            latitude: lat, longitude: lon,
            city: o["city"] as? String ?? "",
            country: o["country_name"] as? String ?? "",
            ip: o["ip"] as? String ?? ip,
            timezoneID: o["time_zone"] as? String ?? "",
            source: "reallyfreegeoip"
        ))
    }

    /// ipinfo.io — fallback #3. Google Cloud network (different from the
    /// Cloudflare-hosted others). `loc` is a "lat,lng" string.
    private static func geolocateIpInfo(_ ip: String) async throws -> Result {
        let url = URL(string: "https://ipinfo.io/\(ip)/json")!
        let (data, response) = try await session.data(for: noCacheRequest(url))
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let loc = o["loc"] as? String else {
            throw LookupError.geo
        }
        let parts = loc.split(separator: ",")
        guard parts.count == 2, let lat = Double(parts[0]), let lon = Double(parts[1]),
              isValidCoord(lat, lon) else {
            throw LookupError.geo
        }
        return logResult(Result(
            latitude: lat, longitude: lon,
            city: o["city"] as? String ?? "",
            country: o["country"] as? String ?? "",
            ip: o["ip"] as? String ?? ip,
            timezoneID: o["timezone"] as? String ?? "",
            source: "ipinfo"
        ))
    }

    /// Accept both numeric and string-encoded coordinate values.
    private static func numeric(_ value: Any?) -> Double? {
        if let d = value as? Double { return d }
        if let n = value as? NSNumber { return n.doubleValue }
        if let s = value as? String { return Double(s) }
        return nil
    }

    private static func isValidCoord(_ lat: Double, _ lon: Double) -> Bool {
        lat.isFinite && lon.isFinite && (-90...90).contains(lat) && (-180...180).contains(lon)
    }

    /// Full sync: detect IP, then geolocate it.
    static func sync() async throws -> Result {
        let ip = try await detectPublicIP()
        return try await geolocate(ip)
    }
}

// MARK: - App info
enum AppInfo {
    /// Marketing version string, e.g. "v1.19.10".
    static var version: String {
        let v = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "—"
        return "v\(v)"
    }

    /// Marketing version with build number, e.g. "v1.19.10 (87)". Useful in the
    /// settings footer so beta/TestFlight reports can be pinned to an exact build.
    static var versionWithBuild: String {
        let build = Bundle.main.infoDictionary?["CFBundleVersion"] as? String ?? "—"
        return "\(version) (\(build))"
    }
}

// MARK: - Haptics
/// Lightweight haptic feedback wrapper. iOS-only; a no-op on macOS so it can be
/// called freely from shared code (e.g. the SpoofController intents).
enum Haptics {
    enum Impact { case light, medium, soft, rigid }
    enum Notify { case success, warning, error }

    static func impact(_ style: Impact = .light) {
        #if os(iOS)
        let mapped: UIImpactFeedbackGenerator.FeedbackStyle
        switch style {
        case .light: mapped = .light
        case .medium: mapped = .medium
        case .soft: mapped = .soft
        case .rigid: mapped = .rigid
        }
        let generator = UIImpactFeedbackGenerator(style: mapped)
        generator.prepare()
        generator.impactOccurred()
        #endif
    }

    static func notify(_ type: Notify) {
        #if os(iOS)
        let mapped: UINotificationFeedbackGenerator.FeedbackType
        switch type {
        case .success: mapped = .success
        case .warning: mapped = .warning
        case .error: mapped = .error
        }
        UINotificationFeedbackGenerator().notificationOccurred(mapped)
        #endif
    }

    static func selection() {
        #if os(iOS)
        UISelectionFeedbackGenerator().selectionChanged()
        #endif
    }
}

// MARK: - Modern SwiftUI helpers

/// Wraps content in a Liquid Glass surface on OS 26+, falling back to a
/// material on the iOS 15 / macOS 13 baseline.
struct GlassCardModifier: ViewModifier {
    var cornerRadius: CGFloat = 22
    var padding: CGFloat = 16

    func body(content: Content) -> some View {
        let shape = RoundedRectangle(cornerRadius: cornerRadius, style: .continuous)
        if #available(iOS 26.0, macOS 26.0, *) {
            content
                .padding(padding)
                .glassEffect(.regular, in: shape)
        } else {
            content
                .padding(padding)
                .background(.regularMaterial, in: shape)
        }
    }
}

extension View {
    /// A Liquid Glass card surface (material fallback below OS 26).
    func glassCard(cornerRadius: CGFloat = 22, padding: CGFloat = 16) -> some View {
        modifier(GlassCardModifier(cornerRadius: cornerRadius, padding: padding))
    }

    /// A circular Liquid Glass background for floating map controls (material
    /// fallback below OS 26).
    @ViewBuilder
    func glassCircle() -> some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            self.glassEffect(.regular, in: Circle())
        } else {
            self.background(.regularMaterial, in: Circle())
        }
    }

    /// A capsule Liquid Glass background for a *combined* floating control
    /// cluster — several stacked controls reading as one cohesive unit (the
    /// Apple Maps pattern) rather than separate bubbles. Material fallback
    /// below OS 26.
    @ViewBuilder
    func glassCapsule() -> some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            self.glassEffect(.regular, in: Capsule())
        } else {
            self.background(.regularMaterial, in: Capsule())
        }
    }

    /// `.formStyle(.grouped)` where available (iOS 16 / macOS 13+); no-op on the
    /// iOS 15 baseline, where `Form` is already grouped by default.
    @ViewBuilder
    func groupedFormStyle() -> some View {
        if #available(iOS 16.0, macOS 13.0, *) {
            self.formStyle(.grouped)
        } else {
            self
        }
    }

    /// A glass / glassProminent button style on OS 26, bordered fallback below.
    @ViewBuilder
    func glassButtonStyle(prominent: Bool = false) -> some View {
        if #available(iOS 26.0, macOS 26.0, *) {
            if prominent {
                self.buttonStyle(.glassProminent)
            } else {
                self.buttonStyle(.glass)
            }
        } else {
            if prominent {
                self.buttonStyle(.borderedProminent)
            } else {
                self.buttonStyle(.bordered)
            }
        }
    }
}

/// `NavigationStack` on OS that supports it, `NavigationView` on the iOS 15
/// baseline. Keeps the call sites clean while staying back-deployable.
struct AdaptiveNavigationStack<Root: View>: View {
    @ViewBuilder var root: () -> Root

    var body: some View {
        if #available(iOS 16.0, macOS 13.0, *) {
            NavigationStack(root: root)
        } else {
            #if os(iOS)
            NavigationView(content: root)
                .navigationViewStyle(.stack)
            #else
            NavigationView(content: root)
            #endif
        }
    }
}
