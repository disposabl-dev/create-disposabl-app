import { test, expect } from "bun:test";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { setupApp, type CliRunner } from "../setup";

test("setup delegates login, preserves UUID on retry and always supplies the named preview", async () => {
  const dir = await mkdtemp("/tmp/disposabl-setup-test-");
  const calls: string[][] = [];
  let signedIn = false;
  const run: CliRunner = async (args) => {
    calls.push(args);
    if (args.join(" ") === "login status")
      return { currentUser: signedIn ? { id: "user" } : null };
    if (args[0] === "login") {
      signedIn = true;
      return;
    }
    if (args[0] === "apps") return { appId: args[args.indexOf("--appId") + 1] };
    return { configured: true };
  };
  try {
    await writeFile(
      join(dir, "disposabl.json"),
      JSON.stringify({ platforms: ["web"], features: [] }),
    );
    const first = await setupApp(dir, "test", "main", run);
    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(await setupApp(dir, "test", "worktree-two", run)).toBe(first);
    expect(
      calls.filter((args) => args.length === 1 && args[0] === "login"),
    ).toHaveLength(1);
    expect(calls.at(-1)).toEqual([
      "previews",
      "token",
      "create",
      "--appId",
      first,
      "--reference",
      "worktree-two",
      "--configure",
      dir,
    ]);
    expect(
      JSON.parse(await readFile(join(dir, "disposabl.json"), "utf8")).appId,
    ).toBe(first);
    await expect(setupApp(dir, "test", "", run)).rejects.toThrow("reference");
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
