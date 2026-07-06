// swift-tools-version: 6.0
import PackageDescription

// GeoSpoof GPS menu-bar app — the native macOS face for the headless Rust agent
// (design §19). A menu-bar-only accessory app that supervises the agent as a child
// process and shows status / controls. Built by gps/packaging/build-dmg.sh and bundled
// into GeoSpoof GPS.app alongside the agent.
let package = Package(
    name: "GeoSpoofGPSMenu",
    platforms: [.macOS(.v13)], // SMAppService (login item) needs macOS 13+.
    targets: [
        .executableTarget(
            name: "GeoSpoofGPSMenu",
            path: "Sources/GeoSpoofGPSMenu"
        )
    ],
    // Swift 5 language mode: AppKit menu-bar code lives on the main thread with a few
    // off-main callbacks (Process termination), which the Swift 6 strict-concurrency
    // checker would flag noisily for no safety win here.
    swiftLanguageModes: [.v5]
)
