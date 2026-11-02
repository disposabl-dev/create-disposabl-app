import { httpActionGeneric, type HttpRouter } from "convex/server";
import type { GenericId } from "convex/values";
import { components } from "../../../backend/convex/_generated/api";

/** Fumapress emits directory indexes; the static component resolves exact paths. */
export function registerDocsRoutes(http: HttpRouter) {
  const handler = httpActionGeneric(async (ctx, request) => {
    const url = new URL(request.url);
    if (url.pathname === "/docs") {
      url.pathname = "/docs/";
      return Response.redirect(url, 308);
    }
    let path: string;
    try {
      path = decodeURIComponent(url.pathname);
    } catch {
      return new Response("Bad Request", { status: 400 });
    }
    if (
      !path.startsWith("/docs/") ||
      path.includes("\\") ||
      path.includes("\0") ||
      path.split("/").some((part) => part === "." || part === "..")
    ) {
      return new Response("Bad Request", { status: 400 });
    }
    const resolve = (assetPath: string) =>
      ctx.runQuery(components.staticHosting.lib.resolveAssetForHttp, {
        path: assetPath,
        spaFallback: false,
      });
    let asset = await resolve(path);
    asset ??= await resolve(`${path.replace(/\/$/, "")}/index.html`);
    const status = asset ? 200 : 404;
    if (!asset && request.headers.get("Accept")?.includes("text/html"))
      asset = await resolve("/docs/404.html");
    if (!asset) return new Response("Not Found", { status: 404 });
    if (asset.blobId && !asset.contentType.startsWith("text/html"))
      return Response.redirect(
        new URL(`/fs/blobs/${encodeURIComponent(asset.blobId)}`, url),
        302,
      );
    const body = asset.appStorageId
      ? await ctx.storage.get(asset.appStorageId as GenericId<"_storage">)
      : asset.storageUrl
        ? await fetch(asset.storageUrl).then((response) =>
            response.ok ? response.body : null,
          )
        : null;
    if (!body) return new Response("Asset not available", { status: 502 });
    return new Response(body, {
      status,
      headers: {
        "Content-Type": asset.contentType,
        "Cache-Control": "no-cache",
        "X-Content-Type-Options": "nosniff",
      },
    });
  });
  http.route({ path: "/docs", method: "GET", handler });
  http.route({ pathPrefix: "/docs/", method: "GET", handler });
}
