#!/usr/bin/env bash
set -euo pipefail
artifact=android.apk
[[ "$CHANNEL" != production ]] || artifact=android.aab
export artifact
for ((page=1; ; page++)); do
  gh api "repos/$GH_REPO/releases?per_page=100&page=$page" > "$RUNNER_TEMP/releases.json"
  jq --arg artifact "$artifact" --arg tag "$RELEASE_PREFIX-$CHANNEL-android" --arg legacy "$RELEASE_PREFIX-$CHANNEL" '[.[] | select(.draft | not) | select(.tag_name == $tag or .tag_name == $legacy or (.tag_name | startswith($legacy + "-"))) | select(any(.assets[]; .name == $artifact))] | sort_by(.tag_name != $tag, .tag_name != $legacy) | .[0] // {}' "$RUNNER_TEMP/releases.json" > "$RUNNER_TEMP/release.json"
  if jq -e '.id' "$RUNNER_TEMP/release.json" > /dev/null || [[ $(jq length "$RUNNER_TEMP/releases.json") -lt 100 ]]; then break; fi
done
bun x --no-install expo config --json > "$RUNNER_TEMP/mobile.json"
RUNTIME=$(bun x --no-install expo-updates runtimeversion:resolve --platform android --workflow managed | jq -er 'select(.fingerprintSources != null) | .runtimeVersion | select(test("^[a-f0-9]{40,64}$"))')
export RUNTIME
bun -e '
  const config = await Bun.file(`${process.env.RUNNER_TEMP}/mobile.json`).json();
  if (!config.extra?.eas?.projectId) throw new Error("Link an Expo project first");
  const wanted = {channel: process.env.CHANNEL, projectId: config.extra.eas.projectId, applicationId: config.android.package, runtimeVersion: process.env.RUNTIME};
  const release = await Bun.file(`${process.env.RUNNER_TEMP}/release.json`).json();
  const prior = JSON.parse(/<!-- android (\{[^\n]+\}) -->/.exec(release.body || "")?.[1] || "null");
  const reusable = prior && Object.keys(wanted).every(k => prior[k] === wanted[k]) && /^[a-f0-9]{64}$/.test(prior.sha256 || "") && release.assets.some(a => a.name === process.env.artifact && a.state === "uploaded" && a.size > 0 && a.digest === `sha256:${prior.sha256}`);
  const blocked = !reusable && process.env.CHANNEL === "production" && process.env.ANDROID_SIGNING_READY !== "true";
  if (blocked) {
    const reason = "Configure Android production signing credentials before building an AAB.";
    console.error(`::notice::${reason}`);
    const report = Bun.spawnSync(["node", ".github/scripts/disposabl.mjs", "report", "android", "blocked", reason], {
      cwd: process.env.GITHUB_WORKSPACE, stdout: "inherit", stderr: "inherit",
    });
    if (report.exitCode) throw new Error("Cannot report Android prerequisites.");
  }
  console.log(`build=${blocked ? "blocked" : !reusable}\nruntime=${wanted.runtimeVersion}\nmanifest=${JSON.stringify(wanted)}\ntag=${reusable ? release.tag_name : ""}\nsha=${reusable ? prior.sha256 : ""}`);
' >> "$GITHUB_OUTPUT"
