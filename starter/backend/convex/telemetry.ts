import { v } from "convex/values";
import { makeFunctionReference } from "convex/server";
import { httpAction, internalAction } from "./_generated/server";
import { getSessionUserId } from "@disposabl/disposabl-kit/server/lib/functions";
import {
  captureTelemetry,
  hashTelemetryIdentity,
  telemetryEnabled,
} from "@disposabl/disposabl-kit/server/lib/telemetry";

export {
  claimIdentity,
  expireIdentity,
} from "@disposabl/disposabl-kit/server/lib/telemetry";

const claimIdentityRef = makeFunctionReference<
  "mutation",
  { hash?: string; newHash: string; userId?: string },
  boolean | null
>("telemetry:claimIdentity");

const pageNames = [
  "home",
  "dashboard",
  "connections",
  "login",
  "signup",
  "account",
  "other",
] as const;
const pageValidator = v.union(...pageNames.map((page) => v.literal(page)));
const properties = v.object({
  source: v.optional(
    v.union(
      v.literal("api"),
      v.literal("cli"),
      v.literal("sdk"),
      v.literal("mcp"),
    ),
  ),
  operation: v.optional(v.string()),
  outcome: v.optional(v.union(v.literal("success"), v.literal("error"))),
  page: v.optional(pageValidator),
  duration_ms: v.optional(v.number()),
});
export const send = internalAction({
  args: {
    event: v.union(
      v.literal("api_operation"),
      v.literal("mcp_operation"),
      v.literal("page_view"),
      v.literal("screen_view"),
      v.literal("app_setup"),
    ),
    properties,
    userId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (_ctx, args) => {
    await captureTelemetry(args.event, args.properties, args.userId);
    return null;
  },
});
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
export const options = httpAction(
  async () => new Response(null, { status: 204, headers }),
);
const anonymousIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const page = httpAction(async (ctx, request) => {
  try {
    const body: unknown = await request.json();
    if (
      !body ||
      typeof body !== "object" ||
      !("platform" in body) ||
      !("page" in body) ||
      (body.platform !== "web" && body.platform !== "mobile") ||
      typeof body.page !== "string" ||
      !pageNames.includes(body.page as (typeof pageNames)[number]) ||
      ("anonymousId" in body &&
        (typeof body.anonymousId !== "string" ||
          !anonymousIdPattern.test(body.anonymousId)))
    )
      return new Response(null, { status: 400, headers });
    if (!telemetryEnabled())
      return new Response(null, { status: 204, headers });
    const userId = await getSessionUserId(ctx);
    if (request.headers.has("Authorization") && !userId)
      return new Response(null, { status: 401, headers });
    const existingId =
      "anonymousId" in body ? (body.anonymousId as string) : undefined;
    const issuedId = crypto.randomUUID();
    const accepted = await ctx.runMutation(claimIdentityRef, {
      ...(existingId ? { hash: await hashTelemetryIdentity(existingId) } : {}),
      newHash: await hashTelemetryIdentity(issuedId),
      ...(userId ? { userId } : {}),
    });
    if (accepted === null) return new Response(null, { status: 429, headers });
    const anonymousId = accepted && existingId ? existingId : issuedId;
    await captureTelemetry(
      body.platform === "web" ? "page_view" : "screen_view",
      { page: body.page as (typeof pageNames)[number] },
      userId ?? undefined,
      undefined,
      anonymousId,
    );
    return new Response(JSON.stringify({ anonymousId }), {
      status: 200,
      headers: { ...headers, "Content-Type": "application/json" },
    });
  } catch {
    return new Response(null, { status: 400, headers });
  }
});
