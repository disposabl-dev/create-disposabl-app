import { paymentsEnabled } from "@disposabl/disposabl-kit/features";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { env, type MutationCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";
import { resend } from "../emails";

type Notice = {
  userId: string;
  windowId: string;
  paidUntil: number;
  balance: number;
};
type Message = {
  from: string;
  to: string;
  subject: string;
  text: string;
  idempotencyKey: string;
};

/** The caller supplies the confirmed debit window and a later balance observation. */
export async function queueLowCreditNotice(
  notice: Notice,
  options: {
    enabled: boolean;
    environment?: string;
    e2e?: string;
    sender?: string;
    apiKey?: string;
    paymentUrl?: string;
    getVerifiedEmail: () => Promise<string | null>;
    enqueue: (message: Message) => Promise<unknown>;
  },
) {
  if (
    !options.enabled ||
    options.environment !== "production" ||
    options.e2e === "1"
  )
    return "disabled" as const;
  if (
    !Number.isFinite(notice.balance) ||
    !Number.isSafeInteger(notice.paidUntil) ||
    notice.paidUntil <= 0 ||
    !notice.userId ||
    !notice.windowId ||
    !Number.isFinite(new Date(notice.paidUntil).getTime())
  )
    throw new Error("Invalid low-credit notice.");
  if (notice.balance >= 10) return "not_low" as const;
  if (!options.sender?.trim() || !options.apiKey?.trim())
    throw new Error("Email delivery is not configured.");
  const paymentUrl = new URL(options.paymentUrl ?? "");
  if (
    paymentUrl.protocol !== "https:" ||
    paymentUrl.username ||
    paymentUrl.password ||
    paymentUrl.search ||
    paymentUrl.hash
  )
    throw new Error("Payments are not configured.");
  const email = await options.getVerifiedEmail();
  if (!email) return "no_verified_email" as const;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify([notice.userId, notice.windowId])),
  );
  const key = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  await options.enqueue({
    from: options.sender.trim(),
    to: email,
    subject: "Your Disposabl credits are running low",
    text: `At our latest check, your balance was below 10 credits. Your current paid window continues until ${new Date(notice.paidUntil).toISOString()}. At the next ten-minute renewal check, 10 credits are required to keep the sandbox running. Add credits before then if needed. If the sandbox stops for insufficient credits, add credits and send a new message to resume.\n\nAdd credits: ${paymentUrl}`,
    idempotencyKey: `low-credit:${key}`,
  });
  return "queued" as const;
}

/** Check in the enqueue transaction so a deletion request serializes with it. */
export async function queueForEligibleOwner<T>(
  ctx: Pick<MutationCtx, "db">,
  userId: Id<"users">,
  queue: (user: Doc<"users">) => Promise<T>,
): Promise<T | "account_ineligible"> {
  const user = await ctx.db.get("users", userId);
  if (!user || user.deletionRequestedAt !== undefined)
    return "account_ineligible";
  return queue(user);
}

/**
 * Call only after a confirmed debit with a separate, non-consuming observation.
 * That later observation is not an atomic snapshot of the debit.
 * Use the same windowId and paidUntil for retries, unique per user and paid window.
 * Enqueue deduplication lasts while the Resend component retains its email record.
 * Schedule or retry from durable compute state without undoing the debit; never
 * replay after the component record is cleaned up. "queued" is not delivery.
 * Handle "no_verified_email" explicitly, and retry queue errors separately.
 */
export const queue = internalMutation({
  args: {
    userId: v.id("users"),
    windowId: v.string(),
    paidUntil: v.number(),
    balance: v.number(),
  },
  returns: v.union(
    v.literal("disabled"),
    v.literal("account_ineligible"),
    v.literal("not_low"),
    v.literal("no_verified_email"),
    v.literal("queued"),
  ),
  handler: async (ctx, notice) =>
    queueForEligibleOwner(ctx, notice.userId, (user) =>
      queueLowCreditNotice(notice, {
        enabled: paymentsEnabled,
        environment: env.DISPOSABL_ENVIRONMENT,
        // The test wrapper sets this process flag; no provider call is allowed in E2E.
        // eslint-disable-next-line @convex-dev/no-process-env
        e2e: process.env.E2E_TELEMETRY_DISABLED,
        sender: env.RESEND_FROM_EMAIL,
        apiKey: env.RESEND_API_KEY,
        // Checkout's return destination may be a completion page, not a place to buy.
        paymentUrl: "https://www.disposabl.dev/pricing",
        getVerifiedEmail: async () => {
          return (
            (await ctx.runQuery(
              components.authEmail.verifiedEmails.getPrimaryEmail,
              { userId: notice.userId },
            )) ??
            user.profile?.email ??
            null
          );
        },
        enqueue: (message) => resend.sendEmail(ctx, message),
      }),
    ),
});
