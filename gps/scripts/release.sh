#!/usr/bin/env bash
#
# Cut a GeoSpoof GPS release with one command — the cargo equivalent of the extension's
# `npm version patch && git push --tags`.
#
# It bumps the workspace version, syncs Cargo.lock, commits, creates a `gps-v<version>`
# tag, and pushes. The `gps-v*` tag triggers .github/workflows/release-gps-macos-dmg.yml,
# which builds + signs + notarizes the DMG and publishes a GeoSpoof GPS release (a
# SEPARATE track from the extension's `v*` releases).
#
# Usage (run from anywhere in the repo):
#   gps/scripts/release.sh patch          # 0.1.0 -> 0.1.1
#   gps/scripts/release.sh minor          # 0.1.0 -> 0.2.0
#   gps/scripts/release.sh major          # 0.1.0 -> 1.0.0
#   gps/scripts/release.sh 0.4.2          # explicit version
#   gps/scripts/release.sh patch --no-push  # commit + tag locally, don't push yet
#
# macOS/BSD sed is assumed (this is a local dev helper on the Mac).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GPS_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
CARGO_TOML="$GPS_ROOT/Cargo.toml"

BUMP="${1:-}"
PUSH=1
[ "${2:-}" = "--no-push" ] && PUSH=0
if [ -z "$BUMP" ]; then
  echo "usage: gps/scripts/release.sh patch|minor|major|<x.y.z> [--no-push]" >&2
  exit 1
fi

# Guard rails: release from a clean `main` only, so the tag captures exactly the bump.
BRANCH=$(git -C "$GPS_ROOT" rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "main" ]; then
  echo "refusing: not on main (currently on '$BRANCH')" >&2
  exit 1
fi
if [ -n "$(git -C "$GPS_ROOT" status --porcelain)" ]; then
  echo "refusing: working tree is not clean — commit or stash first" >&2
  exit 1
fi

CURRENT=$(awk -F'"' '/^version = /{print $2; exit}' "$CARGO_TOML")
case "$BUMP" in
  patch|minor|major)
    IFS=. read -r MA MI PA <<<"$CURRENT"
    case "$BUMP" in
      patch) PA=$((PA + 1)) ;;
      minor) MI=$((MI + 1)); PA=0 ;;
      major) MA=$((MA + 1)); MI=0; PA=0 ;;
    esac
    NEW="$MA.$MI.$PA"
    ;;
  [0-9]*.[0-9]*.[0-9]*) NEW="$BUMP" ;;
  *) echo "invalid bump/version: '$BUMP'" >&2; exit 1 ;;
esac

TAG="gps-v$NEW"
if git -C "$GPS_ROOT" rev-parse "$TAG" >/dev/null 2>&1; then
  echo "refusing: tag $TAG already exists" >&2
  exit 1
fi

echo "==> GeoSpoof GPS $CURRENT -> $NEW  (tag $TAG)"

# Bump the [workspace.package] version (the only column-0 `version = ` line).
sed -i '' -E "s/^version = \"[^\"]*\"/version = \"$NEW\"/" "$CARGO_TOML"

# Sync Cargo.lock so the three internal crate versions match (avoids a --locked CI miss).
( cd "$GPS_ROOT" && cargo update --workspace >/dev/null 2>&1 || cargo check --workspace >/dev/null )

git -C "$GPS_ROOT" add Cargo.toml Cargo.lock
git -C "$GPS_ROOT" commit -m "gps: release $TAG"
git -C "$GPS_ROOT" tag "$TAG"
echo "==> committed + tagged $TAG"

if [ "$PUSH" = "1" ]; then
  git -C "$GPS_ROOT" push origin main
  git -C "$GPS_ROOT" push origin "$TAG"
  echo "==> pushed main + $TAG — CI will build, sign, notarize, and publish the DMG."
else
  echo "==> not pushed (--no-push). When ready:"
  echo "      git push origin main && git push origin $TAG"
fi
