#!/bin/bash
set -euo pipefail
mode=${1:?}
product="$GITHUB_WORKSPACE/product"
repack="$GITHUB_WORKSPACE/.github/scripts/ios-preview-repack.sh"
output="$GITHUB_WORKSPACE/dist/apple/ios-simulator.zip"
cache="$RUNNER_TEMP/ios-preview-native-cache"
evidence="$RUNNER_TEMP/ios-repack-evidence"
case "$mode" in
  setup)
    mkdir -p "$RUNNER_TEMP/fixture-bin"
    # Simulate only the current-PR API response for the immutable fixture checkout.
    real_gh=$(command -v gh)
    cat > "$RUNNER_TEMP/fixture-bin/gh" <<'SH'
#!/bin/bash
set -euo pipefail
if [[ "$#" == 4 && "$1" == api && "$2" == "repos/$GH_REPO/$SOURCE_PATH" && "$3" == --jq ]]; then
  actual=$(git -C "$GITHUB_WORKSPACE/product" rev-parse HEAD)
  [[ "$actual" == "$SOURCE" ]]
  printf '%s\n' "$actual"
else
  exec "$REAL_GH" "$@"
fi
SH
    chmod +x "$RUNNER_TEMP/fixture-bin/gh"
    printf 'REAL_GH=%s\n' "$real_gh" >> "$GITHUB_ENV"
    printf '%s\n' "$RUNNER_TEMP/fixture-bin" >> "$GITHUB_PATH"
    ;;
  seed)
    mkdir -p "$(dirname "$output")"
    cp "$RUNNER_TEMP/ios-repack/outer/ios-simulator.zip" "$output"
    cd "$product/apps/mobile"
    /usr/bin/time -p bash "$repack" manifest
    ;;
  replay)
    cd "$product/apps/mobile"
    python3 - <<'PY'
from pathlib import Path
p = Path('src/features/studio/home.tsx')
s = p.read_text()
old = 'title: "What will you build?",'
assert s.count(old) == 1
p.write_text(s.replace(old, 'title: "Repack Cache Current",'))
PY
    cp "$cache/ios-simulator.zip" "$RUNNER_TEMP/verified-base.zip"
    printf 'corrupt cache test\n' >> "$cache/ios-simulator.zip"
    if bash "$repack" repack; then
      echo 'Corrupt cache was unexpectedly reused' >&2
      exit 1
    fi
    test ! -e "$output"
    mv "$RUNNER_TEMP/verified-base.zip" "$cache/ios-simulator.zip"
    /usr/bin/time -p bash "$repack" repack
    test -s "$output"
    mkdir -p "$RUNNER_TEMP/ios-repack/installed" "$evidence"
    unzip -q "$output" -d "$RUNNER_TEMP/ios-repack/installed"
    app="$RUNNER_TEMP/ios-repack/installed/Disposabl.app"
    test -d "$app"
    { shasum -a 256 "$output"; codesign --verify --deep --strict "$app"; } > "$evidence/cache-archive-identity.txt"
    printf 'IOS_REPACK_CACHE_APP=%s\n' "$app" >> "$GITHUB_ENV"
    ;;
  launch)
    udid=$(cat "$RUNNER_TEMP/ios-repack/owned-udid")
    bundle=dev.disposabl.mobile.preview
    xcrun simctl install "$udid" "$IOS_REPACK_CACHE_APP"
    installed=$(xcrun simctl get_app_container "$udid" "$bundle" app)
    test "$(/usr/libexec/PlistBuddy -c 'Print CFBundleVersion' "$installed/Info.plist")" = 42
    test "$(jq -er '.ios.buildNumber' "$installed/EXConstants.bundle/app.config")" = 42
    xcrun simctl launch "$udid" "$bundle" | tee "$evidence/cache-launch.txt"
    swiftc -O "$GITHUB_WORKSPACE/.github/scripts/ios-repack-ocr.swift" -o "$RUNNER_TEMP/cache-ocr"
    for iteration in 1 2 3; do
      sleep 8
      xcrun simctl io "$udid" screenshot "$evidence/cache-screen.png"
      "$RUNNER_TEMP/cache-ocr" "$evidence/cache-screen.png" > "$evidence/cache-ocr.txt"
      if grep -Fx 'Repack Cache Current' "$evidence/cache-ocr.txt"; then exit 0; fi
    done
    cat "$evidence/cache-ocr.txt"
    exit 1
    ;;
  *) exit 2;;
esac
