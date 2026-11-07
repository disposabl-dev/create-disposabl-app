# Disposabl Agent

Use this flow when the user asks for remote execution. Local development remains the default.

Each user has one persistent sandbox for all their apps. Each app has its own conversation and directory. Each app can have multiple previews. To compare alternatives or improve results through hill climbing, ask the agent to create a separate branch/worktree and scoped preview backend for each variant. Keep the same app ID, use distinct ports, and compare the actual behavior of the variants. Aborting one app must leave the other conversations running.

Use the connected Disposabl API/MCP tools, or `bunx --package create-disposabl-app@latest disposabl`. Remote work needs a Disposabl login but no local app directory, `disposabl.json`, or generator installation.

Before sending work, inspect the user's existing apps with `apps list` and their conversations with `agent getMessages`. Match the request to an existing app using its name, repository, and recent messages. Read that app's messages before continuing. Reuse its `appId` across chats. If two apps fit equally well, ask which one; do not guess. If this is a new app, omit `appId`.

```sh
bunx --package create-disposabl-app@latest disposabl apps list --paginationOpts '{"numItems":20,"cursor":null}'
bunx --package create-disposabl-app@latest disposabl agent getMessages
bunx --package create-disposabl-app@latest disposabl agent getMessages --appId <uuid>
bunx --package create-disposabl-app@latest disposabl agent sendMessage --prompt "Build a meal planner"
bunx --package create-disposabl-app@latest disposabl agent sendMessage --appId <uuid> --prompt "Add a weekly grocery list"
bunx --package create-disposabl-app@latest disposabl agent abortMessage --appId <uuid>
```

`sendMessage` returns the app ID and its stable thread ID immediately. It saves the prompt before delivery. While the agent is working, another send steers that run. After completion, it resumes the same Boat conversation with Codex. There is no separate steer command.

`getMessages` with `appId` returns that app's paginated messages and status. Without it, it returns paginated summaries of the user's threads. Pass `paginationOpts` with `continueCursor` to read older pages. Message pages are newest first. A `pending` assistant message contains the latest saved streaming text; clients using the Convex query receive updates reactively.

`abortMessage` stops pending delivery and interrupts the current app's remote conversation. `stopping` means the interrupt is still being confirmed. Wait for `idle` or `failed` before sending more work. Preserve partial assistant output. Report a failed delivery and the returned error; never claim that a queued message finished.

Account connections can be completed at https://www.disposabl.dev/dashboard/connections on the user's own machine. Remote CLI login handoff and desktop streaming are still pending. Do not present a sandbox's localhost OAuth callback as a working laptop login link. If the agent needs that login, explain the blocker and wait. Never copy the host's credentials into the sandbox.

For a new remote app, the backend allocates `appId` before execution. The sandbox uses `bun create disposabl-app@latest my-app --app-id <uuid> --yes` to scaffold against that existing record. The generator verifies ownership during setup. Existing repositories are cloned and continued instead.
