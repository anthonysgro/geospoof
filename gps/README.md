# GeoSpoof GPS

Desktop companion that sets a connected iPhone's real, system-level GPS location from
the chosen GeoSpoof location — so the browser spoof (Safari extension) and the phone's
actual CoreLocation report the same place.

This lives as a subfolder of the GeoSpoof monorepo. It is a **separate product** from
the browser extension, built and released independently (its own CI + release
workflow). License: **FSL-1.1-MIT** — source-available, converts to MIT two years
after each release; see [LICENSE](LICENSE). (The rest of the repo, including the
browser extension, is MIT.)

## What it is

- A **host-agnostic Rust core** wrapping [`idevice`](https://github.com/jkcoxson/idevice)
  (MIT) — device discovery, userspace tunnel, Developer Disk Image mount, and the DVT
  `set` / `clear` location operations. No root daemon required.
- A **headless agent** (v1) driven by a bidirectional desired-state / status contract:
  a source-of-truth app (the macOS/iOS GeoSpoof app) writes the desired location; the
  agent reconciles the device to match and reports status back.

The location-selection UI is NOT reimplemented here — the existing GeoSpoof app is the
source of truth. See the design/requirements/tasks in the Kiro spec
(`.kiro/specs/geospoof-gps/`, local) for the full architecture and rationale.

## Planned layout (scaffolded in a later task)

```
gps/
  core/     # geospoof-gps-core: host-agnostic Rust lib over idevice
  ffi/      # C ABI for embedding in native apps
  agent/    # headless reconciliation agent (v1 host)
```

## Status

Pre-implementation. The device capability is validated only on an iOS 27 beta so far;
the make-or-break gate — mounting the Developer Disk Image on a Mac **without Xcode**,
on stable iOS 26 — is not yet proven. Do not build product surface on top until it is.

## Build & run locally

You can build the exact deliverable — `GeoSpoof GPS.app` wrapped in a DMG — on your own
Mac without any signing credentials. The packaging script
([`packaging/build-dmg.sh`](packaging/build-dmg.sh)) runs end-to-end locally and produces
an **unsigned** DMG for inspection; code signing and notarization only turn on when the
relevant environment variables are present (they are in CI), so locally they're skipped
automatically.

### Prerequisites

- macOS 13 (Ventura) or later — the menu-bar app uses `SMAppService`.
- Xcode + Command Line Tools (provides `swift`, `lipo`, `codesign`, `hdiutil`, `sips`,
  `iconutil`). Verify with `xcode-select -p`.
- A Rust stable toolchain via [`rustup`](https://rustup.rs).
- Optional, for a universal (Intel + Apple Silicon) agent binary:
  ```sh
  rustup target add aarch64-apple-darwin x86_64-apple-darwin
  ```
  If only your host arch is installed the script builds a single-arch agent, which is
  fine for local testing.

### Build the DMG

From the repo root (the script resolves its own paths, so any working directory works):

```sh
bash gps/packaging/build-dmg.sh
```

This builds the Rust agent and the Swift menu-bar app, assembles `GeoSpoof GPS.app`
(the menu app as the executable, with the agent embedded at `Contents/Helpers/`), and
wraps it in a DMG. Two artifacts land in `gps/target/pkg/`:

```
gps/target/pkg/GeoSpoof GPS.app            # the assembled app bundle (intermediate)
gps/target/pkg/GeoSpoof-GPS-v<version>.dmg # a copy of it wrapped for distribution
```

where `<version>` comes from `gps/Cargo.toml` (override with `VERSION=... bash gps/packaging/build-dmg.sh`).
Both are the same app — the DMG just wraps a copy of the `.app` in a drag-to-Applications
layout. Use the DMG when you want to test the real install/distribution flow; for quick
local testing you can launch the loose `.app` directly (below).

### Run it

**Quick local test** — launch the loose `.app` without the DMG:

```sh
open "gps/target/pkg/GeoSpoof GPS.app"
```

**Test the real install flow** — mount the DMG and drag to Applications:

```sh
open gps/target/pkg/GeoSpoof-GPS-v<version>.dmg
```

Either way, because a local build is **unsigned and un-notarized**, Gatekeeper will block
the first launch. Right-click the app and choose **Open** (then confirm), or clear the
quarantine flag first — e.g. for the loose bundle:

```sh
xattr -dr com.apple.quarantine "gps/target/pkg/GeoSpoof GPS.app"
```

It launches as a menu-bar-only app (no Dock icon). Use the menu-bar item for status and
lifecycle (Pause/Resume, Open at Login, Quit). Location itself is still driven by the
iOS/macOS GeoSpoof app — this app supervises the agent and reports status.

### Faster iteration on a single component

While hacking, you can build the pieces directly instead of packaging a DMG each time:

```sh
# Rust agent
cargo build -p geospoof-gps-agent --manifest-path gps/Cargo.toml
# Swift menu-bar app
swift build --package-path gps/desktop
```

### Testing the Pro entitlement gate

Device GPS is a Pro feature, so the agent won't spoof unless it can confirm the user is
Pro. Confirmation is intentionally strict, and this is the usual "why does the GPS tab say
**GeoSpoof Pro required** even though I'm a founder / subscriber?" trap:

- The **phone's** paywall gate (`ProStore.isPro`) trusts the local founder/subscription
  state, so the GPS tab clears the paywall section.
- The **agent's** gate re-verifies independently. It reads the app's `desired.json` over
  the device link and grants Pro only from the Apple-**signed** StoreKit proof
  (`AppTransaction` / entitlement transactions) it can verify offline against Apple's cert
  chain. It does **not** trust the unsigned `pro` bool in a release build.

The catch is the signing **environment**. When you run the iOS app from Xcode with the
local `GeoSpoof.storekit` configuration, its `AppTransaction` is signed by Xcode's test
certificate (`Xcode` environment), not Apple's production chain. A **release** agent only
accepts `Production` + `Sandbox`, so it rejects the Xcode-signed proof → "Pro required".

The agent's Pro logic is the same in debug and release — a signed proof is the authority,
and it must actually _grant_ Pro (founder / lifetime / active subscription). Debug only
relaxes two things: it also accepts the `Xcode` / `LocalTesting` StoreKit environments, and
(only when the phone sends **no** signed proof at all) it honors the unsigned `pro` bool.

Two ways to test, matching the two build combinations:

1. **Debug agent + your normal Xcode/StoreKit build (fast inner loop).** Build the agent in
   debug so it accepts the Xcode-signed proof at all:

   ```sh
   DEBUG=1 bash gps/packaging/build-dmg.sh   # → GeoSpoof-GPS-v<version>-debug.dmg
   ```

   Then make the proof actually grant Pro (a debug agent still won't invent an entitlement):
   - **Founder:** set your `GeoSpoof.storekit` App Transaction → _Original Application
     Version_ to a value **below 40** (the founder cutoff). A StoreKit-test build otherwise
     reports a recent version (e.g. `51`), which reads as _not_ a founder — this is the #1
     gotcha.
   - **Purchase:** buy the lifetime unlock or a subscription in the StoreKit-test session.
   - **Force Founder:** Settings → Debug → Force Founder sends no signed proof, so the debug
     agent falls back to the phone's unsigned `pro` bool.

   ⚠️ A debug agent can be unlocked by an unsigned flag — **never distribute it**.

2. **Release agent + real StoreKit (final crypto/pipeline check).** Keep the normal release
   DMG and run the iOS app against real StoreKit instead of the local config: in the Xcode
   scheme set Run → Options → **StoreKit Configuration → None**, and sign into a **Sandbox**
   Apple account. `AppTransaction` then comes back Sandbox-signed, which the release agent
   verifies for real — the true end-to-end signature path a shipped build uses.

To see the agent's Pro decision (per environment, with the `originalAppVersion` and founder
result), read `~/Library/Logs/GeoSpoof GPS/agent.log` — a debug agent logs this detail, and
its startup line shows `build="debug"` so you can confirm which binary is running.

## Distribution

Non-sandboxed, Developer-ID-signed, notarized DMG (NOT the App Store — the sandbox
blocks the usbmux access this needs). A Windows sibling is a later phase.
