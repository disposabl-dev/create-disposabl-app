import { afterAll, expect, test } from "bun:test";
import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createApp } from "./create-app.ts";

const temp = await mkdtemp(join(tmpdir(), "create-disposabl-app-test-"));
afterAll(() => rm(temp, { recursive: true, force: true }));

test("copies only the bundled starter and renames gitignore", async () => {
  const dir = await createApp("my-app", { cwd: temp, skipInstall: true });
  expect((await readdir(dir)).sort()).toEqual([
    ".gitignore",
    "README.md",
    "index.ts",
    "package.json",
  ]);
  const manifest = JSON.parse(
    await readFile(join(dir, "package.json"), "utf8"),
  );
  expect(manifest.name).toBe("my-app");
  expect(manifest.private).toBe(true);
  expect(manifest.scripts.dev).toBe("bun --hot index.ts");
});

test("refuses an existing destination without changing its contents", async () => {
  await mkdir(join(temp, "existing"));
  await writeFile(join(temp, "existing/keep.txt"), "keep me");
  await expect(
    createApp("existing", { cwd: temp, skipInstall: true }),
  ).rejects.toThrow("EEXIST");
  expect(await readFile(join(temp, "existing/keep.txt"), "utf8")).toBe(
    "keep me",
  );
});

test("rejects invalid names and paths before writing anything", async () => {
  for (const name of [
    undefined,
    "",
    ".",
    "..",
    "../escape",
    "/tmp/app",
    "two words",
    "--help",
  ]) {
    await expect(
      createApp(name, { cwd: temp, skipInstall: true }),
    ).rejects.toThrow("Choose a folder name");
  }
});
