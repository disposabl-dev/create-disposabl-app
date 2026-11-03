import { v } from "convex/values";
import { internalMutation } from "@disposabl/disposabl-kit/server/lib/functions";
import {
  claudeIssuer,
  normalizeEmail,
} from "@disposabl/disposabl-kit/server/mcp/identity";

// Internal only. Call from a tenant-admin entrypoint after checking its role,
// or use the Convex dashboard/CLI as a deployment administrator.
export const configure = internalMutation({
  args: {
    tenantId: v.string(),
    issuer: v.string(),
    enabled: v.boolean(),
    scopes: v.array(v.string()),
  },
  returns: v.id("mcpOrganizations"),
  handler: async (ctx, args) => {
    claudeIssuer(args.issuer);
    if (
      !args.tenantId.trim() ||
      args.tenantId.length > 200 ||
      args.scopes.length > 100
    )
      throw new Error("Invalid organization configuration.");
    const existing = await ctx.db
      .query("mcpOrganizations")
      .withIndex("by_tenantId", (q) => q.eq("tenantId", args.tenantId))
      .unique();
    const claimed = await ctx.db
      .query("mcpOrganizations")
      .withIndex("by_issuer", (q) => q.eq("issuer", args.issuer))
      .unique();
    if (claimed && claimed._id !== existing?._id)
      throw new Error("Issuer already belongs to another organization.");
    // Issuer replacement needs new member bindings; never silently reuse subjects.
    if (existing && existing.issuer !== args.issuer)
      throw new Error(
        "Disable the old organization and provision a new tenant ID for a new issuer.",
      );
    if (existing) {
      await ctx.db.patch("mcpOrganizations", existing._id, {
        ...args,
        revision: existing.revision + 1,
      });
      return existing._id;
    }
    return ctx.db.insert("mcpOrganizations", { ...args, revision: 1 });
  },
});

// The email must come from a verified authentication callback or a verified
// directory membership. Never expose this operation with client-supplied email.
export const addMember = internalMutation({
  args: {
    organizationId: v.id("mcpOrganizations"),
    userId: v.id("users"),
    verifiedEmail: v.string(),
  },
  returns: v.id("mcpMembers"),
  handler: async (ctx, args) => {
    if (
      !(await ctx.db.get("mcpOrganizations", args.organizationId)) ||
      !(await ctx.db.get("users", args.userId))
    )
      throw new Error("Organization and existing user are required.");
    const verifiedEmail = normalizeEmail(args.verifiedEmail);
    const member = await ctx.db
      .query("mcpMembers")
      .withIndex("by_organizationId_userId", (q) =>
        q.eq("organizationId", args.organizationId).eq("userId", args.userId),
      )
      .unique();
    const other = await ctx.db
      .query("mcpMembers")
      .withIndex("by_organizationId_verifiedEmail", (q) =>
        q
          .eq("organizationId", args.organizationId)
          .eq("verifiedEmail", verifiedEmail),
      )
      .unique();
    if (other && other.userId !== args.userId)
      throw new Error("Email already belongs to another member.");
    if (member) {
      if (member.verifiedEmail !== verifiedEmail)
        throw new Error(
          "Remove the old membership before changing its verified email.",
        );
      return member._id;
    }
    return ctx.db.insert("mcpMembers", { ...args, verifiedEmail });
  },
});

export const removeMember = internalMutation({
  args: { memberId: v.id("mcpMembers") },
  returns: v.null(),
  handler: async (ctx, { memberId }) => {
    await ctx.db.delete("mcpMembers", memberId);
    return null;
  },
});
