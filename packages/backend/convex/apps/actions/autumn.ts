"use node";

import { ConvexError } from "convex/values";
import { env } from "../../_generated/server";

export type AutumnKeys = { sandbox: string; live: string };
type Endpoint =
  | "platform/organizations"
  | "platform/oauth_url"
  | "platform.get_stripe_connection";

async function request(endpoint: Endpoint, data: object) {
  const key = env.AUTUMN_PLATFORM_KEY?.trim();
  if (!key)
    throw new ConvexError(
      "Managed payments are unavailable. The platform needs Autumn Platform API access.",
    );
  try {
    const response = await fetch(`https://api.useautumn.com/v1/${endpoint}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
    if (response.status === 403)
      throw new ConvexError(
        "Autumn denied Platform API access. Contact Disposabl support.",
      );
    if (!response.ok) throw new Error();
    const value: unknown = await response.json();
    if (!value || typeof value !== "object" || Array.isArray(value))
      throw new Error();
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ConvexError) throw error;
    throw new ConvexError("Autumn payment setup did not complete. Try again.");
  }
}

export function organizationSlug(appId: string) {
  return `app-${appId.replaceAll("-", "")}`;
}

export async function createTenant(
  appId: string,
  ownerEmail: string,
): Promise<AutumnKeys> {
  const slug = organizationSlug(appId);
  const { test_secret_key: sandbox, live_secret_key: live } = await request(
    "platform/organizations",
    { user_email: ownerEmail, name: `Disposabl ${slug}`, slug, env: "both" },
  );
  if (
    typeof sandbox !== "string" ||
    !/^am_sk_test_\S+$/.test(sandbox) ||
    typeof live !== "string" ||
    !/^am_sk_live_\S+$/.test(live)
  )
    throw new ConvexError(
      "Autumn did not return valid app billing keys. Try again.",
    );
  return { sandbox, live };
}

export async function stripeUrl(appId: string, redirect: string) {
  const { oauth_url } = await request("platform/oauth_url", {
    organization_slug: organizationSlug(appId),
    redirect_url: redirect,
    env: "live",
  });
  const url = typeof oauth_url === "string" ? URL.parse(oauth_url) : null;
  if (
    !url ||
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    ![
      "connect.stripe.com",
      "dashboard.stripe.com",
      "app.useautumn.com",
      "api.useautumn.com",
    ].includes(url.hostname)
  )
    throw new ConvexError(
      "Autumn did not return a valid Stripe connection link.",
    );
  return url.href;
}

export async function requireLiveStripe(appId: string) {
  const { connected, account_id } = await request(
    "platform.get_stripe_connection",
    {
      organization_slug: organizationSlug(appId),
      env: "live",
    },
  );
  if (
    connected !== true ||
    typeof account_id !== "string" ||
    !account_id.startsWith("acct_")
  )
    throw new ConvexError("Connect live Stripe before enabling payments.");
}
