import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chmodSync,
  copyFileSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

test("installed hook checks the index without changing partially staged files", () => {
  const dir = mkdtempSync(join(tmpdir(), "disposabl-hooks-"));
  const root = fileURLToPath(new URL("../../", import.meta.url));
  const run = (...args: string[]) =>
    spawnSync(args[0], args.slice(1), { cwd: dir, encoding: "utf8" });
  const git = (...args: string[]) => run("git", ...args);
  try {
    assert.equal(git("init", "-q").status, 0);
    assert.equal(git("config", "user.name", "Hook Test").status, 0);
    assert.equal(
      git("config", "user.email", "hook-test@example.invalid").status,
      0,
    );
    mkdirSync(join(dir, ".githooks"));
    for (const file of ["install", "pre-commit"]) {
      copyFileSync(join(root, ".githooks", file), join(dir, ".githooks", file));
    }
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { "hooks:install": ".githooks/install" } }),
    );
    assert.equal(git("config", "core.hooksPath", "custom-hooks").status, 0);
    assert.notEqual(run("bun", "run", "hooks:install").status, 0);
    assert.equal(
      git("config", "--get", "core.hooksPath").stdout.trim(),
      "custom-hooks",
    );
    assert.equal(git("config", "--unset", "core.hooksPath").status, 0);
    const existing = join(dir, ".git/hooks/pre-push");
    writeFileSync(existing, "#!/bin/sh\nexit 0\n");
    chmodSync(existing, 0o755);
    assert.notEqual(run("bun", "run", "hooks:install").status, 0);
    assert.equal(git("config", "--get", "core.hooksPath").status, 1);
    assert.equal(readFileSync(existing, "utf8"), "#!/bin/sh\nexit 0\n");
    rmSync(existing);
    assert.equal(run("bun", "run", "hooks:install").status, 0);
    assert.equal(
      git("config", "--get", "core.hooksPath").stdout.trim(),
      ".githooks",
    );

    const path = join(dir, "example.ts");
    writeFileSync(path, "const value=1\n");
    assert.equal(git("add", "example.ts").status, 0);
    const unstaged = "const value = 2;\n";
    writeFileSync(path, unstaged);
    const failure = git("commit", "-m", "bad staged formatting");
    assert.notEqual(failure.status, 0);
    assert.ok((failure.stdout + failure.stderr).includes("example.ts"));
    assert.equal(git("show", ":example.ts").stdout, "const value=1\n");
    assert.equal(readFileSync(path, "utf8"), unstaged);

    writeFileSync(path, "const value = 1;\n");
    assert.equal(git("add", "example.ts").status, 0);
    writeFileSync(path, "const value=3\n");
    const success = git("commit", "-m", "valid staged formatting");
    assert.equal(success.status, 0);
    assert.equal(git("show", "HEAD:example.ts").stdout, "const value = 1;\n");
    assert.equal(readFileSync(path, "utf8"), "const value=3\n");

    writeFileSync(path, "const value = 3;\n");
    assert.equal(git("add", "example.ts").status, 0);
    assert.equal(git("commit", "-m", "clean commit").status, 0);
    assert.equal(git("status", "--porcelain", "example.ts").stdout, "");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
