"use node";

import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { ConvexError, v } from "convex/values";
import { internal } from "../../_generated/api";
import { account } from "../validator";
import { seal } from "./credentials";

export async function validateExpo(token: string) {
  if (!token || token.length > 4096 || /\s/.test(token))
    throw new ConvexError("Enter a valid Expo access token.");
  const response = await fetch("https://api.expo.dev/graphql", {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query:
        "query { meActor { id accounts { id name viewerUserPermission2 { effectivePermissions } } } }",
    }),
  });
  const result = (await response.json()) as {
    errors?: unknown[];
    data?: {
      meActor?: {
        id: string;
        accounts: {
          id: string;
          name: string;
          viewerUserPermission2: { effectivePermissions: string[] };
        }[];
      };
    };
  };
  if (!response.ok || result.errors?.length || !result.data?.meActor)
    throw new ConvexError(
      "Expo could not verify this token. Check that it is active and try again.",
    );
  const accounts = result.data.meActor.accounts
    .filter((a) =>
      a.viewerUserPermission2.effectivePermissions.includes("PUBLISH"),
    )
    .map(({ id, name }) => ({ id, name }));
  if (!accounts.length)
    throw new ConvexError(
      "This Expo token needs permission to create projects and publish updates.",
    );
  return accounts;
}
export const expoAccounts = internalAction({
  args: { ...identityFields, token: v.string() },
  returns: v.array(account),
  handler: async (_ctx, { token }) => validateExpo(token.trim()),
});
export const connectExpo = internalAction({
  args: { ...identityFields, token: v.string(), accountId: v.string() },
  returns: v.null(),
  handler: async (ctx, { userId, token, accountId }) => {
    token = token.trim();
    const accounts = await validateExpo(token);
    const account = accounts.find((a) => a.id === accountId);
    if (!account)
      throw new ConvexError("Choose an Expo account available to this token.");
    await ctx.runMutation(internal.connections.internal.save, {
      userId,
      provider: "expo",
      accountId,
      name: account.name,
      token: seal(token, `${userId}:expo`),
    });
    return null;
  },
});
