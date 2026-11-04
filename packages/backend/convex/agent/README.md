# Remote agent

The public API, MCP, and CLI expose three operations:

- `sendMessage({ prompt, appId? })` saves a user message and schedules delivery. Without an app ID it creates a remote app record. Each user has one Boat sandbox, shared by all their apps. Each app has one Convex Agent thread and one Boat conversation.
- `abortMessage({ appId })` cancels queued messages and interrupts the conversation. The worker confirms completion before reporting `idle`.
- `getMessages({ appId?, paginationOpts? })` reads messages for one app or lists the authenticated user's threads. Pages default to 20 items and allow at most 100.

Web and mobile use `agent/index.ts`. API/MCP authenticate before calling the platform functions in `agent/internal.ts`. Ownership is checked before accessing an app. Internal worker functions are not platform operations.

The Convex Agent component owns message text. `agentThreads` holds execution state and a bounded delivery queue of message IDs. `agentEvents` maps Boat event IDs to component messages and retains tool event data. Boat response snapshots update the same assistant message while streaming. Cursor checkpoints and event IDs prevent duplicate messages when a page is replayed. These are reactive message updates from short scheduled polls, not a browser connection to Boat.

One leased worker handles each app. The lease outlives Convex's action timeout and has a scheduled recovery call, cancelled after normal completion. A send checks Boat's prompt status, steers a running turn, and starts a new turn in the same conversation when idle. A turn that has not started yet is retried. An ambiguous delivery failure stops the remote run instead of submitting the prompt again.

## Configuration

`BOAT_API_KEY` stays in Convex. It is passed to the Boat component and used server-side for steer/interrupt because component version 0.1.0 does not expose those methods.

Without `BOAT_AGENT_ENVIRONMENT`, sandboxes use `noEnv: true`. They inherit no account secrets, repositories, or model credentials. Codex needs credentials before it can run.

The current deployment uses `BOAT_AGENT_ENVIRONMENT=agent-sandbox-backend`, as requested, with the operator's existing Codex OAuth account configured in Boat. The application does not copy or print those OAuth credentials. Per-user API keys and third-party credential isolation are deferred. The environment is selected explicitly so the default Boat environment and unrelated secrets are not inherited. Sandboxes auto-stop after 15 minutes; Boat extends the deadline while its agent is working. An archived sandbox resumes its saved disk. Concurrent apps reuse that sandbox and keep separate conversations. Aborts always name the app conversation; they never interrupt the whole sandbox.

App code lives under `/home/user/apps/<appId>`. Preview experiments use separate branches and worktrees under `/home/user/previews/<appId>/<variant>`, each with its own preview token, backend, and development ports. Multiple previews keep the same app ID. Deleting an idle app removes its message history and leaves the user sandbox available for their other apps.

The generator accepts `--app-id` to bind new files to the already registered app. It verifies ownership through normal setup. The remote worker never passes a user's provider connection tokens into a sandbox.

## Verification, November 4, 2026

Real Boat calls through an isolated local Convex deployment verified saved replies, native steering, conversation memory, two apps sharing one sandbox, and aborting one conversation while the other continued and completed. Stopping and resuming the sandbox preserved the other app's conversation. Boat reported `ttlSeconds: 900` after resume. Unauthenticated reads and another user's app reads were rejected. The CLI discovered the agent commands from the local OpenAPI endpoint, and a generated app retained its supplied app ID with the CLI devDependency and no copied CLI workspace.

Backend, CLI, generator, and SDK typechecks passed. Backend and generator lint passed. No automated tests or test files were added. The shared development deployment (`clean-marlin-251`) now succeeds with Agent and Boat installed. The Auth mismatch was resolved using upstream's reboot migration: back up the deployment, clear obsolete sessions and refresh tokens, and deploy the unchanged upstream schema. Live sign-up, sign-in, refresh, sign-out, and authenticated agent-history access passed; existing accounts and app data were preserved. See the [Auth migration record](../../../../vendor/README.md#development-migration-2026-11-04). The CLI publication workflow is prepared, but npm has no public `@disposabl/cli` version yet and first-publication authentication remains to be configured. No hosted preview variants were deployed during these checks.

## Login and desktop proposal, not implemented

Prefer a Disposabl browser approval link that the user opens on their own machine. The sandbox would request a short-lived, single-use login challenge, the signed-in user would approve the named app, and only that sandbox would exchange the challenge for a scoped credential. Check ownership, expiration, one-time use, and cancellation on the server. Existing CLI login uses a loopback OAuth callback, so forwarding its authorization URL to another machine is insufficient.

Provider connection setup already belongs to the Disposabl account and can happen in the user's browser. The sandbox can then retry the required connection check.

Offer desktop access separately when the user must interact with the sandbox's browser. Boat's desktop endpoint issues a secret-bearing viewer URL with a ten-minute login window. A future Disposabl page should check app ownership and obtain a fresh URL on each opening. Do not save viewer tokens in chat history. See [Boat desktop URL documentation](https://docs.boat.dev/desktop-streaming/urls-and-security) and [agent credentials](https://docs.boat.dev/integrated-agents/keys).
