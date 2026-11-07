# Convex Auth snapshot

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
