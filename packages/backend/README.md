# Backend

Run `bun run dev` at the workspace root, or `bun run dev` here for Convex alone.

`apps`, `previews`, and `appReleases` hold application data. `githubConnections` stores installation bindings; `connections` stores encrypted Convex and Expo credentials. `users` provides authentication identities. App IDs are UUID v4 values; preview references are branch/worktree names, including `main`. Deletion requires explicit confirmation, removes linked cloud resources and previews, and permanently removes the app. A production release prevents deletion.

`index.ts` resolves the authenticated user for web/mobile. `internal.ts` implements operations; `platforms: true` exposes them through enabled API, MCP, SDK, and CLI platforms. Internal functions validate the supplied `userId`; entry points authenticate it. Internal code checks resource ownership without repeating session checks. Actions live under `actions/`. Put argument/return validators in `validator.ts`, and table definitions in `schema.ts`.

Managed setup uses the user's GitHub and Convex connections; Expo is optional. Connect accounts at `/dashboard/connections`. Login works independently. The CLI saves the app UUID before creating cloud resources so setup can resume after a failure.

The Disposabl service needs `CONVEX_OAUTH_CLIENT_ID`, `CONVEX_OAUTH_CLIENT_SECRET`, and a base64-encoded 32-byte `CONNECTIONS_ENCRYPTION_KEY`. GitHub uses Vercel Connect with `VERCEL_TOKEN`, `VERCEL_PROJECT_ID`, `VERCEL_TEAM_ID`, `GITHUB_CONNECTOR`, and `GITHUB_APP_SLUG`. `CONNECTIONS_ORIGIN` defaults to `https://www.disposabl.dev`. Generated apps do not need these service credentials for normal development.

Preview token creation reuses a named development deployment and returns a fresh development key. Keys are never stored in application tables. GitHub Actions reports the latest build results through verified OIDC identity. Enabled platforms without a published artifact have no download link.

## Passwords and recovery

Authentication uses the pinned Convex Auth v2 `reboot` source. New signups use username/password until `RESEND_API_KEY` is set, then verified email/password. Optional Google sign-in remains available. Existing username and email accounts can choose their original login method when the configuration changes; accounts are never merged by an unverified email address.

Set these variables on each deployment that sends email:

- `RESEND_API_KEY`: your Resend sending key.
- `RESEND_FROM_EMAIL`: an address on a domain verified in Resend, optionally `Your App <auth@example.com>`.
- `AUTH_EMAIL_ORIGIN`: the exact public web origin users opened, such as `https://your-app.example`. It defaults to the Convex site URL. A different origin cannot read the browser secret used to verify an emailed link.
- `RESEND_WEBHOOK_SECRET`: optional signing secret for the Resend webhook at `/resend-webhook`.

Email signup pauses with a clear unavailable state if a key exists without a sender. Without a key, username signup remains available. Password recovery is shown only when the key and sender are configured and works for verified email accounts. Username-only accounts have no recovery email. Email links must be completed in the same browser or app where the flow started. On mobile, paste the emailed link back into the waiting app.

Signed-in password accounts can use `/change-password`, also discoverable at `/.well-known/change-password`. Password changes verify the current password and can revoke other sessions. Recovery links expire after 10 minutes, are single-use, and revoke existing sessions on completion. Google-only accounts change their credentials with Google.

`convex/emails.ts` exports the official Resend component client for other authorized application emails. It queues sends with production delivery enabled; never expose an unauthenticated arbitrary-email mutation. Configure sender credentials separately for development. Test commands do not enable analytics.

### Production sign-in policy and analytics

`AUTH_GOOGLE_ONLY=true` makes the web login and signup screens Google-only and rejects new password accounts and password sign-ins on the backend. Disposabl.dev uses this setting. Leave it unset in generated apps to retain conditional password providers. Password recovery URLs redirect to login in Google-only deployments; existing sessions remain valid.

Analytics is enabled by selecting the Analytics feature. The connection supplies the generated app's PostHog project token and host in `disposabl.json`; `productionConvexSiteUrl` identifies its production backend. Capture is suppressed on other backends and when `E2E_TELEMETRY_DISABLED=1`. For a separately managed production backend, set `DISPOSABL_ENVIRONMENT=production`, `POSTHOG_PROJECT_TOKEN`, and an approved `POSTHOG_HOST` (`https://us.i.posthog.com` or `https://eu.i.posthog.com`). `POSTHOG_ENABLED=false` disables capture. Missing configuration never blocks the app. Production web and mobile builds also require the selected feature and a matching production backend. Development builds do not emit events.

Events cover coarse page and screen categories, API and MCP operations, and setup outcomes. Authenticated events use a stable opaque identifier derived from the verified user; anonymous events use a new identifier per event. No input values, full URLs, errors, credentials, prompts, or messages are sent. Delivery runs as a scheduled Convex action and failures do not fail the product request. Test with `bun test packages/tests/telemetry.test.ts`.

The Disposabl service also emits `app_created` and accepted ready/failed `platform_deployment` reports. Creation, setup, and deployment events share an `app_id` hashed separately from user identity and scoped to the analytics project. Deployment reports include platform, preview/production channel, workflow run number and attempt, and `time_since_app_creation_ms`. This is the app's age at the report, not the build's duration. Setup's `duration_ms` remains the duration of that setup operation.

To measure initial delivery, use apps with an observed creation event and take the earliest successful report per app, platform, and channel. Exclude attempts with an error report, including a correction after a ready report; run number and attempt keep retries separate. Reports before instrumentation and failed provisioning before app creation are not measured. Ready means the workflow reported an artifact or deployment, not that installation, store review, or visible device behavior was verified. Local and E2E tests never send these events.
