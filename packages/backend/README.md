# Backend

Run `bun run dev` at the workspace root, or `bun run dev` here for Convex alone.

`apps`, `previews`, `appReleases`, and `githubConnections` hold application data. `users` provides authentication identities. App IDs are UUID v4 values; preview references are branch/worktree names, including `main`. Deletion permanently removes app, preview, and release records.

`index.ts` resolves the authenticated user for web/mobile. `internal.ts` implements operations; `platforms: true` exposes them through enabled API, MCP, SDK, and CLI platforms. Actions live under `actions/`. Put argument/return validators in `validator.ts`, and table definitions in `schema.ts`.

Managed setup needs `CONVEX_TEAM_ID` and `CONVEX_TEAM_TOKEN` on the service backend. GitHub repository creation uses Vercel Connect installation tokens, with `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, and `GITHUB_CONNECTOR`. `GITHUB_OWNER` and `GITHUB_INSTALLATION_ID` provide the default organization when the user has no connection.

Preview token creation reuses a named development deployment and returns a fresh development key. Keys are never stored in application tables. GitHub Actions reports the latest build results through verified OIDC identity. Enabled platforms without a published artifact have no download link.
