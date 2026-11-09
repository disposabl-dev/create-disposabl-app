# Local deletion coordinator fixture

Run only on a fresh disposable loopback backend, with ports 3480/3481 free and at least 2.5 GiB available. The script starts and stops its own backend, configures backend E2E telemetry off and an empty Boat key before sync, uses a verified macOS outbound-denying sandbox (loopback and local sockets allowed), rejects fetch redirects, and retains its logs and synthetic database in a new `/tmp/disposabl-local-deletion-*` directory. It uses the shared owned-process helper to terminate and reap the backend and sync/test process groups on interruption or if free space drops below 2.5 GiB. It requires a clean committed checkout, runs a retained commit snapshot, verifies copied auth bytes against the selected vendor archive, and records every copied MCP component file hash plus the selected patch hash. MCP physical-row instrumentation is confined to that copied component and hashed separately. Other cached dependency packages are referenced read-only, not independently frozen or audited. It requires the repository's installed dependencies, including the selected patched MCP and `.8` auth components; it does not install dependencies.

```sh
CONVEX_LOCAL_BINARY=/absolute/path/to/convex-local-backend \
  DO_NOT_TRACK=1 E2E_TELEMETRY_DISABLED=1 python3 packages/tests/fixtures/account-deletion-convex/local/run-local.py
```

The public fixture wrappers are synthetic and must never be deployed to an app backend. The test calls the real internal coordinator and its component mutations, directly reads the two deleted MCP grants/tokens and the 410 deleted ephemeral rows, checks another owner’s comparable records remain unchanged, and reconciles only a synthetic R2 metadata row without provider traffic. It does not prove remote drain, provider cleanup, historical orphans, completion, or production behavior.

The strengthened row/provenance/network proof supersedes the earlier progress-counter-only run and must be rerun before it is claimed as verified. It uses current auth progress only; no old-user migration is tested.
