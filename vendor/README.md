# Convex Auth snapshot

The current catalog selects `convex-auth-437831bd-disposabl.7.tgz`. Its bounded auth-erasure APIs and retained-data limits are documented below. Selection and local tests are not production deployment or complete account-deletion evidence. The `.3` archive and intermediate candidates are preserved as the reproducible source baseline.

`convex-auth-437831bd-disposabl.3.tgz` is `@convex-dev/auth` version `2.0.0-beta.0-reboot.437831bd-disposabl.3`, built from [convex/convex-auth](https://github.com/convex/convex-auth) commit [`437831bdd0990c9faac305f60354e53aec91cd36`](https://github.com/convex/convex-auth/commit/437831bdd0990c9faac305f60354e53aec91cd36), with the changes below. The archive contains source, compiled JavaScript, declarations, and the upstream Apache 2.0 license. SHA-256: `d98796ba391859edcf95892d8a66b919fdd5f4dbc355de3ee68186525d473c87`.

Relative to that commit, the only source changes under `packages/core/src` are:

- `components/google/convex.config.ts`: make `CLIENT_ID` and `CLIENT_SECRET` optional and add optional `CALLBACK_URL`.
- `lib/oauth/dbHelpers.ts`: use `CALLBACK_URL` when set, otherwise retain the upstream callback URL.
- `lib/oauth/authorize.ts`: accept an optional asynchronous `authorizationState` callback and use its result as the OAuth authorization URL's state; the original state remains with the browser.
- `methods/google/server.ts`: expose and pass through that callback in `GoogleProviderOptions`.
- `component/public.ts`: add an app-server-only `exchangeSession` operation. It validates source ownership, revocation, inactivity, maximum lifetime and account existence, then uses the existing session issuer to create independent browser credentials. The application must authenticate the source or atomically redeem a single-use handoff before calling it. Component API metadata includes this operation.

- `browser/sessionManager.ts`: serialize session adoption with the existing cross-tab refresh mutex so an older refresh cannot overwrite a newly selected account.

These extensions support password-only deployments and shared preview callbacks. The application signs and verifies the preview routing envelope; see [Google setup](../packages/disposabl-kit/GOOGLE_AUTH.md). They do not replace Convex Auth's PKCE or native state validation.

## Rebuild

Use Node and pnpm versions compatible with the upstream checkout. The archive itself is the source of these changes, so no separate install-time patch is required. From a clean checkout of the exact upstream commit, with this archive at `$AUTH_ARCHIVE`:

```sh
git checkout 437831bdd0990c9faac305f60354e53aec91cd36
pnpm install --frozen-lockfile
mkdir -p /tmp/disposabl-auth-source
tar -xzf "$AUTH_ARCHIVE" -C /tmp/disposabl-auth-source
for path in components/google/convex.config.ts lib/oauth/authorize.ts lib/oauth/dbHelpers.ts methods/google/server.ts component/public.ts component/_generated/component.ts browser/sessionManager.ts; do
  cp "/tmp/disposabl-auth-source/package/src/$path" "packages/core/src/$path"
done
git diff -- packages/core/src
pnpm --filter @convex-dev/auth build
cp /tmp/disposabl-auth-source/package/LICENSE packages/core/LICENSE
cd packages/core
npm pkg set version=2.0.0-beta.0-reboot.437831bd-disposabl.3
npm pack --ignore-scripts
```

Review the source diff against the list above and compare the unpacked package contents; archive metadata may vary by tool version. Update the checksum when publishing a replacement snapshot. The root catalog and generator include this archive in new apps.

## Unselected `.4` authorization marker candidate

`convex-auth-437831bd-disposabl.4.tgz` is an **unselected candidate** based on the exact `.3` archive above, not a full account-erasure implementation. Its SHA-256 is `4678a401ce1732b604f1a2c1d55e61c6568f006db0fcb7cbfcc6d4404488c3d5`. The Apache 2.0 license is included. The source delta against `.3` is [convex-auth-marker-disposabl.4.patch](./convex-auth-marker-disposabl.4.patch), SHA-256 `be4df8114a8d468b88853056ab4811ac405cfcc83080ef22780fe9b220a9adaa`.

The component records `authorizationStartedAt` when it creates an authorization request, omits it from caller-controlled creation arguments, carries it through the claimed request and callback into the ticket, and returns it on ticket claim. An optional Google server callback receives the profile and marker before sign-in or signup; `undefined` means a legacy request or ticket. Existing flows do not reject anything by default. A later erasure fence must explicitly reject unknown/old proof for a tombstoned identity and handle re-registration and cutoff races; this candidate alone is not that fence. Existing PKCE, state and shared callback logic are preserved. Shared OAuth helpers also transport the optional marker for other built-in providers, but only Google exposes the new check callback.

To rebuild, unpack `.3` as the `packages/core` source over a clean checkout at the pinned upstream base after installing dependencies; apply the patch from the core directory (`patch -p1 < /absolute/path/to/convex-auth-marker-disposabl.4.patch`), set the package version to `2.0.0-beta.0-reboot.437831bd-disposabl.4`, then run `pnpm --filter @convex-dev/auth build` and `npm pack --ignore-scripts` from `packages/core`. Review all changed source and generated output before use; the `.3` archive and root dependency selection remain unchanged.

`../packages/tests/fixtures/auth-erasure-convex/marker-runtime.test.ts.txt` is an offline synthetic test intended to be copied beside an extracted `package/` directory. It exercises helper storage and the actual callback with a stubbed `fetch`; it does not connect to Google or prove a Convex transaction race. For example, extract the candidate into a fresh temporary directory, link this checkout's `node_modules` there, copy the test beside `package/`, and run `bun test marker-runtime.test.ts`. To test compiled runtime, change its imports from `./package/src/*.ts` paths to the corresponding `./package/dist/*.js` paths. Both source and compiled callback checks passed locally. Full isolated-component integration and erasure-policy tests remain required before selecting this package.

## Unselected `.5` marker and password-purge prototype

`convex-auth-437831bd-disposabl.5.tgz` (SHA-256 `80b9634290128faf7406f6aa6fbd15144a02a1290b0c0e75bac9c260365894ae`) is an experimental, unselected extension of `.4`. Its source delta is [convex-auth-marker-password-disposabl.5.patch](./convex-auth-marker-password-disposabl.5.patch), SHA-256 `6a2955a8f9c63046ebf769323d3bff41e5f6b4249fce8236ff35dfd0c99c49e9`. It fixes marker propagation for the custom OAuth component and updates Apple, GitHub and custom-provider component API declarations. It adds the password component's app-server-only `eraseUserPasswords`, which atomically creates a per-user tombstone and deletes at most 100 password rows; `complete` is false when another batch remains. Set/verify check the tombstone in their transactions. A different fresh user ID is unaffected. The tombstone retains the opaque user ID and erasure timestamp indefinitely until a retention policy and safe removal protocol are defined; it is not anonymous or evidence of full erasure.

The disposable fixture in `vendor/../packages/tests/fixtures/auth-erasure-convex/` exercised real component transactions on loopback: a pre-cutoff authorization claimed after the cutoff and a later authorization retained distinct server start markers; two concurrent ticket claims yielded one winner each. A password erase/set race ended fenced, old verification failed, another user and a fresh user ID remained usable, and 201 synthetic duplicate rows were removed in 100/100/1 batches with an idempotent zero-row retry. The fixture bridge and duplicate seed are test-only; they do not ship in the archive. Source and compiled marker unit tests also passed. No Google/provider call was made.

This prototype does **not** implement a core account/session/refresh purge, atomic cross-component erasure orchestration, a provider-identity cutoff, or rejection of stale Google redemption. The existing Google server hook is not bound to any cutoff policy. Do not select or deploy `.5` as complete account deletion. Rebuild by unpacking `.4` over the pinned upstream checkout, applying the `.5` patch from `packages/core`, setting the `.5` package version, then running the same build and pack commands as above. Source, JavaScript and public/internal declaration output were built locally; the Apache 2.0 license remains in the archive.

## Unselected `.6` linked-core erasure prototype

`convex-auth-437831bd-disposabl.6.tgz` (SHA-256 `fe99f5ef93f00c2ea1be29b1d108427a51bd2f2ca24e02962359e7f7ec0e8120`) extends `.5` on the same upstream base. Its source delta is [convex-auth-core-erasure-disposabl.6.patch](./convex-auth-core-erasure-disposabl.6.patch), SHA-256 `9946c7f6f7b1799d10b5db0dbdb29aea96364e7d2f719e7a4ac6909cecd77e72`. It contains rebuilt source, JavaScript, public and internal declarations, and the upstream Apache 2.0 license. Rebuild by unpacking `.5` over the pinned checkout, applying the `.6` patch from `packages/core`, setting the `.6` version and running the build and pack commands above.

The core component exposes app-server-only `beginUserErasure` and `purgeUserLinkedAuth`. The first records a durable per-user tombstone; signup using that old user ID, sign-in, session creation, session lookup, refresh and session exchange are fenced. The second requires that fence, removes at most 100 refresh tokens for one linked session per call and at most 100 accounts per account-cleanup call, and reports `linkedRowsCleared` separately from `legacyOrphansUnverified: true`. The latter is always true: earlier session deletion can leave scheduled refresh-token cleanup rows with no user association, so this API cannot prove all per-user refresh tokens erased. Both core and password tombstones retain opaque user IDs and timestamps indefinitely pending a safe retention policy. Calling `beginUserErasure` and password `eraseUserPasswords` from the same app mutation gives one atomic cross-component fence; it is not automatic or wired into the product.

The isolated fixture `vendor/../packages/tests/fixtures/auth-erasure-convex/core-test.py` ran against real components on loopback with telemetry disabled: concurrent fencing/sign-in, rejection of signup for an old user ID, other-user isolation, bounded cleanup of 201 accounts and at least 201 refresh tokens, repeat linked-row cleanup, and rejection of session lookup/refresh/exchange passed. A synthetic orphan row remained after linked cleanup, demonstrating the reported limitation. Source and compiled marker tests still pass. These tests do not prove Google identity erasure: after deleting a core provider mapping, an old Google ticket can still resolve as a new user. A subsequent identity-cutoff API must retain privacy-reviewed identity evidence, use the server authorization-start marker, reject unknown/old proof, and define explicit fresh registration. Do not select `.6` or claim complete deletion until that boundary, orphan handling and the rest of the lifecycle are resolved.

## `.7` identity cutoff candidate

`convex-auth-437831bd-disposabl.7.tgz` (SHA-256 `aa66fe854c43797e7e08c6c279afec822afed3f067a21aded3552eb723a83bf7`) extends `.6` on the same upstream base; [its source patch](./convex-auth-identity-cutoff-disposabl.7.patch) has SHA-256 `f11b56ee48652ac7282e467e10488f91bc220cc1f1264e9b66d99676fe57efd3`. It contains source, compiled JavaScript, public and internal declarations, and the upstream Apache 2.0 license. Rebuild by unpacking `.6` over the pinned checkout, applying this patch from `packages/core`, setting the `.7` version, building and packing as above. Applying the patch to the `.6` source produced the source shipped in `.7` exactly. This checkout selects `.7` in its catalog; selection remains subject to review and is not deployment evidence.

Google redemption checks the original component-generated authorization start against a component-owned identity cutoff before creating any account or session. Once an identity is fenced, legacy tickets with no marker and requests started at or before the cutoff are rejected, including callbacks arriving later. Later authorizations for that identity are also rejected: no re-registration ceremony or automatic tombstone removal exists. Other identities remain usable. Core account creation also refuses a tombstoned identity, including attempts with a different user ID. The user fence and account mapping protect the identity until bounded account cleanup atomically records its identity cutoff. The application must atomically initiate core and password fences and must orchestrate cleanup; this package does not wire that lifecycle.

The identity tombstone retains a SHA-256 digest of the provider name and provider account ID plus a cutoff timestamp indefinitely. This is stable, linkable, potentially guessable pseudonymous material, not anonymous data; retention and a safe re-registration protocol need privacy review. No claim of complete identity erasure is made. Future normal session deletion records the user/session association until scheduled refresh-token cleanup or bounded user purge removes the associated tokens. Historical refresh-token orphans without attribution remain unverified and are not globally deleted.

`../packages/tests/fixtures/auth-erasure-convex/identity-test.py` used synthetic identities and real isolated component transactions with no provider calls. It exercised a fence/redemption race, late callback, legacy and fresh tickets, post-purge cutoff, direct signup denial, another identity, and atomic creation of a session cleanup receipt. Source and compiled marker tests passed separately. This does not demonstrate a live Google flow, prove deletion of historical unattributed tokens, or complete the product account-deletion lifecycle.

### Product orchestration and compiled qualification

For a user whose Google account is still mapped in the core component, a single app-server mutation must call `beginUserErasure({ userId })` and the password component's `eraseUserPasswords({ userId })`. These component calls participate in that mutation's transaction. Once it commits, Google redemption looks up the still-present provider mapping and the core user tombstone; the caller does not provide a Google subject or a cutoff. Only then may the application retry `purgeUserLinkedAuth({ userId })` until it reports `linkedRowsCleared`; each account-mapping deletion records its provider-identity digest and cutoff in the same core transaction. The identity fence remains effective across that transition. This contract depends on the mapping existing when the user fence is established; it cannot reconstruct an identity mapping already removed outside this protocol. Password cleanup also requires retries until `complete`. Other product cleanup, remote stop, and the unresolved historical orphan boundary remain separate prerequisites.

The `.7` archive was extracted unchanged and its `dist` component definitions and JavaScript were loaded into the disposable Convex backend on ports 3540/3541 with `E2E_TELEMETRY_DISABLED=1`. Test-only synthetic bridge and seed exports were appended to the extracted fixture copy, not the archive; they called the packaged implementation. `identity-test.py` and `core-test.py` passed against that compiled runtime. The archive was also inspected for the changed source, runtime modules, public/internal declarations and Google marker metadata. The `.7` patch applied cleanly to `.6` and reproduced the `.7` source tree. Re-registration for a fenced provider identity is denied indefinitely by this candidate; the retained digest and cutoff have not received legal or privacy approval.
