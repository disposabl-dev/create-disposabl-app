# Isolated telemetry transaction fixture

This disposable loopback-only Convex project runs the real identity claim mutation with test-only public wrappers. The wrapper supplies user IDs that stand in for identities already verified by the production HTTP action. It tests transaction contention, not authentication or PostHog delivery. Never deploy it remotely or to an app backend.

On free ports 3440 and 3441, from this directory run `CONVEX_AGENT_MODE=anonymous E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 bunx convex dev --local-cloud-port 3440 --local-site-port 3441 --typecheck disable --codegen disable`. From the repository root, run `TELEMETRY_FIXTURE_URL=http://127.0.0.1:3440 E2E_TELEMETRY_DISABLED=1 bun test packages/tests/telemetry-transactions.test.ts`. Stop the local process afterward. The test rejects any URL except the dedicated loopback port.
