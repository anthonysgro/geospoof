//
//  SpoofSnapshot.swift
//  GeoSpoof Widget
//
//  A point-in-time read of the spoof state from the shared App Group, used by
//  the widget timeline and the iOS 18 Control. The widget runs in its own
//  short-lived process, so it can't read the app's in-memory `SpoofController`;
//  it reads the same App Group container the app and Safari extension write to.
//
//  Two record sets live in the App Group:
//    • region_*  — written by the Safari extension (the *confirmed* active state
//      it's actually applying in Safari), via SafariWebExtensionHandler.
//    • pending_* — written by the app / the resync App Intent (the *desired*
//      state, adopted by the extension on next tab activity).
//
//  We show whichever is newer (by its `updatedAt`), so a resync from the widget
//  or app reflects immediately, while a switch detected by the extension while
//  browsing also shows up. This mirrors the symmetric last-writer-wins the
//  extension's app-bridge already implements.
//
//  Reads go through the App Group *plist file* (not `UserDefaults(suiteName:)`)
//  to dodge cross-process cfprefsd caching — the same approach the app
//  (`SpoofController.readSharedPrefs`) and the extension
//  (`SafariWebExtensionHandler.readSharedPrefsFile`) already use.
//
//  NOTE: `AppGroup`, the domain models, `VpnLookup`, and `Log` come from
//  `SpoofModel.swift`, which must be a member of the widget extension target
//  (see the Xcode setup checklist).
//

import Foundation

struct SpoofSnapshot {
    var enabled: Bool
    var vpnSync: Bool
    var webrtc: Bool
    var displayName: String
    var city: String
    var country: String
    var latitude: Double?
    var longitude: Double?
    var ip: String
    var timezoneID: String
    /// When the displayed state was last written (max of region/pending).
    var updatedAt: Date?
    /// Last time the Safari extension checked in (for the "running in Safari" dot).
    var extensionLastSeen: Date?

    /// Saved favorite locations (for the extra-large widget's quick-select grid).
    var favorites: [SpoofFavorite] = []

    /// A widget-initiated re-sync is currently in flight (drives the button spinner).
    var isSyncing: Bool = false
    /// When the in-flight resync began (used to schedule the spinner→result flip).
    var syncingStartedAt: Date? = nil

    /// Minimum time the spinner stays visible after a resync starts, so the
    /// loading state always registers even when the work finishes instantly.
    static let minSyncDisplay: TimeInterval = 1.5

    var hasLocation: Bool { latitude != nil && longitude != nil }

    /// Round to 4dp for favorite-match comparison (≈11m), mirroring the app.
    private static func round4(_ v: Double) -> Double { (v * 10000).rounded() / 10000 }

    /// The favorite currently active (its coords match the spoofed location), if any.
    var activeFavoriteId: String? {
        guard let lat = latitude, let lon = longitude else { return nil }
        let rLat = Self.round4(lat), rLon = Self.round4(lon)
        return favorites.first { Self.round4($0.latitude) == rLat && Self.round4($0.longitude) == rLon }?.id
    }

    /// Decode the favorites JSON string written to the App Group by the app.
    static func decodeFavorites(_ json: String?) -> [SpoofFavorite] {
        guard let json, let data = json.data(using: .utf8),
              let favs = try? JSONDecoder().decode([SpoofFavorite].self, from: data) else {
            return []
        }
        return favs
    }

    /// True when the extension has checked in within the last week — best-effort
    /// "GeoSpoof is active in Safari" signal (mirrors SpoofController).
    var isActiveInSafari: Bool {
        guard let extensionLastSeen else { return false }
        return Date().timeIntervalSince(extensionLastSeen) < 7 * 24 * 60 * 60
    }

    /// A placeholder used for the widget gallery / redacted previews.
    static let placeholder = SpoofSnapshot(
        enabled: true,
        vpnSync: true,
        webrtc: true,
        displayName: "Tokyo, Japan",
        city: "Tokyo",
        country: "Japan",
        latitude: 35.6762,
        longitude: 139.6503,
        ip: "203.0.113.42",
        timezoneID: "Asia/Tokyo",
        updatedAt: Date(),
        extensionLastSeen: Date(),
        favorites: [
            SpoofFavorite(id: "1", latitude: 51.5074, longitude: -0.1278, city: "London", country: "United Kingdom", displayName: "London, United Kingdom", label: nil),
            SpoofFavorite(id: "2", latitude: 48.8566, longitude: 2.3522, city: "Paris", country: "France", displayName: "Paris, France", label: nil),
            SpoofFavorite(id: "3", latitude: 35.6762, longitude: 139.6503, city: "Tokyo", country: "Japan", displayName: "Tokyo, Japan", label: nil),
            SpoofFavorite(id: "4", latitude: 40.7128, longitude: -74.0060, city: "New York", country: "United States", displayName: "New York, United States", label: nil),
        ]
    )

    /// An "off" snapshot used when nothing is configured / the App Group is empty.
    static let empty = SpoofSnapshot(
        enabled: false,
        vpnSync: false,
        webrtc: false,
        displayName: "",
        city: "",
        country: "",
        latitude: nil,
        longitude: nil,
        ip: "",
        timezoneID: "",
        updatedAt: nil,
        extensionLastSeen: nil
    )

    /// Read the App Group plist file directly (cross-process-safe).
    static func readSharedPrefs() -> [String: Any]? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppGroup.suite) else {
            return nil
        }
        let plistURL = container.appendingPathComponent("Library/Preferences/\(AppGroup.suite).plist")
        return NSDictionary(contentsOf: plistURL) as? [String: Any]
    }

    /// Read the current snapshot, merging the extension-confirmed (`region_*`)
    /// and app/intent-desired (`pending_*`) records by recency.
    static func load() -> SpoofSnapshot {
        guard let dict = readSharedPrefs() else { return .empty }

        // Timestamps are stored as Unix seconds. Absent ⇒ 0 (oldest).
        let regionAt = (dict[AppGroup.regionUpdatedAt] as? Double) ?? 0
        let pendingAt = (dict[AppGroup.pendingUpdatedAt] as? Double) ?? 0
        let pendingCleared = (dict[AppGroup.pendingCleared] as? Bool) ?? false

        let lastSeen = (dict[AppGroup.extensionLastSeenAt] as? Double) ?? 0
        let extensionLastSeen = lastSeen > 0 ? Date(timeIntervalSince1970: lastSeen) : nil

        // Transient widget-resync spinner: shown for a minimum window after a
        // resync starts (the widget can't render mid-intent, so the timeline
        // schedules the flip). A long staleness cap prevents a stuck spinner if
        // the intent ever dies mid-flight.
        let syncingAtRaw = (dict[AppGroup.widgetSyncingAt] as? Double) ?? 0
        let syncingStartedAt = syncingAtRaw > 0 ? Date(timeIntervalSince1970: syncingAtRaw) : nil
        let sinceSyncStart = syncingStartedAt.map { Date().timeIntervalSince($0) } ?? .greatestFiniteMagnitude
        let isSyncing = sinceSyncStart < minSyncDisplay

        // Favorites: prefer the app-written pending list, fall back to the
        // extension-confirmed region list.
        let favorites = decodeFavorites(
            (dict[AppGroup.pendingFavorites] as? String) ?? (dict[AppGroup.regionFavorites] as? String)
        )

        // If the most recent action was an explicit location clear, drop the
        // location fields — but preserve the real enabled/vpnSync flags.
        // "Cleared" means "no location set", NOT "protection off": protection
        // can be on with no location (the view shows the "on, but no location"
        // state). Keep the "running in Safari" signal too.
        if pendingCleared && pendingAt >= regionAt {
            return SpoofSnapshot(
                enabled: (dict[AppGroup.pendingEnabled] as? Bool) ?? false,
                vpnSync: (dict[AppGroup.pendingVpnSync] as? Bool) ?? false,
                webrtc: (dict[AppGroup.pendingWebrtc] as? Bool) ?? false,
                displayName: "",
                city: "",
                country: "",
                latitude: nil,
                longitude: nil,
                ip: "",
                timezoneID: "",
                updatedAt: pendingAt > 0 ? Date(timeIntervalSince1970: pendingAt) : nil,
                extensionLastSeen: extensionLastSeen,
                favorites: favorites,
                isSyncing: isSyncing,
                syncingStartedAt: syncingStartedAt
            )
        }

        let usePending = pendingAt > regionAt
        let updatedAt = max(regionAt, pendingAt)

        let lat: Double?
        let lon: Double?
        if usePending {
            lat = dict[AppGroup.pendingLatitude] as? Double
            lon = dict[AppGroup.pendingLongitude] as? Double
        } else {
            lat = dict[AppGroup.regionLatitude] as? Double
            lon = dict[AppGroup.regionLongitude] as? Double
        }

        return SpoofSnapshot(
            enabled: (dict[(usePending ? AppGroup.pendingEnabled : AppGroup.regionEnabled)] as? Bool) ?? false,
            vpnSync: (dict[(usePending ? AppGroup.pendingVpnSync : AppGroup.regionVpnSync)] as? Bool) ?? false,
            webrtc: (dict[(usePending ? AppGroup.pendingWebrtc : AppGroup.regionWebrtc)] as? Bool) ?? false,
            displayName: (dict[(usePending ? AppGroup.pendingDisplayName : AppGroup.regionDisplayName)] as? String) ?? "",
            city: (dict[(usePending ? AppGroup.pendingCity : AppGroup.regionCity)] as? String) ?? "",
            country: (dict[(usePending ? AppGroup.pendingCountry : AppGroup.regionCountry)] as? String) ?? "",
            latitude: lat,
            longitude: lon,
            ip: dict[AppGroup.regionIp] as? String ?? "",
            timezoneID: (dict[(usePending ? AppGroup.pendingTzId : AppGroup.regionTzId)] as? String) ?? "",
            updatedAt: updatedAt > 0 ? Date(timeIntervalSince1970: updatedAt) : nil,
            extensionLastSeen: extensionLastSeen,
            favorites: favorites,
            isSyncing: isSyncing,
            syncingStartedAt: syncingStartedAt
        )
    }
}
