# Remote agent

The public API, MCP, CLI, web, and mobile use the same authenticated operations:

- `sendMessage({ prompt, appId?, platforms?, features? })` saves a message and schedules delivery. Without `appId`, it creates an app with the selected platforms and features after checking connections. Selections on an existing app use its configuration action. Each app has one Agent thread and one Boat conversation.
- `abortMessage({ appId })` cancels queued messages and interrupts only that app's conversation. The worker confirms the stop before reporting `idle`.
- `getMessages({ appId?, paginationOpts? })` reads an app's messages or lists the user's app-linked threads by last update. Pages default to 20 items, with a maximum of 100.

The unmodified Agent component owns threads and messages. The existing app record holds its thread ID, execution state, and bounded delivery queue. Ownership and app identity come from that record; there is no separate threads table or package patch. Agent's `title` and `summary` remain human-readable thread information.

`agentEvents` maps Boat event IDs to component messages for deduplication and tool output. Its `threadId` is the component thread ID. One leased worker handles each thread. Cursor checkpoints, lease fencing, and delivery reconciliation prevent replayed responses or ambiguous network failures from submitting duplicate work.

## Configuration

`BOAT_API_KEY` stays on the backend. `BOAT_AGENT_ENVIRONMENT` explicitly selects the remote environment; without it, sandboxes use `noEnv: true`. Each user shares one sandbox across their apps, with a separate conversation per app. User abort requests specify a conversation. Unfunded compute expiry stops the shared sandbox normally. App deletion requires the agent to be stopped and removes its history without deleting the shared sandbox.

## Prepaid compute

When payments are selected, each admission checks for at least 10 credits. Enqueue binds to one user compute session transactionally. The first worker claims a persisted debit before calling Autumn's atomic `balances.check` with `required_balance: 10` and `send_event: true`. Only a confirmed response activates a 600-second window. AI has no separate charge.

At expiry the current implementation stops the session without dispatching a renewal debit. This conservative fence applies even if a top-up arrived before expiry; uninterrupted renewal requires a separately qualified pre-deadline provider protocol. The immutable debit record prevents another worker or duplicate timer from dispatching the same charge. A timeout, malformed response, or crashed debit action puts the session on hold without automatic retry. A confirmed debit that settles after the old paid deadline is recorded as confirmed, placed on hold, and never extends the old session.

Internal operators can inspect exact IDs with `agent/computeRecovery:inspect` and resolve with `agent/computeRecovery:resolve`, passing `sessionId`, `debitId`, `outcome` (`confirmed` or `denied`), `operator`, and an immutable provider evidence reference. This is an internal administrative operation, not a user API. Before resolving, independently establish that the evidence is authoritative and final for that exact debit, and that no dispatch is still in flight or can later complete. A timeout alone proves neither. If either fact cannot be established, leave the hold in place. Do not put credentials or private customer content in the evidence reference. Confirm normal sandbox stop and lease drainage; the mutation checks those conditions and rejects stale, mismatched, or previously resolved holds. Inspect the records first and retain the provider evidence under the operator's normal audit process.

Resolution preserves the original unknown or confirmed debit and its paid deadline, records the provider outcome separately, and closes the old session without resuming work or issuing a credit or refund. Even a late confirmed charge does not grant a new window. A later explicit message must start a new session and be charged normally. Repeated resolution is rejected, including identical requests; inspect the record after an uncertain operator response.

A definitive confirmation received after an unknown result is retained as `lateConfirmation`; it prevents a denied resolution even if the timeout fired first. If a denied resolution or denied result was already recorded, both records remain intact and the debit and current user session are marked with a reconciliation conflict. The current session is fenced and normal stop is requested. Ordinary hold resolution cannot clear this conflict: it requires separate manual investigation and a future explicit recovery procedure. No refund, credit, charge, or resume is performed automatically. Duplicate late confirmations do not overwrite the first evidence.

Retain compute session and debit records together. The application has no deletion path for these records; late confirmation handling uses the original session to identify the user. Deleting that session out of band can prevent fencing the user's newer session. Any future retention or deletion implementation must preserve that association before removing records.

Every start, resume, steer and prompt path checks the session. API credential issuance and authentication also require an unexpired paid window. Expiry closes admission while normal Boat stop snapshots the shared workspace. Stop calls are serialized and a session cannot close until old worker leases drain. Once closed, only a newly admitted user message creates another session. Low-credit email enqueue is recorded once per confirmed window and remains production-only.

Boat's active-agent TTL extension is not the billing boundary. Normal stop and scheduler delivery are best effort: in-flight provider operations, delayed callbacks or failed snapshots can exceed the paid deadline. Never force-stop to hide that limitation. Unknown charges and unsuccessful stops remain blocked for reconciliation. Files are subject to Boat's retention policy.

Payments remain disabled pending provider-sandbox and installed-client qualification. Drain existing payments-off work before enabling the feature; old queued work has no paid session. Current tests cover handler transitions and existing local backend behavior, not real debit concurrency, purchases, snapshot recovery or an exact wall-clock cutoff.

## Automatic sandbox login

Before starting a remote turn, the leased worker installs a CLI session under `/home/user/.config/disposabl/apps/<appId>`. The session uses the current Disposabl deployment, so a preview agent does not accidentally call production. Each turn supplies that app's config directory and a separate GitHub config directory. No second Google login is needed. Atomic file replacement prevents concurrent apps from overwriting each other's sessions; tokens stay out of prompts, Git repositories, and command output.

The Disposabl bearer is stored only as a SHA-256 hash on `apps.agent`. It expires after four hours and is invalidated on rotation, abort, completion, or failure. REST accepts it only for current-user/connection reads and setup, repository authorization, preview, and release reads for the assigned app. It cannot create/delete app records, send recursive messages, or authenticate to MCP. Normal OAuth sessions keep their existing behavior.

The sandbox is a **user-level trust boundary**, not isolation between that user's apps. Code running there can read that user's other workspace files. GitHub repository tokens and Convex development keys have their own provider lifetimes; stopping an agent revokes its Disposabl bearer, not credentials already issued by those providers. Selected features can install that user's Expo and Autumn credentials into their app's CI/backend. Do not put service-operator credentials in generated app environments or claim these provider credentials are app-isolated.

After repository setup, `disposabl apps repositoryToken --appId <appId> --configure` saves a repository-scoped GitHub token privately and returns its file path. The agent reads it into `GH_TOKEN` without printing it and uses `gh auth setup-git`. It refreshes through this command when GitHub access expires. Git remotes retain clean HTTPS URLs.

## Verification

Authenticated TesterArmy E2E tests live in `packages/tests`. They use a development or isolated backend with telemetry disabled. The loopback fixture verifies automatic CLI login, REST app boundaries, token rotation, and stop invalidation without real Boat calls or model credentials. Live sandbox installation, provider provisioning, and cancellation still require a separate configured Boat run.

Hold recovery also requires every old app to be terminal with no pending message or uncertain delivery. Let its existing worker finish suspended before resolving; normal stop confirmation alone is insufficient. Admission rejects rebinding an app while old work or any worker lease remains. A delayed tick can then claim only freshly admitted work, and old lease tokens cannot finish that new work.
