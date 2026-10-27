import { afterAll, expect, test } from "bun:test";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./index.js";

const originalCwd = process.cwd();
const temp = await mkdtemp(join(tmpdir(), "create-disposabl-app-test-"));
const fixture = join(temp, "fixture");
await mkdir(join(fixture, "cli"), { recursive: true });
await mkdir(join(fixture, ".github/workflows"), { recursive: true });
await mkdir(join(fixture, "vendor/fixture-dep"), { recursive: true });
await writeFile(join(fixture, "vendor/fixture-dep/package.json"), '{"name":"fixture-dep","version":"1.0.0"}');
await writeFile(join(fixture, "package.json"), JSON.stringify({
  name: "template",
  scripts: { dev: "bun index.js" },
  dependencies: { "fixture-dep": "file:./vendor/fixture-dep" },
}));
await writeFile(join(fixture, "index.js"), 'console.log("starter runs");\n');
await writeFile(join(fixture, "cli/package.json"), '{"name":"publisher"}');
await writeFile(join(fixture, ".github/workflows/publish.yml"), "publisher");
await writeFile(join(fixture, ".github/workflows/check.yml"), "keep me");
const archive = join(temp, "template.tar.gz");
const pack = Bun.spawn(["tar", "-czf", archive, "-C", temp, "fixture"]);
if (await pack.exited !== 0) throw new Error("Could not create test archive");
const server = Bun.serve({
  port: 0,
  fetch: () => new Response(Bun.file(archive)),
});
process.chdir(temp);

afterAll(async () => {
  process.chdir(originalCwd);
  server.stop(true);
  await rm(temp, { recursive: true, force: true });
});

test("downloads the app, excludes publishing files, installs, and runs", async () => {
  const dir = await createApp("my-app", server.url.href);
  const manifest = JSON.parse(await readFile(join(dir, "package.json"), "utf8"));
  expect(manifest.name).toBe("my-app");
  expect(manifest.private).toBe(true);
  expect(existsSync(join(dir, "node_modules/fixture-dep/package.json"))).toBe(true);
  expect(existsSync(join(dir, "cli"))).toBe(false);
  expect(existsSync(join(dir, ".github/workflows/publish.yml"))).toBe(false);
  expect(await readFile(join(dir, ".github/workflows/check.yml"), "utf8")).toBe("keep me");
  const dev = Bun.spawn([process.execPath, "run", "dev"], { cwd: dir, stdout: "pipe" });
  expect(await new Response(dev.stdout).text()).toContain("starter runs");
  expect(await dev.exited).toBe(0);
});

test("refuses an existing destination without changing its contents", async () => {
  await mkdir("existing");
  await writeFile("existing/keep.txt", "keep me");
  await expect(createApp("existing", server.url.href)).rejects.toThrow("EEXIST");
  expect(await readFile("existing/keep.txt", "utf8")).toBe("keep me");
});

test("rejects invalid names and paths before writing anything", async () => {
  for (const name of [undefined, "", ".", "..", "../escape", "/tmp/app", "two words", "--help"]) {
    await expect(createApp(name, server.url.href)).rejects.toThrow("Choose a folder name");
  }
});

test("reports a failed download without printing success", async () => {
  const unavailable = Bun.serve({ port: 0, fetch: () => new Response("Unavailable", { status: 500 }) });
  try {
    await expect(createApp("failed-download", new URL(`/missing-${Date.now()}.tar.gz`, unavailable.url).href)).rejects.toThrow();
  } finally {
    unavailable.stop(true);
  }
});
