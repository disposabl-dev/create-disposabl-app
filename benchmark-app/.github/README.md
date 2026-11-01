# CI and deployment

The app runs GitHub Actions on Boat's 4-CPU runner. Install the
[Boat CI GitHub App](https://docs.boat.dev/ci) for the repository with
`boat ci connect` before pushing. This connects the installation to the current
Boat billing account. It does not require a personal GitHub token or a Boat API
key in the workflow.

Boat CI requires a paid Boat plan. Public repositories also require explicit
enablement in Boat and an allowlist of GitHub users. Fork pull requests use
`ubuntu-latest` and build without deployment secrets.

Keep these repository or organization secrets in GitHub Actions:

- `CONVEX_DEPLOY_KEY`: production deploy key.
- `CONVEX_DEPLOY_KEY_PREVIEW`: project preview deploy key.

Do not move them to Boat environments. Boat CI deliberately does not inherit
those environments. GitHub supplies the workflow's secrets and job token.
`actions/cache` continues to store the Turbo cache through GitHub Actions.

Same-repository pull requests deploy branch previews. Pushing to `main` deploys
production. Set the GitHub Actions repository variable `DISPOSABL_CI_RUNNER` to
`boat-small` for 2 CPUs, `boat` for 4 CPUs, or `ubuntu-latest` for GitHub's runner.
Without the variable, normal jobs use `boat`.

## Native previews and releases

One generated `.github/workflows/pipeline.yml` owns checks, web/backend deployment,
native builds, and publication. The generator source keeps this file as
`pipeline.yml.template`; packaging renames it. Select targets in `disposabl.json`:

```json
{ "platforms": ["web", "android", "ios", "windows", "linux", "macos"] }
```

After shared checks and deployment, selected native jobs run in parallel:

| Target  | Runner                  | Release files                                            |
| ------- | ----------------------- | -------------------------------------------------------- |
| Android | Boat/Linux              | `android.apk`, built locally or reused after EAS Update  |
| iOS     | `macos-26`, Xcode 26.4+ | Signed `ios-device.ipa`; optional `ios-simulator.tar.gz` |
| Windows | `windows-2025`, x64     | Squirrel `.exe`, `.nupkg`, `RELEASES`                    |
| Linux   | Boat/Linux, x64         | `.deb`, `.rpm`                                           |
| macOS   | `macos-15`, arm64       | ZIP containing `.app`                                    |

Android compares Expo's runtime fingerprint with the channel's latest published
APK. A match publishes EAS Update and copies that APK into the new release after
checking its SHA-256. A changed fingerprint or absent APK triggers a local Gradle
build. iOS and desktop make binaries on every trusted preview. Only selected
platforms run; web-only apps need no Expo or native signing configuration.

The final publisher is the only job with `contents: write`. It checks every
selected platform's source commit, channel, version and file checksums, uploads
to a draft, then publishes one prerelease after all files succeed. A failed
native lane leaves web available and workflow artifacts available for one day,
but does not publish an incomplete release. Android OTA publication is independent:
an update may already be live when another platform fails. Failed drafts never
become the Android binary baseline.

PR channels are `pr-<number>`, with prerelease tags
`app-pr-<number>-<run-id>`. Main uses `production` and ordinary releases. Manual
preview runs use `ci-benchmark-<runner>`. Fork PRs and manual runs with `preview`
disabled only validate; they cannot publish native builds. Runs serialize per
branch, and stale or closed PR heads cannot publish. Reruns reuse the same release
tag. No App Store, TestFlight or Google Play submission happens.

The common release label and desktop package version are numeric: the desktop
base version (or mobile version when desktop is absent), with the workflow run
number added to the patch. Mobile marketing versions stay in `app.json`; native
build numbers use the workflow run number. Preserve increasing build numbers
when migrating workflows. Desktop installers are unsigned and macOS is not
notarized.

See [mobile setup](../apps/mobile/README.md) for Expo project variables,
`EXPO_TOKEN`, Android production keys, iOS signing, and simulator selection.
GitHub must allow the publisher's contents-write job token. No repository settings
or credentials are changed by the template itself.

## Compare runners

Run **CI and deploy** manually on the same branch and commit for each of
`ubuntu-latest`, `boat-small`, and `boat`. The workflow must first exist on the
default branch. Keep the lockfile and inputs identical.

Use a new `cache_scope`, such as `comparison-20261101-a`, for the first round.
Each runner has a separate Turbo cache namespace. Repeat with the same scope
and commit to measure a warm cache. The scope controls Turbo caching, not any
provider's preinstalled tools or package download caches. Check cache restore
logs and Turbo's hit counts before labeling a result warm.

The default manual run installs, checks, tests, and builds without deployment
credentials. Enable `preview` to measure the full deployment path using the
preview key. Manual runs never deploy production. Each runner gets a separate
`ci-benchmark-<runner>` preview. Manual runs on the same runner serialize across
branches, so two branches cannot deploy to the same benchmark preview at once.

Record the workflow/run URL, commit, attempt, actual CPU/RAM details from
**Record machine**, cache state, and step timings. For each job, compute queue
time as `started_at - created_at` and runtime as `completed_at - started_at`
from GitHub's jobs API. Also record time from workflow creation to job creation
and workflow creation to job completion, so workflow scheduling delay is not
hidden. For reruns, use that attempt's start and jobs instead of the original
workflow creation time.

The deployment log prints `Web build seconds` separately from the combined
backend deployment, web build, and upload step. `boat ci job <job-id> --json`
provides Boat's own provisioning/wait/runtime measurements. Do not add its wait
time to GitHub's queue time: the intervals can overlap. Compare multiple cold
and warm rounds before choosing a default based on speed.
