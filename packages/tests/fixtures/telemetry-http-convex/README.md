# Local telemetry HTTP integration

Run `python3 packages/tests/fixtures/telemetry-http-convex/run.py` from a clean committed checkout with ports 3540/3541 free. The runner verifies selected Auth archive bytes, denies outbound network, creates a private disposable loopback backend, disables beacon and backend telemetry before synchronization, uses only a synthetic public token, and stops its own backend. Fixture routes use the real product HTTP handler factories and installed auth and product mutations. The fixture explicitly injects enabled decisions and an inert page transport; production routes are also mounted and must remain disabled. The actual scheduled delivery action sees `E2E_TELEMETRY_DISABLED=1` and cannot send.

The fixture does not prove PostHog ingestion or real users, and its injected enabled setting is not public configuration. Exclude this product-only fixture and test from generated starters.

The runner always enters the OS sandbox, archives the committed source, and supervises preparation, sync and test children. The test requires a private single-use ownership marker, launcher ancestry, both listeners on the backend PID, and its fresh open database before creating accounts. Dependencies are reused from the installed checkout; Auth files are checked against the selected archive. Other dependency bytes remain a qualification limit.
