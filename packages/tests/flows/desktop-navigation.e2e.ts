import { test, expect } from "e2e";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { root } from "../project";

test(
  "desktop preserves its window and OAuth state across browser handoffs",
  { platforms: ["backend"] },
  async () => {
    test.skip(
      process.env.E2E_DESKTOP_NAVIGATION !== "1",
      "Explicit local Electron verification only",
    );
    if (!existsSync(join(root, "apps/desktop/src/main.ts")))
      throw new Error("Desktop is not selected");
    const build = await mkdtemp(
      join(tmpdir(), "disposabl-desktop-navigation-"),
    );
    const server = createServer((request, response) => {
      if (request.url === "/frame-redirect") {
        const address = server.address();
        if (!address || typeof address === "string")
          throw new Error("Missing fixture port");
        response.writeHead(302, {
          Location: `http://localhost:${address.port}/frame-arrived`,
        });
        response.end();
        return;
      }
      response.setHeader("Content-Type", "text/html");
      response.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'none'; frame-src 'self' http://localhost:*",
      );
      response.end(
        "<!doctype html><title>Desktop navigation fixture</title><main>Local fixture</main>",
      );
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    try {
      const address = server.address();
      if (!address || typeof address === "string")
        throw new Error("Fixture failed to listen");
      const origin = `http://127.0.0.1:${address.port}`;
      const id = "c".repeat(32);
      const define = {
        __dirname: build,
        DISPOSABL_WEB_URL: origin,
        DISPOSABL_DESKTOP_ID: id,
        DISPOSABL_UPDATE_URL: "",
        DISPOSABL_UPDATE_CHANNEL: "test",
        MAIN_WINDOW_VITE_DEV_SERVER_URL: "",
        MAIN_WINDOW_VITE_NAME: "main_window",
      };
      execFileSync(
        "bun",
        [
          "build",
          "apps/desktop/src/main.ts",
          "apps/desktop/src/preload.ts",
          "--target=node",
          "--format=cjs",
          `--outdir=${build}`,
          "--entry-naming=[name].cjs",
          "--external=electron",
          ...Object.entries(define).map(
            ([key, value]) => `--define=${key}=${JSON.stringify(value)}`,
          ),
        ],
        { cwd: root },
      );
      const electron = execFileSync(
        process.execPath,
        ["-e", 'console.log(require("electron"))'],
        { cwd: root, encoding: "utf8" },
      ).trim();
      const env = { ...process.env };
      delete env.ELECTRON_RUN_AS_NODE;
      for (const extra of [
        [],
        [`disposabl-desktop-${id}://login?convexAuthCode=cold-ticket`],
      ]) {
        const child = spawn(
          electron,
          [
            join(root, "packages/tests/components/desktop-navigation.cjs"),
            build,
            origin,
            id,
            ...extra,
          ],
          {
            cwd: root,
            env,
            stdio: ["ignore", "pipe", "pipe"],
            timeout: 30_000,
          },
        );
        let output = "";
        child.stdout.on("data", (chunk) => {
          output += chunk;
        });
        child.stderr.on("data", (chunk) => {
          output += chunk;
        });
        const code = await new Promise<number | null>((resolve, reject) => {
          child.once("error", reject);
          child.once("exit", resolve);
        });
        if (code !== 0) throw new Error(output);
        expect(output.includes("DESKTOP_NAVIGATION_PASSED")).toBe(true);
      }
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      await rm(build, { recursive: true, force: true });
    }
  },
);
