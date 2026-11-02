"use node";

import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { githubRequest, githubToken } from "./tokens";

type Repository = {
  id: number;
  name: string;
  private: boolean;
  description: string | null;
  owner: { login: string };
};
export const run = internalAction({
  args: { ...identityFields, appId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { app, connection } = await ctx.runQuery(
      internal.apps.internal.githubSetup,
      args,
    );
    if (app.githubOwner && app.githubRepo) return null;
    const owner = connection?.owner;
    const installationId = connection?.installationId;
    if (!owner || !installationId || !/^[a-zA-Z0-9-]+$/.test(owner))
      throw new Error("Configure a verified GitHub installation.");
    const token = await githubToken(ctx, installationId, [
      "administration:write",
      "contents:read",
    ]);
    const name = `${app.name
      .toLowerCase()
      .replace(/[^a-z0-9_.-]/g, "-")
      .slice(0, 55)}-${app.appId}`;
    const description = `Disposabl app ${app.appId}`;
    const account = await githubRequest<{ type: string }>(
      token,
      `/users/${owner}`,
    );
    let repo: Repository;
    try {
      repo = await githubRequest<Repository>(
        token,
        account.type === "Organization"
          ? `/orgs/${owner}/repos`
          : "/user/repos",
        { name, description, private: true, auto_init: false },
      );
    } catch (error) {
      try {
        repo = await githubRequest<Repository>(
          token,
          `/repos/${owner}/${name}`,
        );
      } catch {
        throw error;
      }
    }
    if (
      !repo.private ||
      repo.owner.login.toLowerCase() !== owner.toLowerCase() ||
      repo.description !== description
    )
      throw new Error("Repository does not match this app.");
    await ctx.runMutation(internal.apps.internal.connectGithub, {
      ...args,
      githubOwner: repo.owner.login,
      githubRepo: repo.name,
    });
    return null;
  },
});
