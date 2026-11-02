import { execFile } from "node:child_process";
import { cp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, resolve, sep } from "node:path";
import { promisify } from "node:util";
import sirv from "sirv";
import type { Plugin, ViteDevServer } from "vite";

const exec = promisify(execFile);

/** Mount a separate Fumapress static site at /docs in the existing web app. */
export function docsPlugin(): Plugin {
  let enabled = false;
  let building = false;
  let docsDir: string;
  let publicDir: string;
  let outputDir: string;
  let cli: string;

  async function build() {
    await exec(process.execPath, [cli, "build"], {
      cwd: docsDir,
      maxBuffer: 10 * 1024 * 1024,
    });
  }

  function mount(
    server: Pick<ViteDevServer, "middlewares">,
    directory: string,
  ) {
    const serve = sirv(directory, { dev: true, extensions: ["html"] });
    server.middlewares.use((req, res, next) => {
      const pathname = req.url?.split("?")[0];
      if (pathname !== "/docs" && !pathname?.startsWith("/docs/"))
        return next();
      if (pathname === "/docs") {
        res.writeHead(308, { Location: req.url!.replace("/docs", "/docs/") });
        res.end();
        return;
      }
      req.url = req.url!.slice("/docs".length);
      serve(req, res, () => {
        res.statusCode = 404;
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        void readFile(resolve(directory, "404.html"))
          .then((html) => res.end(html))
          .catch(() => res.end("Not found"));
      });
    });
  }

  return {
    name: "disposabl-docs",
    async configResolved(config) {
      building = config.command === "build";
      const root = resolve(config.root, "../..");
      const settings = JSON.parse(
        await readFile(resolve(root, "disposabl.json"), "utf8"),
      ) as { features: string[] };
      enabled = settings.features.includes("docs");
      if (!enabled) return;
      docsDir = resolve(root, "apps/docs");
      publicDir = resolve(docsDir, "dist/public");
      outputDir = resolve(config.root, "dist/client/docs");
      // Optional dependencies are resolved only when the feature is enabled.
      cli = createRequire(resolve(docsDir, "package.json")).resolve(
        "fumapress/cli",
      );
    },
    async buildStart() {
      if (building && enabled && this.environment.name === "client")
        await build();
    },
    async closeBundle() {
      if (!building || !enabled || this.environment.name !== "client") return;
      await rm(outputDir, { recursive: true, force: true });
      await cp(publicDir, outputDir, { recursive: true });
    },
    configurePreviewServer(server) {
      if (enabled) mount(server, outputDir);
    },
    async configureServer(server) {
      if (!enabled) return;
      await build();
      mount(server, publicDir);
      // Rebuild the same static output used in production when docs change.
      const watched = [
        "content",
        "src",
        "press.config.ts",
        "vite.config.ts",
      ].map((path) => resolve(docsDir, path));
      server.watcher.add(watched);
      let pending = Promise.resolve();
      const rebuild = (_event: string, file: string) => {
        if (
          !watched.some((path) => file === path || file.startsWith(path + sep))
        )
          return;
        pending = pending.then(async () => {
          try {
            await build();
            server.config.logger.info(
              "Docs rebuilt. Refresh /docs to see changes.",
            );
          } catch (error) {
            server.config.logger.error(String(error));
          }
        });
      };
      server.watcher.on("all", rebuild);
      server.httpServer?.once("close", () =>
        server.watcher.off("all", rebuild),
      );
      server.config.logger.info(
        `Fumapress docs: /docs (${dirname(publicDir)})`,
      );
    },
  };
}
