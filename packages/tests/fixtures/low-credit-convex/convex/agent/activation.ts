import { internalMutationGeneric } from "convex/server";
import { v } from "convex/values";
import { expired as realExpired } from "../../../../../backend/convex/agent/activation";

export const expired = internalMutationGeneric({
  args: { sessionId: v.id("computeSessions"), token: v.string() },
  handler: (ctx, args) => (realExpired as any)._handler(ctx, args),
});
