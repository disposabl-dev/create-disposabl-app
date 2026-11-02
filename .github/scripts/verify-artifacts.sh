#!/usr/bin/env bash
set -euo pipefail
check_source() { test "$(gh api "repos/$GH_REPO/$SOURCE_PATH" --jq 'if has("head") then (if .state == "open" then .head.sha else "closed" end) else .object.sha end')" = "$SOURCE"; }
check_source
for file in dist/release/*; do test -f "$file"; test -s "$file"; done
case "$PLATFORM" in
  android) artifact=android.apk; [[ "$CHANNEL" != production ]] || artifact=android.aab; test -s "dist/release/$artifact"; test -s dist/release/android.json ;;
  ios) test -s dist/release/ios.ipa; test -s dist/release/ios.json ;;
  linux) compgen -G 'dist/release/*.deb' > /dev/null; compgen -G 'dist/release/*.rpm' > /dev/null ;;
  windows) compgen -G 'dist/release/*.exe' > /dev/null; compgen -G 'dist/release/*.nupkg' > /dev/null; test -s dist/release/RELEASES ;;
  macos) compgen -G 'dist/release/*.dmg' > /dev/null ;;
  *) exit 1 ;;
esac
