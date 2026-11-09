# Local deletion coordinator fixture

Run only on a fresh disposable loopback backend, with ports 3480/3481 free and at least 2.5 GiB available. The script starts and stops its own backend, configures backend E2E telemetry off and an empty Boat key before sync, blocks non-loopback Node fetch, and retains its logs and synthetic database in a new `/tmp/disposabl-local-deletion-*` directory. It terminates its backend on interruption or if free space drops below 2.5 GiB. It requires the repository's installed dependencies, including the selected patched MCP and `.8` auth components; it does not install dependencies.

```sh
CONVEX_LOCAL_BINARY=/absolute/path/to/convex-local-backend \
  DO_NOT_TRACK=1 E2E_TELEMETRY_DISABLED=1 python3 packages/tests/fixtures/account-deletion-convex/local/run-local.py
```

The public fixture wrappers are synthetic and must never be deployed to an app backend. The test calls the real internal coordinator and its component mutations, and reconciles only a synthetic R2 metadata row without provider traffic. It does not prove remote drain, provider cleanup, historical orphans, completion, or production behavior.
