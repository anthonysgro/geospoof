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

# Retry the signing upload: AMO intermittently returns 500 Internal Server Error
# on the upload step (a server-side hiccup, distinct from a 4xx like a duplicate
# version). A few spaced retries ride out the transient failures instead of
# failing the whole release. Genuine errors (bad credentials, duplicate version)
# fail fast on every attempt and still surface after the retries are exhausted.
MAX_ATTEMPTS=3
attempt=1
until "${SIGN_CMD[@]}"; do
  status=$?
  if (( attempt >= MAX_ATTEMPTS )); then
    echo "Error: web-ext sign failed after ${attempt} attempt(s) (exit ${status})." >&2
    exit "$status"
  fi
  delay=$((attempt * 30))
  echo "web-ext sign failed (attempt ${attempt}/${MAX_ATTEMPTS}, exit ${status}). Retrying in ${delay}s..." >&2
  sleep "$delay"
  attempt=$((attempt + 1))
done
