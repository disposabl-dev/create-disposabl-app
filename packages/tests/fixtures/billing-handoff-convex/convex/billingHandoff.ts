import { internalMutationGeneric as internalMutation } from "convex/server";
import { v } from "convex/values";
import { cleanup } from "../generated/on";
export const cleanupFixture = internalMutation({
  args: { hash: v.string() },
  handler: (ctx, args) => (cleanup as any)._handler(ctx, args),
});
