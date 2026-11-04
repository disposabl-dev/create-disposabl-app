# Google sign-in

Username/password remains available. The login and signup pages show Google only when both `AUTH_GOOGLE_CLIENT_ID` and `AUTH_GOOGLE_CLIENT_SECRET` are configured on the backend. Credentials never go to the browser.

## One environment

Create a Google OAuth web client and register `<CONVEX_SITE_URL>/oauth/google/callback`. Use the backend's actual HTTP origin: a configured custom domain can replace its `*.convex.site` origin. Set the client ID and secret in that Convex deployment, then deploy the backend.

The backend permits redirects to its own HTTP origin. Set `AUTH_REDIRECT_ORIGINS` to comma-separated frontend origins for localhost or separately hosted frontends. Do not use wildcards.

Keep production in a separate Google Cloud project/client from development and previews. Finish Google's branding and publishing requirements before treating an external production client as generally available.

## Shared preview callback

Convex Auth includes Google sign-in. This snapshot does not include a shared callback across deployments; the small Auth patch and `server/google.ts` provide it.

1. Choose a stable non-production Convex deployment for the callback. Register `https://<stable-deployment>.convex.site/oauth/relay/google` on the development Google client.
2. Set `AUTH_GOOGLE_RELAY_URL` to that URL and `AUTH_GOOGLE_RELAY_SECRET` to a random secret of at least 32 characters. Set the same Google credentials and relay settings on the callback deployment and the trusted previews.
3. Save those four variables as Convex project defaults for development and preview deployments. New preview deployments inherit them and need no new Google redirect registration. Existing deployments need their variables set separately.
4. Deploy each preview. Its Google flow returns through the shared callback to that preview's own backend, which validates and completes the original sign-in.

Keep these defaults out of untrusted fork deployments. Anyone who can execute backend code in a preview can read its environment, so share this client and signing key only within the same trusted project. Production must not receive the preview relay secret or development client credentials.

## Disposabl environments

- Development and preview relay: `clean-marlin-251`, Google project `disposabl-dev`.
- Production: `vivid-caterpillar-633`, Google project `disposabl-production`. Registered callbacks include `https://www.disposabl.dev/oauth/google/callback` and the deployment's `convex.site` callback.

Secrets are stored in Convex environment settings and private local recovery files, never in this repository.
