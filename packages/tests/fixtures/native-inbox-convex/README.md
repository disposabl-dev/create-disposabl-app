# Native inbox transaction fixture

This disposable local Convex fixture exercises production inbox handlers. For the worker tests it enables payments in a temporary copy of `disposabl.json`, supplies synthetic route settings on the disposable backend, and invokes the production dispatch handler through a test-only barrier. Its fetch adapter records the synthetic request and returns success without calling a provider. Other scheduled dispatches remain inert. These tests do not prove provider behavior or exactly-once writes.

The fixture exposes the production webhook on its loopback site port. Synthetic Apple `REFUND_REVERSED` deliveries exercise HTTP parsing and transactional state changes, including existing tombstones, unknown writes, refunds, and a transfer hold. The refunded and tombstone states retain a review delivery without moving the purchase to `review`; the tests document that limitation rather than defining reconciliation policy.

Fixture queries and mutations use builders parameterized by the fixture schema. The fixture TypeScript configuration resolves the kit's server imports to the selected source tree, so the production backend model and fixture schema use the same validators even when dependencies are reused from another checkout. The runner copies that backend model and checks the isolated functions with Convex `--typecheck enable`; a missing compiler or type error fails the run.

Run from the repository root on macOS:

```sh
/usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))' env E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 python3 packages/tests/fixtures/native-inbox-convex/run.py
```

The runner requires 2.5 GiB free at startup, checks outbound denial, verifies that installed Convex Auth matches the selected archive, checks that ports 3490 and 3491 are free, and creates a fresh isolated backend and source copy. It stops its own backend, removes the disposable files, and verifies the ports are free. It never uses a shared or cloud backend. The handler tests order the hold, reversal, or customer deletion after scheduled worker arrival and before its claim; this is a forced sequence, not an OCC overlap test. The existing simultaneous review and purchase tests exercise concurrent transactions. These fixture files and the transaction test must remain excluded from generated starters.
