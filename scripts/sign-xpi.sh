#!/usr/bin/env bash
set -euo pipefail

DIST_DIR="dist"

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

npx web-ext sign \
  --source-dir "$DIST_DIR" \
  --artifacts-dir web-ext-artifacts \
  --channel unlisted \
  --api-key "$AMO_JWT_ISSUER" \
  --api-secret "$AMO_JWT_SECRET"
