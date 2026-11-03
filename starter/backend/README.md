# Backend

Fresh apps start with only a `users` table. Authentication, API/MCP access, and static hosting use the shared kit and Convex components. Add your app's tables to `convex/schema.ts` and its operations in feature folders.

Run `bun run dev` at the workspace root. Run `bun run generate` after changing operations to regenerate the API/MCP contract and selected SDK.

`index.ts` authenticates web/mobile callers. `internal.ts` implements operations; `platforms: true` exposes them through enabled API/MCP platforms. Put argument and return validators in `validator.ts` and table definitions in `schema.ts`.

Disposabl app provisioning, provider connections, previews, releases, and GitHub reporting run in the Disposabl service. They are not part of this backend.
