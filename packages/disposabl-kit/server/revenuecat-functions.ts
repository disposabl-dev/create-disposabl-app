import { httpActionGeneric, makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import {
  internalAction,
  internalMutation,
  internalQuery,
} from "./lib/functions";
import { paymentsEnabled } from "../features";
import { billingRequest } from "./billing";
import {
  balanceId,
  balanceRequest,
  parseRevenueCatEvent,
  parseTransfer,
  revenueCatConfig,
  type PurchaseEvent,
  type RevenueCatConfig,
} from "./revenuecat-contract";
import { purchaseEventFields } from "./revenuecat-validator";

const receiveRef = makeFunctionReference<
  "mutation",
  { event: PurchaseEvent; balanceId: string },
  string
>("revenuecat:receive");
const transferRef = makeFunctionReference<
  "mutation",
  {
    project: string;
    app: string;
    environment: string;
    deliveryId: string;
    from: string[];
    to: string[];
  },
  null
>("revenuecat:receiveTransfer");
const dispatchRef = makeFunctionReference<
  "action",
  { balanceId: string },
  null
>("revenuecat:dispatch");
const claimRef = makeFunctionReference<
  "mutation",
  {
    balanceId: string;
    project: string;
    app: string;
    environment: string;
    store: string;
    product: string;
  },
  { customer: string; kind: "grant" | "refund" } | null
>("revenuecat:claim");
const completeRef = makeFunctionReference<
  "mutation",
  { balanceId: string; kind: "grant" | "refund" },
  null
>("revenuecat:complete");

// Compare digests without early exits. Never expose the configured header in errors.
async function sameSecret(a: string, b: string) {
  const encoder = new TextEncoder();
  const [x, y] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(a)),
    crypto.subtle.digest("SHA-256", encoder.encode(b)),
  ]);
  return (
    new Uint8Array(x).reduce(
      (diff, byte, i) => diff | (byte ^ new Uint8Array(y)[i]!),
      0,
    ) === 0
  );
}

export async function webhookAuthorized(
  request: Request,
  authorization: string,
) {
  const supplied = request.headers.get("authorization");
  return !!supplied && (await sameSecret(supplied, authorization));
}

export const webhook = httpActionGeneric(async (ctx, request) => {
  const config = revenueCatConfig(paymentsEnabled, process.env);
  if (!config) return new Response("Unavailable", { status: 503 });
  if (!(await webhookAuthorized(request, config.authorization)))
    return new Response("Unauthorized", { status: 401 });
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return new Response("Invalid event", { status: 400 });
  }
  const transfer = parseTransfer(payload, config);
  if (transfer) {
    await ctx.runMutation(transferRef, transfer);
    return Response.json({ status: "operator_review" }, { status: 202 });
  }
  const event = parseRevenueCatEvent(payload, config);
  if (!event) return new Response("Invalid event", { status: 400 });
  const result = await ctx.runMutation(receiveRef, {
    event,
    balanceId: await balanceId(event),
  });
  // Accepted means persisted, never a claim that the balance has changed.
  return Response.json({ status: result }, { status: 202 });
});

export const receiveTransfer = internalMutation({
  args: {
    project: v.string(),
    app: v.string(),
    environment: v.string(),
    deliveryId: v.string(),
    from: v.array(v.string()),
    to: v.array(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const delivery = await ctx.db
      .query("revenueCatDeliveries")
      .withIndex("by_delivery", (q) =>
        q
          .eq("project", args.project)
          .eq("app", args.app)
          .eq("environment", args.environment)
          .eq("deliveryId", args.deliveryId),
      )
      .unique();
    if (delivery) throw new Error("Conflicting delivery");
    const prior = await ctx.db
      .query("revenueCatTransfers")
      .withIndex("by_delivery", (q) =>
        q
          .eq("project", args.project)
          .eq("app", args.app)
          .eq("environment", args.environment)
          .eq("deliveryId", args.deliveryId),
      )
      .unique();
    if (prior) {
      if (
        JSON.stringify(prior.from) !== JSON.stringify(args.from) ||
        JSON.stringify(prior.to) !== JSON.stringify(args.to)
      )
        throw new Error("Conflicting delivery");
    } else {
      await ctx.db.insert("revenueCatTransfers", args);
      for (const customer of new Set([...args.from, ...args.to])) {
        await ctx.db.insert("revenueCatTransferHolds", {
          project: args.project,
          app: args.app,
          environment: args.environment,
          deliveryId: args.deliveryId,
          customer,
          active: true,
        });
      }
    }
    return null;
  },
});

export const inspectTransfers = internalQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) =>
    ctx.db.query("revenueCatTransfers").order("desc").take(100),
});

export const inspectConflicts = internalQuery({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) =>
    ctx.db
      .query("revenueCatDeliveries")
      .withIndex("by_conflict", (q) => q.eq("conflict", true))
      .order("desc")
      .take(100),
});

export const receive = internalMutation({
  args: { event: v.object(purchaseEventFields), balanceId: v.string() },
  returns: v.string(),
  handler: async (ctx, { event, balanceId }) => {
    const userId = ctx.db.normalizeId("users", event.customer);
    if (!userId || !(await ctx.db.get("users", userId)))
      throw new Error("Unknown customer");
    const transfer = await ctx.db
      .query("revenueCatTransfers")
      .withIndex("by_delivery", (q) =>
        q
          .eq("project", event.project)
          .eq("app", event.app)
          .eq("environment", event.environment)
          .eq("deliveryId", event.deliveryId),
      )
      .unique();
    if (transfer) throw new Error("Conflicting delivery");
    const existingDelivery = await ctx.db
      .query("revenueCatDeliveries")
      .withIndex("by_delivery", (q) =>
        q
          .eq("project", event.project)
          .eq("app", event.app)
          .eq("environment", event.environment)
          .eq("deliveryId", event.deliveryId),
      )
      .unique();
    if (existingDelivery) {
      if (
        existingDelivery.balanceId !== balanceId ||
        existingDelivery.customer !== event.customer ||
        existingDelivery.type !== event.type ||
        existingDelivery.product !== event.product
      )
        throw new Error("Conflicting delivery");
      return existingDelivery.conflict ? "operator_review" : "pending";
    }
    const prior = await ctx.db
      .query("revenueCatPurchases")
      .withIndex("by_balanceId", (q) => q.eq("balanceId", balanceId))
      .unique();
    const conflict =
      !!prior &&
      (prior.customer !== event.customer || prior.product !== event.product);
    await ctx.db.insert("revenueCatDeliveries", {
      ...event,
      balanceId,
      conflict,
    });
    if (conflict) return "operator_review";
    if (!prior) {
      const state =
        event.type === "purchase"
          ? "queued"
          : event.type === "cancel"
            ? "tombstone"
            : "review";
      await ctx.db.insert("revenueCatPurchases", {
        balanceId,
        project: event.project,
        app: event.app,
        environment: event.environment,
        store: event.store,
        transaction: event.transaction,
        product: event.product,
        customer: event.customer,
        state,
        refundPending: false,
        reviewPending: false,
      });
      if (state === "queued")
        await ctx.scheduler.runAfter(0, dispatchRef, { balanceId });
      return state === "queued" ? "pending" : "operator_review";
    }
    if (event.type === "cancel") {
      if (prior.state === "queued")
        await ctx.db.patch("revenueCatPurchases", prior._id, {
          state: "tombstone",
        });
      else if (prior.state === "grant_unknown")
        await ctx.db.patch("revenueCatPurchases", prior._id, {
          refundPending: true,
        });
      else if (prior.state === "granted")
        await ctx.db.patch("revenueCatPurchases", prior._id, {
          state: "refund_review",
        });
    } else if (event.type === "review") {
      if (
        ["queued", "granted", "refund_review", "refund_queued"].includes(
          prior.state,
        )
      )
        await ctx.db.patch("revenueCatPurchases", prior._id, {
          state: "review",
        });
      else if (
        prior.state === "grant_unknown" ||
        prior.state === "refund_unknown"
      )
        await ctx.db.patch("revenueCatPurchases", prior._id, {
          reviewPending: true,
        });
    }
    return "pending";
  },
});

export const claim = internalMutation({
  args: {
    balanceId: v.string(),
    project: v.string(),
    app: v.string(),
    environment: v.string(),
    store: v.string(),
    product: v.string(),
  },
  returns: v.union(
    v.null(),
    v.object({
      customer: v.string(),
      kind: v.union(v.literal("grant"), v.literal("refund")),
    }),
  ),
  handler: async (
    ctx,
    { balanceId, project, app, environment, store, product },
  ) => {
    const row = await ctx.db
      .query("revenueCatPurchases")
      .withIndex("by_balanceId", (q) => q.eq("balanceId", balanceId))
      .unique();
    if (
      !row ||
      row.project !== project ||
      row.app !== app ||
      row.environment !== environment ||
      row.store !== store ||
      row.product !== product ||
      (row.state !== "queued" && row.state !== "refund_queued")
    )
      return null;
    const holds = await ctx.db
      .query("revenueCatTransferHolds")
      .withIndex("by_customer_active", (q) =>
        q
          .eq("project", project)
          .eq("app", app)
          .eq("environment", environment)
          .eq("customer", row.customer)
          .eq("active", true),
      )
      .take(1);
    if (holds.length) return null;
    const kind: "grant" | "refund" =
      row.state === "queued" ? "grant" : "refund";
    await ctx.db.patch("revenueCatPurchases", row._id, {
      state: kind === "grant" ? "grant_unknown" : "refund_unknown",
    });
    return { customer: row.customer, kind };
  },
});

export const complete = internalMutation({
  args: {
    balanceId: v.string(),
    kind: v.union(v.literal("grant"), v.literal("refund")),
  },
  returns: v.null(),
  handler: async (ctx, { balanceId, kind }) => {
    const row = await ctx.db
      .query("revenueCatPurchases")
      .withIndex("by_balanceId", (q) => q.eq("balanceId", balanceId))
      .unique();
    if (
      row &&
      row.state === (kind === "grant" ? "grant_unknown" : "refund_unknown")
    ) {
      await ctx.db.patch("revenueCatPurchases", row._id, {
        state: row.reviewPending
          ? "review"
          : kind === "refund"
            ? "refunded"
            : row.refundPending
              ? "refund_review"
              : "granted",
      });
    }
    return null;
  },
});

export async function dispatchBalance(
  config: RevenueCatConfig,
  balanceId: string,
  claimOperation: (
    scope: ReturnType<typeof scopedOperation>,
  ) => Promise<{ customer: string; kind: "grant" | "refund" } | null>,
  completeOperation: (kind: "grant" | "refund") => Promise<unknown>,
  fetcher: typeof fetch = fetch,
) {
  const operation = await claimOperation(
    scopedOperation({ config, balanceId }),
  );
  if (!operation) return;
  try {
    const result = await billingRequest(
      config.autumnKey,
      operation.kind === "grant" ? "balances.create" : "balances.update",
      balanceRequest(operation.customer, balanceId, operation.kind),
      fetcher,
    );
    if (result.success === true) await completeOperation(operation.kind);
  } catch {
    /* A dispatched write may have committed. Remain unknown. */
  }
}

function scopedOperation({
  config,
  balanceId,
}: {
  config: RevenueCatConfig;
  balanceId: string;
}) {
  return {
    balanceId,
    project: config.project,
    app: config.app,
    environment: config.environment,
    store: config.store,
    product: config.product,
  };
}

export const dispatch = internalAction({
  args: { balanceId: v.string() },
  returns: v.null(),
  handler: async (ctx, { balanceId }) => {
    const config = revenueCatConfig(paymentsEnabled, process.env);
    if (!config) return null;
    await dispatchBalance(
      config,
      balanceId,
      (scope) => ctx.runMutation(claimRef, scope),
      (kind) => ctx.runMutation(completeRef, { balanceId, kind }),
    );
    return null;
  },
});

/** Private operator tools: inspect states and confirm a full refund after provider review. */
export const inspect = internalQuery({
  args: {
    state: v.union(
      v.literal("queued"),
      v.literal("grant_unknown"),
      v.literal("granted"),
      v.literal("tombstone"),
      v.literal("refund_review"),
      v.literal("refund_queued"),
      v.literal("refund_unknown"),
      v.literal("refunded"),
      v.literal("review"),
    ),
  },
  returns: v.array(v.any()),
  handler: async (ctx, { state }) =>
    ctx.db
      .query("revenueCatPurchases")
      .withIndex("by_state", (q) => q.eq("state", state))
      .take(100),
});
export const confirmFullRefund = internalMutation({
  args: { balanceId: v.string(), evidence: v.string() },
  returns: v.boolean(),
  handler: async (ctx, { balanceId, evidence }) => {
    if (!evidence.trim() || evidence.length > 1000)
      throw new Error("Provider evidence is required");
    const row = await ctx.db
      .query("revenueCatPurchases")
      .withIndex("by_balanceId", (q) => q.eq("balanceId", balanceId))
      .unique();
    if (!row || row.state !== "refund_review") return false;
    await ctx.db.patch("revenueCatPurchases", row._id, {
      state: "refund_queued",
      refundEvidence: evidence.trim(),
    });
    await ctx.scheduler.runAfter(0, dispatchRef, { balanceId });
    return true;
  },
});

// Evidence must identify a provider-confirmed operation; an observed aggregate
// balance is not sufficient. This never starts another provider request.
export const confirmUnknown = internalMutation({
  args: {
    balanceId: v.string(),
    kind: v.union(v.literal("grant"), v.literal("refund")),
    evidence: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, { balanceId, kind, evidence }) => {
    if (!evidence.trim() || evidence.length > 1000)
      throw new Error("Provider evidence is required");
    const row = await ctx.db
      .query("revenueCatPurchases")
      .withIndex("by_balanceId", (q) => q.eq("balanceId", balanceId))
      .unique();
    if (
      !row ||
      row.state !== (kind === "grant" ? "grant_unknown" : "refund_unknown")
    )
      return false;
    await ctx.db.patch("revenueCatPurchases", row._id, {
      reconciliationEvidence: evidence.trim(),
      state: row.reviewPending
        ? "review"
        : kind === "refund"
          ? "refunded"
          : row.refundPending
            ? "refund_review"
            : "granted",
    });
    return true;
  },
});
