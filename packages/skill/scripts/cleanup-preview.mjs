import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

const run = (command, args) =>
  execFileSync(command, args, { encoding: "utf8" }).trimEnd();

function cleanup(worktreePath, prNumber) {
  if (!worktreePath || !/^[1-9]\d*$/.test(prNumber ?? ""))
    throw new Error("Usage: bun cleanup-preview.mjs <worktree> <PR number>");

  const [primary, ...linked] = run("git", [
    "worktree",
    "list",
    "--porcelain",
    "-z",
  ])
    .split("\0\0")
    .filter(Boolean)
    .map((entry) => entry.split("\0"));
  const root = primary[0].slice("worktree ".length);
  const git = (...args) => run("git", ["-C", root, ...args]);
  const path = realpathSync(worktreePath);
  const entry = linked.find(([location]) => location === `worktree ${path}`);
  const branch = entry
    ?.find((field) => field.startsWith("branch refs/heads/"))
    ?.slice("branch refs/heads/".length);
  if (!branch || branch === "main")
    throw new Error("Select the linked worktree for the draft branch.");

  const remote = git("remote", "get-url", "origin");
  const repository =
    /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/.exec(
      remote,
    )?.[1];
  if (!repository) throw new Error("Expected a GitHub repository for origin.");

  const pull = JSON.parse(
    run("gh", [
      "pr",
      "view",
      prNumber,
      "--repo",
      repository,
      "--json",
      "state,isCrossRepository,baseRefName,headRefName,headRefOid",
    ]),
  );
  if (
    pull.state !== "MERGED" ||
    pull.isCrossRepository !== false ||
    pull.baseRefName !== "main" ||
    pull.headRefName !== branch ||
    pull.headRefOid !== run("git", ["-C", path, "rev-parse", "HEAD"])
  )
    throw new Error("The worktree must match the published PR's final commit.");

  // Git refuses locked worktrees and protects tracked and untracked changes.
  git("worktree", "remove", "--", path);
  console.log(`Removed published preview worktree ${path}`);
}

try {
  cleanup(...process.argv.slice(2));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
