#!/usr/bin/env bash
set -euo pipefail
if [[ "$GITHUB_EVENT_NAME" == push ]]; then
  echo 'current=true' >> "$GITHUB_OUTPUT"
  echo 'CHANNEL=production' >> "$GITHUB_ENV"
  echo 'PRERELEASE=false' >> "$GITHUB_ENV"
  exit
fi
echo 'PRERELEASE=true' >> "$GITHUB_ENV"
pr=$(gh api "repos/$GH_REPO/commits/$SOURCE/pulls" --jq ".[] | select(.state == \"open\" and .head.sha == \"$SOURCE\" and .head.repo.full_name == \"$GH_REPO\") | .number" | head -1)
if [[ -z "$pr" ]]; then echo 'current=false' >> "$GITHUB_OUTPUT"; exit; fi
echo 'current=true' >> "$GITHUB_OUTPUT"
echo "CHANNEL=pr-$pr" >> "$GITHUB_ENV"
echo "PR=$pr" >> "$GITHUB_ENV"
