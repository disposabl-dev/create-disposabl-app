import assert from "node:assert/strict";
import { ConvexHttpClient } from "convex/browser";
import { Client } from "../../cli/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js";
import { StreamableHTTPClientTransport } from "../../cli/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js";
import { client as sdk } from "../../sdk/src/generated/client.gen";
import {
  appsCreate,
  appsGet,
  appsList,
  appsDelete,
} from "../../sdk/src/generated/sdk.gen";
import { mkdtemp, writeFile, readFile, mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";

const cloud = process.env.CONVEX_URL;
if (!cloud || !process.env.CONVEX_DEPLOY_KEY?.startsWith("dev:"))
  throw new Error("Run with an explicit development deployment environment.");
const site = cloud.replace(".cloud", ".site");
let checks = 0;
const pass = (message: string) => {
  checks++;
  console.log(`PASS ${message}`);
};
const request = async (
  path: string,
  token?: string,
  body?: unknown,
  query?: Record<string, unknown>,
) => {
  const url = new URL(path, site);
  for (const [key, value] of Object.entries(query ?? {}))
    url.searchParams.set(key, JSON.stringify(value));
  return fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
};
const ok = async (response: Response) => {
  assert.equal(response.status, 200, await response.clone().text());
  return response.json();
};
const accounts = [];
for (let i = 0; i < 2; i++) {
  const c = new ConvexHttpClient(cloud, { logger: false });
  const result = await c.mutation("auth:signUpWithUsernamePassword" as never, {
    username: `appsqa${Date.now()}${i}`,
    password: crypto.randomUUID() + "A7!",
  });
  assert.equal(result.status, "complete");
  c.setAuth(result.tokens.accessToken);
  accounts.push({
    c,
    key: await c.action("mcp:createApiKey" as never, {
      name: "Apps integration",
    }),
  });
}
const [a, b] = accounts;
const key = a!.key.apiKey;
const query = { paginationOpts: { numItems: 1, cursor: null } };
assert.equal(
  (await request("/api/apps/list", undefined, undefined, query)).status,
  401,
);
assert.equal(
  (await request("/api/apps/list", "invalid", undefined, query)).status,
  401,
);
const spec = await (await fetch(site + "/openapi.json")).json();
assert.ok(!Object.keys(spec.paths).some((path) => path.includes("todos")));
pass("anonymous access denied; Todos removed from contract");
sdk.setConfig({ baseUrl: site, auth: key, throwOnError: true });
const enabled = [
  "web",
  "android",
  "ios",
  "api",
  "mcp",
  "cli",
  "typescript-sdk",
  "macos",
] as const;
const app = (
  await appsCreate({
    body: { name: "Integration app", platforms: [...enabled] },
  })
).data!;
assert.match(app.appId, /^[a-f0-9-]{36}$/);
assert.ok(!("_id" in app));
assert.deepEqual((await appsGet({ query: { appId: app.appId } })).data, app);
assert.equal(
  (
    await appsCreate({
      body: { name: app.name, platforms: [...enabled], appId: app.appId },
    })
  ).data!.appId,
  app.appId,
);
const other = (
  await appsCreate({ body: { name: "Second app", platforms: ["web"] } })
).data!;
const first = (await appsList({ query })).data!;
assert.equal(first.page.length, 1);
const next = (
  await appsList({
    query: { paginationOpts: { numItems: 1, cursor: first.continueCursor } },
  })
).data!;
assert.equal(next.page.length, 1);
assert.notEqual(first.page[0]!.appId, next.page[0]!.appId);
pass("SDK UUID create/get/idempotent retry and real cursor pagination");
for (const [path, body, params] of [
  ["/api/apps/get", undefined, { appId: app.appId }],
  ["/api/apps/delete", { appId: app.appId }, undefined],
  ["/api/previews/get", undefined, { appId: app.appId, reference: "main" }],
  [
    "/api/previews/token/create",
    { appId: app.appId, reference: "main" },
    undefined,
  ],
] as const)
  assert.equal((await request(path, b!.key.apiKey, body, params)).status, 400);
assert.equal(
  (
    await request("/api/apps/get", key, undefined, {
      appId: "internal-convex-id",
    })
  ).status,
  400,
);
assert.equal(
  (
    await request("/api/apps/create", key, {
      name: "Injected",
      platforms: [],
      userId: "someone-else",
    })
  ).status,
  400,
);
assert.equal(
  (await request("/api/previews/token/create", key, { appId: app.appId }))
    .status,
  400,
);
assert.equal(
  (
    await request("/api/apps/list", key, undefined, {
      paginationOpts: { numItems: 1000, cursor: null },
    })
  ).status,
  400,
);
pass(
  "owner isolation for apps, previews and tokens; invalid UUID, missing reference and identity injection denied",
);
const token = await ok(
  await request("/api/previews/token/create", key, {
    appId: app.appId,
    reference: "main",
  }),
);
assert.equal(token.reference, "main");
assert.ok(token.deployKey.startsWith(`dev:${token.name}|`));
const repeated = await ok(
  await request("/api/previews/token/create", key, {
    appId: app.appId,
    reference: "main",
  }),
);
assert.equal(repeated.name, token.name);
assert.notEqual(repeated.deployKey, token.deployKey);
const branch = await ok(
  await request("/api/previews/token/create", key, {
    appId: app.appId,
    reference: "worktree/feature-one",
  }),
);
assert.notEqual(branch.name, token.name);
pass(
  "real Convex project/deployment creation; main reference preserved, repeated fresh keys reuse deployment, worktree isolated",
);
let preview = await ok(
  await request("/api/previews/get", key, undefined, {
    appId: app.appId,
    reference: "main",
  }),
);
assert.equal(preview.platforms.web.url, token.convexSiteUrl);
assert.equal(preview.platforms.api.url, token.convexSiteUrl + "/openapi.json");
assert.equal(preview.platforms.mcp.url, token.convexSiteUrl + "/mcp");
assert.equal(preview.platforms.windows.enabled, false);
assert.ok(!JSON.stringify(preview).includes("deployKey"));
const update = async (latest: unknown, platform = "android") =>
  request("/api/previews/update", key, {
    appId: app.appId,
    reference: "main",
    platform,
    latest,
  });
await ok(
  await update({
    revision: 1,
    status: "ready",
    version: "1.0.1",
    githubReleaseUrl: "https://github.com/example/app/releases/tag/pr-1",
    artifactUrl:
      "https://github.com/example/app/releases/download/pr-1/android.apk",
  }),
);
preview = await ok(
  await update({
    revision: 2,
    status: "ready",
    updateUrl: "https://expo.dev/accounts/example/projects/app/updates/group",
  }),
);
assert.ok(!preview.platforms.android.latest.artifactUrl);
assert.ok(!preview.platforms.android.latest.githubReleaseUrl);
assert.equal((await update({ revision: 1, status: "failed" })).status, 400);
assert.equal(
  (
    await update({
      revision: 3,
      status: "ready",
      artifactUrl: "javascript:alert(1)",
    })
  ).status,
  400,
);
assert.equal(
  (await update({ revision: 3, status: "ready" }, "windows")).status,
  400,
);
pass(
  "preview links, disabled flags, latest-only EAS replacement, stale results and unsafe links rejected",
);
const temp = await mkdtemp("/tmp/disposabl-apps-cli-");
const config = { appId: app.appId, platforms: [...enabled] };
await writeFile(join(temp, "disposabl.json"), JSON.stringify(config));
await writeFile(join(temp, ".gitignore"), ".env*\n");
for (const folder of ["packages/backend", "apps/web", "apps/mobile"])
  await mkdir(join(temp, folder), { recursive: true });
Bun.spawnSync(["git", "init", "--initial-branch=main"], { cwd: temp });
const runner = join(temp, "runner.ts");
await writeFile(
  runner,
  `import {runCli} from ${JSON.stringify(resolve(import.meta.dir, "../../cli/commands.ts"))};await runCli([process.argv[0],process.argv[1],...process.argv.slice(2)],${JSON.stringify(site)});`,
);
async function cli(args: string[], credential = key) {
  const proc = Bun.spawn(["bun", runner, ...args], {
    cwd: temp,
    env: {
      ...process.env,
      DISPOSABL_API_KEY: credential,
      DISPOSABL_CONFIG_DIR: join(temp, "credentials"),
    },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  assert.equal(await proc.exited, 0, stderr);
  return stdout;
}
assert.ok(JSON.parse(await cli(["login", "status"])).currentUser.id);
assert.equal(JSON.parse(await cli(["login", "status"], "")).currentUser, null);
assert.equal(
  JSON.parse(await cli(["previews", "get", "--json"])).reference,
  "main",
);
assert.ok((await cli(["previews", "get"])).includes("/openapi.json"));
const configured = JSON.parse(
  await cli([
    "previews",
    "token",
    "create",
    "--reference",
    "main",
    "--configure",
    temp,
  ]),
);
assert.ok(configured.configured && !configured.deployKey);
assert.ok(
  (await readFile(join(temp, "packages/backend/.env.local"), "utf8")).includes(
    "CONVEX_DEPLOY_KEY=",
  ),
);
assert.ok(
  !(await readFile(join(temp, "apps/web/.env.local"), "utf8")).includes(
    "DEPLOY_KEY",
  ),
);
pass(
  "CLI verified login status, Git preview discovery, clickable output and ignored development credentials",
);
const mcp = new Client({ name: "apps-integration", version: "1.0.0" });
await mcp.connect(
  new StreamableHTTPClientTransport(new URL(site + "/mcp"), {
    requestInit: { headers: { Authorization: `Bearer ${key}` } },
  }),
);
const tools = await mcp.listTools();
assert.ok(tools.tools.some((t) => t.name === "apps_internal_delete"));
assert.ok(!tools.tools.some((t) => t.name.includes("todos")));
const result = await mcp.callTool({
  name: "apps_internal_get",
  arguments: { appId: app.appId },
});
assert.notEqual(result.isError, true);
assert.ok(JSON.stringify(result).includes(app.appId));
await mcp.close();
pass("MCP shared app/preview contract and UUID lookup");
await appsDelete({ body: { appId: other.appId } });
await assert.rejects(() => appsGet({ query: { appId: other.appId } }));
await assert.rejects(() =>
  appsCreate({
    body: { name: other.name, platforms: other.platforms, appId: other.appId },
  }),
);
pass("deleted apps inaccessible; UUID cannot be recycled into old previews");
await Bun.write(
  "/tmp/disposabl-apps-integration-result.json",
  JSON.stringify(
    {
      cloud,
      appId: app.appId,
      checks,
      main: token.name,
      branch: branch.name,
      temp,
    },
    null,
    2,
  ),
);
for (const account of accounts)
  await account.c.mutation("mcp:revokeConnection" as never, {
    id: account.key.id,
  });
console.log(JSON.stringify({ checks, cloud, appId: app.appId }));
