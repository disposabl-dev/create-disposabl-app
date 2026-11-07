import { test } from "node:test";
import { createServer } from "node:http";
import { once } from "node:events";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../create-disposabl-app/scaffold";

const template = resolve(
  import.meta.dirname,
  "../create-disposabl-app/dist/templates/default",
);

test(
  "selected CLI calls the generated app contract without product commands",
  { timeout: 30_000 },
  async () => {
    const temp = await mkdtemp(join(tmpdir(), "starter-cli-"));
    const app = join(temp, "app");
    const requests: { path: string; method: string; input: unknown }[] = [];
    let registeredName: string | undefined;
    const server = createServer(async (request, response) => {
      const json = (value: unknown) =>
        response
          .writeHead(200, { "Content-Type": "application/json" })
          .end(JSON.stringify(value));
      const url = new URL(request.url!, `http://${request.headers.host}`);
      if (url.pathname.startsWith("/.well-known/oauth-protected-resource"))
        return json({
          resource: `${url.origin}/mcp`,
          authorization_servers: [url.origin],
        });
      if (url.pathname === "/.well-known/oauth-authorization-server")
        return json({
          issuer: url.origin,
          authorization_endpoint: `${url.origin}/authorize`,
          token_endpoint: `${url.origin}/token`,
          registration_endpoint: `${url.origin}/register`,
          response_types_supported: ["code"],
          code_challenge_methods_supported: ["S256"],
        });
      if (url.pathname === "/register") {
        const chunks: Buffer[] = [];
        for await (const chunk of request) chunks.push(chunk);
        registeredName = JSON.parse(
          Buffer.concat(chunks).toString(),
        ).client_name;
        // End before opening a browser or issuing credentials.
        return response
          .writeHead(400, { "Content-Type": "application/json" })
          .end(
            JSON.stringify({
              error: "invalid_client_metadata",
              error_description: "Fixture registration complete",
            }),
          );
      }
      if (url.pathname === "/openapi.json")
        return json({
          paths: {
            "/api/tasks/list": {
              get: {
                operationId: "listTasks",
                parameters: [
                  {
                    name: "limit",
                    required: true,
                    content: {
                      "application/json": { schema: { type: "number" } },
                    },
                  },
                ],
              },
            },
            "/api/tasks/create": {
              post: {
                operationId: "createTask",
                requestBody: {
                  content: {
                    "application/json": {
                      schema: {
                        type: "object",
                        properties: {
                          title: { type: "string" },
                          done: { type: "boolean" },
                        },
                        required: ["title", "done"],
                      },
                    },
                  },
                },
              },
            },
          },
        });
      if (request.headers.authorization !== "Bearer local-cli-fixture")
        return response.writeHead(401).end();
      const body: Buffer[] = [];
      for await (const chunk of request) body.push(chunk);
      const input =
        request.method === "GET"
          ? JSON.parse(url.searchParams.get("limit")!)
          : JSON.parse(Buffer.concat(body).toString());
      requests.push({ path: url.pathname, method: request.method!, input });
      return json({ ok: true, input });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    assert.ok(address && typeof address !== "string");
    try {
      await createApp(template, app, "tasks", {
        version: "test",
        platforms: ["web", "cli"],
        features: [],
      });
      const cli = join(app, "packages/cli");
      assert.equal(
        JSON.parse(await readFile(join(cli, "package.json"), "utf8")).name,
        "tasks-cli",
      );
      assert.equal(existsSync(join(cli, "preview.ts")), false);
      assert.equal(existsSync(join(cli, "delete.ts")), false);
      const bundled = join(temp, "cli.js");
      // Reuse installed test dependencies; a fresh-install check is run separately.
      await symlink(
        resolve(import.meta.dirname, "../../node_modules"),
        join(app, "node_modules"),
        "dir",
      );
      await exec("bun", [
        "build",
        join(cli, "index.ts"),
        "--target",
        "node",
        "--outfile",
        bundled,
      ]);
      const run = async (...args: string[]) => {
        const result = await exec("node", [bundled, ...args], {
          cwd: app,
          env: {
            ...process.env,
            DISPOSABL_API_KEY: "local-cli-fixture",
            DISPOSABL_CLI_ORIGIN: "",
            DISPOSABL_CONFIG_DIR: join(temp, "credentials"),
          },
        }).then(
          ({ stdout, stderr }) => ({ out: stdout, err: stderr, code: 0 }),
          (error: { stdout: string; stderr: string; code: number }) => ({
            out: error.stdout,
            err: error.stderr,
            code: error.code,
          }),
        );
        return result;
      };
      const help = await run("--help");
      assert.equal(help.code, 0, help.err);
      assert.match(help.out, /Usage: tasks/);
      assert.doesNotMatch(help.out, /previews|connections|disposabl\.dev/);
      const missing = await run("tasks", "list", "--limit", "2");
      assert.equal(missing.code, 1);
      assert.match(missing.err, /Set productionConvexSiteUrl/);
      const origin = `http://127.0.0.1:${address.port}`;
      const apiHelp = await run("--origin", origin, "--help");
      assert.equal(apiHelp.code, 0, apiHelp.err);
      assert.match(apiHelp.out, /\n\s+tasks(?:\s|\[)/);
      const taskHelp = await run("--origin", origin, "help", "tasks");
      assert.equal(taskHelp.code, 0, taskHelp.err);
      assert.match(taskHelp.out, /list/);
      assert.match(taskHelp.out, /create/);
      const listHelp = await run("--origin", origin, "tasks", "list", "--help");
      assert.equal(listHelp.code, 0, listHelp.err);
      assert.match(listHelp.out, /--limit/);
      const registration = await run(
        "--origin",
        origin,
        "login",
        "--no-browser",
      );
      assert.equal(registration.code, 1);
      assert.equal(registeredName, "tasks CLI", registration.err);
      for (const args of [
        ["tasks", "list", "--limit", "2"],
        ["tasks", "create", "--title", "Ship the app", "--done", "false"],
      ]) {
        const result = await run("--origin", origin, ...args);
        assert.equal(result.code, 0, result.err);
        assert.equal(JSON.parse(result.out).ok, true);
      }
      assert.deepEqual(requests, [
        { path: "/api/tasks/list", method: "GET", input: 2 },
        {
          path: "/api/tasks/create",
          method: "POST",
          input: { title: "Ship the app", done: false },
        },
      ]);
      const web = join(temp, "web");
      await createApp(template, web, "web-only", {
        version: "test",
        platforms: ["web"],
        features: [],
      });
      assert.equal(existsSync(join(web, "packages/cli")), false);
    } finally {
      server.closeAllConnections();
      server.close();
      await rm(temp, { recursive: true, force: true });
    }
  },
);
