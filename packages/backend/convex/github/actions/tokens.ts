"use node";

import { getToken } from "@vercel/connect";
import { createHash, randomUUID } from "node:crypto";
import { ConvexError } from "convex/values";
import { env, type ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { seal, unseal } from "../../connections/actions/credentials";

export async function githubToken(
  ctx: ActionCtx,
  installationId: string,
  permissions: string[],
  repository?: string,
) {
  const token = await vercelIdentity(ctx);
  return getToken(
    env.GITHUB_CONNECTOR!,
    {
      subject: { type: "app" },
      installationId,
      authorizationDetails: [
        {
          type: "github_app_installation",
          permissions,
          ...(repository ? { repositories: [repository] } : {}),
        },
      ],
    },
    { vercelToken: token },
  );
}
export async function vercelIdentity(ctx: ActionCtx): Promise<string> {
  if (
    !env.VERCEL_TOKEN ||
    !env.VERCEL_PROJECT_ID ||
    !env.VERCEL_TEAM_ID ||
    !env.GITHUB_CONNECTOR
  )
    throw new Error("GitHub App connection is not configured.");
  const key = createHash("sha256")
    .update(
      JSON.stringify([
        env.VERCEL_PROJECT_ID,
        env.VERCEL_TEAM_ID,
        env.VERCEL_TOKEN,
        env.CONNECTIONS_ENCRYPTION_KEY,
      ]),
    )
    .digest("hex");
  const lease = randomUUID();
  const cached = await ctx.runMutation(internal.github.identityCache.acquire, {
    key,
    lease,
  });
  if (cached.token) return unseal(cached.token, `vercel-identity:${key}`);
  if (!cached.acquired)
    throw new ConvexError({
      code: "UPSTREAM_RETRY",
      retryAfter: cached.retryAfter,
    });
  let refreshAfter = Date.now() + 5_000;
  try {
    const response = await fetch(
      `https://api.vercel.com/v1/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}/token?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}`,
      {
        method: "POST",
        redirect: "error",
        headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
        signal: AbortSignal.timeout(30_000),
      },
    );
    if (!response.ok) {
      if (response.status === 429 || response.status >= 500) {
        const retry = Number(response.headers.get("retry-after"));
        const reset = Number(response.headers.get("x-ratelimit-reset"));
        const delay = Math.max(
          5,
          Number.isFinite(retry) ? retry : 0,
          Number.isFinite(reset) ? reset - Date.now() / 1000 : 0,
        );
        refreshAfter = Date.now() + Math.min(delay, 3600) * 1000;
        throw new ConvexError({
          code: "UPSTREAM_RETRY",
          retryAfter: Math.ceil((refreshAfter - Date.now()) / 1000),
        });
      }
      throw new Error(`GitHub connection failed (${response.status}).`);
    }
    const { token } = (await response.json()) as { token: string };
    const payload = token.split(".").at(1);
    const expiresAt = payload
      ? Number(JSON.parse(Buffer.from(payload, "base64url").toString()).exp) *
        1000
      : 0;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now() + 60_000)
      throw new Error("Vercel returned an expired identity.");
    await ctx.runMutation(internal.github.identityCache.finish, {
      key,
      lease,
      token: seal(token, `vercel-identity:${key}`),
      expiresAt,
      refreshAfter: 0,
    });
    return token;
  } catch (error) {
    await ctx.runMutation(internal.github.identityCache.finish, {
      key,
      lease,
      expiresAt: 0,
      refreshAfter,
    });
    throw error;
  }
}
export class GitHubError extends Error {
  constructor(readonly status: number) {
    super(`GitHub request failed (${status}).`);
  }
}
export async function githubRequest<T>(
  token: string,
  path: string,
  body?: unknown,
  method = body === undefined ? "GET" : "POST",
): Promise<T> {
  const response = await fetch(`https://api.github.com${path}`, {
    method,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new GitHubError(response.status);
  return (
    response.status === 204 || response.headers.get("content-length") === "0"
      ? undefined
      : await response.json()
  ) as T;
}
