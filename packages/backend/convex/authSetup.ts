import { setupConvexAuth } from "@convex-dev/auth/server";
import { components } from "./_generated/api";

export const sessionTtl = {
  accessTokenTtlSeconds: 60,
  refreshInactivityTimeoutSeconds: 30 * 24 * 60 * 60,
  sessionMaxLifetimeSeconds: 30 * 24 * 60 * 60,
};
export const auth = setupConvexAuth({
  component: components.auth,
  ...sessionTtl,
});
