import { v } from "convex/values";

export const organizationFields = {
  tenantId: v.string(),
  issuer: v.string(),
  enabled: v.boolean(),
  scopes: v.array(v.string()),
  revision: v.number(),
};
export const memberFields = {
  organizationId: v.id("mcpOrganizations"),
  userId: v.id("users"),
  verifiedEmail: v.string(),
  subject: v.optional(v.string()),
};
export const tokenFields = {
  organizationId: v.id("mcpOrganizations"),
  memberId: v.id("mcpMembers"),
  revision: v.number(),
  hash: v.string(),
  jti: v.string(),
  expiresAt: v.number(),
  scopes: v.array(v.string()),
  revoked: v.boolean(),
};
export const exchangeArgs = {
  issuer: v.string(),
  revision: v.number(),
  subject: v.string(),
  email: v.optional(v.string()),
  jti: v.string(),
  assertionExpiresAt: v.number(),
  scopes: v.array(v.string()),
  hash: v.string(),
};
