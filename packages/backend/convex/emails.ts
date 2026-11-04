import { Resend } from "@convex-dev/resend";
import { components } from "./_generated/api";
import { env } from "./_generated/server";

/** Shared queued email sender. Call sendEmail from an authorized app function. */
export const resend = new Resend(components.resend, {
  apiKey: env.RESEND_API_KEY,
  webhookSecret: env.RESEND_WEBHOOK_SECRET,
  testMode: false,
});
