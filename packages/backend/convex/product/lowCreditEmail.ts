import { paymentsEnabled } from "@disposabl/disposabl-kit/features";
import { billingConfig } from "@disposabl/disposabl-kit/server/billing";
import { v } from "convex/values";
import { components } from "../_generated/api";
import { env } from "../_generated/server";
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

/** The caller supplies the confirmed debit's immutable window and post-debit balance. */
export async function queueLowCreditNotice(
  notice: Notice,
  options: {
    enabled: boolean;
    environment?: string;
    e2e?: string;
    sender?: string;
    apiKey?: string;
    paymentUrl?: string;
    billingKey?: string;
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
  const paymentUrl = billingConfig(true, {
    AUTUMN_SECRET_KEY: options.billingKey,
    BILLING_RETURN_URL: options.paymentUrl,
  })!.returnUrl;
  if (!paymentUrl.startsWith("https://"))
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
    text: `Your balance is below 10 credits. Your current access ends at ${new Date(notice.paidUntil).toISOString()} unless you add credits before then.\n\nYour files will be saved. If access expires, send a new message to resume after adding credits.\n\nAdd credits: ${paymentUrl}`,
    idempotencyKey: `low-credit:${key}`,
  });
  return "queued" as const;
}

/**
 * Call only after a confirmed debit, with its authoritative post-debit balance.
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
    v.literal("not_low"),
    v.literal("no_verified_email"),
    v.literal("queued"),
  ),
  handler: async (ctx, notice) =>
    queueLowCreditNotice(notice, {
      enabled: paymentsEnabled,
      environment: env.DISPOSABL_ENVIRONMENT,
      // The test wrapper sets this process flag; no provider call is allowed in E2E.
      // eslint-disable-next-line @convex-dev/no-process-env
      e2e: process.env.E2E_TELEMETRY_DISABLED,
      sender: env.RESEND_FROM_EMAIL,
      apiKey: env.RESEND_API_KEY,
      paymentUrl: env.BILLING_RETURN_URL,
      billingKey: env.AUTUMN_SECRET_KEY,
      getVerifiedEmail: async () => {
        const user = await ctx.db.get("users", notice.userId);
        if (!user) return null;
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
});
