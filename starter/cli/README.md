# App CLI

This CLI calls your app's API. Commands come from its OpenAPI contract.

Set `productionConvexSiteUrl` in `disposabl.json` to your deployed app's Convex site URL. You can also pass `--origin <url>` or set `DISPOSABL_CLI_ORIGIN`.

```sh
bun run build
node dist/index.js login
node dist/index.js users current
node dist/index.js logout
```

With an app origin configured, `node dist/index.js --help` lists commands from its API contract. Use `help users` for a group or `users current --help` for an operation. Without an origin, help lists the built-in authentication commands. Login, logout, and version work without loading the API contract.

Use `login --no-browser` to print the sign-in URL.
