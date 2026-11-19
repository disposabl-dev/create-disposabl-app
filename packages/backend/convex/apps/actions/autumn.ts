"use node";

import { ConvexError } from "convex/values";

export type AutumnKeys = { sandbox: string; live: string };
type Endpoint =
  | "platform/organizations?limit=1"
  | "platform/organizations"
  | "platform/oauth_url"
  | "platform.get_stripe_connection";

async function request(key: string, endpoint: Endpoint, data?: object) {
  try {
    const response = await fetch(`https://api.useautumn.com/v1/${endpoint}`, {
      method: data ? "POST" : "GET",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      ...(data ? { body: JSON.stringify(data) } : {}),
    });
    if (response.status === 401 || response.status === 403)
      throw new ConvexError(
        "Autumn denied Platform API access. Use a key from an organization Autumn has approved for the Platform API.",
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

export async function validatePlatformKey(value: string) {
  const key = value.trim();
  if (key.length > 4096 || !/^am_sk_(test|live)_\S+$/.test(key))
    throw new ConvexError("Enter an Autumn API key.");
  const result = await request(key, "platform/organizations?limit=1");
  if (!Array.isArray(result.list))
    throw new ConvexError("Autumn could not verify your Platform API access.");
  return key;
}

export function organizationSlug(appId: string) {
  return `app-${appId.replaceAll("-", "")}`;
}

export async function createTenant(
  masterKey: string,
  appId: string,
  ownerEmail: string,
): Promise<AutumnKeys> {
  const slug = organizationSlug(appId);
  const { test_secret_key: sandbox, live_secret_key: live } = await request(
    masterKey,
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

export async function stripeUrl(
  masterKey: string,
  appId: string,
  redirect: string,
) {
  const { oauth_url } = await request(masterKey, "platform/oauth_url", {
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

export async function requireLiveStripe(masterKey: string, appId: string) {
  const { connected, account_id } = await request(
    masterKey,
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
