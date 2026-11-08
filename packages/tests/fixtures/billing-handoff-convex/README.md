# Local billing handoff transaction fixture

This project runs only on a disposable loopback Convex backend. Its public test wrappers must never be deployed to an application, starter, or remote service. `prepare.ts` copies the checked-out production handoff module into ignored local files and substitutes fixture-only payment/config values and the cleanup function name. The handler logic and database operations remain the checked-out source. The wrappers inject authentication/session exchange responses, and the allowlist variants simulate configuration removal without changing backend environment variables. No provider is contacted. Results establish Convex transaction and handler behavior, not production authentication, provider checkout, or deployment behavior.

After confirming ports 3530/3531 are free, from the repository root:

```sh
bun packages/tests/fixtures/billing-handoff-convex/prepare.ts
cd packages/tests/fixtures/billing-handoff-convex
CONVEX_AGENT_MODE=anonymous E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 CONVEX_TELEMETRY_DISABLED=1 bunx --no-install convex dev --local-cloud-port 3530 --local-site-port 3531 --typecheck disable --codegen disable
```

From the repository root, in a separate terminal:

```sh
BILLING_HANDOFF_FIXTURE_URL=http://127.0.0.1:3530 E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 bun test packages/tests/billing-handoff-transactions.test.ts
```

The test refuses any other backend address. Stop only the fixture process you started. Never supply real credentials; generated code and local Convex configuration remain outside generated starters.
