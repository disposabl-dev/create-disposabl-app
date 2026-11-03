# App CLI

This CLI calls your app's API. Commands come from its OpenAPI contract.

Set `productionConvexSiteUrl` in `disposabl.json` to your deployed app's Convex site URL. You can also pass `--origin <url>` or set `DISPOSABL_CLI_ORIGIN`.

```sh
bun run build
node dist/index.js login
node dist/index.js users current
node dist/index.js logout
```

Run `node dist/index.js --help` for available commands. Use `login --no-browser` to print the sign-in URL.
