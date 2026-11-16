#!/usr/bin/env bash
set -euo pipefail
set +x

verify_source() {
  [[ "${GITHUB_REF:-}" == refs/heads/main && "${EXPECTED_SOURCE_SHA:-}" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full main commit SHA' >&2; return 1; }
  [[ "$(git rev-parse HEAD)" == "$EXPECTED_SOURCE_SHA" && "${GITHUB_SHA:-}" == "$EXPECTED_SOURCE_SHA" ]] || { echo 'Checkout does not match requested source' >&2; return 1; }
  # Build and submit the immutable queued release even after main advances.
  # Fail closed if main was rewritten or the ancestry lookup fails.
  local comparison
  comparison=$(gh api "repos/$GITHUB_REPOSITORY/compare/$EXPECTED_SOURCE_SHA...main" --jq .status) || { echo 'Cannot verify build source on main' >&2; return 1; }
  case "$comparison" in
    ahead|identical) ;;
    *) echo 'Build source is no longer on main' >&2; return 1 ;;
  esac
}

case "${1:-}" in
  verify-source|verify-submission-source) verify_source ;;
  build)
    verify_source
    [[ "${UPDATE_POLICY:-}" == expo && "${EXPO_PROJECT_ID:-}" == 7609475b-183a-4488-b1b0-0d7cc35aaaf0 ]] || { echo 'Production updates require the Disposabl Expo project' >&2; exit 1; }
    [[ "${EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED:-}" == true ]] || { echo 'Production analytics must be enabled' >&2; exit 1; }
    [[ -z "${EXPO_PUBLIC_E2E:-}" ]] || { echo 'E2E is not permitted' >&2; exit 1; }
    for name in EXPO_PUBLIC_REVENUECAT_ANDROID_API_KEY EXPO_PUBLIC_REVENUECAT_ANDROID_MONTHLY_PRODUCT EXPO_PUBLIC_REVENUECAT_ANDROID_APP_ID EXPO_PUBLIC_REVENUECAT_ANDROID_TOPUP_PRODUCT; do
      [[ "${!name:-}" =~ [^[:space:]] ]] || { echo "Missing $name" >&2; exit 1; }
    done
    : "${DISPOSABL_ANDROID_SIGNING:?Missing signing bundle}"
    values=$(jq -er '[.keystoreBase64, .storePassword, .keyAlias, .keyPassword] | if all(.[]; type == "string" and length > 0 and (contains("\n") | not) and (contains("\r") | not)) then .[] else error("Invalid signing bundle") end' <<< "$DISPOSABL_ANDROID_SIGNING")
    signing=()
    while IFS= read -r value; do signing+=("$value"); done <<< "$values"
    [[ ${#signing[@]} == 4 ]] || exit 1
    for value in "${signing[@]}"; do printf '::add-mask::%s\n' "${value//%/%25}"; done
    export ANDROID_KEYSTORE_PASSWORD="${signing[1]}" ANDROID_KEY_ALIAS="${signing[2]}" ANDROID_KEY_PASSWORD="${signing[3]}"
    export ANDROID_KEYSTORE_PATH="$RUNNER_TEMP/play-upload.jks"
    trap 'rm -f "$ANDROID_KEYSTORE_PATH"' EXIT
    (umask 077; printf '%s' "${signing[0]}" | base64 --decode > "$ANDROID_KEYSTORE_PATH")
    unset signing values value DISPOSABL_ANDROID_SIGNING
    config=$(cd apps/mobile && bun x --no-install expo config --json)
    jq -e --arg policy "$UPDATE_POLICY" --arg project "$EXPO_PROJECT_ID" '
      .android.package == "com.yastai.disposabl" and
      .extra.disposablAndroidPayments == true and
      .extra.disposablAndroidArchitectures == ["arm64-v8a", "x86_64"] and
      $policy == "expo" and .extra.eas.projectId == $project and .updates.enabled != false and .updates.url == ("https://u.expo.dev/" + $project) and .updates.requestHeaders == {"expo-channel-name":"production"} and .android.runtimeVersion.policy == "fingerprint"
    ' <<< "$config" >/dev/null || { echo 'Production Expo configuration does not match selected policy' >&2; exit 1; }
    node apps/mobile/scripts/play-aab.mjs
    ;;
  *) echo 'Expected verify-source, verify-submission-source or build' >&2; exit 2 ;;
esac
