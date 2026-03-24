#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="dist"
CHANNEL="unlisted"
SOURCE=""

# Parse arguments
while [[ $# -gt 0 ]]; do
  case "$1" in
    --channel)
      CHANNEL="$2"
      shift 2
      ;;
    --source)
      SOURCE="$2"
      shift 2
      ;;
    *)
      echo "Error: Unknown argument '$1'" >&2
      exit 1
      ;;
  esac
done

# Validate channel value
if [[ "$CHANNEL" != "unlisted" && "$CHANNEL" != "listed" ]]; then
  echo "Error: Invalid channel '$CHANNEL'. Must be 'unlisted' or 'listed'." >&2
  exit 1
fi

# When listed, require --source and validate the file exists
if [[ "$CHANNEL" == "listed" ]]; then
  if [[ -z "$SOURCE" ]]; then
    echo "Error: --source is required for listed channel. Source code upload is required for listed submissions." >&2
    exit 1
  fi
  if [[ ! -f "$SOURCE" ]]; then
    echo "Error: Source file '$SOURCE' does not exist." >&2
    exit 1
  fi
fi

# Validate AMO credentials are set and non-empty
if [ -z "${AMO_JWT_ISSUER:-}" ]; then
  echo "Error: AMO_JWT_ISSUER is not set. Set it in your environment or .env file." >&2
  exit 1
fi

if [ -z "${AMO_JWT_SECRET:-}" ]; then
  echo "Error: AMO_JWT_SECRET is not set. Set it in your environment or .env file." >&2
  exit 1
fi

# Validate dist/ exists and is non-empty
if [ ! -d "$DIST_DIR" ] || [ -z "$(ls -A "$DIST_DIR")" ]; then
  echo "Error: $DIST_DIR does not exist or is empty. Run 'npm run build:firefox' first." >&2
  exit 1
fi

# Build web-ext sign command
SIGN_CMD=(npx web-ext sign \
  --source-dir "$DIST_DIR" \
  --artifacts-dir web-ext-artifacts \
  --channel "$CHANNEL" \
  --api-key "$AMO_JWT_ISSUER" \
  --api-secret "$AMO_JWT_SECRET")

if [[ "$CHANNEL" == "listed" && -n "$SOURCE" ]]; then
  SIGN_CMD+=(--upload-source-code "$SOURCE")
fi

"${SIGN_CMD[@]}"
