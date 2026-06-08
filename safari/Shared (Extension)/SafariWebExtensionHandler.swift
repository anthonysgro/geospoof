//
//  SafariWebExtensionHandler.swift
//  Shared (Extension)
//
//  Created by Anthony on 5/1/26.
//

import SafariServices
import os.log

private let logger = Logger(
    subsystem: Bundle.main.bundleIdentifier ?? "com.moonloaf.geospoof.Extension",
    category: "SafariWebExtensionHandler"
)

/// Keys in the shared App Group UserDefaults suite. Must stay in sync with the
/// reading side in the host apps and the writing side here.
enum RegionKey {
    static let suite       = "group.com.moonloaf.geospoof"

    // Extension -> App: "last seen" heartbeat. Written on every handler
    // invocation (the background polls GET_PENDING_SETTINGS on boot + tab
    // activity), so the containing app can tell whether GeoSpoof is actually
    // running in Safari — the one signal iOS otherwise can't surface.
    static let lastSeenAt  = "extension_lastSeenAt"

    // Extension -> App: the currently active spoofed region (for display).
    static let enabled     = "region_enabled"
    static let displayName = "region_displayName"
    static let city        = "region_city"
    static let country     = "region_country"
    static let latitude    = "region_latitude"
    static let longitude   = "region_longitude"
    static let updatedAt   = "region_updatedAt"
    static let webrtc      = "region_webrtc"
    static let vpnSync     = "region_vpnSync"
    static let ip          = "region_ip"
    static let tzId        = "region_tzId"
    static let tzOffset    = "region_tzOffset"
    static let tzDst       = "region_tzDst"
    // Favorites synced as a JSON string (passthrough both ways).
    static let favorites   = "region_favorites"

    // App -> Extension: a full desired-state snapshot the extension adopts on
    // next launch / tab activity (last-writer-wins by pending_updatedAt).
    static let pEnabled     = "pending_enabled"
    static let pDisplayName = "pending_displayName"
    static let pLatitude    = "pending_latitude"
    static let pLongitude   = "pending_longitude"
    static let pUpdatedAt   = "pending_updatedAt"
    static let pWebrtc      = "pending_webrtc"
    static let pVpnSync     = "pending_vpnSync"
    static let pCleared     = "pending_cleared"
    static let pResync      = "pending_resync"
    static let pFavorites   = "pending_favorites"
}

class SafariWebExtensionHandler: NSObject, NSExtensionRequestHandling {

    func beginRequest(with context: NSExtensionContext) {
        recordExtensionActivity()

        let request = context.inputItems.first as? NSExtensionItem

        let message: Any?
        if #available(iOS 15.0, macOS 11.0, *) {
            message = request?.userInfo?[SFExtensionMessageKey]
        } else {
            message = request?.userInfo?["message"]
        }

        var responsePayload: [String: Any] = ["ok": true]

        if let dict = message as? [String: Any], let type = dict["type"] as? String {
            writeDebug(type: type)
            switch type {
            case "REGION_UPDATE":
                handleRegionUpdate(dict)
            case "GET_PENDING_SETTINGS":
                responsePayload = readPendingSettings()
                writeDebugPending(responsePayload)
            default:
                logger.log("Unhandled native message type: \(type, privacy: .public)")
            }
        } else {
            logger.log("Received message: \(String(describing: message))")
        }

        let response = NSExtensionItem()
        if #available(iOS 15.0, macOS 11.0, *) {
            response.userInfo = [ SFExtensionMessageKey: responsePayload ]
        } else {
            response.userInfo = [ "message": responsePayload ]
        }

        context.completeRequest(returningItems: [ response ], completionHandler: nil)
    }

    // MARK: - Extension -> App (current active region, for display)

    /// Record that the extension is alive in Safari right now. Called on every
    /// handler invocation. This is the production heartbeat the host app reads
    /// to show "running in Safari" status (distinct from the debug keys below).
    private func recordExtensionActivity() {
        guard let defaults = UserDefaults(suiteName: RegionKey.suite) else { return }
        defaults.set(Date().timeIntervalSince1970, forKey: RegionKey.lastSeenAt)
        defaults.synchronize()
    }

    private func handleRegionUpdate(_ dict: [String: Any]) {
        guard let defaults = UserDefaults(suiteName: RegionKey.suite) else {
            logger.error("App Group suite '\(RegionKey.suite)' unavailable — check entitlements")
            return
        }

        let enabled = dict["enabled"] as? Bool ?? false
        defaults.set(enabled, forKey: RegionKey.enabled)

        if let locationName = dict["locationName"] as? [String: Any] {
            defaults.set(locationName["displayName"] as? String ?? "", forKey: RegionKey.displayName)
            defaults.set(locationName["city"] as? String ?? "", forKey: RegionKey.city)
            defaults.set(locationName["country"] as? String ?? "", forKey: RegionKey.country)
        } else {
            defaults.removeObject(forKey: RegionKey.displayName)
            defaults.removeObject(forKey: RegionKey.city)
            defaults.removeObject(forKey: RegionKey.country)
        }

        if let location = dict["location"] as? [String: Any],
           let lat = location["latitude"] as? Double,
           let lon = location["longitude"] as? Double {
            defaults.set(lat, forKey: RegionKey.latitude)
            defaults.set(lon, forKey: RegionKey.longitude)
        } else {
            defaults.removeObject(forKey: RegionKey.latitude)
            defaults.removeObject(forKey: RegionKey.longitude)
        }

        defaults.set(dict["webrtcProtection"] as? Bool ?? false, forKey: RegionKey.webrtc)
        defaults.set(dict["vpnSyncEnabled"] as? Bool ?? false, forKey: RegionKey.vpnSync)

        if let ip = dict["ip"] as? String, !ip.isEmpty {
            defaults.set(ip, forKey: RegionKey.ip)
        } else {
            defaults.removeObject(forKey: RegionKey.ip)
        }

        if let tz = dict["timezone"] as? [String: Any], let id = tz["identifier"] as? String {
            defaults.set(id, forKey: RegionKey.tzId)
            defaults.set(tz["offset"] as? Double ?? 0, forKey: RegionKey.tzOffset)
            defaults.set(tz["dstOffset"] as? Double ?? 0, forKey: RegionKey.tzDst)
        } else {
            defaults.removeObject(forKey: RegionKey.tzId)
            defaults.removeObject(forKey: RegionKey.tzOffset)
            defaults.removeObject(forKey: RegionKey.tzDst)
        }

        // Favorites arrive as a JSON string; store verbatim for the app to decode.
        if let favoritesJSON = dict["favorites"] as? String {
            defaults.set(favoritesJSON, forKey: RegionKey.favorites)
        }

        defaults.set(Date().timeIntervalSince1970, forKey: RegionKey.updatedAt)
        defaults.synchronize()

        logger.log("Region updated: enabled=\(enabled)")
    }

    // MARK: - App -> Extension (pending location set in the app)

    /// Returns the pending location the app wrote (if any) so the extension
    /// background can adopt it. Shape:
    /// `{ pending: { latitude, longitude, displayName, enabled, updatedAt } }`
    /// or `{ pending: null }` when nothing is queued.
    private func readPendingSettings() -> [String: Any] {
        // Read the App Group preferences file directly to avoid the
        // cross-process UserDefaults caching that can hide the app's writes.
        guard let dict = readSharedPrefsFile(),
              dict[RegionKey.pUpdatedAt] != nil else {
            return ["pending": NSNull()]
        }

        var pending: [String: Any] = [
            "updatedAt": (dict[RegionKey.pUpdatedAt] as? Double) ?? 0,
            "enabled": (dict[RegionKey.pEnabled] as? Bool) ?? false,
            "webrtc": (dict[RegionKey.pWebrtc] as? Bool) ?? false,
            "vpnSync": (dict[RegionKey.pVpnSync] as? Bool) ?? false,
            "cleared": (dict[RegionKey.pCleared] as? Bool) ?? false,
            "resync": (dict[RegionKey.pResync] as? Bool) ?? false,
            "displayName": (dict[RegionKey.pDisplayName] as? String) ?? "",
        ]
        if let lat = dict[RegionKey.pLatitude] as? Double,
           let lon = dict[RegionKey.pLongitude] as? Double {
            pending["latitude"] = lat
            pending["longitude"] = lon
        }
        if let favoritesJSON = dict[RegionKey.pFavorites] as? String {
            pending["favorites"] = favoritesJSON
        }
        return ["pending": pending]
    }

    private func readSharedPrefsFile() -> [String: Any]? {
        // Read the App Group preferences file directly. Avoid
        // `UserDefaults(suiteName:).dictionaryRepresentation()` — against a
        // container it uses kCFPreferencesAnyUser, which the system rejects and
        // logs ("detaching from cfprefsd"). A missing file returns nil.
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: RegionKey.suite) else { return nil }
        let plistURL = container
            .appendingPathComponent("Library/Preferences/\(RegionKey.suite).plist")
        return NSDictionary(contentsOf: plistURL) as? [String: Any]
    }

    // MARK: - Debug instrumentation (temporary)

    /// Records that the handler was invoked and with which message type, so the
    /// containing app can confirm the extension is actually talking to it.
    private func writeDebug(type: String) {
        guard let defaults = UserDefaults(suiteName: RegionKey.suite) else { return }
        defaults.set(type, forKey: "debug_messageType")
        defaults.set(Date().timeIntervalSince1970, forKey: "debug_handlerInvokedAt")
        defaults.synchronize()
    }

    /// Records what the handler returned for a GET_PENDING_SETTINGS call.
    private func writeDebugPending(_ payload: [String: Any]) {
        guard let defaults = UserDefaults(suiteName: RegionKey.suite) else { return }
        if let pending = payload["pending"] as? [String: Any] {
            defaults.set(pending["displayName"] as? String ?? "(no name)", forKey: "debug_pendingSeen")
        } else {
            defaults.set("null", forKey: "debug_pendingSeen")
        }
        defaults.synchronize()
    }

}
