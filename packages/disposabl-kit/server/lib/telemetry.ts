import config from "../../../../disposabl.json";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import {
  internalMutation,
  type ActionCtx,
  type MutationCtx,
} from "../../../backend/convex/_generated/server";

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
  /** Server-owned app identity; hashed before leaving the backend. */
  app_id?: string;
  time_since_app_creation_ms?: number;
  run_number?: number;
  run_attempt?: number;
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

// The UUID is a bearer capability, not browser attestation or authorization.
// Records expire after 30 days; an expired capability rotates without a merge.
const identityTtl = 30 * 24 * 60 * 60 * 1000;
// A single global bucket bounds anonymous issuance, regardless of input ID.
const issuanceBurst = 64;
const issuanceRefillMs = 60_000;
const expireIdentityRef = makeFunctionReference<
  "mutation",
  { id: string },
  null
>("telemetry:expireIdentity");

export const createClaimIdentity = (
  checkUser?: (ctx: MutationCtx, userId: string) => Promise<void>,
) =>
  internalMutation({
    args: {
      hash: v.optional(v.string()),
      newHash: v.string(),
      userId: v.optional(v.string()),
      reportLink: v.optional(v.boolean()),
    },
    returns: v.union(v.boolean(), v.null(), v.literal("linked")),
    handler: async (ctx, { hash, newHash, userId, reportLink }) => {
      if (userId !== undefined) await checkUser?.(ctx, userId);
      const row = hash
        ? await ctx.db
            .query("telemetryIdentities")
            .withIndex("by_hash", (q) => q.eq("hash", hash))
            .unique()
        : null;
      if (
        row &&
        row.expiresAt > Date.now() &&
        (!row.userId || row.userId === userId)
      ) {
        if (userId && !row.userId) {
          await ctx.db.patch("telemetryIdentities", row._id, { userId });
          if (reportLink) return "linked";
        }
        return true;
      }
      const now = Date.now();
      const bucket = await ctx.db
        .query("telemetryIssuance")
        .withIndex("by_key", (q) => q.eq("key", "global"))
        .unique();
      const tokens = bucket
        ? Math.min(
            issuanceBurst,
            bucket.tokens +
              Math.max(0, now - bucket.updatedAt) / issuanceRefillMs,
          )
        : issuanceBurst;
      if (tokens < 1) return null;
      if (bucket) {
        await ctx.db.patch("telemetryIssuance", bucket._id, {
          tokens: tokens - 1,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("telemetryIssuance", {
          key: "global",
          tokens: tokens - 1,
          updatedAt: now,
        });
      }
      const id = await ctx.db.insert("telemetryIdentities", {
        hash: newHash,
        expiresAt: Date.now() + identityTtl,
        ...(userId ? { userId } : {}),
      });
      await ctx.scheduler.runAfter(identityTtl, expireIdentityRef, { id });
      return false;
    },
  });

export const claimIdentity = createClaimIdentity();

export const expireIdentity = internalMutation({
  args: { id: v.id("telemetryIdentities") },
  returns: v.null(),
  handler: async (ctx, { id }) => {
    const row = await ctx.db.get("telemetryIdentities", id);
    if (row && row.expiresAt <= Date.now())
      await ctx.db.delete("telemetryIdentities", id);
    return null;
  },
});

/** Hash capabilities before persisting them; the raw value stays with its holder. */
export async function hashTelemetryIdentity(value: string) {
  return opaqueId(`disposabl:anonymous-capability:${value}`);
}

async function opaqueId(value: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}

const bootstrapClaim = makeFunctionReference<
  "mutation",
  { hash?: string; newHash: string; userId?: string; reportLink: boolean },
  boolean | null | "linked"
>("telemetry:claimIdentity");
const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const bootstrapHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};

/** The expiry governs client refresh; it cannot revoke the public project token. */
export async function bootstrapTelemetry(
  ctx: ActionCtx,
  request: Request,
  getUser: (ctx: ActionCtx) => Promise<string | null>,
) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return new Response(null, { status: 400, headers: bootstrapHeaders });
  }
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    ("anonymousId" in body &&
      (typeof body.anonymousId !== "string" ||
        !uuidPattern.test(body.anonymousId)))
  )
    return new Response(null, { status: 400, headers: bootstrapHeaders });
  if (!telemetryEnabled())
    return new Response(null, { status: 204, headers: bootstrapHeaders });
  const projectToken =
    settings.analytics?.projectToken ?? process.env.POSTHOG_PROJECT_TOKEN!;
  const host = settings.analytics?.host ?? process.env.POSTHOG_HOST!;
  if (!/^phc_[A-Za-z0-9_-]+$/.test(projectToken))
    return new Response(null, { status: 204, headers: bootstrapHeaders });
  let userId: string | null;
  try {
    userId = await getUser(ctx);
  } catch {
    return new Response(null, { status: 401, headers: bootstrapHeaders });
  }
  if (request.headers.has("Authorization") && !userId)
    return new Response(null, { status: 401, headers: bootstrapHeaders });
  const existing =
    "anonymousId" in body ? (body.anonymousId as string) : undefined;
  const issued = crypto.randomUUID();
  let claim: boolean | null | "linked";
  try {
    claim = await ctx.runMutation(bootstrapClaim, {
      ...(existing ? { hash: await hashTelemetryIdentity(existing) } : {}),
      newHash: await hashTelemetryIdentity(issued),
      ...(userId ? { userId } : {}),
      reportLink: true,
    });
  } catch {
    return new Response(null, {
      status: userId ? 401 : 503,
      headers: bootstrapHeaders,
    });
  }
  if (claim === null)
    return new Response(null, { status: 429, headers: bootstrapHeaders });
  const anonymousId = claim && existing ? existing : issued;
  const anonymousDistinct = await opaqueId(
    `disposabl:${projectToken}:anonymous:${anonymousId}`,
  );
  const distinctId = userId
    ? await opaqueId(`disposabl:${projectToken}:${userId}`)
    : anonymousDistinct;
  if (claim === "linked") {
    try {
      await fetch(`${host}/capture/`, {
        method: "POST",
        signal: AbortSignal.timeout(2000),
        redirect: "error",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: projectToken,
          event: "$identify",
          properties: {
            distinct_id: distinctId,
            $anon_distinct_id: anonymousDistinct,
            $ip: "0.0.0.0",
          },
        }),
      });
    } catch {
      /* The identity link is best effort; no page event is captured. */
    }
  }
  return Response.json(
    {
      enabled: true,
      projectToken,
      host,
      anonymousId,
      distinctId,
      identified: !!userId,
      expiresAt: Date.now() + 30_000,
    },
    { headers: bootstrapHeaders },
  );
}

/** Only trusted server callers can supply a user or app ID. */
export async function captureTelemetry(
  event: TelemetryEvent,
  properties: TelemetryProperties,
  userId?: string,
  settingsOverride: AnalyticsConfig = settings,
  anonymousId?: string,
) {
  if (!telemetryEnabled(settingsOverride)) return;
  try {
    const token =
      settingsOverride.analytics?.projectToken ??
      process.env.POSTHOG_PROJECT_TOKEN!;
    const host = settingsOverride.analytics?.host ?? process.env.POSTHOG_HOST!;
    const identity = userId
      ? await opaqueId(`disposabl:${token}:${userId}`)
      : anonymousId
        ? await opaqueId(`disposabl:${token}:anonymous:${anonymousId}`)
        : crypto.randomUUID();
    const safe = {
      ...(properties.app_id && {
        app_id: await opaqueId(`disposabl:${token}:app:${properties.app_id}`),
      }),
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
      ].includes(properties.platform ?? "") && {
        platform: properties.platform,
      }),
      ...(["production", "preview"].includes(properties.channel ?? "") && {
        channel: properties.channel,
      }),
      ...(Number.isFinite(properties.duration_ms) &&
        properties.duration_ms! >= 0 &&
        properties.duration_ms! <= Number.MAX_SAFE_INTEGER && {
          duration_ms: Math.round(properties.duration_ms!),
        }),
      ...Object.fromEntries(
        (["time_since_app_creation_ms", "run_number", "run_attempt"] as const)
          .filter(
            (key) =>
              Number.isSafeInteger(properties[key]) && properties[key]! >= 0,
          )
          .map((key) => [key, properties[key]]),
      ),
    };
    if (userId && anonymousId) {
      const response = await fetch(`${host}/capture/`, {
        method: "POST",
        signal: AbortSignal.timeout(2000),
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: token,
          event: "$identify",
          properties: {
            distinct_id: identity,
            $anon_distinct_id: await opaqueId(
              `disposabl:${token}:anonymous:${anonymousId}`,
            ),
            $ip: "0.0.0.0",
          },
        }),
      });
      if (!response.ok) return;
    }
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
          ...(!userId || !anonymousId
            ? { $process_person_profile: false }
            : {}),
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
