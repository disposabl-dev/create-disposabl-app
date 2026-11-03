---
name: disposabl-app
description: Create, develop, and deliver Disposabl apps, with preview status updates and verification on the requested platforms.
---

# Build a Disposabl app

Build the user's requested app and keep its preview visible. Preserve their chosen name and platforms. Use the generated app's `disposabl.json` to identify the app; do not substitute another project's preview.

## Create and configure

On a fresh machine, check Bun, Git, and Node.js 22.12 or newer. Report a missing prerequisite and follow its official installation instructions; do not assume another machine's tools, login, or credentials exist here.

Discover platform and feature IDs, then create the app with explicit selections:

```sh
bun create disposabl-app@latest --list-options
bun create disposabl-app@latest my-app --platforms web,android,mcp --features authentication --yes
```

Use the requested platforms and features. Creation handles Disposabl login, required GitHub/Convex connections, and the app's scoped development environment. Resume interrupted setup in the same directory. Do not create a replacement Convex project or delete an app unless requested. Never print credentials.

The CLI is bundled with `create-disposabl-app`; do not use the retired `@disposabl/cli` package. Commands below use the published CLI and work without a global install:

```sh
bunx --package create-disposabl-app@latest disposabl login status
bunx --package create-disposabl-app@latest disposabl previews get --help
```

Use command help and the current API contract for other operations. If login is required, use the supported login flow and an existing authenticated browser when available. Never request provider passwords or copy another project's environment files.

## Implement and deliver

Choose a visual direction suited to the product. Use `frontend-design` when available and read [app branding and visual design](references/design.md). If that skill is unavailable, proceed with the user's brief and report the limitation without blocking development.

Read [delivery checks](references/delivery.md) before native builds or delivery repairs. Aim to show a usable web preview early; first native builds can take longer. Do not promise a build deadline.

A generated app already has an Initial commit and a provisioned Git remote. For authorized delivery, publish that scaffold to `main`, then develop on an isolated feature branch/worktree:

```sh
cd my-app
git push -u origin main
git worktree add ../my-app-feature -b feat/first-version
cd ../my-app-feature
bunx --package create-disposabl-app@latest disposabl previews token create --configure .
bun install
bun run dev
```

Use the host's worktree and delegation tools when required. Keep tokens in ignored environment files. Local development, PR previews, and production are separate deployments. Opening a same-repository PR to `main` triggers its preview; a branch push alone does not. Push only the intended reviewed changes and preserve unrelated work.

## Preview updates every two minutes

Run this in the active app worktree immediately after setup, after opening or updating its PR, and whenever the user asks for a preview:

```sh
bunx --package create-disposabl-app@latest disposabl previews get --json
```

While delivery is active, check again every **two minutes**. Track the last check time and continue useful work between checks. Use the host's scheduling/watcher rules; do not start an endless polling process or poll a delegated agent's status. If the host requires yielding to a PR watcher, yield and refresh Disposabl status on wake.

After each check, give a short update: the current stage, requested platforms that are ready or still building, any blocker, and the available preview or download links. If unchanged, say so briefly. On a failed status, diagnose the failure rather than repeatedly polling it. Stop periodic checks when all requested platforms are ready, delivery is blocked on a concrete user action, or the user stops the task.

When a preview becomes available, open that app's URL or install/open its APK in the supported device panel promptly, before lengthy verification. Do not replace the requested app preview with a dashboard or landing page. A configured URL, `enabled: true`, successful build, or local APK does not by itself prove the hosted preview is ready. If local and reported cloud states differ, explain the difference.

Verify the requested behavior, authentication, and saved data after relaunch on each requested platform. Report compilation, publication, and visible behavior separately. After an authorized merge, use `disposabl releases get --appId <appId>` for production status and verify its URLs separately. APK delivery does not require store submission; do not run `eas submit` unless requested.

## Delete an app

Only when requested, run `disposabl apps delete --appId <uuid> --dangerously-delete-app`. Apps with production releases cannot be deleted.

If the response is `expo_manual_delete_required`, GitHub/Convex cleanup has completed but Expo cleanup remains. Open the exact returned `projectUrl`; never substitute a generic dashboard. The user completes Expo sign-in or reauthentication directly. Do not collect passwords or session cookies. Retry the deletion command afterward and report full deletion only when Disposabl confirms it. `--no-browser` prints the URL for headless callers.
