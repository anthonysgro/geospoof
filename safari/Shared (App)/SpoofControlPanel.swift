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

    /// When false, the "Test Your Protection" / Help links are omitted (macOS
    /// shows them in a dedicated Test sidebar tab instead). iOS keeps them
    /// inline on the main screen.
    var includeTestLinks: Bool = true

    @AppStorage("spoofOnboardingCompleted") private var onboardingCompleted = false
    @State private var showOnboarding = false
    @State private var showTrustInfo = false
    @State private var renaming: SpoofFavorite?

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
            if includeTestLinks {
                ProtectionTestLinks()
            }
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
        .onAppear {
            controller.refreshFromExtension()
            if !onboardingCompleted { showOnboarding = true }
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
        // Opens a geolocation test page so the user can switch GeoSpoof on for
        // the page (via the page menu) and immediately see it working — which
        // also fires the activation heartbeat. Note: iOS has no public API to
        // force Safari specifically; this opens the user's default browser,
        // which is Safari for the vast majority.
        if let url = URL(string: "https://webbrowsertools.com/geolocation/") {
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
                Text("Matches your spoofed location to your current public IP. Re-sync after switching VPN servers.")
            }
        }
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

/// The external "Test Your Protection" links plus Help & Support, as Form
/// sections. Used inline on iOS and in the dedicated Test sidebar tab on macOS.
struct ProtectionTestLinks: View {
    var body: some View {
        Group {
            Section("Test Your Protection") {
                testLink("Geolocation", "https://webbrowsertools.com/geolocation/", symbol: "location.magnifyingglass")
                testLink("Timezone", "https://webbrowsertools.com/timezone/", symbol: "clock")
                testLink("IP Leak", "https://browserleaks.com/webrtc", symbol: "wifi.exclamationmark")
            }
            Section {
                testLink("Help & Support", "https://www.geospoof.com/support", symbol: "questionmark.circle")
            }
        }
    }

    private func testLink(_ title: String, _ urlString: String, symbol: String) -> some View {
        Link(destination: URL(string: urlString)!) {
            HStack {
                Label(title, systemImage: symbol)
                Spacer()
                Image(systemName: "arrow.up.right")
                    .font(.caption)
                    .foregroundStyle(.secondary)
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
                    Text(String(format: "%.4f, %.4f", latitude, longitude))
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
            FullScreenMapView(latitude: latitude, longitude: longitude, timezone: controller.timezone)
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
    let latitude: Double
    let longitude: Double
    var timezone: SpoofTimezone?
    @Environment(\.dismiss) private var dismiss
    @State private var is3D = true

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
                        timezoneID: timezone?.identifier
                    )
                    .toolbar {
                        closeToolbarItem
                        ToolbarItem(placement: .primaryAction) {
                            Button {
                                withAnimation(.easeInOut(duration: 0.6)) { is3D.toggle() }
                            } label: {
                                Image(systemName: is3D ? "map" : "globe.americas.fill")
                            }
                            .accessibilityLabel(is3D ? "Switch to 2D" : "Switch to 3D")
                        }
                    }
                } else {
                    SpoofMap(latitude: latitude, longitude: longitude, span: 6, interactive: true)
                        .toolbar { closeToolbarItem }
                }
            }
            .ignoresSafeArea(edges: .bottom)
            .navigationTitle(tzTitle)
            #if os(iOS)
            .navigationBarTitleDisplayMode(.inline)
            #endif
        }
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
    let timezoneID: String?

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
            Annotation("", coordinate: coordinate, anchor: .bottom) { SpoofMap.pin }
        }
        .mapStyle(.hybrid(elevation: is3D ? .realistic : .flat))
        .onAppear {
            camera = is3D ? camera3D : .region(region)
            shapes.preload()
        }
        .onChange(of: is3D) { _, newValue in
            withAnimation(.easeInOut(duration: 0.6)) {
                camera = newValue ? camera3D : .region(region)
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
