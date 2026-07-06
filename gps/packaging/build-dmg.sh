#!/usr/bin/env bash
#
# Build the GeoSpoof GPS desktop deliverable: "GeoSpoof GPS.app" inside a Developer-ID-
# signed, notarized DMG (design §13e / §17 / §19).
#
# The app is a menu-bar-only Swift app (the CFBundleExecutable) that supervises the Rust
# agent, which rides along as an embedded helper at Contents/Helpers/. The iOS app
# remains the sole *location* control surface; the menu bar app is status + lifecycle
# (Pause/Resume, Open at Login, Quit).
#
# Runs end-to-end LOCALLY WITHOUT credentials (produces an unsigned DMG for inspection).
# Signing + notarization turn on when the relevant environment variables are present:
#
#   SIGN_IDENTITY      "Developer ID Application: Name (TEAMID)" — enables codesign.
#   ASC_API_KEY_PATH   path to the App Store Connect API key .p8 — enables notarization.
#   ASC_KEY_ID         App Store Connect key id (e.g. BXMZW4LMSP).
#   ASC_ISSUER_ID      App Store Connect issuer uuid.
#
# Optional:
#   VERSION            override the version string (default: workspace Cargo.toml).
#
set -euo pipefail

APP_NAME="GeoSpoof GPS"
BUNDLE_ID="com.moonloaf.geospoof.gps"
BIN_NAME="geospoof-gps-agent"      # Rust agent (embedded helper)
MENU_NAME="GeoSpoofGPSMenu"        # Swift menu-bar app (CFBundleExecutable)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GPS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
DESKTOP_DIR="$GPS_ROOT/desktop"    # SwiftPM package for the menu-bar app
TARGET_DIR="$GPS_ROOT/target"
OUT_DIR="$TARGET_DIR/pkg"

VERSION="${VERSION:-$(awk -F'"' '/^version = /{print $2; exit}' "$GPS_ROOT/Cargo.toml")}"
if [[ -z "$VERSION" ]]; then
  echo "error: could not determine VERSION" >&2
  exit 1
fi

echo "==> Packaging $APP_NAME v$VERSION"
rm -rf "$OUT_DIR"
mkdir -p "$OUT_DIR"

# ---------------------------------------------------------------------------
# 1. Build the release binary (universal when both arches are installed).
# ---------------------------------------------------------------------------
build_target() {
  local triple="$1"
  echo "==> cargo build --release --target $triple"
  cargo build --release --target "$triple" -p "$BIN_NAME" --manifest-path "$GPS_ROOT/Cargo.toml"
}

INSTALLED_TARGETS="$(rustup target list --installed 2>/dev/null || true)"
BIN_UNIVERSAL="$OUT_DIR/$BIN_NAME"

if grep -q '^aarch64-apple-darwin$' <<<"$INSTALLED_TARGETS" \
  && grep -q '^x86_64-apple-darwin$' <<<"$INSTALLED_TARGETS"; then
  build_target aarch64-apple-darwin
  build_target x86_64-apple-darwin
  echo "==> lipo -> universal binary"
  lipo -create \
    "$TARGET_DIR/aarch64-apple-darwin/release/$BIN_NAME" \
    "$TARGET_DIR/x86_64-apple-darwin/release/$BIN_NAME" \
    -output "$BIN_UNIVERSAL"
else
  echo "==> (only host arch installed; building a single-arch agent binary)"
  cargo build --release -p "$BIN_NAME" --manifest-path "$GPS_ROOT/Cargo.toml"
  cp "$TARGET_DIR/release/$BIN_NAME" "$BIN_UNIVERSAL"
fi
lipo -info "$BIN_UNIVERSAL" || true

# Build the Swift menu-bar app (universal — the Swift toolchain ships both arch SDKs).
echo "==> swift build (menu-bar app, universal)"
swift build --package-path "$DESKTOP_DIR" -c release --arch arm64 --arch x86_64
MENU_BIN="$(swift build --package-path "$DESKTOP_DIR" -c release --arch arm64 --arch x86_64 --show-bin-path)/$MENU_NAME"
if [[ ! -x "$MENU_BIN" ]]; then
  echo "error: menu-bar binary not found at $MENU_BIN" >&2
  exit 1
fi
lipo -info "$MENU_BIN" || true

# ---------------------------------------------------------------------------
# 2. Assemble GeoSpoof GPS.app
#    Contents/MacOS/<menu app>  — the CFBundleExecutable (the UI)
#    Contents/Helpers/<agent>   — the embedded worker the menu app supervises
# ---------------------------------------------------------------------------
APP="$OUT_DIR/$APP_NAME.app"
echo "==> Assembling $APP_NAME.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Helpers" "$APP/Contents/Resources"
sed "s/__VERSION__/$VERSION/g" "$SCRIPT_DIR/Info.plist.in" > "$APP/Contents/Info.plist"
cp "$MENU_BIN" "$APP/Contents/MacOS/$MENU_NAME"
chmod +x "$APP/Contents/MacOS/$MENU_NAME"
cp "$BIN_UNIVERSAL" "$APP/Contents/Helpers/$BIN_NAME"
chmod +x "$APP/Contents/Helpers/$BIN_NAME"
printf 'APPL????' > "$APP/Contents/PkgInfo"

# App icon (Finder / DMG). Generated from the committed 1024px logo into an .icns so it's
# reproducible in CI. Absent logo just means the generic app icon (menu-bar glyph is an
# SF Symbol either way, so the running app always looks right).
ICON_SRC="$DESKTOP_DIR/geospoof-gps-logo.png"
if [[ -f "$ICON_SRC" ]]; then
  echo "==> Generating AppIcon.icns"
  ICONSET="$OUT_DIR/AppIcon.iconset"
  rm -rf "$ICONSET"; mkdir -p "$ICONSET"
  for sz in 16 32 128 256 512; do
    sips -z "$sz" "$sz" "$ICON_SRC" --out "$ICONSET/icon_${sz}x${sz}.png" >/dev/null
    d=$((sz * 2))
    sips -z "$d" "$d" "$ICON_SRC" --out "$ICONSET/icon_${sz}x${sz}@2x.png" >/dev/null
  done
  iconutil -c icns "$ICONSET" -o "$APP/Contents/Resources/AppIcon.icns"
  rm -rf "$ICONSET"
else
  echo "==> (no logo at $ICON_SRC — skipping app icon)"
fi

# Menu-bar glyph is a state-aware SF Symbol rendered by the app (no asset needed) — a full
# logo shrunk to menu-bar size looked muddy, so the logo is used only for the app icon.

# ---------------------------------------------------------------------------
# 3. Code sign (Developer ID + hardened runtime) — only if an identity is set.
# ---------------------------------------------------------------------------
if [[ -n "${SIGN_IDENTITY:-}" ]]; then
  echo "==> codesign (Developer ID, hardened runtime) — inside-out"
  # Sign the embedded helper FIRST, then the outer app (which seals the main executable
  # and the nested helper). Both get the hardened runtime + entitlements + a timestamp.
  codesign --force --timestamp --options runtime \
    --entitlements "$SCRIPT_DIR/entitlements.plist" \
    --sign "$SIGN_IDENTITY" \
    "$APP/Contents/Helpers/$BIN_NAME"
  codesign --force --timestamp --options runtime \
    --entitlements "$SCRIPT_DIR/entitlements.plist" \
    --sign "$SIGN_IDENTITY" \
    "$APP"
  codesign --verify --strict --verbose=2 "$APP"
else
  echo "==> (SIGN_IDENTITY unset — leaving the app unsigned)"
fi

# ---------------------------------------------------------------------------
# 4. Notarize + staple the .app — only if App Store Connect creds are set.
#    (Notarize the app before wrapping it in the DMG, then also staple the DMG.)
# ---------------------------------------------------------------------------
# Submit an artifact to the Apple notary service and wait for the verdict. notarytool
# accepts a .zip / .dmg / .pkg upload envelope; STAPLING is done separately against the
# real bundle (`stapler` cannot staple a .zip).
notarize_submit() {
  local path="$1"
  echo "==> notarytool submit $(basename "$path")"
  xcrun notarytool submit "$path" \
    --key "$ASC_API_KEY_PATH" \
    --key-id "$ASC_KEY_ID" \
    --issuer "$ASC_ISSUER_ID" \
    --wait
}

CAN_NOTARIZE=0
if [[ -n "${SIGN_IDENTITY:-}" && -n "${ASC_API_KEY_PATH:-}" \
  && -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" ]]; then
  CAN_NOTARIZE=1
  # Zip the .app only as the upload envelope, then staple the .app BUNDLE itself so the
  # ticket travels with it inside the DMG.
  ZIP="$OUT_DIR/$BIN_NAME-notarize.zip"
  /usr/bin/ditto -c -k --keepParent "$APP" "$ZIP"
  notarize_submit "$ZIP"
  xcrun stapler staple "$APP"
  rm -f "$ZIP"
else
  echo "==> (notarization creds unset — skipping notarize/staple of the app)"
fi

# ---------------------------------------------------------------------------
# 5. Build the DMG (drag-to-Applications layout).
# ---------------------------------------------------------------------------
DMG="$OUT_DIR/GeoSpoof-GPS-v$VERSION.dmg"
STAGE="$OUT_DIR/dmg-stage"
echo "==> Building DMG"
rm -rf "$STAGE"
mkdir -p "$STAGE"
cp -R "$APP" "$STAGE/"
ln -s /Applications "$STAGE/Applications"
hdiutil create -volname "$APP_NAME" -srcfolder "$STAGE" -ov -format UDZO "$DMG"
rm -rf "$STAGE"

if [[ -n "${SIGN_IDENTITY:-}" ]]; then
  echo "==> codesign DMG"
  codesign --force --timestamp --sign "$SIGN_IDENTITY" "$DMG"
fi
if [[ "$CAN_NOTARIZE" == "1" ]]; then
  # A DMG can be stapled directly (unlike a zip).
  notarize_submit "$DMG"
  xcrun stapler staple "$DMG"
fi

echo ""
echo "==> Done: $DMG"
[[ -n "${SIGN_IDENTITY:-}" ]] || echo "    (UNSIGNED — for local inspection only)"
