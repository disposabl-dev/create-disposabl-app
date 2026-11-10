import { expect, test } from "bun:test";
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
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

test("installed hook checks the index without changing partially staged files", () => {
  const dir = mkdtempSync(join(tmpdir(), "disposabl-hooks-"));
  const root = resolve(import.meta.dir, "../..");
  const run = (...args: string[]) =>
    spawnSync(args[0], args.slice(1), { cwd: dir, encoding: "utf8" });
  const git = (...args: string[]) => run("git", ...args);
  try {
    expect(git("init", "-q").status).toBe(0);
    expect(git("config", "user.name", "Hook Test").status).toBe(0);
    expect(
      git("config", "user.email", "hook-test@example.invalid").status,
    ).toBe(0);
    mkdirSync(join(dir, ".githooks"));
    for (const file of ["install", "pre-commit"]) {
      copyFileSync(join(root, ".githooks", file), join(dir, ".githooks", file));
    }
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ scripts: { "hooks:install": ".githooks/install" } }),
    );
    expect(git("config", "core.hooksPath", "custom-hooks").status).toBe(0);
    expect(run("bun", "run", "hooks:install").status).not.toBe(0);
    expect(git("config", "--get", "core.hooksPath").stdout.trim()).toBe(
      "custom-hooks",
    );
    expect(git("config", "--unset", "core.hooksPath").status).toBe(0);
    const existing = join(dir, ".git/hooks/pre-push");
    writeFileSync(existing, "#!/bin/sh\nexit 0\n");
    chmodSync(existing, 0o755);
    expect(run("bun", "run", "hooks:install").status).not.toBe(0);
    expect(git("config", "--get", "core.hooksPath").status).toBe(1);
    expect(readFileSync(existing, "utf8")).toBe("#!/bin/sh\nexit 0\n");
    rmSync(existing);
    expect(run("bun", "run", "hooks:install").status).toBe(0);
    expect(git("config", "--get", "core.hooksPath").stdout.trim()).toBe(
      ".githooks",
    );

    const path = join(dir, "example.ts");
    writeFileSync(path, "const value=1\n");
    expect(git("add", "example.ts").status).toBe(0);
    const unstaged = "const value = 2;\n";
    writeFileSync(path, unstaged);
    const failure = git("commit", "-m", "bad staged formatting");
    expect(failure.status).not.toBe(0);
    expect(failure.stdout + failure.stderr).toContain("example.ts");
    expect(git("show", ":example.ts").stdout).toBe("const value=1\n");
    expect(readFileSync(path, "utf8")).toBe(unstaged);

    writeFileSync(path, "const value = 1;\n");
    expect(git("add", "example.ts").status).toBe(0);
    writeFileSync(path, "const value=3\n");
    const success = git("commit", "-m", "valid staged formatting");
    expect(success.status).toBe(0);
    expect(git("show", "HEAD:example.ts").stdout).toBe("const value = 1;\n");
    expect(readFileSync(path, "utf8")).toBe("const value=3\n");

    writeFileSync(path, "const value = 3;\n");
    expect(git("add", "example.ts").status).toBe(0);
    expect(git("commit", "-m", "clean commit").status).toBe(0);
    expect(git("status", "--porcelain", "example.ts").stdout).toBe("");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
