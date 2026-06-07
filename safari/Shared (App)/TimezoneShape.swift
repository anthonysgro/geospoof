//
//  TimezoneShape.swift
//  Shared (App)
//
//  Decodes the bundled IANA timezone boundary polygons (TopoJSON) so the map
//  can highlight the spoofed location's timezone region. The dataset is large
//  (~25 MB) but loads lazily off the main thread and is parsed once.
//
//  Ported from the Avion app's TopoJSON timezone overlay.
//

import Combine
import CoreLocation
import Foundation
import SwiftUI

// MARK: - TopoJSON raw structures

nonisolated struct TopoJSONTopology: Decodable {
    let objects: [String: TopoJSONObject]
    let arcs: [[[Int]]]
    let transform: TopoJSONTransform?
}

nonisolated struct TopoJSONTransform: Decodable {
    let scale: [Double]
    let translate: [Double]
}

nonisolated struct TopoJSONObject: Decodable {
    let type: String
    let geometries: [TopoJSONGeometry]?
}

nonisolated struct TopoJSONGeometry: Decodable {
    let type: String
    let arcs: AnyCodableArcs?
    let properties: TopoJSONProperties?
}

nonisolated struct TopoJSONProperties: Decodable {
    let tzid: String?
}

/// Handles the polymorphic arc encoding (Polygon vs MultiPolygon).
nonisolated enum AnyCodableArcs: Decodable {
    case polygon([[Int]])
    case multiPolygon([[[Int]]])

    init(from decoder: Decoder) throws {
        let container = try decoder.singleValueContainer()
        if let multi = try? container.decode([[[Int]]].self) {
            self = .multiPolygon(multi)
        } else if let poly = try? container.decode([[Int]].self) {
            self = .polygon(poly)
        } else {
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Arcs must be [[Int]] or [[[Int]]]"
            )
        }
    }
}

// MARK: - Decoder

nonisolated final class TopoJSONTimezoneDecoder: Sendable {
    private let decodedArcs: [[CLLocationCoordinate2D]]
    private let geometryIndex: [String: TopoJSONGeometry]

    private let cacheLock = NSLock()
    nonisolated(unsafe) private var coordinateCache: [String: [[CLLocationCoordinate2D]]] = [:]

    private init(decodedArcs: [[CLLocationCoordinate2D]], geometryIndex: [String: TopoJSONGeometry]) {
        self.decodedArcs = decodedArcs
        self.geometryIndex = geometryIndex
    }

    /// Loads and decodes the bundled TopoJSON file. Call off the main thread.
    nonisolated static func loadBundled() -> TopoJSONTimezoneDecoder? {
        guard let url = Bundle.main.url(forResource: "timezones.topo", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let topology = try? JSONDecoder().decode(TopoJSONTopology.self, from: data) else {
            return nil
        }
        return build(from: topology)
    }

    private static func build(from topology: TopoJSONTopology) -> TopoJSONTimezoneDecoder {
        let arcs = dequantizeArcs(topology.arcs, transform: topology.transform)
        var index: [String: TopoJSONGeometry] = [:]
        if let collection = topology.objects["timezones"] {
            for geom in collection.geometries ?? [] {
                if let tzid = geom.properties?.tzid {
                    index[tzid] = geom
                }
            }
        }
        return TopoJSONTimezoneDecoder(decodedArcs: arcs, geometryIndex: index)
    }

    /// Converts delta-encoded quantized arcs to absolute WGS84 coordinates.
    private static func dequantizeArcs(
        _ rawArcs: [[[Int]]],
        transform: TopoJSONTransform?
    ) -> [[CLLocationCoordinate2D]] {
        let sx = transform?.scale[0] ?? 1.0
        let sy = transform?.scale[1] ?? 1.0
        let tx = transform?.translate[0] ?? 0.0
        let ty = transform?.translate[1] ?? 0.0

        return rawArcs.map { arc in
            var x = 0
            var y = 0
            return arc.map { point in
                x += point[0]
                y += point[1]
                return CLLocationCoordinate2D(
                    latitude: Double(y) * sy + ty,
                    longitude: Double(x) * sx + tx
                )
            }
        }
    }

    /// Polygon rings (outer + holes) for a given IANA timezone ID, or nil.
    func coordinates(for tzid: String) -> [[CLLocationCoordinate2D]]? {
        cacheLock.lock()
        if let cached = coordinateCache[tzid] {
            cacheLock.unlock()
            return cached
        }
        cacheLock.unlock()

        guard let geom = geometryIndex[tzid], let arcs = geom.arcs else { return nil }

        let rings: [[CLLocationCoordinate2D]]
        switch geom.type {
        case "Polygon":
            switch arcs {
            case .polygon(let ringArcs):
                rings = ringArcs.map { resolveRing($0) }
            case .multiPolygon(let polyArcs):
                rings = polyArcs.map { ring in
                    guard let first = ring.first else { return [] }
                    return resolveRing(first)
                }
            }
        case "MultiPolygon":
            switch arcs {
            case .multiPolygon(let polygons):
                rings = polygons.compactMap { polygon in
                    guard let outerRing = polygon.first else { return nil }
                    return resolveRing(outerRing)
                }
            case .polygon(let ringArcs):
                rings = ringArcs.map { resolveRing($0) }
            }
        default:
            return nil
        }

        let nonEmpty = rings.filter { !$0.isEmpty }
        guard !nonEmpty.isEmpty else { return nil }

        cacheLock.lock()
        coordinateCache[tzid] = nonEmpty
        cacheLock.unlock()
        return nonEmpty
    }

    /// Resolves a ring of arc indices into a coordinate array.
    /// Negative index ~i means arc i reversed.
    private func resolveRing(_ arcIndices: [Int]) -> [CLLocationCoordinate2D] {
        var coords: [CLLocationCoordinate2D] = []
        for index in arcIndices {
            let arcIdx = index < 0 ? ~index : index
            let reversed = index < 0
            guard arcIdx >= 0, arcIdx < decodedArcs.count else { continue }
            var arc = decodedArcs[arcIdx]
            if reversed { arc.reverse() }
            if let last = coords.last, let first = arc.first,
               last.latitude == first.latitude, last.longitude == first.longitude {
                arc.removeFirst()
            }
            coords.append(contentsOf: arc)
        }
        return coords
    }

    /// Resolves the IANA timezone ID containing a coordinate via point-in-polygon
    /// over the bundled boundaries — the same approach `node-geo-tz` /
    /// `browser-geo-tz` use, reusing data we already ship. Returns nil over
    /// ocean / unmapped areas (the dataset only contains land/geographic zones).
    /// Call off the main thread.
    func timezoneID(for coordinate: CLLocationCoordinate2D) -> String? {
        let lat = coordinate.latitude
        let lon = coordinate.longitude
        for tzid in geometryIndex.keys {
            guard let rings = coordinates(for: tzid) else { continue }
            for ring in rings where Self.ring(ring, contains: lat, lon) {
                return tzid
            }
        }
        return nil
    }

    /// Ray-casting point-in-polygon test (lon = x, lat = y).
    private static func ring(_ ring: [CLLocationCoordinate2D], contains lat: Double, _ lon: Double) -> Bool {
        guard ring.count > 2 else { return false }
        var inside = false
        var j = ring.count - 1
        for i in 0..<ring.count {
            let yi = ring[i].latitude, xi = ring[i].longitude
            let yj = ring[j].latitude, xj = ring[j].longitude
            if (yi > lat) != (yj > lat) {
                let intersectX = xi + (lat - yi) / (yj - yi) * (xj - xi)
                if lon < intersectX { inside.toggle() }
            }
            j = i
        }
        return inside
    }
}

// MARK: - Store

/// Lazily loads the timezone polygon decoder off-main and serves rings for a
/// timezone ID. Shared across the app; the dataset is immutable.
@MainActor
final class TimezoneShapeStore: ObservableObject {
    static let shared = TimezoneShapeStore()

    @Published private(set) var isReady = false
    private var decoder: TopoJSONTimezoneDecoder?
    private var loadTask: Task<TopoJSONTimezoneDecoder?, Never>?

    private init() {}

    /// Kick off a one-time background load. Safe to call repeatedly.
    func preload() {
        ensureLoading()
    }

    @discardableResult
    private func ensureLoading() -> Task<TopoJSONTimezoneDecoder?, Never> {
        if let loadTask { return loadTask }
        Log.data.debug("Timezone boundaries: loading bundled timezones.topo.json")
        let task = Task<TopoJSONTimezoneDecoder?, Never> {
            let started = Date()
            let loaded = await Task.detached(priority: .utility) {
                TopoJSONTimezoneDecoder.loadBundled()
            }.value
            self.decoder = loaded
            self.isReady = loaded != nil
            let ms = Int(Date().timeIntervalSince(started) * 1000)
            if loaded == nil {
                Log.data.error("Timezone boundaries: failed to load timezones.topo.json")
            } else {
                Log.data.info("Timezone boundaries loaded in \(ms)ms")
            }
            return loaded
        }
        loadTask = task
        return task
    }

    /// Polygon rings for a timezone ID (empty until loaded / if unknown).
    func rings(for tzid: String) -> [[CLLocationCoordinate2D]] {
        decoder?.coordinates(for: tzid) ?? []
    }

    /// Resolves the real IANA timezone ID for a coordinate, loading the dataset
    /// first if needed. Runs the lookup off-main. Returns nil over unmapped areas.
    func resolveTimezoneID(for coordinate: CLLocationCoordinate2D) async -> String? {
        guard let decoder = await ensureLoading().value else { return nil }
        return await Task.detached(priority: .userInitiated) {
            decoder.timezoneID(for: coordinate)
        }.value
    }
}
