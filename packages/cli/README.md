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

App deletion permanently removes linked GitHub, Convex, and Expo projects, then previews and the app record. Apps with production releases cannot be deleted. Expo requires a signed-in user and password confirmation; the CLI opens the official EAS deletion flow when needed. API/MCP callers receive the project ID and must complete this Expo step before retrying. If cleanup is interrupted, run the same command again; keep the owning accounts connected until it finishes.
