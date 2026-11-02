import { getAuthUserId } from "@convex-dev/auth/server";
import { McpServer } from "@convex-dev/mcp";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpActionGeneric, httpRouter } from "convex/server";
import { components } from "../../backend/convex/_generated/api";
import { env } from "../../backend/convex/_generated/server";
import * as todos from "../../backend/convex/todos/internal";
import config from "../../../disposabl.json";
import { validatePlatforms } from "../platforms";
import { createPlatforms } from "./lib/platform-spec";

export { tool } from "@convex-dev/mcp";
export type { McpServerOptions, McpUser, ToolCtx } from "@convex-dev/mcp";

const platforms = createPlatforms({ "todos/internal": todos });
export const platformSpec = platforms.spec;

const enabled = validatePlatforms(config.platforms);
const mcp = enabled.some((platform) => platform === "mcp" || platform === "api")
  ? new McpServer(components.mcp, {
      name: "disposabl",
      title: "Disposabl",
      version: "1.0.0",
      siteUrl: env.CONVEX_SITE_URL,
      consentUrl: `${env.CONVEX_SITE_URL}/consent`,
      scopes: {},
      tools: platforms.tools,
    })
  : undefined;

// Keep the enabled API types for consumers; disabled exports are absent at runtime.
export const {
  getAuthRequest,
  authorize,
  listConnections,
  revokeConnection,
  createApiKey,
} =
  mcp?.api({ getUserId: getAuthUserId }) ??
  ({} as ReturnType<McpServer["api"]>);

export default function createHttpRouter() {
  const http = httpRouter();
  if (mcp && enabled.includes("mcp")) mcp.registerRoutes(http);
  if (mcp && enabled.includes("api"))
    http.route({
      pathPrefix: "/api/",
      method: "POST",
      handler: httpActionGeneric((ctx, request) =>
        platforms.handleApi(ctx, request, mcp.authenticate.bind(mcp)),
      ),
    });
  registerStaticRoutes(http, components.staticHosting);
  return http;
}
