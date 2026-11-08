# Provider-inert agent fixture

On a fresh disposable Convex backend restricted to `127.0.0.1:3550` and site port 3551, disable backend telemetry (`E2E_TELEMETRY_DISABLED=1`) and leave `BOAT_API_KEY` empty. For this fixture deployment only, copy `agentFixture.ts` into the product backend's `convex/` directory, synchronize the local backend, then remove the copy from the working tree. Never deploy this fixture to a shared or production backend. Pass the disposable local admin key only through the test process environment, and run:

```sh
E2E_AGENT_INERT_FIXTURE=1 E2E_TELEMETRY_DISABLED=1 bun run e2e run agent.e2e.ts --target backend --retries 0
```

The flow requires the exact loopback port and verifies the backend's Boat key is empty. The fixture seeds a synthetic lease whose watchdog is a fixture-only no-op. The real finish handler cancels it. Real product handlers and the agent component exercise owner isolation, history pagination, access issuance and rotation, old-token rejection, current-user/CLI session behavior and idle completion. A failed test cannot leave a scheduled provider action: its only seeded timer targets the no-op.

This does not exercise message admission, queued workers, or remote stop. Those need a separate fixture with inert provider actions and explicit assertions that no provider dispatch can occur. A real key or a temporary production-worker lease is not sufficient isolation.
