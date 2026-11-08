import { test, expect } from "e2e";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { root } from "../project";

test(
  "local desktop login survives restart and logout protects the dashboard",
  { platforms: ["backend"] },
  async () => {
    test.skip(
      process.env.E2E_DESKTOP_REAL !== "1",
      "Explicit local desktop verification only",
    );
    expect(process.env.E2E_TELEMETRY_DISABLED).toBe("1");
    const backend = process.env.E2E_CONVEX_URL ?? "http://127.0.0.1:3310";
    if (!["127.0.0.1", "localhost"].includes(new URL(backend).hostname))
      throw new Error("Local backend required");
    const username = `desktop${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const password = `Desktop-${randomUUID()}!`;
    const signup = await fetch(`${backend}/api/mutation`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: "auth:signUpWithUsernamePassword",
        args: { username, password },
        format: "json",
      }),
    }).then((r) => r.json());
    expect(signup.value?.status).toBe("complete");
    const build = mkdtempSync(join(tmpdir(), "desktop-real-build-"));
    const profile = mkdtempSync(join(tmpdir(), "desktop-real-profile-"));
    const evidence = join(root, "packages/tests/.e2e/desktop-real");
    mkdirSync(evidence, { recursive: true });
    try {
      const defs = {
        __dirname: build,
        DISPOSABL_WEB_URL: "http://127.0.0.1:3510",
        DISPOSABL_DESKTOP_ID: "e".repeat(32),
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
          ...Object.entries(defs).map(
            ([k, v]) => `--define=${k}=${JSON.stringify(v)}`,
          ),
        ],
        { cwd: root },
      );
      const electron = execFileSync(
        process.execPath,
        ["-e", 'console.log(require("electron"))'],
        { cwd: root, encoding: "utf8" },
      ).trim();
      const env: NodeJS.ProcessEnv = {
        ...process.env,
        DO_NOT_TRACK: "1",
        E2E_TELEMETRY_DISABLED: "1",
        DESKTOP_TEST_USER: username,
        DESKTOP_TEST_PASSWORD: password,
      };
      delete env.ELECTRON_RUN_AS_NODE;
      for (const phase of ["login", "restore"])
        console.log(
          execFileSync(
            electron,
            [
              join(root, "packages/tests/components/desktop-real.cjs"),
              build,
              profile,
              evidence,
              phase,
            ],
            { cwd: root, env, encoding: "utf8", timeout: 50000 },
          ),
        );
    } finally {
      rmSync(build, { recursive: true, force: true });
      rmSync(profile, { recursive: true, force: true });
    }
  },
);
