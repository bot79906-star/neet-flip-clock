#!/usr/bin/env bash
# Builds the extension and zips it for a GitHub Release.
set -euo pipefail
cd "$(dirname "$0")/.."

python3 source/build.py >/dev/null
VERSION=$(python3 -c "import json;print(json.load(open('extension/manifest.json'))['version'])")
OUT="dist/neet-flip-clock-v${VERSION}.zip"

mkdir -p dist
rm -f "$OUT"
( cd extension && zip -r -q "../$OUT" . -x "*.DS_Store" )
echo "Created $OUT"
