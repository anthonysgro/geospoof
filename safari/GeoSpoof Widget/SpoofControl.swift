//
//  SpoofControl.swift
//  GeoSpoof Widget
//
//  iOS 18 Control (Control Center / Lock Screen / Action button) that re-syncs
//  the spoofed location to the current VPN exit IP with a single tap, via the
//  shared `ResyncIntent`. Controls are an iOS-only surface, so the whole file is
//  gated to iOS.
//
//  NOTE: depends on `ResyncIntent` (this target) and, transitively, the shared
//  symbols from `SpoofModel.swift`.
//

#if os(iOS)
import AppIntents
import SwiftUI
import WidgetKit

@available(iOS 18.0, *)
struct SpoofResyncControl: ControlWidget {
    let kind = "GeoSpoofResyncControl"

    var body: some ControlWidgetConfiguration {
        StaticControlConfiguration(kind: kind) {
            ControlWidgetButton(action: ResyncIntent()) {
                Label("Re-sync VPN", systemImage: "arrow.triangle.2.circlepath")
            }
        }
        .displayName("Re-sync VPN Location")
        .description("Match your spoofed location to your current VPN exit IP.")
    }
}
#endif
