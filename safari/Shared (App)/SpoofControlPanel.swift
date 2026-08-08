//
//  SpoofControlPanel.swift
//  Shared (App)
//
//  The native control panel — feature parity with the extension popup, styled
//  to feel like a first-party iOS/macOS app per Apple's HIG: a clean grouped
//  Form for the main screen, a pushed `.searchable` Set Location screen, and
//  centered tinted row actions instead of stretched buttons.
//

import SwiftUI
import MapKit
import StoreKit
import Combine
#if canImport(UIKit)
import UIKit
#endif
#if canImport(AppKit)
import AppKit
#endif

struct SpoofControlPanel: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var pro = ProStore.shared

    @AppStorage("spoofOnboardingCompleted") private var onboardingCompleted = false
    @AppStorage("founderWelcomeShown") private var founderWelcomeShown = false
    /// Whether the user dismissed the passive Pro discovery card. Persisted so
    /// it stays gone once dismissed. (Replaces the old auto-presented pitch
    /// sheet, which interrupted users mid-task — see `proDiscoverySection`.)
    @AppStorage("proCardDismissed") private var proCardDismissed = false
    @State private var showOnboarding = false
    @State private var showTrustInfo = false
    @State private var renaming: SpoofFavorite?
    @State private var showPaywall = false
    @State private var showFounderWelcome = false
    /// Used to re-check the review gate when the app comes back to the
    /// foreground. Without it, a resident process that never gets a fresh
    /// `onAppear` stops accruing qualifying occasions entirely.
    @Environment(\.scenePhase) private var scenePhase

    var body: some View {
        Form {
            #if os(iOS)
            setupSection
            #endif
            protectionSection
            locationSection
            proDiscoverySection
            vpnSyncSection
            if !controller.favorites.isEmpty {
                favoritesSection
            }
            verificationSection
        }
        .groupedFormStyle()
        .tint(.brand)
        .refreshable { await controller.refreshFromExtensionInteractive() }
        .adaptiveModalCover(isPresented: $showOnboarding) {
            OnboardingView { onboardingCompleted = true; showOnboarding = false }
        }
        .sheet(item: $renaming) { fav in
            RenameFavoriteSheet(favorite: fav) { newLabel in
                controller.renameFavorite(fav, to: newLabel)
                renaming = nil
            }
        }
        .sheet(isPresented: $showFounderWelcome) {
            FounderWelcomeSheet {
                founderWelcomeShown = true
                showFounderWelcome = false
            }
        }
        .sheet(isPresented: $showPaywall) {
            ProPaywallView()
        }
        .onAppear {
            controller.refreshFromExtension()
            if !onboardingCompleted { showOnboarding = true }
            evaluateReviewPrompt()
            if pro.isFounder && !founderWelcomeShown { showFounderWelcome = true }
        }
        .onChange(of: controller.isActiveInSafari) { _ in
            // `refreshFromExtension()` is async, so on a cold start this is
            // usually where the extension check-in first lands — `onAppear`
            // above runs before it and finds `isActiveInSafari` still false.
            evaluateReviewPrompt()
        }
        .onChange(of: controller.hasLocation) { _ in
            // Setting a location is the strongest "it's working" signal. Without
            // this, a user who opens the app and *then* spoofs wouldn't count as
            // a qualifying session until a later relaunch.
            evaluateReviewPrompt()
        }
        .onChange(of: onboardingCompleted) { _ in
            // Finishing setup is the highest-goodwill moment in the app's life,
            // and it's gated behind the very flag it flips — so without this the
            // first-run success could never count.
            evaluateReviewPrompt()
        }
        .onChange(of: scenePhase) { phase in
            if phase == .active { evaluateReviewPrompt() }
        }
        // Visible failures keep the review ask quiet for a few days. Observed
        // here in the view layer rather than reported from the models, so
        // `SpoofModel` (which is also compiled into the widget target) stays
        // free of any dependency on `ReviewPrompt`.
        .onChange(of: controller.vpnError != nil) { failed in
            if failed { ReviewPrompt.shared.noteTrouble() }
        }
        .onChange(of: pro.lastError != nil) { failed in
            if failed { ReviewPrompt.shared.noteTrouble() }
        }
        .onChange(of: pro.isFounder) { isFounder in
            if isFounder && !founderWelcomeShown { showFounderWelcome = true }
        }
    }

    /// Reports a genuinely positive moment — GeoSpoof confirmed running in
    /// Safari with a location set — to `ReviewPrompt`, which owns all the
    /// throttling and decides whether to actually ask.
    ///
    /// Called from several triggers on purpose; `ReviewPrompt` debounces, so
    /// over-reporting is harmless and under-reporting is what previously left
    /// users stuck below the threshold. Note we deliberately do *not* pitch Pro
    /// here — an interrupting modal at this exact moment hijacks the user's
    /// first successful spoof before they can even see the result; Pro awareness
    /// is handled passively by `proDiscoverySection` instead.
    private func evaluateReviewPrompt() {
        guard onboardingCompleted,
              controller.isActiveInSafari,
              controller.hasLocation else { return }
        ReviewPrompt.shared.recordSignificantEvent()
    }

    // MARK: Pro discovery

    /// A passive, dismissible card introducing GeoSpoof Pro. Shown only to
    /// non-Pro users once they've actually spoofed a location (so the value is
    /// already felt), and never again after dismissal. Unlike a modal pitch it
    /// doesn't cover the screen or interrupt the spoof result — it just sits in
    /// the list and opens the Pro detail screen on tap. The real conversion
    /// moments are the contextual gates (locked auto-sync, widgets, per-site
    /// rules); this only ensures the tier is discoverable.
    @ViewBuilder
    private var proDiscoverySection: some View {
        if !pro.isPro && controller.hasLocation && !proCardDismissed {
            Section {
                HStack(spacing: 12) {
                    NavigationLink {
                        ProDetailView()
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: "sparkles")
                                .font(.system(size: 22))
                                .foregroundStyle(Color.brand)
                                .frame(width: 30)
                                .accessibilityHidden(true)
                            VStack(alignment: .leading, spacing: 2) {
                                Text("Do more with GeoSpoof Pro")
                                    .font(.headline)
                                Text("Automatic VPN sync, per-site rules, widgets, and more.")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                    .fixedSize(horizontal: false, vertical: true)
                            }
                        }
                    }

                    Spacer(minLength: 8)

                    // Visible dismiss — works on macOS (no swipe in a Form) and
                    // iOS alike. `.borderless` keeps it a discrete tap target so
                    // it doesn't trigger the NavigationLink.
                    Button {
                        proCardDismissed = true
                    } label: {
                        Image(systemName: "xmark.circle.fill")
                            .font(.title3)
                            .symbolRenderingMode(.hierarchical)
                            .foregroundStyle(.secondary)
                    }
                    .buttonStyle(.borderless)
                    .accessibilityLabel("Dismiss")
                }
                #if os(iOS)
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        proCardDismissed = true
                    } label: {
                        Label("Dismiss", systemImage: "xmark")
                    }
                }
                #endif
            }
        }
    }

    // MARK: Protection

    private var protectionSection: some View {
        Section {
            Toggle(isOn: Binding(
                get: { controller.enabled },
                set: { controller.setEnabled($0) }
            )) {
                Label("Location Protection", systemImage: "location.fill.viewfinder")
            }

            Toggle(isOn: Binding(
                get: { controller.webrtcProtection },
                set: { controller.setWebRTCProtection($0) }
            )) {
                Label("WebRTC Protection", systemImage: "network.badge.shield.half.filled")
            }
        } header: {
            Text("Protection")
        } footer: {
            VStack(alignment: .leading, spacing: 6) {
                #if os(iOS)
                safariStatusLine
                #endif
                if controller.enabled && !controller.hasLocation {
                    Label("Protection is on, but no location is set yet.", systemImage: "exclamationmark.triangle.fill")
                        .foregroundStyle(.orange)
                }
            }
        }
    }

    #if os(iOS)
    /// State-driven hand-holding card for the one thing the app can't convey on
    /// its own: getting GeoSpoof running in Safari (the step users miss).
    /// Disappears once the extension checks in. Setting a location is the app's
    /// core UI — the Protection section already flags a missing location — so we
    /// deliberately don't duplicate that here.
    @ViewBuilder
    private var setupSection: some View {
        if !controller.isActiveInSafari {
            Section {
                VStack(alignment: .leading, spacing: 14) {
                    Text("GeoSpoof runs inside Safari. Switch it on for the page you're viewing to start spoofing.")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)

                    SafariActivationAnimation()

                    Button {
                        openSafari()
                    } label: {
                        Label("Open Safari", systemImage: "safari")
                            .frame(maxWidth: .infinity)
                    }
                    .glassButtonStyle(prominent: true)
                    .controlSize(.large)

                    Button {
                        showTrustInfo = true
                    } label: {
                        Label("Is GeoSpoof safe?", systemImage: "checkmark.shield")
                            .font(.subheadline)
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.plain)
                    .foregroundStyle(Color.brand)
                }
                .padding(.vertical, 6)
                .adaptiveModalCover(isPresented: $showTrustInfo) { TrustSheet() }
            } header: {
                Text("Finish Setup")
            }
        }
    }

    private func openSafari() {
        // Opens our own verify page so the user can switch GeoSpoof on for the
        // page (via the page menu) and immediately see geolocation, timezone,
        // and leak checks reflect the spoofed location — which also fires the
        // activation heartbeat. Note: iOS has no public API to force Safari
        // specifically; this opens the user's default browser, which is Safari
        // for the vast majority.
        //
        // Shares verifyURL(campaign:) with the home-screen link so both follow the
        // app's language. This previously hardcoded a bare `geospoof.com` host,
        // which cost a redirect hop on every open.
        UIApplication.shared.open(verifyURL(campaign: "verify-setup"))
    }

    /// Quiet "GeoSpoof is running in Safari" confirmation, shown once the
    /// extension has checked in. The not-yet-detected nudge lives in the
    /// Setup card above, so this only surfaces the positive state.
    @ViewBuilder
    private var safariStatusLine: some View {
        if controller.isActiveInSafari {
            Label("GeoSpoof is running in Safari.", systemImage: "checkmark.circle.fill")
                .foregroundStyle(.green)
        }
    }
    #endif

    // MARK: Location (current)

    private var locationSection: some View {
        Section("Location") {
            if let loc = controller.location {
                LocationMapPane(controller: controller, latitude: loc.latitude, longitude: loc.longitude)
                    .listRowInsets(EdgeInsets())
                    .swipeActions(edge: .trailing) {
                        if !controller.vpnSyncEnabled {
                            Button(role: .destructive) {
                                controller.clearLocation()
                            } label: {
                                Label("Clear", systemImage: "xmark")
                            }
                            .tint(.red)
                        }
                    }
            } else {
                HStack(spacing: 12) {
                    Image(systemName: "mappin.slash")
                        .font(.title2)
                        .foregroundStyle(.secondary)
                    Text("No location set").foregroundStyle(.secondary)
                }
            }

            if !controller.vpnSyncEnabled {
                NavigationLink {
                    SetLocationView(controller: controller)
                } label: {
                    Label(controller.hasLocation ? "Change Location" : "Set Location",
                          systemImage: "mappin.and.ellipse")
                }
            }
        }
    }

    // MARK: Sync with VPN

    private var vpnSyncSection: some View {
        Section {
            Toggle(isOn: Binding(
                get: { controller.vpnSyncEnabled },
                set: { controller.setVPNSync($0) }
            )) {
                Label("Sync with VPN", systemImage: "shield.lefthalf.filled")
            }

            if controller.vpnSyncEnabled {
                autoBackgroundSyncRow

                if let ip = controller.lastSyncedIP {
                    LabeledRow(label: "Detected IP", value: Text(verbatim: ip))
                }
                if let err = controller.vpnError {
                    Text(err).font(.subheadline).foregroundStyle(.red)
                }
                Button {
                    controller.syncVPN(force: controller.lastSyncedIP != nil)
                } label: {
                    HStack {
                        Spacer()
                        if controller.isSyncing {
                            ProgressView().controlSize(.small)
                        }
                        Text(controller.lastSyncedIP == nil ? "Sync Now" : "Re-sync")
                        Spacer()
                    }
                }
                .disabled(controller.isSyncing)
            }
        } header: {
            Text("VPN")
        } footer: {
            if controller.vpnSyncEnabled {
                #if os(iOS)
                Text("Matches your spoofed location to your current public IP. Auto Background Sync keeps it matched as your VPN changes — even when the app is closed.")
                #else
                Text("Matches your spoofed location to your current public IP. Auto Background Sync keeps it matched as your VPN changes — even in the background.")
                #endif
            }
        }
    }

    /// "Auto Background Sync" — an inherent Pro capability (no user toggle):
    /// for Pro it's always on while VPN sync is active, so we show a passive
    /// "On" status; non-Pro users see a locked PRO row that opens the paywall
    /// (the manual "Sync Now" below stays free for everyone). Shown on iOS and
    /// macOS; the gating + bridge to the extension lives in
    /// SpoofController.autoSyncBlocked.
    @ViewBuilder
    private var autoBackgroundSyncRow: some View {
        if pro.isPro {
            // Read-only status, not a toggle: it's always on for Pro.
            autoBackgroundSyncStatusRow
        } else {
            Button {
                showPaywall = true
            } label: {
                HStack(spacing: 12) {
                    Label("Auto Background Sync", systemImage: "arrow.triangle.2.circlepath")
                    Spacer(minLength: 8)
                    Text("PRO")
                        .font(.caption2.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.brand.opacity(0.18), in: Capsule())
                        .foregroundStyle(Color.brand)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }

    /// The Pro "On" status row. Uses the native label/value row
    /// (LabeledContent) so "On" renders at the standard Settings-row treatment,
    /// falling back to a matching HStack on iOS 15 (LabeledContent is iOS 16+ /
    /// macOS 13+). The `#available` check lives here — not in a `@ViewBuilder` —
    /// and returns `AnyView` explicitly so SwiftUI never synthesizes
    /// `ViewBuilder.buildLimitedAvailability`, whose return type only conforms
    /// to `View` on macOS 26 (this app targets macOS 13).
    private var autoBackgroundSyncStatusRow: some View {
        if #available(iOS 16.0, *) {
            return AnyView(
                LabeledContent {
                    Text("On")
                } label: {
                    Label("Auto Background Sync", systemImage: "arrow.triangle.2.circlepath")
                }
            )
        } else {
            return AnyView(
                HStack {
                    Label("Auto Background Sync", systemImage: "arrow.triangle.2.circlepath")
                    Spacer()
                    Text("On").foregroundStyle(.secondary)
                }
            )
        }
    }
    // MARK: Verification — "Verify Your Protection" link on the home (iOS + macOS)

    private var verificationSection: some View {
        Section {
            Link(destination: verifyURL(campaign: "verify")) {
                HStack {
                    Label("Verify Your Protection", systemImage: "checkmark.shield")
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
    }

    /// URL prefix for the site locale matching the language the app is currently
    /// displaying, or `""` for English.
    ///
    /// The site serves English at the bare path and every other locale under a
    /// `/<code>` prefix (`site/src/lib/i18n/config.ts`). Two things stop this
    /// from being a straight pass-through of the app's language code:
    ///
    /// - The app ships more languages than the site translates. `nl`, `sv` and
    ///   `vi` have no site copy, so they fall through to unprefixed English
    ///   rather than requesting a prefix that does not exist.
    /// - The app's Chinese catalog is `zh-Hans` (script) while the site's locale
    ///   is `zh-CN` (region). They refer to the same copy under different codes.
    ///
    /// `tests/unit/verify-link-locale.unit.test.ts` asserts this stays in step
    /// with both the app catalog and the site's locale list.
    private var siteLocalePrefix: String {
        // preferredLocalizations resolves against the .lproj sets actually in the
        // bundle, so this is the language the UI is really rendering — not the
        // raw system preference, which may be a language we do not ship.
        guard let language = Bundle.main.preferredLocalizations.first else { return "" }
        switch language {
        case "de", "es", "fr", "id", "ja", "ru": return "/\(language)"
        case "pt-BR": return "/pt-BR"
        case "zh-Hans": return "/zh-CN"
        default: return "" // en, plus nl/sv/vi and anything unrecognised
        }
    }

    /// The verify-page URL for the app's current language, UTM-tagged so visits
    /// attribute to the right native app surface (iOS vs macOS) in analytics
    /// rather than landing in "unknown".
    ///
    /// - Parameter campaign: distinguishes the entry point, since the setup card
    ///   and the home-screen link lead to the same page for different reasons.
    private func verifyURL(campaign: String) -> URL {
        // Can't go through `AppLink.site(_:campaign:)` — this is the one link that
        // carries the site locale prefix. It shares `AppLink.source` so the app
        // identifier is still defined in exactly one place.
        // Force-unwrap is safe: the host is a literal, the path prefix comes from
        // the closed set above, and both query values are caller-side literals.
        return URL(string: "https://www.geospoof.com\(siteLocalePrefix)/verify"
            + "?utm_source=\(AppLink.source)&utm_medium=app&utm_campaign=\(campaign)")!
    }

    // MARK: Favorites

    private var favoritesSection: some View {
        Section {
            ForEach(controller.favorites) { fav in
                Button {
                    controller.activate(fav)
                } label: {
                    HStack(spacing: 12) {
                        Image(systemName: "mappin.circle.fill")
                            .foregroundStyle(.secondary)
                        VStack(alignment: .leading, spacing: 2) {
                            Text(fav.chipTitle).lineLimit(1)
                            if !fav.displayName.isEmpty && fav.displayName != fav.chipTitle {
                                Text(fav.displayName)
                                    .font(.caption).foregroundStyle(.secondary).lineLimit(1)
                            }
                        }
                        Spacer()
                        if controller.activeFavorite?.id == fav.id {
                            Image(systemName: "checkmark")
                                .font(.body.weight(.semibold))
                                .foregroundStyle(Color.brand)
                        }
                    }
                    .contentShape(Rectangle())
                }
                .buttonStyle(.plain)
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        controller.removeFavorite(fav)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                    .tint(.red)
                }
                .contextMenu {
                    Button { renaming = fav } label: { Label("Rename", systemImage: "pencil") }
                    Button(role: .destructive) {
                        controller.removeFavorite(fav)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        } header: {
            Text("Favorites")
        } footer: {
            if controller.atCapacity {
                Text("List full — remove a favorite first.")
                    .foregroundStyle(.red)
            }
        }
    }

}

// MARK: - Map

/// The card's map preview. On iOS 17 / macOS 14+ it's a live, non-interactive
/// 3D flyover view with the timezone region highlighted. On older OSes it falls
/// back to a flat static snapshot (snapshots can't render 3D or overlays).
struct LocationMapPreview: View {
    let latitude: Double
    let longitude: Double
    let timezoneID: String?

    var body: some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            LiveMapPreview(latitude: latitude, longitude: longitude, timezoneID: timezoneID)
        } else {
            MapSnapshotView(latitude: latitude, longitude: longitude)
        }
    }
}

/// Live, non-interactive 3D preview with the timezone polygon highlight.
@available(iOS 17.0, macOS 14.0, *)
private struct LiveMapPreview: View {
    let latitude: Double
    let longitude: Double
    let timezoneID: String?
    @ObservedObject private var shapes = TimezoneShapeStore.shared
    @State private var camera: MapCameraPosition

    init(latitude: Double, longitude: Double, timezoneID: String?) {
        self.latitude = latitude
        self.longitude = longitude
        self.timezoneID = timezoneID
        _camera = State(initialValue: .camera(MapCamera(
            centerCoordinate: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
            distance: 2_400_000, heading: 0, pitch: 0
        )))
    }

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
    private var rings: [[CLLocationCoordinate2D]] {
        guard let timezoneID, shapes.isReady else { return [] }
        return shapes.rings(for: timezoneID)
    }

    var body: some View {
        // No `.id` here: re-creating the Map on every coordinate change tears
        // down tiles, the waypoint, and the polygon (a visible flash). Instead we
        // keep the Map alive and animate the camera to the new location, so the
        // annotation and timezone mesh update in place.
        Map(position: $camera, interactionModes: []) {
            ForEach(Array(rings.enumerated()), id: \.offset) { _, ring in
                MapPolygon(coordinates: ring)
                    .foregroundStyle(Color.mapHighlight.opacity(0.28))
                    .stroke(Color.mapHighlight.opacity(0.95), lineWidth: 1.0)
            }
            Annotation("", coordinate: coordinate, anchor: .bottom) { SpoofMap.pin }
        }
        .mapStyle(.hybrid(elevation: .realistic))
        .onChange(of: "\(latitude),\(longitude)") { _, _ in
            withAnimation(.easeInOut(duration: 0.6)) {
                camera = .camera(MapCamera(
                    centerCoordinate: coordinate,
                    distance: 2_400_000, heading: 0, pitch: 0
                ))
            }
        }
        .onAppear { shapes.preload() }
    }
}

/// A lightweight static map image rendered via `MKMapSnapshotter`. Used for the
/// card preview so the list isn't running a live (tile-streaming, Metal-backed)
/// map — which is slow and intercepts taps. The live `Map` is reserved for the
/// fullscreen view.
struct MapSnapshotView: View {
    let latitude: Double
    let longitude: Double
    /// Eye-to-center distance in meters (larger = more zoomed out).
    var distance: CLLocationDistance = 2_000_000
    var pitch: CGFloat = 55

    @Environment(\.colorScheme) private var colorScheme
    @State private var image: Image?
    @State private var pinPoint: CGPoint?

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .topLeading) {
                if let image {
                    image.resizable().scaledToFill()
                } else {
                    Rectangle().fill(Color.secondary.opacity(0.15))
                }
                if let pinPoint, image != nil {
                    SpoofMap.pin.position(x: pinPoint.x, y: pinPoint.y - 16)
                }
            }
            .clipped()
            .task(id: "\(latitude),\(longitude),\(Int(geo.size.width))x\(Int(geo.size.height)),\(colorScheme)") {
                await render(size: geo.size)
            }
        }
    }

    @MainActor
    private func render(size: CGSize) async {
        guard size.width > 1, size.height > 1 else { return }

        let options = MKMapSnapshotter.Options()
        // A pitched flyover camera gives the 3D, zoomed-out "window on the globe" look.
        options.camera = MKMapCamera(
            lookingAtCenter: coordinate,
            fromDistance: distance,
            pitch: pitch,
            heading: 0
        )
        options.size = size
        options.mapType = .hybridFlyover
        options.pointOfInterestFilter = .excludingAll
        #if os(iOS)
        options.traitCollection = UITraitCollection(userInterfaceStyle: colorScheme == .dark ? .dark : .light)
        #endif

        let snapshotter = MKMapSnapshotter(options: options)
        let snapshot: MKMapSnapshotter.Snapshot? = await withCheckedContinuation { cont in
            snapshotter.start(with: .global(qos: .userInitiated)) { snap, _ in
                cont.resume(returning: snap)
            }
        }
        guard let snapshot else { return }
        #if os(iOS)
        image = Image(uiImage: snapshot.image)
        pinPoint = snapshot.point(for: coordinate)
        #else
        image = Image(nsImage: snapshot.image)
        // AppKit snapshots use a bottom-left origin; flip to SwiftUI's top-left.
        let p = snapshot.point(for: coordinate)
        pinPoint = CGPoint(x: p.x, y: size.height - p.y)
        #endif
    }
}

/// A MapKit view centered on a coordinate with a brand-tinted pin. Uses the
/// modern Map API on iOS 17 / macOS 14+, with a back-deployed fallback. When
/// `interactive` is false it's a static "window"; when true it pans/zooms.
struct SpoofMap: View {
    let latitude: Double
    let longitude: Double
    var span: Double = 12
    var interactive: Bool = false

    @State private var fallbackRegion: MKCoordinateRegion

    init(latitude: Double, longitude: Double, span: Double = 12, interactive: Bool = false) {
        self.latitude = latitude
        self.longitude = longitude
        self.span = span
        self.interactive = interactive
        _fallbackRegion = State(initialValue: MKCoordinateRegion(
            center: CLLocationCoordinate2D(latitude: latitude, longitude: longitude),
            span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)
        ))
    }

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }

    private var region: MKCoordinateRegion {
        MKCoordinateRegion(
            center: coordinate,
            span: MKCoordinateSpan(latitudeDelta: span, longitudeDelta: span)
        )
    }

    var body: some View {
        if #available(iOS 17.0, macOS 14.0, *) {
            Map(initialPosition: .region(region), interactionModes: interactive ? .all : []) {
                Annotation("", coordinate: coordinate) { Self.pin }
            }
            .mapStyle(.hybrid)
        } else {
            Map(
                coordinateRegion: interactive ? $fallbackRegion : .constant(region),
                interactionModes: interactive ? .all : [],
                annotationItems: [MapPinItem(coordinate: coordinate)]
            ) { item in
                MapAnnotation(coordinate: item.coordinate) { Self.pin }
            }
        }
    }

    @ViewBuilder static var pin: some View {
        // A classic thin white map-pin waypoint, with a soft shadow for contrast
        // over satellite imagery.
        Image(systemName: "mappin")
            .font(.system(size: 28, weight: .semibold))
            .foregroundStyle(.white)
            .shadow(color: .black.opacity(0.5), radius: 2, y: 1)
    }
}

private struct MapPinItem: Identifiable {
    let id = UUID()
    let coordinate: CLLocationCoordinate2D
}

/// The unified location card: a map "window" on top with an expand control, and
/// a native grouped-style strip beneath showing the place name + coordinates.
struct LocationMapPane: View {
    @ObservedObject var controller: SpoofController
    let latitude: Double
    let longitude: Double

    @Environment(\.horizontalSizeClass) private var hSizeClass
    @State private var fullScreen = false

    /// Taller on regular-width layouts (iPad / large windows), compact on iPhone.
    private var mapHeight: CGFloat {
        hSizeClass == .compact ? 180 : 320
    }

    private var title: LocalizedStringKey {
        // The resolved place name is reverse-geocoded runtime data, so it is
        // passed through as a key that misses and falls back to itself rather
        // than being looked up. Only the "Custom Location" fallback is a real
        // localizable literal, and Xcode extracts just that one.
        if let name = controller.locationName?.displayName, !name.isEmpty {
            return LocalizedStringKey(stringLiteral: name)
        }
        return "Custom Location"
    }

    var body: some View {
        VStack(spacing: 0) {
            ZStack(alignment: .topTrailing) {
                LocationMapPreview(
                    latitude: latitude,
                    longitude: longitude,
                    timezoneID: controller.timezone?.identifier
                )
                .frame(height: mapHeight)
                .clipped()
                .allowsHitTesting(false)

                Image(systemName: "arrow.up.left.and.arrow.down.right")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(.primary)
                    .frame(width: 36, height: 36)
                    .glassCircle()
                    .padding(10)
                    .allowsHitTesting(false)
            }
            .contentShape(Rectangle())
            .onTapGesture { fullScreen = true }
            .accessibilityElement()
            .accessibilityAddTraits(.isButton)
            .accessibilityLabel("Expand map to full screen")
            .help("Expand map to full screen")

            HStack(spacing: 12) {
                Image(systemName: "mappin.circle.fill")
                    .font(.system(size: 30))
                    .foregroundStyle(Color.brand)
                    .frame(width: 36, height: 36)
                    .accessibilityHidden(true)
                VStack(alignment: .leading, spacing: 1) {
                    Text(title)
                        .font(.headline)
                        .lineLimit(2)
                        .fixedSize(horizontal: false, vertical: true)
                    Text(String(format: "%.5f, %.5f", latitude, longitude))
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .monospacedDigit()
                        .textSelection(.enabled)
                }
                Spacer(minLength: 8)
                if !controller.vpnSyncEnabled {
                    Button {
                        controller.toggleFavorite()
                    } label: {
                        Image(systemName: controller.isActiveFavorite ? "star.fill" : "star")
                            .font(.system(size: 18))
                            .foregroundStyle(controller.isActiveFavorite ? Color.starAccent : Color.secondary)
                    }
                    .buttonStyle(.plain)
                    .accessibilityLabel(controller.isActiveFavorite ? "Remove from favorites" : "Save as favorite")
                    .help(controller.isActiveFavorite ? "Remove from Favorites" : "Save as Favorite")
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
        }
        .modifier(MapPresentation(isPresented: $fullScreen) {
            FullScreenMapView(controller: controller, latitude: latitude, longitude: longitude, timezone: controller.timezone)
        })
        .onAppear { TimezoneShapeStore.shared.preload() }
    }
}

/// Presents the fullscreen map: a cover on iOS, a sheet on macOS.
private struct MapPresentation<MapContent: View>: ViewModifier {
    @Binding var isPresented: Bool
    @ViewBuilder var content: () -> MapContent

    func body(content base: Content) -> some View {
        #if os(iOS)
        base.fullScreenCover(isPresented: $isPresented, content: content)
        #else
        base.sheet(isPresented: $isPresented) {
            self.content().frame(minWidth: 640, minHeight: 520)
        }
        #endif
    }
}

/// Interactive fullscreen map. Controls live in a navigation toolbar (not
/// floating over the map) so they're reliably tappable and natively accessible
/// — on iOS 26 the toolbar renders as Liquid Glass. Defaults to the 3D view;
/// the toggle shows a globe (tap → 3D) or map (tap → 2D). The 3D tilt needs the
/// iOS 17 / macOS 14 camera API.
struct FullScreenMapView: View {
    var controller: SpoofController
    let latitude: Double
    let longitude: Double
    var timezone: SpoofTimezone?
    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var pro = ProStore.shared
    @State private var is3D = true

    /// Pro "pick a spot" placement mode: a fixed center reticle stays put while
    /// the user pans the map underneath it; confirming drops the spoofed
    /// location at the map center. This is a pure convenience over the normal
    /// `setLocation` path — no extension-specific behavior.
    @State private var isPicking = false
    @State private var pickedCenter: CLLocationCoordinate2D?
    @State private var lastTickAt: Date = .distantPast
    /// Drives the Pro paywall for non-Pro users tapping the locked placement
    /// control. Presented as a fullScreenCover (see body) rather than a sheet,
    /// which would auto-dismiss when stacked over this map cover.
    @State private var showPaywall = false

    /// "Pick a spot" placement is a Pro feature on the Apple apps (iOS + macOS);
    /// founders/subscribers are exempt via `pro.isPro`. The dropped coordinate
    /// flows through the normal setLocation path.
    private var placementLocked: Bool {
        return !pro.isPro
    }

    private var tzTitle: String {
        guard let tz = timezone else { return "" }
        return "\(tz.utcOffsetText) · \(tz.identifier)"
    }

    var body: some View {
        AdaptiveNavigationStack {
            Group {
                if #available(iOS 17.0, macOS 14.0, *) {
                    FullScreenMap3D(
                        latitude: latitude,
                        longitude: longitude,
                        is3D: is3D,
                        isPicking: isPicking,
                        timezoneID: timezone?.identifier,
                        onCenterChange: handleCenterChange
                    )
                    // Map controls float over the map as a vertical glass
                    // cluster (the Apple Maps / Flighty pattern) instead of
                    // crowding the nav bar title. Hidden during placement.
                    .overlay(alignment: .topTrailing) { if !isPicking { floatingControls } }
                    .overlay { if isPicking { placementReticle } }
                    .overlay(alignment: .top) { if isPicking { placementHint } }
                } else {
                    SpoofMap(latitude: latitude, longitude: longitude, span: 6, interactive: true)
                }
            }
            .ignoresSafeArea(edges: .bottom)
            // Placement confirm lives in a bottom action bar (the idiomatic
            // pin-drop pattern), sitting above the home indicator via the inset.
            .safeAreaInset(edge: .bottom) {
                if isPicking { placementConfirmBar }
            }
            .navigationTitle(isPicking ? "" : tzTitle)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar { closeToolbarItem }
        }
        // Present the paywall as a fullScreenCover, not a `.sheet`: a sheet
        // presented over this fullScreenCover (which hosts a live MapKit view)
        // hits a UIKit presentation race and auto-dismisses itself. A nested
        // fullScreenCover is the supported pattern — it animates up natively,
        // keeps the map mounted underneath, and dismisses cleanly via its own
        // close button. (macOS has no fullScreenCover and never locks placement,
        // so it falls back to a sheet that's effectively unreachable.)
        #if os(iOS)
        .fullScreenCover(isPresented: $showPaywall) {
            ProPaywallView()
        }
        #else
        .sheet(isPresented: $showPaywall) {
            ProPaywallView()
        }
        #endif
    }

    /// Floating control cluster (top-trailing) — a single combined glass capsule
    /// with the map-style and placement buttons stacked and divided, matching
    /// Apple Maps' grouped controls rather than two separate glass bubbles.
    private var floatingControls: some View {
        VStack(spacing: 0) {
            Button {
                withAnimation(.easeInOut(duration: 0.6)) { is3D.toggle() }
            } label: {
                Image(systemName: is3D ? "map" : "globe.americas.fill")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 46, height: 46)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel(is3D ? "Switch to 2D" : "Switch to 3D")

            Divider().frame(width: 30)

            Button {
                if placementLocked {
                    showPaywall = true
                } else {
                    enterPicking()
                }
            } label: {
                Image(systemName: "mappin.and.ellipse")
                    .font(.system(size: 17, weight: .semibold))
                    .frame(width: 46, height: 46)
                    .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .accessibilityLabel("Pick a spot on the map")
        }
        .glassCapsule()
        .padding(.top, 8)
        .padding(.trailing, 12)
    }

    /// Bottom action shown while placing: a full-width primary "Set Location
    /// Here" commit (the pin-drop pattern) plus a secondary Cancel. Each is its
    /// own glass button, so they stay legible over the map without a heavy bar.
    private var placementConfirmBar: some View {
        VStack(spacing: 10) {
            Button {
                confirmPlacement()
            } label: {
                Text("Set Location Here")
                    .font(.headline)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 6)
            }
            .glassButtonStyle(prominent: true)
            .tint(.brand)

            Button {
                cancelPicking()
            } label: {
                Text("Cancel")
                    .font(.subheadline.weight(.medium))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .glassButtonStyle()
        }
        .padding(.horizontal, 20)
        .padding(.top, 10)
        .padding(.bottom, 8)
    }

    /// A pin fixed at the map center, with a precise dot at the exact point the
    /// coordinate will be dropped. Non-interactive so panning passes through.
    private var placementReticle: some View {
        ZStack {
            Image(systemName: "mappin")
                .font(.system(size: 36, weight: .semibold))
                .foregroundStyle(Color.brand)
                .shadow(color: .black.opacity(0.45), radius: 2, y: 1)
                .offset(y: -16)
            Circle()
                .fill(Color.brand)
                .frame(width: 8, height: 8)
                .overlay(Circle().stroke(.white, lineWidth: 1.5))
                .shadow(color: .black.opacity(0.4), radius: 1)
        }
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var placementHint: some View {
        Text("Move the map to place your pin")
            .font(.footnote.weight(.medium))
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(.ultraThinMaterial, in: Capsule())
            .padding(.top, 10)
            .allowsHitTesting(false)
    }

    /// Track the live map center while placing, and emit a light "selection"
    /// tick as it scrolls (throttled so it reads like a picker, not a buzz).
    /// Skip the work entirely when not picking — `onMapCameraChange(.continuous)`
    /// fires every frame, and there's nothing to track until placement starts.
    private func handleCenterChange(_ center: CLLocationCoordinate2D) {
        guard isPicking else { return }
        pickedCenter = center
        let now = Date()
        if now.timeIntervalSince(lastTickAt) > 0.1 {
            lastTickAt = now
            Haptics.selection()
        }
    }

    /// Enter placement mode, seeded at the currently shown location.
    private func enterPicking() {
        Haptics.impact(.rigid)
        pickedCenter = CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
        withAnimation(.easeInOut(duration: 0.25)) { isPicking = true }
    }

    /// Confirm: drop the spoofed location at the current map center, then close.
    private func confirmPlacement() {
        if let c = pickedCenter {
            Haptics.notify(.success)
            controller.setLocation(latitude: c.latitude, longitude: c.longitude, name: nil)
        }
        isPicking = false
        dismiss()
    }

    /// Leave placement mode without changing the location (stay on the map).
    private func cancelPicking() {
        Haptics.impact(.light)
        withAnimation(.easeInOut(duration: 0.25)) { isPicking = false }
    }

    @ToolbarContentBuilder
    private var closeToolbarItem: some ToolbarContent {
        ToolbarItem(placement: .cancellationAction) {
            Button {
                dismiss()
            } label: {
                Image(systemName: "xmark")
            }
            .accessibilityLabel("Close map")
        }
    }
}

/// iOS 17 / macOS 14 camera-based map that tilts into a 3D view and shades the
/// spoofed location's timezone region with the brand color.
@available(iOS 17.0, macOS 14.0, *)
private struct FullScreenMap3D: View {
    let latitude: Double
    let longitude: Double
    let is3D: Bool
    var isPicking: Bool = false
    let timezoneID: String?
    var onCenterChange: ((CLLocationCoordinate2D) -> Void)? = nil

    @ObservedObject private var shapes = TimezoneShapeStore.shared
    @State private var camera: MapCameraPosition = .automatic

    private var coordinate: CLLocationCoordinate2D {
        CLLocationCoordinate2D(latitude: latitude, longitude: longitude)
    }
    private var region: MKCoordinateRegion {
        MKCoordinateRegion(
            center: coordinate,
            span: MKCoordinateSpan(latitudeDelta: 40, longitudeDelta: 40)
        )
    }
    private var camera3D: MapCameraPosition {
        .camera(MapCamera(centerCoordinate: coordinate, distance: 6_000_000, heading: 0, pitch: 0))
    }
    /// Tighter, flat region used when entering placement mode so the user starts
    /// at a usable zoom for picking a precise spot rather than continental.
    private var pickingRegion: MKCoordinateRegion {
        MKCoordinateRegion(
            center: coordinate,
            span: MKCoordinateSpan(latitudeDelta: 0.2, longitudeDelta: 0.2)
        )
    }
    private var rings: [[CLLocationCoordinate2D]] {
        guard let timezoneID, shapes.isReady else { return [] }
        return shapes.rings(for: timezoneID)
    }

    var body: some View {
        Map(position: $camera) {
            ForEach(Array(rings.enumerated()), id: \.offset) { _, ring in
                MapPolygon(coordinates: ring)
                    .foregroundStyle(Color.mapHighlight.opacity(0.28))
                    .stroke(Color.mapHighlight.opacity(0.95), lineWidth: 1.2)
            }
            // The fixed spoofed-location pin is hidden while picking — the
            // centered reticle (drawn by FullScreenMapView) is the placement
            // indicator instead.
            if !isPicking {
                Annotation("", coordinate: coordinate, anchor: .bottom) { SpoofMap.pin }
            }
        }
        .mapStyle(.hybrid(elevation: (is3D && !isPicking) ? .realistic : .flat))
        .onMapCameraChange(frequency: .continuous) { context in
            onCenterChange?(context.region.center)
        }
        .onAppear {
            camera = is3D ? camera3D : .region(region)
            shapes.preload()
        }
        .onChange(of: is3D) { _, newValue in
            withAnimation(.easeInOut(duration: 0.6)) {
                camera = newValue ? camera3D : .region(region)
            }
        }
        .onChange(of: isPicking) { _, picking in
            // Drop to a flat, usable zoom when entering placement mode.
            if picking {
                withAnimation(.easeInOut(duration: 0.4)) { camera = .region(pickingRegion) }
            }
        }
    }
}

// MARK: - Set Location (pushed, searchable)

extension View {
    /// Pin a list row's separator to the content leading edge so it spans the
    /// full row width. The `listRowSeparatorLeading` alignment is iOS 16+ /
    /// macOS 13+; on iOS 15 the row keeps SwiftUI's default separator inset.
    @ViewBuilder
    fileprivate func fullWidthRowSeparator() -> some View {
        if #available(iOS 16.0, macOS 13.0, *) {
            alignmentGuide(.listRowSeparatorLeading) { _ in 0 }
        } else {
            self
        }
    }
}

struct SetLocationView: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var store = CityStore.shared
    @Environment(\.dismiss) private var dismiss

    @State private var searchText = ""
    @State private var latText = ""
    @State private var lonText = ""
    /// `LocalizedStringKey?`: all three messages are our own validation copy.
    @State private var coordError: LocalizedStringKey?

    private enum CoordinateField { case latitude, longitude }
    @FocusState private var focusedField: CoordinateField?

    private var results: [PlaceResult] {
        searchText.isEmpty ? store.popular(7) : store.search(searchText)
    }

    var body: some View {
        List {
            Section {
                if !store.isLoaded && searchText.isEmpty {
                    HStack {
                        ProgressView().controlSize(.small)
                        Text("Loading cities…").foregroundStyle(.secondary)
                    }
                } else if results.isEmpty {
                    Text("No locations found").foregroundStyle(.secondary)
                } else {
                    ForEach(results) { place in
                        Button {
                            Haptics.impact(.light)
                            controller.setLocation(from: place)
                            #if os(iOS)
                            dismiss()
                            #endif
                        } label: {
                            HStack(spacing: 12) {
                                Text(place.flag)
                                    .font(.title2)
                                    .accessibilityHidden(true)
                                VStack(alignment: .leading, spacing: 2) {
                                    Text(place.city).foregroundStyle(.primary)
                                    Text(place.country)
                                        .font(.caption).foregroundStyle(.secondary)
                                }
                                Spacer()
                                if isCurrent(place) {
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
            } header: {
                Text(searchText.isEmpty ? "Popular Cities" : "Results")
            }

            Section {
                coordField("Latitude (−90 to 90)", text: $latText)
                    .focused($focusedField, equals: .latitude)
                    .submitLabel(.next)
                coordField("Longitude (−180 to 180)", text: $lonText)
                    .focused($focusedField, equals: .longitude)
                    .submitLabel(.done)
                Button {
                    pasteCoordinates()
                } label: {
                    HStack { Spacer(); Text("Paste Coordinates"); Spacer() }
                }
                // Center-via-Spacer rows make SwiftUI anchor the row separator to
                // the (centered) text, leaving a short divider. Pin it to the
                // content leading edge so it spans the row like the field rows.
                .fullWidthRowSeparator()
                Button {
                    applyManualCoordinates()
                } label: {
                    HStack { Spacer(); Text("Set Location"); Spacer() }
                }
                .disabled(latText.isEmpty || lonText.isEmpty)
            } header: {
                Text("Enter Coordinates")
            } footer: {
                // Section footer is the HIG-idiomatic place for helper text; it
                // doubles as the inline validation message when a paste or a
                // manual value can't be read.
                if let coordError {
                    Text(coordError).foregroundStyle(.red)
                } else {
                    Text("Tip: paste a coordinate pair or a geohash")
                }
            }
        }
        .searchable(text: $searchText, prompt: "Search for a city")
        .navigationTitle("Set Location")
        .tint(.brand)
        .onAppear { store.preload() }
        // The keyboard is driven from its own Return key: Latitude ("next") →
        // Longitude ("Done") → dismiss. The List's built-in keyboard avoidance
        // lifts the focused field above the keyboard on its own, so we add NO
        // custom scroll/tap handling here — doing so fights the system and is
        // what was pushing the keyboard over the inputs.
        .onSubmit {
            switch focusedField {
            case .latitude: focusedField = .longitude
            case .longitude, .none: focusedField = nil
            }
        }
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
    }

    private func isCurrent(_ place: PlaceResult) -> Bool {
        guard let loc = controller.location else { return false }
        return SpoofController.round4(loc.latitude) == SpoofController.round4(place.latitude)
            && SpoofController.round4(loc.longitude) == SpoofController.round4(place.longitude)
    }

    private func coordField(_ title: String, text: Binding<String>) -> some View {
        let field = TextField(title, text: text)
        #if os(iOS)
        return field.keyboardType(.numbersAndPunctuation)
        #else
        return field
        #endif
    }

    /// Read the clipboard's plain text and, if it's a COMPLETE coordinate (pair /
    /// DMS / geohash / labelled), reflect it in both fields for review; the user
    /// confirms with "Set Location". Behavior-identical to the extension's
    /// `parseCoordinates` via the shared parity fixture. A string we can't read is
    /// flagged in the section footer. Single values are pasted straight into a
    /// field by the system, landing in just that field.
    private func pasteCoordinates() {
        let raw = (readClipboardString() ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        guard !raw.isEmpty else { return }  // nothing on the clipboard — no-op
        guard let parsed = CoordinateParser.parse(raw) else {
            coordError = "Couldn't read coordinates — try a coordinate pair or a geohash"
            Haptics.notify(.error)
            return
        }
        latText = Self.coordString(parsed.latitude)
        lonText = Self.coordString(parsed.longitude)
        coordError = nil
        Haptics.impact(.light)
    }

    /// The pasteboard's plain-text string, across platforms. On iOS an explicit
    /// paste may surface the system "Allow Paste" confirmation (expected for a
    /// deliberate paste action); on macOS it reads directly.
    private func readClipboardString() -> String? {
        #if canImport(UIKit)
        return UIPasteboard.general.string
        #elseif canImport(AppKit)
        return NSPasteboard.general.string(forType: .string)
        #else
        return nil
        #endif
    }

    /// Format a coordinate for a text field: round to 6 decimals (~0.11 m) and
    /// drop trailing zeros.
    private static func coordString(_ value: Double) -> String {
        let rounded = (value * 1_000_000).rounded() / 1_000_000
        return String(rounded)
    }

    private func applyManualCoordinates() {
        guard let lat = Double(latText.replacingOccurrences(of: "−", with: "-")), lat >= -90, lat <= 90 else {
            coordError = "Latitude must be between −90 and 90."
            Haptics.notify(.error)
            return
        }
        guard let lon = Double(lonText.replacingOccurrences(of: "−", with: "-")), lon >= -180, lon <= 180 else {
            coordError = "Longitude must be between −180 and 180."
            Haptics.notify(.error)
            return
        }
        coordError = nil
        Haptics.impact(.light)
        controller.setLocation(latitude: lat, longitude: lon, name: nil)
        #if os(iOS)
        dismiss()
        #endif
    }
}

// MARK: - Small components

struct LabeledRow: View {
    let label: LocalizedStringKey
    /// Passed as a built `Text` rather than a `String` so each call site states
    /// whether its value is localizable copy or a technical readout. Most values
    /// here are data — coordinates, IANA identifiers, IP addresses, UTC offsets —
    /// and must use `Text(verbatim:)`; a couple are display text
    /// (`accuracyDetailValue`, `precisionDetailValue`) and must be localized. A
    /// single `String` parameter cannot express that difference, which is how the
    /// distinction gets lost silently.
    let value: Text
    var body: some View {
        HStack {
            Text(label)
            Spacer()
            value
                .foregroundStyle(.secondary)
                .monospacedDigit()
                .textSelection(.enabled)
        }
    }
}

struct RenameFavoriteSheet: View {
    let favorite: SpoofFavorite
    let onSave: (String) -> Void
    @Environment(\.dismiss) private var dismiss
    @State private var text: String = ""

    var body: some View {
        AdaptiveNavigationStack {
            Form {
                Section("Label") {
                    TextField("Name this favorite", text: $text)
                }
            }
            .navigationTitle("Rename Favorite")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") { onSave(text) }
                }
            }
        }
        .onAppear { text = favorite.label ?? favorite.chipTitle }
        #if os(macOS)
        .frame(minWidth: 360, minHeight: 200)
        #endif
    }
}

// MARK: - Tip Jar (StoreKit 2)

/// StoreKit 2 store for the optional "tip jar". These are **consumable** IAPs:
/// there is nothing to unlock, restore, or persist — a tip is purely a thank-you,
/// so we just finish the transaction. No third-party SDK (e.g. RevenueCat) is
/// used: consumables need no entitlement syncing, and a privacy-first app should
/// avoid bundling an analytics SDK for this.
///
/// Prices and display names are configured in App Store Connect (and the local
/// `GeoSpoof.storekit` test file) — the code only references the product IDs and
/// renders `displayName` / `displayPrice` dynamically, so prices can change
/// without a code update.
@MainActor
final class TipStore: ObservableObject {
    /// Consumable tip product IDs. Must match App Store Connect + `GeoSpoof.storekit`.
    static let productIDs = [
        "com.moonloaf.geospoof.tip.small",
        "com.moonloaf.geospoof.tip.medium",
        "com.moonloaf.geospoof.tip.large",
    ]

    @Published private(set) var products: [Product] = []
    @Published private(set) var isLoading = false
    /// The product currently being purchased (drives a per-row spinner).
    @Published private(set) var purchasing: Product.ID?
    /// Set true after any successful tip, to show a thank-you state.
    @Published var didTip = false
    /// `LocalizedStringKey?`: all three messages are our own copy, not StoreKit's.
    @Published var errorMessage: LocalizedStringKey?

    /// Fetch the products, sorted cheapest-first so tiers render low → high.
    func loadProducts() async {
        guard products.isEmpty else { return }
        isLoading = true
        defer { isLoading = false }
        do {
            let fetched = try await Product.products(for: Self.productIDs)
            products = fetched.sorted { $0.price < $1.price }
            errorMessage = nil
        } catch {
            errorMessage = "Couldn’t load tip options. Check your connection and try again."
        }
    }

    func purchase(_ product: Product) async {
        purchasing = product.id
        defer { purchasing = nil }
        do {
            let result = try await product.purchase()
            switch result {
            case .success(let verification):
                if case .verified(let transaction) = verification {
                    // Consumable: nothing to unlock — just finish it.
                    await transaction.finish()
                    didTip = true
                    errorMessage = nil
                } else {
                    errorMessage = "That purchase couldn’t be verified."
                }
            case .userCancelled:
                break
            case .pending:
                // e.g. Ask to Buy — resolves later via `observeTransactions()`.
                break
            @unknown default:
                break
            }
        } catch {
            errorMessage = "Something went wrong — you weren’t charged."
        }
    }

    /// Finish any transactions that arrive outside the direct purchase flow
    /// (Ask to Buy approvals, interrupted purchases). Runs for the lifetime of
    /// the view's `.task`.
    func observeTransactions() async {
        for await update in Transaction.updates {
            if case .verified(let transaction) = update {
                await transaction.finish()
                didTip = true
            }
        }
    }
}

/// The "Support GeoSpoof" tip-jar section, shown on the Settings screen of both
/// the iOS and macOS apps. Renders one row per tier, reading the localized name
/// and price straight from StoreKit.
struct TipJarView: View {
    @StateObject private var store = TipStore()

    var body: some View {
        Section {
            if store.didTip {
                HStack(spacing: 12) {
                    Image(systemName: "heart.fill").foregroundStyle(.pink)
                    Text("Thank you so much for supporting GeoSpoof!")
                }
            } else if store.isLoading {
                HStack(spacing: 8) {
                    ProgressView().controlSize(.small)
                    Text("Loading…").foregroundStyle(.secondary)
                }
            } else if store.products.isEmpty {
                Text("Tip options are unavailable right now.")
                    .foregroundStyle(.secondary)
            } else {
                ForEach(store.products) { product in
                    Button {
                        Task { await store.purchase(product) }
                    } label: {
                        HStack {
                            Label(product.displayName, systemImage: "cup.and.saucer.fill")
                            Spacer()
                            if store.purchasing == product.id {
                                ProgressView().controlSize(.small)
                            } else {
                                Text(product.displayPrice).foregroundStyle(.secondary)
                            }
                        }
                        .contentShape(Rectangle())
                    }
                    .buttonStyle(.plain)
                    .disabled(store.purchasing != nil)
                }
            }
        } header: {
            Text("Support GeoSpoof")
        } footer: {
            VStack(alignment: .leading, spacing: 6) {
                Text("GeoSpoof is an indie, open source project. Tips are completely optional and go straight to development. Thank you!")
                if let err = store.errorMessage {
                    Text(err).foregroundStyle(.red)
                }
            }
        }
        .task {
            await store.loadProducts()
            await store.observeTransactions()
        }
    }
}

// MARK: - Review Prompt

/// Gating and trigger for the App Store review prompt.
///
/// Two rules shape this type:
///
/// 1. **Only the system prompt, never a custom one.** App Review guideline
///    5.6.1 requires the provided API and disallows custom review prompts —
///    which includes an "enjoying the app?" pre-question that routes only the
///    happy answers to the rating flow. We ask at moments that are *already*
///    positive and stay quiet otherwise; we never make the user self-select.
///    Unhappy users get a support path instead, offered unconditionally.
/// 2. **Counting an occasion and asking for a review are separate operations.**
///    `recordSignificantEvent()` mutates the persisted counters; `mayAskNow()`
///    only reads them. The previous version fused the two, so a call that ended
///    up *not* asking still consumed the state that would have allowed a later
///    ask.
///
/// Presentation lives in the view layer (`View.requestReview(on:)`), driven by
/// `token`. The token is published from this shared object rather than held as
/// local view state so the presenting modifier can sit at the root of the view
/// tree, outside any `NavigationStack` — see `requestReview(on:)` for why that
/// placement is load-bearing.
@MainActor
final class ReviewPrompt: ObservableObject {
    static let shared = ReviewPrompt()

    /// Incremented when a qualifying moment clears every gate. The hosting view
    /// observes this and presents the system prompt.
    @Published private(set) var token = 0

    /// Highest token already handed to StoreKit.
    ///
    /// More than one presenter can be attached at once — debug builds add a
    /// second one in Settings — and two `requestReview` calls in the same
    /// runloop tick can race badly enough that nothing ends up on screen. So the
    /// first presenter to claim a token wins and the others no-op.
    private var presentedToken = 0

    /// Claims `token` for presentation. Returns `true` at most once per value.
    func claimForPresentation(token: Int) -> Bool {
        guard token > 0, token > presentedToken else { return false }
        presentedToken = token
        return true
    }

    private enum Key {
        /// Cumulative qualifying occasions. Kept under the original key so
        /// progress already earned by existing installs carries over.
        static let eventCount = "reviewSignificantEventCount"
        /// App version we last *attempted* a prompt on.
        static let lastPromptedVersion = "reviewLastPromptedVersion"
        /// When the most recent occasion was counted (the debounce anchor).
        static let lastEventAt = "reviewLastSignificantEventAt"
        /// When we last asked the system to present the prompt.
        static let lastRequestedAt = "reviewLastRequestedAt"
        /// Attempts already made on `lastPromptedVersion`.
        static let attemptsForVersion = "reviewAttemptsForVersion"
        /// When the user last hit something visibly broken.
        static let lastTroubleAt = "reviewLastTroubleAt"
    }

    /// Distinct usage occasions before the first ask. Two, so we don't ask on the
    /// very first success but still catch the user while goodwill is high.
    private static let threshold = 2

    /// Minimum gap between counted occasions. This replaces a per-process flag,
    /// which capped a long-lived process at exactly one countable occasion for
    /// its entire lifetime — and both platforms keep the app alive for a long
    /// time (macOS runs while not frontmost, iOS stays resident for days), so in
    /// practice most users never reached `threshold` at all.
    private static let occasionGap: TimeInterval = 4 * 60 * 60

    /// We cannot observe whether the system actually showed the prompt. It is
    /// silently suppressed by the 3-per-365-days cap, by the user turning off
    /// In-App Ratings & Reviews, in TestFlight builds, and when there is no
    /// active scene — so a single attempt per version can vanish without a
    /// trace, and the old once-per-version rule then meant no ask until the next
    /// release. One spaced-out retry recovers that case while staying well
    /// inside Apple's own ceiling.
    private static let maxAttemptsPerVersion = 2
    private static let retryDelay: TimeInterval = 120 * 24 * 60 * 60

    /// How long a visible failure keeps us quiet. Recorded as a timestamp rather
    /// than checked as live state because failures are often transient — a VPN
    /// resync error or a failed purchase can be cleared by the time the user
    /// reaches a qualifying moment, and asking someone for a review an hour
    /// after the app broke on them is how you earn the one-star.
    ///
    /// This is suppression on signals we observe ourselves. It is *not* a
    /// sentiment gate: we never ask the user to declare whether they're happy
    /// and then route them accordingly. See `.kiro/steering/review-prompts.md`.
    private static let troubleCooldown: TimeInterval = 72 * 60 * 60

    private let defaults: UserDefaults
    private let now: () -> Date

    init(defaults: UserDefaults = .standard, now: @escaping () -> Date = Date.init) {
        self.defaults = defaults
        self.now = now
    }

    /// Call when the user is in a clearly positive state.
    ///
    /// Records the occasion (at most one per `occasionGap`) and presents the
    /// system prompt if every gate passes. Deliberately cheap and idempotent to
    /// call, so callers can wire it to every genuine success signal instead of
    /// hunting for the one perfect trigger.
    func recordSignificantEvent() {
        let instant = now()
        guard countOccasion(at: instant) else { return }

        let occasions = defaults.integer(forKey: Key.eventCount)
        guard mayAskNow(at: instant) else {
            Log.app.debug("ReviewPrompt: occasion \(occasions) counted, not asking yet")
            return
        }

        markRequested(at: instant)
        token += 1
        Log.app.info(
            "ReviewPrompt: requesting system prompt (occasions=\(occasions) version=\(Self.currentVersion))"
        )
    }

    /// Record that the user hit something visibly broken, which keeps us quiet
    /// for `troubleCooldown`. Cheap to call from any error path.
    func noteTrouble() {
        let instant = now()
        // Don't let a repeating failure walk the timestamp backwards.
        if let last = storedDate(Key.lastTroubleAt), last > instant { return }
        defaults.set(instant, forKey: Key.lastTroubleAt)
        Log.app.debug("ReviewPrompt: trouble noted, suppressing asks for \(Int(Self.troubleCooldown / 3600))h")
    }

    /// Whether a system prompt is warranted right now. Pure read — no mutation.
    func mayAskNow(at instant: Date? = nil) -> Bool {
        let instant = instant ?? now()
        guard defaults.integer(forKey: Key.eventCount) >= Self.threshold else { return false }

        if let trouble = storedDate(Key.lastTroubleAt) {
            let since = instant.timeIntervalSince(trouble)
            if since >= 0 && since < Self.troubleCooldown { return false }
        }

        // A version we've never attempted on gets a fresh budget.
        guard defaults.string(forKey: Key.lastPromptedVersion) == Self.currentVersion else {
            return true
        }
        guard defaults.integer(forKey: Key.attemptsForVersion) < Self.maxAttemptsPerVersion else {
            return false
        }

        // No recorded attempt time means the attempt predates this bookkeeping:
        // an install whose single ask the previous implementation burned before
        // anything was presented. Let those users straight through.
        guard let last = storedDate(Key.lastRequestedAt) else { return true }

        let elapsed = instant.timeIntervalSince(last)
        // A negative interval means the clock moved backwards — plausible here,
        // given the app exists to shift location and users change time zones to
        // match. Treat it as stale rather than wedging the gate shut forever.
        return elapsed < 0 || elapsed >= Self.retryDelay
    }

    /// Records one qualifying occasion, debounced to `occasionGap`. Returns
    /// whether this call actually counted.
    private func countOccasion(at instant: Date) -> Bool {
        if let last = storedDate(Key.lastEventAt) {
            let elapsed = instant.timeIntervalSince(last)
            if elapsed >= 0 && elapsed < Self.occasionGap {
                // Logged so a debounced call is never silent. Silence here reads
                // as "the trigger is broken" when it's actually working.
                Log.app.debug(
                    "ReviewPrompt: occasion debounced — \(Int(elapsed / 60))m since the last one,"
                        + " needs \(Int(Self.occasionGap / 60))m"
                )
                return false
            }
        }
        defaults.set(instant, forKey: Key.lastEventAt)
        defaults.set(defaults.integer(forKey: Key.eventCount) + 1, forKey: Key.eventCount)
        return true
    }

    private func markRequested(at instant: Date) {
        let version = Self.currentVersion
        if defaults.string(forKey: Key.lastPromptedVersion) == version {
            defaults.set(
                defaults.integer(forKey: Key.attemptsForVersion) + 1,
                forKey: Key.attemptsForVersion
            )
        } else {
            defaults.set(version, forKey: Key.lastPromptedVersion)
            defaults.set(1, forKey: Key.attemptsForVersion)
        }
        defaults.set(instant, forKey: Key.lastRequestedAt)
    }

    private func storedDate(_ key: String) -> Date? {
        defaults.object(forKey: key) as? Date
    }

    private static var currentVersion: String {
        Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
    }

    #if DEBUG
    /// Clears all gating state so the flow can be exercised from scratch. The
    /// system prompt is still rate-limited by the OS, so a reset doesn't
    /// guarantee a *visible* prompt — see `forcePrompt()` for that.
    func resetForTesting() {
        for key in [
            Key.eventCount, Key.lastPromptedVersion, Key.lastEventAt,
            Key.lastRequestedAt, Key.attemptsForVersion, Key.lastTroubleAt,
        ] {
            defaults.removeObject(forKey: key)
        }
        // Nothing here is `@Published`, so nudge observers to re-read
        // `debugSummary`.
        objectWillChange.send()
        Log.app.info("ReviewPrompt: gating state reset")
    }

    /// Which StoreKit API the debug menu wants the presenter to use.
    ///
    /// Exists because reports conflict about which one actually renders on
    /// current OS versions: the scene-based call and the SwiftUI environment
    /// action have each been reported working while the other silently does
    /// nothing. Production picks one; this lets the other be tried on a real
    /// device so the choice is made on evidence.
    enum DebugPresentationPath {
        /// What production does: scene-based StoreKit on iOS, env action on macOS.
        case automatic
        /// Force the SwiftUI `requestReview` environment action on both platforms.
        case environmentAction
    }

    private(set) var debugPath: DebugPresentationPath = .automatic

    /// Bumps the token with no gating at all, so the debug menu can show the
    /// real system prompt on demand.
    ///
    /// Goes through the same token → `requestReview(on:)` path production uses,
    /// rather than calling StoreKit directly, so this exercises the actual
    /// presentation plumbing instead of a parallel copy of it.
    func forcePrompt(using path: DebugPresentationPath = .automatic) {
        debugPath = path
        token += 1
        Log.app.info("ReviewPrompt: forced prompt from debug menu (path=\(path))")
    }

    /// Records a qualifying occasion the same way the real triggers do, so the
    /// gate itself can be exercised rather than bypassed.
    ///
    /// Clears the debounce anchor first so each press counts as a distinct
    /// occasion. Without that, the second press is swallowed by `occasionGap`
    /// and the threshold can't be reached in a sitting — which makes the button
    /// look broken and the gate untestable.
    func recordEventForTesting() {
        defaults.removeObject(forKey: Key.lastEventAt)
        recordSignificantEvent()
        objectWillChange.send()
    }

    /// One-line gate state for the debug settings footer.
    var debugSummary: String {
        let occasions = defaults.integer(forKey: Key.eventCount)
        let attempts = defaults.integer(forKey: Key.attemptsForVersion)
        let version = defaults.string(forKey: Key.lastPromptedVersion) ?? "none"
        var parts = [
            "occasions \(occasions)/\(Self.threshold)",
            "attempts \(attempts)/\(Self.maxAttemptsPerVersion) on \(version)",
        ]
        if let trouble = storedDate(Key.lastTroubleAt) {
            let hours = Int(now().timeIntervalSince(trouble) / 3600)
            let cooling = now().timeIntervalSince(trouble) < Self.troubleCooldown
            parts.append("trouble \(hours)h ago\(cooling ? " (suppressing)" : "")")
        }
        parts.append(mayAskNow() ? "may ask: YES" : "may ask: no")
        return parts.joined(separator: " · ")
    }
    #endif
}

extension View {
    /// Presents the system review prompt when `token` changes to a new non-zero
    /// value.
    ///
    /// Attach this at the root of the hosting view, **outside** any
    /// `NavigationStack`. The SwiftUI `requestReview` action is reported to
    /// silently do nothing when invoked from a view nested inside a navigation
    /// container, which is exactly what made the macOS path a no-op while this
    /// modifier lived on the `Form` inside `AdaptiveNavigationStack`. iOS can
    /// sidestep the quirk with the scene-based StoreKit call; macOS has no
    /// scene-based equivalent, so correct placement is the only fix there.
    func requestReview(on token: Int) -> some View {
        modifier(ReviewPresentationModifier(token: token))
    }
}

/// Fires the review request when `token` changes. Both APIs used here are
/// available at the app's deployment targets (iOS 16 / macOS 13), so this needs
/// no availability branching.
private struct ReviewPresentationModifier: ViewModifier {
    @Environment(\.requestReview) private var requestReview
    let token: Int

    func body(content: Content) -> some View {
        content.onChange(of: token) { newValue in
            // Deduped across presenters — see `claimForPresentation(token:)`.
            guard ReviewPrompt.shared.claimForPresentation(token: newValue) else {
                Log.app.debug("ReviewPrompt: token=\(newValue) already claimed, skipping duplicate present")
                return
            }
            // Logged because there is no API to observe whether the system
            // actually presented anything. Without a line here, a prompt that
            // doesn't appear is indistinguishable from a trigger that never
            // ran, which is the single hardest thing about this feature.
            #if DEBUG
            if ReviewPrompt.shared.debugPath == .environmentAction {
                Log.app.info(
                    "ReviewPrompt: presenting via requestReview environment action (debug override)"
                        + " token=\(newValue)"
                )
                requestReview()
                return
            }
            #endif
            #if os(iOS)
            // `AppStore.requestReview(in:)` is the modern, non-deprecated
            // replacement for `SKStoreReviewController` and presents reliably
            // given a scene. The environment action is the fallback for the
            // case where no scene can be found at all.
            let active =
                UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
            let scene = active ?? UIApplication.shared.connectedScenes.first as? UIWindowScene
            if let scene {
                Log.app.info(
                    "ReviewPrompt: presenting via AppStore.requestReview(in:)"
                        + " token=\(newValue) scene=\(scene.session.persistentIdentifier)"
                        + " state=\(scene.activationState.rawValue)"
                        + " foregroundActive=\(active != nil)"
                )
                AppStore.requestReview(in: scene)
            } else {
                Log.app.warn(
                    "ReviewPrompt: no UIWindowScene found (connectedScenes="
                        + "\(UIApplication.shared.connectedScenes.count)),"
                        + " falling back to the environment action"
                )
                requestReview()
            }
            #else
            Log.app.info("ReviewPrompt: presenting via requestReview environment action token=\(newValue)")
            requestReview()
            #endif
        }
    }
}

// MARK: - Site Filters (scope)

/// iOS "Browser" tab: an index of the settings that govern what websites see.
///
/// Every row here is a one-of-N choice or a list, so every row pushes a detail
/// screen and shows its current value inline — the shape iOS Settings uses
/// (Settings › Safari), and the reason it stays scannable as it grows. The lone
/// boolean, Preserve Location Prompts, stays inline as a toggle, because pushing
/// a screen to flip one switch is a wasted tap.
///
/// This replaced an earlier layout that put the location settings, the language
/// setting, and the whole site-filter UI inline on one tab. Site filters are an
/// unbounded list, so they pushed everything else further off-screen as the list
/// grew; the previous code compensated by ordering the fixed settings above them,
/// which treated the symptom. Pushing the list fixes the cause, and the trailing
/// value labels mean you still read the entire configuration without a single tap.
///
/// macOS deliberately does NOT use this: it keeps Filters as a sidebar pane and
/// the location settings in Settings › Advanced, which suits a resizable window
/// with room to show everything at once.
struct BrowserSettingsView: View {
    @ObservedObject var controller: SpoofController

    var body: some View {
        AdaptiveNavigationStack {
            Form {
                Section {
                    NavigationLink {
                        AccuracyPickerView(controller: controller)
                    } label: {
                        settingRow(
                            "Location Accuracy",
                            systemImage: "scope",
                            value: accuracyValueLabel(for: controller.accuracySetting)
                        )
                    }
                    NavigationLink {
                        PrecisionPickerView(controller: controller)
                    } label: {
                        settingRow(
                            "Location Precision",
                            systemImage: "mappin.and.ellipse",
                            value: precisionValueLabel(for: controller.locationPrecision)
                        )
                    }
                    // A boolean belongs inline. Its explanation moves to this
                    // section's footer rather than sitting in a Text row, which
                    // would pick up row separators and insets and read as content.
                    PreservePromptRows(controller: controller, showsFootnote: false)
                } header: {
                    Text("Location")
                } footer: {
                    Text(PreservePromptRows.footnote(locked: !ProStore.shared.isPro))
                }

                // Locale is its own concern, not a location setting — it drives
                // language, formatting, and the Accept-Language header — so it
                // gets its own section rather than being filed under Location.
                Section {
                    NavigationLink {
                        ReportedLanguageView(controller: controller)
                    } label: {
                        settingRow(
                            "Reported Language",
                            systemImage: "globe",
                            value: controller.localeSpoofing.rowLabel
                        )
                    }
                } header: {
                    Text("Language")
                }

                Section {
                    NavigationLink {
                        SiteFiltersView(
                            controller: controller,
                            title: "Site Filters",
                            wrapsInNavigationStack: false
                        )
                    } label: {
                        settingRow(
                            "Site Filters",
                            systemImage: "line.3.horizontal.decrease.circle",
                            value: scopeValueLabel
                        )
                    }
                } header: {
                    Text("Sites")
                } footer: {
                    // Surface the "spoofing nowhere" state on the index too. It's
                    // the one filter condition where the app is silently doing
                    // nothing, so it must not be hidden behind the push.
                    if controller.enabled
                        && controller.scopeMode == .allowlist
                        && controller.allowlist.isEmpty {
                        Label(
                            "Allowlist is empty, so spoofing is inactive on every site.",
                            systemImage: "exclamationmark.triangle.fill"
                        )
                        .foregroundStyle(.orange)
                    } else {
                        Text(controller.scopeMode.detail)
                    }
                }
            }
            .groupedFormStyle()
            .tint(.brand)
            .navigationTitle("Browser")
        }
    }

    /// Shared row shape: icon + title on the left, current value on the right.
    /// Consistency here is what makes the tab readable as an index — a row whose
    /// value is missing or styled differently reads as a different kind of control.
    /// `title` and `value` are `LocalizedStringKey`, not `String`, so both reach
    /// SwiftUI's localizing initializers. Typed as `String` they would bind to the
    /// `StringProtocol` overloads of `Label`/`Text`, which render verbatim — the
    /// row would compile, look correct in English, and never translate.
    /// `systemImage` stays a `String`: it is an SF Symbol name, not display text.
    private func settingRow(_ title: LocalizedStringKey, systemImage: String, value: LocalizedStringKey) -> some View {
        HStack {
            Label(title, systemImage: systemImage)
            Spacer(minLength: 12)
            Text(value)
                .foregroundColor(.secondary)
                .lineLimit(1)
        }
    }

    /// Scope state for the index row: the mode, plus the list count when a list
    /// is what's actually in force. The count is the part people want — it's the
    /// difference between "filtering" and "filtering nothing".
    private var scopeValueLabel: LocalizedStringKey {
        switch controller.scopeMode {
        case .all:
            return "All Sites"
        // Locale-grouped like `accuracyValueLabel`. Only observable with a
        // four-digit filter list, which is unlikely but costs nothing to get
        // right. Same approved exception (Requirement 2.6).
        case .allowlist:
            return "Allowlist · \(controller.allowlist.count)"
        case .denylist:
            return "Denylist · \(controller.denylist.count)"
        }
    }
}

/// Native counterpart to the extension popup's Filters tab: a scope-mode picker
/// plus the active allow/deny list. Backed by the shared `SpoofController`,
/// which syncs scope to the extension through the App Group bridge (mode +
/// lists), exactly like location, toggles, and favorites.
///
/// Layout follows Apple's editable-list convention (Mail VIPs, Screen Time
/// allowed sites): rows live in a grouped section with an in-card "Add …" row
/// that presents a focused entry sheet, rather than a persistent inline field.
///
/// Note: there's no "Add current site" here — the app isn't sitting on a web
/// page, so manual entry is the only add path (parity with the popup minus that
/// page-context convenience).
struct SiteFiltersView: View {
    @ObservedObject var controller: SpoofController
    /// Navigation title. macOS shows this as its "Filters" pane; iOS pushes it
    /// from the Browser tab as "Site Filters".
    var title: LocalizedStringKey = "Filters"
    /// macOS presents this as a standalone sidebar pane and needs its own
    /// navigation container. On iOS it's pushed onto the Browser tab's existing
    /// stack, where a nested stack would swallow the back button.
    var wrapsInNavigationStack: Bool = true
    @ObservedObject private var pro = ProStore.shared
    @State private var showingAdd = false
    @State private var showPaywall = false
    /// Mirror of `controller.scopeMode` that backs the segmented Picker. A
    /// `@State` selection can be forcibly reverted (a get/set Binding can't be
    /// reliably snapped back on macOS when we reject a locked selection), and
    /// driving the gate from `.onChange` keeps us from mutating published state
    /// during a view update.
    @State private var pickerMode: ScopeMode = .all

    /// Per-site filtering is a Pro feature on the Apple apps (iOS + macOS);
    /// founders/subscribers are exempt via `pro.isPro`. The Chrome/Firefox
    /// extensions don't run this code and keep it free.
    private var filtersLocked: Bool {
        return !pro.isPro
    }

    var body: some View {
        if wrapsInNavigationStack {
            AdaptiveNavigationStack { formContent }
        } else {
            formContent
        }
    }

    private var formContent: some View {
        Form {
            Section {
                Picker("Mode", selection: $pickerMode) {
                    ForEach(ScopeMode.allCases) { mode in
                        Text(mode.label).tag(mode)
                    }
                }
                .pickerStyle(.segmented)
                .onChange(of: pickerMode) { newMode in
                    if filtersLocked && newMode != .all {
                        // Locked: pitch Pro and reject the change by snapping
                        // the control back to the real (still-.all) mode.
                        showPaywall = true
                        if pickerMode != controller.scopeMode {
                            pickerMode = controller.scopeMode
                        }
                    } else if newMode != controller.scopeMode {
                        controller.setScopeMode(newMode)
                    }
                }
                // Keep the mirror in sync with the source of truth (e.g. an
                // update synced in from the extension).
                .onChange(of: controller.scopeMode) { pickerMode = $0 }
                .onAppear { pickerMode = controller.scopeMode }
            } header: {
                Text("Mode")
            } footer: {
                if filtersLocked {
                    Text("Allowlist and Denylist are a GeoSpoof Pro feature. Upgrade to limit spoofing to specific sites.")
                } else if controller.scopeMode == .all {
                    // Concatenated `Text` rather than string interpolation: both
                    // halves are localizable keys in their own right, and
                    // `LocalizedStringKey` cannot be interpolated into another
                    // key. Sentence-level joining is safe — each part is a whole
                    // sentence, so no translation needs to reorder across them.
                    // Renders identically to the previous interpolated form.
                    Text(controller.scopeMode.detail)
                        + Text(" Choose Allowlist or Denylist to limit spoofing to specific sites.")
                } else {
                    Text(controller.scopeMode.detail)
                }
            }

            if controller.scopeMode != .all {
                sitesSection
            }
        }
        .groupedFormStyle()
        .tint(.brand)
        .navigationTitle(title)
        .sheet(isPresented: $showingAdd) {
            AddSiteSheet(
                mode: controller.scopeMode,
                onAdd: { controller.addScopeSite($0, to: controller.scopeMode) },
                onRemove: { controller.removeScopeSite($0, from: controller.scopeMode) }
            )
        }
        .sheet(isPresented: $showPaywall) {
            ProPaywallView()
        }
    }

    private var sitesSection: some View {
        Section {
            ForEach(controller.activeScopeList, id: \.self) { domain in
                HStack(spacing: 10) {
                    ScopeMonogram(domain: domain)
                    // verbatim: a user-entered site pattern.
                    Text(verbatim: domain)
                        .lineLimit(1)
                        .truncationMode(.middle)
                    Spacer()
                }
                .swipeActions(edge: .trailing) {
                    Button(role: .destructive) {
                        controller.removeScopeSite(domain, from: controller.scopeMode)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                    .tint(.red)
                }
                .contextMenu {
                    Button(role: .destructive) {
                        controller.removeScopeSite(domain, from: controller.scopeMode)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }

            // The in-card add affordance keeps the grouped section intact (no
            // floating empty-state breaking the card) and doubles as the empty
            // state — when the list is empty this accent row is all that shows,
            // inviting the first add, exactly like Apple's "Add VIP…" lists.
            Button {
                if filtersLocked { showPaywall = true } else { showingAdd = true }
            } label: {
                Label(addRowTitle, systemImage: "plus.circle.fill")
            }
        } header: {
            HStack {
                Text(controller.scopeMode.listTitle)
                Spacer()
                // Locale-formatted digits via the verbatim path, so this count
                // badge doesn't derive a catalog key of just `%lld`.
                Text(controller.activeScopeList.count.formatted())
                    .monospacedDigit()
                    .foregroundStyle(.secondary)
            }
        } footer: {
            // The "spoofing nowhere" warning lives in the section footer — the
            // HIG-standard home for a contextual caution — so it reads as part
            // of the list rather than crammed under the mode picker.
            if showsEmptyAllowlistWarning {
                Label("Allowlist is empty, so spoofing is currently inactive on every site. Add a site to start spoofing there.",
                      systemImage: "exclamationmark.triangle.fill")
                    .foregroundStyle(.orange)
            }
        }
    }

    private var addRowTitle: LocalizedStringKey {
        controller.scopeMode == .denylist ? "Add Blocked Site" : "Add Allowed Site"
    }

    /// True when allowlist mode is active with an empty list while protection is
    /// on — the silent "spoofing nowhere" state the user should be warned about.
    /// (An empty denylist is harmless: spoofing simply applies everywhere.)
    private var showsEmptyAllowlistWarning: Bool {
        controller.enabled && controller.scopeMode == .allowlist && controller.allowlist.isEmpty
    }
}

/// Focused entry sheet for adding sites, built for rapid multi-add: each commit
/// (return key or the inline Add button) appends to the list, clears the field,
/// and keeps focus so several sites can be entered in one sitting. Committed
/// sites appear in a live "Added" list with swipe-to-undo. Adds are written to
/// the model immediately, so there's nothing to cancel — a single "Done" closes.
private struct AddSiteSheet: View {
    let mode: ScopeMode
    /// Returns the add outcome so the sheet can surface an accurate hint and
    /// only record the entry on success.
    let onAdd: (String) -> ScopeAddResult
    /// Removes a site (used by swipe-to-undo on the session list).
    let onRemove: (String) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var text = ""
    /// `LocalizedStringKey?`: both hints are our own validation copy.
    @State private var hint: LocalizedStringKey?
    /// Sites added during this sheet session, newest first — live confirmation
    /// of what's been entered without duplicating the full list behind it.
    @State private var added: [String] = []
    @FocusState private var focused: Bool

    private var navTitle: LocalizedStringKey {
        mode == .denylist ? "Add Blocked Sites" : "Add Allowed Sites"
    }

    private var helpText: LocalizedStringKey {
        mode == .denylist
            ? "Spoofing is skipped on the sites you add here."
            : "Spoofing applies only to the sites you add here."
    }

    private var canAdd: Bool {
        !text.trimmingCharacters(in: .whitespaces).isEmpty
    }

    var body: some View {
        AdaptiveNavigationStack {
            Form {
                Section {
                    HStack(spacing: 8) {
                        TextField("example.com, *.ru, site.com/app/*", text: $text)
                            .focused($focused)
                            .autocorrectionDisabled(true)
                            #if os(iOS)
                            .textInputAutocapitalization(.never)
                            .keyboardType(.URL)
                            #endif
                            .submitLabel(.continue)
                            .onSubmit(add)
                            .onChange(of: text) { _ in if hint != nil { hint = nil } }
                        if canAdd {
                            Button("Add", action: add)
                                .buttonStyle(.borderless)
                                .transition(.opacity)
                        }
                    }
                } footer: {
                    if let hint {
                        Text(hint).foregroundStyle(.red)
                    } else {
                        Text(helpText)
                    }
                }

                // Collapsible syntax reference — the native counterpart to the
                // popup's "What patterns can I use?" disclosure. Copy is kept in
                // sync with the popup's filters_syntax* strings; the code
                // examples are literal (not localized), the descriptions match.
                Section {
                    DisclosureGroup {
                        patternSyntaxRow("example.com", "The site and all its subdomains")
                        patternSyntaxRow("*.example.com", "Subdomains only, not example.com itself")
                        patternSyntaxRow("*.ru", "Any site ending in .ru")
                        patternSyntaxRow("localhost:3000", "A host on a specific port")
                        patternSyntaxRow("site.com/app/*", "A path and everything under it")
                    } label: {
                        Label("What patterns can I use?", systemImage: "questionmark.circle")
                    }
                } footer: {
                    VStack(alignment: .leading, spacing: 6) {
                        Text("Only * is a wildcard — no regular expressions.")
                        if let reference = URL(
                            string:
                                "https://github.com/anthonysgro/geospoof/blob/main/docs/SITE_FILTERS.md")
                        {
                            Link("See full reference →", destination: reference)
                        }
                    }
                }

                if !added.isEmpty {
                    Section {
                        ForEach(added, id: \.self) { domain in
                            HStack(spacing: 10) {
                                ScopeMonogram(domain: domain)
                                // verbatim: a user-entered site pattern.
                                Text(verbatim: domain)
                                    .lineLimit(1)
                                    .truncationMode(.middle)
                                Spacer()
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundStyle(.green)
                                    .accessibilityHidden(true)
                            }
                            .swipeActions(edge: .trailing) {
                                Button(role: .destructive) {
                                    remove(domain)
                                } label: {
                                    Label("Remove", systemImage: "trash")
                                }
                                .tint(.red)
                            }
                        }
                    } header: {
                        Text(added.count == 1 ? "Added" : "Added · \(added.count)")
                    }
                }
            }
            .groupedFormStyle()
            .tint(.brand)
            .navigationTitle(navTitle)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
            .onAppear { focused = true }
        }
        #if os(macOS)
        .frame(minWidth: 380, minHeight: 320)
        #endif
    }

    /// One row of the pattern-syntax reference: a monospaced example above its
    /// plain-language description, mirroring the popup's `scope-syntax-row`.
    @ViewBuilder
    private func patternSyntaxRow(_ code: String, _ desc: LocalizedStringKey) -> some View {
        VStack(alignment: .leading, spacing: 2) {
            // verbatim: `code` is a literal pattern example (`*.example.com`).
            // It is syntax, not prose, and must survive translation unchanged —
            // hence a plain `String` rendered verbatim, while `desc` localizes.
            Text(verbatim: code)
                .font(.system(.subheadline, design: .monospaced))
            Text(desc)
                .font(.caption)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 2)
        .accessibilityElement(children: .combine)
        // Concatenated `Text`, not interpolation. Interpolating a
        // `LocalizedStringKey` into another key hits a deprecated
        // `appendInterpolation` overload that substitutes the value's *debug
        // description* — VoiceOver would read
        // `LocalizedStringKey(key: "…", hasFormatting: false, arguments: [])`
        // aloud, and the derived catalog key collapses to a context-free
        // `"%@: %@"`. `code` is a pattern example and stays verbatim; `desc` is
        // looked up.
        .accessibilityLabel(Text(verbatim: "\(code): ") + Text(desc))
    }

    private func add() {
        switch onAdd(text) {
        case .added:
            let pattern = SpoofController.normalizePatternInput(text) ?? text
            withAnimation(.easeInOut(duration: 0.2)) {
                added.removeAll { $0 == pattern }
                added.insert(pattern, at: 0)
            }
            text = ""
            hint = nil
        case .duplicate:
            hint = "Already added"
        case .invalid:
            hint = "Not a valid pattern"
        }
        // Keep the keyboard up for the next entry (and up after a correction).
        focused = true
    }

    private func remove(_ domain: String) {
        onRemove(domain)
        withAnimation(.easeInOut(duration: 0.2)) {
            added.removeAll { $0 == domain }
        }
    }
}

/// Deterministic monogram tile mirroring the popup's list avatars: the domain's
/// first character on a stable hue derived from the domain string. Generated
/// locally — no favicon fetch, so the user's site list never leaves the device.
struct ScopeMonogram: View {
    let domain: String

    var body: some View {
        // verbatim: the first character of a user-entered domain.
        Text(verbatim: initial)
            .font(.system(size: 11, weight: .bold))
            .foregroundStyle(.white)
            .frame(width: 22, height: 22)
            .background(color, in: RoundedRectangle(cornerRadius: 6, style: .continuous))
            .accessibilityHidden(true)
    }

    private var initial: String {
        guard let first = domain.first else { return "?" }
        return String(first).uppercased()
    }

    /// Stable hue 0–359 from the domain string (matches the popup's hashing
    /// intent), rendered at a saturation/brightness that keeps white legible.
    private var color: Color {
        var hash = 0
        for scalar in domain.unicodeScalars {
            hash = (hash &* 31 &+ Int(scalar.value)) % 360
        }
        return Color(hue: Double(hash) / 360.0, saturation: 0.55, brightness: 0.55)
    }
}

// MARK: - Accuracy settings

/// UI-only preset model for the accuracy picker. Maps onto SpoofAccuracySetting.
/// The Tight/Loose range presets were retired — "Realistic" already picks a
/// device-appropriate band automatically, so the manual range options mostly
/// added noise. `.range` still exists in the model for backward compatibility
/// (a value saved before removal keeps resolving), but it has no preset here and
/// is shown as "Realistic".
private enum AccuracyPreset: String, CaseIterable, Identifiable {
    case realistic, custom
    var id: String { rawValue }
    var label: LocalizedStringKey {
        switch self {
        case .realistic: return "Realistic"
        case .custom: return "Custom"
        }
    }

    /// Plain-language consequence of the preset, for the pushed picker.
    var detail: LocalizedStringKey {
        switch self {
        case .realistic:
            return "Vary the figure the way a real device does."
        case .custom:
            return "Always report the same fixed figure."
        }
    }
}

/// What the accuracy setting actually controls, for the picker's footer.
///
/// Worth spelling out because Accuracy and Precision sit next to each other on
/// the Browser tab and sound like the same thing. They aren't: accuracy is a
/// number reported *alongside* the coordinates, while precision moves the
/// coordinates themselves. Someone who wants to be harder to pin down reaches for
/// the wrong one roughly half the time unless told.
/// One literal, not two concatenated ones. `+` on string literals produces a
/// `String` at compile time, which bound `Text` to the verbatim overload and made
/// this paragraph untranslatable; a `LocalizedStringKey` also cannot be built by
/// concatenation. The joined text is byte-identical to the previous two parts.
private let accuracyExplanation: LocalizedStringKey =
    "The accuracy figure sites receive with your coordinates — how certain the device claims to be. This never moves your location; Location Precision does that."

/// Accuracy control rows (a Picker + a conditional Custom meters field) intended
/// to be embedded inside a Form Section. Reads/writes `controller.accuracySetting`,
/// mirroring the web extension's preset mapping exactly:
///   Realistic → `.auto`, Custom → `.fixed(meters:)`.
struct AccuracySettingsRows: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var pro = ProStore.shared
    @State private var customText: String = ""
    @State private var customInvalid: Bool = false
    @State private var showPaywall = false
    @FocusState private var customFocused: Bool

    /// Custom accuracy is a Pro feature on the Apple apps (iOS + macOS);
    /// founders/subscribers are exempt via `pro.isPro`. Mirrors
    /// `AccuracyPickerView.accuracyLocked` — the extension also forces Realistic
    /// for non-Pro users, so this is the macOS UI half of the same gate.
    private var accuracyLocked: Bool {
        !pro.isPro
    }

    /// Seed used when switching to Custom from a non-fixed setting. Matches the
    /// extension's DEFAULT_ACCURACY_M.
    private static let defaultCustomMeters = 45
    /// Inclusive bounds the entered value must fall within (mirrors the
    /// extension's ACCURACY_MIN_M / ACCURACY_MAX_M). Out-of-range input is
    /// rejected outright — we never silently clamp the user's number.
    private static let minMeters = 1
    private static let maxMeters = 10000

    /// Derive the active preset from the committed setting. Any `.range(...)` —
    /// including a legacy Tight (5–15) or Loose (35–100) value saved before
    /// those presets were retired — collapses to Realistic, and is normalized to
    /// `.auto` the next time the user changes the setting.
    private static func preset(for setting: SpoofAccuracySetting) -> AccuracyPreset {
        switch setting {
        case .fixed: return .custom
        case .auto, .range: return .realistic
        }
    }

    private var currentPreset: AccuracyPreset {
        Self.preset(for: controller.accuracySetting)
    }

    private var presetSelection: Binding<AccuracyPreset> {
        Binding(
            get: { currentPreset },
            set: { applyPreset($0) }
        )
    }

    var body: some View {
        Picker(selection: presetSelection) {
            ForEach(AccuracyPreset.allCases) { preset in
                Text(preset.label).tag(preset)
            }
        } label: {
            Label("Location Accuracy", systemImage: "scope")
        }
        .pickerStyle(.menu)
        .onAppear { syncFromController() }
        .onChange(of: controller.accuracySetting) { _ in syncFromController() }
        .sheet(isPresented: $showPaywall) {
            ProPaywallView()
        }

        if accuracyLocked {
            Text("Custom accuracy is a GeoSpoof Pro feature. Upgrade to set a fixed accuracy; free spoofing uses a realistic, device-appropriate value.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }

        if currentPreset == .custom {
            customMetersRow
        }
    }

    private var customMetersRow: some View {
        HStack {
            Label("Accuracy (m)", systemImage: "ruler")
            Spacer(minLength: 12)
            metersField
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: 120)
                .focused($customFocused)
                .foregroundStyle(customInvalid ? Color.red : Color.primary)
                .onSubmit { commitCustom() }
                .onChange(of: customFocused) { focused in
                    // Commit when focus leaves the field.
                    if !focused { commitCustom() }
                }
        }
    }

    /// The meters text field, with a number pad on iOS and a plain field on
    /// macOS. The title is an accessibility-only label (hidden) and "45" is the
    /// placeholder via `prompt:` — on macOS a `TextField` title renders as a
    /// visible leading label, which otherwise showed "45" twice (once as that
    /// label, once as the entered value).
    private var metersField: some View {
        // `Text(verbatim:)` for the prompt: "45" is a sample numeric value, not
        // copy. As a bare literal it became the catalog key "45", a translatable
        // row holding a number.
        let field = TextField("Accuracy in meters", text: $customText, prompt: Text(verbatim: "45"))
            .labelsHidden()
        #if os(iOS)
        return field.keyboardType(.numberPad)
        #else
        return field
        #endif
    }

    /// Map the chosen preset onto a concrete setting and push it through the
    /// controller. For Custom we keep an existing fixed value or seed a sensible
    /// default, then sync the text field.
    private func applyPreset(_ preset: AccuracyPreset) {
        // Custom is Pro-gated (parity with AccuracyPickerView): a free user is
        // bounced to the paywall and the setting stays put. The extension also
        // forces Realistic for these users, so this is the UI half of the gate.
        if accuracyLocked && preset == .custom {
            showPaywall = true
            return
        }
        switch preset {
        case .realistic:
            controller.setAccuracySetting(.auto)
        case .custom:
            let seed: Int
            if case .fixed(let meters) = controller.accuracySetting {
                seed = meters
            } else {
                seed = Self.defaultCustomMeters
            }
            customText = String(seed)
            customInvalid = false
            controller.setAccuracySetting(.fixed(meters: seed))
        }
    }

    /// Validate and commit the custom meters field. Mirrors the web's
    /// reject-out-of-range behavior: a finite integer within [1, 10000] commits;
    /// anything else (empty / non-numeric / out of range) flags the field and is
    /// left uncommitted so the user can correct it.
    private func commitCustom() {
        // If the user has switched away from Custom (e.g. picked Realistic while
        // the field still had focus), don't re-commit the old meters — that
        // would bounce the setting straight back to Custom. Losing focus as the
        // Custom row disappears must be a no-op, not a write.
        guard currentPreset == .custom else {
            customInvalid = false
            return
        }
        let trimmed = customText.trimmingCharacters(in: .whitespaces)
        guard let value = Int(trimmed),
              value >= Self.minMeters,
              value <= Self.maxMeters else {
            customInvalid = true
            return
        }
        customInvalid = false
        controller.setAccuracySetting(.fixed(meters: value))
    }

    /// Pull the committed `.fixed` meters back into the text field when the
    /// setting changes externally (e.g. adopted from the extension). We don't
    /// fight the user mid-edit, so this only runs while the field isn't focused.
    private func syncFromController() {
        guard !customFocused else { return }
        customInvalid = false
        if case .fixed(let meters) = controller.accuracySetting {
            customText = String(meters)
        }
    }
}

// MARK: - Location precision settings

/// UI-only preset model for the precision picker. Maps onto
/// `SpoofLocationPrecision`: Exact → `.exact`; the approximate presets →
/// `.approximate(radiusMeters:)`. Distinct from accuracy — precision moves the
/// reported point within a radius; accuracy sets the reported uncertainty value.
fileprivate enum LocationPrecisionPreset: String, CaseIterable, Identifiable {
    case exact, street, neighborhood, city
    var id: String { rawValue }
    var label: LocalizedStringKey {
        switch self {
        case .exact: return "Exact"
        case .street: return "Street (~0.5 km)"
        case .neighborhood: return "Neighborhood (~2 km)"
        case .city: return "City (~10 km)"
        }
    }
    /// Radius in meters for the approximate presets; nil for Exact. Mirrors the
    /// extension's popup presets.
    var radiusMeters: Int? {
        switch self {
        case .exact: return nil
        case .street: return 500
        case .neighborhood: return 2000
        case .city: return 10000
        }
    }

    /// Plain-language consequence of the preset, for the pushed picker.
    ///
    /// Says the distance out loud on purpose. "Street" sounds like a precision
    /// level you'd want, and gives no hint that coordinates get moved — which is
    /// exactly how a user ends up reporting a bug about their location being off
    /// by a few hundred metres.
    var detail: LocalizedStringKey {
        switch self {
        case .exact: return "Report your chosen location precisely."
        case .street: return "Move the reported point up to 500 m away."
        case .neighborhood: return "Move the reported point up to 2 km away."
        case .city: return "Move the reported point up to 10 km away."
        }
    }
}

/// Derive the active preset from a committed precision setting. An approximate
/// radius snaps to the nearest preset, so a value bridged in from the browser
/// popup (which allows any radius) still selects a sensible option.
///
/// File-level so the inline rows and the pushed picker share one mapping — two
/// copies could disagree about which preset a bridged radius belongs to, and the
/// two surfaces would then show different things for the same setting.
fileprivate func precisionPreset(for setting: SpoofLocationPrecision) -> LocationPrecisionPreset {
    switch setting {
    case .exact:
        return .exact
    case .approximate(let radius):
        let presets: [LocationPrecisionPreset] = [.street, .neighborhood, .city]
        return presets.min(by: {
            abs(($0.radiusMeters ?? 0) - radius) < abs(($1.radiusMeters ?? 0) - radius)
        }) ?? .street
    }
}

/// Settings-row label for the location-precision setting, mirroring
/// `accuracyValueLabel(for:)`. Names the preset rather than the raw radius so the
/// index row reads the way the picker does.
func precisionValueLabel(for setting: SpoofLocationPrecision) -> LocalizedStringKey {
    switch setting {
    case .exact:
        return "Exact"
    case .approximate(let radius):
        switch radius {
        case ..<1000: return "Street"
        case ..<5000: return "Neighborhood"
        default: return "City"
        }
    }
}

/// Pushed picker for location precision — the iOS counterpart to the inline
/// `PrecisionSettingsRows` that macOS Settings › Advanced uses.
///
/// Mirrors `AccuracyPickerView` exactly, and exists for the same reason that pair
/// exists: a macOS settings pane has room for an inline popup menu, while iOS
/// wants a pushed list where each option can carry its own copy and the Pro gate
/// can decline a tap without a control snapping back under the user's finger.
struct PrecisionPickerView: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var pro = ProStore.shared
    @State private var showPaywall = false

    /// Approximate location is Pro on the Apple apps, matching
    /// `PrecisionSettingsRows.precisionLocked`. The extension enforces the same
    /// gate independently via `computeEffectiveLocationPrecision`.
    private var precisionLocked: Bool { !pro.isPro }

    private var currentPreset: LocationPrecisionPreset {
        precisionPreset(for: controller.locationPrecision)
    }

    var body: some View {
        Form {
            Section {
                ForEach(LocationPrecisionPreset.allCases) { preset in
                    Button {
                        select(preset)
                    } label: {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(preset.label).foregroundStyle(.primary)
                                Text(preset.detail)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 12)
                            if currentPreset == preset {
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
                // Mirrors AccuracyPickerView's footer: always explain, append the
                // upsell when locked, and name the sibling setting so the two
                // similar-sounding rows can be told apart from either side.
                VStack(alignment: .leading, spacing: 8) {
                    Text("Moves the coordinates sites receive to a random point within the chosen distance of your location. Your chosen location stays the anchor; this doesn't change the reported accuracy figure.")
                    if precisionLocked {
                        Text("Approximate location is a GeoSpoof Pro feature. Upgrade to report a random nearby point; free spoofing uses your exact chosen location.")
                    }
                }
            }
        }
        .navigationTitle("Location Precision")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .sheet(isPresented: $showPaywall) {
            ProPaywallView()
        }
    }

    private func select(_ preset: LocationPrecisionPreset) {
        if precisionLocked && preset != .exact {
            showPaywall = true
            return
        }
        if let radius = preset.radiusMeters {
            controller.setLocationPrecision(.approximate(radiusMeters: radius))
        } else {
            controller.setLocationPrecision(.exact)
        }
    }
}

/// Location-precision control (a single menu Picker) intended to be embedded in
/// a Form Section. Reads/writes `controller.locationPrecision`, mirroring the
/// web extension's preset mapping. Approximate location is a Pro feature on the
/// Apple apps (parity with custom accuracy): a free user picking an approximate
/// option is bounced to the paywall and the setting stays Exact — the extension
/// also forces Exact for these users, so this is the app UI half of that gate.
struct PrecisionSettingsRows: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var pro = ProStore.shared
    @State private var showPaywall = false

    private var precisionLocked: Bool { !pro.isPro }

    private var currentPreset: LocationPrecisionPreset {
        precisionPreset(for: controller.locationPrecision)
    }

    private var presetSelection: Binding<LocationPrecisionPreset> {
        Binding(
            get: { currentPreset },
            set: { applyPreset($0) }
        )
    }

    var body: some View {
        Picker(selection: presetSelection) {
            ForEach(LocationPrecisionPreset.allCases) { preset in
                Text(preset.label).tag(preset)
            }
        } label: {
            Label("Location Precision", systemImage: "mappin.and.ellipse")
        }
        .pickerStyle(.menu)
        .sheet(isPresented: $showPaywall) {
            ProPaywallView()
        }

        if precisionLocked {
            Text("Approximate location is a GeoSpoof Pro feature. Upgrade to report a random nearby point; free spoofing uses your exact chosen location.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        } else {
            Text("Approximate reports a random point near your location instead of the exact spot.")
                .font(.footnote)
                .foregroundStyle(.secondary)
        }
    }

    /// Map the chosen preset onto a concrete setting and push it through the
    /// controller. Approximate is Pro-gated: a free user is bounced to the
    /// paywall and the setting stays put (the extension also forces Exact).
    private func applyPreset(_ preset: LocationPrecisionPreset) {
        if precisionLocked && preset != .exact {
            showPaywall = true
            return
        }
        if let radius = preset.radiusMeters {
            controller.setLocationPrecision(.approximate(radiusMeters: radius))
        } else {
            controller.setLocationPrecision(.exact)
        }
    }
}

/// Detail-panel readout for the reported location precision: "Exact" or the
/// approximate radius (e.g. "±2 km"). Mirrors `accuracyDetailValue`.
func precisionDetailValue(for setting: SpoofLocationPrecision) -> LocalizedStringKey {
    switch setting {
    case .exact:
        return "Exact"
    case .approximate(let radius):
        return radius >= 1000 ? "±\(radius / 1000) km" : "±\(radius) m"
    }
}

// MARK: - Preserve location prompts (Pro-gated, Safari bridge)

/// Row(s) for the "Preserve Location Prompts" setting, embeddable in a Form
/// Section (placed under Advanced, beneath Location Accuracy). When on, spoofed
/// sites show the browser's native geolocation permission prompt instead of
/// GeoSpoof silently auto-granting the spoofed location. Pro-gated on the Apple
/// apps (parity with custom accuracy / per-site filters); the extension also
/// forces the free behavior for non-Pro users, so this is the UI half of the
/// same gate. A free user sees a locked PRO row that opens the paywall.
struct PreservePromptRows: View {
    @ObservedObject var controller: SpoofController
    /// When false, the explanatory paragraph is omitted so the caller can put it
    /// in the enclosing `Section`'s `footer:` instead — where help text belongs,
    /// and where it renders without row separators or row insets.
    ///
    /// Defaults to true so macOS Settings › Advanced keeps its existing inline
    /// layout unchanged; the iOS Browser index passes false.
    var showsFootnote: Bool = true
    @ObservedObject private var pro = ProStore.shared
    @State private var showPaywall = false

    private var locked: Bool { !pro.isPro }

    /// The explanatory copy, exposed so a caller rendering it in a Section footer
    /// uses the same strings rather than a drifting second copy.
    static func footnote(locked: Bool) -> LocalizedStringKey {
        locked
            ? "Preserving a site's native location prompt is a GeoSpoof Pro feature. Free spoofing answers permission prompts automatically with your spoofed location."
            : "Sites will show their own location permission prompt. Your spoofed location is used only after you allow it."
    }

    var body: some View {
        if locked {
            Button {
                showPaywall = true
            } label: {
                HStack(spacing: 12) {
                    Label("Preserve Location Prompts", systemImage: "hand.raised.circle")
                    Spacer(minLength: 8)
                    Text("PRO")
                        .font(.caption2.bold())
                        .padding(.horizontal, 8)
                        .padding(.vertical, 3)
                        .background(Color.brand.opacity(0.18), in: Capsule())
                        .foregroundStyle(Color.brand)
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
            .sheet(isPresented: $showPaywall) { ProPaywallView() }

            if showsFootnote {
                Text(Self.footnote(locked: true))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
        } else {
            Toggle(isOn: Binding(
                get: { controller.preserveGeolocationPrompt },
                set: { controller.setPreserveGeolocationPrompt($0) }
            )) {
                Label("Preserve Location Prompts", systemImage: "hand.raised.circle")
            }
        }
    }
}

// MARK: - Accuracy picker (iOS pushed detail screen)

/// Short label for the currently selected accuracy, e.g. "Realistic" or
/// "Custom · 250 m". Used as the trailing value on the iOS NavigationLink row
/// (mirrors the Appearance/App Icon rows).
func accuracyValueLabel(for setting: SpoofAccuracySetting) -> LocalizedStringKey {
    switch setting {
    // Interpolating a bare `Int` into a `LocalizedStringKey` formats it through
    // the display locale, so this groups at four digits and above: "Custom ·
    // 1,500 m" in en-US, "1.500" in de-DE, "1 500" in fr-FR. Metres range
    // 1...10000, so grouping is routinely visible here.
    //
    // This is a deliberate, approved change to shipping English copy — the app
    // previously rendered an ungrouped "Custom · 1500 m". It is the one
    // sanctioned exception to the Phase 1 English-invariance gate, recorded in
    // requirements.md Requirement 2.6, and it is what Requirement 10.2 wants.
    case .fixed(let m): return "Custom · \(m) m"
    case .auto, .range: return "Realistic"
    }
}

/// Detail-panel readout for the spoofed accuracy. Unlike `accuracyValueLabel`
/// (which names the preset for a settings row), this shows the concrete metres
/// the setting maps to so the Details screen stays a technical readout: a fixed
/// value as "±N m", and auto (or a legacy range) as "Realistic" (no fixed
/// number — the emitted value varies per location/seed and the app, which
/// doesn't hold the extension-owned seed, can't compute the exact figure).
func accuracyDetailValue(for setting: SpoofAccuracySetting) -> LocalizedStringKey {
    switch setting {
    case .fixed(let m): return "±\(m) m"
    case .auto, .range: return "Realistic"
    }
}

/// Seed used when switching to Custom from a non-fixed setting. Matches the
/// extension's DEFAULT_ACCURACY_M and `AccuracySettingsRows`.
private let accuracyDefaultCustomMeters = 45
/// Inclusive bounds the entered value must fall within (mirrors the extension's
/// ACCURACY_MIN_M / ACCURACY_MAX_M). Out-of-range input is rejected outright —
/// we never silently clamp the user's number.
private let accuracyMinMeters = 1
private let accuracyMaxMeters = 10000

/// Derive the active preset from a committed setting. Any `.range(...)` —
/// including a legacy Tight/Loose value saved before those presets were retired
/// — collapses to Realistic, and is normalized to `.auto` the next time the user
/// changes the setting. Shared by the inline `AccuracySettingsRows` semantics
/// and the pushed `AccuracyPickerView`.
private func accuracyPreset(for setting: SpoofAccuracySetting) -> AccuracyPreset {
    switch setting {
    case .fixed: return .custom
    case .auto, .range: return .realistic
    }
}

/// Pushed detail screen for choosing the spoofed accuracy (iOS pattern,
/// mirroring AppearancePickerView/AppIconPickerView). A checkmark list of
/// presets; when Custom is selected, a second section reveals a numeric field.
struct AccuracyPickerView: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var pro = ProStore.shared
    @State private var customText: String = ""
    @State private var customInvalid: Bool = false
    @State private var showPaywall = false
    @FocusState private var customFocused: Bool

    /// Custom accuracy is a Pro feature on the Apple apps (iOS + macOS);
    /// founders/subscribers are exempt via `pro.isPro` — matching
    /// `SiteFiltersView.filtersLocked`. The Chrome/Firefox extensions don't run
    /// this code and keep it free.
    private var accuracyLocked: Bool {
        return !pro.isPro
    }

    private var currentPreset: AccuracyPreset {
        accuracyPreset(for: controller.accuracySetting)
    }

    var body: some View {
        Form {
            Section {
                ForEach(AccuracyPreset.allCases) { preset in
                    Button { selectPreset(preset) } label: {
                        HStack(alignment: .firstTextBaseline) {
                            VStack(alignment: .leading, spacing: 2) {
                                Text(preset.label).foregroundStyle(.primary)
                                Text(preset.detail)
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                            }
                            Spacer(minLength: 12)
                            if currentPreset == preset {
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
                // The explanation shows unconditionally; the upsell is appended
                // only when locked. Previously this footer was empty for Pro
                // users, so the screen explained itself only to people who
                // couldn't use it.
                VStack(alignment: .leading, spacing: 8) {
                    Text(accuracyExplanation)
                    if accuracyLocked {
                        Text("Custom accuracy is a GeoSpoof Pro feature. Upgrade to set a fixed accuracy; free spoofing uses a realistic, device-appropriate value.")
                    }
                }
            }

            if currentPreset == .custom {
                Section {
                    HStack {
                        Text("Accuracy (m)")
                        Spacer(minLength: 12)
                        metersField
                            .multilineTextAlignment(.trailing)
                            .frame(maxWidth: 120)
                            .focused($customFocused)
                            .foregroundStyle(customInvalid ? Color.red : Color.primary)
                            .onSubmit { commitCustom() }
                            .onChange(of: customFocused) { focused in
                                // Commit when focus leaves the field.
                                if !focused { commitCustom() }
                            }
                    }
                } footer: {
                    Text("Enter a value between 1 and 10,000 meters.")
                }
            }
        }
        .navigationTitle("Location Accuracy")
        #if os(iOS)
        .navigationBarTitleDisplayMode(.inline)
        #endif
        .onAppear { syncFromController() }
        .onChange(of: controller.accuracySetting) { _ in syncFromController() }
        // Safety: if the user taps Back with the keyboard still up (no Done),
        // commit a valid value (or leave invalid input flagged/uncommitted).
        // commitCustom is idempotent for an already-committed value.
        .onDisappear { commitCustom() }
        .sheet(isPresented: $showPaywall) {
            ProPaywallView()
        }
    }

    /// The meters text field. On iOS it uses the numbers-and-punctuation
    /// keyboard (which has a Return key) with a "Done" submit label so the
    /// in-keyboard Return commits; on macOS it's a plain field. When the field
    /// gains focus on iOS we select the whole value (rather than dropping the
    /// caret at the start) so typing replaces the accuracy outright — the
    /// behavior users expect for a single short numeric value, and what UIKit
    /// does for select-all fields. SwiftUI's TextField doesn't do this on its
    /// own, so we set the selection when editing begins (deferred a tick, since
    /// UIKit places its own caret first).
    private var metersField: some View {
        // Same shape as `AccuracyRows.metersField`: a real localizable label for
        // accessibility, hidden visually, with the sample value as a verbatim
        // `prompt`. Passing "45" as the title made it a catalog key — a
        // translatable row holding a number — and left the field unlabelled for
        // VoiceOver.
        let field = TextField("Accuracy in meters", text: $customText, prompt: Text(verbatim: "45"))
            .labelsHidden()
        #if os(iOS)
        return field
            .keyboardType(.numbersAndPunctuation)
            .submitLabel(.done)
            .onReceive(NotificationCenter.default.publisher(for: UITextField.textDidBeginEditingNotification)) { note in
                guard let textField = note.object as? UITextField else { return }
                DispatchQueue.main.async {
                    textField.selectedTextRange = textField.textRange(
                        from: textField.beginningOfDocument,
                        to: textField.endOfDocument
                    )
                }
            }
        #else
        return field
        #endif
    }

    /// Map the chosen preset onto a concrete setting and push it through the
    /// controller. For Custom we keep an existing fixed value or seed a sensible
    /// default, then sync the text field. Selecting a non-custom preset does NOT
    /// auto-dismiss — the user taps Back, matching AppearancePickerView.
    private func selectPreset(_ preset: AccuracyPreset) {
        // Custom is Pro-gated on iOS: a free user is bounced to the paywall and
        // the setting stays put (mirrors SiteFiltersView's mode picker). The
        // extension also forces Realistic for these users, so this is the UI
        // half of the same gate.
        if accuracyLocked && preset == .custom {
            showPaywall = true
            return
        }
        switch preset {
        case .realistic:
            controller.setAccuracySetting(.auto)
        case .custom:
            let seed: Int
            if case .fixed(let meters) = controller.accuracySetting {
                seed = meters
            } else {
                seed = accuracyDefaultCustomMeters
            }
            customText = String(seed)
            customInvalid = false
            controller.setAccuracySetting(.fixed(meters: seed))
        }
    }

    /// Validate and commit the custom meters field. Mirrors the web's
    /// reject-out-of-range behavior: a finite integer within [1, 10000] commits;
    /// anything else (empty / non-numeric / out of range) flags the field and is
    /// left uncommitted so the user can correct it.
    private func commitCustom() {
        // If the user has switched away from Custom (e.g. picked Realistic while
        // the field still had focus), don't re-commit the old meters — that
        // would bounce the setting straight back to Custom. Losing focus as the
        // Custom section disappears, or tapping Back after switching, must be a
        // no-op rather than a write.
        guard currentPreset == .custom else {
            customInvalid = false
            return
        }
        let trimmed = customText.trimmingCharacters(in: .whitespaces)
        guard let value = Int(trimmed),
              value >= accuracyMinMeters,
              value <= accuracyMaxMeters else {
            customInvalid = true
            return
        }
        customInvalid = false
        controller.setAccuracySetting(.fixed(meters: value))
    }

    /// Pull the committed `.fixed` meters back into the text field when the
    /// setting changes externally (e.g. adopted from the extension). We don't
    /// fight the user mid-edit, so this only runs while the field isn't focused.
    private func syncFromController() {
        guard !customFocused else { return }
        customInvalid = false
        if case .fixed(let meters) = controller.accuracySetting {
            customText = String(meters)
        }
    }
}
