# GeoSpoof GPS

Desktop companion that sets a connected iPhone's real, system-level GPS location from
the chosen GeoSpoof location — so the browser spoof (Safari extension) and the phone's
actual CoreLocation report the same place.

This lives as a subfolder of the GeoSpoof monorepo. It is a **separate product** from
the browser extension, built and released independently (its own CI + release
workflow). License: **MIT** (same as the rest of the repo).

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

## Distribution

Non-sandboxed, Developer-ID-signed, notarized DMG (NOT the App Store — the sandbox
blocks the usbmux access this needs). A Windows sibling is a later phase.
