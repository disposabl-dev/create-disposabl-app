// Fixture-only barrier and inert provider around the production worker.
import { internalActionGeneric, makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { dispatch as productionDispatch } from "../../../../disposabl-kit/server/revenuecat-functions";
export {
  routing,
  claim,
  complete,
} from "../../../../disposabl-kit/server/revenuecat-functions";

const control = makeFunctionReference<"query", { balanceId: string }, any>(
  "fixture:controlInternal",
);
const mark = makeFunctionReference<
  "mutation",
  {
    balanceId: string;
    field: "arrived" | "finished" | "providerCalls" | "claimAttempts";
    customer?: string;
  },
  null
>("fixture:markInternal");

export const dispatch = internalActionGeneric({
  args: { balanceId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const initial = await ctx.runQuery(control, args);
    if (!initial?.enabled) {
      if (initial) await ctx.runMutation(mark, { ...args, field: "finished" });
      return null;
    }
    await ctx.runMutation(mark, { ...args, field: "arrived" });
    for (let i = 0; i < 200; i++) {
      if ((await ctx.runQuery(control, args))?.released) {
        const originalFetch = globalThis.fetch;
        globalThis.fetch = (async (url, init) => {
          const body = JSON.parse(String(init?.body));
          if (
            url !== "https://api.useautumn.com/v1/balances.create" ||
            body.balance_id !== args.balanceId ||
            typeof body.customer_id !== "string"
          )
            throw new Error("Unexpected fixture provider request");
          await ctx.runMutation(mark, {
            ...args,
            field: "providerCalls",
            customer: body.customer_id,
          });
          return Response.json({ success: true });
        }) as typeof fetch;
        try {
          const observed = {
            ...ctx,
            runMutation: async (ref: any, mutationArgs: any) => {
              if (ref[Symbol.for("functionName")] === "revenuecat:claim")
                await ctx.runMutation(mark, {
                  ...args,
                  field: "claimAttempts",
                });
              return ctx.runMutation(ref, mutationArgs);
            },
          };
          await (productionDispatch as any)._handler(observed, args);
        } finally {
          globalThis.fetch = originalFetch;
          await ctx.runMutation(mark, { ...args, field: "finished" });
        }
        return null;
      }
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("Fixture barrier timed out");
  },
});
