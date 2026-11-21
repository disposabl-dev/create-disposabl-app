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
grep -qw arm64 "$evidence/architectures.txt"
grep -qw x86_64 "$evidence/architectures.txt"
codesign --verify --strict --deep "$app"
xcodebuild -version | tee "$evidence/xcode.txt"
xcrun simctl list -j runtimes > "$evidence/runtimes.json"
xcrun simctl list -j devicetypes > "$evidence/devicetypes.json"
xcrun simctl list -j devices available > "$evidence/available-devices.json"
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
method=create
template=''
while IFS=$'\t' read -r candidate candidate_runtime candidate_name; do
  [[ -n "$candidate" ]] || continue
  if udid=$(xcrun simctl clone "$candidate" FirstStarter 2>/dev/null); then
    runtime="$candidate_runtime"
    device="$candidate_name"
    template="$candidate"
    method=clone
    break
  else
    udid=''
  fi
done < <(python3 "$GITHUB_WORKSPACE/.github/scripts/ios-smoke-templates.py" "$evidence/runtimes.json" "$evidence/available-devices.json" "$minimum")
if [[ -z "$udid" ]]; then
  while IFS= read -r device; do
    if udid=$(xcrun simctl create FirstStarter "$device" "$runtime" 2>/dev/null); then break; else udid=''; fi
  done < <(jq -r '[.devicetypes[] | select(.name | startswith("iPhone"))] | sort_by(if .name == "iPhone 17" then 0 else 1 end, .name) | .[].identifier' "$evidence/devicetypes.json")
fi
[[ -n "$udid" ]] || { echo 'No compatible iPhone device type' >&2; exit 1; }
[[ "$udid" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ && "$udid" != "$template" ]]
trap 'xcrun simctl shutdown "$udid" || true; xcrun simctl delete "$udid" || true' EXIT
printf 'bundle=%s\nminimum=%s\nruntime=%s\ndevice=%s\nudid=%s\nmethod=%s\ntemplate=%s\n' "$bundle" "$minimum" "$runtime" "$device" "$udid" "$method" "$template" > "$evidence/target.txt"
python3 - "$udid" <<'PY'
import subprocess, sys
subprocess.run(['xcrun', 'simctl', 'bootstatus', sys.argv[1], '-b'], check=True, timeout=420)
PY
if xcrun simctl get_app_container "$udid" "$bundle" app >/dev/null 2>&1; then
  xcrun simctl uninstall "$udid" "$bundle"
fi
xcrun simctl install "$udid" "$app"
xcrun simctl launch "$udid" "$bundle" | tee "$evidence/launch.txt"
sleep 20
xcrun simctl io "$udid" screenshot "$evidence/screen.png"
swiftc -O "$GITHUB_WORKSPACE/.github/scripts/ios-repack-ocr.swift" -o "$RUNNER_TEMP/starter-ocr"
"$RUNNER_TEMP/starter-ocr" "$evidence/screen.png" > "$evidence/screen-text.txt"
tr '\n' ' ' < "$evidence/screen-text.txt" | grep -Fi 'Your app starts here.'
grep -Fix Android "$evidence/screen-text.txt"
grep -Fix iOS "$evidence/screen-text.txt"
unset GH_TOKEN
cd "$RUNNER_TEMP/generated"
export E2E_IOS_DEVICE="$udid" E2E_IOS_APP_ID="$bundle" DISPOSABL_MOBILE_CHANNEL=native-benchmark
export E2E_CONVEX_URL=https://ci.invalid E2E_CONVEX_SITE_URL=https://ci.invalid EXPO_NO_DOTENV=1
export E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 EXPO_NO_TELEMETRY=1
export AGENT_DEVICE_STATE_DIR="$(mktemp -d /tmp/ad-ios.XXXXXX)"
bun x --no-install agent-device prepare ios-runner --platform ios --udid "$udid" \
  --session e2e-ios-0 --timeout 240000 --json | tee "$evidence/driver-prepare.json"
status=0
bun run --cwd packages/tests e2e run mobile.e2e.ts --target ios --retries 0 --action-timeout 60000 --no-cache 2>&1 |
  tee "$evidence/generated-ios-checks.log" || status=$?
if [[ -d packages/tests/.e2e ]]; then cp -R packages/tests/.e2e "$evidence/test-results"; fi
[[ "$status" == 0 ]] || exit "$status"
grep -E '✓.*mobile home renders' "$evidence/generated-ios-checks.log"
