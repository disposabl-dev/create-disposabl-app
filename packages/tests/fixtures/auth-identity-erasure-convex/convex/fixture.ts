import {
  mutationGeneric as mutation,
  internalMutationGeneric,
  componentsGeneric,
  createFunctionHandle,
  makeFunctionReference,
} from "convex/server";
import { v } from "convex/values";
const c = componentsGeneric();
export const send = internalMutationGeneric({
  args: {
    options: v.any(),
    from: v.string(),
    to: v.array(v.string()),
    subject: v.string(),
    text: v.string(),
  },
  returns: v.null(),
  handler: async () => null,
});
export const setUsername = mutation({
  args: { userId: v.string(), username: v.string() },
  handler: (ctx, args) =>
    ctx.runMutation(c.authUsername.public.setUsername, args),
});
export const getUsername = mutation({
  args: { userId: v.string() },
  handler: (ctx, args) => ctx.runQuery(c.authUsername.public.getUsername, args),
});
export const eraseUsername = mutation({
  args: { userId: v.string() },
  handler: (ctx, args) =>
    ctx.runMutation(c.authUsername.public.eraseUser, args),
});
export const eraseEmail = mutation({
  args: { userId: v.string() },
  handler: (ctx, args) =>
    ctx.runMutation(c.authEmail.verifiedEmails.eraseUserBatch, args),
});
export const seed = mutation({
  args: { userId: v.string(), count: v.number() },
  handler: (ctx, args) => ctx.runMutation(c.authEmail.fixture.seed, args),
});
export const counts = mutation({
  args: { userId: v.string() },
  handler: (ctx, args) => ctx.runQuery(c.authEmail.fixture.counts, args),
});
export const complete = mutation({
  args: { userId: v.string(), index: v.number() },
  handler: (ctx, args) =>
    ctx.runMutation(c.authEmail.challenge.addEmail.complete, {
      userId: args.userId,
      browserSecret: `secret-${args.userId}-${args.index}`,
      emailCode: `code-${args.userId}-${args.index}`,
    }),
});
export const start = mutation({
  args: { userId: v.string(), email: v.string() },
  handler: async (ctx, args) =>
    ctx.runMutation(c.authEmail.challenge.addEmail.start, {
      ...args,
      url: "http://127.0.0.1:3541/fixture",
      emailSender: {
        kind: "resend",
        sendEmailHandle: await createFunctionHandle(
          makeFunctionReference("fixture:send"),
        ),
        from: "fixture@example.test",
        apiKey: "fixture",
        initialBackoffMs: 1,
        retryAttempts: 0,
      },
    }),
});

export const recover = mutation({
  args: { userId: v.string() },
  handler: (ctx, { userId }) =>
    ctx.runMutation(c.authEmail.challenge.custom.complete, {
      currentUserId: userId,
      purpose: "recovery-fixture",
      browserSecret: `recovery-secret-${userId}`,
      emailCode: `recovery-code-${userId}`,
    }),
});
