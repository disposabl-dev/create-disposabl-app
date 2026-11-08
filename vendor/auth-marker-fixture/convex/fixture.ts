import { mutationGeneric as mutation, componentsGeneric } from "convex/server";
import { v } from "convex/values";
const c = componentsGeneric();
export const start = mutation({
  args: { stateHash: v.string() },
  handler: (ctx, a) =>
    ctx.runMutation(c.authGoogle.provider.createAuthorizationRequest, {
      ...a,
      redirectTo: "https://fixture.test",
      codeVerifier: "verifier",
    }),
});
export const bridge = mutation({
  args: { stateHash: v.string(), ticketCodeHash: v.string() },
  handler: (ctx, a) => ctx.runMutation(c.authGoogle.provider.fixtureBridge, a),
});
export const redeem = mutation({
  args: { stateHash: v.string(), ticketCodeHash: v.string() },
  handler: (ctx, a) => ctx.runMutation(c.authGoogle.provider.claimTicket, a),
});
export const setPassword = mutation({
  args: { userId: v.string(), password: v.string() },
  handler: (ctx, a) =>
    ctx.runMutation(c.authPassword.public.setPassword, {
      ...a,
      minimumLength: 8,
    }),
});
export const verifyPassword = mutation({
  args: { userId: v.string(), password: v.string() },
  handler: (ctx, a) => ctx.runMutation(c.authPassword.public.verifyPassword, a),
});
export const erasePassword = mutation({
  args: { userId: v.string() },
  handler: (ctx, a) =>
    ctx.runMutation(c.authPassword.public.eraseUserPasswords, a),
});
export const seedPasswords = mutation({
  args: { userId: v.string(), count: v.number() },
  handler: (ctx, a) => ctx.runMutation(c.authPassword.public.fixtureSeed, a),
});
export const beginBoth = mutation({
  args: { userId: v.string() },
  handler: async (ctx, a) => {
    await ctx.runMutation(c.auth.public.beginUserErasure, a);
    return ctx.runMutation(c.authPassword.public.eraseUserPasswords, a);
  },
});
export const purgeCore = mutation({
  args: { userId: v.string() },
  handler: (ctx, a) => ctx.runMutation(c.auth.public.purgeUserLinkedAuth, a),
});
export const seedCore = mutation({
  args: { userId: v.string(), accounts: v.number(), tokens: v.number() },
  handler: (ctx, a) => ctx.runMutation(c.auth.public.fixtureSeed, a),
});
export const coreLookup = mutation({
  args: { providerAccountId: v.string() },
  handler: (ctx, a) =>
    ctx.runQuery(c.auth.public.getUserIdByAccount, {
      provider: "fixture",
      ...a,
    }),
});
export const coreSignIn = mutation({
  args: { providerAccountId: v.string() },
  handler: async (ctx, a) => {
    await ctx.runMutation(c.auth.public.signIn, {
      claims: {
        providerName: "fixture",
        providerAccountId: a.providerAccountId,
        profile: {},
      },
      accessTokenTtlSeconds: 3600,
      refreshInactivityTimeoutSeconds: 86400,
      sessionMaxLifetimeSeconds: 604800,
    });
    return true;
  },
});
import {
  internalMutationGeneric,
  makeFunctionReference,
  createFunctionHandle,
} from "convex/server";
export const fixtureCreateUser = internalMutationGeneric({
  args: { provider: v.any() },
  handler: async (ctx, a) =>
    a.provider.profile.forcedUserId ??
    (await ctx.db.insert("users", { label: "fixture" })),
});
export const signupOld = mutation({
  args: { userId: v.string(), providerAccountId: v.string() },
  handler: async (ctx, a) =>
    ctx.runMutation(c.auth.public.signUpWithoutSession, {
      claims: {
        providerName: "fixture",
        providerAccountId: a.providerAccountId,
        profile: { forcedUserId: a.userId },
      },
      createUserHandle: await createFunctionHandle(
        makeFunctionReference("fixture:fixtureCreateUser"),
      ),
    }),
});
const fixtureTTL = {
  accessTokenTtlSeconds: 3600,
  refreshInactivityTimeoutSeconds: 86400,
  sessionMaxLifetimeSeconds: 604800,
};
export const coreLogin = mutation({
  args: { userId: v.string(), providerAccountId: v.string() },
  handler: async (ctx, a) => {
    const token = await ctx.runMutation(c.auth.public.signIn, {
      claims: {
        providerName: "fixture",
        providerAccountId: a.providerAccountId,
        profile: {},
      },
      ...fixtureTTL,
    });
    const sessions = await ctx.runQuery(c.auth.public.listSessions, {
      userId: a.userId,
    });
    return {
      refreshToken: token.refreshToken,
      sessionId: sessions[0].sessionId,
    };
  },
});
export const coreRefresh = mutation({
  args: { refreshToken: v.string() },
  handler: (ctx, a) =>
    ctx.runMutation(c.auth.public.refresh, { ...a, ...fixtureTTL }),
});
export const coreExchange = mutation({
  args: { userId: v.string(), sessionId: v.string() },
  handler: (ctx, a) =>
    ctx.runMutation(c.auth.public.exchangeSession, { ...a, ...fixtureTTL }),
});
export const coreSession = mutation({
  args: { sessionId: v.string() },
  handler: (ctx, a) => ctx.runQuery(c.auth.public.getSession, a),
});
export const seedOrphan = mutation({
  args: { userId: v.string() },
  handler: (ctx, a) => ctx.runMutation(c.auth.public.fixtureOrphan, a),
});
export const orphanExists = mutation({
  args: { hash: v.string() },
  handler: (ctx, a) => ctx.runQuery(c.auth.public.fixtureOrphanExists, a),
});
import { setupConvexAuth } from "../authpkg/src/server/setup.ts";
import { setupGoogle } from "../authpkg/src/methods/google/server.ts";
import { sha256Hex } from "../authpkg/src/lib/crypto.ts";
import { encryptTicketPayload } from "../authpkg/src/lib/oauth/crypto.ts";
const core = setupConvexAuth({ component: c.auth });
export const { completeSignInWithGoogle } = setupGoogle(core, {
  component: c.authGoogle,
  allowedRedirectOrigins: ["https://fixture.test"],
}).attachUserCallbacks({
  createUser: makeFunctionReference("fixture:fixtureCreateUser") as any,
});
export const googleStart = mutation({
  args: { state: v.string() },
  handler: async (ctx, a) =>
    ctx.runMutation(c.authGoogle.provider.createAuthorizationRequest, {
      stateHash: await sha256Hex(a.state),
      redirectTo: "https://fixture.test",
      codeVerifier: "verifier",
    }),
});
export const googleMint = mutation({
  args: {
    state: v.string(),
    code: v.string(),
    sub: v.string(),
    legacy: v.boolean(),
  },
  handler: async (ctx, a) =>
    ctx.runMutation(c.authGoogle.provider.fixtureMint, {
      stateHash: await sha256Hex(a.state),
      ticketCodeHash: await sha256Hex(a.code),
      encryptedPayload: await encryptTicketPayload(
        a.code,
        JSON.stringify({ claims: { sub: a.sub } }),
      ),
      legacy: a.legacy,
    }),
});
export const cutoff = mutation({
  args: { sub: v.string() },
  handler: (ctx, a) =>
    ctx.runQuery(c.auth.public.getIdentityErasureCutoff, {
      provider: "google",
      providerAccountId: a.sub,
    }),
});
export const recordFutureReceipt = mutation({
  args: { userId: v.string() },
  handler: (ctx, a) => ctx.runMutation(c.auth.public.fixtureDeleteSession, a),
});
export const directGoogleSignup = mutation({
  args: { userId: v.string(), sub: v.string() },
  handler: async (ctx, a) =>
    ctx.runMutation(c.auth.public.signUpWithoutSession, {
      claims: {
        providerName: "google",
        providerAccountId: a.sub,
        profile: { forcedUserId: a.userId },
      },
      createUserHandle: await createFunctionHandle(
        makeFunctionReference("fixture:fixtureCreateUser"),
      ),
    }),
});
export const googleLookup = mutation({
  args: { sub: v.string() },
  handler: (ctx, a) =>
    ctx.runQuery(c.auth.public.getUserIdByAccount, {
      provider: "google",
      providerAccountId: a.sub,
    }),
});
