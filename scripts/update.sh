#!/bin/zsh
# Pulls main and reinstalls; Settings > Update runs it.
set -euo pipefail
cd "$(dirname "$0")/.."

before=$(git rev-parse HEAD)
git pull --ff-only origin main
# Reinstall only when deps changed.
if ! git diff --quiet "$before" HEAD -- package.json bun.lock || [[ ! -d node_modules/node-pty ]]; then
  bun install
  bun run rebuild
fi
bun run package
