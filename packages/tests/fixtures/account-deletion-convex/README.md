# Account deletion request fixture

Local-only public wrappers exercise real request/status and pending handlers with synthetic auth identities. No provider action is called; records are never removed. Use a disposable anonymous Convex deployment on loopback ports 3540/3541, set E2E_TELEMETRY_DISABLED=1 on the backend, and run account-deletion-transactions.test.ts with ACCOUNT_DELETION_FIXTURE_URL=http://127.0.0.1:3540. Exclude this fixture and its test from generated starters. This verifies transaction boundaries only, not auth provider or remote stop/cleanup.
