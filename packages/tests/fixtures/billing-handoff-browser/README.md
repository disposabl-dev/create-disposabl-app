# Authenticated billing handoff browser fixture

The runner requires `CONVEX_LOCAL_BINARY` and `PLAYWRIGHT_BROWSERS_PATH` pointing to the cached backend and browser directory. It checks ports 3530/3531 and at least 2.5 GiB free, snapshots the clean commit, verifies the installed Auth package against the selected archive, and uses cached dependencies. The command always enters a network-denying sandbox with no inherited bypass flag; it permits loopback only; telemetry and the backend beacon are disabled, and the Boat key is empty before sync. The flow requires a private single-use marker proving both listeners and the fresh database belong to its launcher. Disk monitoring starts before snapshotting and preparation. The shared supervisor covers preparation commands, key generation, the backend and test children, terminating and reaping their process groups on exit, interruption or low disk. Logs, traces and the synthetic database are retained privately under `/tmp/disposabl-billing-local-*`.

```sh
CONVEX_LOCAL_BINARY=/absolute/path/to/convex-local-backend \
PLAYWRIGHT_BROWSERS_PATH=/absolute/path/to/browser-cache \
  python3 packages/tests/fixtures/billing-handoff-browser/run.py receipt
```

Use `handoff` (or omit the mode) for the billing flow; use `receipt` for a synthetic account request, receipt download, and local authentication cleanup. Both use the same fresh owned backend and keep their evidence private. The receipt is reserved in a new private directory within the fixture under `/tmp`; it does not prove complete account or provider deletion.

The opt-in TesterArmy handoff flow uses the product billing-login page, real handoff handlers and real auth session exchange with a synthetic account. It checks consent, browser identity, single use, expiry and deletion-pending rejection. Payments remain off in the web app; it stops at the product's payments-off pricing page and never calls checkout or a provider. This does not test real payments, native storefronts, production, or a provider sandbox. The fixture adapter's marker and unauthenticated expiry bridge are restricted to the disposable backend copy and must be excluded from starter packages.

The test creates a temporary synthetic user, and browser traces can contain personal or session-related data. Keep them private. The run requires the cached local Convex binary, Bun and installed browser tooling; it does not use a shared browser profile.

Run the inert launcher boundary checks with `python3 -m unittest discover -s packages/tests/fixtures/billing-handoff-browser -p test_runner.py -v`. These tests cover inherited flags, early monitoring, SIGTERM and low-disk cancellation without starting a backend or browser.
