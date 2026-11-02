#!/usr/bin/env bash
set -euo pipefail
mkdir -p dist/release
gh release download "$TAG" --pattern android.apk --dir dist/release
echo "$SHA  dist/release/android.apk" | sha256sum --check
cd apps/mobile
bun x --no-install expo export --platform android --output-dir dist/update
test "$(bun x --no-install expo-updates runtimeversion:resolve --platform android --workflow managed | jq -er .runtimeVersion)" = "$RUNTIME"
test "$(gh api "repos/$GH_REPO/$SOURCE_PATH" --jq 'if has("head") then (if .state == "open" then .head.sha else "closed" end) else .object.sha end')" = "$SOURCE"
bun x "$EAS_CLI" update --platform android --channel "$CHANNEL" --environment "$EAS_ENVIRONMENT" --skip-bundler --input-dir dist/update --message "$SOURCE" --non-interactive
jq --arg sha "$SHA" '. + {sha256: $sha, action: "update"}' <<< "$MANIFEST" > ../../dist/release/android.json
