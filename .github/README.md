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
4. Each platform publishes from its existing build runner as soon as its own
   build and verification succeed. Android publishes from Web; Linux, Windows
   and macOS publish independently. There is no final Release job or artifact transfer.

Each PR has one published prerelease per affected platform at
`<RELEASE_PREFIX>-<CHANNEL>-<PLATFORM>`, for example `app-pr-2-macos`.
Successful updates replace its assets and notes, remove obsolete assets and move
that platform's preview tag to the tested commit. A failed platform build leaves
its previous preview available and does not block other platforms.
New releases are drafts only during their initial upload, then become public.
Production publishes regular releases with separate tags per platform and run.
Platform releases do not compete for GitHub's single Latest label with the CLI's
semantic-release publication. Desktop package versions remain `1.0.<run number>`.

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

A full preview uses three 4-vCPU build runners and one 6-vCPU macOS runner.
Publishing reuses those machines. There is no separate Plan, Android or Release
runner. Install the Blacksmith GitHub App for the repository.

Bun cache keys include OS, architecture, Bun version and lockfile. Each fresh
runner installs from that cache; `node_modules` is not transferred between OSes.
Turbo caches checks and web builds. Gradle caches dependencies and cacheable build
outputs; Electron downloads have their own cache. Build outputs upload directly
to GitHub Releases without an intermediate Actions artifact. Superseded PR runs
cancel; production runs serialize.

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
The Web/Android and desktop jobs have contents-write permission for their own
releases. Forks never deploy or publish; checkout does not persist credentials.
Each platform verifies its expected files and source commit before publication.

Benchmark branches are separate from this product workflow. Build-only benchmark
URLs and cache timings do not prove a live backend deployment or device behavior.
