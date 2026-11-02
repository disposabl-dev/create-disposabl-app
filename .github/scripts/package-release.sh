#!/usr/bin/env bash
set -euo pipefail
[[ -f "packages/$PACKAGE/package.json" ]] || exit 0
platform=$PACKAGE
[[ "$PACKAGE" != sdk ]] || platform=typescript-sdk
bun run generate
bun run --cwd "packages/$PACKAGE" typecheck
name=$(node -p "require('./packages/$PACKAGE/package.json').name")
if ! previous=$(npm view "$name" version 2>/dev/null); then
  node .github/scripts/disposabl.mjs report "$platform" blocked 'Publish the package once and configure npm trusted publishing.'
  exit 0
fi
node .github/scripts/disposabl.mjs report "$platform" building
if GITHUB_TOKEN="$GH_TOKEN" npm_config_workspaces_update=false bun run --cwd "packages/$PACKAGE" release; then
  version=$(node -p "require('./packages/$PACKAGE/package.json').version")
  [[ "$version" != *development* ]] || version=$previous
  PUBLISHED_VERSION=$(npm view "$name@$version" version)
  export PUBLISHED_VERSION
  node .github/scripts/disposabl.mjs report "$platform" ready
else
  node .github/scripts/disposabl.mjs report "$platform" failed 'Package publication failed; check trusted publishing and the workflow log.'
  exit 1
fi
