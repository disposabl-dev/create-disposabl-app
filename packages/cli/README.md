# Disposabl CLI

The CLI connects to `https://disposabl.dev`.

```sh
disposabl login status
disposabl login
disposabl apps create --name my-app --platforms '["web","android","api","mcp","cli","typescript-sdk"]'
disposabl apps list --paginationOpts '{"numItems":20,"cursor":null}'
disposabl apps get --appId <uuid>
disposabl previews token create --reference main --configure .
disposabl previews get
disposabl apps delete --appId <uuid>
disposabl logout
```

Save the returned app UUID as `appId` in `disposabl.json`. Preview commands read it automatically. `previews get` also reads the current Git branch; use `--reference` for a detached checkout or a custom worktree name. Token creation requires an explicit reference, reuses that preview, and issues a fresh development key. `--configure .` writes ignored local environment files without printing the key.

`login status` returns `currentUser`. `login --no-browser` prints the OAuth URL. The CLI owns PKCE, the loopback callback, refresh, and logout. The generator only invokes these commands.

Credentials live under `~/.config/disposabl` with restricted file permissions. `DISPOSABL_CONFIG_DIR` changes the local credential directory. `DISPOSABL_API_KEY` provides an automation credential. The service origin has no public override.

Use `--json` for machine-readable preview output. Other commands return JSON; `--help` lists their arguments.
