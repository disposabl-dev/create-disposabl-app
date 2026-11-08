import { internalQuery } from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
export const read = internalQuery({
  platforms: true,
  args: { userId: v.string() },
  returns: v.string(),
  handler: async (_ctx, { userId }) => userId,
});
