#!/bin/bash
set -euo pipefail
workspace=$(find ios -maxdepth 1 -name '*.xcworkspace' -print -quit)
test -n "$workspace"
scheme=$(basename "$workspace" .xcworkspace)
settings=()
case "$EXPERIMENT" in
  arm64) settings+=(ARCHS=arm64 ONLY_ACTIVE_ARCH=NO) ;;
  unoptimized-universal) settings+=(SWIFT_OPTIMIZATION_LEVEL=-Onone GCC_OPTIMIZATION_LEVEL=0) ;;
  *) exit 1 ;;
esac
mkdir -p "$GITHUB_WORKSPACE/dist/apple"
out="$GITHUB_WORKSPACE/dist/apple"
args=(-workspace "$workspace" -scheme "$scheme" -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath "$RUNNER_TEMP/ios-build" COMPILER_INDEX_STORE_ENABLE=NO CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- "${settings[@]}")
/usr/bin/time -p xcodebuild "${args[@]}" -showBuildSettings > "$out/build-settings.txt"
/usr/bin/time -p xcodebuild -quiet -showBuildTimingSummary "${args[@]}" build
app=$(find "$RUNNER_TEMP/ios-build/Build/Products/Release-iphonesimulator" -maxdepth 1 -name '*.app' -type d -print -quit)
test -n "$app"
codesign --verify --deep --strict "$app"
codesign -dv "$app" 2> "$out/codesign.txt"
executable=$(/usr/libexec/PlistBuddy -c 'Print CFBundleExecutable' "$app/Info.plist")
identifier=$(/usr/libexec/PlistBuddy -c 'Print CFBundleIdentifier' "$app/Info.plist")
test "$identifier" = dev.disposabl.mobile.preview
architectures=$(lipo -archs "$app/$executable")
printf '%s\n' "$architectures" > "$out/architectures.txt"
[[ " $architectures " == *' arm64 '* ]]
if [[ "$EXPERIMENT" == arm64 ]]; then [[ "$architectures" == arm64 ]]; else [[ " $architectures " == *' x86_64 '* ]]; fi
test -s "$app/main.jsbundle" && test -s "$app/Expo.plist"
/usr/libexec/PlistBuddy -c 'Print EXUpdatesRuntimeVersion' "$app/Expo.plist" > "$out/expo-runtime.txt"
/usr/libexec/PlistBuddy -c 'Print EXUpdatesRequestHeaders:expo-channel-name' "$app/Expo.plist" | grep -Fx benchmark
privacy=$(find "$app" -path '*SDWebImage*' -name PrivacyInfo.xcprivacy -print -quit)
test -s "$privacy"
plutil -lint "$privacy"
printf 'SDWebImage privacy manifest: %s\n' "${privacy#"$app"/}" > "$out/privacy.txt"
shasum -a 256 "$app/main.jsbundle" > "$out/js-sha256.txt"
printf '%s\n' "$SOURCE" > "$out/source.sha"
ditto -c -k --sequesterRsrc --keepParent "$app" "$out/ios-simulator.zip"
unzip -tq "$out/ios-simulator.zip"
shasum -a 256 "$out/ios-simulator.zip" > "$out/sha256.txt"
