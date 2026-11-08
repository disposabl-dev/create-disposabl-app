import type { McpUser } from "@convex-dev/mcp";
import type {
  ApiPolicy,
  AccountEligibility,
} from "@disposabl/disposabl-kit/server/http";
import { internal } from "../_generated/api";
import { accessPrefix, digest } from "./access";

type AgentUser = McpUser & { agentAppId?: string };
const setupReads = new Set([
  "users/internal:current",
  "connections/internal:status",
]);
const appOperations = new Set([
  "apps/internal:get",
  "apps/internal:repositoryToken",
  "previews/token/internal:create",
  "previews/token/internal:complete",
  "previews/internal:get",
  "previews/internal:list",
  "releases/internal:get",
]);

/** Applies only to REST. MCP keeps its own authentication and cannot use these tokens. */
export const agentApiPolicy: ApiPolicy = {
  async authenticate(ctx, request, fallback) {
    const token = request.headers
      .get("Authorization")
      ?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token?.startsWith(accessPrefix)) {
      const user = await fallback(ctx, request);
      if (!user) return null;
      return (await ctx.runQuery(internal.users.internal.deletionPending, {
        userId: user.userId,
      }))
        ? null
        : user;
    }
    if (!/^disposabl_agent_[a-f0-9]{64}$/.test(token)) return null;
    const binding = await ctx.runQuery(internal.agent.access.authenticate, {
      hash: await digest(token),
    });
    if (!binding) return null;
    return {
      userId: binding.userId,
      scopes: [],
      connectionId: binding.threadId,
      agentAppId: binding.appId,
    } as AgentUser;
  },
  authorize(user: AgentUser, operation, input) {
    if (!user.agentAppId) return true;
    return (
      setupReads.has(operation) ||
      (appOperations.has(operation) && input.appId === user.agentAppId)
    );
  },
};

/** Consulted for every tool call and new capability, independent of token age. */
export const accountEligibility: AccountEligibility = async (ctx, userId) =>
  !(await ctx.runQuery(internal.users.internal.deletionPending, { userId }));
