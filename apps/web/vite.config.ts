import kitRouter from "@disposabl/disposabl-kit/client/vite.config";
import { createPrerenderFilter } from "@disposabl/disposabl-kit/client/lib/prerender";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";

const config = defineConfig(({ mode }) => {
  const { VITE_CONVEX_SITE_URL } = loadEnv(mode, process.cwd(), "VITE_");
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
  const siteUrl = url.origin;

  return {
    define: { "import.meta.env.VITE_CONVEX_SITE_URL": JSON.stringify(siteUrl) },
    resolve: { tsconfigPaths: true },
    plugins: [
      devtools({ consolePiping: { enabled: false } }),
      tailwindcss(),
      tanstackStart({
        router: kitRouter,
        // A separate mask keeps shell generation from replacing the prerendered home page.
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
        generateBundle() {
          if (this.environment.name !== "client") return;
          this.emitFile({
            type: "asset",
            fileName: "robots.txt",
            source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}/sitemap.xml\n`,
          });
        },
      },
    ],
  };
});

export default config;
