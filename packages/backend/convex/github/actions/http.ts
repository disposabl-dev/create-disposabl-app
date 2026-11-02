import { httpAction } from "../../_generated/server";
import { internal } from "../../_generated/api";

export const token = httpAction(async (ctx, request) => {
  try {
    const body = await request.json();
    const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
    if (!token) return new Response("Unauthorized", { status: 401 });
    const result = await ctx.runAction(internal.github.actions.internal.token, {
      appId: body.appId,
      token,
      ...(body.sourceRunId !== undefined
        ? { sourceRunId: body.sourceRunId }
        : {}),
    });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json(
      { error: "Actions identity or app binding rejected." },
      { status: 403 },
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
  } catch {
    return Response.json(
      { error: "Actions report rejected." },
      { status: 403 },
    );
  }
});
