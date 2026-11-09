# Low-credit transaction fixture

This disposable loopback-only project invokes the real compute settlement, notice action helper, observation parser and notice mutation. Its balance reader receives synthetic HTTP responses, and its queue mutation records an inert transactional decision marker. The marker is not an email and does not call Resend. The deployment must keep `E2E_TELEMETRY_DISABLED=1`; the actual product queue is separately checked as disabled. The action's explicit test-only options allow the injected observer and inert marker to run without changing the deployment environment or production queue.

Start a fresh local Convex backend on `127.0.0.1:3480` and `127.0.0.1:3481` with a separate database and storage, `--disable-beacon`, no Sentry DSN, and no provider credentials. Set `E2E_TELEMETRY_DISABLED=1` in that deployment before syncing fixture functions. Use only its disposable local admin key.

Sync this fixture to that loopback backend, then from the repository root run `LOW_CREDIT_FIXTURE_URL=http://127.0.0.1:3480 LOW_CREDIT_BACKEND_E2E=1 E2E_TELEMETRY_DISABLED=1 bun test packages/tests/low-credit-email-integration.test.ts`. The test refuses other ports and skips without the fixture URL or explicit E2E flag. Stop only the backend you started. These checks do not prove Autumn traffic, email delivery, or production configuration.
