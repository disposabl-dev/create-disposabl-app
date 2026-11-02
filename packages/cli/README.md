# Disposabl CLI

The CLI reads your app's `/openapi.json` and calls its API directly. It does not depend on the SDK.

```sh
export DISPOSABL_API_URL=https://your-deployment.convex.site
npx @disposabl/cli login
npx @disposabl/cli todos create --title 'Ship the app'
npx @disposabl/cli todos list
npx @disposabl/cli logout
```

`--url` overrides the environment. `login --no-browser` prints the authorization URL for manual opening. OAuth uses the app's existing MCP authorization server, PKCE S256, a random loopback callback port and state, rotating refresh tokens, and server-side revocation. Login requires the API platform; MCP tool exposure is optional.

Credentials are stored per API origin under `~/.config/disposabl` (directory mode 0700, files 0600). `DISPOSABL_CONFIG_DIR` overrides that directory. Credentials are not encrypted at rest; keep the account and disk protected. A lock serializes refreshes across processes. `DISPOSABL_API_KEY` supplies a dashboard-created key for automation and bypasses OAuth. Logout revokes stored OAuth credentials; revoke API keys from the dashboard.

Strings are plain option values. Other argument types use JSON, for example `--limit 10` or `--filters '{"done":false}'`. Use `todos --help` for commands exposed by your app.
