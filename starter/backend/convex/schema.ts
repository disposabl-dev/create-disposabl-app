import {
  organizationFields,
  memberFields,
  tokenFields,
} from "./mcpEnterprise/validator";
import { defineSchema, defineTable } from "convex/server";

export default defineSchema({
  mcpOrganizations: defineTable(organizationFields)
    .index("by_tenantId", ["tenantId"])
    .index("by_issuer", ["issuer"]),
  mcpMembers: defineTable(memberFields)
    .index("by_organizationId_userId", ["organizationId", "userId"])
    .index("by_organizationId_verifiedEmail", [
      "organizationId",
      "verifiedEmail",
    ])
    .index("by_organizationId_subject", ["organizationId", "subject"]),
  mcpEnterpriseTokens: defineTable(tokenFields)
    .index("by_hash", ["hash"])
    .index("by_organizationId_jti", ["organizationId", "jti"]),
  users: defineTable({}),
});
