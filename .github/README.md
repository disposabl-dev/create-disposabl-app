# Preview pipeline

`pipeline.yml` runs directly in this repository and is included in generated apps.
All preview decisions are visible in the workflow. There are no `preview.mjs`
helpers or local development setup hooks. Backend development uses `convex dev`.

## Order

1. **Web** checks the source and deploys backend and web.
2. **Android**, **Linux** and **Windows** start independently after Web succeeds,
   when enabled in `disposabl.json` and affected by the changes.
3. Android checks the latest released APK on a 2-vCPU Blacksmith runner. A matching
   project, application ID, channel and fingerprint uses EAS Update on that runner.
   A different fingerprint or missing compatible APK starts **APK** on 4 vCPU.
4. **Release** collects successful outputs into one prerelease, or a stable release
   for main. Skipped native jobs do not block publishing.

**iOS and macOS are always skipped**, even when listed in `disposabl.json`.
They have no fingerprint checks, builds, updates or runners in this workflow.
Local build commands remain available for later development.

## Selection

Mobile changes select Android; desktop changes select Linux and Windows. Shared
packages, lockfiles and platform configuration select all enabled supported
native targets. Web, backend-only and documentation changes skip native jobs.
PR selection uses the whole PR diff so a cancelled earlier commit cannot hide a
pending native change. Main uses the complete pushed commit range. Fork PRs only
validate on Blacksmith Linux; they never deploy or publish.

## Runners and caches

Every job uses Blacksmith. GitHub Actions schedules the jobs and displays their
graph; there are no GitHub-hosted or Boat runners.

Blacksmith uses 2 vCPU for Android checks, Linux, Windows and publishing, and
4 vCPU for Web and APK builds. Install the Blacksmith GitHub App for the repository.

Bun cache keys include OS, architecture, Bun version and lockfile. Each fresh
runner installs from that cache; `node_modules` is not transferred between OSes.
Turbo caches checks and web builds. Gradle caches dependencies and cacheable build
outputs; Electron downloads have their own cache. Artifacts use zero compression
and one-day retention. Superseded PR runs cancel; production runs serialize.

Default branch caches can seed previews; sibling
PR caches are not automatically shared. No cache access policy is changed here.
Native compilation and external deployment can take longer than one minute.

## Configuration

Web requires `CONVEX_DEPLOY_KEY_PREVIEW` for PRs and `CONVEX_DEPLOY_KEY` for main.
Android requires `EXPO_TOKEN` plus `EXPO_PROJECT_ID`, `EXPO_OWNER` and `EXPO_SLUG`
repository variables. See [mobile setup](../apps/mobile/README.md) for signing.
Only the Release job gets contents-write permission. Native build failure leaves
web deployed but prevents publishing a partial native release.

Benchmark branches are separate from this product workflow. Build-only benchmark
URLs and cache timings do not prove a live backend deployment or device behavior.
