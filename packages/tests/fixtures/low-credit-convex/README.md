# Low-credit transaction fixture

This disposable loopback-only project invokes the real compute settlement, notice action helper, observation parser and notice mutation. Its balance reader receives synthetic HTTP responses, and its queue mutation records an inert transactional decision marker. The marker is not an email and does not call Resend. The deployment must keep `E2E_TELEMETRY_DISABLED=1`; the actual product queue is separately checked as disabled. The action's explicit test-only options allow the injected observer and inert marker to run without changing the deployment environment or production queue.

Synthetic malformed-success and lost-response debit cases count inert transport calls and check that unknown outcomes do not grant a window, notify, or permit a repeat claim. They do not establish whether an actual provider processed a debit.

The manual-resume sequence mounts the real agent component and paid message enqueue handler, with a no-op worker tick. It simulates an archived stop response and worker drain, then checks stale funding claims and a newly submitted message through real funding and inert notice decisions. It does not exercise the public send action, actual worker, Boat, real archived state, or UI.

Start a fresh local Convex backend on `127.0.0.1:3480` and `127.0.0.1:3481` with a separate database and storage, `--disable-beacon`, no Sentry DSN, and no provider credentials. Set `E2E_TELEMETRY_DISABLED=1` in that deployment before syncing fixture functions. Use only its disposable local admin key.

Sync this fixture to that loopback backend, then from the repository root run `LOW_CREDIT_FIXTURE_URL=http://127.0.0.1:3480 LOW_CREDIT_BACKEND_E2E=1 E2E_TELEMETRY_DISABLED=1 bun test packages/tests/low-credit-email-integration.test.ts`. The test refuses other ports and skips without the fixture URL or explicit E2E flag. Stop only the backend you started. These checks do not prove Autumn traffic, email delivery, or production configuration.
