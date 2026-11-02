#!/usr/bin/env bash
set -euo pipefail
test "$(gh api "repos/$GH_REPO/$SOURCE_PATH" --jq 'if has("head") then (if .state == "open" then .head.sha else "closed" end) else .object.sha end')" = "$SOURCE"
if [[ "$CHANNEL" == production ]]; then
  : "${ANDROID_KEYSTORE_BASE64:?}" "${ANDROID_KEYSTORE_PASSWORD:?}" "${ANDROID_KEY_ALIAS:?}" "${ANDROID_KEY_PASSWORD:?}"
  export ANDROID_KEYSTORE_PATH="$RUNNER_TEMP/android-release.jks"
  trap 'rm -f "$ANDROID_KEYSTORE_PATH"' EXIT
  (umask 077; printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$ANDROID_KEYSTORE_PATH")
fi
bun x --no-install expo prebuild --platform android --no-install
test "$(bun x --no-install expo-updates runtimeversion:resolve --platform android --workflow managed | jq -er .runtimeVersion)" = "$RUNTIME"
(cd android && ./gradlew :app:assembleRelease --no-daemon --build-cache)
apk=android/app/build/outputs/apk/release/app-release.apk
test "$(unzip -p "$apk" assets/fingerprint)" = "$RUNTIME"
test "$(bun x --no-install expo-updates runtimeversion:resolve --platform android --workflow managed | jq -er .runtimeVersion)" = "$RUNTIME"
mkdir -p ../../dist/release
cp "$apk" ../../dist/release/android.apk
jq --arg sha "$(sha256sum "$apk" | cut -d' ' -f1)" '. + {sha256: $sha, action: "build"}' <<< "$MANIFEST" > ../../dist/release/android.json
