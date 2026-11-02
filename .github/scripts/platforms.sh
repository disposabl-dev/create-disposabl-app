#!/usr/bin/env bash
set -euo pipefail
if [[ "$GITHUB_JOB" == android || "$GITHUB_JOB" == ios ]]; then exit; fi
if [[ "$TRUSTED" != true ]]; then printf 'android=false\nios=false\ndesktop=[]\nselected=false\n' >> "$GITHUB_OUTPUT"; exit; fi
if [[ -n "$PR" ]]; then
  gh api "repos/$GH_REPO/pulls/$PR/files?per_page=100" --paginate --jq '.[] | .filename, (.previous_filename // empty)' > "$RUNNER_TEMP/changes"
elif [[ -z "$BEFORE" || "$BEFORE" =~ ^0+$ ]]; then echo disposabl.json > "$RUNNER_TEMP/changes"
else
  git -c credential.helper= -c 'credential.helper=!gh auth git-credential' fetch --depth=1 origin "$BEFORE"
  git diff --name-only --no-renames "$BEFORE" "$SOURCE" > "$RUNNER_TEMP/changes"
fi
node --input-type=module -e '
  import {readFileSync} from "node:fs";
  import {execFileSync} from "node:child_process";
  const relevant = p => p && !/(^|\/)\.agents\/|\.(md|mdx)$/.test(p);
  const paths = readFileSync(`${process.env.RUNNER_TEMP}/changes`, "utf8").split(/\r?\n/).filter(relevant);
  const enabled = JSON.parse(readFileSync("disposabl.json", "utf8")).platforms;
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
  const affected = (platform, directory) => enabled.includes(platform) && changes(platform).some(p => p.startsWith(directory) || /^(bun.lock$|package.json$|disposabl.json$|turbo.json$|bunfig.toml$|patches\/|\.github\/workflows\/pipeline.yml$|packages\/(?!backend\/|create-disposabl-app\/))/.test(p));
  const target = process.env.DISPOSABL_DESKTOP_PLATFORM;
  for (const platform of ["android", "ios"]) console.log(`${platform}=${platform === "android" && Boolean(process.env.EXPO_TOKEN) && !target && affected(platform, "apps/mobile/")}`); // Restore iOS selection when builds resume.
  const desktop = ["linux", "windows"].filter(platform => affected(platform, "apps/desktop/"))
    .map(platform => ({platform, runner: process.env[`${platform.toUpperCase()}_RUNNER`]}));
  console.log(`desktop=${JSON.stringify(desktop)}`);
' >> "$GITHUB_OUTPUT"
