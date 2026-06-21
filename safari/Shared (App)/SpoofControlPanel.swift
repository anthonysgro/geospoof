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

struct SpoofControlPanel: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var pro = ProStore.shared

    @AppStorage("spoofOnboardingCompleted") private var onboardingCompleted = false
    @AppStorage("founderWelcomeShown") private var founderWelcomeShown = false
    @State private var showOnboarding = false
    @State private var showTrustInfo = false
    @State private var renaming: SpoofFavorite?
    @State private var reviewToken = 0
    @State private var showPaywall = false
    @State private var showFounderWelcome = false

    var body: some View {
        Form {
            #if os(iOS)
            setupSection
            #endif
            protectionSection
            locationSection
            vpnSyncSection
            if !controller.favorites.isEmpty {
                favoritesSection
            }
            #if os(iOS)
            verificationSection
            #endif
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
        .requestReview(on: reviewToken)
        .onAppear {
            controller.refreshFromExtension()
            if !onboardingCompleted { showOnboarding = true }
            if onboardingCompleted && controller.isActiveInSafari && controller.hasLocation,
                ReviewPrompt.shouldRequestReview() {
                reviewToken += 1
            }
            if pro.isFounder && !founderWelcomeShown { showFounderWelcome = true }
        }
        .onChange(of: controller.isActiveInSafari) { active in
            if onboardingCompleted && active && controller.hasLocation,
                ReviewPrompt.shouldRequestReview() {
                reviewToken += 1
            }
        }
        .onChange(of: pro.isFounder) { isFounder in
            if isFounder && !founderWelcomeShown { showFounderWelcome = true }
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
        if let url = URL(string: "https://geospoof.com/verify") {
            UIApplication.shared.open(url)
        }
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
                #if os(iOS)
                autoBackgroundSyncRow
                #endif

                if let ip = controller.lastSyncedIP {
                    LabeledRow(label: "Detected IP", value: ip)
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
                Text("Matches your spoofed location to your current public IP. Automatic Background Sync keeps it matched as your VPN changes — even when the app is closed.")
                #else
                Text("Matches your spoofed location to your current public IP.")
                #endif
            }
        }
    }

    #if os(iOS)
    /// "Automatic Background Sync" — an inherent Pro capability (no user toggle):
    /// for Pro it's always on while VPN sync is active, so we show a passive
    /// "On" status; non-Pro users see a locked PRO row that opens the paywall
    /// (the manual "Sync Now" below stays free for everyone). The gating + bridge
    /// to the extension lives in SpoofController.autoSyncBlocked.
    @ViewBuilder
    private var autoBackgroundSyncRow: some View {
        if pro.isPro {
            // Read-only status, not a toggle: it's always on for Pro. Use the
            // native label/value row (LabeledContent) so "On" renders at the
            // standard Settings-row size/treatment; fall back to a matching
            // HStack on iOS 15 (LabeledContent is iOS 16+).
            if #available(iOS 16.0, *) {
                LabeledContent {
                    Text("On")
                } label: {
                    Label("Automatic Background Sync", systemImage: "arrow.triangle.2.circlepath")
                }
            } else {
                HStack {
                    Label("Automatic Background Sync", systemImage: "arrow.triangle.2.circlepath")
                    Spacer()
                    Text("On").foregroundStyle(.secondary)
                }
            }
        } else {
            Button {
                showPaywall = true
            } label: {
                HStack(spacing: 12) {
                    Label("Automatic Background Sync", systemImage: "arrow.triangle.2.circlepath")
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
    #endif

    // MARK: Verification (iOS only on home tab, macOS shows in Test sidebar)

    #if os(iOS)
    private var verificationSection: some View {
        Section {
            Link(destination: URL(string: "https://www.geospoof.com/verify")!) {
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
    #endif

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

    // MARK: Test links — see ProtectionTestLinks (shared with the macOS Test tab)
}

/// A single "Verify Your Protection" link to the hosted geospoof.com/verify
/// page, which runs the location / timezone / IP checks and explains the
/// results in plain language — friendlier than sending users to raw third-party
/// test sites. Used inline in the iOS Details tab and the macOS Test sidebar
/// section. (Help & Support lives in Settings on both platforms.)
struct ProtectionTestLinks: View {
    var body: some View {
        Section {
            Link(destination: URL(string: "https://www.geospoof.com/verify")!) {
                HStack {
                    Label("Verify Your Protection", systemImage: "checkmark.shield")
                    Spacer()
                    Image(systemName: "arrow.up.right")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        } footer: {
            Text("Opens a quick check that confirms your location, timezone, and IP address are masked.")
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

    private var title: String {
        if let name = controller.locationName?.displayName, !name.isEmpty { return name }
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
    @State private var showPaywall = false

    /// Placement is Pro on iOS; macOS keeps it free (matches the app's other Pro
    /// gates). The dropped coordinate flows through the normal setLocation path.
    private var placementLocked: Bool {
        #if os(iOS)
        return !pro.isPro
        #else
        return false
        #endif
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
        .sheet(isPresented: $showPaywall) { ProPaywallView() }
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
    private func handleCenterChange(_ center: CLLocationCoordinate2D) {
        pickedCenter = center
        guard isPicking else { return }
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

struct SetLocationView: View {
    @ObservedObject var controller: SpoofController
    @ObservedObject private var store = CityStore.shared
    @Environment(\.dismiss) private var dismiss

    @State private var searchText = ""
    @State private var latText = ""
    @State private var lonText = ""
    @State private var coordError: String?

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

            Section("Enter Coordinates") {
                coordField("Latitude (−90 to 90)", text: $latText)
                coordField("Longitude (−180 to 180)", text: $lonText)
                if let coordError {
                    Text(coordError).font(.caption).foregroundStyle(.red)
                }
                Button {
                    applyManualCoordinates()
                } label: {
                    HStack { Spacer(); Text("Set Location"); Spacer() }
                }
                .disabled(latText.isEmpty || lonText.isEmpty)
            }
        }
        .searchable(text: $searchText, prompt: "Search for a city")
        .navigationTitle("Set Location")
        .tint(.brand)
        .onAppear { store.preload() }
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
    let label: String
    let value: String
    var body: some View {
        HStack {
            Text(label)
            Spacer()
            Text(value)
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
    @Published var errorMessage: String?

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
                Text("GeoSpoof is free and open source. Tips are completely optional and go straight to development. Thank you!")
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

/// Gating logic for the App Store review prompt. Presentation is done by the
/// view via the recommended SwiftUI `requestReview` environment action — see
/// the `requestReview(on:)` view modifier below — so this type holds no UI.
///
/// Asks at a genuinely positive moment (GeoSpoof confirmed running in Safari
/// with a location set), heavily throttled: at most one counted event per app
/// launch, only after a few qualifying sessions, and never more than once per
/// app version (Apple also caps its own prompt at 3×/year).
enum ReviewPrompt {
    private static let eventCountKey = "reviewSignificantEventCount"
    private static let lastPromptedVersionKey = "reviewLastPromptedVersion"
    /// Qualifying sessions before we ask. Small, since the trigger is already a
    /// strong "it's working" signal.
    private static let threshold = 3

    /// Only count one significant event per process launch, so navigating back
    /// to the panel within a session can't inflate the counter.
    private static var countedThisLaunch = false

    /// Call when the user is in a clearly positive state. Returns `true` at most
    /// once per launch — after `threshold` qualifying sessions and only once per
    /// app version — meaning the caller should present the review prompt now.
    @MainActor
    static func shouldRequestReview() -> Bool {
        guard !countedThisLaunch else { return false }
        countedThisLaunch = true

        let defaults = UserDefaults.standard
        let count = defaults.integer(forKey: eventCountKey) + 1
        defaults.set(count, forKey: eventCountKey)
        guard count >= threshold else { return false }

        let currentVersion =
            Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? ""
        guard defaults.string(forKey: lastPromptedVersionKey) != currentVersion else { return false }

        defaults.set(currentVersion, forKey: lastPromptedVersionKey)
        return true
    }

    #if os(iOS)
    /// Fallback for iOS 15, where the SwiftUI `requestReview` action (iOS 16+)
    /// isn't available.
    @MainActor
    static func legacyRequest() {
        let scene =
            UIApplication.shared.connectedScenes
            .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
            ?? UIApplication.shared.connectedScenes.first as? UIWindowScene
        guard let scene else { return }
        SKStoreReviewController.requestReview(in: scene)
    }
    #endif
}

extension View {
    /// Presents the system review prompt whenever `token` changes to a new
    /// non-zero value. On iOS 16+/macOS 13+ this uses the scene-based
    /// `AppStore.requestReview(in:)` (iOS) / `requestReview` environment action
    /// (macOS); on iOS 15 it falls back to `SKStoreReviewController`. Bump an
    /// `@State` token to trigger.
    @ViewBuilder
    func requestReview(on token: Int) -> some View {
        if #available(iOS 16.0, macOS 13.0, *) {
            modifier(EnvironmentReviewModifier(token: token))
        } else {
            onChange(of: token) { newValue in
                #if os(iOS)
                if newValue > 0 { ReviewPrompt.legacyRequest() }
                #endif
            }
        }
    }
}

/// Reads the `requestReview` environment action and fires it when `token`
/// changes. Isolated in its own `@available` type because the action is iOS 16+
/// / macOS 13+ and the app targets iOS 15.
@available(iOS 16.0, macOS 13.0, *)
private struct EnvironmentReviewModifier: ViewModifier {
    @Environment(\.requestReview) private var requestReview
    let token: Int

    func body(content: Content) -> some View {
        content.onChange(of: token) { newValue in
            guard newValue > 0 else { return }
            #if os(iOS)
            // Prefer the scene-based StoreKit call over the environment action:
            // the environment `requestReview()` can silently no-op when invoked
            // from a view nested inside a NavigationStack (a long-standing quirk),
            // whereas the scene-based API presents reliably. `AppStore.requestReview(in:)`
            // is the modern, non-deprecated replacement for `SKStoreReviewController`.
            let scene =
                UIApplication.shared.connectedScenes
                .first(where: { $0.activationState == .foregroundActive }) as? UIWindowScene
                ?? UIApplication.shared.connectedScenes.first as? UIWindowScene
            if let scene {
                AppStore.requestReview(in: scene)
            } else {
                requestReview()
            }
            #else
            requestReview()
            #endif
        }
    }
}

// MARK: - Site Filters (scope)

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
    @ObservedObject private var pro = ProStore.shared
    @State private var showingAdd = false
    @State private var showPaywall = false

    /// Per-site filtering is Pro on iOS only. macOS (and the extension on
    /// Chrome/Firefox) keep it free, so the lock never engages there.
    private var filtersLocked: Bool {
        #if os(iOS)
        return !pro.isPro
        #else
        return false
        #endif
    }

    var body: some View {
        AdaptiveNavigationStack {
            Form {
                Section {
                    Picker("Mode", selection: Binding(
                        get: { controller.scopeMode },
                        set: { newMode in
                            if filtersLocked && newMode != .all {
                                showPaywall = true
                            } else {
                                controller.setScopeMode(newMode)
                            }
                        }
                    )) {
                        ForEach(ScopeMode.allCases) { mode in
                            Text(mode.label).tag(mode)
                        }
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("Mode")
                } footer: {
                    if filtersLocked {
                        Text("Allowlist and Denylist are a GeoSpoof Pro feature. Upgrade to limit spoofing to specific sites.")
                    } else if controller.scopeMode == .all {
                        Text("\(controller.scopeMode.detail) Choose Allowlist or Denylist to limit spoofing to specific sites.")
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
            .navigationTitle("Filters")
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
    }

    private var sitesSection: some View {
        Section {
            ForEach(controller.activeScopeList, id: \.self) { domain in
                HStack(spacing: 10) {
                    ScopeMonogram(domain: domain)
                    Text(domain)
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
                Text("\(controller.activeScopeList.count)")
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

    private var addRowTitle: String {
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
    @State private var hint: String?
    /// Sites added during this sheet session, newest first — live confirmation
    /// of what's been entered without duplicating the full list behind it.
    @State private var added: [String] = []
    @FocusState private var focused: Bool

    private var navTitle: String {
        mode == .denylist ? "Add Blocked Sites" : "Add Allowed Sites"
    }

    private var helpText: String {
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
                        TextField("example.com", text: $text)
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

                if !added.isEmpty {
                    Section {
                        ForEach(added, id: \.self) { domain in
                            HStack(spacing: 10) {
                                ScopeMonogram(domain: domain)
                                Text(domain)
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

    private func add() {
        switch onAdd(text) {
        case .added:
            let domain = SpoofController.normalizeDomainInput(text) ?? text
            withAnimation(.easeInOut(duration: 0.2)) {
                added.removeAll { $0 == domain }
                added.insert(domain, at: 0)
            }
            text = ""
            hint = nil
        case .duplicate:
            hint = "Already added"
        case .invalid:
            hint = "Not a valid domain"
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
        Text(initial)
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
    var label: String {
        switch self {
        case .realistic: return "Realistic"
        case .custom: return "Custom"
        }
    }
}

/// Accuracy control rows (a Picker + a conditional Custom meters field) intended
/// to be embedded inside a Form Section. Reads/writes `controller.accuracySetting`,
/// mirroring the web extension's preset mapping exactly:
///   Realistic → `.auto`, Custom → `.fixed(meters:)`.
struct AccuracySettingsRows: View {
    @ObservedObject var controller: SpoofController
    @State private var customText: String = ""
    @State private var customInvalid: Bool = false
    @FocusState private var customFocused: Bool

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
        let field = TextField("Accuracy in meters", text: $customText, prompt: Text("45"))
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

// MARK: - Accuracy picker (iOS pushed detail screen)

/// Short label for the currently selected accuracy, e.g. "Realistic" or
/// "Custom · 250 m". Used as the trailing value on the iOS NavigationLink row
/// (mirrors the Appearance/App Icon rows).
func accuracyValueLabel(for setting: SpoofAccuracySetting) -> String {
    switch setting {
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
func accuracyDetailValue(for setting: SpoofAccuracySetting) -> String {
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

    /// Custom accuracy is Pro on iOS only. macOS (and the extension on
    /// Chrome/Firefox) keep it free, so the lock never engages there — matching
    /// `SiteFiltersView.filtersLocked`.
    private var accuracyLocked: Bool {
        #if os(iOS)
        return !pro.isPro
        #else
        return false
        #endif
    }

    private var currentPreset: AccuracyPreset {
        accuracyPreset(for: controller.accuracySetting)
    }

    var body: some View {
        Form {
            Section {
                ForEach(AccuracyPreset.allCases) { preset in
                    Button { selectPreset(preset) } label: {
                        HStack {
                            Text(preset.label).foregroundStyle(.primary)
                            Spacer()
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
                if accuracyLocked {
                    Text("Custom accuracy is a GeoSpoof Pro feature. Upgrade to set a fixed accuracy; free spoofing uses a realistic, device-appropriate value.")
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
        let field = TextField("45", text: $customText)
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
