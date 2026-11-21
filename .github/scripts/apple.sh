#!/usr/bin/env bash
set -euo pipefail
report() { node "$GITHUB_WORKSPACE/.github/scripts/disposabl.mjs" report ios "$@"; }
check_source() {
  local current
  current=$(gh api "repos/$GH_REPO/$SOURCE_PATH" --jq 'if has("head") then (if .state == "open" then .head.sha else "closed" end) else .object.sha end')
  [[ "$current" == "$SOURCE" ]] || { echo "iOS source changed while this run was queued: $SOURCE_PATH" >&2; return 1; }
}
runtime() { bun x --no-install expo-updates runtimeversion:resolve --platform ios --workflow managed | jq -er 'select(.fingerprintSources != null) | .runtimeVersion | select(test("^[a-f0-9]{40,64}$"))'; }
product_payments() {
  [[ "${GH_REPO:-}" == disposabl-dev/create-disposabl-app ]] || return 0
  for name in EXPO_PUBLIC_REVENUECAT_IOS_API_KEY EXPO_PUBLIC_REVENUECAT_IOS_MONTHLY_PRODUCT EXPO_PUBLIC_REVENUECAT_IOS_APP_ID EXPO_PUBLIC_REVENUECAT_IOS_TOPUP_PRODUCT; do
    [[ "${!name:-}" =~ [^[:space:]] ]] || { echo "Missing $name" >&2; return 1; }
  done
}
use_compiler_cache() {
  if [[ -n "${CCACHE_DIR:-}" ]] && command -v ccache >/dev/null; then
    export USE_CCACHE=1
    ccache --zero-stats
  fi
}
case "${1:?operation required}" in
  prepare-cache)
    if ! command -v ccache >/dev/null && command -v brew >/dev/null; then
      HOMEBREW_NO_AUTO_UPDATE=1 brew install ccache || echo '::warning::iOS compiler cache is unavailable.'
    fi
    if command -v ccache >/dev/null; then
      echo 'enabled=true' >> "$GITHUB_OUTPUT"
    fi
    ;;
  ota-plan)
    product_payments
    check_source
    RUNTIME=$(runtime)
    config=$(bun x --no-install expo config --json)
    identifier=$(jq -er --arg project "$EXPO_PROJECT_ID" 'select(.extra.eas.projectId == $project) | .ios.bundleIdentifier | select(type == "string" and length > 0)' <<< "$config")
    version=$(jq -er '([.ios.version, .version, "1.0.0"] | map(select(type == "string" and length > 0)) | first)' <<< "$config")
    if [[ "$GH_REPO" == disposabl-dev/create-disposabl-app ]]; then
      [[ "$version" =~ ^[0-9]+(\.[0-9]+){1,2}$ ]] || { echo 'Invalid iOS version' >&2; exit 1; }
      printf 'version=%s\nruntime=%s\nidentifier=%s\n' "$version" "$RUNTIME" "$identifier" >> "$GITHUB_OUTPUT"
      exit 0
    fi
    # Only the latest finished production binary is a reuse baseline. A query
    # failure must fail the job, not silently spend on a replacement build.
    bun x "$EAS_CLI" build:list --platform ios --status finished --distribution store --build-profile ios-production --channel "$CHANNEL" --app-identifier "$identifier" --limit 1 --json --non-interactive > "$RUNNER_TEMP/ios-builds.json"
    jq -e 'type == "array"' "$RUNNER_TEMP/ios-builds.json" > /dev/null
    if jq -e --arg runtime "$RUNTIME" --arg project "$EXPO_PROJECT_ID" --arg channel "$CHANNEL" --arg identifier "$identifier" --arg version "$version" '
      .[0] | .status == "FINISHED" and .platform == "IOS" and .distribution == "STORE"
      and .isForIosSimulator == false and .app.id == $project and .appIdentifier == $identifier
      and .buildProfile == "ios-production" and .updateChannel.name == $channel
      and .runtime.version == $runtime and .appVersion == $version
      and ((.artifacts.applicationArchiveUrl // .artifacts.buildUrl // "") | length > 0)
    ' "$RUNNER_TEMP/ios-builds.json" > /dev/null; then
      printf 'build_id=%s\n' "$(jq -er '.[0].id | select(type == "string" and length > 0)' "$RUNNER_TEMP/ios-builds.json")" >> "$GITHUB_OUTPUT"
      echo 'action=update' >> "$GITHUB_OUTPUT"
    else
      echo 'action=build' >> "$GITHUB_OUTPUT"
    fi
    printf 'runtime=%s\n' "$RUNTIME" >> "$GITHUB_OUTPUT"
    ;;
  ota)
    check_source
    actual=$(runtime)
    expected=${RUNTIME:-$actual}
    test "$actual" = "$expected"
    bun x --no-install expo export --platform ios --output-dir dist/update-ios
    test "$(runtime)" = "$expected"
    check_source
    bun x "$EAS_CLI" update --platform ios --channel "$CHANNEL" --environment "$EAS_ENVIRONMENT" --skip-bundler --input-dir dist/update-ios --message "$SOURCE" --non-interactive
    echo "Published iOS OTA to $CHANNEL for runtime $expected. Compatible installed apps download it on launch or after a long inactive interval." >> "$GITHUB_STEP_SUMMARY"
    ;;
  deliver)
    product_payments
    # A successful build may never have been submitted. Recover delivery without
    # building another identical binary or duplicating a queued submission.
    : "${BUILD_ID:?Matching iOS build required}"
    check_source
    for ((offset=0; ; offset+=25)); do
      bun x "$EAS_CLI" submit:list --platform ios --limit 25 --offset "$offset" --json --non-interactive > "$RUNNER_TEMP/ios-submissions.json"
      jq -e 'type == "array" and all(.[]; .status | IN("FINISHED", "AWAITING_BUILD", "IN_QUEUE", "IN_PROGRESS", "ERRORED", "CANCELED"))' "$RUNNER_TEMP/ios-submissions.json" > /dev/null
      if jq -e --arg id "$BUILD_ID" 'any(.[]; .submittedBuild.id == $id and .status == "FINISHED")' "$RUNNER_TEMP/ios-submissions.json" > /dev/null; then
        report ready 'iOS OTA published; the compatible native build was submitted. Apple availability may still be pending.'
        exit 0
      fi
      if jq -e --arg id "$BUILD_ID" 'any(.[]; .submittedBuild.id == $id and (.status | IN("AWAITING_BUILD", "IN_QUEUE", "IN_PROGRESS")))' "$RUNNER_TEMP/ios-submissions.json" > /dev/null; then
        report blocked 'iOS OTA published; the compatible native build has a submission still in progress. Check EAS Submit before retrying.'
        exit 0
      fi
      [[ $(jq length "$RUNNER_TEMP/ios-submissions.json") -ge 25 ]] || break
    done
    if [[ -z "${ASC_APP_ID:-}" ]]; then
      report blocked 'iOS OTA published, but the compatible build needs ASC_APP_ID and EAS submission credentials for TestFlight delivery.'
      exit 0
    fi
    jq --arg id "$ASC_APP_ID" '.submit["ios-production"].ios.ascAppId = $id' eas.json > "$RUNNER_TEMP/eas-submit.json"
    mv "$RUNNER_TEMP/eas-submit.json" eas.json
    check_source
    bun x "$EAS_CLI" submit --platform ios --id "$BUILD_ID" --profile ios-production --non-interactive --wait
    report ready 'iOS OTA published and the existing native build submitted to TestFlight. Apple processing may still be pending.'
    ;;
  simulator)
    check_source
    bun x --no-install expo prebuild --platform ios --no-install
    use_compiler_cache
    (cd ios && pod install)
    workspace=$(find ios -maxdepth 1 -name '*.xcworkspace' -print -quit)
    test -n "$workspace"
    # Simulator signing embeds the entitlements SecureStore needs for Keychain.
    # The local ad-hoc identity requires no Apple account or provisioning profile.
    xcodebuild -workspace "$workspace" -scheme "$(basename "$workspace" .xcworkspace)" -configuration Release -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' -derivedDataPath "$RUNNER_TEMP/ios-build" CODE_SIGNING_ALLOWED=YES CODE_SIGN_IDENTITY=- build
    if [[ "${USE_CCACHE:-}" == 1 ]]; then ccache --show-stats; fi
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
    product_payments
    report building
    jq --arg channel "$CHANNEL" --arg number "$DISPOSABL_IOS_BUILD_NUMBER" \
      --arg url "$CONVEX_URL" --arg site "$CONVEX_SITE_URL" --arg publicSite "$EXPO_PUBLIC_CONVEX_SITE_URL" \
      --arg project "$EXPO_PROJECT_ID" --arg owner "${EXPO_OWNER:-}" --arg slug "${EXPO_SLUG:-}" \
      '.build["ios-production"].env += {DISPOSABL_MOBILE_CHANNEL: $channel, DISPOSABL_IOS_BUILD_NUMBER: $number, CONVEX_URL: $url, CONVEX_SITE_URL: $site, PUBLIC_SITE_URL: $publicSite, EXPO_PUBLIC_CONVEX_URL: $url, EXPO_PUBLIC_CONVEX_SITE_URL: $publicSite, EXPO_PROJECT_ID: $project, EXPO_OWNER: $owner, EXPO_SLUG: $slug}' eas.json > "$RUNNER_TEMP/eas-production.json"
    mv "$RUNNER_TEMP/eas-production.json" eas.json
    if [[ "$GH_REPO" == disposabl-dev/create-disposabl-app ]]; then
      : "${ASC_APP_ID:?ASC app ID required}" "${APP_VERSION:?App version required}" "${RUNTIME:?Runtime required}"
      ipa="$RUNNER_TEMP/disposabl.ipa"
      check_source
      use_compiler_cache
      EAS_NO_VCS=1 bun x "$EAS_CLI" build --platform ios --profile ios-production --local --output "$ipa" --non-interactive --freeze-credentials
      if [[ "${USE_CCACHE:-}" == 1 ]]; then ccache --show-stats; fi
      test -s "$ipa"
      mkdir -p "$RUNNER_TEMP/ios-ipa"
      unzip -q "$ipa" -d "$RUNNER_TEMP/ios-ipa"
      app=$(find "$RUNNER_TEMP/ios-ipa/Payload" -maxdepth 1 -name '*.app' -type d -print -quit)
      test -n "$app"
      codesign --verify --deep --strict "$app"
      bash "$GITHUB_WORKSPACE/.github/scripts/validate-ios-ipa.sh" "$app"
      jq --arg id "$ASC_APP_ID" '.submit["ios-production"].ios.ascAppId = $id' eas.json > "$RUNNER_TEMP/eas-submit.json"
      mv "$RUNNER_TEMP/eas-submit.json" eas.json
      check_source
      bun x "$EAS_CLI" submit --platform ios --path "$ipa" --profile ios-production --non-interactive --wait
      mkdir -p "$GITHUB_WORKSPACE/.ios-provenance"
      jq -n --arg version "$APP_VERSION" --arg runtime "$RUNTIME" --arg build "$DISPOSABL_IOS_BUILD_NUMBER" --arg app "$ASC_APP_ID" --arg project "$EXPO_PROJECT_ID" --arg identifier "$IOS_IDENTIFIER" --arg digest "$(shasum -a 256 "$ipa" | cut -d' ' -f1)" --arg source "$SOURCE" '{version:$version,runtime:$runtime,build:$build,app:$app,project:$project,identifier:$identifier,digest:$digest,source:$source}' > "$GITHUB_WORKSPACE/.ios-provenance/build.json"
      report ready "EAS uploaded iOS $APP_VERSION ($DISPOSABL_IOS_BUILD_NUMBER) to TestFlight. App Review is a separate step."
      echo '### Submit for Store Review' >> "$GITHUB_STEP_SUMMARY"
      printf 'After Apple processes the upload, run `bun run store:review ios %s %s` with the local App Store Connect key.\n' "$APP_VERSION" "$DISPOSABL_IOS_BUILD_NUMBER" >> "$GITHUB_STEP_SUMMARY"
      exit 0
    fi
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
