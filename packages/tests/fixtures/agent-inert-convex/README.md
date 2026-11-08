# Provider-inert agent fixture

On a fresh disposable Convex backend restricted to `127.0.0.1:3550` and site port 3551, disable backend telemetry (`E2E_TELEMETRY_DISABLED=1`) and leave `BOAT_API_KEY` empty. For this fixture deployment only, copy `agentFixture.ts` into the product backend's `convex/` directory, synchronize the local backend, then remove the copy from the working tree. Never deploy this fixture to a shared or production backend. Pass the disposable local admin key only through the test process environment, and run:

```sh
E2E_AGENT_INERT_FIXTURE=1 E2E_TELEMETRY_DISABLED=1 bun run e2e run agent.e2e.ts --target backend --retries 0
```

The flow requires the exact loopback port and verifies the backend's Boat and R2 configuration is empty and its telemetry-disable flag is `1`. The fixture seeds a synthetic lease whose watchdog is a fixture-only no-op. The real finish handler cancels it. Real product handlers and the agent component exercise owner isolation, history pagination, access issuance and rotation, old-token rejection, current-user/CLI session behavior and idle completion. A failed test cannot leave a scheduled provider action: its only seeded timer targets the no-op.

This does not exercise message admission, queued workers, or remote stop. Those need a separate fixture with inert provider actions and explicit assertions that no provider dispatch can occur. A real key or a temporary production-worker lease is not sufficient isolation.

The previous queue, attachment, abort and competing-claim assertions are retained in `agent-queued-proof.ts.txt` as **disabled historical proof**, not an executable test. The original enqueue handler checks the component environment for a Boat key before it saves a message and schedules the production worker; merely holding a lease does not make that scheduler safe. A fixture-only admission/dispatch boundary must be reviewed before restoring the queued-send, cross-owner send denial, stop invalidation and failed queued-message attachment assertions. The active inert test separately checks competing claim and attachment owner isolation without enqueueing a worker.
