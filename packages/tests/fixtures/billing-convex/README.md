# Isolated billing transaction fixture

This separate local-only Convex project exposes public wrappers around the real internal billing attempt handlers. Never deploy these public functions to the app, starter, or any remote backend. Remove this entire fixture and `packages/tests/billing-transactions.test.ts` from generated/published starters before integration. No checkout action or provider is called; the fixture proves database behavior only.

Check ports 3430 and 3431 are free, then from this directory run `CONVEX_AGENT_MODE=anonymous bunx convex dev --local-cloud-port 3430 --local-site-port 3431 --typecheck disable --codegen disable`. From the repository root run `BILLING_FIXTURE_URL=http://127.0.0.1:3430 E2E_TELEMETRY_DISABLED=1 bun test packages/tests/billing-transactions.test.ts`. Stop the fixture process afterward. Use only a disposable local deployment. The test rejects other URLs.
