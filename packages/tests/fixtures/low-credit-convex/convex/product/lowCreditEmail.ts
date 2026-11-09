import { internalMutationGeneric } from "convex/server";
import { v } from "convex/values";
import { queueForEligibleOwner } from "../../../../../backend/convex/product/lowCreditEmail";

// Test-only decision marker: no email, provider, or production E2E override.
export const queue = internalMutationGeneric({
  args: {
    userId: v.id("users"),
    windowId: v.string(),
    paidUntil: v.number(),
    balance: v.number(),
  },
  handler: (ctx, args) =>
    queueForEligibleOwner(ctx as any, args.userId, async (user) => {
      if (args.balance >= 10) return "not_low" as const;
      if (!user.profile?.email) return "no_verified_email" as const;
      const key = `${args.userId}:${args.windowId}`;
      const existing = await ctx.db
        .query("fixtureEmails")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      if (!existing)
        await ctx.db.insert("fixtureEmails", {
          key,
          to: "inert",
          text: String(args.balance),
        });
      return "queued" as const;
    }),
});
