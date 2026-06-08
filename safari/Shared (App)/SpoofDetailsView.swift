//
//  SpoofDetailsView.swift
//  Shared (App)
//
//  The "Details" screen (parity with the popup Details tab) and the first-run
//  onboarding sheet that guides the user to enable the Safari extension.
//

import SwiftUI
#if os(iOS)
import UIKit
#elseif os(macOS)
import SafariServices
#endif

/// Wraps the Details screen in a navigation container for use as a tab root.
struct DetailsTab: View {
    @ObservedObject var controller: SpoofController

    var body: some View {
        AdaptiveNavigationStack {
            SpoofDetailsView(controller: controller)
        }
    }
}

struct SpoofDetailsView: View {
    @ObservedObject var controller: SpoofController
    @State private var expandedGroups: Set<String> = []

    var body: some View {
        Form {
            locationSection
            timezoneSection
            webrtcSection
            apisSection
        }
        .groupedFormStyle()
        .navigationTitle("Details")
    }

    // MARK: Location

    private var locationSection: some View {
        Section("Spoofed Location") {
            if let loc = controller.location {
                LabeledRow(label: "Latitude", value: String(format: "%.6f", loc.latitude))
                LabeledRow(label: "Longitude", value: String(format: "%.6f", loc.longitude))
                LabeledRow(label: "Accuracy", value: "±\(Int(loc.accuracy)) m")
                if let name = controller.locationName?.displayName, !name.isEmpty {
                    LabeledRow(label: "Location", value: name)
                }
            } else {
                Text("Not configured").foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Timezone

    private var timezoneSection: some View {
        Section("Spoofed Timezone") {
            if let tz = controller.timezone {
                LabeledRow(label: "Identifier", value: tz.identifier)
                LabeledRow(label: "Offset", value: tz.utcOffsetText)
                LabeledRow(label: "DST Offset", value: "\(tz.dstOffsetMinutes) min")
                if tz.fallback {
                    Text("⚠️ Estimated (API unavailable)")
                        .font(.caption).foregroundStyle(.orange)
                }
            } else {
                Text("Not configured").foregroundStyle(.secondary)
            }
        }
    }

    // MARK: WebRTC

    private var webrtcSection: some View {
        Section("WebRTC Protection") {
            if controller.webrtcProtection {
                Label("Active", systemImage: "checkmark.shield.fill")
                    .foregroundStyle(.green)
                Text("RTCPeerConnection is wrapped to suppress ICE candidate gathering, preventing WebRTC from leaking your real IP address.")
                    .font(.caption).foregroundStyle(.secondary)
            } else {
                Label("Inactive", systemImage: "xmark.shield")
                    .foregroundStyle(.secondary)
                Text("WebRTC can leak your real IP address even when using a VPN.")
                    .font(.caption).foregroundStyle(.secondary)
            }
        }
    }

    // MARK: Overridden APIs

    /// The full set of overridden APIs, grouped by surface. Only groups whose
    /// protection is active are included; the structural / anti-fingerprinting
    /// overrides are always installed while protection is on.
    private var apiGroups: [APICategory] {
        var groups: [APICategory] = []

        if controller.hasLocation {
            groups.append(APICategory(title: "Geolocation", apis: [
                "navigator.geolocation.getCurrentPosition()",
                "navigator.geolocation.watchPosition()",
                "navigator.geolocation.clearWatch()",
                "navigator.permissions.query()",
                "GeolocationCoordinates.prototype.latitude",
                "GeolocationCoordinates.prototype.longitude",
                "GeolocationCoordinates.prototype.accuracy",
                "GeolocationCoordinates.prototype.altitude",
                "GeolocationCoordinates.prototype.altitudeAccuracy",
                "GeolocationCoordinates.prototype.heading",
                "GeolocationCoordinates.prototype.speed",
                "GeolocationCoordinates.prototype.toJSON()",
                "GeolocationPosition.prototype.coords",
                "GeolocationPosition.prototype.timestamp",
                "GeolocationPosition.prototype.toJSON()",
            ]))
        }

        if controller.timezone != nil {
            groups.append(APICategory(title: "Date & Time", apis: [
                "Date() constructor",
                "Date.parse()",
                "Date.prototype.getTimezoneOffset()",
                "Date.prototype.getHours() / getMinutes() / getSeconds()",
                "Date.prototype.getDate() / getDay() / getMonth() / getFullYear()",
                "Date.prototype.setHours() / setMinutes() / setSeconds()",
                "Date.prototype.setDate() / setMonth() / setFullYear()",
                "Date.prototype.toString() / toDateString() / toTimeString()",
                "Date.prototype.toLocaleString() / toLocaleDateString() / toLocaleTimeString()",
                "Intl.DateTimeFormat()",
                "Intl.DateTimeFormat.prototype.resolvedOptions()",
                "Intl.DateTimeFormat.prototype.formatToParts()",
                "Intl.DateTimeFormat.prototype.formatRange() / formatRangeToParts()",
            ]))

            groups.append(APICategory(title: "Temporal (where available)", apis: [
                "Temporal.Now.timeZoneId()",
                "Temporal.Now.plainDateTimeISO()",
                "Temporal.Now.plainDateISO()",
                "Temporal.Now.plainTimeISO()",
                "Temporal.Now.zonedDateTimeISO()",
            ]))
        }

        if controller.webrtcProtection {
            groups.append(APICategory(title: "WebRTC", apis: [
                "RTCPeerConnection (constructor wrapper)",
                "RTCPeerConnection.prototype.getStats()",
            ]))
        }

        groups.append(APICategory(title: "Anti-Fingerprinting & Structural", apis: [
            "Function.prototype.toString()",
            "Document.prototype.lastModified",
            "HTMLIFrameElement.prototype.contentWindow",
            "HTMLIFrameElement.prototype.contentDocument",
            "Node.prototype.appendChild() / insertBefore() / replaceChild()",
            "Element.prototype.append() / prepend() / replaceWith()",
            "Element.prototype.insertAdjacentElement() / insertAdjacentHTML()",
            "Element.prototype.innerHTML (setter)",
        ]))

        return groups
    }

    private var apisSection: some View {
        Section("Overridden APIs") {
            if !controller.enabled {
                Text("None (protection disabled)").foregroundStyle(.secondary)
            } else {
                let groups = apiGroups
                let total = groups.reduce(0) { $0 + $1.apis.count }

                VStack(alignment: .leading, spacing: 3) {
                    Text("Key Overrides")
                        .font(.subheadline.weight(.semibold))
                    Text("\(total) JavaScript APIs are intercepted across \(groups.count) groups while protection is active. Expand a group for the full list.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                .padding(.vertical, 2)

                ForEach(groups) { group in
                    let isExpanded = expandedGroups.contains(group.id)
                    Button {
                        withAnimation(.easeInOut(duration: 0.2)) {
                            if isExpanded {
                                expandedGroups.remove(group.id)
                            } else {
                                expandedGroups.insert(group.id)
                            }
                        }
                    } label: {
                        HStack(spacing: 8) {
                            Text(group.title)
                                .font(.subheadline.weight(.medium))
                                .foregroundStyle(.primary)
                            Spacer()
                            Text("\(group.apis.count)")
                                .font(.caption.monospacedDigit())
                                .foregroundStyle(.secondary)
                            Image(systemName: "chevron.right")
                                .font(.caption.weight(.semibold))
                                .foregroundStyle(.secondary)
                                .rotationEffect(.degrees(isExpanded ? 90 : 0))
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(group.title)
                    .accessibilityValue(isExpanded ? "Expanded" : "Collapsed")
                    .accessibilityHint("\(group.apis.count) APIs")

                    if isExpanded {
                        ForEach(group.apis, id: \.self) { api in
                            Text(api)
                                .font(.caption.monospaced())
                                .foregroundStyle(.secondary)
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .textSelection(.enabled)
                        }
                    }
                }
            }
        }
    }
}

private struct APICategory: Identifiable {
    var id: String { title }
    let title: String
    let apis: [String]
}

// MARK: - Onboarding

/// A classic multi-step native onboarding that walks the user through enabling
/// the Safari extension, with a button that jumps to the system settings.
struct OnboardingView: View {
    let onDone: () -> Void

    @State private var step = 0
    private let stepCount = 4
    private var isLast: Bool { step == stepCount - 1 }

    private var symbol: String {
        switch step {
        case 1: return "lock.shield.fill"
        case 2: return "puzzlepiece.extension.fill"
        default: return "checkmark.circle.fill"
        }
    }
    private var title: String {
        switch step {
        case 0: return "Welcome to GeoSpoof"
        case 1: return "About That Permission"
        case 2: return "Enable in Safari"
        default: return "You're All Set"
        }
    }
    private var subtitle: String {
        switch step {
        case 0:
            return "Mask your browser's location and timezone with a tap -- and keep your real whereabouts private."
        case 1:
            return "Safari will show a permission warning. Here is why you can trust it."
        case 2:
            #if os(iOS)
            return "Turn on GeoSpoof in Safari's extensions, then allow access to all websites."
            #else
            return "In Safari, choose Settings > Extensions, turn on GeoSpoof, then allow access to websites."
            #endif
        default:
            return "Pick a location and GeoSpoof keeps the real one hidden. You can change it anytime."
        }
    }

    private static let trustPoints: [(symbol: String, text: String)] = [
        ("lock.fill",           "Runs entirely on-device -- no backend, no servers."),
        ("eye.slash.fill",      "Never reads, stores, or transmits your browsing."),
        ("chevron.left.forwardslash.chevron.right", "Open source -- the code is public and auditable."),
        ("hand.raised.fill",    "No account, no sign-up, no tracking of any kind."),
    ]

    private var primaryTitle: String {
        isLast ? "Get Started" : "Continue"
    }

    var body: some View {
        VStack(spacing: 20) {
            Spacer(minLength: 0)

            Group {
                if step == 0 {
                    Image("LargeIcon")
                        .resizable()
                        .aspectRatio(contentMode: .fit)
                        .frame(width: 104, height: 104)
                } else {
                    Image(systemName: symbol)
                        .font(.system(size: 68))
                        .symbolRenderingMode(.hierarchical)
                        .foregroundStyle(Color.brand)
                }
            }
            .transition(.scale.combined(with: .opacity))
            .id("symbol-\(step)")

            VStack(spacing: 10) {
                Text(title)
                    .font(.largeTitle.bold())
                    .multilineTextAlignment(.center)
                Text(subtitle)
                    .font(.body)
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
            }
            .padding(.horizontal)
            .id("text-\(step)")

            if step == 1 {
                VStack(alignment: .leading, spacing: 12) {
                    ForEach(Self.trustPoints, id: \.symbol) { point in
                        HStack(spacing: 12) {
                            Image(systemName: point.symbol)
                                .frame(width: 22)
                                .foregroundStyle(Color.brand)
                            Text(point.text)
                                .font(.subheadline)
                                .foregroundStyle(.primary)
                        }
                    }
                }
                .padding()
                .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                .padding(.horizontal)
                .padding(.top, 4)
            }

            if step == 2 {
                #if os(macOS)
                Button {
                    openSystemSettings()
                } label: {
                    Label("Open Safari Settings", systemImage: "arrow.up.forward.app")
                        .frame(maxWidth: .infinity)
                }
                .glassButtonStyle()
                .controlSize(.large)
                .padding(.horizontal)
                .padding(.top, 4)
                #else
                // iOS has no public deep link into Safari → Extensions, so we
                // guide with the path instead of a button that would just open
                // this app's (unrelated) Settings page.
                Label("Settings › Apps › Safari › Extensions", systemImage: "gearshape")
                    .font(.subheadline.weight(.medium))
                    .foregroundStyle(Color.brand)
                    .padding(.vertical, 10)
                    .padding(.horizontal, 16)
                    .background(Color.brand.opacity(0.12), in: Capsule())
                    .padding(.top, 4)
                #endif
            }

            Spacer(minLength: 0)

            HStack(spacing: 8) {
                ForEach(0..<stepCount, id: \.self) { i in
                    Circle()
                        .fill(i == step ? Color.brand : Color.secondary.opacity(0.3))
                        .frame(width: 8, height: 8)
                }
            }

            Button {
                advance()
            } label: {
                Text(primaryTitle).frame(maxWidth: .infinity)
            }
            .glassButtonStyle(prominent: true)
            .controlSize(.large)
            .padding(.horizontal)

            Button("Back") {
                withAnimation { step -= 1 }
            }
            .font(.subheadline)
            .opacity(step > 0 ? 1 : 0)
            .disabled(step == 0)
        }
        .padding()
        .padding(.bottom, 12)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .animation(.easeInOut(duration: 0.25), value: step)
        #if os(macOS)
        .frame(minWidth: 460, minHeight: 560)
        #endif
        .interactiveDismissDisabled()
    }

    private func advance() {
        if isLast {
            onDone()
        } else {
            withAnimation { step += 1 }
        }
    }

    private func openSystemSettings() {
        #if os(macOS)
        SFSafariApplication.showPreferencesForExtension(withIdentifier: "com.moonloaf.geospoof.Extension")
        #endif
    }
}
