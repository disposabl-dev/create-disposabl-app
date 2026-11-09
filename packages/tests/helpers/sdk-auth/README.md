# Packaged SDK authentication fixture

Run `python3 packages/tests/helpers/sdk-auth/run.py` from a clean committed checkout with cached dependencies and the pinned local Convex binary. The runner archives the exact commit, reserves fresh loopback ports 3530/3531 and a new database, disables backend telemetry and beacon, and verifies the backend has only an empty Boat key and the telemetry-disable setting. It first proves an invalid ownership marker is rejected before synchronization, then runs the packaged SDK flow with an owned backend. No provider credentials or external services are required.

The temporary directory and its source archive, database, logs, and SDK tarball are retained under `/tmp`. The runner stops only the backend it started. Each run requires at least 2 GiB free and does not reuse previous evidence. This validates a locally packed SDK, not an npm publication, live providers, or production authentication.

SIGTERM and SIGINT enter owned-backend cleanup, including cancellation during startup. Repeated signals are deferred while that child is stopped and reaped. SIGKILL and host termination cannot run Python cleanup. Run `python3 packages/tests/helpers/sdk-auth/test_runner.py` for the synthetic process regression; it does not start Convex or access the network.
