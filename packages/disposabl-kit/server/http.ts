import { getAuthUserId } from "@convex-dev/auth/server";
import { McpServer, tool } from "@convex-dev/mcp";
import { registerStaticRoutes } from "./lib/static-routes";
import { httpRouter } from "convex/server";
import { v } from "convex/values";
import config from "../../../disposabl.json";
import { components, internal } from "../../backend/convex/_generated/api";
import type { Doc, Id } from "../../backend/convex/_generated/dataModel";
import { env } from "../../backend/convex/_generated/server";
import schema from "../../backend/convex/schema";
import { getPlatforms } from "./lib/platforms";

export { tool } from "@convex-dev/mcp";
export type { McpServerOptions, McpUser, ToolCtx } from "@convex-dev/mcp";

const mcp = new McpServer(components.mcp, {
  name: "disposabl",
  title: "Disposabl",
  version: config.version,
  siteUrl: env.CONVEX_SITE_URL,
  consentUrl: `${env.CONVEX_SITE_URL}/consent`,
  scopes: {
    "todos:read": "Read your todos.",
    "todos:write": "Create todos for your account.",
  },
  tools: {
    create_todo: tool({
      description: "Create a todo for the signed-in user.",
      args: { title: v.string() },
      returns: v.id("todos"),
      annotations: { destructiveHint: false, openWorldHint: false },
      scope: "todos:write",
      handler: async (ctx, args, user): Promise<Id<"todos">> =>
        await ctx.runMutation(internal.todos.internal.create, {
          ...args,
          userId: user.userId,
        }),
    }),
    list_todos: tool({
      description: "List the signed-in user's 100 most recent todos.",
      args: {},
      returns: v.array(schema.doc("todos")),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      scope: "todos:read",
      handler: async (ctx, _args, user): Promise<Doc<"todos">[]> =>
        await ctx.runQuery(internal.todos.internal.list, {
          userId: user.userId,
        }),
    }),
    get_todo: tool({
      description: "Get one of the signed-in user's todos by ID.",
      args: { id: v.id("todos") },
      returns: v.union(schema.doc("todos"), v.null()),
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
        openWorldHint: false,
      },
      scope: "todos:read",
      handler: async (ctx, args, user): Promise<Doc<"todos"> | null> =>
        await ctx.runQuery(internal.todos.internal.get, {
          ...args,
          userId: user.userId,
        }),
    }),
  },
});

export const {
  getAuthRequest,
  authorize,
  listConnections,
  revokeConnection,
  createApiKey,
} = mcp.api({ getUserId: getAuthUserId });

export default function createHttpRouter() {
  const http = httpRouter();
  if (getPlatforms().isMcpEnabled) mcp.registerRoutes(http);
  registerStaticRoutes(http, components.staticHosting);
  return http;
}
