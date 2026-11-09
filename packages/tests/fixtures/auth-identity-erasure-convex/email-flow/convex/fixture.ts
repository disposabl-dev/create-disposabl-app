import {
  internalMutationGeneric as internalMutation,
  mutationGeneric as mutation,
  queryGeneric as query,
  componentsGeneric,
  makeFunctionReference,
} from "convex/server";
import { v } from "convex/values";
import { getAuthUserId, setupConvexAuth } from "@convex-dev/auth/server";
import { setupEmailPassword } from "@convex-dev/auth/methods/email-password/server";
import type { ComponentApi as Core } from "@convex-dev/auth/_generated/component";
import type { ComponentApi as Password } from "@convex-dev/auth/components/password/_generated/component";
import type { ComponentApi as Username } from "@convex-dev/auth/components/username/_generated/component";
import type { ComponentApi as Email } from "@convex-dev/auth/components/email/_generated/component";
const c = componentsGeneric() as unknown as {
  auth: Core;
  authPassword: Password;
  authUsername: Username;
  authEmail: Email;
};
const auth = setupConvexAuth({ component: c.auth });
export const createUser = internalMutation({
  args: { provider: v.any() },
  returns: v.id("users"),
  handler: (ctx) => ctx.db.insert("users", { label: "synthetic" }),
});
export const send = internalMutation({
  args: {
    options: v.any(),
    from: v.string(),
    to: v.array(v.string()),
    subject: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.insert("messages", {
      to: args.to[0],
      subject: args.subject,
      text: args.text,
    });
    return null;
  },
});
export const {
  signUpWithEmailPassword,
  completeSignUp,
  signInWithEmailPassword,
  changePassword,
  startPasswordRecovery,
  checkPasswordRecovery,
  completePasswordRecovery,
} = setupEmailPassword(auth, {
  component: c.authEmail,
  passwordComponent: c.authPassword,
  emailSender: {
    kind: "resend",
    sendEmail: makeFunctionReference("fixture:send") as unknown as Parameters<
      typeof setupEmailPassword
    >[1]["emailSender"]["sendEmail"],
    apiKey: "fixture",
    from: "fixture@example.test",
  },
  urls: {
    signUp: "http://127.0.0.1:3541/verify",
    changeEmail: "http://127.0.0.1:3541/verify",
    recovery: "http://127.0.0.1:3541/reset",
  },
}).attachUserCallbacks({
  createUser: makeFunctionReference(
    "fixture:createUser",
  ) as unknown as Parameters<
    ReturnType<typeof setupEmailPassword<"users">>["attachUserCallbacks"]
  >[0]["createUser"],
});
export const message = query({
  args: { to: v.string() },
  handler: async (ctx, { to }) => {
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_to", (q) => q.eq("to", to))
      .order("desc")
      .take(1);
    return rows[0]?.text ?? null;
  },
});
export const erase = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx, c.auth);
    if (!userId) throw new Error("not authenticated");
    await ctx.runMutation(c.auth.public.beginUserErasure, { userId });
    const password = await ctx.runMutation(
      c.authPassword.public.eraseUserPasswords,
      { userId },
    );
    const username = await ctx.runMutation(c.authUsername.public.eraseUser, {
      userId,
    });
    const email = await ctx.runMutation(
      c.authEmail.verifiedEmails.eraseUserBatch,
      { userId },
    );
    return { password, username, email };
  },
});
