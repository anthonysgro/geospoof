#!/usr/bin/env bash
set -euo pipefail

GECKO_ID="{a8f7e9c2-4d3b-4a1e-9f8c-7b6d5e4a3c2b}"

VERSION="${1:-}"
DOWNLOAD_URL="${2:-}"
OUTPUT_PATH="${3:-update.json}"

if [ -z "$VERSION" ] || [ -z "$DOWNLOAD_URL" ]; then
  echo "Usage: $0 <version> <download_url> [output_path]" >&2
  echo "  version       — Semver version string (e.g. \"1.14.0\")" >&2
  echo "  download_url  — Full URL to the signed .xpi on GitHub Releases" >&2
  echo "  output_path   — Output file path (default: \"update.json\")" >&2
  exit 1
fi

jq -n \
  --arg id "$GECKO_ID" \
  --arg version "$VERSION" \
  --arg url "$DOWNLOAD_URL" \
  '{
    addons: {
      ($id): {
        updates: [
          {
            version: $version,
            update_link: $url
          }
        ]
      }
    }
  }' > "$OUTPUT_PATH"
