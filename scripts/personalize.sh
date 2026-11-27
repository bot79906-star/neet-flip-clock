#!/usr/bin/env bash
# Fills in your GitHub username and name across the repo.
# Usage:  bash scripts/personalize.sh your-github-username "Your Full Name"
set -euo pipefail
[ $# -eq 2 ] || { echo 'Usage: bash scripts/personalize.sh <github-username> "<Your Name>"'; exit 1; }
cd "$(dirname "$0")/.."
USER_NAME="$1"; FULL_NAME="$2"

FILES=$(grep -rIl -e 'YOUR-USERNAME' -e 'YOUR NAME' . --exclude-dir=.git --exclude-dir=dist --exclude=personalize.sh || true)
for f in $FILES; do
  sed -i.bak -e "s/YOUR-USERNAME/${USER_NAME}/g" -e "s/YOUR NAME/${FULL_NAME}/g" "$f" && rm -f "$f.bak"
done
echo "Updated: $(echo $FILES | wc -w | tr -d ' ') files"
grep -rIn -e 'YOUR-USERNAME' -e 'YOUR NAME' . --exclude-dir=.git --exclude=personalize.sh || echo "No placeholders left."
