#!/bin/bash
set -euo pipefail
work="$RUNNER_TEMP/ios-repack"
evidence="$RUNNER_TEMP/ios-repack-evidence"
mkdir -p "$evidence"
case "${1:?phase required}" in
  boot)
    app="$work/repacked-A.app"
    minimum=$(/usr/libexec/PlistBuddy -c 'Print MinimumOSVersion' "$app/Info.plist")
    xcodebuild -version > "$evidence/simulator-xcode.txt"
    xcrun simctl list -j runtimes > "$evidence/simulator-runtimes.json"
    xcrun simctl list -j devicetypes > "$evidence/simulator-devicetypes.json"
    runtime=$(python3 - "$evidence/simulator-runtimes.json" "$minimum" <<'PY'
import json, sys
def version(s): return tuple(map(int, s.split('.')))
runtimes = [r for r in json.load(open(sys.argv[1]))['runtimes'] if r['isAvailable'] and r['identifier'].startswith('com.apple.CoreSimulator.SimRuntime.iOS-') and version(r['version']) >= version(sys.argv[2])]
if not runtimes: raise SystemExit('No available compatible iOS runtime')
print(max(runtimes, key=lambda r: version(r['version']))['identifier'])
PY
)
    udid=''
    while IFS= read -r device; do
      if udid=$(xcrun simctl create RepackPilot "$device" "$runtime" 2>/dev/null); then break; fi
    done < <(jq -r '[.devicetypes[] | select(.name | startswith("iPhone"))] | sort_by(if .name == "iPhone 17" then 0 else 1 end, .name) | .[].identifier' "$evidence/simulator-devicetypes.json")
    [[ -n "$udid" ]] || { echo 'No compatible iPhone device type' >&2; exit 1; }
    printf '%s\n' "$udid" > "$work/owned-udid"
    printf 'udid=%s\nruntime=%s\ndevice=%s\nminimum=%s\n' "$udid" "$runtime" "$device" "$minimum" > "$evidence/simulator-target.txt"
    python3 - "$udid" <<'PY' 2>&1 | tee "$evidence/simulator-boot.log"
import subprocess, sys
try:
    subprocess.run(['xcrun', 'simctl', 'bootstatus', sys.argv[1], '-b'], check=True, timeout=180)
except subprocess.TimeoutExpired:
    raise SystemExit('Simulator boot timed out after 180 seconds')
PY
    ;;
  launch)
    udid=$(cat "$work/owned-udid")
    swiftc -O "$GITHUB_WORKSPACE/.github/scripts/ios-repack-ocr.swift" -o "$work/ocr"
    bundle=dev.disposabl.mobile.preview
    for variant in base A B; do
      if [[ "$variant" == base ]]; then
        app=$(cat "$work/app-path")
        marker="What will you build?"
      else
        app="$work/repacked-$variant.app"
        marker="Repack Pilot $variant"
      fi
      xcrun simctl install "$udid" "$app"
      installed=$(xcrun simctl get_app_container "$udid" "$bundle" app)
      actual=$(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$installed/Info.plist")
      expected=1
      if [[ "$variant" == B ]]; then expected=42; fi
      [[ "$actual" == "$expected" ]]
      echo "$actual" > "$evidence/installed-build-$variant.txt"
      xcrun simctl launch "$udid" "$bundle" | tee "$evidence/launch-$variant.txt"
      matched=false
      for attempt in 1 2 3; do
        sleep 10
        xcrun simctl io "$udid" screenshot "$evidence/screen-$variant.png"
        "$work/ocr" "$evidence/screen-$variant.png" > "$evidence/ocr-$variant.txt"
        if grep -Fx "$marker" "$evidence/ocr-$variant.txt"; then matched=true; break; fi
      done
      if [[ "$matched" != true ]]; then
        xcrun simctl spawn "$udid" log show --last 2m --predicate 'process == "Disposabl"' > "$evidence/app-log-$variant.txt" 2>&1 || true
        cat "$evidence/ocr-$variant.txt"
        echo "Visible marker $variant was not recognized; inspect screenshot" >&2
        exit 1
      fi
      xcrun simctl terminate "$udid" "$bundle" || true
      xcrun simctl uninstall "$udid" "$bundle"
    done
    echo 'Recognized the original launch and both repacked markers. Screenshots are available in the run artifact.' >> "$GITHUB_STEP_SUMMARY"
    ;;
  cleanup)
    if [[ -f "$work/owned-udid" ]]; then
      udid=$(cat "$work/owned-udid")
      [[ "$udid" =~ ^[[:xdigit:]]{8}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{4}-[[:xdigit:]]{12}$ ]]
      xcrun simctl list devices "$udid" > "$evidence/simulator-final-state.txt" || true
      xcrun simctl io "$udid" screenshot "$evidence/simulator-final.png" || true
      xcrun simctl shutdown "$udid" || true
      xcrun simctl delete "$udid"
    fi
    ;;
  *) exit 2 ;;
esac
