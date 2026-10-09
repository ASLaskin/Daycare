#!/bin/zsh
# Pulls a branch (main by default) and reinstalls the app.
# Usage: update.sh [remote] [ref] [local branch]
set -euo pipefail
# Find bun without the user's shell profile
export PATH="${BUN_INSTALL:-$HOME/.bun}/bin:$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
if ! command -v bun >/dev/null; then
  echo "bun not found. Install it from https://bun.sh" >&2
  exit 1
fi
cd "$(dirname "$0")/.."

# Wrapped so checkout cannot rewrite it mid run
main() {
  remote=${1:-origin}
  ref=${2:-main}
  branch=${3:-$ref}

  before=$(git rev-parse HEAD)
  git fetch "$remote" "$ref"
  if [[ "$(git branch --show-current)" != "$branch" ]]; then
    # Refuse to switch branches over local edits
    if ! git diff --quiet || ! git diff --cached --quiet; then
      echo "Local changes in $(pwd). Commit or stash them before switching to $branch." >&2
      exit 1
    fi
    if git show-ref --verify --quiet "refs/heads/$branch"; then
      git checkout "$branch"
    else
      git checkout -b "$branch" FETCH_HEAD
    fi
  fi
  git merge --ff-only FETCH_HEAD
  # Reinstall dependencies when they changed
  if ! git diff --quiet "$before" HEAD -- package.json bun.lock || [[ ! -d node_modules ]]; then
    bun install
  fi
  bun run package
}
main "$@"
