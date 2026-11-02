"use node";

import sodium from "libsodium-wrappers";
import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { credential, unseal } from "../../connections/actions/credentials";
import { validateExpo } from "../../connections/actions/expo";
import {
  management,
  ensureProduction,
} from "../../previews/token/actions/management";
import { githubRequest, githubToken } from "./tokens";

export const configure = internalAction({
  args: { ...identityFields, appId: v.string(), projectId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runQuery(internal.apps.internal.get, {
      userId: args.userId,
      appId: args.appId,
    });
    const app = await ctx.runQuery(internal.apps.internal.githubApp, {
      appId: args.appId,
    });
    if (!app)
      throw new Error(
        "Reconnect the GitHub account that owns this app before continuing setup.",
      );
    const repository = `${app.githubOwner}/${app.githubRepo}`;
    const token = await githubToken(
      app.installationId,
      ["secrets:write"],
      repository,
    );
    const path = `/repos/${repository}/actions/secrets`;
    const existing = await githubRequest<{ secrets: { name: string }[] }>(
      token,
      `${path}?per_page=100`,
    );
    const names = new Set(existing.secrets.map((secret) => secret.name));
    const publicKey = await githubRequest<{ key_id: string; key: string }>(
      token,
      `${path}/public-key`,
    );
    await sodium.ready;
    const save = async (name: string, value: string) => {
      const encrypted = sodium.crypto_box_seal(
        value,
        sodium.from_base64(publicKey.key, sodium.base64_variants.ORIGINAL),
      );
      await githubRequest(
        token,
        `${path}/${name}`,
        {
          key_id: publicKey.key_id,
          encrypted_value: sodium.to_base64(
            encrypted,
            sodium.base64_variants.ORIGINAL,
          ),
        },
        "PUT",
      );
    };
    const { token: managementToken } = await credential(
      ctx,
      args.userId,
      "convex",
    );
    if (!names.has("CONVEX_DEPLOY_KEY")) {
      const deployment = await ensureProduction(
        managementToken,
        args.projectId,
      );
      const { deployKey } = await management<{ deployKey: string }>(
        managementToken,
        `/deployments/${deployment}/create_deploy_key`,
        { name: "github-actions-production" },
      );
      if (!deployKey.startsWith(`prod:${deployment}|`))
        throw new Error("Expected a production deploy key.");
      await save("CONVEX_DEPLOY_KEY", deployKey);
    }
    if (!names.has("CONVEX_DEPLOY_KEY_PREVIEW")) {
      const { previewDeployKey } = await management<{
        previewDeployKey: string;
      }>(
        managementToken,
        `/projects/${args.projectId}/create_preview_deploy_key`,
        { name: "github-actions-preview" },
      );
      if (!previewDeployKey.startsWith("preview:"))
        throw new Error("Expected a preview deploy key.");
      await save("CONVEX_DEPLOY_KEY_PREVIEW", previewDeployKey);
    }
    const expo = await ctx.runQuery(internal.connections.internal.get, {
      userId: args.userId,
      provider: "expo",
    });
    if (expo) {
      const token = unseal(expo.token, `${args.userId}:expo`);
      const accounts = await validateExpo(token);
      if (!accounts.some((account) => account.id === expo.accountId))
        throw new Error(
          "Reconnect your Expo account before setting up mobile builds.",
        );
      await save("EXPO_TOKEN", token);
      await save("EXPO_OWNER", expo.name);
    }
    return null;
  },
});
