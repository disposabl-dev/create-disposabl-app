import { httpAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { ConvexError } from "convex/values";

function retryResponse(error: unknown) {
  const data = error instanceof ConvexError ? error.data : undefined;
  if (
    data &&
    typeof data === "object" &&
    "code" in data &&
    data.code === "UPSTREAM_RETRY"
  ) {
    const seconds = "retryAfter" in data ? Number(data.retryAfter) : 5;
    return Response.json(
      { error: "GitHub connection is temporarily busy. Retry this request." },
      {
        status: 503,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.min(3600, Number.isFinite(seconds) ? seconds : 5)),
          ),
          "Cache-Control": "no-store",
        },
      },
    );
  }
  return null;
}

export const token = httpAction(async (ctx, request) => {
  try {
    const body = await request.json();
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return new Response("Unauthorized", { status: 401 });
    const result = await ctx.runAction(internal.github.actions.internal.token, {
      appId: body.appId,
      token,
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return (
      retryResponse(error) ??
      Response.json(
        { error: "Actions identity or app binding rejected." },
        { status: 403 },
      )
    );
  }
});
export const report = httpAction(async (ctx, request) => {
  try {
    const body = await request.json();
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return new Response("Unauthorized", { status: 401 });
    await ctx.runAction(internal.github.actions.internal.report, {
      ...body,
      token,
    });
    return Response.json(
      { ok: true },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return (
      retryResponse(error) ??
      Response.json({ error: "Actions report rejected." }, { status: 403 })
    );
  }
});
