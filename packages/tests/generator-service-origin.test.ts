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

test("setup sends the selected Android architectures to app and preview setup", async () => {
  const dir = await mkdtemp(join(tmpdir(), "disposabl-android-setup-"));
  execFileSync("git", ["init", "-b", "main", dir], { stdio: "ignore" });
  try {
    await writeFile(
      join(dir, "disposabl.json"),
      JSON.stringify({
        platforms: ["web", "android"],
        features: [],
        androidArchitectures: ["x86_64", "arm64-v8a"],
      }),
    );
    const calls: string[][] = [];
    await setupApp(dir, "example", async (args) => {
      calls.push(args);
      if (args[0] === "login") return { currentUser: { id: "test" } };
      if (args[0] === "connections") return { ready: true };
      if (args[0] === "apps") return { appId: "test-app" };
      if (args[2] === "create")
        return { configured: true, configurationLeaseUntil: 12345 };
      return null;
    });
    for (const call of calls.filter(
      (args) => args[0] === "apps" || args[2] === "create",
    )) {
      assert.deepEqual(
        JSON.parse(call[call.indexOf("--androidArchitectures") + 1]!),
        ["arm64-v8a", "x86_64"],
      );
    }
    assert.equal(
      calls.filter((args) => args[0] === "apps" || args[2] === "create").length,
      2,
    );
    const create = calls.find(
      (args) => args[0] === "previews" && args[2] === "create",
    )!;
    assert.equal(create[create.indexOf("--configurationLease") + 1], "true");
    assert.deepEqual(calls.at(-1), [
      "previews",
      "token",
      "complete",
      "--appId",
      "test-app",
      "--until",
      "12345",
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
