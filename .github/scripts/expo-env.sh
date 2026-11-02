#!/usr/bin/env bash
set -euo pipefail
if [[ -z "$EXPO_PROJECT_ID" ]]; then
  # Initialize with static config; app.config.js reads the resulting environment.
  mkdir -p "$RUNNER_TEMP/expo-project"
  jq --slurpfile app ../../disposabl.json --arg owner "${EXPO_OWNER:-}" '
    {expo: {name: .expo.name, slug: (if $app[0].appId then "app-" + $app[0].appId else .expo.slug end)}}
    | if $owner != "" then .expo.owner = $owner else . end
  ' app.json > "$RUNNER_TEMP/expo-project/app.json"
  printf '{"name":"expo-project","private":true}\n' > "$RUNNER_TEMP/expo-project/package.json"
  account=()
  [[ -z "${EXPO_OWNER:-}" ]] || account=(--account "$EXPO_OWNER")
  (cd "$RUNNER_TEMP/expo-project" && bun x "$EAS_CLI" init --force --non-interactive --json --no-icon "${account[@]}") > "$RUNNER_TEMP/expo-project.json"
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
