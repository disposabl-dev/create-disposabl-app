import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { ViteDevServer } from "vite";
import sirv from "sirv";

/** Build docs on the first visit so the app itself can open immediately. */
export function serveDocs(server: ViteDevServer) {
  const directory = fileURLToPath(new URL(".", import.meta.url));
  const assets = sirv(`${directory}/dist/public`, { dev: true });
  let built: Promise<unknown> | undefined;
  server.middlewares.use((request, response, next) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    if (url.pathname !== "/docs") return next();
    response.writeHead(308, { Location: `/docs/${url.search}` });
    response.end();
  });
  server.middlewares.use("/docs", (request, response) => {
    built ??= promisify(execFile)("bun", ["run", "build"], {
      cwd: directory,
    }).catch((error) => {
      built = undefined;
      throw error;
    });
    void built
      .then(() =>
        assets(request, response, () => {
          response.statusCode = 404;
          response.end("Documentation page not found.");
        }),
      )
      .catch((error: unknown) => {
        server.config.logger.error(String(error));
        response.statusCode = 500;
        response.end(
          "Documentation could not build. Check the development terminal.",
        );
      });
  });
}
