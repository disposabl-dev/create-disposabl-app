import { ConvexError } from "convex/values";
import { env } from "../_generated/server";
import type { Infer } from "convex/values";
import type { connectionStatus } from "./validator";

export const connectionsUrl = (features: readonly string[] = []) => {
  const url = new URL(
    "/dashboard/connections",
    env.CONNECTIONS_ORIGIN || env.CONVEX_SITE_URL,
  );
  const required = features.filter(
    (f) => f === "analytics" || f === "payments",
  );
  if (required.length) url.searchParams.set("features", required.join(","));
  return url.href;
};

export function requireConnections(
  status: Infer<typeof connectionStatus>,
  platforms: readonly string[] = [],
) {
  const missing = [...status.missing];
  if (
    platforms.some((p) => p === "ios" || p === "android") &&
    !status.expo &&
    !missing.includes("expo")
  )
    missing.push("expo");
  const url = new URL(status.connectionsUrl);
  if (platforms.some((p) => p === "ios" || p === "android"))
    url.searchParams.set("mobile", "1");
  if (missing.length)
    throw new ConvexError({
      code: "connections_required",
      missing,
      connectionsUrl: url.href,
      message: `Connect ${missing.map((provider) => ({ github: "GitHub", convex: "Convex", posthog: "PostHog", expo: "Expo", autumn: "Autumn" })[provider]).join(" and ")} to continue setup. Your app choices and login are saved.`,
    });
}

export const posthogScopes = [
  "organization:read",
  "project:read",
  "project:write",
];
export const posthogClientId = () =>
  new URL("/.well-known/posthog-client.json", connectionsUrl()).href;
export const posthogCallback = () => `${connectionsUrl()}?provider=posthog`;
