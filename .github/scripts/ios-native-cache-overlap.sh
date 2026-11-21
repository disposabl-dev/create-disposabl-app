#!/bin/bash
set -euo pipefail
cache="$RUNNER_TEMP/ios-preview-native-cache"
work="$RUNNER_TEMP/ios-preview-repack"
evidence="$RUNNER_TEMP/ios-repack-evidence"
mkdir -p "$RUNNER_TEMP/overlap-base" "$evidence"
started=$(date +%s)
python3 "$GITHUB_WORKSPACE/.github/scripts/ios-preview-cache-validate.py" "$work/identity.json" "$cache/ios-simulator-provenance.json" "$cache/ios-simulator.zip"
unzip -q "$cache/ios-simulator.zip" -d "$RUNNER_TEMP/overlap-base"
apps=()
while IFS= read -r app; do apps+=("$app"); done < <(find "$RUNNER_TEMP/overlap-base" -maxdepth 1 -type d -name '*.app')
[[ ${#apps[@]} == 1 ]]
app=${apps[0]}
codesign --verify --deep --strict "$app"
[[ $(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist") == dev.disposabl.mobile.preview ]]
/usr/libexec/PlistBuddy -c 'Print MinimumOSVersion' "$app/Info.plist" > "$evidence/overlap-minimum-os.txt"
printf 'validated_base_seconds=%s\n' "$(($(date +%s) - started))" > "$evidence/overlap-timing.txt"
(
  boot_start=$(date +%s)
  status=0
  IOS_REPACK_CACHE_APP="$app" bash "$GITHUB_WORKSPACE/.github/scripts/ios-repack-launch.sh" boot > "$evidence/overlap-boot.log" 2>&1 || status=$?
  printf 'boot_seconds=%s\nboot_exit=%s\n' "$(($(date +%s) - boot_start))" "$status" >> "$evidence/overlap-boot-timing.txt"
  exit "$status"
) &
boot_pid=$!
repack_start=$(date +%s)
repack_status=0
bash "$GITHUB_WORKSPACE/.github/scripts/ios-native-cache-pilot.sh" replay || repack_status=$?
printf 'replay_seconds=%s\nreplay_exit=%s\n' "$(($(date +%s) - repack_start))" "$repack_status" >> "$evidence/overlap-timing.txt"
boot_status=0
wait "$boot_pid" || boot_status=$?
cat "$evidence/overlap-boot.log"
cat "$evidence/overlap-boot-timing.txt" >> "$evidence/overlap-timing.txt"
printf 'overlap_seconds=%s\n' "$(($(date +%s) - started))" >> "$evidence/overlap-timing.txt"
cat "$evidence/overlap-timing.txt"
[[ "$repack_status" == 0 && "$boot_status" == 0 ]]
