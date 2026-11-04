import { httpAction } from "./_generated/server";
import { captureTelemetry } from "@disposabl/disposabl-kit/server/lib/telemetry";

const pages = [
  "home",
  "dashboard",
  "connections",
  "login",
  "signup",
  "account",
  "other",
] as const;
const headers = {
  "Access-Control-Allow-Origin": "*",
  "Cache-Control": "no-store",
};

export const page = httpAction(async (_ctx, request) => {
  try {
    const body = await request.json();
    if (
      (body.platform !== "web" && body.platform !== "mobile") ||
      !pages.includes(body.page)
    )
      return new Response(null, { status: 400, headers });
    await captureTelemetry(
      body.platform === "web" ? "page_view" : "screen_view",
      { page: body.page },
    );
  } catch {
    return new Response(null, { status: 400, headers });
  }
  return new Response(null, { status: 204, headers });
});
