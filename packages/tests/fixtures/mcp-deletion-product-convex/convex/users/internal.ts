import { internalMutationGeneric, internalQueryGeneric } from "convex/server";
import { v } from "convex/values";
import { deletionPending as check } from "../../../../../backend/convex/users/deletion";
export const deletionPending = internalQueryGeneric({
  args: { userId: v.string() },
  returns: v.boolean(),
  handler: (ctx, { userId }) => check(ctx as any, userId),
});

export const createUser = internalMutationGeneric({
  args: { provider: v.any() },
  returns: v.id("users"),
  handler: async (ctx) =>
    ctx.db.insert("users", { label: "real-auth-fixture" }),
});
export const onSignIn = internalMutationGeneric({
  args: { userId: v.id("users"), provider: v.any() },
  returns: v.null(),
  handler: async () => null,
});
