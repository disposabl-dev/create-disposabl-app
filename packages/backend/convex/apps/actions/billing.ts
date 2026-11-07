"use node";

import { ConvexError } from "convex/values";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { unseal } from "../../connections/actions/credentials";
import {
  validateAutumnKey,
  type AutumnKeys,
} from "../../connections/actions/autumn";
import { management } from "../../previews/token/actions/management";

type Target = {
  name: string;
  convexUrl: string;
  deployKey?: string;
  kind: "dev" | "prod";
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
                  value: `https://${target.name}.convex.site/pricing`,
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
  userId: string,
  features: readonly string[],
  managementToken: string,
  development: Target,
  production: { name: string; deploymentUrl: string },
) {
  if (!features.includes("payments")) return;
  const connection = await ctx.runQuery(internal.connections.internal.get, {
    userId,
    provider: "autumn",
  });
  if (!connection)
    throw new ConvexError("Connect Autumn before enabling payments.");
  const keys = JSON.parse(
    unseal(connection.token, `${userId}:autumn`),
  ) as AutumnKeys;
  await validateAutumnKey(keys.sandbox, "test");
  if (keys.live) await validateAutumnKey(keys.live, "live");
  await configureBillingDeployment(development, keys.sandbox);
  if (keys.live) {
    const { deployKey } = await management<{ deployKey: string }>(
      managementToken,
      `/deployments/${encodeURIComponent(production.name)}/create_deploy_key`,
      { name: "disposabl-billing-setup" },
    );
    if (!deployKey.startsWith(`prod:${production.name}|`))
      throw new Error("Expected a production-scoped key.");
    await configureBillingDeployment(
      {
        name: production.name,
        convexUrl: production.deploymentUrl,
        deployKey,
        kind: "prod",
      },
      keys.live,
    );
  }
}
