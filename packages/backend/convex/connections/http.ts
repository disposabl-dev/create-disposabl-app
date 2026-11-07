import { httpAction } from "../_generated/server";
import { posthogCallback, posthogClientId, posthogScopes } from "./config";
import { connectionCallbackRedirect } from "./mobile";

export const connectionCallback = httpAction(async (_ctx, request) =>
  connectionCallbackRedirect(request),
);

export const posthogMetadata = httpAction(async () =>
  Response.json(
    {
      client_id: posthogClientId(),
      client_name: "Disposabl",
      redirect_uris: [posthogCallback()],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      "com.posthog": { scopes: posthogScopes },
    },
    { headers: { "Cache-Control": "public, max-age=300" } },
  ),
);
