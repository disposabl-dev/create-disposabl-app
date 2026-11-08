import { internalMutationGeneric } from "convex/server";
import { v } from "convex/values";
import { queueLowCreditNotice } from "../../../../../backend/convex/product/lowCreditEmail";
// Inert transport stored transactionally in this disposable fixture only.
export const queue = internalMutationGeneric({
  args: {
    userId: v.id("users"),
    windowId: v.string(),
    paidUntil: v.number(),
    balance: v.number(),
  },
  handler: async (ctx, args) => {
    const config = (await ctx.db.query("fixtureConfig").first())!;
    const user = await ctx.db.get(args.userId);
    return queueLowCreditNotice(args, {
      enabled: config.enabled,
      environment: config.environment,
      e2e: config.e2e,
      sender: "fixture@example.invalid",
      apiKey: "fixture",
      paymentUrl: "https://example.invalid/pricing",
      getVerifiedEmail: async () => user?.profile?.email ?? null,
      enqueue: async (message) => {
        if (config.fail) throw new Error("fixture queue failure");
        const existing = await ctx.db
          .query("fixtureEmails")
          .withIndex("by_key", (q) => q.eq("key", message.idempotencyKey))
          .first();
        if (!existing)
          await ctx.db.insert("fixtureEmails", {
            key: message.idempotencyKey,
            to: message.to,
            text: message.text,
          });
      },
    });
  },
});
