#!/bin/bash
set -euo pipefail
fixture="$GITHUB_WORKSPACE/generated"
work="$RUNNER_TEMP/ios-preview-repack"
cache="$RUNNER_TEMP/ios-preview-native-cache"
evidence="$RUNNER_TEMP/ios-repack-evidence"
helper="$GITHUB_WORKSPACE/.github/scripts/ios-preview-repack.sh"
mkdir -p "$evidence"
case "${1:?}" in
  fetch)
    run=$(gh api "repos/$GITHUB_REPOSITORY/actions/runs/44909246374")
    job=$(gh api "repos/$GITHUB_REPOSITORY/actions/jobs/136861433310")
    jq -e '.head_sha == "fdfcacb916e1c914462f894313ad4f6d45e800c7" and .run_attempt == 1 and .conclusion == "success"' <<<"$run" >/dev/null
    jq -e '.run_id == 44909246374 and .run_attempt == 1 and .name == "First ios package" and .conclusion == "success"' <<<"$job" >/dev/null
    mkdir -p "$RUNNER_TEMP/generated-outer" "$fixture"
    for spec in '14708343861:8ac1ad71e911d957ed61a73f90e6a4d07181b6bca24717c7f083b5d094ce2991:source' '14709882977:c9d8043f19d231a53df14bf2cf586b5ea195515941eee03c130ba2d2607ac09d:ios'; do
      IFS=: read -r id sha name <<<"$spec"
      metadata=$(gh api "repos/$GITHUB_REPOSITORY/actions/artifacts/$id")
      jq -e --argjson id "$id" --arg digest "sha256:$sha" '.id == $id and .workflow_run.id == 44909246374 and .digest == $digest and .expired == false' <<<"$metadata" >/dev/null
      gh api --allow-escape-sequences "repos/$GITHUB_REPOSITORY/actions/artifacts/$id/zip" > "$RUNNER_TEMP/$name.zip"
      printf '%s  %s\n' "$sha" "$RUNNER_TEMP/$name.zip" | shasum -a 256 --check
    done
    unzip -q "$RUNNER_TEMP/source.zip" -d "$RUNNER_TEMP/generated-outer"
    (cd "$RUNNER_TEMP/generated-outer" && shasum -a 256 --check native-starter.sha256)
    tar -xzf "$RUNNER_TEMP/generated-outer/native-starter.tgz" -C "$fixture"
    unzip -q "$RUNNER_TEMP/ios.zip" -d "$RUNNER_TEMP/generated-outer"
    test ! -d "$fixture/apps/mobile/ios" && test ! -d "$fixture/apps/mobile/android"
    mkdir -p "$RUNNER_TEMP/fixture-bin"
    real_gh=$(command -v gh)
    cat > "$RUNNER_TEMP/fixture-bin/gh" <<'SH'
#!/bin/bash
set -euo pipefail
if [[ "$#" == 4 && "$1" == api && "$2" == "repos/$GH_REPO/$SOURCE_PATH" && "$3" == --jq ]]; then
  [[ "$SOURCE" == fdfcacb916e1c914462f894313ad4f6d45e800c7 ]]
  printf '%s\n' "$SOURCE"
else
  exec "$REAL_GH" "$@"
fi
SH
    chmod +x "$RUNNER_TEMP/fixture-bin/gh"
    printf 'REAL_GH=%s\n' "$real_gh" >> "$GITHUB_ENV"
    printf '%s\n' "$RUNNER_TEMP/fixture-bin" >> "$GITHUB_PATH"
    ;;
  identity)
    cd "$fixture/apps/mobile"
    bash "$helper" identity
    ;;
  seed)
    mkdir -p "$GITHUB_WORKSPACE/dist/apple"
    cp "$RUNNER_TEMP/generated-outer/ios-simulator.zip" "$GITHUB_WORKSPACE/dist/apple/ios-simulator.zip"
    cd "$fixture/apps/mobile"
    /usr/bin/time -p bash "$helper" manifest
    ;;
  warm)
    python3 - "$fixture/packages/disposabl-kit/mobile/screens/home.tsx" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1]); text=p.read_text(); old='Your app starts here.'
assert text.count(old)==1
p.write_text(text.replace(old,'Warm build 42'))
PY
    cd "$fixture/apps/mobile"
    current_runtime=$(bun x --no-install expo-updates runtimeversion:resolve --platform ios --workflow managed | jq -er 'select(.fingerprintSources != null) | .runtimeVersion')
    [[ "$current_runtime" == "$(jq -er .runtime "$work/identity.json")" ]]
    /usr/bin/time -p bash "$helper" repack
    test -s "$GITHUB_WORKSPACE/dist/apple/ios-simulator.zip"
    mkdir -p "$RUNNER_TEMP/generated-result"
    unzip -q "$GITHUB_WORKSPACE/dist/apple/ios-simulator.zip" -d "$RUNNER_TEMP/generated-result"
    app=$(find "$RUNNER_TEMP/generated-result" -maxdepth 1 -name '*.app' -type d -print)
    [[ -n "$app" && $(printf '%s\n' "$app" | wc -l | tr -d ' ') == 1 ]]
    codesign --verify --deep --strict "$app"
    mkdir -p "$RUNNER_TEMP/ios-repack"
    printf 'IOS_REPACK_CACHE_APP=%s\n' "$app" >> "$GITHUB_ENV"
    ;;
  launch)
    udid=$(cat "$RUNNER_TEMP/ios-repack/owned-udid")
    app="$IOS_REPACK_CACHE_APP"
    bundle=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")
    xcrun simctl install "$udid" "$app"
    installed=$(xcrun simctl get_app_container "$udid" "$bundle" app)
    [[ $(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$installed/Info.plist") == 42 ]]
    [[ $(jq -er '.ios.buildNumber' "$installed/EXConstants.bundle/app.config") == 42 ]]
    [[ $(jq -er '.android.versionCode' "$installed/EXConstants.bundle/app.config") == 42 ]]
    xcrun simctl launch "$udid" "$bundle" | tee "$evidence/generated-launch.txt"
    swiftc -O "$GITHUB_WORKSPACE/.github/scripts/generated-ios-ocr.swift" -o "$RUNNER_TEMP/generated-ocr"
    for attempt in 1 2 3; do
      sleep 10
      xcrun simctl io "$udid" screenshot "$evidence/generated-screen.png"
      "$RUNNER_TEMP/generated-ocr" "$evidence/generated-screen.png" > "$evidence/generated-ocr.txt"
      grep -Fx 'Warm build 42' "$evidence/generated-ocr.txt" && exit 0
    done
    cat "$evidence/generated-ocr.txt"
    exit 1
    ;;
  *) exit 2 ;;
esac
