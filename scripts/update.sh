#!/bin/zsh
# Pulls main and reinstalls the app.
set -euo pipefail
cd "$(dirname "$0")/.."

before=$(git rev-parse HEAD)
git pull --ff-only origin main
# Reinstall dependencies when they changed
if ! git diff --quiet "$before" HEAD -- package.json bun.lock || [[ ! -d node_modules ]]; then
  bun install
fi
bun run package
