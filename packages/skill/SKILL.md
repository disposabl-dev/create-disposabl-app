---
name: disposabl-app
description: Build and deliver a Disposabl app from a request, including development and preview verification.
---

# Build a Disposabl app

Aim for a first usable preview in five minutes when practical, without promising a deadline. Native platforms may take longer on their first compile. Select platform and feature IDs with `bun create disposabl-app@latest --list-options` and pass them explicitly. For example:

```sh
bun create disposabl-app@latest my-app --platforms web,android --features authentication --setup --yes
```

Use the requested platforms and features. Setup creates the app and its scoped development environment through Disposabl; do not create a project with the Convex CLI. If setup stops, preserve the generated files and follow its continuation instructions. Never print credentials.

Use the installed `disposabl` bin, or invoke it as `bunx --package create-disposabl-app disposabl`. Check `disposabl login status`; if needed, run `disposabl login` and use the existing authenticated browser session for signup or login when possible. Complete the required GitHub and Convex connections. Respect authorization already given for the task.

Create a separate Git branch and worktree for each change. In that worktree run `disposabl previews token create --configure .`, `bun install`, and `bun dev`. Implement the request and verify the actual behavior on the requested platforms. Commit and push the branch and open a pull request when the task authorizes delivery.

After pushing the PR, run `disposabl previews get` in the worktree and check each requested platform's status and available preview, workflow, release, or download URLs. Wait for relevant builds or report failures; do not claim readiness without evidence. For Android, install the preview APK on the target and verify the requested behavior and authentication. Do not run `eas submit`. After an authorized merge, verify production status and actual URLs. If a platform or URL is missing, inspect the relevant workflow and report the gap.
