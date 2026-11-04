import site from "./site.json" with { type: "json" };
import { accountPaths } from "@disposabl/disposabl-kit/lib/indexing";
// docs:start
import { cp } from "node:fs/promises";
// docs:end
import kitRouter from "@disposabl/disposabl-kit/client/vite.config";
import {
  createPrerenderFilter,
  pageRoutes,
} from "@disposabl/disposabl-kit/client/lib/prerender";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

const config = defineConfig(({ mode }) => {
  const { VITE_CONVEX_SITE_URL, VITE_PUBLIC_SITE_URL } = loadEnv(
    mode,
    process.cwd(),
    "VITE_",
  );
  if (!VITE_CONVEX_SITE_URL) {
    throw new Error(
      "Set VITE_CONVEX_SITE_URL to the public Convex site origin",
    );
  }
  const url = new URL(VITE_CONVEX_SITE_URL);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  ) {
    throw new Error(
      "VITE_CONVEX_SITE_URL must be an HTTP(S) origin without a path, query, or credentials",
    );
  }
  const publicUrl = new URL(VITE_PUBLIC_SITE_URL || site.origin || url.origin);
  if (
    !["http:", "https:"].includes(publicUrl.protocol) ||
    publicUrl.pathname !== "/" ||
    publicUrl.search ||
    publicUrl.hash ||
    publicUrl.username ||
    publicUrl.password
  )
    throw new Error("VITE_PUBLIC_SITE_URL must be an HTTP(S) origin");
  const siteUrl = publicUrl.origin;
  const indexable =
    mode === "production" &&
    (!site.backendOrigin || site.backendOrigin === url.origin);

  return {
    define: {
      "import.meta.env.VITE_CONVEX_SITE_URL": JSON.stringify(url.origin),
      "import.meta.env.VITE_PUBLIC_SITE_URL": JSON.stringify(siteUrl),
      "import.meta.env.VITE_SEARCH_INDEXABLE": JSON.stringify(indexable),
      "import.meta.env.VITE_DISPOSABL_ANALYTICS_ENABLED": JSON.stringify(
        indexable && site.analytics ? "true" : "false",
      ),
    },
    resolve: { tsconfigPaths: true },
    plugins: [
      // docs:start
      {
        name: "copy-docs",
        apply: "build",
        async closeBundle() {
          if (this.environment.name === "client")
            await cp("../docs/dist/public", "dist/client/docs", {
              recursive: true,
            });
        },
      },
      // docs:end
      devtools({ consolePiping: { enabled: false } }),
      tailwindcss(),
      tanstackStart({
        router: kitRouter,
        spa: { enabled: true, maskPath: "/?shell" },
        prerender: {
          enabled: true,
          autoStaticPathsDiscovery: true,
          crawlLinks: true,
          failOnError: true,
          filter: createPrerenderFilter(),
        },
        sitemap: { enabled: true, host: siteUrl },
      }),
      viteReact(),
      {
        name: "site-robots",
        apply: "build",
        writeBundle() {
          if (this.environment.name !== "client") return;
          const output = "../../packages/backend/generated/pages.json";
          writeFileSync(
            output,
            JSON.stringify(
              pageRoutes(readFileSync("src/routeTree.gen.ts", "utf8")),
              null,
              2,
            ) + "\n",
          );
          execFileSync("bun", ["fmt", output], { stdio: "pipe" });
        },
        generateBundle() {
          if (this.environment.name !== "client") return;
          this.emitFile({
            type: "asset",
            fileName: "robots.txt",
            source: indexable
              ? `User-agent: *\nAllow: /\n${accountPaths.map((path) => `Disallow: ${path}`).join("\n")}\nDisallow: /dashboard\n\nSitemap: ${siteUrl}/sitemap.xml\n`
              : "User-agent: *\nDisallow: /\n",
          });
        },
      },
    ],
  };
});

export default config;
