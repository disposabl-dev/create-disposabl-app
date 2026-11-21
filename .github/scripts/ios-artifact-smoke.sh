#!/bin/bash
set -euo pipefail
evidence="$RUNNER_TEMP/ios-smoke-evidence"
work="$RUNNER_TEMP/ios-smoke-work"
mkdir -p "$work/outer" "$work/inner"
gh api --allow-escape-sequences "repos/$GITHUB_REPOSITORY/actions/artifacts/$ARTIFACT_ID/zip" > "$work/artifact.zip"
printf '%s  %s\n' "$ARTIFACT_DIGEST" "$work/artifact.zip" | shasum -a 256 --check
shasum -a 256 "$work/artifact.zip" > "$evidence/sha256.txt"
unzip -q "$work/artifact.zip" -d "$work/outer"
mapfile_compat=()
while IFS= read -r file; do mapfile_compat+=("$file"); done < <(find "$work/outer" -type f -name ios-simulator.zip)
[[ ${#mapfile_compat[@]} == 1 ]] || { echo 'Expected one simulator archive' >&2; exit 1; }
shasum -a 256 "${mapfile_compat[0]}" >> "$evidence/sha256.txt"
unzip -tq "${mapfile_compat[0]}"
unzip -q "${mapfile_compat[0]}" -d "$work/inner"
apps=()
while IFS= read -r app; do apps+=("$app"); done < <(find "$work/inner" -type d -name '*.app' -prune)
[[ ${#apps[@]} == 1 ]] || { echo 'Expected exactly one app' >&2; exit 1; }
app=${apps[0]}
plist="$app/Info.plist"
bundle=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$plist")
executable=$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$plist")
minimum=$(/usr/libexec/PlistBuddy -c 'Print MinimumOSVersion' "$plist")
lipo -archs "$app/$executable" | tee "$evidence/architectures.txt"
lipo -archs "$app/$executable" | grep -qw arm64
codesign --verify --strict --deep "$app"
xcodebuild -version | tee "$evidence/xcode.txt"
xcrun simctl list -j runtimes > "$evidence/runtimes.json"
xcrun simctl list -j devicetypes > "$evidence/devicetypes.json"
runtime=$(python3 - "$evidence/runtimes.json" "$minimum" <<'PY'
import json, sys
def version(s): return tuple(map(int, s.split('.')))
minimum = version(sys.argv[2])
runtimes = [r for r in json.load(open(sys.argv[1]))['runtimes'] if r['isAvailable'] and r['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS-') and version(r['version']) >= minimum]
if not runtimes: raise SystemExit('No available compatible iOS runtime')
print(max(runtimes, key=lambda r: version(r['version']))['identifier'])
PY
)
udid=''
while IFS= read -r device; do
  if udid=$(xcrun simctl create Smoke "$device" "$runtime" 2>/dev/null); then break; fi
done < <(jq -r '[.devicetypes[] | select(.name | startswith("iPhone"))] | reverse | .[].identifier' "$evidence/devicetypes.json")
[[ -n "$udid" ]] || { echo 'No compatible iPhone device type' >&2; exit 1; }
trap 'xcrun simctl shutdown "$udid" || true; xcrun simctl delete "$udid" || true' EXIT
printf 'bundle=%s\nminimum=%s\nruntime=%s\ndevice=%s\nudid=%s\n' "$bundle" "$minimum" "$runtime" "$device" "$udid" > "$evidence/target.txt"
xcrun simctl boot "$udid"
xcrun simctl bootstatus "$udid" -b
xcrun simctl install "$udid" "$app"
xcrun simctl launch "$udid" "$bundle" | tee "$evidence/launch.txt"
sleep 20
xcrun simctl io "$udid" screenshot "$evidence/screen.png"
echo 'Inspect screen.png to establish what rendered; launch and screenshot capture alone do not prove behavior.' >> "$GITHUB_STEP_SUMMARY"
if [[ -n "${PRODUCT_SOURCE:-}" ]]; then
  unset GH_TOKEN
  cd "$GITHUB_WORKSPACE/product"
  [[ "$(git rev-parse HEAD)" == "$PRODUCT_SOURCE" ]]
  export E2E_IOS_DEVICE="$udid" E2E_IOS_APP_ID="$bundle" DISPOSABL_MOBILE_CHANNEL=pr-92
  export E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 EXPO_NO_TELEMETRY=1
  bun run --cwd packages/tests e2e run --target ios --retries 0 2>&1 | tee "$evidence/product-ios-checks.log"
fi
