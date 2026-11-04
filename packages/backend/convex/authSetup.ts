import { setupConvexAuth } from "@convex-dev/auth/server";
import { components } from "./_generated/api";

export const auth = setupConvexAuth({ component: components.auth });
