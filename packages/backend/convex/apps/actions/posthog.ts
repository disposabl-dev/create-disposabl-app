"use node";

import { ConvexError } from "convex/values";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  posthogAccess,
  posthogRequest,
} from "../../connections/actions/posthog";

type Project = {
  id: number;
  name: string;
  api_token: string;
  organization: string;
};

/** Called under the app setup lease. Reuse projects after interrupted setup. */
export async function ensurePosthog(
  ctx: ActionCtx,
  userId: string,
  appId: string,
  features: readonly string[],
) {
  const app = await ctx.runQuery(internal.apps.internal.get, { userId, appId });
  if (!features.includes("analytics")) return;
  const { access, accountId } = await posthogAccess(ctx, userId);
  if (!accountId)
    throw new ConvexError(
      "Choose your PostHog organization in Connections before continuing.",
    );
  const saved = await ctx.runQuery(internal.apps.posthog.project, {
    userId,
    appId,
  });
  if (
    saved &&
    (saved.organizationId !== accountId || saved.region !== access.region)
  )
    throw new ConvexError(
      "Reconnect the PostHog organization that owns this app before continuing setup.",
    );
  const path = `/api/organizations/${encodeURIComponent(accountId)}/projects/`;
  const name = `${app.name} (${appId})`;
  const lookup = async () => {
    const result = await posthogRequest<{
      results: Project[];
      next?: string | null;
    }>(access, `${path}?search=${encodeURIComponent(appId)}&limit=100`);
    const matches = result.results.filter((project) => project.name === name);
    if (matches.length > 1 || result.next)
      throw new ConvexError(
        "Multiple PostHog projects may match this app. Reconcile them before retrying setup.",
      );
    return matches[0];
  };
  let project = saved
    ? await posthogRequest<Project>(access, `${path}${saved.projectId}/`)
    : await lookup();
  if (!project) {
    try {
      project = await posthogRequest<Project>(access, path, {
        name,
        tags: [`disposabl:${appId}`],
        autocapture_opt_out: true,
        session_recording_opt_in: false,
      });
    } catch (error) {
      project = await lookup();
      if (!project) throw error;
    }
  }
  if (
    !Number.isSafeInteger(project.id) ||
    project.id <= 0 ||
    project.organization !== accountId ||
    !project.api_token?.startsWith("phc_")
  )
    throw new ConvexError(
      "PostHog did not return a project token for the selected organization.",
    );
  await ctx.runMutation(internal.apps.posthog.save, {
    userId,
    appId,
    project: {
      projectId: project.id,
      organizationId: accountId,
      region: access.region,
      projectToken: project.api_token,
    },
  });
}
