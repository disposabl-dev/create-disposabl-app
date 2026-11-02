import passwordProvider from "@convex-dev/auth/components/password/convex.config.js";
import username from "@convex-dev/auth/components/username/convex.config.js";
import auth from "@convex-dev/auth/convex.config.js";
import mcp from "@convex-dev/mcp/convex.config.js";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    AUTH_PRIVATE_KEY: v.string(),
    AUTH_JWKS: v.string(),
    CONVEX_TEAM_ID: v.optional(v.string()),
    CONVEX_TEAM_TOKEN: v.optional(v.string()),
    VERCEL_TOKEN: v.optional(v.string()),
    VERCEL_PROJECT_ID: v.optional(v.string()),
    VERCEL_TEAM_ID: v.optional(v.string()),
    GITHUB_CONNECTOR: v.optional(v.string()),
    GITHUB_OWNER: v.optional(v.string()),
    EXPO_TOKEN: v.optional(v.string()),
    GITHUB_INSTALLATION_ID: v.optional(v.string()),
  },
});

app.use(auth, {
  httpPrefix: "/auth",
  env: {
    AUTH_PRIVATE_KEY: app.env.AUTH_PRIVATE_KEY,
    AUTH_JWKS: app.env.AUTH_JWKS,
  },
});
app.use(passwordProvider);
app.use(username);
app.use(staticHosting);
app.use(mcp);
app.use(workflow);

export default app;
