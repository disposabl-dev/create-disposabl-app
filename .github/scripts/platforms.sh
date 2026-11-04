#!/usr/bin/env bash
set -euo pipefail
if [[ -n "$PR" ]]; then
  gh api "repos/$GH_REPO/pulls/$PR/files?per_page=100" --paginate --jq '.[] | .filename, (.previous_filename // empty)' > "$RUNNER_TEMP/changes"
else
  # Include commits from superseded/failed runs, not just the most recent push.
  baseline=$(gh api "repos/$GH_REPO/actions/workflows/pipeline.yml/runs?branch=main&event=push&status=success&per_page=1" --jq '.workflow_runs[0].head_sha // empty' 2>/dev/null || true)
  if [[ -n "$baseline" ]] && git -c credential.helper= -c 'credential.helper=!gh auth git-credential' fetch --depth=1 origin "$baseline"; then
    git diff --name-only --no-renames "$baseline" "$SOURCE" > "$RUNNER_TEMP/changes"
  else
    echo disposabl.json > "$RUNNER_TEMP/changes"
  fi
fi
node --input-type=module -e '
  import {existsSync, readFileSync} from "node:fs";
  import {execFileSync} from "node:child_process";
  // Markdown under docs/web can be shipped content. Contributor notes are not.
  const relevant = p => p && !/(^|\/)(README|AGENTS)\.md$|(^|\/)\.agents\//.test(p)
    && (!/\.(md|mdx)$/.test(p) || /^(apps\/web\/|packages\/docs\/)/.test(p));
  const paths = readFileSync(`${process.env.RUNNER_TEMP}/changes`, "utf8").split(/\r?\n/).filter(relevant);
  const config = JSON.parse(readFileSync("disposabl.json", "utf8"));
  const enabled = config.platforms;
  const faster = config.features?.includes("faster-ci");
  const runners = faster ? {linux: "blacksmith-2vcpu-ubuntu-2404", windows: "blacksmith-2vcpu-windows-2025", macos: "blacksmith-6vcpu-macos-26"} : {linux: "ubuntu-24.04", windows: "windows-2025", macos: "macos-26"};
  for (const [name, runner] of Object.entries(runners)) console.log(`${name}_runner=${runner}`);
  const api = path => JSON.parse(execFileSync("gh", ["api", `repos/${process.env.GH_REPO}/${path}`], {encoding: "utf8", stdio: ["ignore", "pipe", "ignore"]}));
  const changes = platform => {
    if (!process.env.PR) return paths;
    try {
      const release = api(`releases/tags/${process.env.RELEASE_PREFIX}-${process.env.CHANNEL}-${platform}`);
      const base = /^Source: ([a-f0-9]{40})$/m.exec(release.body || "")?.[1];
      if (release.draft || !base) return paths;
      if (base === process.env.SOURCE) return [];
      const diff = api(`compare/${base}...${process.env.SOURCE}`);
      // GitHub caps comparison files at 300; never skip on a truncated result.
      return !["ahead", "identical"].includes(diff.status) || !Array.isArray(diff.files) || diff.files.length >= 300 ? ["disposabl.json"] : diff.files.flatMap(f => [f.filename, f.previous_filename]).filter(relevant);
    } catch { return paths; }
  };
  const shared = p => /^(bun.lock$|package.json$|disposabl.json$|turbo.json$|bunfig.toml$|patches\/|vendor\/|\.github\/(workflows\/pipeline.yml$|scripts\/(platforms.sh|disposabl.mjs|release.sh)$))/.test(p);
  const affected = (platform, dependency) => enabled.includes(platform) && changes(platform).some(p => shared(p) || dependency.test(p));
  const mobile = /^(apps\/mobile\/|packages\/disposabl-kit\/|\.github\/scripts\/(mobile|apple)\.sh$)/;
  for (const platform of ["android", "ios"]) console.log(`${platform}=${(platform === "ios" || process.env.EXPO_CONNECTED === "true") && affected(platform, mobile)}`);
  const production = process.env.GITHUB_EVENT_NAME === "push" && process.env.GITHUB_REF === "refs/heads/main";
  const desktop = (production ? ["linux", "windows", "macos"] : []).filter(platform => affected(platform, /^apps\/desktop\//))
    .map(platform => ({platform, runner: runners[platform]}));
  console.log(`desktop=${JSON.stringify(desktop)}`);
  const packages = (production ? ["cli", "sdk"] : []).filter(name => {
    // This repository publishes its platform CLI before the generator in publish.yml.
    if (name === "cli" && process.env.GH_REPO === "disposabl-dev/create-disposabl-app") return false;
    return existsSync(`packages/${name}/package.json`)
      && enabled.includes(name === "sdk" ? "typescript-sdk" : name)
      && paths.some(p => shared(p) || p.startsWith(`packages/${name}/`) || /^(packages\/backend\/|packages\/disposabl-kit\/)/.test(p));
  });
  console.log(`packages=${JSON.stringify(packages)}`);
  console.log(`changed=${paths.length > 0}`);
' >> "$GITHUB_OUTPUT"
