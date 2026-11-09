# Native inbox transaction fixture

This disposable local Convex fixture exercises production inbox handlers. For the worker tests it enables payments in a temporary copy of `disposabl.json`, supplies synthetic route settings on the disposable backend, and invokes the production dispatch handler through a test-only barrier. Its fetch adapter records the synthetic request and returns success without calling a provider. Other scheduled dispatches remain inert. A separate phase deploys the copied configuration with payments off and then on against the same local database, exercising the production dispatch gate and targeted recovery. These tests do not prove provider behavior or exactly-once writes.

Run from the repository root on macOS:

```sh
/usr/bin/sandbox-exec -p '(version 1)(allow default)(deny network-outbound)(allow network-outbound (remote ip "localhost:*"))(allow network-outbound (remote unix-socket))' env E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 python3 packages/tests/fixtures/native-inbox-convex/run.py
```

The runner checks outbound denial, verifies that installed Convex Auth matches the selected archive, checks that ports 3490 and 3491 are free, and creates a fresh isolated backend and source copy. It stops its own backend, removes the disposable files, and verifies the ports are free. It never uses a shared or cloud backend. The handler tests order the hold or customer deletion after scheduled worker arrival and before its claim; this is a forced sequence, not an OCC overlap test. The existing simultaneous review and purchase tests exercise concurrent transactions. These fixture files and the transaction test must remain excluded from generated starters.
