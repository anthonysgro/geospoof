#!/usr/bin/env bash
set -euo pipefail

VERSION=$(node -p "require('./package.json').version")
DIST_DIR="dist"
OUT_DIR="web-ext-artifacts"
XPI_FILE="$OUT_DIR/geospoof-$VERSION.xpi"

if [ ! -d "$DIST_DIR" ] || [ -z "$(ls -A "$DIST_DIR")" ]; then
  echo "Error: $DIST_DIR does not exist or is empty. Run 'npm run build:prod' first."
  exit 1
fi

mkdir -p "$OUT_DIR"
rm -f "$XPI_FILE"
cd "$DIST_DIR"
zip -r "../$XPI_FILE" .
echo "Created $XPI_FILE"
