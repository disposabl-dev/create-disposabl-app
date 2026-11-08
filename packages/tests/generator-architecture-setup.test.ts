import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn, execFileSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import {
  copyFile,
  mkdir,
  mkdtemp,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { createApp } from "../create-disposabl-app/scaffold";
import { version } from "../create-disposabl-app/package.json";

test("payments native configuration is included in Expo fingerprint inputs", async () => {
  const root = await mkdtemp(join(tmpdir(), "mobile-payments-fingerprint-"));
  try {
    const kit = join(root, "packages/disposabl-kit");
    await mkdir(join(kit, "mobile"), { recursive: true });
    await copyFile(
      resolve(import.meta.dirname, "../disposabl-kit/mobile/expo-plugin.cjs"),
      join(kit, "mobile/expo-plugin.cjs"),
    );
    await copyFile(
      resolve(import.meta.dirname, "../disposabl-kit/android-architectures.ts"),
      join(kit, "android-architectures.ts"),
    );
    await symlink(
      resolve(import.meta.dirname, "../../node_modules"),
      join(root, "node_modules"),
    );
    const extras = [];
    for (const features of [[], ["payments"]]) {
      await writeFile(
        join(root, "disposabl.json"),
        JSON.stringify({ features }),
      );
      const result = execFileSync(
        process.execPath,
        [
          "-e",
          "const plugin = require(process.argv[1]); console.log(JSON.stringify(plugin({}).extra))",
          join(kit, "mobile/expo-plugin.cjs"),
        ],
        { encoding: "utf8" },
      );
      extras.push(JSON.parse(result));
    }
    assert.equal(extras[0].disposablAndroidPayments, false);
    assert.equal(extras[1].disposablAndroidPayments, true);
    assert.deepEqual(
      extras[0].disposablAndroidArchitectures,
      extras[1].disposablAndroidArchitectures,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  "generator completes the architecture lease only after real CLI configuration",
  { timeout: 30000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), "architecture-setup-"));
    const template = resolve(
      import.meta.dirname,
      "../create-disposabl-app/dist/templates/default",
    );
    const cli = resolve(
      import.meta.dirname,
      "../create-disposabl-app/dist/index.js",
    );
    const contract = JSON.parse(
      readFileSync(
        resolve(import.meta.dirname, "../backend/generated/openapi.json"),
        "utf8",
      ),
    );
    const requests: { path: string; body: unknown; configured: boolean }[] = [];
    let failConfig = false;
    let missingReceipt = false;
    let app = "";
    const server = createServer(async (req, res) => {
      const path = new URL(req.url!, "http://127.0.0.1").pathname;
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      const body = Buffer.concat(chunks).toString();
      requests.push({
        path,
        body: body ? JSON.parse(body) : null,
        configured: existsSync(join(app, "packages/backend/.env.local")),
      });
      res.setHeader("content-type", "application/json");
      if (path === "/openapi.json") res.end(JSON.stringify(contract));
      else if (path === "/api/users/current")
        res.end(JSON.stringify({ id: "fixture-user" }));
      else if (path === "/api/connections/status")
        res.end(JSON.stringify({ ready: true }));
      else if (path === "/api/previews/token/create")
        res.end(
          JSON.stringify({
            appId: "fixture-app",
            name: "fixture-dev",
            reference: "main",
            convexUrl: "https://fixture-dev.convex.cloud",
            convexSiteUrl: "https://fixture-dev.convex.site",
            deployKey: failConfig ? "invalid" : "dev:fixture-dev|fixture",
            ...(missingReceipt ? {} : { configurationLeaseUntil: 12345 }),
          }),
        );
      else if (path === "/api/previews/token/complete") res.end("null");
      else {
        res.statusCode = 404;
        res.end("{}");
      }
    });
    await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
    const port = (server.address() as { port: number }).port;
    try {
      for (const scenario of [
        "success",
        "configure-failure",
        "missing-receipt",
      ]) {
        app = join(root, scenario);
        failConfig = scenario === "configure-failure";
        missingReceipt = scenario === "missing-receipt";
        requests.length = 0;
        await createApp(template, app, scenario, {
          version,
          appId: "fixture-app",
          platforms: ["web"],
          features: [],
        });
        execFileSync("git", ["init", "-b", "main", app], { stdio: "ignore" });
        execFileSync(
          "git",
          [
            "-C",
            app,
            "-c",
            "user.name=fixture",
            "-c",
            "user.email=fixture@example.invalid",
            "commit",
            "--allow-empty",
            "-m",
            "fixture",
          ],
          { stdio: "ignore" },
        );
        const child = spawn(
          process.execPath,
          [cli, scenario, "--skip-install", "--json"],
          {
            cwd: root,
            env: {
              ...process.env,
              DISPOSABL_API_ORIGIN: `http://127.0.0.1:${port}`,
              DISPOSABL_API_KEY: "fixture",
              DISPOSABL_CONFIG_DIR: join(root, "config"),
              E2E_TELEMETRY_DISABLED: "1",
              DISPOSABL_TELEMETRY_DISABLED: "1",
            },
            stdio: ["ignore", "pipe", "pipe"],
          },
        );
        let output = "";
        child.stdout.on("data", (v) => (output += v));
        child.stderr.on("data", (v) => (output += v));
        const code = await new Promise<number | null>((done) =>
          child.on("close", done),
        );
        const create = requests.find(
          (r) => r.path === "/api/previews/token/create",
        );
        assert.ok(create, output);
        assert.deepEqual(
          (create.body as { androidArchitectures: string[] })
            .androidArchitectures,
          ["arm64-v8a", "x86_64"],
        );
        assert.equal(
          (create.body as { configurationLease: boolean }).configurationLease,
          true,
        );
        const complete = requests.filter(
          (r) => r.path === "/api/previews/token/complete",
        );
        if (scenario === "success") {
          assert.equal(code, 0, output);
          assert.equal(complete.length, 1);
          assert.equal(complete[0]!.configured, true);
          assert.deepEqual(complete[0]!.body, {
            appId: "fixture-app",
            until: 12345,
          });
        } else {
          assert.notEqual(code, 0, output);
          assert.equal(complete.length, 0);
        }
      }
    } finally {
      await new Promise<void>((done) => server.close(() => done()));
      await rm(root, { recursive: true, force: true });
    }
  },
);
