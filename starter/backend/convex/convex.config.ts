import { v } from "convex/values";
import email from "@convex-dev/auth/components/email/convex.config.js";
import resend from "@convex-dev/resend/convex.config.js";
import passwordProvider from "@convex-dev/auth/components/password/convex.config.js";
import username from "@convex-dev/auth/components/username/convex.config.js";
import auth from "@convex-dev/auth/convex.config.js";
import google from "@convex-dev/auth/components/google/convex.config.js";
import mcp from "@convex-dev/mcp/convex.config.js";
import staticHosting from "@convex-dev/static-hosting/convex.config";
import { defineApp } from "convex/server";

const app = defineApp({
  env: {
    R2_ACCOUNT_ID: v.optional(v.string()),
    R2_BUCKET_NAME: v.optional(v.string()),
    R2_ACCESS_KEY_ID: v.optional(v.string()),
    R2_SECRET_ACCESS_KEY: v.optional(v.string()),
    AUTUMN_SECRET_KEY: v.optional(v.string()),
    BILLING_RETURN_URL: v.optional(v.string()),
    MOBILE_WEB_CHECKOUT_ENABLED: v.optional(v.string()),
    REVENUECAT_SYNC_ENABLED: v.optional(v.string()),
    DISPOSABL_ENVIRONMENT: v.optional(v.string()),
    POSTHOG_ENABLED: v.optional(v.string()),
    POSTHOG_PROJECT_TOKEN: v.optional(v.string()),
    POSTHOG_HOST: v.optional(v.string()),
    AUTH_GOOGLE_ONLY: v.optional(v.string()),
    RESEND_API_KEY: v.optional(v.string()),
    RESEND_FROM_EMAIL: v.optional(v.string()),
    RESEND_WEBHOOK_SECRET: v.optional(v.string()),
    AUTH_EMAIL_ORIGIN: v.optional(v.string()),
    AUTH_GOOGLE_CLIENT_ID: v.optional(v.string()),
    AUTH_GOOGLE_CLIENT_SECRET: v.optional(v.string()),
    AUTH_GOOGLE_RELAY_URL: v.optional(v.string()),
    AUTH_GOOGLE_RELAY_SECRET: v.optional(v.string()),
    AUTH_REDIRECT_ORIGINS: v.optional(v.string()),
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

app.use(email);
app.use(resend);
app.use(passwordProvider);
app.use(username);
app.use(staticHosting);
app.use(mcp);

export default app;
