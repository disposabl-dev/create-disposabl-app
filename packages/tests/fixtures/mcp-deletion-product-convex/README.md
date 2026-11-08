# Product MCP deletion transaction fixture

This fixture mounts the selected patched MCP and Convex Auth components and invokes the real product request, status, eligibility, queue and `users.mcpDeletion.runBatch` handlers. Its public wrappers and synthetic dispatch operation are test-only; never deploy them to an app or production backend.

On a fresh disposable local Convex backend at `127.0.0.1:3550` / `127.0.0.1:3551`, set backend `E2E_TELEMETRY_DISABLED=1` before syncing this fixture. No provider credentials are needed. Run:

```sh
MCP_PRODUCT_FIXTURE_URL=http://127.0.0.1:3550 E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 bun test packages/tests/mcp-deletion-product.test.ts
```

The test refuses other fixture URLs, creates isolated local users, and verifies real username authentication and retained session/status, pending-request and request timestamp checks, bounded continuation and counters, component fencing, product dispatch eligibility, another owner, and repeat completion. It does not verify historical MCP orphans, unassociated authorization requests, provider cleanup, or complete account deletion. Stop only the fixture backend you started. This fixture and test must not be included in generated starters.
