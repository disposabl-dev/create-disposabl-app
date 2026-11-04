"use node";

import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { account, posthogRegion } from "../validator";
import {
  posthogCallback,
  posthogClientId,
  posthogScopes,
  connectionsUrl,
} from "../config";
import { seal, unseal } from "./credentials";

type Region = Infer<typeof posthogRegion>;
type Access = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  region: Region;
};
export const posthogHost = (region: Region) => `https://${region}.posthog.com`;

const reconnect = () =>
  new ConvexError(
    `Connect PostHog again at ${connectionsUrl(["analytics"])}. Choose organization access so Disposabl can create projects.`,
  );

async function exchange(
  region: Region,
  fields: Record<string, string>,
): Promise<Access> {
  const response = await fetch(`${posthogHost(region)}/oauth/token/`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: posthogClientId(), ...fields }),
  });
  if (!response.ok) throw reconnect();
  const result = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    scope?: string;
  };
  const refreshToken = result.refresh_token ?? fields.refresh_token;
  if (
    !result.access_token ||
    !refreshToken ||
    !Number.isFinite(result.expires_in) ||
    result.expires_in! <= 0 ||
    (result.scope !== undefined &&
      !posthogScopes.every((scope) => result.scope!.split(" ").includes(scope)))
  )
    throw reconnect();
  return {
    accessToken: result.access_token,
    refreshToken,
    expiresAt: Date.now() + result.expires_in! * 1000,
    region,
  };
}

export async function completePosthog(
  ctx: ActionCtx,
  userId: string,
  code: string,
  verifier: string,
  region: Region,
) {
  const access = await exchange(region, {
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    redirect_uri: posthogCallback(),
  });
  await ctx.runMutation(internal.connections.internal.save, {
    userId,
    provider: "posthog",
    accountId: "",
    name: "",
    token: seal(JSON.stringify(access), `${userId}:posthog`),
  });
  return { installations: [] };
}

export async function posthogAccess(
  ctx: ActionCtx,
  userId: string,
): Promise<{ accountId: string; name: string; token: string; access: Access }> {
  for (let attempt = 0; attempt < 15; attempt++) {
    const saved = await ctx.runQuery(internal.connections.internal.get, {
      userId,
      provider: "posthog",
    });
    if (!saved) throw reconnect();
    const access = JSON.parse(
      unseal(saved.token, `${userId}:posthog`),
    ) as Access;
    if (!["us", "eu"].includes(access.region)) throw reconnect();
    if (access.expiresAt > Date.now() + 60_000) return { ...saved, access };
    const acquired = await ctx.runMutation(
      internal.connections.posthog.refresh,
      { userId, previous: saved.token },
    );
    if (!acquired) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      continue;
    }
    try {
      const next = await exchange(access.region, {
        grant_type: "refresh_token",
        refresh_token: access.refreshToken,
      });
      const token = seal(JSON.stringify(next), `${userId}:posthog`);
      const stored = await ctx.runMutation(
        internal.connections.posthog.refresh,
        { userId, previous: saved.token, next: token },
      );
      if (!stored) throw reconnect();
      return { ...saved, token, access: next };
    } catch (error) {
      await ctx.runMutation(internal.connections.posthog.refresh, {
        userId,
        previous: saved.token,
        next: saved.token,
      });
      throw error;
    }
  }
  throw new ConvexError(
    "PostHog access is refreshing. Retry setup in a moment.",
  );
}

export async function posthogRequest<T>(
  access: Access,
  path: string,
  body?: unknown,
): Promise<T> {
  const url = new URL(path, posthogHost(access.region));
  if (
    url.origin !== posthogHost(access.region) ||
    !url.pathname.startsWith("/api/")
  )
    throw new Error("Invalid PostHog API URL.");
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${access.accessToken}`,
      "Content-Type": "application/json",
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 || response.status === 403) throw reconnect();
  if (!response.ok)
    throw new ConvexError(
      `PostHog could not complete setup (${response.status}). Check your organization's project limit and retry.`,
    );
  return (await response.json()) as T;
}

async function organizations(access: Access): Promise<Infer<typeof account>[]> {
  const accounts: Infer<typeof account>[] = [];
  let next: string | null = "/api/organizations/?limit=100";
  for (let page = 0; next && page < 20; page++) {
    const result: { results: Infer<typeof account>[]; next?: string | null } =
      await posthogRequest(access, next);
    for (const item of result.results) {
      if (typeof item.id === "string" && typeof item.name === "string")
        accounts.push({ id: item.id, name: item.name });
    }
    next = result.next ?? null;
  }
  if (next)
    throw new ConvexError(
      "Too many PostHog organizations. Reconnect with access limited to the organization you want.",
    );
  return accounts;
}

export const posthogAccounts = internalAction({
  args: identityFields,
  returns: v.array(account),
  handler: async (ctx, { userId }): Promise<Infer<typeof account>[]> =>
    organizations((await posthogAccess(ctx, userId)).access),
});

export const selectPosthog = internalAction({
  args: { ...identityFields, accountId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, accountId }): Promise<null> => {
    const { access, token } = await posthogAccess(ctx, userId);
    const chosen = (await organizations(access)).find(
      (item) => item.id === accountId,
    );
    if (!chosen)
      throw new ConvexError(
        "Choose an organization available to this PostHog connection.",
      );
    return ctx.runMutation(internal.connections.posthog.select, {
      userId,
      token,
      accountId,
      name: chosen.name,
    });
  },
});
