# Disposabl CLI

The CLI connects to `https://www.disposabl.dev`.

Install it with `bun add --dev @disposabl/cli@latest`, or run `bunx @disposabl/cli@latest`. New generated apps include `@disposabl/cli: "latest"` in root devDependencies. A lockfile keeps the installed version stable; use `bun update @disposabl/cli --latest` to refresh it.

```sh
disposabl login status
disposabl login
disposabl apps create --name my-app --platforms '["web","android","api","mcp","cli","typescript-sdk"]'
disposabl apps list --paginationOpts '{"numItems":20,"cursor":null}'
disposabl apps get --appId <uuid>
disposabl previews token create --configure .
disposabl previews get
disposabl agent getMessages
disposabl agent sendMessage --prompt "Build a meal planner remotely"
disposabl agent sendMessage --appId <uuid> --prompt "Try two preview variants"
disposabl agent getMessages --appId <uuid>
disposabl agent abortMessage --appId <uuid>
disposabl apps delete --appId <uuid> --dangerously-delete-app
disposabl logout
```

Save the returned app UUID as `appId` in `disposabl.json`. Preview commands read it automatically. Both preview commands detect the current Git branch, or the worktree name when detached. Use `--reference` only to select a different preview. Token creation reuses that preview and issues a fresh development key. `--configure .` writes ignored local environment files without printing the key.

`login status` returns `currentUser`. `login --no-browser` prints the OAuth URL. The CLI owns PKCE, the loopback callback, refresh, and logout. The generator only invokes these commands.

Credentials live under `~/.config/disposabl` with restricted file permissions. `DISPOSABL_CONFIG_DIR` changes the local credential directory. `DISPOSABL_API_KEY` provides an automation credential. The service origin has no public override.

Use `--json` for machine-readable preview output. Other commands return JSON; `--help` lists their arguments.

App deletion runs in the Convex action using connected provider credentials. Apps with production releases cannot be deleted. The CLI never launches EAS or asks for an Expo password.

When Expo rejects token-based deletion, the action records that Expo cleanup is pending and continues deleting GitHub and Convex. Once both are removed, it returns `expo_manual_delete_required` with the app ID, Expo project ID, and exact `projectUrl` ending in `/settings/advanced`. The CLI opens that URL in the browser and prints it. Sign in directly to Expo if needed, then use Delete project. Pass `--no-browser` to print the link without opening it.

The command exits unsuccessfully while manual cleanup is pending. Rerun the same Disposabl deletion command after deleting the Expo project. The action verifies the connected Expo account and project removal, then deletes previews and the app record. Interrupted provider cleanup remains resumable. Keep the owning accounts connected until deletion finishes; Disposabl does not accept Expo passwords or session cookies.

## Usage analytics

When configured for a published release, Disposabl collects the command category, outcome, package version, operating system and package-manager category. A random ID stored in `~/.config/disposabl/telemetry.json` connects anonymous usage to the Disposabl user ID after login. Logout and account changes reset that ID. Prompts, arguments, paths, error messages, credentials and email addresses are not collected. Set `DO_NOT_TRACK=1` or `DISPOSABL_TELEMETRY_DISABLED=1` to opt out. Local source, development, CI and E2E runs do not send events. This is separate from a generated app's analytics.

The release must supply the central public PostHog project token in `DISPOSABL_CLI_POSTHOG_PROJECT_TOKEN` and its ingestion host in `DISPOSABL_CLI_POSTHOG_HOST` (US or EU PostHog ingestion origin). Without both, no events are sent. Do not use a personal API key or an app owner's project token. Configure the central PostHog project to disable IP data capture.
