"use node";

import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { credential } from "../../connections/actions/credentials";
import { validateExpo } from "../../connections/actions/expo";
import {
  GitHubError,
  githubRequest,
  githubToken,
} from "../../github/actions/tokens";
import {
  ManagementError,
  management,
} from "../../previews/token/actions/management";
import { deleteArgs } from "../validator";
import { ExpoLoginRequired, deleteExpo, findExpo, verifyExpo } from "./expo";

export const remove = internalAction({
  args: { ...identityFields, ...deleteArgs },
  returns: v.null(),
  handler: async (ctx, { userId, appId }): Promise<null> => {
    const identity = { userId, appId };
    const { until, resuming, pending } = await ctx.runMutation(
      internal.apps.operations.internal.begin,
      { ...identity, kind: "delete" },
    );
    let started = false;
    const resume = (
      provider: "github" | "convex" | "expo",
      accountId: string,
    ) => {
      if (pending?.provider !== provider) return undefined;
      if (pending.accountId !== accountId)
        throw new ConvexError(
          `Reconnect the original ${provider} account to finish deleting this app.`,
        );
      return pending;
    };
    const deleting = (
      provider: "github" | "convex" | "expo",
      accountId: string,
      receipt?: string,
    ) =>
      ctx.runMutation(internal.apps.operations.internal.deletingResource, {
        ...identity,
        until,
        pending: { provider, accountId, ...(receipt ? { receipt } : {}) },
      });
    const forget = (provider: "github" | "convex" | "expo") =>
      ctx.runMutation(internal.apps.operations.internal.forget, {
        ...identity,
        until,
        provider,
      });
    try {
      const linked = await ctx.runQuery(
        internal.apps.operations.internal.linked,
        identity,
      );
      // Preflight every provider before deleting anything. Missing access is never success.
      let github:
        | { token: string; path: string; accountId: string; absent: boolean }
        | undefined;
      if (linked.githubRepo) {
        const app = await ctx.runQuery(internal.apps.internal.githubApp, {
          appId,
        });
        if (!app)
          throw new ConvexError(
            "Reconnect the GitHub account that owns this app before deleting it.",
          );
        const repository = `${app.githubOwner}/${app.githubRepo}`;
        const retry = resume("github", app.githubOwner);
        // An installation-wide token remains usable after this repository is deleted.
        const token = await githubToken(
          ctx,
          app.installationId,
          ["administration:write", "contents:read", "actions:read"],
          retry ? undefined : repository,
        );
        const path = `/repos/${repository}`;
        let absent = false;
        try {
          const repo = await githubRequest<{
            full_name: string;
            description: string;
          }>(token, path);
          if (
            repo.full_name.toLowerCase() !== repository.toLowerCase() ||
            repo.description !== `Disposabl app ${appId}`
          )
            throw new ConvexError(
              "The GitHub repository does not match this app. No resources were deleted.",
            );
        } catch (error) {
          if (!retry || !(error instanceof GitHubError) || error.status !== 404)
            throw error;
          await githubRequest(token, "/installation/repositories?per_page=1");
          absent = true;
        }
        if (!absent) {
          for (let page = 1; ; page++) {
            const releases = await githubRequest<
              { draft: boolean; prerelease: boolean }[]
            >(token, `${path}/releases?per_page=100&page=${page}`);
            if (
              releases.some((release) => !release.draft && !release.prerelease)
            )
              throw new ConvexError(
                "Apps with production releases cannot be deleted.",
              );
            if (releases.length < 100) break;
          }
          for (const status of [
            "queued",
            "in_progress",
            "waiting",
            "pending",
            "requested",
          ]) {
            const runs = await githubRequest<{ total_count: number }>(
              token,
              `${path}/actions/runs?status=${status}&per_page=1`,
            );
            if (runs.total_count)
              throw new ConvexError(
                "Wait for this app's GitHub Actions to finish before deleting it.",
              );
          }
        }
        github = { token, path, accountId: app.githubOwner, absent };
      }
      let convex:
        | {
            token: string;
            projectId: number;
            accountId: string;
            absent: boolean;
          }
        | undefined;
      if (linked.convexProjectId !== undefined) {
        const connection = await credential(ctx, userId, "convex");
        const retry = resume("convex", connection.accountId);
        let absent = false;
        try {
          const project = await management<{
            id: number;
            name: string;
            teamId: number;
          }>(connection.token, `/projects/${linked.convexProjectId}`);
          if (
            project.id !== linked.convexProjectId ||
            String(project.teamId) !== connection.accountId ||
            project.name !== `disposabl-${appId}`
          )
            throw new ConvexError(
              "The Convex project does not match this app and connected team.",
            );
        } catch (error) {
          if (
            !retry ||
            !(error instanceof ManagementError) ||
            error.status !== 404
          )
            throw error;
          await management(
            connection.token,
            `/teams/${connection.accountId}/projects?limit=1`,
          );
          absent = true;
        }
        convex = {
          token: connection.token,
          projectId: linked.convexProjectId,
          accountId: connection.accountId,
          absent,
        };
      }
      if (linked.expoAccountId === undefined && linked.githubRepo) {
        const app = await ctx.runQuery(internal.apps.internal.get, identity);
        if (
          app.platforms.some(
            (platform) => platform === "android" || platform === "ios",
          )
        )
          throw new ConvexError(
            "This older app has no recorded Expo ownership. Link its original Expo project before deleting it.",
          );
      }
      let expo:
        | {
            token: string;
            projectId?: string;
            accountId: string;
            receipt?: string;
          }
        | undefined;
      if (linked.expoAccountId || linked.expoProjectId) {
        const connection = await credential(ctx, userId, "expo");
        const retry = resume("expo", connection.accountId);
        if (
          linked.expoAccountId !== connection.accountId ||
          !(await validateExpo(connection.token)).some(
            (account) => account.id === connection.accountId,
          )
        )
          throw new ConvexError(
            "Reconnect the Expo account that owns this app.",
          );
        const project = await findExpo(
          connection.token,
          `@${connection.name}/app-${appId}`,
          linked.expoProjectId,
        );
        if (project) verifyExpo(project, connection.accountId, appId);
        if (!project && linked.expoProjectId && !retry)
          throw new ConvexError(
            "The linked Expo project is unavailable. Reconnect its owner before deleting this app.",
          );
        expo = {
          token: connection.token,
          projectId: project?.id,
          accountId: connection.accountId,
          receipt: retry?.receipt,
        };
      }
      started = true;
      if (expo) {
        // Resume the receipt even if Expo has already removed the project from lookup.
        if (expo.projectId || expo.receipt) {
          await deleting("expo", expo.accountId, expo.receipt);
          try {
            await deleteExpo(
              expo.token,
              expo.projectId ?? linked.expoProjectId!,
              expo.receipt,
              async (receipt) => {
                await deleting("expo", expo.accountId, receipt);
              },
            );
          } catch (error) {
            if (error instanceof ExpoLoginRequired)
              throw new ConvexError({
                code: "expo_delete_requires_login",
                projectId: expo.projectId ?? linked.expoProjectId!,
                message:
                  "Expo requires a signed-in user and password confirmation to delete projects. Complete Expo deletion, then retry this command.",
              });
            throw error;
          }
        }
        await forget("expo");
      }
      if (github) {
        await deleting("github", github.accountId);
        if (!github.absent)
          await githubRequest(github.token, github.path, undefined, "DELETE");
        await forget("github");
      }
      if (convex) {
        await deleting("convex", convex.accountId);
        if (!convex.absent)
          await management(
            convex.token,
            `/projects/${convex.projectId}/delete`,
            {},
          );
        await forget("convex");
      }
      while (
        !(await ctx.runMutation(internal.apps.operations.internal.erase, {
          ...identity,
          until,
        }))
      ) {
        /* Delete previews in bounded batches. */
      }
      return null;
    } catch (error) {
      await ctx.runMutation(internal.apps.operations.internal.finish, {
        ...identity,
        until,
        retryDelete: started || resuming,
      });
      if (error instanceof ConvexError) throw error;
      throw new ConvexError(
        "App deletion could not finish. Check your connected accounts, then retry apps delete with --dangerously-delete-app. The app record has been kept.",
      );
    }
  },
});
