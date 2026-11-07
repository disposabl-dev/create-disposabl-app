# Remote agent

The public API, MCP, CLI, web, and mobile use the same authenticated operations:

- `sendMessage({ prompt, appId?, platforms?, features? })` saves a message and schedules delivery. Without `appId`, it creates an app with the selected platforms and features after checking connections. Selections on an existing app use its configuration action. Each app has one Agent thread and one Boat conversation.
- `abortMessage({ appId })` cancels queued messages and interrupts only that app's conversation. The worker confirms the stop before reporting `idle`.
- `getMessages({ appId?, paginationOpts? })` reads an app's messages or lists the user's app-linked threads by last update. Pages default to 20 items, with a maximum of 100.

The unmodified Agent component owns threads and messages. The existing app record holds its thread ID, execution state, and bounded delivery queue. Ownership and app identity come from that record; there is no separate threads table or package patch. Agent's `title` and `summary` remain human-readable thread information.

`agentEvents` maps Boat event IDs to component messages for deduplication and tool output. Its `threadId` is the component thread ID. One leased worker handles each thread. Cursor checkpoints, lease fencing, and delivery reconciliation prevent replayed responses or ambiguous network failures from submitting duplicate work.

## Configuration

`BOAT_API_KEY` stays on the backend. `BOAT_AGENT_ENVIRONMENT` explicitly selects the remote environment; without it, sandboxes use `noEnv: true`. Each user shares one sandbox across their apps, with a separate conversation per app. Stop requests always specify a conversation. App deletion requires the agent to be stopped and removes its history without deleting the shared sandbox.

## Automatic sandbox login

Before starting a remote turn, the leased worker installs a CLI session under `/home/user/.config/disposabl/apps/<appId>`. The session uses the current Disposabl deployment, so a preview agent does not accidentally call production. Each turn supplies that app's config directory and a separate GitHub config directory. No second Google login is needed. Atomic file replacement prevents concurrent apps from overwriting each other's sessions; tokens stay out of prompts, Git repositories, and command output.

The Disposabl bearer is stored only as a SHA-256 hash on `apps.agent`. It expires after four hours and is invalidated on rotation, abort, completion, or failure. REST accepts it only for current-user/connection reads and setup, repository authorization, preview, and release reads for the assigned app. It cannot create/delete app records, send recursive messages, or authenticate to MCP. Normal OAuth sessions keep their existing behavior.

The sandbox is a **user-level trust boundary**, not isolation between that user's apps. Code running there can read that user's other workspace files. GitHub repository tokens and Convex development keys have their own provider lifetimes; stopping an agent revokes its Disposabl bearer, not credentials already issued by those providers. Selected features can install that user's Expo and Autumn credentials into their app's CI/backend. Do not put service-operator credentials in generated app environments or claim these provider credentials are app-isolated.

After repository setup, `disposabl apps repositoryToken --appId <appId> --configure` saves a repository-scoped GitHub token privately and returns its file path. The agent reads it into `GH_TOKEN` without printing it and uses `gh auth setup-git`. It refreshes through this command when GitHub access expires. Git remotes retain clean HTTPS URLs.

## Verification

Authenticated TesterArmy E2E tests live in `packages/tests`. They use a development or isolated backend with telemetry disabled. The loopback fixture verifies automatic CLI login, REST app boundaries, token rotation, and stop invalidation without real Boat calls or model credentials. Live sandbox installation, provider provisioning, and cancellation still require a separate configured Boat run.
