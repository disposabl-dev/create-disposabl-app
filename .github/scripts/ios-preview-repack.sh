#!/bin/bash
set -euo pipefail
work="$RUNNER_TEMP/ios-preview-repack"
cache="$RUNNER_TEMP/ios-preview-native-cache"
out="$GITHUB_WORKSPACE/dist/apple"
mkdir -p "$work" "$out"
check_source() {
  local current
  current=$(gh api "repos/$GH_REPO/$SOURCE_PATH" --jq 'if .state == "open" then .head.sha else "closed" end')
  [[ "$current" == "$SOURCE" ]]
}
identity() {
  : "${EXPO_PROJECT_ID:?}" "${CHANNEL:?}" "${PR_NUMBER:?}" "${CONVEX_URL:?}" "${PUBLIC_SITE_URL:?}" "${NATIVE_INPUT_HASH:?}"
  local config runtime bundle toolchain config_hash version build android_version
  config=$(bun x --no-install expo config --json)
  jq -e --arg project "$EXPO_PROJECT_ID" '.extra.eas.projectId == $project' <<<"$config" >/dev/null
  bundle=$(jq -er '.ios.bundleIdentifier | select(type == "string" and length > 0)' <<<"$config")
  version=$(jq -er '.ios.version // .version | select(type == "string" and length > 0)' <<<"$config")
  build=$(jq -er '.ios.buildNumber | select(type == "string" and length > 0)' <<<"$config")
  android_version=$(jq -er '.android.versionCode | select(type == "number" and . == floor and . >= 1 and . <= 2100000000)' <<<"$config")
  printf '%s\n' "$build" > "$work/current-build"
  printf '%s\n' "$android_version" > "$work/current-android-version"
  config_hash=$(jq -S -c 'del(.ios.buildNumber, .android.versionCode)' <<<"$config" | shasum -a 256 | cut -d' ' -f1)
  runtime=$(bun x --no-install expo-updates runtimeversion:resolve --platform ios --workflow managed | jq -er 'select(.fingerprintSources != null) | .runtimeVersion | select(test("^[a-f0-9]{40,64}$"))')
  toolchain=$({ xcodebuild -version; xcrun --sdk iphonesimulator --show-sdk-build-version; uname -m; } | shasum -a 256 | cut -d' ' -f1)
  jq -n --arg repo "$GH_REPO" --arg pr "$PR_NUMBER" --arg project "$EXPO_PROJECT_ID" --arg channel "$CHANNEL" --arg bundle "$bundle" --arg version "$version" --arg config "$config_hash" --arg native_inputs "$NATIVE_INPUT_HASH" --arg runtime "$runtime" --arg sdk "$toolchain" --arg backend "$CONVEX_URL" --arg site "$PUBLIC_SITE_URL" --arg convexsite "${CONVEX_SITE_URL:-}" --arg publicbackend "${EXPO_PUBLIC_CONVEX_URL:-}" --arg publicsite "${EXPO_PUBLIC_CONVEX_SITE_URL:-}" '{repo:$repo,pr:$pr,project:$project,channel:$channel,bundle:$bundle,version:$version,config_sha256:$config,native_inputs:$native_inputs,runtime:$runtime,toolchain:$sdk,backend:$backend,site:$site,convex_site:$convexsite,public_backend:$publicbackend,public_site:$publicsite}' | jq -S . > "$work/identity.json"
}
check_app_identity() {
  local app=$1 build=$2
  [[ $(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist") == "$(jq -r .bundle "$work/identity.json")" ]]
  [[ $(/usr/libexec/PlistBuddy -c 'Print CFBundleShortVersionString' "$app/Info.plist") == "$(jq -r .version "$work/identity.json")" ]]
  [[ $(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$app/Info.plist") == "$build" ]]
  [[ $(/usr/libexec/PlistBuddy -c 'Print EXUpdatesRequestHeaders:expo-channel-name' "$app/Expo.plist") == "$CHANNEL" ]]
}
privacy_inventory() {
  local app=$1 output=$2 path
  : > "$output"
  while IFS= read -r path; do
    plutil -lint "$app/$path" >/dev/null
    printf '%s  %s\n' "$(shasum -a 256 "$app/$path" | cut -d' ' -f1)" "$path" >> "$output"
  done < <(cd "$app" && find . -type f -name PrivacyInfo.xcprivacy -print | LC_ALL=C sort)
}
case "${1:?}" in
  source)
    check_source
    ;;
  identity)
    check_source
    identity
    key=$(shasum -a 256 "$work/identity.json" | cut -d' ' -f1)
    echo "key=ios-preview-native-v2-$key" >> "$GITHUB_OUTPUT"
    ;;
  manifest)
    check_source
    test -s "$work/identity.json" && test -s "$work/current-build" && test -s "$work/current-android-version"
    archive="$out/ios-simulator.zip"
    test -s "$archive"
    mkdir "$work/native"
    unzip -tq "$archive"
    unzip -q "$archive" -d "$work/native"
    native=()
    while IFS= read -r item; do native+=("$item"); done < <(find "$work/native" -maxdepth 1 -type d -name '*.app')
    [[ ${#native[@]} == 1 ]]
    app=${native[0]}
    [[ -d "$app/Frameworks" ]]
    [[ -z $(find "$app" -mindepth 1 -type d \( -name '*.app' -o -name '*.appex' \) -print -quit) ]]
    codesign --verify --deep --strict "$app"
    codesign -dv "$app" 2>&1 | grep -q 'Signature=adhoc'
    check_app_identity "$app" "$(cat "$work/current-build")"
    exe=$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app/Info.plist")
    arches=$(lipo -archs "$app/$exe")
    [[ " $arches " == *' arm64 '* && " $arches " == *' x86_64 '* ]]
    [[ $(jq -er .ios.buildNumber "$app/EXConstants.bundle/app.config") == "$(cat "$work/current-build")" ]]
    [[ $(jq -er .android.versionCode "$app/EXConstants.bundle/app.config") == "$(cat "$work/current-android-version")" ]]
    embedded=$(/usr/libexec/PlistBuddy -c 'Print EXUpdatesRuntimeVersion' "$app/Expo.plist")
    [[ "$embedded" != file:fingerprint ]] || embedded=$(cat "$app/EXUpdates.bundle/fingerprint")
    [[ "$embedded" == "$(jq -r .runtime "$work/identity.json")" ]]
    privacy_inventory "$app" "$work/native-privacy.txt"
    digest=$(shasum -a 256 "$archive" | cut -d' ' -f1)
    check_source
    rm -rf "$cache"
    mkdir -p "$cache"
    jq --arg sha "$SOURCE" --arg digest "$digest" --arg run "$GITHUB_RUN_ID" --arg build "$(cat "$work/current-build")" '. + {source_sha:$sha, archive_sha256:$digest, source_run:$run, build:$build, method:"native"}' "$work/identity.json" > "$cache/ios-simulator-provenance.json"
    cp "$archive" "$cache/ios-simulator.zip"
    python3 "$GITHUB_WORKSPACE/.github/scripts/ios-preview-cache-validate.py" "$work/identity.json" "$cache/ios-simulator-provenance.json" "$cache/ios-simulator.zip"
    ;;
  repack)
    check_source
    test -s "$work/identity.json" && test -s "$work/current-build" && test -s "$work/current-android-version"
    m="$cache/ios-simulator-provenance.json"
    archive="$cache/ios-simulator.zip"
    python3 "$GITHUB_WORKSPACE/.github/scripts/ios-preview-cache-validate.py" "$work/identity.json" "$m" "$archive"
    mkdir "$work/extracted"
    unzip -tq "$archive"
    unzip -q "$archive" -d "$work/extracted"
    apps=()
    while IFS= read -r app; do apps+=("$app"); done < <(find "$work/extracted" -maxdepth 1 -type d -name '*.app')
    [[ ${#apps[@]} == 1 ]]
    app=${apps[0]}
    codesign --verify --deep --strict "$app"
    codesign -dv "$app" 2>&1 | grep -q 'Signature=adhoc'
    bundle=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")
    check_app_identity "$app" "$(jq -r .build "$m")"
    exe=$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app/Info.plist")
    arches=$(lipo -archs "$app/$exe")
    [[ " $arches " == *' arm64 '* && " $arches " == *' x86_64 '* ]]
    original=$(/usr/libexec/PlistBuddy -c 'Print EXUpdatesRuntimeVersion' "$app/Expo.plist")
    [[ "$original" != file:fingerprint ]] || original=$(cat "$app/EXUpdates.bundle/fingerprint")
    [[ "$original" == "$(jq -r .runtime "$work/identity.json")" ]]
    privacy_inventory "$app" "$work/privacy-before.txt"
    codesign -d --entitlements :- "$app" > "$work/entitlements.plist" 2>/dev/null
    plutil -lint "$work/entitlements.plist"
    check_source
    mkdir "$work/result"
    result="$work/result/$(basename "$app")"
    env -u GH_TOKEN -u EXPO_TOKEN EXPO_NO_TELEMETRY=1 DO_NOT_TRACK=1 bun x @expo/repack-app@0.10.4 --platform ios --source-app "$app" --output "$result" --js-bundle-only --embed-bundle-assets
    python3 "$GITHUB_WORKSPACE/.github/scripts/ios-preview-build-number.py" "$app" "$result" \
      "$(cat "$work/current-build")" "$(cat "$work/current-android-version")"
    check_app_identity "$result" "$(cat "$work/current-build")"
    cmp "$app/Expo.plist" "$result/Expo.plist"
    if [[ -f "$app/EXUpdates.bundle/fingerprint" ]]; then
      cmp "$app/EXUpdates.bundle/fingerprint" "$result/EXUpdates.bundle/fingerprint"
    else
      test ! -e "$result/EXUpdates.bundle/fingerprint"
    fi
    [[ $(lipo -archs "$result/$exe") == "$arches" ]]
    cp "$app/$exe" "$work/old-exe" && cp "$result/$exe" "$work/new-exe"
    codesign --remove-signature "$work/old-exe" && codesign --remove-signature "$work/new-exe"
    cmp "$work/old-exe" "$work/new-exe"
    (cd "$app" && find Frameworks -type f -perm -111 -exec shasum -a 256 {} + | LC_ALL=C sort) > "$work/frameworks-before"
    (cd "$result" && find Frameworks -type f -perm -111 -exec shasum -a 256 {} + | LC_ALL=C sort) > "$work/frameworks-after"
    diff -u "$work/frameworks-before" "$work/frameworks-after"
    privacy_inventory "$result" "$work/privacy-after.txt"
    diff -u "$work/privacy-before.txt" "$work/privacy-after.txt"
    test -s "$result/main.jsbundle" && test -s "$result/EXUpdates.bundle/app.manifest"
    codesign --force --sign - --entitlements "$work/entitlements.plist" "$result"
    codesign --verify --deep --strict "$result"
    codesign -d --entitlements :- "$result" > "$work/new-entitlements.plist" 2>/dev/null
    diff -u <(plutil -convert json -o - "$work/entitlements.plist" | jq -S .) <(plutil -convert json -o - "$work/new-entitlements.plist" | jq -S .)
    check_source
    ditto -c -k --sequesterRsrc --keepParent "$result" "$work/final.zip"
    unzip -tq "$work/final.zip"
    mv "$work/final.zip" "$out/ios-simulator.zip"
    check_source
    echo "Reused a compatible simulator archive and embedded the current JavaScript." >> "$GITHUB_STEP_SUMMARY"
    echo 'reused=true' >> "$GITHUB_OUTPUT"
    ;;
  *) exit 2 ;;
esac
