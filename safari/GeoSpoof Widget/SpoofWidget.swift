//
//  SpoofWidget.swift
//  GeoSpoof Widget
//
//  Home/Lock-screen widget showing the current spoofed location, timezone, and
//  "running in Safari" status — the iOS/iPadOS counterpart to the macOS menu-bar
//  card. On iOS 17+ the medium/large families include an interactive "Re-sync"
//  button (App Intent) that refreshes the VPN-synced location without opening
//  the app.
//
//  The widget is event-driven: the app and Safari extension call
//  `WidgetCenter.reloadAllTimelines()` when state changes, so we don't poll.
//  A long `.after` refresh is kept only as a freshness safety net (WidgetKit
//  throttles these anyway).
//
//  NOTE: depends on `AppGroup` / models / `VpnLookup` / `Log` from
//  `SpoofModel.swift` (must be a member of the widget extension target).
//

import WidgetKit
import SwiftUI
import AppIntents

// Local brand green so this file doesn't depend on the app's Color extension
// (avoids a duplicate-symbol clash if SpoofModel.swift is also in this target).
private let brandGreen = Color(red: 0x4C / 255, green: 0xAF / 255, blue: 0x50 / 255)

// MARK: - Timeline

struct SpoofEntry: TimelineEntry {
    let date: Date
    let snapshot: SpoofSnapshot
}

struct SpoofTimelineProvider: TimelineProvider {
    func placeholder(in context: Context) -> SpoofEntry {
        SpoofEntry(date: Date(), snapshot: .placeholder)
    }

    func getSnapshot(in context: Context, completion: @escaping (SpoofEntry) -> Void) {
        let snap = context.isPreview ? .placeholder : SpoofSnapshot.load()
        completion(SpoofEntry(date: Date(), snapshot: snap))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SpoofEntry>) -> Void) {
        let snap = SpoofSnapshot.load()
        let now = Date()

        // If a resync just started, keep the spinner visible until the minimum
        // window elapses, then flip to the (already-written) result — scheduled
        // as a second timeline entry, since the widget can't re-render mid-intent.
        if snap.isSyncing, let startedAt = snap.syncingStartedAt {
            let flipDate = startedAt.addingTimeInterval(SpoofSnapshot.minSyncDisplay)
            var done = SpoofSnapshot.load()
            done.isSyncing = false
            done.syncingStartedAt = nil
            let entries = [
                SpoofEntry(date: now, snapshot: snap),
                SpoofEntry(date: max(flipDate, now.addingTimeInterval(0.5)), snapshot: done),
            ]
            completion(Timeline(entries: entries, policy: .atEnd))
            return
        }

        let entry = SpoofEntry(date: now, snapshot: snap)
        // Single entry; updates are pushed via WidgetCenter.reloadAllTimelines().
        // The 30-minute fallback just keeps relative timestamps from going stale
        // if no push happens (WidgetKit throttles these regardless).
        let next = Calendar.current.date(byAdding: .minute, value: 30, to: now) ?? now.addingTimeInterval(1800)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}

// MARK: - Views

struct SpoofWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SpoofEntry

    private var snap: SpoofSnapshot { entry.snapshot }

    var body: some View {
        switch family {
        case .systemSmall:
            smallView
        case .systemExtraLarge:
            extraLargeView
        default:
            mediumLargeView
        }
    }

    // MARK: Small

    private var smallView: some View {
        VStack(alignment: .leading, spacing: 6) {
            header
            // Status dot inline under the title on small (no room in header).
            HStack(spacing: 4) {
                Circle()
                    .fill(snap.enabled ? brandGreen : Color.secondary)
                    .frame(width: 7, height: 7)
                Text(snap.enabled ? "On" : "Off")
                    .font(.caption2.weight(.medium))
                    .foregroundStyle(snap.enabled ? brandGreen : .secondary)
            }
            Spacer(minLength: 0)
            if snap.enabled, snap.hasLocation {
                Text(primaryTitle)
                    .font(.headline)
                    .lineLimit(2)
                    .minimumScaleFactor(0.8)
                if !snap.timezoneID.isEmpty {
                    Text(snap.timezoneID)
                        .font(.caption2)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                }
            } else if snap.enabled {
                Text("No location set")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            } else {
                Text("Protection off")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }
            Spacer(minLength: 0)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackgroundCompat()
    }

    // MARK: Medium / Large

    private var mediumLargeView: some View {
        VStack(alignment: .leading, spacing: 10) {
            header

            VStack(alignment: .leading, spacing: 10) {
                locationSummary
                if family == .systemLarge, snap.enabled, snap.hasLocation {
                    detailRows
                }
            }
            // While a resync is in flight, mask the data with a placeholder
            // redaction (NordVPN-style "resolving" shimmer); the values crossfade
            // back in via .opacityTransition() when the result timeline entry lands.
            .modifier(RedactedWhenSyncing(isSyncing: snap.isSyncing))

            Spacer(minLength: 0)

            HStack(alignment: .bottom) {
                statusLine
                Spacer()
                resyncButton
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackgroundCompat()
    }

    /// The location title + coordinates (or the off / no-location message).
    /// Shared by the medium/large and extra-large layouts.
    @ViewBuilder
    private var locationSummary: some View {
        if snap.enabled, snap.hasLocation {
            VStack(alignment: .leading, spacing: 2) {
                Text(primaryTitle)
                    .font(.headline)
                    .lineLimit(2)
                    .minimumScaleFactor(0.85)
                    .opacityTransition()
                if let lat = snap.latitude, let lon = snap.longitude {
                    Text(String(format: "%.4f, %.4f", lat, lon))
                        .font(.subheadline.monospacedDigit())
                        .foregroundStyle(.secondary)
                        .opacityTransition()
                }
            }
        } else if snap.enabled {
            Text("Protection is on, but no location is set yet.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            Text("Location protection is off.")
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    // MARK: Extra Large (iPad) — status + favorites quick-select

    private var extraLargeView: some View {
        HStack(alignment: .top, spacing: 18) {
            VStack(alignment: .leading, spacing: 10) {
                header
                VStack(alignment: .leading, spacing: 10) {
                    locationSummary
                    if snap.enabled, snap.hasLocation {
                        detailRows
                    }
                }
                .modifier(RedactedWhenSyncing(isSyncing: snap.isSyncing))
                Spacer(minLength: 0)
                HStack(alignment: .bottom) {
                    statusLine
                    Spacer()
                    resyncButton
                }
            }
            .frame(maxWidth: .infinity, alignment: .topLeading)

            Divider()

            favoritesColumn
                .frame(width: 300)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
        .containerBackgroundCompat()
    }

    private var favoritesColumn: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Favorites")
                .font(.headline)

            if snap.favorites.isEmpty {
                VStack(spacing: 8) {
                    Image(systemName: "star")
                        .font(.title)
                        .foregroundStyle(.secondary)
                    Text("Star a location in the app to quick-switch to it here.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else {
                let columns = [GridItem(.flexible(), spacing: 8), GridItem(.flexible(), spacing: 8)]
                LazyVGrid(columns: columns, spacing: 8) {
                    ForEach(snap.favorites.prefix(8)) { fav in
                        favoriteChip(fav)
                    }
                }
                Spacer(minLength: 0)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }

    @ViewBuilder
    private func favoriteChip(_ fav: SpoofFavorite) -> some View {
        let isActive = snap.activeFavoriteId == fav.id
        if #available(iOS 17.0, macOS 14.0, *) {
            Button(intent: ActivateFavoriteIntent(favoriteId: fav.id)) {
                favoriteChipLabel(fav, isActive: isActive)
            }
            .buttonStyle(.plain)
        } else {
            favoriteChipLabel(fav, isActive: isActive)
        }
    }

    private func favoriteChipLabel(_ fav: SpoofFavorite, isActive: Bool) -> some View {
        HStack(spacing: 6) {
            Image(systemName: isActive ? "mappin.circle.fill" : "mappin.circle")
                .foregroundStyle(isActive ? brandGreen : .secondary)
            Text(fav.chipTitle)
                .font(.caption.weight(.medium))
                .lineLimit(1)
            Spacer(minLength: 0)
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .fill(isActive ? brandGreen.opacity(0.16) : Color.primary.opacity(0.06))
        )
        .overlay(
            RoundedRectangle(cornerRadius: 10, style: .continuous)
                .strokeBorder(isActive ? brandGreen.opacity(0.5) : Color.clear, lineWidth: 1)
        )
    }

    private var detailRows: some View {
        VStack(alignment: .leading, spacing: 6) {
            Divider().padding(.vertical, 2)
            if !snap.timezoneID.isEmpty {
                detailRow(icon: "clock", label: "Timezone", value: snap.timezoneID)
            }
            if !snap.ip.isEmpty {
                detailRow(icon: "network", label: "Exit IP", value: snap.ip)
            }
            detailRow(
                icon: snap.vpnSync ? "shield.lefthalf.filled" : "mappin.and.ellipse",
                label: "Mode",
                value: snap.vpnSync ? "VPN sync" : "Manual"
            )
            detailRow(
                icon: snap.webrtc ? "network.badge.shield.half.filled" : "shield.slash",
                label: "WebRTC",
                value: snap.webrtc ? "Protected" : "Off"
            )
        }
    }

    private func detailRow(icon: String, label: String, value: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: icon)
                .font(.caption)
                .foregroundStyle(brandGreen)
                .frame(width: 16)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
            Spacer()
            Text(value)
                .font(.caption.monospacedDigit())
                .lineLimit(1)
                .truncationMode(.middle)
                .opacityTransition()
        }
    }

    // MARK: Pieces

    private var header: some View {
        HStack(spacing: 6) {
            Image("LargeIcon")
                .resizable()
                .aspectRatio(contentMode: .fit)
                .frame(width: 16, height: 16)
                .clipShape(RoundedRectangle(cornerRadius: 3.5, style: .continuous))
            Text("GeoSpoof")
                .font(.footnote.weight(.semibold))
                .layoutPriority(1)
            Spacer()
            // Status dot — only shown on medium/large where there's horizontal room.
            // On small it moves below the title to avoid crowding the header.
            if family != .systemSmall {
                Circle()
                    .fill(snap.enabled ? brandGreen : Color.secondary)
                    .frame(width: 8, height: 8)
            }
        }
    }

    private var statusLine: some View {
        VStack(alignment: .leading, spacing: 1) {
            Label(
                snap.isActiveInSafari ? "Running in Safari" : "Not active in Safari",
                systemImage: snap.isActiveInSafari ? "checkmark.circle.fill" : "circle.dashed"
            )
            .font(.caption2)
            .foregroundStyle(snap.isActiveInSafari ? brandGreen : .secondary)
            .labelStyle(.titleAndIcon)

            if let updatedAt = snap.updatedAt {
                Text("Updated \(relative(updatedAt))")
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
    }

    @ViewBuilder
    private var resyncButton: some View {
        if #available(iOS 17.0, macOS 14.0, *), snap.vpnSync {
            Button(intent: ResyncIntent()) {
                Label(snap.isSyncing ? "Syncing" : "Re-sync",
                      systemImage: "arrow.triangle.2.circlepath")
                    .font(.caption.weight(.semibold))
                    .lineLimit(1)
                    .frame(width: 78)
            }
            .buttonStyle(ResyncButtonStyle(tint: brandGreen))
            .disabled(snap.isSyncing)
        }
    }

    private var primaryTitle: String {
        let parts = [snap.city, snap.country].filter { !$0.isEmpty }
        if !parts.isEmpty { return parts.joined(separator: ", ") }
        if !snap.displayName.isEmpty { return snap.displayName }
        return "Custom location"
    }

    private func relative(_ date: Date) -> String {
        let fmt = RelativeDateTimeFormatter()
        fmt.unitsStyle = .abbreviated
        return fmt.localizedString(for: date, relativeTo: Date())
    }
}

// Back-deployable container background: WidgetKit requires
// `.containerBackground` on iOS 17+, but it doesn't exist below that.
private extension View {
    @ViewBuilder
    func containerBackgroundCompat() -> some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            self.padding(14)
                .containerBackground(.background, for: .widget)
        } else {
            self.padding(14)
        }
    }
}

// MARK: - Sync transition helpers

/// Filled brand-green button that gives press feedback via opacity instead of
/// the default bordered-button scale-down (which looked like the button shrank).
private struct ResyncButtonStyle: ButtonStyle {
    let tint: Color
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .foregroundStyle(.white)
            .padding(.vertical, 6)
            .padding(.horizontal, 12)
            .background(tint, in: RoundedRectangle(cornerRadius: 12, style: .continuous))
            .opacity(configuration.isPressed ? 0.82 : 1.0)
    }
}

/// Masks content with a placeholder redaction while a resync is in flight —
/// the "resolving" look, like NordVPN's status flashing before it settles.
private struct RedactedWhenSyncing: ViewModifier {
    let isSyncing: Bool
    func body(content: Content) -> some View {
        if isSyncing {
            content.redacted(reason: .placeholder)
        } else {
            content
        }
    }
}

private extension View {
    /// Crossfade content changes between timeline entries (iOS 17+) so a resolved
    /// value fades in instead of snapping. No-op on older OSes.
    @ViewBuilder
    func opacityTransition() -> some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            self.contentTransition(.opacity)
        } else {
            self
        }
    }
}

// MARK: - Widget

struct SpoofWidget: Widget {
    let kind = "GeoSpoofStatusWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: SpoofTimelineProvider()) { entry in
            SpoofWidgetEntryView(entry: entry)
        }
        .configurationDisplayName("Spoofed Location")
        .description("Shows your current spoofed location and lets you re-sync to your VPN.")
        .supportedFamilies([.systemSmall, .systemMedium, .systemLarge, .systemExtraLarge])
    }
}

// MARK: - Bundle

@main
struct GeoSpoofWidgetBundle: WidgetBundle {
    var body: some Widget {
        SpoofWidget()
        #if os(iOS)
        if #available(iOS 18.0, *) {
            SpoofResyncControl()
        }
        #endif
    }
}
