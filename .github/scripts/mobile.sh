#!/usr/bin/env bash
set -euo pipefail
manifest() {
  bun x --no-install expo config --json | jq -ce --arg channel "${CHANNEL:-}" --arg runtime "${RUNTIME:-}" '
    def required($name): if type == "string" and (test("[^[:space:]]")) then . else error("Missing or invalid " + $name) end;
    {channel: ($channel | required("channel")), projectId: (.extra.eas.projectId | required("projectId")), applicationId: (.android.package | required("applicationId")), runtimeVersion: ($runtime | required("runtimeVersion") | if test("^[a-f0-9]{40,64}$") then . else error("Invalid runtimeVersion") end)}
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
    if (/^CONVEX_(URL|SITE_URL)$/.test(key) && value !== process.env[key]) throw new Error(`EAS overrides the deployed backend: ${key}`);
    if (/^(EXPO_PUBLIC_|VITE_)?CONVEX_(URL|SITE_URL)$/.test(key)) continue;
    if (/^(GITHUB_|RUNNER_|GH_|DISPOSABL_|BUN_|CI$|NODE_OPTIONS$|PATH$|HOME$|SOURCE(_PATH)?$|CHANNEL$|PLATFORM$|RELEASE_PREFIX$|MACOS_|EAS_(ENVIRONMENT|CLI)$|EXPO_(TOKEN|PROJECT_ID|OWNER|SLUG|NO_DOTENV)$)/.test(key)) throw new Error(`Reserved EAS variable: ${key}`);
    const delimiter = crypto.randomUUID();
    appendFileSync(process.env.GITHUB_ENV, `${key}<<${delimiter}\n${value}\n${delimiter}\n`);
  }
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
artifact=android.apk
export artifact
for ((page=1; ; page++)); do
  gh api "repos/$GH_REPO/releases?per_page=100&page=$page" > "$RUNNER_TEMP/releases.json"
  jq --arg artifact "$artifact" --arg tag "$RELEASE_PREFIX-$CHANNEL-android" --arg legacy "$RELEASE_PREFIX-$CHANNEL" '[.[] | select(.draft | not) | select(.tag_name == $tag or .tag_name == $legacy or (.tag_name | startswith($legacy + "-"))) | select(any(.assets[]; .name == $artifact))] | sort_by(.tag_name != $tag, .tag_name != $legacy) | .[0] // {}' "$RUNNER_TEMP/releases.json" > "$RUNNER_TEMP/release.json"
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
  const reusable = prior && Object.keys(wanted).every(k => prior[k] === wanted[k]) && /^[a-f0-9]{64}$/.test(prior.sha256 || "") && release.assets.some(a => a.name === process.env.artifact && a.state === "uploaded" && a.size > 0 && a.digest === `sha256:${prior.sha256}`);
  const blocked = !reusable && process.env.CHANNEL === "production" && process.env.ANDROID_SIGNING_READY !== "true";
  if (blocked) {
    const reason = "Configure Android production signing credentials before building a production APK.";
    console.error(`::notice::${reason}`);
    const report = Bun.spawnSync(["node", ".github/scripts/disposabl.mjs", "report", "android", "blocked", reason], {
      cwd: process.env.GITHUB_WORKSPACE, stdout: "inherit", stderr: "inherit",
    });
    if (report.exitCode) throw new Error("Cannot report Android prerequisites.");
  }
  console.log(`build=${blocked ? "blocked" : !reusable}\nruntime=${wanted.runtimeVersion}\ntag=${reusable ? release.tag_name : ""}\nsha=${reusable ? prior.sha256 : ""}`);
' >> "$GITHUB_OUTPUT"
    ;;
  expo-update)
artifact=android.apk
mkdir -p dist/release
gh release download "$TAG" --pattern "$artifact" --dir dist/release
echo "$SHA  dist/release/$artifact" | sha256sum --check
cd apps/mobile
MANIFEST=$(manifest)
bun x --no-install expo export --platform android --output-dir dist/update
test "$(bun x --no-install expo-updates runtimeversion:resolve --platform android --workflow managed | jq -er .runtimeVersion)" = "$RUNTIME"
test "$(gh api "repos/$GH_REPO/$SOURCE_PATH" --jq 'if has("head") then (if .state == "open" then .head.sha else "closed" end) else .object.sha end')" = "$SOURCE"
bun x "$EAS_CLI" update --platform android --channel "$CHANNEL" --environment "$EAS_ENVIRONMENT" --skip-bundler --input-dir dist/update --message "$SOURCE" --non-interactive
jq --arg sha "$SHA" '. + {sha256: $sha, action: "update"}' <<< "$MANIFEST" > ../../dist/release/android.json
    ;;
  android-build)
MANIFEST=$(manifest)
test "$(gh api "repos/$GH_REPO/$SOURCE_PATH" --jq 'if has("head") then (if .state == "open" then .head.sha else "closed" end) else .object.sha end')" = "$SOURCE"
if [[ "$CHANNEL" == production ]]; then
  if [[ -n "${DISPOSABL_ANDROID_SIGNING:-}" ]]; then
    signing_values=$(jq -er '[.keystoreBase64, .storePassword, .keyAlias, .keyPassword] | if all(.[]; type == "string" and length > 0 and (contains("\n") | not) and (contains("\r") | not)) then .[] else error("Invalid Android signing bundle") end' <<< "$DISPOSABL_ANDROID_SIGNING")
    mapfile -t signing <<< "$signing_values"
    for value in "${signing[@]}"; do printf '::add-mask::%s\n' "${value//%/%25}"; done
    export ANDROID_KEYSTORE_BASE64="${signing[0]}" ANDROID_KEYSTORE_PASSWORD="${signing[1]}" ANDROID_KEY_ALIAS="${signing[2]}" ANDROID_KEY_PASSWORD="${signing[3]}"
    unset signing_values signing value DISPOSABL_ANDROID_SIGNING
  fi
  : "${ANDROID_KEYSTORE_BASE64:?}" "${ANDROID_KEYSTORE_PASSWORD:?}" "${ANDROID_KEY_ALIAS:?}" "${ANDROID_KEY_PASSWORD:?}"
  export ANDROID_KEYSTORE_PATH="$RUNNER_TEMP/android-release.jks"
  trap 'rm -f "$ANDROID_KEYSTORE_PATH"' EXIT
  (umask 077; printf '%s' "$ANDROID_KEYSTORE_BASE64" | base64 --decode > "$ANDROID_KEYSTORE_PATH")
fi
bun x --no-install expo prebuild --platform android --no-install
test "$(bun x --no-install expo-updates runtimeversion:resolve --platform android --workflow managed | jq -er .runtimeVersion)" = "$RUNTIME"
task=assembleRelease
artifact=android.apk
binary=android/app/build/outputs/apk/release/app-release.apk
fingerprint=assets/fingerprint

(cd android && ./gradlew ":app:$task" --no-daemon --build-cache)
test "$(unzip -p "$binary" "$fingerprint")" = "$RUNTIME"
test "$(bun x --no-install expo-updates runtimeversion:resolve --platform android --workflow managed | jq -er .runtimeVersion)" = "$RUNTIME"
mkdir -p ../../dist/release
cp "$binary" "../../dist/release/$artifact"
jq --arg sha "$(sha256sum "$binary" | cut -d' ' -f1)" '. + {sha256: $sha, action: "build"}' <<< "$MANIFEST" > ../../dist/release/android.json
    ;;
  *) echo "Unknown operation: $1" >&2; exit 1 ;;
esac
