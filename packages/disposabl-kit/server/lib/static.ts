import config from "../../../../disposabl.json";
import { isAccountPage } from "../../lib/indexing";
import { httpActionGeneric, type HttpRouter } from "convex/server";
import { components } from "../../../backend/convex/_generated/api";
import pages from "../../../backend/generated/pages.json";

const routes = pages.map((page) => ({
  ...page,
  pattern: new RegExp(
    "^" +
      page.path
        .replace(/\/$/, "")
        .split("/")
        .map((part) =>
          part === "$"
            ? ".+"
            : part.startsWith("$")
              ? "[^/]+"
              : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
        )
        .join("/") +
      "/?$",
  ),
}));

/** Serve prerendered public pages and the app shell only for known protected routes. */
export function registerPageRoutes(http: HttpRouter) {
  http.route({
    pathPrefix: "/",
    method: "GET",
    handler: httpActionGeneric(async (ctx, request) => {
      let path: string;
      try {
        path = decodeURIComponent(new URL(request.url).pathname);
      } catch {
        return new Response("Bad Request", { status: 400 });
      }
      if (
        !(config.features as readonly string[]).includes("docs") &&
        (path === "/docs" || path.startsWith("/docs/"))
      )
        return new Response("Not Found", { status: 404 });
      if (
        process.env.AUTH_GOOGLE_ONLY === "true" &&
        [
          "/forgot-password",
          "/reset-password",
          "/verify-email",
          "/change-password",
        ].includes(path.replace(/\/$/, ""))
      )
        return new Response(null, {
          status: 302,
          headers: {
            Location: "/login",
            "Cache-Control": "no-store",
            "X-Robots-Tag": "noindex",
          },
        });
      const page = routes.find(({ pattern }) => pattern.test(path));
      const file =
        page && !path.split("/").at(-1)?.includes(".")
          ? page.authenticated
            ? "/_shell.html"
            : `${path.replace(/\/$/, "")}/index.html`
          : path === "/"
            ? "/index.html"
            : path;
      const asset = await ctx.runQuery(
        components.staticHosting.lib.resolveAssetForHttp,
        { path: file, spaFallback: false },
      );
      if (!asset)
        return new Response("Not Found", {
          status: 404,
          headers: { "Cache-Control": "no-store" },
        });
      // The static uploader's MIME table does not include video or caption files.
      const mediaType = file.endsWith(".mp4")
        ? "video/mp4"
        : file.endsWith(".vtt")
          ? "text/vtt; charset=utf-8"
          : asset.contentType;
      const contentType =
        asset.contentType === "application/octet-stream"
          ? mediaType
          : asset.contentType;
      const headers = {
        "Content-Type": contentType,
        "Cache-Control":
          contentType.includes("text/html") ||
          path === "/robots.txt" ||
          path === "/sitemap.xml"
            ? "no-cache"
            : "public, max-age=3600",
        "X-Content-Type-Options": "nosniff",
        ...(path.replace(/\/$/, "") === "/mobile-login"
          ? {
              "Content-Security-Policy": "frame-ancestors 'none'",
              "X-Frame-Options": "DENY",
              "Cache-Control": "no-store",
            }
          : {}),
        ...(page?.authenticated || isAccountPage(path)
          ? { "X-Robots-Tag": "noindex" }
          : {}),
      };
      if (asset.storageUrl) {
        const video = contentType.startsWith("video/");
        const range = video ? request.headers.get("Range") : null;
        const response = await fetch(asset.storageUrl, {
          ...(range ? { headers: { Range: range } } : {}),
        });
        if (!response.ok && !(video && response.status === 416))
          return new Response("Asset unavailable", { status: 502 });
        const resultHeaders = new Headers(headers);
        if (video)
          for (const name of [
            "Accept-Ranges",
            "Content-Range",
            "Content-Length",
          ]) {
            const value = response.headers.get(name);
            if (value) resultHeaders.set(name, value);
          }
        const partial = response.headers
          .get("Content-Range")
          ?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
        if (
          video &&
          response.status === 206 &&
          partial &&
          (+partial[1] > +partial[2] || +partial[2] >= +partial[3])
        ) {
          await response.body?.cancel();
          resultHeaders.set("Content-Range", `bytes */${partial[3]}`);
          resultHeaders.set("Content-Length", "0");
          return new Response(null, { status: 416, headers: resultHeaders });
        }
        return new Response(response.body, {
          status: video ? response.status : 200,
          headers: resultHeaders,
        });
      }
      return new Response("Asset unavailable", { status: 502 });
    }),
  });
}
