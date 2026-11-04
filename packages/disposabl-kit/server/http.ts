import { getSessionUserId } from "./lib/functions";
import { McpServer } from "@convex-dev/mcp";
import { EnterpriseMcpServer } from "./mcp/enterprise";
import { httpActionGeneric, httpRouter } from "convex/server";
import { components } from "../../backend/convex/_generated/api";
import { env } from "../../backend/convex/_generated/server";
import modules from "../../backend/generated/platforms";
import openapi from "../../backend/generated/openapi.json";
import config from "../../../disposabl.json";
import { validatePlatforms } from "../platforms";
// docs:start
import { registerDocsRoutes } from "./lib/docs";
// docs:end
import { createOpenApi, createPlatforms } from "./lib/platform-spec";
import { registerPageRoutes } from "./lib/static";
import { googleRelay } from "./google";

export { tool } from "@convex-dev/mcp";
export type { McpServerOptions, McpUser, ToolCtx } from "@convex-dev/mcp";

const platforms = createPlatforms(modules);
if (
  JSON.stringify(createOpenApi(platforms.spec).paths) !==
  JSON.stringify(openapi.paths)
)
  throw new Error(
    "Generated API contract is stale. Run bun run generate; review incompatible changes before using --accept-breaking.",
  );
export const platformSpec = platforms.spec;

const enabled = validatePlatforms(config.platforms);
const mcp: McpServer | undefined = enabled.some(
  (platform) => platform === "mcp" || platform === "api",
)
  ? new (enabled.includes("mcp") ? EnterpriseMcpServer : McpServer)(
      components.mcp,
      {
        name: "disposabl",
        title: "Disposabl",
        version: "1.0.0",
        siteUrl: env.CONVEX_SITE_URL,
        consentUrl: `${env.CONVEX_SITE_URL}/consent`,
        scopes: {},
        clientMetadataDocumentHosts: ["claude.ai"],
        tools: platforms.tools,
      },
    )
  : undefined;

// Keep the enabled API types for consumers; disabled exports are absent at runtime.
export const {
  getAuthRequest,
  authorize,
  listConnections,
  revokeConnection,
  createApiKey,
} =
  mcp?.api({ getUserId: getSessionUserId }) ??
  ({} as ReturnType<McpServer["api"]>);

export default function createHttpRouter() {
  const http = httpRouter();
  http.route({
    path: "/oauth/relay/google",
    method: "GET",
    handler: googleRelay,
  });
  if (mcp) {
    const authRoutes = httpRouter();
    mcp.registerRoutes(authRoutes);
    for (const [path, method, handler] of authRoutes.getRoutes()) {
      if (path !== "/mcp" || enabled.includes("mcp"))
        http.route({ path, method, handler });
    }
  }
  if (mcp && enabled.includes("api")) {
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
      "Cache-Control": "no-store",
    };
    http.route({
      path: "/openapi.json",
      method: "GET",
      handler: httpActionGeneric(async () =>
        Response.json(
          { ...openapi, servers: [{ url: env.CONVEX_SITE_URL }] },
          { headers: cors },
        ),
      ),
    });
    for (const method of ["GET", "POST", "OPTIONS"] as const)
      http.route({
        pathPrefix: "/api/",
        method,
        handler: httpActionGeneric(async (ctx, request) => {
          const response =
            method === "OPTIONS"
              ? new Response(null, { status: 204 })
              : await platforms.handleApi(
                  ctx,
                  request,
                  mcp.authenticate.bind(mcp),
                );
          for (const [key, value] of Object.entries(cors))
            response.headers.set(key, value);
          return response;
        }),
      });
  }
  // docs:start
  registerDocsRoutes(http);
  // docs:end
  registerPageRoutes(http);
  return http;
}
