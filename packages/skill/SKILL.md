---
name: disposabl-app
description: Build and deliver a Disposabl app from a request, including development and preview verification.
---

# Build a Disposabl app

Aim for a first usable preview in five minutes when practical, without promising a deadline. Treat that as a web-preview target, not a first native-build deadline. In the meal-planner validation, one Android build took about 41 minutes and an iOS simulator job took about 10 minutes; later timings depend on cache and native changes. Select platform and feature IDs with `bun create disposabl-app@latest --list-options` and pass them explicitly. For example:

```sh
bun create disposabl-app@latest my-app --platforms web,android --features authentication --setup --yes
```

Use the requested platforms and features. Setup creates the app and its scoped development environment through Disposabl; do not create a project with the Convex CLI. If setup stops, preserve the generated files and follow its continuation instructions. Never print credentials.

Use the installed `disposabl` bin, or invoke it as `bunx --package create-disposabl-app disposabl`. Check `disposabl login status`; if needed, run `disposabl login` and use the existing authenticated browser session for signup or login when possible. Complete the required GitHub and Convex connections. Respect authorization already given for the task.

Before starting a native build or repairing delivery, read [delivery checks and failure recovery](references/delivery.md). Confirm account connections survive a page reload and managed development starts without a Convex project-selection prompt.

Create a separate Git branch and worktree for each change. In that worktree run `disposabl previews token create --configure .`, `bun install`, and `bun dev`. Implement the request and verify the actual behavior on the requested platforms. Commit and push the branch and open a pull request when the task authorizes delivery.

For a newly generated app, publish its scaffold to `main` first so GitHub has the trusted publishing workflow. Setup configures `origin` for the provisioned repository. Then work on the requested features in an isolated branch:

```sh
cd my-app
git add .
git commit -m "chore: initialize app"
git push -u origin main
git worktree add ../my-app-feature -b feat/first-version
cd ../my-app-feature
bunx --package create-disposabl-app disposabl previews token create --configure .
bun install
bun run dev
```

The configured token is scoped to this worktree's development backend. Never copy another worktree's environment files or use a production deploy key for development. Commit implementation changes, push `feat/first-version`, and create the PR with `gh pr create`. Keep credentials in ignored environment files.

After pushing the PR, run `disposabl previews get` in the worktree and check each requested platform's status and available preview, workflow, release, or download URLs. Wait for relevant builds or report failures; do not claim readiness without evidence. For Android, install the preview APK on the target and verify the requested behavior and authentication. Do not run `eas submit`. After an authorized merge, verify production status and actual URLs. If a platform or URL is missing, inspect the relevant workflow and report the gap.

Use `disposabl previews get --json` when an agent needs structured status. Query again as builds progress, respecting the host's PR watcher rules, and stop waiting when every requested platform has a terminal status. Inspect and repair failures instead of repeatedly polling an unchanged failure. After merging, run `disposabl releases get --appId <appId-from-disposabl.json>`; production results are separate from the worktree's preview. Install the production Android APK alongside its preview and verify login and saved data against the production backend. Store submission is not required for Android APK delivery. TestFlight is available only after Apple signing and App Store Connect submission credentials are configured.

When CI fails, compare the notification SHA with the current branch before editing. Diagnose the exact failed step, collect independent platform failures, and batch related fixes before pushing. A push can cancel an expensive preview build. Use available PR watchers instead of polling unchanged checks. Keep separate evidence for compilation, artifact publication, installation, and login/data persistence.
