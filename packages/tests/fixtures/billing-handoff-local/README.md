# Local authenticated billing handoff fixture

This fixture tests the checked-out product's real `billingHandoff:create`, `inspect`, `redeem`, and `returnTarget` handlers with the installed auth components. Run it only on a fresh disposable Convex backend listening on `127.0.0.1:3540/3541`. It must never be deployed to a shared app, a generated starter, or a remote service. The fixture's public `fixtureBillingHandoff:expire` mutation is deliberately unauthenticated and can mutate handoff records; it exists only in the disposable backend copy.

Create a new `/tmp/disposabl-billing-local-*` directory, archive the exact source revision into it, and create the marker `.billing-handoff-local-fixture`. From the source checkout, run:

```sh
bun packages/tests/fixtures/billing-handoff-local/prepare.ts "$fixture_dir"
```

The adapter accepts only a marked directory with that prefix under the real `/tmp`. It substitutes synthetic enabled billing configuration (`https://fixture.invalid/pricing` and a fixture-only value) in the copied handler and copies the expiry bridge to the copied backend. It does not replace authentication, component calls, handler logic, session exchange, database operations, or return-target checks. Recreate the disposable copy if preparing again. Never use a real provider key.

Start a fresh local Convex backend with a random disposable instance secret and database, `--interface 127.0.0.1`, `--port 3540`, `--site-proxy-port 3541`, matching loopback origins, and `--disable-beacon`. With a disposable local admin key and `CONVEX_SELF_HOSTED_URL=http://127.0.0.1:3540`, set backend `E2E_TELEMETRY_DISABLED=1` and the required `BOAT_API_KEY` to an empty value **before** syncing the copied backend with `convex dev --once --typecheck disable --codegen disable`. Verify all provider credential fields are absent or empty. Use a clean allowlisted process environment and a dead external HTTP(S) proxy with loopback bypass. Install the copied source's frozen dependencies from an owned local cache; if native build scripts require network, `--ignore-scripts` is sufficient for this fixture.

Then run from the source checkout:

```sh
BILLING_HANDOFF_LOCAL_URL=http://127.0.0.1:3540 E2E_TELEMETRY_DISABLED=1 DO_NOT_TRACK=1 bun test packages/tests/billing-handoff-local.test.ts
```

The test refuses any other target and calls the fixture's readiness guard before creating synthetic users. The guard checks telemetry and provider fields but is not an authorization mechanism. Stop only the backend process you started. The adapter and test must be excluded from packaged starter output.

The tests prove the actual auth-component exchange, source-session revocation, single-use and expiry behavior, and return-target binding to the exchanged browser session. The code itself is a bearer capability: `redeem` does not authenticate a browser user; wrong-user denial is verified for `returnTarget`. The tests do not call checkout or providers and do not prove a purchase, UI behavior, production configuration, or whole-account deletion. For deletion eligibility integration, copy the new product handler into a fresh fixture, retain only the synthetic configuration substitutions, and test its actual eligibility check with the real auth components; do not inject user/session responses.
