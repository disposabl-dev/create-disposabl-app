"use node";

import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import { randomUUID } from "node:crypto";
import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import {
  GitHubError,
  githubRequest,
  githubToken,
} from "../../github/actions/tokens";

const workflow = "store-review.yml";
const event = "disposabl-store-review";
const storePlatform = v.union(v.literal("ios"), v.literal("android"));

async function repositoryAccess(
  ctx: ActionCtx,
  { userId, appId }: { userId: string; appId: string },
  permissions: string[],
): Promise<{ repository: string; token: string }> {
  const app = await ctx.runQuery(internal.apps.internal.githubApp, { appId });
  if (app?.userId !== userId)
    throw new ConvexError("This app has no connected repository.");
  const repository = `${app.githubOwner}/${app.githubRepo}`;
  const token = await githubToken(
    ctx,
    app.installationId,
    permissions,
    repository,
  );
  return { repository, token };
}

export const request = internalAction({
  args: {
    ...identityFields,
    appId: v.string(),
    commit: v.string(),
    platforms: v.array(storePlatform),
  },
  returns: v.object({
    requestId: v.string(),
    commit: v.string(),
    url: v.string(),
  }),
  handler: async (
    ctx,
    { userId, appId, commit, platforms },
  ): Promise<{ requestId: string; commit: string; url: string }> => {
    if (!/^[a-f0-9]{40}$/.test(commit))
      throw new ConvexError(
        "Use the full commit SHA for the published release.",
      );
    if (!platforms.length || new Set(platforms).size !== platforms.length)
      throw new ConvexError("Choose iOS, Android, or both.");
    const release = await ctx.runQuery(internal.releases.internal.get, {
      userId,
      appId,
    });
    for (const platform of platforms) {
      const target = release?.platforms[platform];
      if (!target?.enabled || target.latest?.status !== "ready")
        throw new ConvexError(
          `Publish a production ${platform} build before requesting store review.`,
        );
    }
    const { token, repository } = await repositoryAccess(
      ctx,
      { userId, appId },
      ["contents:write", "actions:read"],
    );
    const prefix = `/repos/${repository}`;
    const { object } = await githubRequest<{ object: { sha: string } }>(
      token,
      `${prefix}/git/ref/heads/main`,
    );
    if (object.sha !== commit)
      throw new ConvexError(
        "The requested commit must be current on the repository's main branch.",
      );
    try {
      await githubRequest(token, `${prefix}/actions/workflows/${workflow}`);
      await githubRequest(
        token,
        `${prefix}/contents/.disposabl/store/release.json?ref=${commit}`,
      );
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404)
        throw new ConvexError(
          "Add the store review workflow and release metadata to main first.",
        );
      throw error;
    }
    const requestId = randomUUID();
    await githubRequest(token, `${prefix}/dispatches`, {
      event_type: event,
      client_payload: { requestId, commit, platforms },
    });
    return {
      requestId,
      commit,
      url: `https://github.com/${repository}/actions/workflows/${workflow}`,
    };
  },
});

export const status = internalAction({
  args: { ...identityFields, appId: v.string(), requestId: v.string() },
  returns: v.union(
    v.null(),
    v.object({
      status: v.string(),
      conclusion: v.union(v.null(), v.string()),
      url: v.string(),
    }),
  ),
  handler: async (
    ctx,
    { userId, appId, requestId },
  ): Promise<{
    status: string;
    conclusion: string | null;
    url: string;
  } | null> => {
    if (!/^[a-f0-9-]{36}$/.test(requestId))
      throw new ConvexError(
        "Use the request ID returned by the review command.",
      );
    const { token, repository } = await repositoryAccess(
      ctx,
      { userId, appId },
      ["actions:read"],
    );
    const { workflow_runs } = await githubRequest<{
      workflow_runs: {
        display_title: string;
        status: string;
        conclusion: string | null;
        html_url: string;
      }[];
    }>(
      token,
      `/repos/${repository}/actions/workflows/${workflow}/runs?event=repository_dispatch&per_page=100`,
    );
    const run = workflow_runs.find(
      ({ display_title }) => display_title === `Store review ${requestId}`,
    );
    return run
      ? { status: run.status, conclusion: run.conclusion, url: run.html_url }
      : null;
  },
});
