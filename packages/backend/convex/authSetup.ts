import { setupConvexAuth } from "@convex-dev/auth/server";
import { components } from "./_generated/api";
import { browserSessionTtl } from "@disposabl/disposabl-kit/server/browser-session";

export const sessionTtl = browserSessionTtl;
export const auth = setupConvexAuth({
  component: components.auth,
  ...sessionTtl,
});
