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
    CONVEX_OAUTH_CLIENT_ID: v.optional(v.string()),
    CONVEX_OAUTH_CLIENT_SECRET: v.optional(v.string()),
    GITHUB_APP_SLUG: v.optional(v.string()),
    CONNECTIONS_ENCRYPTION_KEY: v.optional(v.string()),
    CONNECTIONS_ORIGIN: v.optional(v.string()),
    VERCEL_TOKEN: v.optional(v.string()),
    VERCEL_PROJECT_ID: v.optional(v.string()),
    VERCEL_TEAM_ID: v.optional(v.string()),
    GITHUB_CONNECTOR: v.optional(v.string()),
  },
});

app.use(auth);

app.use(passwordProvider);
app.use(username);
app.use(staticHosting);
app.use(mcp);
app.use(workflow);

export default app;
