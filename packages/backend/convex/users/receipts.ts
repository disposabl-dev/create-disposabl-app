import {
  paginationOptsValidator,
  paginationResultValidator,
} from "convex/server";
import { v } from "convex/values";
import { internalQuery } from "@disposabl/disposabl-kit/server/lib/functions";
import type { MutationCtx, QueryCtx } from "../_generated/server";

export function findReceipt(ctx: QueryCtx | MutationCtx, ownerId: string) {
  return ctx.db
    .query("deletionReceipts")
    .withIndex("by_owner", (q) => q.eq("ownerId", ownerId))
    .unique();
}
export async function ensureReceipt(
  ctx: MutationCtx,
  ownerId: string,
  requestedAt: number,
) {
  const existing = await findReceipt(ctx, ownerId);
  if (existing) {
    if (existing.requestedAt !== requestedAt)
      throw new Error("Deletion request receipt does not match.");
    return existing;
  }
  const reference = crypto.randomUUID();
  await ctx.db.insert("deletionReceipts", { reference, ownerId, requestedAt });
  return { reference, ownerId, requestedAt };
}
const receipt = v.object({
  reference: v.string(),
  ownerId: v.string(),
  requestedAt: v.number(),
});
/** Internal support lookup; a reference is not an authorization credential. */
export const lookup = internalQuery({
  args: { reference: v.string() },
  returns: v.union(v.null(), receipt),
  handler: async (ctx, { reference }) => {
    const row = await ctx.db
      .query("deletionReceipts")
      .withIndex("by_reference", (q) => q.eq("reference", reference))
      .unique();
    return row
      ? {
          reference: row.reference,
          ownerId: row.ownerId,
          requestedAt: row.requestedAt,
        }
      : null;
  },
});
export const pending = internalQuery({
  args: { paginationOpts: paginationOptsValidator },
  returns: paginationResultValidator(receipt),
  handler: async (ctx, { paginationOpts }) => {
    const result = await ctx.db
      .query("deletionReceipts")
      .paginate(paginationOpts);
    return {
      ...result,
      page: result.page.map(({ reference, ownerId, requestedAt }) => ({
        reference,
        ownerId,
        requestedAt,
      })),
    };
  },
});
