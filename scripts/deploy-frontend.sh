#!/bin/bash
#==========================================================
# Attica Gold Callcenter — Clean Frontend Deployment
#==========================================================
set -e

PROJECT_DIR="${ATTICA_PROJECT_DIR:-$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)}"
DEPLOY_DIR="${ATTICA_DEPLOY_DIR:-/var/www/html}"

echo "=== [1/3] Compiling Frontend Assets ==="
cd "$PROJECT_DIR"
npm run build

echo "=== [2/3] Keeping Recent Hashed Assets ==="
# Do not delete all hashed assets during deploy. Already-open browsers may still
# request the previous route chunks, and removing them causes Section Error /
# ChunkLoadError until every user hard-refreshes.
mkdir -p "$DEPLOY_DIR/assets"
find "$DEPLOY_DIR/assets" -type f -mtime +14 -delete

echo "=== [3/3] Copying New Assets to Web Root ==="
cp -r dist/assets/* "$DEPLOY_DIR/assets/"
find dist -maxdepth 1 -type f -exec cp {} "$DEPLOY_DIR/" \;

# Ensure the web server can read everything
chmod -R 755 "$DEPLOY_DIR"

echo "=== Static Deployment Successful ==="
