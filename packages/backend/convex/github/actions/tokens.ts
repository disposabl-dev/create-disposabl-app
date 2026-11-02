"use node";

import { getToken } from "@vercel/connect";
import { env } from "../../_generated/server";

export async function githubToken(
  installationId: string,
  permissions: string[],
  repository?: string,
) {
  const token = await vercelIdentity();
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
export async function vercelIdentity() {
  if (
    !env.VERCEL_TOKEN ||
    !env.VERCEL_PROJECT_ID ||
    !env.VERCEL_TEAM_ID ||
    !env.GITHUB_CONNECTOR
  )
    throw new Error("GitHub App connection is not configured.");
  const response = await fetch(
    `https://api.vercel.com/v1/projects/${encodeURIComponent(env.VERCEL_PROJECT_ID)}/token?teamId=${encodeURIComponent(env.VERCEL_TEAM_ID)}`,
    {
      method: "POST",
      redirect: "error",
      headers: { Authorization: `Bearer ${env.VERCEL_TOKEN}` },
      signal: AbortSignal.timeout(30_000),
    },
  );
  if (!response.ok)
    throw new Error(`GitHub connection failed (${response.status}).`);
  const { token } = (await response.json()) as { token: string };
  return token;
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
  if (!response.ok)
    throw new Error(`GitHub request failed (${response.status}).`);
  return (
    response.status === 204 || response.headers.get("content-length") === "0"
      ? undefined
      : await response.json()
  ) as T;
}
