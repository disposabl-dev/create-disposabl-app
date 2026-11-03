import { v } from "convex/values";
import {
  internalMutation,
  internalQuery,
} from "@disposabl/disposabl-kit/server/lib/functions";
import {
  normalizeEmail,
  CLAUDE_CLIENT_ID,
} from "@disposabl/disposabl-kit/server/mcp/identity";
import { internal } from "../_generated/api";
import { exchangeArgs, organizationFields } from "./validator";

export const organization = internalQuery({
  args: { issuer: v.string() },
  returns: v.union(v.null(), v.object(organizationFields)),
  handler: async (ctx, { issuer }) => {
    const org = await ctx.db
      .query("mcpOrganizations")
      .withIndex("by_issuer", (q) => q.eq("issuer", issuer))
      .unique();
    if (!org?.enabled) return null;
    return {
      tenantId: org.tenantId,
      issuer: org.issuer,
      enabled: org.enabled,
      scopes: org.scopes,
      revision: org.revision,
    };
  },
});

// One transaction binds the subject, consumes the assertion, and issues a token.
export const exchange = internalMutation({
  args: exchangeArgs,
  returns: v.union(v.null(), v.object({ expiresIn: v.number() })),
  handler: async (ctx, args) => {
    const org = await ctx.db
      .query("mcpOrganizations")
      .withIndex("by_issuer", (q) => q.eq("issuer", args.issuer))
      .unique();
    if (
      !org?.enabled ||
      org.revision !== args.revision ||
      args.assertionExpiresAt <= Date.now() ||
      args.scopes.some((s) => !org.scopes.includes(s))
    )
      return null;
    const replay = await ctx.db
      .query("mcpEnterpriseTokens")
      .withIndex("by_organizationId_jti", (q) =>
        q.eq("organizationId", org._id).eq("jti", args.jti),
      )
      .unique();
    if (replay) return null;
    let member = await ctx.db
      .query("mcpMembers")
      .withIndex("by_organizationId_subject", (q) =>
        q.eq("organizationId", org._id).eq("subject", args.subject),
      )
      .unique();
    if (!member && args.email) {
      member = await ctx.db
        .query("mcpMembers")
        .withIndex("by_organizationId_verifiedEmail", (q) =>
          q
            .eq("organizationId", org._id)
            .eq("verifiedEmail", normalizeEmail(args.email!)),
        )
        .unique();
      if (member?.subject) return null;
    }
    if (!member || !(await ctx.db.get("users", member.userId))) return null;
    if (!member.subject)
      await ctx.db.patch("mcpMembers", member._id, { subject: args.subject });
    const expiresAt = Date.now() + 300_000;
    const tokenId = await ctx.db.insert("mcpEnterpriseTokens", {
      organizationId: org._id,
      memberId: member._id,
      revision: org.revision,
      hash: args.hash,
      jti: args.jti,
      expiresAt,
      scopes: args.scopes,
      revoked: false,
    });
    // Retain consumed jti until both the assertion and token expire.
    await ctx.scheduler.runAt(
      Math.max(expiresAt, args.assertionExpiresAt) + 30_000,
      internal.mcpEnterprise.internal.expire,
      { tokenId },
    );
    return { expiresIn: 300 };
  },
});

export const verify = internalQuery({
  args: { hash: v.string(), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      userId: v.string(),
      scopes: v.array(v.string()),
      clientId: v.string(),
      connectionId: v.string(),
    }),
  ),
  handler: async (ctx, { hash, now }) => {
    const token = await ctx.db
      .query("mcpEnterpriseTokens")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (!token || token.revoked || token.expiresAt <= now) return null;
    const org = await ctx.db.get("mcpOrganizations", token.organizationId);
    const member = await ctx.db.get("mcpMembers", token.memberId);
    if (
      !org?.enabled ||
      org.revision !== token.revision ||
      !member ||
      member.organizationId !== org._id ||
      !(await ctx.db.get("users", member.userId))
    )
      return null;
    return {
      userId: member.userId,
      scopes: token.scopes,
      clientId: CLAUDE_CLIENT_ID,
      connectionId: token._id,
    };
  },
});

export const revoke = internalMutation({
  args: { hash: v.string() },
  returns: v.null(),
  handler: async (ctx, { hash }) => {
    const token = await ctx.db
      .query("mcpEnterpriseTokens")
      .withIndex("by_hash", (q) => q.eq("hash", hash))
      .unique();
    if (token)
      await ctx.db.patch("mcpEnterpriseTokens", token._id, { revoked: true });
    return null;
  },
});

export const expire = internalMutation({
  args: { tokenId: v.id("mcpEnterpriseTokens") },
  returns: v.null(),
  handler: async (ctx, { tokenId }) => {
    await ctx.db.delete("mcpEnterpriseTokens", tokenId);
    return null;
  },
});
