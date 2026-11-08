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

## Optional SDK analytics

The SDK sends no analytics by itself. An application can explicitly wrap calls and forward the approved operation name and outcome to its own analytics project:

```ts
import { appsList, createSdkAnalytics } from "@disposabl/sdk";

const analytics = createSdkAnalytics({
  enabled: true, // defaults to true; set false to opt out
  environment: "production", // use "development" or "test" outside production
  capture: ({ operation, outcome }) => {
    posthog.capture("sdk_operation", { operation, outcome });
  },
});
const result = await analytics.track("appsList", () => appsList());
```

Supply your own initialized `posthog` (or another sink); the SDK includes no project key or transport. Set `e2e: true` for E2E builds; `E2E_TELEMETRY_DISABLED=1` also disables capture in Node. Capture failures are ignored. Use field-style responses (the default) or `throwOnError: true` so the wrapper can detect failures. The wrapper cannot detect errors hidden by `responseStyle: "data"`. Only wrapped calls emit events. These owner-configured events are separate from any Disposabl platform usage telemetry; avoid enabling PostHog autocapture or sending request content in the sink.

`DO_NOT_TRACK=1` and the browser's `navigator.doNotTrack` setting disable capture. For an SDK generated from your own API, provide `operations: ["notesList", "notesCreate"] as const` with the fixed operation IDs from your generated contract. This replaces the default Disposabl platform operation list. Only identifiers containing letters, numbers, and underscores are accepted; never put user input into this allowlist. Server-side platform operation telemetry, when configured, is separate from this optional owner hook.
