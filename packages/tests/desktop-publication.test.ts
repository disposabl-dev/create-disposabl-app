import { test } from "node:test";
import assert from "node:assert/strict";
import {
  publish,
  resolve,
  desktopUpdate,
} from "../backend/convex/desktopUpdates";

const app = "a".repeat(32);
const original = {
  app,
  channel: "production",
  platform: "win32",
  arch: "x64",
  version: "1.2.1",
  build: 2,
  attempt: 1,
  filename: "app-1.2.1-full.nupkg",
  storageId: "file2",
  sha256: "b".repeat(64),
  sha1: "C".repeat(40),
  size: 7,
};

test("publication validates blobs and keeps immutable monotonic feeds isolated", async () => {
  const rows: any[] = [];
  let metadata: any = { sha256: original.sha256, size: 7 };
  const ctx: any = {
    db: {
      system: { get: async () => metadata },
      insert: async (_: unknown, row: any) => rows.push(row),
      query: () => ({
        withIndex: (_: unknown, build: any) => {
          const predicates: [string, unknown][] = [];
          const q = {
            eq: (key: string, value: unknown) => {
              predicates.push([key, value]);
              return q;
            },
          };
          build(q);
          const matching = () =>
            rows.filter((row) =>
              predicates.every(([key, value]) => row[key] === value),
            );
          return {
            order: () => ({
              first: async () =>
                matching().sort(
                  (a, b) => b.build - a.build || b.attempt - a.attempt,
                )[0] ?? null,
            }),
            unique: async () => matching()[0] ?? null,
          };
        },
      }),
    },
    storage: { getUrl: async (id: string) => `https://storage.test/${id}` },
  };
  const call = (args: any) => (publish as any)._handler(ctx, args);
  await call(original);
  await assert.rejects(
    call({
      ...original,
      build: 1,
      version: "1.1.1",
      filename: "app-1.1.1-full.nupkg",
    }),
    /not newer/,
  );
  await call(original);
  assert.equal(rows.length, 1);
  await assert.rejects(
    call({ ...original, sha1: "D".repeat(40) }),
    /not newer|already exists/,
  );
  metadata = { ...metadata, size: 8 };
  await assert.rejects(
    call({
      ...original,
      build: 3,
      version: "1.3.1",
      filename: "app-1.3.1-full.nupkg",
    }),
    /does not match/,
  );
  assert.equal(rows.length, 1);
  metadata = { ...metadata, size: 7 };
  await call({
    ...original,
    channel: "preview",
    build: 1,
    version: "1.1.1",
    filename: "app-1.1.1-full.nupkg",
  });
  await call({
    ...original,
    build: 3,
    version: "1.3.1",
    filename: "app-1.3.1-full.nupkg",
    storageId: "file3",
  });
  const get = (args: any) => (resolve as any)._handler(ctx, args);
  assert.equal(
    (await get({ app, channel: "production", platform: "win32", arch: "x64" }))
      .version,
    "1.3.1",
  );
  assert.equal(
    (
      await get({
        app,
        channel: "production",
        platform: "win32",
        arch: "x64",
        filename: original.filename,
      })
    ).url,
    "https://storage.test/file2",
  );
  assert.equal(
    await get({
      app: "d".repeat(32),
      channel: "production",
      platform: "win32",
      arch: "x64",
    }),
    null,
  );
  assert.equal(
    (await get({ app, channel: "preview", platform: "win32", arch: "x64" }))
      .version,
    "1.1.1",
  );
});

test("feed pointers are fresh and package requests redirect to storage", async () => {
  const url = `https://app.convex.site/desktop/updates/${app}/production/win32/x64/`;
  const row = {
    version: "1.2.1",
    filename: original.filename,
    sha1: original.sha1,
    size: 7,
    url: "https://storage.test/file",
  };
  const ctx = {
    runQuery: async (_: unknown, args: any) => (args.app === app ? row : null),
  };
  const handle = (path: string) =>
    (desktopUpdate as any)._handler(ctx, new Request(url + path));
  const manifest = await handle("RELEASES");
  assert.equal(manifest.headers.get("cache-control"), "no-store");
  assert.equal(
    await manifest.text(),
    `${original.sha1} ${url}${original.filename} 7\n`,
  );
  const binary = await handle(original.filename);
  assert.equal(binary.status, 302);
  assert.equal(binary.headers.get("location"), row.url);
  const macUrl = `https://app.convex.site/desktop/updates/${app}/production/darwin/arm64/RELEASES.json`;
  const macRow = { ...row, filename: "app-darwin-arm64-1.2.1.zip" };
  const mac = await (desktopUpdate as any)._handler(
    { runQuery: async () => macRow },
    new Request(macUrl),
  );
  const manifestJson = await mac.json();
  assert.equal(manifestJson.currentRelease, "1.2.1");
  assert.equal(
    manifestJson.releases[0].updateTo.url,
    macUrl.replace("RELEASES.json", macRow.filename),
  );
});

test("publisher uploads bytes before invoking the internal publication", async () => {
  const { mkdtemp, mkdir, copyFile, writeFile, readFile, chmod, rm } =
    await import("node:fs/promises");
  const { createHash } = await import("node:crypto");
  const { createServer } = await import("node:http");
  const { spawn } = await import("node:child_process");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const root = await mkdtemp(join(tmpdir(), "desktop-publish-"));
  let uploaded = "";
  const server = createServer(async (request, response) => {
    for await (const chunk of request) uploaded += chunk.toString();
    response.writeHead(200, { "Content-Type": "application/json" });
    response.end(JSON.stringify({ storageId: "stored-blob" }));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const dir = join(root, "dist/update/production/win32/x64");
    await mkdir(dir, { recursive: true });
    await mkdir(join(root, "packages/backend"), { recursive: true });
    await mkdir(join(root, "apps/desktop"), { recursive: true });
    await mkdir(join(root, "bin"));
    await copyFile(
      new URL("../../apps/desktop/publish-update.mjs", import.meta.url),
      join(root, "apps/desktop/publish-update.mjs"),
    );
    await writeFile(join(dir, original.filename), "package");
    const sha1 = createHash("sha1")
      .update("package")
      .digest("hex")
      .toUpperCase();
    await writeFile(join(dir, "RELEASES"), `${sha1} ${original.filename} 7\n`);
    const fakeBun = join(root, "bin/bun");
    await writeFile(
      fakeBun,
      '#!/bin/sh\nif [ "$8" = "desktopUpdates:uploadUrl" ]; then printf \'"%s"\\n\' "$TEST_UPLOAD_URL"; elif [ "$8" = "desktopUpdates:publish" ]; then printf \'%s\' "$9" > "$TEST_RESULT"; fi\n',
    );
    await chmod(fakeBun, 0o755);
    const address = server.address();
    assert.ok(address && typeof address === "object");
    const env = {
      ...process.env,
      PATH: `${join(root, "bin")}:${process.env.PATH}`,
      DISPOSABL_DESKTOP_ID: app,
      DISPOSABL_DESKTOP_PLATFORM: "windows",
      DISPOSABL_RELEASE_VERSION: "1.2.1",
      DISPOSABL_DESKTOP_UPDATE_CHANNEL: "production",
      TEST_UPLOAD_URL: `http://127.0.0.1:${address.port}/`,
      TEST_RESULT: join(root, "result.json"),
    };
    const child = spawn(
      process.execPath,
      [join(root, "apps/desktop/publish-update.mjs")],
      { cwd: root, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let errors = "";
    child.stderr.on("data", (chunk) => {
      errors += chunk.toString();
    });
    const code = await new Promise<number | null>((resolve) =>
      child.on("close", resolve),
    );
    assert.equal(code, 0, errors);
    assert.equal(uploaded, "package");
    const result = JSON.parse(
      await readFile(join(root, "result.json"), "utf8"),
    );
    assert.equal(result.storageId, "stored-blob");
    assert.equal(result.sha1, sha1);
    assert.equal(
      result.sha256,
      createHash("sha256").update("package").digest("hex"),
    );
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
