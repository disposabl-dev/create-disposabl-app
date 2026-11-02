# Disposabl TypeScript SDK

Generated with the pinned Hey API generator from `packages/backend/generated/openapi.json`.

```ts
import { client, appsCreate, appsList, appsGet } from "@disposabl/sdk";

client.setConfig({
  baseUrl: "https://your-deployment.convex.site",
  auth: process.env.DISPOSABL_API_KEY,
  throwOnError: true,
});
const { data: created } = await appsCreate({
  body: { name: "My app", platforms: ["web", "api"] },
});
const { data: page } = await appsList({
  query: { paginationOpts: { numItems: 20, cursor: null } },
});
const { data: app } = await appsGet({ query: { appId: created!.appId } });
```

Create API keys at `/dashboard/api-keys`. Keep server integration keys on the server. The API also accepts OAuth tokens issued through its MCP authorization server.

Run `bun run generate` in `packages/backend`, then `bun run generate` here to update the typed operations. Query parameters use JSON encoding. The backend refuses incompatible contract regeneration without `--accept-breaking`; review that diff before accepting a major contract version.
