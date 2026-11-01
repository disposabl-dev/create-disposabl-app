# Preview pipeline

`pipeline.yml` runs directly in this repository and is included in generated apps.
All preview decisions are visible in the workflow. There are no `preview.mjs`
helpers or local development setup hooks. Backend development uses `convex dev`.

## Order

1. **Web**, **Linux** and **Windows** start in parallel on 4-vCPU Blacksmith runners.
   **macOS** joins them on a 6-vCPU Blacksmith Apple Silicon runner.
   Platform selection runs inline, with no separate Plan job. Each desktop runner
   checks whether it is enabled and affected before installing dependencies.
2. Web checks the source and deploys backend and web, then checks the Android
   fingerprint on the same runner.
3. A matching project, application ID, channel and fingerprint uses EAS Update.
   A different fingerprint or missing compatible APK builds Android on that same
   runner, reusing its checkout and installed dependencies.
4. **Release** collects successful outputs into one prerelease, or a stable release
   for main. It runs on a 2-vCPU Blacksmith runner after all builds finish.

Each PR has one published prerelease at `app-<CHANNEL>` (normally `app-pr-N`).
Successful updates replace its assets and notes, remove obsolete assets and move
the preview tag to the tested commit. Failed builds leave the previous preview.
New releases are drafts only during their initial upload, then become public.
Production keeps a separate tag per run and is marked as the latest stable release.

**iOS native builds are skipped.** When iOS is enabled and affected,
Web computes its fingerprint and checks the latest finished internal EAS build
for the same channel and bundle ID. A matching, unexpired iPhone IPA receives an
EAS Update; a missing or different runtime is reported as requiring a manual IPA.
The macOS desktop runner does not build iOS. See [iOS setup](../apps/mobile/README.md#ios).

`CHANNEL` at the top is the single preview-name expression. Convex preview names,
EAS channels, EAS branches and mobile builds all use it. The default is `pr-N` for
PRs and `production` for main. Runner labels and tool versions are also at the top.

## Selection

Mobile changes select Android and iOS; desktop changes select Linux, Windows and macOS. Shared
packages, lockfiles and platform configuration select all enabled supported
native targets. Web, backend-only and documentation changes skip native installs
and builds. Desktop runners still start briefly to make that decision; forks skip
the desktop jobs entirely.
PR selection uses the whole PR diff so a cancelled earlier commit cannot hide a
pending native change. Main uses the complete pushed commit range. Fork PRs only
validate on Blacksmith Linux; they never deploy or publish.

## Runners and caches

Every job uses Blacksmith. GitHub Actions schedules the jobs and displays their
graph; there are no GitHub-hosted or Boat runners.

A full preview uses three 4-vCPU build runners, one 6-vCPU macOS runner and one
final 2-vCPU publishing runner. There is no separate Plan or Android runner. Install the Blacksmith
GitHub App for the repository.

Bun cache keys include OS, architecture, Bun version and lockfile. Each fresh
runner installs from that cache; `node_modules` is not transferred between OSes.
Turbo caches checks and web builds. Gradle caches dependencies and cacheable build
outputs; Electron downloads have their own cache. Artifacts use zero compression
and one-day retention. Superseded PR runs cancel; production runs serialize.

Default branch caches can seed previews; sibling
PR caches are not automatically shared. No cache access policy is changed here.
Thirty to forty seconds is a warm update-only target, not a measured guarantee.
Native compilation and external deployment can take longer than one minute.
Compare the same commit with warm caches before increasing runner size; use a
larger runner only when it saves close to half the end-to-end time or more.
The 4-vCPU configuration is a candidate until comparable cold/warm runs verify it.

## Configuration

Web requires `CONVEX_DEPLOY_KEY_PREVIEW` for PRs and `CONVEX_DEPLOY_KEY` for main.
Mobile previews require `EXPO_TOKEN` plus `EXPO_PROJECT_ID`, `EXPO_OWNER` and `EXPO_SLUG`
repository variables. See [mobile setup](../apps/mobile/README.md) for signing.
macOS signing and notarization use the five optional
[desktop signing secrets](../apps/desktop/README.md#macos-signing). With all five
present, both previews and production are Developer ID signed and notarized.
Otherwise, both publish an ad hoc signed, unnotarized Apple Silicon DMG with its
status and installation guidance in the release notes. Configured signing or
notarization failures still fail the job. Apple notarization adds external
processing time. `MACOS_BUNDLE_ID` configures the app identifier.
Only the Release job gets contents-write permission. Native build failure leaves
web deployed but prevents publishing a partial native release.

Benchmark branches are separate from this product workflow. Build-only benchmark
URLs and cache timings do not prove a live backend deployment or device behavior.
