#!/usr/bin/env bash
set -euo pipefail
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
