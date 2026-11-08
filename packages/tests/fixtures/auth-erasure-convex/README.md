# Isolated auth-erasure fixture

Use only a disposable loopback Convex backend on ports 3540/3541. These public fixture wrappers can create and erase synthetic identities. Never deploy them to a shared or cloud backend. Set `E2E_TELEMETRY_DISABLED=1` in both the process and backend before synchronization; use no provider credentials.

The selected archive is `vendor/convex-auth-437831bd-disposabl.7.tgz`. Preserve the repository-relative layout when copying this fixture: its product wrapper imports the actual `packages/backend/convex/users/authDeletion.ts` handler. Extract the archive into this fixture's `authpkg/` directory, removing npm's enclosing `package/` directory. Link the installed dependencies for both the fixture and extracted package. Append the fixture-only files as follows:

- `google-bridge.ts.txt` to `authpkg/src/components/google/provider.ts`.
- `password-seed.ts.txt` to `authpkg/src/components/password/public.ts`.
- `core-seed.ts.txt` to `authpkg/src/component/public.ts`.

Synchronize only this fixture's `convex/` directory to the disposable backend, then run `python3 core-test.py`, `python3 identity-test.py`, and `python3 product-test.py` from this directory. Stop the owned backend afterward. The core test intentionally leaves a synthetic historical orphan to verify that the reported erasure limit is truthful. The Google bridge creates encrypted synthetic tickets without contacting Google.

The product test calls the actual operator handler through `_handler`. It checks rollback, concurrent batches and counters, stale requests, another user, authenticated-session and password denial, linked cleanup, identity cutoff retention, and repeat completion. Source fixtures do not independently prove compiled-runtime parity. The separate packaged-runtime qualification and retained identity limits are documented in `vendor/README.md`.

`marker-runtime.test.ts.txt` is an opt-in helper, not an automatically collected test. Copy it as `marker-runtime.test.ts` beside an extracted npm `package/` directory and run it with Bun. To inspect compiled behavior, replace its `package/src/*.ts` imports with the corresponding `package/dist/*.js` paths in that disposable copy.

No fixture helper is included in the auth archive or generated starters. Passing these checks does not establish remote-work drain, historical orphan cleanup, provider erasure, or complete account deletion.
