"use node";

import { internalAction } from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { githubToken } from "../../github/actions/tokens";

export const token = internalAction({
  args: { userId: v.string(), appId: v.string() },
  returns: v.object({ token: v.string(), repository: v.string() }),
  handler: async (
    ctx,
    { userId, appId },
  ): Promise<{ token: string; repository: string }> => {
    const app = await ctx.runQuery(internal.apps.internal.githubApp, { appId });
    if (!app || app.userId !== userId)
      throw new ConvexError(
        "This app has no connected repository. Finish setup first.",
      );
    const repository = `${app.githubOwner}/${app.githubRepo}`;
    try {
      return {
        repository,
        token: await githubToken(
          ctx,
          app.installationId,
          [
            "contents:write",
            "workflows:write",
            "pull_requests:write",
            "actions:read",
          ],
          repository,
        ),
      };
    } catch {
      throw new ConvexError(
        "Repository access could not be authorized. Check this app's GitHub connection and permissions.",
      );
    }
  },
});
