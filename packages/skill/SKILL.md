---
name: disposabl-app
description: Build and deliver a Disposabl app from a request, including development and preview verification.
---

# Build a Disposabl app

Aim for a first usable preview in five minutes when practical; do not promise a delivery time. Choose platform and feature IDs from `bun create disposabl-app@latest --list-options`; use explicit arguments and avoid interactive prompts:

```sh
bun create disposabl-app@latest my-app --platforms web --features authentication --yes
```

Choose the requested platforms and features instead of the example defaults. Check `disposabl login status`; if necessary, have the user complete `disposabl login` and connect the required accounts. Run `bun create disposabl-app@latest my-app --setup` to create the app and configure its initial development preview. If setup stops, preserve the generated files and follow its continuation instructions. Never print credentials.

Create a Git branch and worktree for the change. In that worktree run `disposabl previews token create --configure .`, then `bun install` and `bun run dev`. Implement the requested feature and verify its behavior on the requested platforms. Commit, push the branch, and open a pull request when authorized.

Run `disposabl previews get` from the change worktree to report each platform's status and available preview, workflow, release, or download URLs. Poll until the relevant builds complete or report a failure; do not claim a preview is ready without evidence. After an authorized merge, verify the production deployment and report its actual status and URLs. If a platform or URL is missing, say so and inspect the relevant workflow rather than inventing a link.
