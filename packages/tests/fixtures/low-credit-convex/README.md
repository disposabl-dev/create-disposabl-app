# Low-credit transaction fixture

This disposable loopback-only project invokes the real compute settlement, notice action helper, observation parser and notice mutation. Its balance reader receives synthetic HTTP responses, and its queue mutation records an inert transactional decision marker. The marker is not an email and does not call Resend. The deployment must keep `E2E_TELEMETRY_DISABLED=1`; the actual product queue is separately checked as disabled. The action's explicit test-only options allow the injected observer and inert marker to run without changing the deployment environment or production queue.

Synthetic malformed-success and lost-response debit cases count inert transport calls and check that unknown outcomes do not grant a window, notify, or permit a repeat claim. They do not establish whether an actual provider processed a debit.

The manual-resume cases mount the real agent component, paid enqueue, worker claim and finish handlers, with a no-op worker tick. A suspended unresolved run remains blocked after a synthetic shared archive response; a separate synthetic confirmed per-run stop permits a new message after shared stop. Independent lease, pending, processing and uncertain-delivery guards verify failed enqueue rolls back both component messages and session creation. Stale funding claims and inert notice decisions are checked. No public send action, actual worker, Boat, real archive, or UI is exercised. The fixture uses the workspace installed dependencies, including the pinned agent component; no dependency download is needed.

Start a fresh local Convex backend on `127.0.0.1:3480` and `127.0.0.1:3481` with a separate database and storage, `--disable-beacon`, no Sentry DSN, and no provider credentials. Set `E2E_TELEMETRY_DISABLED=1` in that deployment before syncing fixture functions. Use only its disposable local admin key.

Sync this fixture to that loopback backend, then from the repository root run `LOW_CREDIT_FIXTURE_URL=http://127.0.0.1:3480 LOW_CREDIT_BACKEND_E2E=1 E2E_TELEMETRY_DISABLED=1 bun test packages/tests/low-credit-email-integration.test.ts`. The test refuses other ports and skips without the fixture URL or explicit E2E flag. Stop only the backend you started. These checks do not prove Autumn traffic, email delivery, or production configuration.

## Public admission regression

Run from a clean checkout committed at the explicitly selected revision, with cached dependencies and local backend supplied (macOS sandbox-exec required):

```sh
PUBLIC_ADMISSION_SOURCE_REVISION="$(git rev-parse HEAD)" \
PUBLIC_ADMISSION_DEPS=/absolute/path/to/cached/node_modules \
CONVEX_LOCAL_BINARY=/absolute/path/to/convex-local-backend \
python3 packages/tests/fixtures/low-credit-convex/public-admission.py
```

The runner enforces outbound isolation, a 3.25 GiB free-space check before backend start and a 2.6 GiB stop threshold, a 140 MiB artifact stop threshold, private homes, selected Auth archive verification, and exclusive loopback ports 3480/3481. It retains private temporary artifacts including synthetic account data and logs; remove only the directory it prints when no longer needed. It never downloads dependencies. The printed private `runner.log` retains the assertions' PASS output and failures. The artifact directory also contains `provenance.json` with the backend hash, source lockfile hash, and resolved package metadata. These hashes identify inputs, but do not verify publisher origin or a frozen dependency installation. Only Auth receives archive byte comparison; the other linked cached dependencies may differ from the selected lockfile. Treat results as local evidence with that dependency limitation.

A fresh full-product archive enables payments only in the copy. Synthetic Auth calls the registered public send action; an injected billing request adapter counts checks and returns nine, unknown, error, or ten credits. Low, unknown and error create no session or component message. A fixture-seeded confirmed window still rejects low credit; two ten-credit sends each recheck and reuse its session and debit. The worker is unchanged for initial denials and inert for the active-window cases. The synthetic window, parsed provider responses, and inert worker do not establish actual provider billing, worker dispatch, or native-client behavior.

The registered public action also rejects a different user attempting the owner’s app and treats a deletion-pending user as signed out. Both cases assert zero billing-adapter calls and unchanged app, message, session and debit state; the owner’s low-balance request is a control that reaches the adapter.
