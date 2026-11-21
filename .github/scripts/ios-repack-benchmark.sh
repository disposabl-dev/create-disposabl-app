#!/bin/bash
set -euo pipefail
root="$GITHUB_WORKSPACE/product"
evidence="$RUNNER_TEMP/ios-repack-evidence"
work="$RUNNER_TEMP/ios-repack"
mkdir -p "$evidence" "$work"
source_sha=8bfee3cfd096ae3ac261dfda3c051e05c2c48688
case "${1:?}" in
origin)
  [[ $(git -C "$root" rev-parse HEAD) == "$source_sha" ]]
  api="repos/$GITHUB_REPOSITORY/actions"
  gh api "$api/runs/44902643148" | jq -e --arg s "$source_sha" '.head_sha == $s and .run_attempt == 1' >/dev/null
  gh api "$api/jobs/136841582295" | jq -e --arg s "$source_sha" '.run_id == 44902643148 and .head_sha == $s and .conclusion == "success"' >/dev/null
  artifacts=$(gh api --paginate --slurp "$api/runs/44902643148/artifacts?per_page=100" | jq '[.[].artifacts[] | select(.name == "full-product-ios-1" and .expired == false)]')
  [[ $(jq length <<<"$artifacts") == 1 ]]
  id=$(jq -r '.[0].id' <<<"$artifacts")
  digest=$(jq -er '.[0].digest | select(test("^sha256:[a-f0-9]{64}$")) | sub("^sha256:"; "")' <<<"$artifacts")
  jq -n --arg sha "$source_sha" --arg id "$id" --arg digest "$digest" '{run:44902643148,job:136841582295,head_sha:$sha,artifact_id:$id,sha256:$digest}' > "$evidence/origin.json"
  gh api --allow-escape-sequences "$api/artifacts/$id/zip" > "$work/artifact.zip"
  printf '%s  %s\n' "$digest" "$work/artifact.zip" | shasum -a 256 --check
  mkdir "$work/outer" "$work/base"
  unzip -q "$work/artifact.zip" -d "$work/outer"
  [[ $(cat "$work/outer/source.sha") == "$source_sha" ]]
  archive=$(find "$work/outer" -name ios-simulator.zip -type f -print)
  [[ $(printf '%s\n' "$archive" | wc -l | tr -d ' ') == 1 && -f "$archive" ]]
  unzip -tq "$archive"
  unzip -q "$archive" -d "$work/base"
  app=$(find "$work/base" -maxdepth 1 -type d -name '*.app' -print)
  [[ $(printf '%s\n' "$app" | wc -l | tr -d ' ') == 1 && -d "$app" ]]
  printf '%s\n' "$app" > "$work/app-path"
  codesign --verify --deep --strict "$app"
  codesign -d --entitlements :- "$app" > "$work/entitlements.plist" 2> "$evidence/entitlements-log.txt"
  plutil -lint "$work/entitlements.plist"
  # Ad-hoc simulator builds may have an empty entitlements dictionary.
  plutil -convert json -o "$evidence/base-entitlements.json" "$work/entitlements.plist"
  ;;
repack)
  [[ $(git -C "$root" rev-parse HEAD) == "$source_sha" ]]
  app=$(cat "$work/app-path")
  cd "$root/apps/mobile"
  runtime=$(bun x --no-install expo-updates runtimeversion:resolve --platform ios --workflow managed | jq -er '.runtimeVersion | select(test("^[a-f0-9]{40,64}$"))')
  original=$(/usr/libexec/PlistBuddy -c 'Print EXUpdatesRuntimeVersion' "$app/Expo.plist")
  [[ "$original" != file:fingerprint ]] || original=$(cat "$app/EXUpdates.bundle/fingerprint")
  [[ "$runtime" == "$original" ]]
  printf '%s\n' "$runtime" > "$evidence/runtime.txt"
  bundle=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")
  test "$bundle" = dev.disposabl.mobile.preview
  /usr/libexec/PlistBuddy -c 'Print EXUpdatesRequestHeaders:expo-channel-name' "$app/Expo.plist" | grep -Fx benchmark
  exe=$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app/Info.plist")
  lipo -archs "$app/$exe" > "$evidence/architectures.txt"
  test -s "$app/main.jsbundle" && test -s "$app/EXUpdates.bundle/app.manifest"
  privacy=$(find "$app" -path '*SDWebImage*' -name PrivacyInfo.xcprivacy -print -quit)
  test -s "$privacy" && plutil -lint "$privacy"
  shasum -a 256 "$privacy" | awk '{print $1}' > "$work/privacy.hash"
  cp "$app/$exe" "$work/native-original"
  codesign --remove-signature "$work/native-original"
  (cd "$app" && find Frameworks -type f -perm -111 -exec shasum -a 256 {} + | sort) > "$work/framework.hashes"
  for marker in 'Discover Pilot A' 'Discover Pilot B'; do
    case "$marker" in *A) variant=A;; *B) variant=B;; esac
    git -C "$root" restore apps/mobile/src/features/studio/home.tsx
    python3 - "$root/apps/mobile/src/features/studio/home.tsx" "$marker" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); s=p.read_text(); old='<Screen title="Discover">'
assert s.count(old)==1
p.write_text(s.replace(old, '<Screen title="'+sys.argv[2]+'">'))
PY
    git -C "$root" diff -- apps/mobile/src/features/studio/home.tsx > "$evidence/variant-$variant.patch"
    actual=$(bun x --no-install expo-updates runtimeversion:resolve --platform ios --workflow managed | jq -er .runtimeVersion)
    [[ "$actual" == "$runtime" ]]
    dest="$work/repacked-$variant.app"
    /usr/bin/time -p bun x @expo/repack-app@0.10.4 --platform ios --source-app "$app" --output "$dest" --js-bundle-only --embed-bundle-assets
    test -s "$dest/main.jsbundle" && test -s "$dest/EXUpdates.bundle/app.manifest"
    shasum -a 256 "$dest/EXUpdates.bundle/app.manifest" | awk '{print $1}' > "$evidence/manifest-$variant.sha256"
    find "$dest" -path '*/assets/*' -type f | sed "s|^$dest/||" | sort > "$evidence/assets-$variant.txt"
    [[ $(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$dest/Info.plist") == "$bundle" ]]
    cmp "$app/Expo.plist" "$dest/Expo.plist"
    if [[ -f "$app/EXUpdates.bundle/fingerprint" ]]; then
      cmp "$app/EXUpdates.bundle/fingerprint" "$dest/EXUpdates.bundle/fingerprint"
    fi
    hermes="$(node -p 'require("node:path").dirname(require.resolve("hermes-compiler/package.json"))')/hermesc/osx-bin/hermesc"
    "$hermes" -dump-bytecode "$dest/main.jsbundle" | grep -F "$marker" > "$evidence/$variant-marker.txt"
    [[ $(lipo -archs "$dest/$exe") == "$(cat "$evidence/architectures.txt")" ]]
    cp "$dest/$exe" "$work/native-$variant"
    codesign --remove-signature "$work/native-$variant"
    cmp "$work/native-original" "$work/native-$variant"
    (cd "$dest" && find Frameworks -type f -perm -111 -exec shasum -a 256 {} + | sort) > "$work/framework-$variant.hashes"
    diff -u "$work/framework.hashes" "$work/framework-$variant.hashes"
    newprivacy=$(find "$dest" -path '*SDWebImage*' -name PrivacyInfo.xcprivacy -print -quit)
    [[ $(shasum -a 256 "$newprivacy" | awk '{print $1}') == "$(cat "$work/privacy.hash")" ]]
    codesign --force --sign - --entitlements "$work/entitlements.plist" "$dest"
    codesign --verify --deep --strict "$dest"
    codesign -d --entitlements :- "$dest" > "$work/entitlements-$variant.plist" 2>/dev/null
    plutil -convert json -o "$work/original-entitlements.json" "$work/entitlements.plist"
    plutil -convert json -o "$work/entitlements-$variant.json" "$work/entitlements-$variant.plist"
    diff -u <(jq -S . "$work/original-entitlements.json") <(jq -S . "$work/entitlements-$variant.json")
    shasum -a 256 "$dest/main.jsbundle" | awk '{print $1}' > "$evidence/js-$variant.sha256"
    ditto -c -k --sequesterRsrc --keepParent "$dest" "$evidence/repacked-$variant.zip"
    unzip -tq "$evidence/repacked-$variant.zip"
  done
  ! cmp -s "$evidence/js-A.sha256" "$evidence/js-B.sha256"
  shasum -a 256 "$evidence"/repacked-*.zip > "$evidence/archives.sha256"
  ;;
*) exit 2 ;;
esac
