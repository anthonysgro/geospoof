//
//  ResyncIntent.swift
//  GeoSpoof Widget
//
//  App Intent that re-syncs the spoofed location to the current VPN exit IP.
//  Invoked from the widget's "Re-sync" button (iOS 17+ interactive widgets) and
//  the iOS 18 Control. App Intents run in the background WITHOUT foregrounding
//  the app, and because they're user-initiated the OS grants execution time —
//  so the quick IP-detect + geolocate runs without the app being open.
//
//  It writes the resolved location to the App Group `pending_*` record (exactly
//  like SpoofController.writePending), so the Safari extension adopts it on the
//  next tab activity, and reloads the widget timelines so the new location shows
//  immediately. It does NOT inject into an already-open Safari page in real time
//  — that remains the extension's job on next activity (same boundary as the app).
//
//  NOTE: depends on `AppGroup`, `VpnLookup`, and `Log` from `SpoofModel.swift`
//  (must be a member of the widget extension target).
//

import AppIntents
import WidgetKit
import Foundation

@available(iOS 16.0, macOS 13.0, *)
struct ResyncIntent: AppIntent {
    static var title: LocalizedStringResource = "Re-sync VPN Location"
    static var description = IntentDescription(
        "Detect your current VPN exit IP and update the spoofed location to match."
    )
    // Run quietly in the background; never bring the app forward.
    static var openAppWhenRun: Bool = false

    @MainActor
    func perform() async throws -> some IntentResult {
        Log.vpn.info("[WIDGET] Resync intent invoked")

        // Pro gate (iOS, non-Pro): re-sync is a Pro feature. Don't perform the
        // sync; flag the paywall so opening the app surfaces it, and bail.
        // Mirrors the in-app paywall bounce for the other Pro features.
        let snapshot = SpoofSnapshot.load()
        guard !snapshot.proLocked else {
            Log.vpn.debug("[WIDGET] Resync blocked — Pro feature")
            AppGroupPending.requestPaywall()
            WidgetCenter.shared.reloadAllTimelines()
            return .result()
        }

        // Only meaningful when VPN sync is the active mode. If it isn't, treat
        // the tap as a no-op refresh rather than forcing a location change.
        guard snapshot.vpnSync else {
            Log.vpn.debug("[WIDGET] Resync ignored — VPN sync not enabled")
            WidgetCenter.shared.reloadAllTimelines()
            return .result()
        }

        // Stamp the sync start. The widget renders a spinner for a minimum
        // window (driven by the timeline, not by mid-intent rendering, which
        // WidgetKit doesn't do), so the loading state is always visible even if
        // the work finishes instantly (e.g. cache hit / unchanged IP).
        AppGroupPending.markSyncStart()
        // Opportunistic reload so a longer sync can show the spinner during the
        // work too; the flip-timeline below guarantees the fast-finish case.
        WidgetCenter.shared.reloadAllTimelines()

        do {
            let r = try await VpnLookup.sync()
            Log.vpn.info("[WIDGET] Resync → \(r.city.isEmpty ? r.ip : r.city), \(r.country) (\(r.latitude), \(r.longitude))")
            AppGroupPending.writeVpnResync(result: r)
        } catch {
            Log.vpn.warn("[WIDGET] Resync failed: \(error.localizedDescription)")
        }

        // Final reload. getTimeline schedules: spinner now → result at
        // (syncStart + minSyncDisplay), so the spinner shows for the remainder
        // of the minimum window then flips to the fresh data on its own.
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

/// Writes the App Group `pending_*` desired-state record from outside the app
/// process (the widget extension). Mirrors the relevant branch of
/// `SpoofController.writePending(resync:)` — file-based write to dodge cfprefsd
/// caching, read-merge-write so the extension's `region_*` keys are preserved.
///
/// Kept deliberately minimal (VPN-resync case only). If this drifts from
/// `writePending`, unify both behind a shared bridge type.
enum AppGroupPending {
    /// Stamp the moment a widget-initiated resync began, so the widget can show
    /// a spinner for a guaranteed minimum window (see SpoofSnapshot.minSyncDisplay).
    static func markSyncStart() {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppGroup.suite) else { return }
        let plistURL = container.appendingPathComponent("Library/Preferences/\(AppGroup.suite).plist")
        var dict: [String: Any] = (NSDictionary(contentsOf: plistURL) as? [String: Any]) ?? [:]
        dict[AppGroup.widgetSyncingAt] = Date().timeIntervalSince1970
        let prefsDir = plistURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: prefsDir, withIntermediateDirectories: true)
        (dict as NSDictionary).write(to: plistURL, atomically: true)
    }

    /// Stamp a request for the app to present the Pro paywall. Written when a
    /// non-Pro user taps a locked widget/control surface; the app consumes it on
    /// next activation (it can't show a sheet from the widget process). Read-
    /// merge-write so the extension's `region_*` / app's `pending_*` keys survive.
    static func requestPaywall() {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppGroup.suite) else { return }
        let plistURL = container.appendingPathComponent("Library/Preferences/\(AppGroup.suite).plist")
        var dict: [String: Any] = (NSDictionary(contentsOf: plistURL) as? [String: Any]) ?? [:]
        dict[AppGroup.widgetRequestPaywall] = Date().timeIntervalSince1970
        let prefsDir = plistURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: prefsDir, withIntermediateDirectories: true)
        (dict as NSDictionary).write(to: plistURL, atomically: true)
    }

    static func writeVpnResync(result r: VpnLookup.Result) {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppGroup.suite) else {
            Log.bridge.error("[WIDGET] writeVpnResync: App Group container unavailable")
            return
        }
        let plistURL = container.appendingPathComponent("Library/Preferences/\(AppGroup.suite).plist")
        var dict: [String: Any] = (NSDictionary(contentsOf: plistURL) as? [String: Any]) ?? [:]

        let now = Date().timeIntervalSince1970
        let displayName: String = {
            let parts = [r.city, r.country].filter { !$0.isEmpty }
            return parts.isEmpty ? String(format: "%.5f, %.5f", r.latitude, r.longitude)
                                 : parts.joined(separator: ", ")
        }()

        dict[AppGroup.pendingEnabled] = true
        dict[AppGroup.pendingVpnSync] = true
        dict[AppGroup.pendingResync] = true
        dict[AppGroup.pendingCleared] = false
        dict[AppGroup.pendingLatitude] = r.latitude
        dict[AppGroup.pendingLongitude] = r.longitude
        dict[AppGroup.pendingDisplayName] = displayName
        dict[AppGroup.pendingCity] = r.city
        dict[AppGroup.pendingCountry] = r.country
        if !r.timezoneID.isEmpty {
            dict[AppGroup.pendingTzId] = r.timezoneID
        } else {
            dict.removeValue(forKey: AppGroup.pendingTzId)
        }
        dict[AppGroup.pendingUpdatedAt] = now

        let prefsDir = plistURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: prefsDir, withIntermediateDirectories: true)
        (dict as NSDictionary).write(to: plistURL, atomically: true)
        Log.bridge.debug("[WIDGET] writeVpnResync → \(displayName) (\(r.latitude), \(r.longitude))")
    }

    /// Activate a saved favorite as a manual (non-VPN) spoofed location. Mirrors
    /// `SpoofController.setLocation(from:)` → the manual-location branch of
    /// `writePending`. Timezone is left for the extension/app to resolve from the
    /// coordinates (a favorite doesn't carry one).
    static func activateFavorite(_ fav: SpoofFavorite) {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: AppGroup.suite) else {
            Log.bridge.error("[WIDGET] activateFavorite: App Group container unavailable")
            return
        }
        let plistURL = container.appendingPathComponent("Library/Preferences/\(AppGroup.suite).plist")
        var dict: [String: Any] = (NSDictionary(contentsOf: plistURL) as? [String: Any]) ?? [:]

        dict[AppGroup.pendingEnabled] = true
        dict[AppGroup.pendingVpnSync] = false
        dict[AppGroup.pendingResync] = false
        dict[AppGroup.pendingCleared] = false
        dict[AppGroup.pendingLatitude] = fav.latitude
        dict[AppGroup.pendingLongitude] = fav.longitude
        dict[AppGroup.pendingDisplayName] = fav.displayName
        dict[AppGroup.pendingCity] = fav.city
        dict[AppGroup.pendingCountry] = fav.country
        dict.removeValue(forKey: AppGroup.pendingTzId) // resolved downstream
        dict[AppGroup.pendingUpdatedAt] = Date().timeIntervalSince1970

        let prefsDir = plistURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: prefsDir, withIntermediateDirectories: true)
        (dict as NSDictionary).write(to: plistURL, atomically: true)
        Log.bridge.debug("[WIDGET] activateFavorite → \(fav.displayName) (\(fav.latitude), \(fav.longitude))")
    }
}

/// Activates a saved favorite location from the extra-large widget's quick-select
/// grid. Constructed per-button with the favorite's id.
@available(iOS 17.0, macOS 14.0, *)
struct ActivateFavoriteIntent: AppIntent {
    static var title: LocalizedStringResource = "Set Favorite Location"
    static var description = IntentDescription("Switch the spoofed location to a saved favorite.")
    static var openAppWhenRun: Bool = false

    @Parameter(title: "Favorite ID")
    var favoriteId: String

    init() {}
    init(favoriteId: String) { self.favoriteId = favoriteId }

    @MainActor
    func perform() async throws -> some IntentResult {
        // Pro gate (iOS, non-Pro): favorite quick-switch is a Pro widget
        // feature. Don't change the location; flag the paywall and bail.
        let snapshot = SpoofSnapshot.load()
        guard !snapshot.proLocked else {
            Log.location.debug("[WIDGET] ActivateFavorite blocked — Pro feature")
            AppGroupPending.requestPaywall()
            WidgetCenter.shared.reloadAllTimelines()
            return .result()
        }

        let favorites = snapshot.favorites
        guard let fav = favorites.first(where: { $0.id == favoriteId }) else {
            Log.location.debug("[WIDGET] ActivateFavorite: id \(favoriteId) not found")
            return .result()
        }
        Log.location.info("[WIDGET] Activate favorite → \(fav.displayName)")
        AppGroupPending.activateFavorite(fav)
        WidgetCenter.shared.reloadAllTimelines()
        return .result()
    }
}

