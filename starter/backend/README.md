# Backend

Fresh apps start with a `users` table and organization/member records for optional Claude auto-connect. Authentication, API/MCP access, and static hosting use the shared kit and Convex components. Add your app's tables to `convex/schema.ts` and its operations in feature folders.

See `convex/mcpEnterprise/README.md` for Claude organization setup and `../../vendor/README.md` for the pinned Convex Auth source.

Run `bun run dev` at the workspace root. Run `bun run generate` after changing operations to regenerate the API/MCP contract and selected SDK.

`index.ts` authenticates web/mobile callers. `internal.ts` implements operations; `platforms: true` exposes them through enabled API/MCP platforms. Put argument and return validators in `validator.ts` and table definitions in `schema.ts`.

Disposabl app provisioning, provider connections, previews, releases, and GitHub reporting run in the Disposabl service. They are not part of this backend.

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
