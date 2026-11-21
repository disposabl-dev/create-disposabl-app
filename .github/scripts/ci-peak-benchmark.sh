#!/usr/bin/env bash
set -euo pipefail

platform=${CI_PEAK_PLATFORM:?}
root=$PWD
cache=${CI_PEAK_CACHE_DIR:?}

timed() {
  local name=$1 start
  shift
  start=$(date +%s)
  "$@"
  printf '%s: %s s\n' "$name" "$(( $(date +%s) - start ))" | tee -a "$GITHUB_STEP_SUMMARY"
}

compiler_cache() {
  if ! command -v ccache >/dev/null; then
    if [[ "$RUNNER_OS" == macOS ]]; then
      HOMEBREW_NO_AUTO_UPDATE=1 brew install ccache
    else
      sudo apt-get update -qq
      sudo apt-get install -y ccache
    fi
  fi
  export CCACHE_DIR="$cache/ccache" CCACHE_BASEDIR="$root" CCACHE_COMPILERCHECK=content CCACHE_MAXSIZE=512M
  ccache --zero-stats
}

if [[ "$1" == install ]]; then
  case "$platform" in
    web) timed 'Frozen install' bun install --frozen-lockfile ;;
    android|ios) timed 'Frozen install' bun install --frozen-lockfile --filter @disposabl/mobile ;;
    linux|macos|windows) timed 'Frozen install' bun install --frozen-lockfile --filter '*desktop*' --filter @disposabl/backend ;;
    *) exit 2 ;;
  esac
  exit 0
fi
[[ "$1" == build ]]

case "$platform" in
  web)
    timed 'Source validation' bun run check
    timed 'Web bundle' bun x --no-install turbo run build --filter=@disposabl/web
    test -s apps/web/dist/client/index.html
    ;;
  android)
    compiler_cache
    export CMAKE_C_COMPILER_LAUNCHER=ccache CMAKE_CXX_COMPILER_LAUNCHER=ccache
    cd apps/mobile
    if [[ "${CI_PEAK_ANDROID_PREBUILT:-}" == true ]]; then
      printf 'Native intermediate cache exact match: %s\n' "${CI_PEAK_NATIVE_HIT:-}" | tee -a "$GITHUB_STEP_SUMMARY"
    else
      timed 'Expo prebuild' bun x --no-install expo prebuild --platform android --no-install
    fi
    runtime=$(bun x --no-install expo-updates runtimeversion:resolve --platform android --workflow managed | jq -er '.runtimeVersion | select(test("^[a-f0-9]{40,64}$"))')
    cd android
    flags=(--profile)
    if [[ "${CI_PEAK_HEAP:-}" == 4g ]]; then
      flags+=("-Dorg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=512m")
    fi
    timed 'Android APK and AAB build' bash "$root/.github/scripts/android-runner.sh" build :app:assembleRelease :app:bundleRelease "${flags[@]}"
    ccache --show-stats --verbose
    apk=app/build/outputs/apk/release/app-release.apk
    aab=app/build/outputs/bundle/release/app-release.aab
    test -s "$apk" && test -s "$aab"
    architectures=$(jq -c '.androidArchitectures // ["arm64-v8a", "x86_64"]' "$root/disposabl.json")
    manifest=$(jq -nc --argjson architectures "$architectures" '{androidArchitectures:$architectures}')
    node "$root/.github/scripts/verify-android-abis.mjs" "$apk" "$manifest"
    unzip -tq "$apk"
    unzip -tq "$aab"
    cert=$(node "$root/.github/scripts/android-signatures.mjs" "$apk" fallback)
    node "$root/.github/scripts/android-signatures.mjs" "$aab" "$cert"
    test "$(unzip -p "$apk" assets/fingerprint)" = "$runtime"
    test "$cert" = fac61745dc0903786fb9ede62a962b399f7348f0bb6f899b8332667591033b9c
    printf 'Runtime: %s; certificate: %s\n' "$runtime" "$cert" | tee -a "$GITHUB_STEP_SUMMARY"
    sha256sum "$apk" "$aab" | tee -a "$GITHUB_STEP_SUMMARY"
    wc -c "$apk" "$aab"
    ;;
  ios)
    compiler_cache
    export USE_CCACHE=1
    xcodebuild -version
    cd apps/mobile
    timed 'Expo prebuild' bun x --no-install expo prebuild --platform ios --no-install
    (cd ios && timed 'CocoaPods install' pod install)
    workspace=$(find ios -maxdepth 1 -name '*.xcworkspace' -print -quit)
    test -n "$workspace"
    timed 'iOS simulator build' xcodebuild -quiet -showBuildTimingSummary -workspace "$workspace" \
      -scheme "$(basename "$workspace" .xcworkspace)" -configuration Release \
      -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' \
      -derivedDataPath "$RUNNER_TEMP/ios-build" CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build
    app=$(find "$RUNNER_TEMP/ios-build/Build/Products/Release-iphonesimulator" -maxdepth 1 -name '*.app' -type d -print -quit)
    test -n "$app"
    timed 'Simulator ZIP' ditto -c -k --sequesterRsrc --keepParent "$app" "$RUNNER_TEMP/ios-simulator.zip"
    test -s "$RUNNER_TEMP/ios-simulator.zip"
    ccache --show-stats
    wc -c "$RUNNER_TEMP/ios-simulator.zip"
    ;;
  linux|macos|windows)
    if [[ "$platform" == linux ]] && ! (command -v fakeroot && command -v rpmbuild && command -v dpkg-deb); then
      sudo apt-get update -qq
      sudo apt-get install -y fakeroot dpkg rpm
    fi
    export electron_config_cache="$cache/electron"
    timed 'Electron packaging' bun run --cwd apps/desktop preview
    case "$platform" in
      linux) extensions=(deb rpm) ;;
      macos) extensions=(dmg zip) ;;
      windows) extensions=(exe nupkg) ;;
    esac
    for extension in "${extensions[@]}"; do
      artifact=$(find dist/release -maxdepth 1 -type f -name "*.$extension" -print -quit)
      test -n "$artifact" && test -s "$artifact"
      wc -c "$artifact"
    done
    ;;
  *) exit 2 ;;
esac
