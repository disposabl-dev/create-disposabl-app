import config from "../../../../disposabl.json";
import { makeFunctionReference } from "convex/server";

export type TelemetryEvent =
  | "api_operation"
  | "mcp_operation"
  | "page_view"
  | "screen_view"
  | "app_setup"
  | "app_created"
  | "platform_deployment";
export type TelemetryProperties = {
  source?: "api" | "cli" | "sdk" | "mcp";
  operation?: string;
  outcome?: "success" | "error";
  page?:
    | "home"
    | "dashboard"
    | "connections"
    | "login"
    | "signup"
    | "account"
    | "other";
  duration_ms?: number;
  platform?:
    | "web"
    | "android"
    | "ios"
    | "macos"
    | "windows"
    | "linux"
    | "api"
    | "mcp"
    | "typescript-sdk"
    | "cli";
  channel?: "production" | "preview";
};

type AnalyticsConfig = {
  features: readonly string[];
  productionConvexSiteUrl?: string;
  analytics?: { projectToken: string; host: string };
};
const settings: AnalyticsConfig = config;
export function telemetryEnabled(settingsOverride: AnalyticsConfig = settings) {
  const production =
    process.env.DISPOSABL_ENVIRONMENT === "production" ||
    (!!settingsOverride.productionConvexSiteUrl &&
      process.env.CONVEX_SITE_URL === settingsOverride.productionConvexSiteUrl);
  const token =
    settingsOverride.analytics?.projectToken ??
    process.env.POSTHOG_PROJECT_TOKEN;
  const host = settingsOverride.analytics?.host ?? process.env.POSTHOG_HOST;
  return (
    settingsOverride.features.includes("analytics") &&
    production &&
    process.env.E2E_TELEMETRY_DISABLED !== "1" &&
    process.env.POSTHOG_ENABLED !== "false" &&
    !!token &&
    ["https://us.i.posthog.com", "https://eu.i.posthog.com"].includes(
      host ?? "",
    )
  );
}

/** Only trusted server callers can supply a user ID. */
export async function captureTelemetry(
  event: TelemetryEvent,
  properties: TelemetryProperties,
  userId?: string,
  settingsOverride: AnalyticsConfig = settings,
) {
  if (!telemetryEnabled(settingsOverride)) return;
  const token =
    settingsOverride.analytics?.projectToken ??
    process.env.POSTHOG_PROJECT_TOKEN!;
  const host = settingsOverride.analytics?.host ?? process.env.POSTHOG_HOST!;
  const identity = userId
    ? Array.from(
        new Uint8Array(
          await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(`disposabl:${token}:${userId}`),
          ),
        ),
        (b) => b.toString(16).padStart(2, "0"),
      ).join("")
    : crypto.randomUUID();
  const safe = {
    ...(["api", "cli", "sdk", "mcp"].includes(properties.source ?? "") && {
      source: properties.source,
    }),
    ...(properties.operation &&
      /^[A-Za-z0-9_./:-]{1,100}$/.test(properties.operation) && {
        operation: properties.operation,
      }),
    ...(["success", "error"].includes(properties.outcome ?? "") && {
      outcome: properties.outcome,
    }),
    ...([
      "home",
      "dashboard",
      "connections",
      "login",
      "signup",
      "account",
      "other",
    ].includes(properties.page ?? "") && { page: properties.page }),
    ...([
      "web",
      "android",
      "ios",
      "macos",
      "windows",
      "linux",
      "api",
      "mcp",
      "typescript-sdk",
      "cli",
    ].includes(properties.platform ?? "") && { platform: properties.platform }),
    ...(["production", "preview"].includes(properties.channel ?? "") && {
      channel: properties.channel,
    }),
    ...(Number.isFinite(properties.duration_ms) &&
      properties.duration_ms! >= 0 &&
      properties.duration_ms! <= Number.MAX_SAFE_INTEGER && {
        duration_ms: Math.round(properties.duration_ms!),
      }),
  };
  try {
    await fetch(`${host}/capture/`, {
      method: "POST",
      signal: AbortSignal.timeout(2000),
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: token,
        event,
        properties: {
          distinct_id: identity,
          ...safe,
          environment: "production",
          $process_person_profile: false,
          $ip: "0.0.0.0",
        },
      }),
    });
  } catch {
    // Analytics never interrupts the product.
  }
}

const send = makeFunctionReference<
  "action",
  { event: TelemetryEvent; properties: TelemetryProperties; userId?: string }
>("telemetry:send");
export async function scheduleTelemetry(
  ctx: { scheduler: { runAfter: (...args: any[]) => Promise<unknown> } },
  event: TelemetryEvent,
  properties: TelemetryProperties,
  userId?: string,
) {
  if (!telemetryEnabled()) return;
  try {
    await ctx.scheduler.runAfter(0, send, {
      event,
      properties,
      ...(userId && { userId }),
    });
  } catch {
    // Scheduling is best effort too.
  }
}
