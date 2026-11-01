import type { ComponentApi } from "@convex-dev/static-hosting/_generated/component";
import { httpActionGeneric, type HttpRouter } from "convex/server";

/** Serve build output by convention, without a second list of application routes. */
export function registerStaticRoutes(
  http: HttpRouter,
  component: ComponentApi,
) {
  const handler = httpActionGeneric(async (ctx, request) => {
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }

    const resolve = (path: string) =>
      ctx.runQuery(component.lib.resolveAssetForHttp, {
        path,
        spaFallback: false,
      });
    const path = pathname === "/" ? "/index.html" : pathname;
    let asset = await resolve(path);
    let shell = path === "/_shell.html";
    if (!asset && !pathname.split("/").filter(Boolean).at(-1)?.includes(".")) {
      asset = await resolve(`${pathname.replace(/\/$/, "")}/index.html`);
      if (!asset) {
        asset = await resolve("/_shell.html");
        shell = true;
      }
    }
    if (!asset) return new Response("Not Found", { status: 404 });

    const html = asset.contentType.startsWith("text/html");
    const headers = {
      "Content-Type": asset.contentType,
      "Cache-Control": html ? "no-store" : "public, max-age=0, must-revalidate",
      "X-Content-Type-Options": "nosniff",
      ...(shell ? { "X-Robots-Tag": "noindex, nofollow" } : {}),
    };
    if (asset.blobId && !html) {
      return new Response(null, {
        status: 302,
        headers: { ...headers, Location: `/fs/blobs/${asset.blobId}` },
      });
    }
    if (!asset.storageUrl) return new Response("Not Found", { status: 404 });
    const response = await fetch(asset.storageUrl, {
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) return new Response("Storage error", { status: 502 });
    return new Response(response.body, { headers });
  });

  http.route({ pathPrefix: "/", method: "GET", handler });
}
