# Disposabl CLI

The CLI connects to `https://www.disposabl.dev`.

```sh
disposabl login status
disposabl login
disposabl apps create --name my-app --platforms '["web","android","api","mcp","cli","typescript-sdk"]'
disposabl apps list --paginationOpts '{"numItems":20,"cursor":null}'
disposabl apps get --appId <uuid>
disposabl previews token create --configure .
disposabl previews get
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
