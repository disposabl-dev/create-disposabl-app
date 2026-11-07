import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { setupApp } from "../create-disposabl-app/setup";
import { execFileSync } from "node:child_process";

test("setup saves its service before OAuth and rejects app rebinding", async () => {
  const dir = await mkdtemp(join(tmpdir(), "disposabl-origin-"));
  execFileSync("git", ["init", "-b", "main", dir], { stdio: "ignore" });
  const previous = process.env.DISPOSABL_API_ORIGIN;
  try {
    process.env.DISPOSABL_API_ORIGIN = "https://isolated.convex.site";
    const path = join(dir, "disposabl.json");
    await writeFile(path, JSON.stringify({ platforms: ["web"], features: [] }));
    await assert.rejects(
      setupApp(dir, "example", async () => {
        throw new Error("fixture stop before OAuth");
      }),
      /fixture stop/,
    );
    const config = JSON.parse(await readFile(path, "utf8"));
    assert.equal(config.serviceOrigin, "https://isolated.convex.site");
    await writeFile(path, JSON.stringify({ ...config, appId: "existing" }));
    process.env.DISPOSABL_API_ORIGIN = "https://different.example";
    await assert.rejects(
      setupApp(dir, "example", async () => {
        throw new Error("must not call");
      }),
      /different Disposabl service/,
    );
    assert.equal(
      JSON.parse(await readFile(path, "utf8")).serviceOrigin,
      config.serviceOrigin,
    );
  } finally {
    if (previous === undefined) delete process.env.DISPOSABL_API_ORIGIN;
    else process.env.DISPOSABL_API_ORIGIN = previous;
    await rm(dir, { recursive: true, force: true });
  }
});
