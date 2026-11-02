# Backend

Run `bun run dev` at the workspace root, or `bun run dev` here for Convex alone.

`apps`, `previews`, and `appReleases` hold application data. `githubConnections` stores installation bindings; `connections` stores encrypted Convex and Expo credentials. `users` provides authentication identities. App IDs are UUID v4 values; preview references are branch/worktree names, including `main`. Deletion requires explicit confirmation, removes linked cloud resources and previews, and permanently removes the app. A production release prevents deletion.

`index.ts` resolves the authenticated user for web/mobile. `internal.ts` implements operations; `platforms: true` exposes them through enabled API, MCP, SDK, and CLI platforms. Internal functions validate the supplied `userId`; entry points authenticate it. Internal code checks resource ownership without repeating session checks. Actions live under `actions/`. Put argument/return validators in `validator.ts`, and table definitions in `schema.ts`.

Managed setup uses the user's GitHub and Convex connections; Expo is optional. Connect accounts at `/dashboard/connections`. Login works independently. The CLI saves the app UUID before creating cloud resources so setup can resume after a failure.

The Disposabl service needs `CONVEX_OAUTH_CLIENT_ID`, `CONVEX_OAUTH_CLIENT_SECRET`, and a base64-encoded 32-byte `CONNECTIONS_ENCRYPTION_KEY`. GitHub uses Vercel Connect with `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `GITHUB_CONNECTOR`, and `GITHUB_APP_SLUG`. `CONNECTIONS_ORIGIN` defaults to `https://www.disposabl.dev`. Generated apps do not need these service credentials for normal development.

Preview token creation reuses a named development deployment and returns a fresh development key. Keys are never stored in application tables. GitHub Actions reports the latest build results through verified OIDC identity. Enabled platforms without a published artifact have no download link.
