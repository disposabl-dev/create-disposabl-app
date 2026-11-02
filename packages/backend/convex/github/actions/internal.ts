"use node";

import { internalAction } from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import type { ActionCtx } from "../../_generated/server";
import { platform, releaseDetails } from "../../schema";
import { githubRequest, githubToken } from "./tokens";
import { verifyGitHubToken } from "./oidc";

type WorkflowRun = {
  id: number;
  run_attempt: number;
  run_number: number;
  head_sha: string;
  head_branch: string;
  event: string;
  html_url: string;
  path: string;
  repository: { id: number };
  head_repository: { id: number };
};
async function authorize(
  ctx: ActionCtx,
  appId: string,
  token: string,
  sourceRunId?: number,
) {
  const claims = await verifyGitHubToken(token);
  const app = await ctx.runQuery(internal.apps.internal.githubApp, { appId });
  if (!app || String(app.github.repositoryId) !== claims.repository_id)
    throw new Error("Repository is not linked to this app.");
  const repository = `${app.github.owner}/${app.github.repo}`;
  const publisher =
    claims.event_name === "workflow_run" && claims.ref === "refs/heads/main";
  const workflowPath = publisher
    ? ".github/workflows/releases.yml"
    : ".github/workflows/pipeline.yml";
  const workflow = `${repository}/${workflowPath}@${claims.ref}`;
  if (
    claims.repository !== repository ||
    claims.workflow_ref !== workflow ||
    (claims.job_workflow_ref && claims.job_workflow_ref !== workflow)
  )
    throw new Error("Unexpected workflow.");
  const productionEvent =
    claims.event_name === "push" && claims.ref === "refs/heads/main";
  if (!publisher && claims.event_name !== "pull_request" && !productionEvent)
    throw new Error("Unexpected workflow event.");
  if (publisher !== (sourceRunId !== undefined))
    throw new Error("Unexpected source run.");
  // PR build code only receives read access. Write tokens go to main or its trusted artifact publisher.
  const installationToken = await githubToken(
    app.github.installationId,
    [
      publisher || productionEvent ? "contents:write" : "contents:read",
      "actions:read",
      "pull_requests:read",
    ],
    repository,
  );
  let workflowRun = await githubRequest<WorkflowRun>(
    installationToken,
    `/repos/${repository}/actions/runs/${claims.run_id}`,
  );
  if (
    workflowRun.id !== Number(claims.run_id) ||
    workflowRun.run_attempt !== Number(claims.run_attempt) ||
    workflowRun.repository.id !== app.github.repositoryId ||
    workflowRun.head_repository.id !== app.github.repositoryId ||
    workflowRun.event !== claims.event_name ||
    workflowRun.path.split("@")[0] !== workflowPath
  )
    throw new Error("Workflow run does not match Actions identity.");
  if (publisher) {
    if (!Number.isSafeInteger(sourceRunId) || sourceRunId! <= 0)
      throw new Error("Invalid source run.");
    workflowRun = await githubRequest<WorkflowRun>(
      installationToken,
      `/repos/${repository}/actions/runs/${sourceRunId}`,
    );
    if (
      workflowRun.repository.id !== app.github.repositoryId ||
      workflowRun.head_repository.id !== app.github.repositoryId ||
      !(
        workflowRun.event === "pull_request" ||
        (workflowRun.event === "push" && workflowRun.head_branch === "main")
      ) ||
      workflowRun.path.split("@")[0] !== ".github/workflows/pipeline.yml"
    )
      throw new Error("Unexpected artifact source.");
  }
  const production = workflowRun.event === "push";
  if (production && workflowRun.head_branch !== "main")
    throw new Error("Production requires main.");
  if (
    !production &&
    !publisher &&
    claims.head_ref &&
    claims.head_ref !== workflowRun.head_branch
  )
    throw new Error("Unexpected preview branch.");
  return {
    app,
    repository,
    installationToken,
    production,
    reference: production ? "main" : workflowRun.head_branch,
    run: {
      id: workflowRun.id,
      attempt: workflowRun.run_attempt,
      number: workflowRun.run_number,
      commitSha: workflowRun.head_sha,
      url: workflowRun.html_url,
    },
  };
}
export const token = internalAction({
  args: {
    appId: v.string(),
    token: v.string(),
    sourceRunId: v.optional(v.number()),
  },
  returns: v.object({ token: v.string() }),
  handler: async (ctx, args): Promise<{ token: string }> => ({
    token: (await authorize(ctx, args.appId, args.token, args.sourceRunId))
      .installationToken,
  }),
});
export const report = internalAction({
  args: {
    appId: v.string(),
    token: v.string(),
    sourceRunId: v.optional(v.number()),
    platform,
    ...releaseDetails,
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const verified = await authorize(
      ctx,
      args.appId,
      args.token,
      args.sourceRunId,
    );
    for (const field of [
      "url",
      "githubReleaseUrl",
      "artifactUrl",
      "updateUrl",
    ] as const) {
      if (!args[field]) continue;
      const url = new URL(args[field]);
      if (url.protocol !== "https:" || url.username || url.password)
        throw new Error("Release links must use HTTPS.");
      if (
        field === "githubReleaseUrl" ||
        (field === "artifactUrl" && url.hostname === "github.com")
      ) {
        if (
          url.hostname !== "github.com" ||
          !url.pathname.startsWith(`/${verified.repository}/releases/`)
        )
          throw new Error("Release belongs to another repository.");
      }
    }
    if (args.githubReleaseUrl) {
      const tag = new URL(args.githubReleaseUrl).pathname.split(
        "/releases/tag/",
      )[1];
      if (!tag) throw new Error("Expected a GitHub release link.");
      const release = await githubRequest<{
        html_url: string;
        draft: boolean;
        assets: { browser_download_url: string }[];
      }>(
        verified.installationToken,
        `/repos/${verified.repository}/releases/tags/${encodeURIComponent(decodeURIComponent(tag))}`,
      );
      if (
        release.draft ||
        release.html_url !== args.githubReleaseUrl ||
        (args.artifactUrl &&
          !release.assets.some(
            (asset) => asset.browser_download_url === args.artifactUrl,
          ))
      )
        throw new Error("Release or download is not published.");
    }
    const { token: _token, sourceRunId: _source, ...result } = args;
    await ctx.runMutation(internal.previews.internal.report, {
      ...result,
      repositoryId: verified.app.github.repositoryId,
      reference: verified.reference,
      production: verified.production,
      run: verified.run,
    });
    return null;
  },
});
