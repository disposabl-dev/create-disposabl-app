"use node";

import sodium from "libsodium-wrappers";
import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { credential, unseal } from "../../connections/actions/credentials";
import { ensureExpo } from "../../apps/actions/expo";
import { validateExpo } from "../../connections/actions/expo";
import {
  management,
  ensureProduction,
} from "../../previews/token/actions/management";
import { githubRequest, githubToken } from "./tokens";
import { generateAndroidSigning } from "./signing";

export const configure = internalAction({
  args: { ...identityFields, appId: v.string(), projectId: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const details = await ctx.runQuery(internal.apps.internal.get, {
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
    const names = new Set<string>();
    for (let page = 1; ; page++) {
      const existing = await githubRequest<{ secrets: { name: string }[] }>(
        token,
        `${path}?per_page=100&page=${page}`,
      );
      for (const secret of existing.secrets) names.add(secret.name);
      if (existing.secrets.length < 100) break;
    }
    const legacySigning = [
      "ANDROID_KEYSTORE_BASE64",
      "ANDROID_KEYSTORE_PASSWORD",
      "ANDROID_KEY_ALIAS",
      "ANDROID_KEY_PASSWORD",
    ];
    const legacyCount = legacySigning.filter((name) => names.has(name)).length;
    if (
      details.platforms.includes("android") &&
      !names.has("DISPOSABL_ANDROID_SIGNING") &&
      legacyCount > 0 &&
      legacyCount < legacySigning.length
    )
      throw new Error(
        "Android signing secrets are incomplete. Restore all four legacy ANDROID_* signing secrets before retrying setup. If this app has never shipped, remove the partial set to generate a new key.",
      );
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
    if (
      details.platforms.includes("android") &&
      !names.has("DISPOSABL_ANDROID_SIGNING") &&
      legacyCount === 0
    ) {
      await save(
        "DISPOSABL_ANDROID_SIGNING",
        JSON.stringify(await generateAndroidSigning()),
      );
    }
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
    if (
      expo &&
      details.platforms.some(
        (platform) => platform === "android" || platform === "ios",
      )
    ) {
      const token = unseal(expo.token, `${args.userId}:expo`);
      const accounts = await validateExpo(token);
      if (!accounts.some((account) => account.id === expo.accountId))
        throw new Error(
          "Reconnect your Expo account before setting up mobile builds.",
        );
      const linked = await ctx.runQuery(
        internal.apps.operations.internal.linked,
        {
          userId: args.userId,
          appId: args.appId,
        },
      );
      await ctx.runMutation(internal.apps.operations.internal.saveExpo, {
        userId: args.userId,
        appId: args.appId,
        accountId: expo.accountId,
      });
      const project = await ensureExpo(
        token,
        expo.accountId,
        expo.name,
        args.appId,
        linked.expoProjectId,
      );
      await ctx.runMutation(internal.apps.operations.internal.saveExpo, {
        userId: args.userId,
        appId: args.appId,
        projectId: project.id,
        accountId: expo.accountId,
      });
      await save("EXPO_PROJECT_ID", project.id);
      await save("EXPO_SLUG", project.slug);
      await save("EXPO_TOKEN", token);
      await save("EXPO_OWNER", expo.name);
    }
    return null;
  },
});
