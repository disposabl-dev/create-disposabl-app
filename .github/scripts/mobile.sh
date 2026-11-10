#!/usr/bin/env bash
set -euo pipefail
signing() {
  ANDROID_SIGNING_MODE=fallback
  ANDROID_SIGNING_ID=fallback
  if [[ -n "${DISPOSABL_ANDROID_SIGNING:-}" ]]; then
    [[ -z "${ANDROID_KEYSTORE_BASE64:-}${ANDROID_KEYSTORE_PASSWORD:-}${ANDROID_KEY_ALIAS:-}${ANDROID_KEY_PASSWORD:-}" ]] || { echo 'Conflicting Android signing inputs' >&2; return 1; }
    local values
    values=$(jq -er '[.keystoreBase64, .storePassword, .keyAlias, .keyPassword] | if all(.[]; type == "string" and length > 0 and (contains("\n") | not) and (contains("\r") | not)) then .[] else error("Invalid Android signing bundle") end' <<< "$DISPOSABL_ANDROID_SIGNING")
    local -a parts
    mapfile -t parts <<< "$values"
    export ANDROID_KEYSTORE_BASE64="${parts[0]}" ANDROID_KEYSTORE_PASSWORD="${parts[1]}" ANDROID_KEY_ALIAS="${parts[2]}" ANDROID_KEY_PASSWORD="${parts[3]}"
    for value in "${parts[@]}"; do printf '::add-mask::%s\n' "${value//%/%25}"; done
  fi
  if [[ -n "${ANDROID_KEYSTORE_BASE64:-}${ANDROID_KEYSTORE_PASSWORD:-}${ANDROID_KEY_ALIAS:-}${ANDROID_KEY_PASSWORD:-}" ]]; then
    : "${ANDROID_KEYSTORE_BASE64:?Incomplete signing}" "${ANDROID_KEYSTORE_PASSWORD:?Incomplete signing}" "${ANDROID_KEY_ALIAS:?Incomplete signing}" "${ANDROID_KEY_PASSWORD:?Incomplete signing}"
    export ANDROID_KEYSTORE_PATH="$RUNNER_TEMP/android-release.jks"
    (umask 077; printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$ANDROID_KEYSTORE_PATH")
    keytool -list -keystore "$ANDROID_KEYSTORE_PATH" -storepass "$ANDROID_KEYSTORE_PASSWORD" -alias "$ANDROID_KEY_ALIAS" >/dev/null
    local check="$RUNNER_TEMP/android-key-check.p12"
    rm -f "$check"
    keytool -importkeystore -noprompt -srckeystore "$ANDROID_KEYSTORE_PATH" -srcstorepass "$ANDROID_KEYSTORE_PASSWORD" -srcalias "$ANDROID_KEY_ALIAS" -srckeypass "$ANDROID_KEY_PASSWORD" -destkeystore "$check" -deststoretype PKCS12 -deststorepass "$ANDROID_KEYSTORE_PASSWORD" >/dev/null 2>&1 || { rm -f "$check"; echo 'Invalid Android key password' >&2; return 1; }
    rm -f "$check"
    ANDROID_SIGNING_MODE=release
    ANDROID_SIGNING_ID=$(keytool -exportcert -keystore "$ANDROID_KEYSTORE_PATH" -storepass "$ANDROID_KEYSTORE_PASSWORD" -alias "$ANDROID_KEY_ALIAS" | sha256sum | cut -d' ' -f1)
  fi
  export ANDROID_SIGNING_MODE ANDROID_SIGNING_ID
}
manifest() {
  bun x --no-install expo config --json | jq -ce --arg channel "${CHANNEL:-}" --arg runtime "${RUNTIME:-}" --arg signing "${ANDROID_SIGNING_MODE:-fallback}" --arg signingId "${ANDROID_SIGNING_ID:-fallback}" '
    def required($name): if type == "string" and (test("[^[:space:]]")) then . else error("Missing or invalid " + $name) end;
    {signing: $signing, signingId: $signingId, channel: ($channel | required("channel")), projectId: (.extra.eas.projectId | required("projectId")), applicationId: (.android.package | required("applicationId")), runtimeVersion: ($runtime | required("runtimeVersion") | if test("^[a-f0-9]{40,64}$") then . else error("Invalid runtimeVersion") end), androidArchitectures: (.extra.disposablAndroidArchitectures | if type == "array" and length > 0 then . else error("Missing Android architectures") end)}
  '
}
case "${1:?operation required}" in
  expo-env)
if [[ -z "$EXPO_PROJECT_ID" ]]; then
  # Initialize with static config; app.config.js reads the resulting environment.
  mkdir -p "$RUNNER_TEMP/expo-project"
  jq --slurpfile app ../../disposabl.json --arg owner "${EXPO_OWNER:-}" '
    {expo: {name: .expo.name, slug: (if $app[0].appId then "app-" + $app[0].appId else .expo.slug end)}}
    | if $owner != "" then .expo.owner = $owner else . end
  ' app.json > "$RUNNER_TEMP/expo-project/app.json"
  printf '{"name":"expo-project","private":true}\n' > "$RUNNER_TEMP/expo-project/package.json"
  (
    cd "$RUNNER_TEMP/expo-project"
    set -- init --force --non-interactive --json --no-icon
    [[ -z "${EXPO_OWNER:-}" ]] || set -- "$@" --account "$EXPO_OWNER"
    bun x "$EAS_CLI" "$@"
  ) > "$RUNNER_TEMP/expo-project.json"
  EXPO_PROJECT_ID=$(jq -er .projectId "$RUNNER_TEMP/expo-project.json")
  EXPO_OWNER=$(jq -er .owner "$RUNNER_TEMP/expo-project.json")
  EXPO_SLUG=$(jq -er .slug "$RUNNER_TEMP/expo-project.json")
  export EXPO_PROJECT_ID EXPO_OWNER EXPO_SLUG
  printf 'EXPO_PROJECT_ID=%s\nEXPO_OWNER=%s\nEXPO_SLUG=%s\n' "$EXPO_PROJECT_ID" "$EXPO_OWNER" "$EXPO_SLUG" >> "$GITHUB_ENV"
fi
jq --arg channel "$CHANNEL" '.build["ios-" + env.EAS_ENVIRONMENT].channel = $channel' eas.json > "$RUNNER_TEMP/eas.json"
mv "$RUNNER_TEMP/eas.json" eas.json
bun x "$EAS_CLI" env:pull --environment "$EAS_ENVIRONMENT" --path "$RUNNER_TEMP/expo.env" --non-interactive
bun -e '
  import {parseEnv} from "node:util";
  import {appendFileSync, readFileSync} from "node:fs";
  for (const [key, value] of Object.entries(parseEnv(readFileSync(`${process.env.RUNNER_TEMP}/expo.env`, "utf8")))) {
    // Web and mobile use the same backend from this deployment.
    const backend = /^(?:EXPO_PUBLIC_|VITE_)?(CONVEX_(?:URL|SITE_URL))$/.exec(key);
    if (backend) {
      if (value !== process.env[backend[1]]) throw new Error(`EAS overrides the deployed backend: ${key}`);
      continue;
    }
    if (/^(GITHUB_|RUNNER_|GH_|DISPOSABL_|BUN_|CI$|NODE_OPTIONS$|PATH$|HOME$|SOURCE(_PATH)?$|CHANNEL$|PLATFORM$|RELEASE_PREFIX$|MACOS_|EAS_(ENVIRONMENT|CLI)$|EXPO_(TOKEN|PROJECT_ID|OWNER|SLUG|NO_DOTENV)$)/.test(key)) throw new Error(`Reserved EAS variable: ${key}`);
    if (key === "EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED") continue;
    const delimiter = crypto.randomUUID();
    appendFileSync(process.env.GITHUB_ENV, `${key}<<${delimiter}\n${value}\n${delimiter}\n`);
  }
  const site = JSON.parse(readFileSync("../web/site.json", "utf8"));
  const app = JSON.parse(readFileSync("../../disposabl.json", "utf8"));
  const enabled = process.env.CHANNEL === "production" && process.env.E2E_TELEMETRY_DISABLED !== "1" && app.features.includes("analytics") && !!(app.productionConvexSiteUrl || site.backendOrigin) && (app.productionConvexSiteUrl || site.backendOrigin) === process.env.CONVEX_SITE_URL;
  appendFileSync(process.env.GITHUB_ENV, `EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED=${enabled}\n`);
'
    ;;
  expo-channel)
for ((offset=0; ; offset+=25)); do
  bun x "$EAS_CLI" channel:list --json --limit 25 --offset "$offset" > "$RUNNER_TEMP/channels.json"
  if jq -e --arg channel "$CHANNEL" 'any(.currentPage[]; .name == $channel)' "$RUNNER_TEMP/channels.json" > /dev/null; then
    jq -e --arg channel "$CHANNEL" '.currentPage[] | select(.name == $channel) | (.isPaused == false) and (.updateBranches | length == 1) and (.updateBranches[0].name == $channel) and ((.branchMapping | fromjson).data == [{branchId: .updateBranches[0].id, branchMappingLogic: "true"}])' "$RUNNER_TEMP/channels.json" > /dev/null || { echo 'Preview channel must point only to its same-named branch'; exit 1; }
    break
  fi
  if [[ $(jq '.currentPage | length' "$RUNNER_TEMP/channels.json") -lt 25 ]]; then bun x "$EAS_CLI" channel:create "$CHANNEL" --non-interactive; break; fi
done
    ;;
  expo-fingerprint)
signing
trap 'rm -f "${ANDROID_KEYSTORE_PATH:-}"' EXIT
artifact=android.apk
export artifact
for ((page=1; ; page++)); do
  gh api "repos/$GH_REPO/releases?per_page=100&page=$page" > "$RUNNER_TEMP/releases.json"
  jq --arg artifact "$artifact" --arg tag "$RELEASE_PREFIX-$CHANNEL-android" --arg channel "$CHANNEL" '[.[] | select(.draft | not) | select(.tag_name == $tag or ($channel == "production" and (.tag_name | startswith($tag + "-")) and (.tag_name | ltrimstr($tag + "-") | test("^[0-9]+-[0-9]+$")))) | select(any(.assets[]; .name == $artifact))] | sort_by(.tag_name != $tag) | .[0] // {}' "$RUNNER_TEMP/releases.json" > "$RUNNER_TEMP/release.json"
  if jq -e '.id' "$RUNNER_TEMP/release.json" > /dev/null || [[ $(jq length "$RUNNER_TEMP/releases.json") -lt 100 ]]; then break; fi
done
RUNTIME=$(bun x --no-install expo-updates runtimeversion:resolve --platform android --workflow managed | jq -er 'select(.fingerprintSources != null) | .runtimeVersion | select(test("^[a-f0-9]{40,64}$"))')
export RUNTIME
MANIFEST=$(manifest)
export MANIFEST
bun -e '
  const wanted = JSON.parse(process.env.MANIFEST);
  const release = await Bun.file(`${process.env.RUNNER_TEMP}/release.json`).json();
  const prior = JSON.parse(/<!-- android (\{[^\n]+\}) -->/.exec(release.body || "")?.[1] || "null");
  const reusable = wanted.signing === "fallback" && process.env.ANDROID_PLAY_SUBMIT !== "true" && prior && Object.keys(wanted).every(k => JSON.stringify(prior[k]) === JSON.stringify(wanted[k])) && /^[a-f0-9]{64}$/.test(prior.sha256 || "") && release.assets.some(a => a.name === process.env.artifact && a.state === "uploaded" && a.size > 0 && a.digest === `sha256:${prior.sha256}`);
  console.log(`build=${!reusable}\nruntime=${wanted.runtimeVersion}\ntag=${reusable ? release.tag_name : ""}\nsha=${reusable ? prior.sha256 : ""}`);
' >> "$GITHUB_OUTPUT"
    ;;
  expo-update)
signing
trap 'rm -f "${ANDROID_KEYSTORE_PATH:-}"' EXIT
artifact=android.apk
mkdir -p dist/release
gh release download "$TAG" --pattern "$artifact" --dir dist/release
echo "$SHA  dist/release/$artifact" | sha256sum -c -
cd apps/mobile
MANIFEST=$(manifest)
bun x --no-install expo export --platform android --output-dir dist/update
test "$(bun x --no-install expo-updates runtimeversion:resolve --platform android --workflow managed | jq -er .runtimeVersion)" = "$RUNTIME"
test "$(gh api "repos/$GH_REPO/$SOURCE_PATH" --jq 'if has("head") then (if .state == "open" then .head.sha else "closed" end) else .object.sha end')" = "$SOURCE"
bun x "$EAS_CLI" update --platform android --channel "$CHANNEL" --environment "$EAS_ENVIRONMENT" --skip-bundler --input-dir dist/update --message "$SOURCE" --non-interactive
jq --arg sha "$SHA" --arg tag "$TAG" '. + {sha256: $sha, action: "update", sourceTag: $tag}' <<< "$MANIFEST" > ../../dist/release/android.json
# The trusted publisher retrieves this verified binary from its existing release.
# Actions only needs the new OTA metadata, not another copy of the same APK.
rm "../../dist/release/$artifact"
    ;;
  android-build)
signing
trap 'rm -f "${ANDROID_KEYSTORE_PATH:-}"' EXIT
bash ../../.github/scripts/android-runner.sh check
MANIFEST=$(manifest)
test "$(gh api "repos/$GH_REPO/$SOURCE_PATH" --jq 'if has("head") then (if .state == "open" then .head.sha else "closed" end) else .object.sha end')" = "$SOURCE"
bun x --no-install expo prebuild --platform android --no-install
test "$(bun x --no-install expo-updates runtimeversion:resolve --platform android --workflow managed | jq -er .runtimeVersion)" = "$RUNTIME"
artifact=android.apk
binary=android/app/build/outputs/apk/release/app-release.apk
fingerprint=assets/fingerprint

(cd android && bash ../../../.github/scripts/android-runner.sh build)
if [[ "$CHANNEL" == production && "$ANDROID_SIGNING_MODE" == release ]]; then
  (cd android && ./gradlew :app:bundleRelease --no-daemon --build-cache)
  test -s android/app/build/outputs/bundle/release/app-release.aab
  mkdir -p ../../dist/release
  cp android/app/build/outputs/bundle/release/app-release.aab ../../dist/release/android.aab
else
  echo 'Fallback-signed APK is not Play-ready.'
fi
node ../../.github/scripts/verify-android-abis.mjs "$binary" "$MANIFEST"
test "$(unzip -p "$binary" "$fingerprint")" = "$RUNTIME"
test "$(bun x --no-install expo-updates runtimeversion:resolve --platform android --workflow managed | jq -er .runtimeVersion)" = "$RUNTIME"
mkdir -p ../../dist/release
cp "$binary" "../../dist/release/$artifact"
aab_sha=""
if [[ -f ../../dist/release/android.aab ]]; then aab_sha=$(sha256sum ../../dist/release/android.aab | cut -d' ' -f1); fi
jq --arg sha "$(sha256sum "$binary" | cut -d' ' -f1)" --arg aab "$aab_sha" '. + {sha256: $sha, aabSha256: $aab, action: "build"}' <<< "$MANIFEST" > ../../dist/release/android.json
    ;;
  android-submit)
: "${EXPO_TOKEN:?Expo token required}" "${EXPO_PROJECT_ID:?Expo project required}" "${ANDROID_PLAY_SERVICE_ACCOUNT:?Play service account required}" "${ANDROID_PLAY_TRACK:?Play track required}" "${ANDROID_PLAY_UPLOAD_CERT_SHA256:?Play upload certificate SHA256 required}"
[[ "$ANDROID_PLAY_TRACK" =~ ^(internal|alpha|beta|production)$ ]] || { echo 'Invalid Play track' >&2; exit 1; }
[[ "$ANDROID_PLAY_UPLOAD_CERT_SHA256" =~ ^[a-f0-9]{64}$ ]] || { echo 'Invalid Play upload certificate SHA256' >&2; exit 1; }
jq -e --arg cert "$ANDROID_PLAY_UPLOAD_CERT_SHA256" '.signing == "release" and .signingId == $cert' ../../dist/release/android.json >/dev/null || { echo 'Android upload certificate mismatch' >&2; exit 1; }
test -s ../../dist/release/android.aab || { echo 'Signed Android bundle required for submission' >&2; exit 1; }
printf '%s  %s\n' "$(jq -er '.aabSha256 | select(test("^[a-f0-9]{64}$"))' ../../dist/release/android.json)" ../../dist/release/android.aab | sha256sum -c -
jq -e '.type == "service_account" and (.client_email | type == "string" and length > 0) and (.private_key | type == "string" and length > 0)' <<< "$ANDROID_PLAY_SERVICE_ACCOUNT" >/dev/null
key="$RUNNER_TEMP/play-service-account.json"
(umask 077; printf '%s' "$ANDROID_PLAY_SERVICE_ACCOUNT" > "$key")
cp eas.json "$RUNNER_TEMP/eas-original.json"
trap 'mv "$RUNNER_TEMP/eas-original.json" eas.json; rm -f "$key"' EXIT
jq --arg key "$key" --arg track "$ANDROID_PLAY_TRACK" '.submit.production.android = {serviceAccountKeyPath: $key, track: $track, releaseStatus: "draft"}' "$RUNNER_TEMP/eas-original.json" > eas.json
test "$(gh api "repos/$GH_REPO/$SOURCE_PATH" --jq 'if has("head") then (if .state == "open" then .head.sha else "closed" end) else .object.sha end')" = "$SOURCE"
bun x "$EAS_CLI" submit --platform android --profile production --path ../../dist/release/android.aab --non-interactive --wait
    ;;
  *) echo "Unknown operation: $1" >&2; exit 1 ;;
esac
