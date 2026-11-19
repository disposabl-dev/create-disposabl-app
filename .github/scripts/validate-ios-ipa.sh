#!/usr/bin/env bash
set -euo pipefail
app=${1:?App bundle required}
check() {
  local name=$1 actual=$2 expected=$3
  if [[ "$actual" != "$expected" ]]; then
    printf 'iOS IPA %s mismatch: expected "%s", got "%s"\n' "$name" "$expected" "$actual" >&2
    return 1
  fi
}
plist() {
  local file=$1 key=$2 value
  if ! value=$(/usr/libexec/PlistBuddy -c "Print :$key" "$file"); then
    printf 'iOS IPA missing or unreadable %s in %s\n' "$key" "$file" >&2
    return 1
  fi
  printf '%s' "$value"
}
actual=$(plist "$app/Info.plist" CFBundleIdentifier)
check identifier "$actual" "$IOS_IDENTIFIER"
actual=$(plist "$app/Info.plist" CFBundleShortVersionString)
check version "$actual" "$APP_VERSION"
actual=$(plist "$app/Info.plist" CFBundleVersion)
check build "$actual" "$DISPOSABL_IOS_BUILD_NUMBER"
configured=$(plist "$app/Expo.plist" EXUpdatesRuntimeVersion)
if [[ "$configured" == file:fingerprint ]]; then
  fingerprint="$app/EXUpdates.bundle/fingerprint"
  if [[ ! -f "$fingerprint" || ! -r "$fingerprint" ]]; then
    printf 'iOS IPA fingerprint missing or unreadable: %s\n' "$fingerprint" >&2
    exit 1
  fi
  configured=$(cat "$fingerprint")
fi
check runtime "$configured" "$RUNTIME"
actual=$(plist "$app/Expo.plist" EXUpdatesRequestHeaders:expo-channel-name)
check channel "$actual" "$CHANNEL"
