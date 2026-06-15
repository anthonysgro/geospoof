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

/// Keys in the shared App Group store. Read/written via the App Group
/// preferences *file* directly (see `writeSharedPrefs` / `readSharedPrefsFile`),
/// not `UserDefaults(suiteName:)`, so cross-process writes can't clobber each
/// other through cfprefsd caching. Must stay in sync with the host app
/// (`AppGroup` in SpoofModel.swift) and the widget.
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
    // Site-scoping (passthrough both ways): mode scalar + allow/deny JSON lists.
    static let scopeMode   = "region_scopeMode"
    static let allowlist   = "region_allowlist"
    static let denylist    = "region_denylist"

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
    static let pScopeMode   = "pending_scopeMode"
    static let pAllowlist   = "pending_allowlist"
    static let pDenylist    = "pending_denylist"
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

    // MARK: - Shared App Group storage (direct plist file, read-merge-write)

    /// Mutate the shared App Group preferences file directly (read-merge-write,
    /// atomic). ALL writers — this extension and the host app's
    /// `SpoofController.writePending` — use this same mechanism. Mixing it with
    /// `UserDefaults(suiteName:)` is unsafe: UserDefaults goes through cfprefsd,
    /// which caches the whole suite in memory and rewrites the entire file on
    /// `synchronize()`, so a UserDefaults write can clobber `pending_*` keys the
    /// app wrote directly (and vice versa). Going file-direct everywhere removes
    /// that hazard. Each write is atomic, so readers never see a torn file.
    @discardableResult
    private func writeSharedPrefs(_ mutate: (inout [String: Any]) -> Void) -> Bool {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: RegionKey.suite) else {
            logger.error("App Group container '\(RegionKey.suite)' unavailable — check entitlements")
            return false
        }
        let plistURL = container.appendingPathComponent("Library/Preferences/\(RegionKey.suite).plist")
        var dict: [String: Any] = (NSDictionary(contentsOf: plistURL) as? [String: Any]) ?? [:]
        mutate(&dict)
        let prefsDir = plistURL.deletingLastPathComponent()
        try? FileManager.default.createDirectory(at: prefsDir, withIntermediateDirectories: true)
        return (dict as NSDictionary).write(to: plistURL, atomically: true)
    }

    // MARK: - Extension -> App (current active region, for display)

    /// Record that the extension is alive in Safari right now. Called on every
    /// handler invocation. This is the production heartbeat the host app reads
    /// to show "running in Safari" status (distinct from the debug keys below).
    private func recordExtensionActivity() {
        writeSharedPrefs { dict in
            dict[RegionKey.lastSeenAt] = Date().timeIntervalSince1970
        }
    }

    private func handleRegionUpdate(_ input: [String: Any]) {
        let ok = writeSharedPrefs { dict in
            let enabled = input["enabled"] as? Bool ?? false
            dict[RegionKey.enabled] = enabled

            if let locationName = input["locationName"] as? [String: Any] {
                dict[RegionKey.displayName] = locationName["displayName"] as? String ?? ""
                dict[RegionKey.city] = locationName["city"] as? String ?? ""
                dict[RegionKey.country] = locationName["country"] as? String ?? ""
            } else {
                dict.removeValue(forKey: RegionKey.displayName)
                dict.removeValue(forKey: RegionKey.city)
                dict.removeValue(forKey: RegionKey.country)
            }

            if let location = input["location"] as? [String: Any],
               let lat = location["latitude"] as? Double,
               let lon = location["longitude"] as? Double {
                dict[RegionKey.latitude] = lat
                dict[RegionKey.longitude] = lon
            } else {
                dict.removeValue(forKey: RegionKey.latitude)
                dict.removeValue(forKey: RegionKey.longitude)
            }

            dict[RegionKey.webrtc] = input["webrtcProtection"] as? Bool ?? false
            dict[RegionKey.vpnSync] = input["vpnSyncEnabled"] as? Bool ?? false

            if let ip = input["ip"] as? String, !ip.isEmpty {
                dict[RegionKey.ip] = ip
            } else {
                dict.removeValue(forKey: RegionKey.ip)
            }

            if let tz = input["timezone"] as? [String: Any], let id = tz["identifier"] as? String {
                dict[RegionKey.tzId] = id
                dict[RegionKey.tzOffset] = tz["offset"] as? Double ?? 0
                dict[RegionKey.tzDst] = tz["dstOffset"] as? Double ?? 0
            } else {
                dict.removeValue(forKey: RegionKey.tzId)
                dict.removeValue(forKey: RegionKey.tzOffset)
                dict.removeValue(forKey: RegionKey.tzDst)
            }

            // Favorites arrive as a JSON string; store verbatim for the app to decode.
            if let favoritesJSON = input["favorites"] as? String {
                dict[RegionKey.favorites] = favoritesJSON
            }

            // Site-scoping: mode scalar + allow/deny lists (JSON strings).
            if let scopeMode = input["scopeMode"] as? String {
                dict[RegionKey.scopeMode] = scopeMode
            }
            if let allowlistJSON = input["allowlist"] as? String {
                dict[RegionKey.allowlist] = allowlistJSON
            }
            if let denylistJSON = input["denylist"] as? String {
                dict[RegionKey.denylist] = denylistJSON
            }

            dict[RegionKey.updatedAt] = Date().timeIntervalSince1970
        }

        if ok {
            logger.log("Region updated: enabled=\(input["enabled"] as? Bool ?? false)")
        } else {
            logger.error("handleRegionUpdate: failed to write App Group plist")
        }
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
        if let scopeMode = dict[RegionKey.pScopeMode] as? String {
            pending["scopeMode"] = scopeMode
        }
        if let allowlistJSON = dict[RegionKey.pAllowlist] as? String {
            pending["allowlist"] = allowlistJSON
        }
        if let denylistJSON = dict[RegionKey.pDenylist] as? String {
            pending["denylist"] = denylistJSON
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
        writeSharedPrefs { dict in
            dict["debug_messageType"] = type
            dict["debug_handlerInvokedAt"] = Date().timeIntervalSince1970
        }
    }

    /// Records what the handler returned for a GET_PENDING_SETTINGS call.
    private func writeDebugPending(_ payload: [String: Any]) {
        writeSharedPrefs { dict in
            if let pending = payload["pending"] as? [String: Any] {
                dict["debug_pendingSeen"] = pending["displayName"] as? String ?? "(no name)"
            } else {
                dict["debug_pendingSeen"] = "null"
            }
        }
    }

}
