// Product capability issuance is fenced; existing connections can still be revoked.
import { createMcpApi } from "@disposabl/disposabl-kit/server/http";
import { accountEligibility } from "./agent/api_policy";
export const {
  authorize,
  createApiKey,
  getAuthRequest,
  listConnections,
  revokeConnection,
} = createMcpApi(accountEligibility);
