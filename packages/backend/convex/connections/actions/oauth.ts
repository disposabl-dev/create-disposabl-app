"use node";

import { createHash, randomBytes } from "node:crypto";
import { startAuthorization } from "@vercel/connect";
import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../../_generated/api";
import { env } from "../../_generated/server";
import { management } from "../../previews/token/actions/management";
import { vercelIdentity } from "../../github/actions/tokens";
import { completion, oauthProvider, posthogRegion } from "../validator";
import { completePosthog, posthogHost } from "./posthog";
import { posthogCallback, posthogClientId, posthogScopes } from "../config";
import { connectionsUrl, seal } from "./credentials";
import { userInstallations } from "./github";

const hash = (value: string) =>
  createHash("sha256").update(value).digest("base64url");
export const start = internalAction({
  args: {
    ...identityFields,
    provider: oauthProvider,
    mobile: v.optional(v.boolean()),
    install: v.optional(v.boolean()),
    region: v.optional(posthogRegion),
  },
  returns: v.string(),
  handler: async (
    ctx,
    { userId, provider, install, region = "us", mobile = false },
  ): Promise<string> => {
    const status = await ctx.runQuery(internal.connections.internal.status, {
      userId,
    });
    if (!status.available[provider])
      throw new ConvexError(
        `${provider === "github" ? "GitHub" : provider === "posthog" ? "PostHog" : "Convex"} connections are not configured yet.`,
      );
    const state = `${mobile ? "mobile_" : ""}${randomBytes(32).toString("base64url")}`;
    const verifier = randomBytes(32).toString("base64url");
    await ctx.runMutation(internal.connections.internal.begin, {
      userId,
      provider,
      hash: hash(state),
      verifier: provider === "github" && install ? "installation" : verifier,
      ...(provider === "posthog" ? { region } : {}),
    });
    if (provider === "github" && install) {
      const url = new URL(status.githubInstallUrl!);
      url.searchParams.set("state", state);
      return url.href;
    }
    const callback = `${connectionsUrl()}?provider=${provider}`;
    if (provider === "posthog") {
      const url = new URL("/oauth/authorize/", posthogHost(region));
      url.search = new URLSearchParams({
        client_id: posthogClientId(),
        redirect_uri: posthogCallback(),
        response_type: "code",
        state,
        code_challenge: hash(verifier),
        code_challenge_method: "S256",
        scope: posthogScopes.join(" "),
      }).toString();
      return url.href;
    }
    if (provider === "github") {
      const result = await startAuthorization(
        env.GITHUB_CONNECTOR!,
        { subject: { type: "user", id: userId } },
        {
          vercelToken: await vercelIdentity(ctx),
          callbackUrl: `${callback}&code=connected&state=${state}`,
          expiresInMs: 10 * 60_000,
        },
      );
      return result.url;
    }
    const url = new URL("https://dashboard.convex.dev/oauth/authorize/team");
    url.search = new URLSearchParams({
      client_id: env.CONVEX_OAUTH_CLIENT_ID!,
      redirect_uri: callback,
      response_type: "code",
      state,
      code_challenge: hash(verifier),
      code_challenge_method: "S256",
    }).toString();
    return url.href;
  },
});
export const complete = internalAction({
  args: {
    ...identityFields,
    provider: oauthProvider,
    code: v.string(),
    state: v.string(),
  },
  returns: completion,
  handler: async (
    ctx,
    { userId, provider, code, state },
  ): Promise<Infer<typeof completion>> => {
    if (!code || code.length > 4096 || state.length > 128)
      throw new ConvexError("Invalid connection callback.");
    const { verifier, region } = await ctx.runMutation(
      internal.connections.internal.consume,
      { userId, provider, hash: hash(state) },
    );
    if (verifier === "installation")
      throw new ConvexError(
        "Complete GitHub authorization after installing Disposabl.",
      );
    if (provider === "github") return userInstallations(ctx, userId);
    if (provider === "posthog") {
      if (!region)
        throw new ConvexError("PostHog connection expired. Connect again.");
      return completePosthog(ctx, userId, code, verifier, region);
    }
    const response = await fetch("https://api.convex.dev/oauth/token", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.CONVEX_OAUTH_CLIENT_ID!,
        client_secret: env.CONVEX_OAUTH_CLIENT_SECRET!,
        grant_type: "authorization_code",
        redirect_uri: `${connectionsUrl()}?provider=convex`,
        code,
        code_verifier: verifier,
      }),
    });
    if (!response.ok)
      throw new ConvexError(
        "Convex could not confirm this connection. Please try again.",
      );
    const result = (await response.json()) as { access_token?: string };
    if (!result.access_token)
      throw new ConvexError(
        "Convex did not return access. Please connect again.",
      );
    const details = await management<{ type: string; teamId?: number }>(
      result.access_token,
      "/token_details",
    );
    if (
      details.type !== "teamToken" ||
      !Number.isSafeInteger(details.teamId) ||
      details.teamId! < 1
    )
      throw new ConvexError(
        "Authorize a Convex team so Disposabl can create your project's backend.",
      );
    const slug = /^team:([a-z0-9-]+)\|/.exec(result.access_token)?.[1];
    await ctx.runMutation(internal.connections.internal.save, {
      userId,
      provider: "convex",
      accountId: String(details.teamId),
      name: slug || `Team ${details.teamId}`,
      token: seal(result.access_token, `${userId}:convex`),
    });
    return { installations: [] };
  },
});

export const resumeGithubInstall = internalAction({
  args: { ...identityFields, state: v.string() },
  returns: v.string(),
  handler: async (ctx, { userId, state }): Promise<string> => {
    if (!state || state.length > 128)
      throw new ConvexError("Invalid GitHub installation callback.");
    const step = await ctx.runMutation(internal.connections.internal.consume, {
      userId,
      provider: "github",
      hash: hash(state),
    });
    if (step.verifier !== "installation")
      throw new ConvexError("Restart GitHub setup to continue.");
    // Installation and user authorization form one setup step. The OAuth callback
    // still verifies account ownership before binding any installation.
    return ctx.runAction(internal.connections.actions.oauth.start, {
      userId,
      provider: "github",
      mobile: state.startsWith("mobile_"),
    });
  },
});
