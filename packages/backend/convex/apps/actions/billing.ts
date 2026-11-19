"use node";

import { ConvexError, v } from "convex/values";
import {
  identityFields,
  internalAction,
} from "@disposabl/disposabl-kit/server/lib/functions";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import {
  connectionsUrl,
  credential,
  seal,
  unseal,
} from "../../connections/actions/credentials";
import {
  management,
  productionDeployment,
} from "../../previews/token/actions/management";
import {
  createTenant,
  requireLiveStripe,
  stripeUrl,
  type AutumnKeys,
} from "./autumn";

type Target = {
  name: string;
  convexUrl: string;
  deployKey?: string;
  kind: "dev" | "prod";
  publicSiteUrl?: string;
};
export async function configureBillingDeployment(
  target: Target,
  secret: string,
  fetcher = fetch,
) {
  // Deployment coordinates come from verified Convex management responses, never clients.
  if (
    target.convexUrl !== `https://${target.name}.convex.cloud` ||
    !/^[a-z0-9-]+$/.test(target.name) ||
    !target.deployKey?.startsWith(`${target.kind}:${target.name}|`) ||
    !secret.startsWith(`am_sk_${target.kind === "dev" ? "test" : "live"}_`)
  )
    throw new Error("Invalid billing deployment target.");
  const headers = {
    Authorization: `Convex ${target.deployKey}`,
    "Content-Type": "application/json",
  };
  const existing = await fetcher(`${target.convexUrl}/api/query`, {
    method: "POST",
    redirect: "error",
    signal: AbortSignal.timeout(15000),
    headers,
    body: JSON.stringify({
      path: "_system/cli/queryEnvironmentVariables:get",
      args: { name: "BILLING_RETURN_URL" },
      format: "json",
    }),
  });
  if (!existing.ok)
    throw new Error("Could not read billing configuration. Retry setup.");
  const current = await existing.json();
  if (
    current.status !== "success" ||
    (current.value !== null && typeof current.value?.value !== "string")
  )
    throw new Error("Could not read billing configuration. Retry setup.");
  const response = await fetcher(
    `${target.convexUrl}/api/update_environment_variables`,
    {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15000),
      headers,
      body: JSON.stringify({
        changes: [
          { name: "AUTUMN_SECRET_KEY", value: secret },
          ...(current.value === null
            ? [
                {
                  name: "BILLING_RETURN_URL",
                  value: `${target.publicSiteUrl ?? `https://${target.name}.convex.site`}/pricing`,
                },
              ]
            : []),
        ],
      }),
    },
  );
  if (!response.ok)
    throw new Error(
      "Could not configure payments on the app backend. Retry setup.",
    );
}

/** Runs under setup's lease and before committing applied feature selections. */
export async function provisionPayments(
  ctx: ActionCtx,
  setup: { userId: string; appId: string; until: number },
  features: readonly string[],
  convex: {
    token: string;
    projectId: number;
    development: Target;
  },
) {
  if (!features.includes("payments")) return;
  const tenant = await ctx.runMutation(internal.apps.autumn.prepare, setup);
  const context = autumnContext(setup);
  const keys: AutumnKeys = tenant.encryptedKeys
    ? JSON.parse(unseal(tenant.encryptedKeys, context))
    : await createTenant(setup.appId, tenant.ownerEmail);
  if (!tenant.encryptedKeys)
    await ctx.runMutation(internal.apps.autumn.saveKeys, {
      ...setup,
      encryptedKeys: seal(JSON.stringify(keys), context),
    });
  await configureBillingDeployment(convex.development, keys.sandbox);
  // GitHub previews are separate from named development deployments.
  // Rerunning an existing pull request can reuse its preview.
  await management<void>(
    convex.token,
    `/projects/${convex.projectId}/update_default_environment_variables`,
    {
      changes: [
        {
          name: "AUTUMN_SECRET_KEY",
          deploymentType: "preview",
          value: keys.sandbox,
          applyToExistingDeployments: true,
        },
      ],
    },
  );
}

const identity = { ...identityFields, appId: v.string() };
function autumnContext({ userId, appId }: { userId: string; appId: string }) {
  return `${userId}:${appId}:autumn`;
}

export const beginStripe = internalAction({
  args: identity,
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    await ctx.runQuery(internal.apps.autumn.target, args);
    const redirect = new URL("/dashboard/billing", connectionsUrl());
    redirect.searchParams.set("appId", args.appId);
    return stripeUrl(args.appId, redirect.href);
  },
});

export const enableLivePayments = internalAction({
  args: identity,
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const { until } = await ctx.runMutation(
      internal.apps.operations.internal.begin,
      {
        ...args,
        kind: "setup",
      },
    );
    try {
      const { encryptedKeys, projectId, publicSiteUrl } = await ctx.runQuery(
        internal.apps.autumn.target,
        args,
      );
      await requireLiveStripe(args.appId);
      const { token } = await credential(ctx, args.userId, "convex");
      const production = await productionDeployment(token, projectId);
      const convexUrl = new URL(production.deploymentUrl).origin;
      const { live } = JSON.parse(
        unseal(encryptedKeys, autumnContext(args)),
      ) as AutumnKeys;
      const { deployKey } = await management<{ deployKey: string }>(
        token,
        `/deployments/${encodeURIComponent(production.name)}/create_deploy_key`,
        { name: "disposabl-billing-setup" },
      );
      if (!deployKey.startsWith(`prod:${production.name}|`))
        throw new Error("Expected a production-scoped key.");
      await configureBillingDeployment(
        {
          name: production.name,
          convexUrl,
          deployKey,
          kind: "prod",
          publicSiteUrl,
        },
        live,
      );
      const setup = await fetch(`${convexUrl}/api/function`, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(60_000),
        headers: {
          Authorization: `Convex ${deployKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: "billing:setup",
          format: "convex_encoded_json",
          args: { expectedEnvironment: "live" },
        }),
      });
      if (!setup.ok)
        throw new ConvexError(
          "Stripe is connected. Deploy this app to production and retry billing setup.",
        );
      const result = await setup.json();
      if (
        result.status !== "success" ||
        result.value?.enabled !== true ||
        result.value?.pending !== false
      )
        throw new ConvexError(
          "Stripe is connected, but the billing catalog is not ready. Retry billing setup.",
        );
      return null;
    } finally {
      await ctx.runMutation(internal.apps.operations.internal.finish, {
        ...args,
        until,
        retryDelete: false,
      });
    }
  },
});
