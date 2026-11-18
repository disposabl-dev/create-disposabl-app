import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join } from "node:path";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(
  new URL("../skill/scripts/cleanup-preview.mjs", import.meta.url),
);

test("preview cleanup removes only the published worktree and its generated files", () => {
  const fixture = realpathSync(
    mkdtempSync(join(tmpdir(), "disposabl-preview-cleanup-")),
  );
  const repo = join(fixture, "app");
  const draft = join(fixture, "draft with spaces");
  const other = join(fixture, "other draft");
  const git = (...args: string[]) =>
    execFileSync("git", ["-C", repo, ...args], { encoding: "utf8" }).trim();
  try {
    mkdirSync(repo);
    git("init", "-q", "-b", "main");
    git("remote", "add", "origin", "https://github.com/example/app.git");
    writeFileSync(join(repo, ".gitignore"), "node_modules/\n");
    git("add", ".gitignore");
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "-qm",
      "Initial",
    );
    git("worktree", "add", "-qb", "draft", draft);
    git("worktree", "add", "-qb", "other", other);
    for (const path of [draft, other, repo]) {
      mkdirSync(join(path, "node_modules"));
      writeFileSync(join(path, "node_modules", "cache"), "build output");
    }

    writeFileSync(
      join(fixture, "gh"),
      '#!/bin/sh\n[ "$1 $2 $3 $4 $5" = "pr view 12 --repo example/app" ] || exit 9\nprintf "%s" "$FIXTURE_PR"\n',
      { mode: 0o700 },
    );
    const merged = {
      state: "MERGED",
      isCrossRepository: false,
      baseRefName: "main",
      headRefName: "draft",
      headRefOid: git("rev-parse", "draft"),
    };
    const cleanup = (overrides: Partial<typeof merged> = {}, path = draft) =>
      Bun.spawnSync([process.execPath, script, path, "12"], {
        cwd: repo,
        env: {
          ...process.env,
          PATH: fixture + delimiter + process.env.PATH,
          FIXTURE_PR: JSON.stringify({ ...merged, ...overrides }),
        },
      });

    for (const pr of [
      { state: "OPEN" },
      { headRefOid: "other-commit" },
      { isCrossRepository: true },
    ]) {
      expect(cleanup(pr).exitCode).toBe(1);
      expect(existsSync(draft)).toBe(true);
    }
    expect(cleanup({}, repo).exitCode).toBe(1);
    writeFileSync(join(draft, "untracked.txt"), "keep my work");
    expect(cleanup().exitCode).toBe(1);
    expect(existsSync(join(draft, "untracked.txt"))).toBe(true);
    rmSync(join(draft, "untracked.txt"));
    git("worktree", "lock", draft);
    expect(cleanup().exitCode).toBe(1);
    git("worktree", "unlock", draft);

    expect(cleanup().exitCode).toBe(0);
    expect(existsSync(draft)).toBe(false);
    expect(existsSync(join(other, "node_modules", "cache"))).toBe(true);
    expect(existsSync(join(repo, "node_modules", "cache"))).toBe(true);
    expect(git("rev-parse", "draft")).toBe(merged.headRefOid);
  } finally {
    rmSync(fixture, { recursive: true, force: true });
  }
});
