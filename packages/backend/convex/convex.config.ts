import passwordProvider from "@convex-dev/auth/components/password/convex.config.js";
import username from "@convex-dev/auth/components/username/convex.config.js";
import auth from "@convex-dev/auth/convex.config.js";
import google from "@convex-dev/auth/components/google/convex.config.js";
import mcp from "@convex-dev/mcp/convex.config.js";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import workflow from "@convex-dev/workflow/convex.config";
import agent from "@convex-dev/agent/convex.config";
import boat from "@boatdev/convex/convex.config.js";
import { defineApp } from "convex/server";
import { v } from "convex/values";

const app = defineApp({
  env: {
    AUTH_GOOGLE_CLIENT_ID: v.optional(v.string()),
    AUTH_GOOGLE_CLIENT_SECRET: v.optional(v.string()),
    AUTH_GOOGLE_RELAY_URL: v.optional(v.string()),
    AUTH_GOOGLE_RELAY_SECRET: v.optional(v.string()),
    AUTH_REDIRECT_ORIGINS: v.optional(v.string()),
    CONVEX_OAUTH_CLIENT_ID: v.optional(v.string()),
    CONVEX_OAUTH_CLIENT_SECRET: v.optional(v.string()),
    GITHUB_APP_SLUG: v.optional(v.string()),
    CONNECTIONS_ENCRYPTION_KEY: v.optional(v.string()),
    CONNECTIONS_ORIGIN: v.optional(v.string()),
    VERCEL_TOKEN: v.optional(v.string()),
    VERCEL_PROJECT_ID: v.optional(v.string()),
    VERCEL_TEAM_ID: v.optional(v.string()),
    GITHUB_CONNECTOR: v.optional(v.string()),
    BOAT_API_KEY: v.string(),
    BOAT_AGENT_ENVIRONMENT: v.optional(v.string()),
  },
});

app.use(auth);
app.use(google, {
  httpPrefix: "/oauth/google",
  env: {
    CLIENT_ID: app.env.AUTH_GOOGLE_CLIENT_ID,
    CLIENT_SECRET: app.env.AUTH_GOOGLE_CLIENT_SECRET,
    CALLBACK_URL: app.env.AUTH_GOOGLE_RELAY_URL,
  },
});

app.use(passwordProvider);
app.use(username);
app.use(staticHosting);
app.use(mcp);
app.use(workflow);
app.use(agent);
app.use(boat, { env: { BOAT_API_KEY: app.env.BOAT_API_KEY } });

export default app;
