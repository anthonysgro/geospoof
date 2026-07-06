# GeoSpoof GPS — Dependency Policy

Rationale and rules for third-party dependencies in the `/gps` workspace. Backs design
§10a.3 (supply-chain) and Requirement 7.4. Keep this short and enforced by CI, not
folklore.

## Pinning & lockfile

- **Direct dependencies are pinned EXACT** (`=x.y.z`), not caret ranges. Upgrades are
  deliberate, reviewed changes — never silent.
- **`Cargo.lock` is committed** and CI builds with `--locked`, so the graph that ships
  is the graph that was reviewed.
- `cargo-deny` bans wildcard version requirements (`wildcards = "deny"`). Internal
  workspace crates are `publish = false` and referenced by path (allowed via
  `allow-wildcard-paths`).

## The `idevice` dependency (special attention)

`idevice` (jkcoxson, MIT) is the device-control engine. It is pre-1.0 (0.1.x) and
effectively single-maintainer, so it carries real churn and bus-factor risk for a paid
product. Mitigations:

- **Pinned exact** (`idevice = "=0.1.64"`); bumps are reviewed with a changelog read.
- **Kept swappable.** All device I/O sits behind the `DeviceController` trait
  (design §10a.2). idevice is one implementation; pymobiledevice3, go-ios, or an
  in-house protocol implementation remain viable fallbacks without touching app logic.
- **Fork-ready.** Be prepared to vendor/fork and carry patches (e.g., when a new iOS
  major breaks DDI mounting before upstream catches up — see design §10a.5).
- **Track releases** deliberately; upstream fixes where practical to reduce fork drift.

## The `app-store-server-library` dependency (entitlement verification)

The agent verifies the app's Apple-signed StoreKit entitlement OFFLINE (Requirement 6)
via `app-store-server-library` (`=4.3.0`, `default-features = false`) — a faithful Rust
port of Apple's official App Store Server Library. Chosen deliberately:

- **Don't hand-roll crypto.** JWS signature + X.509 chain validation to the Apple root is
  security-critical; a maintained port of Apple's own library is safer than bespoke code.
- **Pure Rust, no OpenSSL/ring.** Its non-optional tree is RustCrypto only
  (`jsonwebtoken` with `rust_crypto`, `p256`/`p384`, `x509-cert`, `der`, `spki`, `sha2`,
  `rsa`, `base64`) — consistent with the "no OpenSSL" posture idevice already sets.
- **`default-features = false`** drops the network client (`reqwest`), OCSP, and `regex`:
  we verify offline only, so none are pulled.
- **License:** MIT (the crate and every transitive dep are on the allow-list).
- **Advisory:** it pulls `rsa`, which carries `RUSTSEC-2023-0071` (Marvin) — already
  ignored for idevice (same crate), so no new advisory surface.

The embedded trust anchor `gps/agent/assets/AppleRootCA-G3.cer` is Apple's PUBLIC root
CA (not a secret); it's git-tracked via a `!` exception to the global `*.cer` ignore.

## Supply-chain gates (CI-enforced)

- **`cargo-deny`** (`gps/deny.toml`): security advisories, a **permissive-only license
  allow-list**, dependency bans, and source trust (crates.io only).
- **`cargo-audit`**: RustSec vulnerability scan of `Cargo.lock`.
- Both run in `.github/workflows/gps-supply-chain.yml` on `gps/**` changes **and on a
  weekly schedule**, so advisories filed against unchanged dependencies are still
  caught.

## License policy

- Everything shipped must be **MIT-compatible** (the product is MIT). The allow-list
  lives in `gps/deny.toml`.
- Adding a license to the allow-list is a reviewed change with a one-line rationale.
- **No copyleft** (GPL/AGPL/LGPL-static) in shipped code — it would also conflict with
  the desktop distribution model (see steering: pymobiledevice3 is GPL and therefore
  not shipped, only used as a spike/reference).

## Adding or bumping a dependency

1. Prefer well-maintained, permissively licensed crates; be wary of typosquats.
2. Add with an **exact** version; run `cargo deny check` and `cargo audit` locally.
3. Commit the updated `Cargo.lock`; ensure CI (build/clippy/fmt/test + supply-chain)
   is green.
4. For a non-trivial or transitive-heavy addition, note why in the PR.
