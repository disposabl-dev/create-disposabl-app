import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";

export const download = httpAction(async (ctx, request) => {
  const headers = {
    "Cache-Control": "no-store",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
  };
  try {
    const match = /^\/downloads\/([^/]+)\/([^/]+)$/.exec(
      new URL(request.url).pathname,
    );
    if (match) {
      const location = await ctx.runAction(internal.downloads.action.resolve, {
        appId: match[1],
        platform: match[2],
      });
      if (location)
        return new Response(null, {
          status: 302,
          headers: { ...headers, Location: location },
        });
    }
  } catch {
    // Do not disclose repository, connection, or upstream failure details.
  }
  return Response.json(
    { error: "Download not found or not ready." },
    { status: 404, headers },
  );
});
