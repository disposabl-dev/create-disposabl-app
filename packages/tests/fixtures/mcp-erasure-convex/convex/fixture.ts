// Fixture-only synthetic component calls; never deploy outside the local test.
import {
  mutationGeneric,
  queryGeneric,
  componentsGeneric,
} from "convex/server";
import { v } from "convex/values";
const mcp = componentsGeneric().mcp;
export const mutate = mutationGeneric({
  args: { operation: v.string(), args: v.any() },
  returns: v.any(),
  handler: async (ctx, { operation, args }) => {
    const allowed: Record<string, any> = {
      createKey: mcp.grants.createApiKey,
      revoke: mcp.grants.revoke,
      createRedirect: mcp.oauth.createAuthRequest,
      createDevice: mcp.oauth.createDeviceRequest,
      decide: mcp.oauth.decideAuthRequest,
      exchange: mcp.oauth.exchangeCode,
      poll: mcp.oauth.pollDevice,
      refresh: mcp.oauth.refresh,
      client: mcp.clients.register,
      erase: mcp.erasure.eraseUserBatch,
    };
    if (!allowed[operation]) throw new Error("Unsupported fixture mutation");
    return await ctx.runMutation(allowed[operation], args);
  },
});
export const query = queryGeneric({
  args: { operation: v.string(), args: v.any() },
  returns: v.any(),
  handler: async (ctx, { operation, args }) => {
    const allowed: Record<string, any> = {
      verify: mcp.tokens.verify,
      list: mcp.grants.list,
      request: mcp.oauth.getAuthRequest,
      probe: mcp.fixtureProbe.countTokens,
    };
    if (!allowed[operation]) throw new Error("Unsupported fixture query");
    return await ctx.runQuery(allowed[operation], args);
  },
});
