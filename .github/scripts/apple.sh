#!/usr/bin/env bash
set -euo pipefail
report() { node "$GITHUB_WORKSPACE/.github/scripts/disposabl.mjs" report ios "$@"; }
check_source() { test "$(gh api "repos/$GH_REPO/$SOURCE_PATH" --jq 'if has("head") then (if .state == "open" then .head.sha else "closed" end) else .object.sha end')" = "$SOURCE"; }
case "${1:?operation required}" in
  simulator)
    check_source
    bun x --no-install expo prebuild --platform ios --no-install
    (cd ios && pod install)
    workspace=$(find ios -maxdepth 1 -name '*.xcworkspace' -print -quit)
    test -n "$workspace"
    xcodebuild -workspace "$workspace" -scheme "$(basename "$workspace" .xcworkspace)" -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath "$RUNNER_TEMP/ios-build" CODE_SIGNING_ALLOWED=NO build
    app=$(find "$RUNNER_TEMP/ios-build/Build/Products/Release-iphonesimulator" -maxdepth 1 -name '*.app' -type d -print -quit)
    test -n "$app"
    check_source
    mkdir -p "$GITHUB_WORKSPACE/dist/apple"
    ditto -c -k --sequesterRsrc --keepParent "$app" "$GITHUB_WORKSPACE/dist/apple/ios-simulator.zip"
    test -s "$GITHUB_WORKSPACE/dist/apple/ios-simulator.zip"
    ;;
  prerequisites)
    if [[ -z "${EXPO_TOKEN:-}" || -z "${EXPO_PROJECT_ID:-}" ]]; then
      report blocked 'Connect Expo and configure EXPO_TOKEN and EXPO_PROJECT_ID before the iOS production build.'
      exit 0
    fi
    echo 'ready=true' >> "$GITHUB_OUTPUT"
    ;;
  production)
    report building
    jq --arg channel "$CHANNEL" --arg number "$DISPOSABL_IOS_BUILD_NUMBER" \
      --arg url "$CONVEX_URL" --arg site "$CONVEX_SITE_URL" \
      --arg project "$EXPO_PROJECT_ID" --arg owner "${EXPO_OWNER:-}" --arg slug "${EXPO_SLUG:-}" \
      '.build["ios-production"].env += {DISPOSABL_MOBILE_CHANNEL: $channel, DISPOSABL_IOS_BUILD_NUMBER: $number, CONVEX_URL: $url, CONVEX_SITE_URL: $site, EXPO_PUBLIC_CONVEX_URL: $url, EXPO_PUBLIC_CONVEX_SITE_URL: $site, EXPO_PROJECT_ID: $project, EXPO_OWNER: $owner, EXPO_SLUG: $slug}' eas.json > "$RUNNER_TEMP/eas-production.json"
    mv "$RUNNER_TEMP/eas-production.json" eas.json
    if [[ -n "${ASC_APP_ID:-}" ]]; then
      jq --arg id "$ASC_APP_ID" '.submit["ios-production"].ios.ascAppId = $id' eas.json > "$RUNNER_TEMP/eas-submit.json"
      mv "$RUNNER_TEMP/eas-submit.json" eas.json
      submit=(--auto-submit-with-profile ios-production)
    else
      submit=()
    fi
    check_source
    if EAS_NO_VCS=1 bun x "$EAS_CLI" build --platform ios --profile ios-production --non-interactive --freeze-credentials --wait --json "${submit[@]}" > "$RUNNER_TEMP/ios-build.json" 2> "$RUNNER_TEMP/ios-build.log"; then
      cat "$RUNNER_TEMP/ios-build.log"
      if [[ -n "${ASC_APP_ID:-}" ]]; then
        report ready 'EAS submitted the build to TestFlight; Apple processing may still be pending.'
        echo 'EAS completed the iOS build and TestFlight submission. Check App Store Connect for processing and availability.' >> "$GITHUB_STEP_SUMMARY"
      else
        report blocked 'iOS build completed; configure ASC_APP_ID and an EAS App Store Connect submission key for TestFlight.'
        echo 'iOS build completed, but TestFlight submission needs ASC_APP_ID and an EAS submission key.' >> "$GITHUB_STEP_SUMMARY"
      fi
      jq -r '.[] | "EAS build: " + (.id // "unknown") + " (" + (.status // "unknown") + ")"' "$RUNNER_TEMP/ios-build.json" >> "$GITHUB_STEP_SUMMARY"
    else
      cat "$RUNNER_TEMP/ios-build.log" >&2
      if grep -Eqi 'Credentials are not set up|Credentials cannot be modified|Provisioning [Pp]rofile.*(--freeze-credentials|not configured)|ASC API key is required|App Store Connect API Keys cannot be set up|Set ascAppId in the submit profile' "$RUNNER_TEMP/ios-build.log"; then
        report blocked 'Configure the iOS distribution certificate, provisioning profile, App Store Connect app ID and submission API key in EAS before unattended TestFlight builds.'
        exit 0
      fi
      exit 1
    fi
    ;;
  *) echo "Unknown operation: $1" >&2; exit 1 ;;
esac
