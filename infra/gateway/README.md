# App hostname gateway

This is the wildcard gateway reused from the previous Disposabl application.
Vercel project `disposabl-gateway` owns `*.disposabl.xyz`. Deploy this directory,
not the monorepo frontend. No Vercel project or DNS change is needed per app.

`ROUTING_APP_CONVEX_URL` points to the platform's production Convex cloud URL.
The public `gateway/index:resolve` query maps reserved app/draft hostnames to
provider origins. Vercel rewrites requests, preserving paths, queries and the
browser hostname. `ROUTING_CONVEX_URL`, `ROUTING_PRODUCTION_CONVEX_URL`, and
optional `ROUTING_PREVIEW_CONVEX_URLS` retain the previous platform's routes.
New app routes are resolved first, so legacy directory outages cannot interrupt
them. Unknown names return 404; failed directory lookups return 503. Routes are
cached for at most 30 seconds; missing names for five seconds.

Setup reserves `<name>-<app-id-prefix>.disposabl.xyz` for publication and adds
the draft reference for previews. Collision checks keep names unique, including
references that normalize to the same string. Reservations survive deletion;
the resolver refuses deleted apps and removed previews.

After deploying the backend for the first time, run the internal migration:

```sh
bun x convex run --prod gateway/internal:backfill '{"table":"apps","cursor":null}'
```

It processes existing apps and previews in scheduled batches. Inspect the
returned public URLs and route resolution before switching gateway traffic.
`/github/site` verifies GitHub OIDC, repository ownership and the Convex project
before registering a build's origin. Generated apps set `PUBLIC_SITE_URL` on
the backend and use it in web/mobile clients; provider URLs remain deployment
coordinates. Reports from older generated apps are also mapped to public URLs.

Run gateway regressions from the repository root:

```sh
bun install --cwd infra/gateway --frozen-lockfile
bun test packages/tests/gateway.test.ts packages/tests/gateway-middleware.test.ts
```
