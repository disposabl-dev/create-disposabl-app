import { setupEmailPassword } from "@convex-dev/auth/methods/email-password/server";
import { ConvexError } from "convex/values";
import { components, internal } from "./_generated/api";
import { env } from "./_generated/server";
import { auth } from "./authSetup";

const origin = env.AUTH_EMAIL_ORIGIN || env.CONVEX_SITE_URL;

// Auth v2 reads these only inside a transaction. A missing sender rolls the
// transaction back rather than creating an account or claiming an email was sent.
const emailSender = {
  kind: "resend" as const,
  sendEmail: components.resend.lib.sendEmail,
  get apiKey() {
    if (!env.RESEND_API_KEY?.trim() || !env.RESEND_FROM_EMAIL?.trim()) {
      throw new ConvexError("Email delivery is not configured.");
    }
    return env.RESEND_API_KEY;
  },
  get from() {
    return env.RESEND_FROM_EMAIL ?? "";
  },
};

export const {
  signUpWithEmailPassword,
  completeSignUp,
  signInWithEmailPassword,
  changePassword,
  startPasswordRecovery,
  checkPasswordRecovery,
  completePasswordRecovery,
} = setupEmailPassword(auth, {
  component: components.authEmail,
  passwordComponent: components.authPassword,
  emailSender,
  urls: {
    signUp: `${origin}/verify-email`,
    changeEmail: `${origin}/verify-email`,
    recovery: `${origin}/reset-password`,
  },
}).attachUserCallbacks({ createUser: internal.users.internal.createUser });
