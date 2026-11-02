"use node";

import { getToken } from "@vercel/connect";
import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v, type Infer } from "convex/values";
import { internal } from "../../_generated/api";
import { env } from "../../_generated/server";
import {
  githubRequest,
  githubToken,
  vercelIdentity,
} from "../../github/actions/tokens";
import { installation } from "../validator";
import { seal, unseal } from "./credentials";

type Installation = Infer<typeof installation>;
type GitHubInstallation = {
  id: number;
  app_slug: string;
  suspended_at: string | null;
  account: { login: string; type: string };
  permissions: Record<string, string>;
};
const permissions = [
  "administration",
  "actions",
  "contents",
  "workflows",
  "secrets",
];

export async function userInstallations(userId: string) {
  const token = await getToken(
    env.GITHUB_CONNECTOR!,
    {
      subject: { type: "user", id: userId },
    },
    { vercelToken: await vercelIdentity(), forceRefresh: true },
  );
  const user = await githubRequest<{ login: string }>(token, "/user");
  const organizations = new Set<string>();
  for (let page = 1; ; page++) {
    const memberships = await githubRequest<
      Array<{ role: string; organization: { login: string } }>
    >(token, `/user/memberships/orgs?state=active&per_page=100&page=${page}`);
    for (const membership of memberships)
      if (membership.role === "admin")
        organizations.add(membership.organization.login.toLowerCase());
    if (memberships.length < 100) break;
  }
  const installations: Installation[] = [];
  for (let page = 1; ; page++) {
    const result = await githubRequest<{ installations: GitHubInstallation[] }>(
      token,
      `/user/installations?per_page=100&page=${page}`,
    );
    for (const item of result.installations) {
      if (item.app_slug !== env.GITHUB_APP_SLUG || item.suspended_at) continue;
      if (!permissions.every((p) => item.permissions[p] === "write")) continue;
      if (item.account.type === "Organization") {
        // Only an organization admin can authorize account-wide repository creation.
        if (!organizations.has(item.account.login.toLowerCase())) continue;
      } else if (item.account.login.toLowerCase() !== user.login.toLowerCase())
        continue;
      installations.push({
        installationId: String(item.id),
        owner: item.account.login.toLowerCase(),
      });
    }
    if (result.installations.length < 100) break;
  }
  return {
    installations,
    proof: seal(
      JSON.stringify({ installations, expiresAt: Date.now() + 10 * 60_000 }),
      `github-choice:${userId}`,
    ),
  };
}
export const selectGithub = internalAction({
  args: { ...identityFields, proof: v.string(), installationId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, proof, installationId }) => {
    let verified: { installations: Installation[]; expiresAt: number };
    try {
      verified = JSON.parse(unseal(proof, `github-choice:${userId}`));
    } catch {
      throw new ConvexError("Connect GitHub again to choose an account.");
    }
    const chosen = verified.installations.find(
      (i) => i.installationId === installationId,
    );
    if (!chosen || verified.expiresAt < Date.now())
      throw new ConvexError("Connect GitHub again to choose an account.");
    // Re-check membership and the granted permissions before saving the binding.
    const current = await userInstallations(userId);
    if (
      !current.installations.some(
        (i) => i.installationId === installationId && i.owner === chosen.owner,
      )
    )
      throw new ConvexError(
        "GitHub access changed. Install Disposabl with the requested permissions.",
      );
    await githubToken(
      installationId,
      permissions.map((p) => `${p}:write`),
    );
    const id = await ctx.runQuery(internal.users.internal.current, { userId });
    if (!id) throw new ConvexError("Sign in to connect GitHub.");
    await ctx.runMutation(internal.github.internal.connect, {
      userId: id.id,
      ...chosen,
    });
    return null;
  },
});
