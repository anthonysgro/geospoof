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
#if os(iOS)
import UIKit
#else
import AppKit
#endif

// MARK: - App Group

enum AppGroup {
    static let suite = "group.com.moonloaf.geospoof"

    // Extension -> App (current active region, for display).
    static let regionEnabled     = "region_enabled"
    static let regionDisplayName = "region_displayName"
    static let regionCity        = "region_city"
    static let regionCountry     = "region_country"
    static let regionLatitude    = "region_latitude"
    static let regionLongitude   = "region_longitude"
    static let regionUpdatedAt   = "region_updatedAt"
    static let regionWebrtc      = "region_webrtc"
    static let regionVpnSync     = "region_vpnSync"
    static let regionIp          = "region_ip"
    static let regionTzId        = "region_tzId"
    static let regionTzOffset    = "region_tzOffset"
    static let regionTzDst       = "region_tzDst"

    // App -> Extension (a full desired-state snapshot the extension adopts on
    // next launch / tab activity, last-writer-wins by `pending_updatedAt`).
    static let pendingEnabled     = "pending_enabled"
    static let pendingDisplayName = "pending_displayName"
    static let pendingLatitude    = "pending_latitude"
    static let pendingLongitude   = "pending_longitude"
    static let pendingUpdatedAt   = "pending_updatedAt"
    static let pendingWebrtc      = "pending_webrtc"
    static let pendingVpnSync     = "pending_vpnSync"
    static let pendingCleared     = "pending_cleared"
    static let pendingResync      = "pending_resync"
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
    @Published var vpnSyncEnabled = false
    @Published var favorites: [SpoofFavorite] = [] { didSet { saveFavorites() } }

    // VPN sync UI state
    @Published var isSyncing = false
    @Published var lastSyncedIP: String?
    @Published var vpnError: String?

    /// Inline "list full" flag for the favorites star, auto-clears after a beat.
    @Published var atCapacity = false

    let favoritesCapacity = 10

    private let suite = AppGroup.suite

    /// Unix seconds of the most recent local (user-initiated) change. Used for
    /// symmetric last-writer-wins: `refreshFromExtension` only overwrites local
    /// state when the extension's region is newer than our last local change,
    /// so a change made here isn't clobbered before the extension adopts it.
    private var lastLocalChangeAt: TimeInterval = 0

    private var foregroundObserver: NSObjectProtocol?
    /// NWPathMonitor + dedicated queue for OS-level VPN change detection.
    private var pathMonitor: NWPathMonitor?
    private var pathMonitorQueue: DispatchQueue?
    /// Cancels any in-flight debounce + resync task when a newer change arrives.
    private var vpnResyncTask: Task<Void, Never>?

    init() {
        Log.app.info("SpoofController init")
        loadFavorites()
        refreshFromExtension()
        CityStore.shared.preload()
        startForegroundObserver()
        startNetworkWatcher()
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
        let name = UIApplication.didBecomeActiveNotification
        #else
        let name = NSApplication.didBecomeActiveNotification
        #endif
        foregroundObserver = NotificationCenter.default.addObserver(
            forName: name,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor [weak self] in
                guard let self else { return }
                Log.app.debug("App foregrounded — refreshing from extension + VPN re-check")
                self.refreshFromExtension()
                // Network is already settled when the app is opened, so a single
                // fresh sample is authoritative — no need to poll. A no-op when
                // the exit IP hasn't moved.
                self.scheduleVpnResync(initialDelay: 0, pollFor: 0)
            }
        }
    }

    /// Watches for OS-level network path changes (VPN connect/switch/disconnect)
    /// using NWPathMonitor — a push signal, no polling. Every path update funnels
    /// into the shared `scheduleVpnResync` gate; the IP-diff check and steady-
    /// state floor there make redundant callbacks cheap no-ops, so we don't try
    /// to pre-filter path updates (a server switch can reuse the same interface
    /// and would be wrongly suppressed by a description diff).
    private func startNetworkWatcher() {
        let monitor = NWPathMonitor()
        let queue = DispatchQueue(label: "com.moonloaf.geospoof.pathmonitor", qos: .utility)
        pathMonitor = monitor
        pathMonitorQueue = queue
        monitor.pathUpdateHandler = { [weak self] path in
            Task { @MainActor [weak self] in
                Log.vpn.debug("Network path changed (status: \(String(describing: path.status)))")
                // A path change may have a transition still settling, so poll
                // briefly for the new exit IP to appear.
                self?.scheduleVpnResync(initialDelay: 1.0, pollFor: Self.pathChangePollWindow)
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
        guard vpnSyncEnabled else { return }
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
    /// changed IP must hold across this window before we commit.
    private static let confirmSteadyDelay: Double = 1.5
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
        pathMonitor?.cancel()
        vpnResyncTask?.cancel()
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
                displayName: name?.displayName ?? String(format: "%.4f, %.4f", location.latitude, location.longitude),
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

    private static func displayName(city: String, country: String, lat: Double, lon: Double) -> String {
        let parts = [city, country].filter { !$0.isEmpty }
        return parts.isEmpty ? String(format: "%.4f, %.4f", lat, lon) : parts.joined(separator: ", ")
    }

    // MARK: App Group bridge

    /// Persisted favorites. Stored in standard (app-local) defaults, not the App
    /// Group — favorites aren't shared with the extension, and touching the
    /// group container at launch triggers a slow cfprefsd detach.
    private static let favoritesKey = "app_favorites"

    private func loadFavorites() {
        guard let data = UserDefaults.standard.data(forKey: Self.favoritesKey),
              let decoded = try? JSONDecoder().decode([SpoofFavorite].self, from: data) else { return }
        favorites = decoded
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
        dict[AppGroup.pendingVpnSync] = vpnSyncEnabled
        dict[AppGroup.pendingResync] = resync
        dict[AppGroup.pendingUpdatedAt] = now

        if vpnSyncEnabled {
            dict[AppGroup.pendingCleared] = false
            if let location {
                dict[AppGroup.pendingLatitude] = location.latitude
                dict[AppGroup.pendingLongitude] = location.longitude
                dict[AppGroup.pendingDisplayName] = locationName?.displayName ?? ""
            } else {
                dict.removeValue(forKey: AppGroup.pendingLatitude)
                dict.removeValue(forKey: AppGroup.pendingLongitude)
            }
        } else if let location {
            dict[AppGroup.pendingCleared] = false
            dict[AppGroup.pendingLatitude] = location.latitude
            dict[AppGroup.pendingLongitude] = location.longitude
            dict[AppGroup.pendingDisplayName] = locationName?.displayName ?? ""
        } else {
            dict[AppGroup.pendingCleared] = true
            dict.removeValue(forKey: AppGroup.pendingLatitude)
            dict.removeValue(forKey: AppGroup.pendingLongitude)
        }

        // Ensure parent directory exists, then write atomically.
        let prefsDir = plistURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: prefsDir, withIntermediateDirectories: true)
        (dict as NSDictionary).write(to: plistURL, atomically: true)
        Log.bridge.debug("writePending → enabled=\(enabled) vpnSync=\(vpnSyncEnabled) resync=\(resync) loc=\(location.map { "\($0.latitude),\($0.longitude)" } ?? "nil")")
    }

    /// Adopt the extension's last-written region state, but only when it's
    /// newer than our last local change (symmetric last-writer-wins).
    func refreshFromExtension() {
        guard let dict = Self.readSharedPrefs(suite: suite),
              let regionAt = dict[AppGroup.regionUpdatedAt] as? Double,
              regionAt > lastLocalChangeAt else {
            Log.bridge.trace("refreshFromExtension: no newer extension state to adopt")
            return
        }
        Log.bridge.debug("refreshFromExtension: adopting extension region (updatedAt \(regionAt))")

        enabled = (dict[AppGroup.regionEnabled] as? Bool) ?? enabled
        webrtcProtection = (dict[AppGroup.regionWebrtc] as? Bool) ?? webrtcProtection
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

    // MARK: Timezone resolution (MOCK-ish: IANA id when known, else longitude estimate)

    static func resolveTimezone(latitude: Double, longitude: Double, identifier: String?) -> SpoofTimezone {
        if let identifier, let tz = TimeZone(identifier: identifier) {
            let offset = tz.secondsFromGMT() / 60
            let dst = Int(tz.daylightSavingTimeOffset()) / 60
            return SpoofTimezone(identifier: identifier, offsetMinutes: offset, dstOffsetMinutes: dst)
        }
        // Estimate from longitude (15° per hour). Marked as a fallback.
        let estOffsetHours = Int((longitude / 15).rounded())
        let estID = TimeZone(secondsFromGMT: estOffsetHours * 3600)?.identifier ?? "UTC"
        Log.timezone.warn("Timezone fallback to longitude estimate \(estID) (requested id: \(identifier ?? "none"))")
        return SpoofTimezone(identifier: estID, offsetMinutes: estOffsetHours * 60, dstOffsetMinutes: 0, fallback: true)
    }
}

// MARK: - Brand palette (mirrors the extension's CSS design tokens)
extension Color {
    /// Brand green (`--brand: #4caf50`). Theme-invariant, like the extension.
    static let brand = Color(red: 0x4C / 255, green: 0xAF / 255, blue: 0x50 / 255)
    /// Brand green pressed/hover (`--brand-hover: #45a049`).
    static let brandHover = Color(red: 0x45 / 255, green: 0xA0 / 255, blue: 0x49 / 255)
    /// Favorite-star amber (`--accent: #f5a623`).
    static let starAccent = Color(red: 0xF5 / 255, green: 0xA6 / 255, blue: 0x23 / 255)
    /// Timezone-overlay color — a vivid orange that reads clearly over the
    /// green/blue satellite earth (the brand green blends in).
    static let mapHighlight = Color(red: 1.0, green: 0.45, blue: 0.0)
}

// MARK: - VPN lookup (app-side IP + geolocation)

/// Detects the device's public IP and geolocates it, mirroring the extension's
/// pipeline (ipify → geojs). The app shares Safari's network egress, so the IP
/// it sees matches the browser's exit IP — letting "Sync with VPN" resolve
/// instantly in the app instead of waiting for the extension to run.
enum VpnLookup {
    struct Result {
        let latitude: Double
        let longitude: Double
        let city: String
        let country: String
        let ip: String
        /// IANA timezone identifier reported by the geo provider (may be empty).
        let timezoneID: String
    }

    enum LookupError: Error { case ip, geo }

    /// A URLSession that never serves cached responses — essential here, since a
    /// cached ipify hit after a VPN switch would return the *old* exit IP and the
    /// resync would wrongly conclude nothing changed.
    private static let session: URLSession = {
        let config = URLSessionConfiguration.ephemeral
        config.requestCachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        config.urlCache = nil
        return URLSession(configuration: config)
    }()

    private static func noCacheRequest(_ url: URL) -> URLRequest {
        var req = URLRequest(url: url)
        req.cachePolicy = .reloadIgnoringLocalAndRemoteCacheData
        req.setValue("no-cache", forHTTPHeaderField: "Cache-Control")
        return req
    }

    static func detectPublicIP() async throws -> String {
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
        let url = URL(string: "https://get.geojs.io/v1/ip/geo/\(ip).json")!
        let (data, response) = try await session.data(for: noCacheRequest(url))
        guard (response as? HTTPURLResponse)?.statusCode == 200,
              let o = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
              let lat = Double((o["latitude"] as? String) ?? ""),
              let lon = Double((o["longitude"] as? String) ?? "") else {
            Log.vpn.error("geojs: failed to geolocate \(ip) (status \((response as? HTTPURLResponse)?.statusCode ?? -1))")
            throw LookupError.geo
        }
        return Result(
            latitude: lat,
            longitude: lon,
            city: o["city"] as? String ?? "",
            country: o["country"] as? String ?? "",
            ip: o["ip"] as? String ?? ip,
            timezoneID: o["timezone"] as? String ?? ""
        )
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
