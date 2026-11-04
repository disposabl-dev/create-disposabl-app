# Convex Auth reboot snapshot

`convex-auth-6c0ebf3f.tgz` contains `@convex-dev/auth` built from [convex/convex-auth](https://github.com/convex/convex-auth) commit [`6c0ebf3f1403e95cbc67536aa32e4fb03280be23`](https://github.com/convex/convex-auth/commit/6c0ebf3f1403e95cbc67536aa32e4fb03280be23), on the `reboot` branch, checked on 2026-11-04.

The package version is `2.0.0-beta.0-reboot.6c0ebf3f` to distinguish it from the published beta. Source code is unchanged. The archive includes the Apache 2.0 license declared by upstream.

SHA-256: `16b88c41043d948d2c04325283eb7532461c5defa50837984b337ec77f509a57`.

The root catalog references this archive, and the generator includes it in new apps. Builds install this exact snapshot without depending on a moving branch or executing an upstream Git prepare hook.

## Google configuration patch

The archive is unchanged. Bun applies the checked-in Auth patch at install time. It makes Google credentials optional so password-only apps deploy without them, and adds two small extension points for shared preview callbacks: a component `CALLBACK_URL` override and an `authorizationState` callback. Source, compiled JavaScript, and declarations are patched together.

The app signs the preview destination and native state in a ten-minute JWT. The shared callback verifies that signature before forwarding Google's response to the originating backend. Convex Auth still owns PKCE, native state validation, code exchange, and one-time sign-in tickets. Production uses a separate Google client and its normal callback. See [Google setup](../packages/disposabl-kit/GOOGLE_AUTH.md).

## Rebuild

Check out the exact commit in a separate directory. Install its pinned workspace dependencies with `pnpm install --frozen-lockfile`. Run the core package's `build` command, which produces both public and internal declaration files. Change only the core package version to the snapshot version above, include the Apache 2.0 LICENSE, and use `npm pack --ignore-scripts` in `packages/core`. Review and record the resulting archive checksum before updating it here. The archive includes source and compiled output.

## Existing deployments need a migration

The shared development deployment was migrated on 2026-11-04. Fresh apps need no session migration.

Upstream removed fields from both `auth/sessions` and `auth/refreshTokens`, changed the JWT subject to the session ID, moved signing to Convex deployment-issued JWTs, and changed the audience to `convex-auth`. The app now uses `convexAuthProvider()` and no longer generates or binds `AUTH_PRIVATE_KEY` and `AUTH_JWKS`.

Before upgrading an existing deployment:

1. Back up that deployment, including authentication components.
2. Schedule a sign-out window and obtain approval to invalidate all sessions.
3. Follow upstream's migration requirement to clear only the auth component's sessions and refreshTokens tables, then deploy the new package and auth configuration together. This signs everyone out. Do not delete users, credentials, other auth components, or app data.
4. Verify sign-in, refresh, sign-out, authenticated queries, and existing account access on the deployed app.

Do not apply the upgrade to production automatically. Old deployment environment keys can remain until the migration succeeds; this change does not delete them.

Upstream migration notes: [session schema change](https://github.com/convex/convex-auth/commit/0fdc1bac), [refresh-token schema change](https://github.com/convex/convex-auth/commit/07911f86230f86ff61655559e8fd278a843ca084).

## Development migration, 2026-11-04

Migrated `clean-marlin-251` using this unchanged upstream snapshot. Exported and verified a full backup, including components and file storage, before clearing only `auth/refreshTokens` (102 rows) and `auth/sessions` (8 rows). Existing development sessions were signed out. `bunx convex dev --once --typecheck enable` then deployed successfully, including the Agent and Boat components.

Live API calls verified sign-up, password sign-in to the same account, authenticated user and agent-history queries, refresh rotation, sign-out, immediate access revocation, and rejection of revoked refresh tokens and anonymous agent-history requests. The verification account is `rebootcheck1793791669`; its sessions were signed out. Before/after exports confirmed all existing users, auth accounts, password records, usernames, apps, previews, connections, GitHub connections, and releases were unchanged. Production was not changed.

The private backups are outside the repository at `~/.codex/backups/disposabl-auth-2026-11-04/`. The pre-migration archive SHA-256 is `99700f8872dd9397fbe86d35edf08794aa024e9e89fc52235fcafb1c6970fd99`. No legacy schema fields or compatibility implementation were added.
