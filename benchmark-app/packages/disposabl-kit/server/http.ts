import { getAuthUserId } from "@convex-dev/auth/server";
import { McpServer } from "@convex-dev/mcp";
import { registerStaticRoutes } from "@convex-dev/static-hosting";
import { httpRouter } from "convex/server";
import { components } from "../../backend/convex/_generated/api";
import { env } from "../../backend/convex/_generated/server";
import { createMcpTools } from "./lib/mcp-tools";
import { getPlatforms } from "./lib/platforms";

export { tool } from "@convex-dev/mcp";
export type { McpServerOptions, McpUser, ToolCtx } from "@convex-dev/mcp";

const mcp = getPlatforms().isMcpEnabled
  ? new McpServer(components.mcp, {
      name: "disposabl",
      title: "Disposabl",
      version: "1.0.0",
      siteUrl: env.CONVEX_SITE_URL,
      consentUrl: `${env.CONVEX_SITE_URL}/consent`,
      scopes: {},
      // Discovery is disabled; platform flags do not register tools yet.
      tools: createMcpTools({}),
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
  mcp?.registerRoutes(http);
  registerStaticRoutes(http, components.staticHosting);
  return http;
}
