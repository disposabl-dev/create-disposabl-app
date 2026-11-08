# Isolated billing browser fixture

This opt-in fixture serves the real pricing, billing-login and PaymentGate components, with mocked authentication, StoreKit, Convex actions and payment outcomes. It never contacts a provider and is not an integration test for Convex, a store, or payment fulfillment. The native gate is rendered through HTML mocks; no device is used. Its process state is isolated and exists only in memory.

From the repository root, reserve loopback ports 3450/3451 and start these two processes in separate terminals:

```sh
bun packages/tests/fixtures/billing-web/service.ts
bunx vite --config packages/tests/fixtures/billing-web/vite.config.ts
```

Then run the fixture in the test runner's isolated browser (telemetry stays disabled via the wrapper):

```sh
E2E_BILLING_WEB_FIXTURE=1 bun run e2e run billing-web-handoff.e2e.ts --config billing-web.config.ts --target web --retries 0 --no-cache
```

Without the opt-in variable the tests skip. Stop only the two fixture processes started for this run. Do not use real account data or credentials.
