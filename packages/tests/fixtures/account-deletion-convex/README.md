# Account deletion request fixture

Local-only public wrappers exercise real request/status and pending handlers with synthetic auth identities. No provider action is called; only dedicated synthetic test users may be removed to verify receipt independence. Use a disposable anonymous Convex deployment on loopback ports 3540/3541, set E2E_TELEMETRY_DISABLED=1 on the backend, and run account-deletion-transactions.test.ts with ACCOUNT_DELETION_FIXTURE_URL=http://127.0.0.1:3540. Exclude this fixture and its test from generated starters. This verifies transaction boundaries only, not auth provider or remote stop/cleanup.

`python3 run-receipts.py` starts a fresh isolated backend on 3540/3541 with telemetry disabled, runs the transaction suite, and stops it. Receipt records retain opaque owner correlation; the fixture does not verify a production retention policy or completed deletion.
