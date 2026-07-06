#!/usr/bin/env bash
#
# Build the GeoSpoof GPS desktop deliverable: a near-headless background agent packaged
# as "GeoSpoof GPS.app" inside a Developer-ID-signed, notarized DMG (design §13e / §17).
#
# The app bundles the Rust agent binary; double-clicking it (or running
# `install-service`) registers a per-user LaunchAgent that runs the agent. The iOS app
# remains the sole control surface.
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
BIN_NAME="geospoof-gps-agent"

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GPS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
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
  echo "==> (only host arch installed; building a single-arch binary)"
  cargo build --release -p "$BIN_NAME" --manifest-path "$GPS_ROOT/Cargo.toml"
  cp "$TARGET_DIR/release/$BIN_NAME" "$BIN_UNIVERSAL"
fi
lipo -info "$BIN_UNIVERSAL" || true

# ---------------------------------------------------------------------------
# 2. Assemble GeoSpoof GPS.app
# ---------------------------------------------------------------------------
APP="$OUT_DIR/$APP_NAME.app"
echo "==> Assembling $APP_NAME.app"
mkdir -p "$APP/Contents/MacOS" "$APP/Contents/Resources"
sed "s/__VERSION__/$VERSION/g" "$SCRIPT_DIR/Info.plist.in" > "$APP/Contents/Info.plist"
cp "$BIN_UNIVERSAL" "$APP/Contents/MacOS/$BIN_NAME"
chmod +x "$APP/Contents/MacOS/$BIN_NAME"
printf 'APPL????' > "$APP/Contents/PkgInfo"

# ---------------------------------------------------------------------------
# 3. Code sign (Developer ID + hardened runtime) — only if an identity is set.
# ---------------------------------------------------------------------------
if [[ -n "${SIGN_IDENTITY:-}" ]]; then
  echo "==> codesign (Developer ID, hardened runtime)"
  codesign --force --timestamp --options runtime \
    --entitlements "$SCRIPT_DIR/entitlements.plist" \
    --sign "$SIGN_IDENTITY" \
    "$APP/Contents/MacOS/$BIN_NAME"
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
notarize() {
  local path="$1"
  echo "==> notarytool submit $(basename "$path")"
  xcrun notarytool submit "$path" \
    --key "$ASC_API_KEY_PATH" \
    --key-id "$ASC_KEY_ID" \
    --issuer "$ASC_ISSUER_ID" \
    --wait
  xcrun stapler staple "$path"
}

CAN_NOTARIZE=0
if [[ -n "${SIGN_IDENTITY:-}" && -n "${ASC_API_KEY_PATH:-}" \
  && -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" ]]; then
  CAN_NOTARIZE=1
  ZIP="$OUT_DIR/$BIN_NAME-notarize.zip"
  /usr/bin/ditto -c -k --keepParent "$APP" "$ZIP"
  notarize "$ZIP"
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
  notarize "$DMG"
fi

echo ""
echo "==> Done: $DMG"
[[ -n "${SIGN_IDENTITY:-}" ]] || echo "    (UNSIGNED — for local inspection only)"
