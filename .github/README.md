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
