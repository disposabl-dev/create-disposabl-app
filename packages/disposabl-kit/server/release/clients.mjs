import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, realpathSync } from "node:fs";
import { basename, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyzeCommits as conventional } from "@semantic-release/commit-analyzer";
import { verifyMetadata } from "./verify-metadata.mjs";

const contract = "packages/backend/generated/openapi.json";
const git = (cwd, ...args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();

/** Independent tags and release decisions, using the starter's semantic-release workflow. */
export function clientRelease(name) {
  return {
    branches: ["main"],
    tagFormat: `${name}@\${version}`,
    plugins: [
      fileURLToPath(import.meta.url),
      [
        "@semantic-release/release-notes-generator",
        { preset: "conventionalcommits" },
      ],
      "@semantic-release/npm",
      ["@semantic-release/exec", { prepareCmd: "bun run build" }],
      [
        "@semantic-release/github",
        { successComment: false, failComment: false, releasedLabels: false },
      ],
    ],
  };
}

export async function analyzeCommits(_, context) {
  const { cwd, lastRelease, commits } = context;
  const root = git(cwd, "rev-parse", "--show-toplevel");
  const folder = `${relative(realpathSync(root), realpathSync(cwd))}/`;
  const shared = ["packages/disposabl-kit/server/release/", contract];
  const relevant = commits.filter((commit) =>
    git(
      cwd,
      "diff-tree",
      "--root",
      "--no-commit-id",
      "--name-only",
      "-r",
      commit.hash,
    )
      .split("\n")
      .some(
        (path) =>
          path.startsWith(folder) ||
          shared.some((prefix) => path.startsWith(prefix)),
      ),
  );
  if (!relevant.length) return null;
  let release = await conventional(
    {
      preset: "conventionalcommits",
      releaseRules: [
        { breaking: true, release: "major" },
        { type: "feat", release: "minor" },
        { release: "patch" },
      ],
    },
    { ...context, commits: relevant },
  );
  if (lastRelease.gitHead) {
    const previous = JSON.parse(
      git(root, "show", `${lastRelease.gitHead}:${contract}`),
    );
    const current = JSON.parse(readFileSync(resolve(root, contract), "utf8"));
    const before = previous.info.version.split(".").map(Number);
    const after = current.info.version.split(".").map(Number);
    if (after[0] > before[0]) release = "major";
    else if (after[1] > before[1] && release !== "major") release = "minor";
  }
  context.logger.log(
    "%s: %d relevant commits, release %s",
    basename(cwd),
    relevant.length,
    release,
  );
  return release;
}

// Use semantic-release's original repository URL, before it injects Git credentials.
export function publicRepositoryUrl(original) {
  if (typeof original !== "string")
    throw new Error("Missing original repository URL");
  const scp = /^(?:[^@/]+@)?([^:/]+):(.+)$/.exec(original);
  const input =
    scp && !original.includes("://")
      ? `https://${scp[1]}/${scp[2]}`
      : original.replace(/^git\+/, "");
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error("Invalid repository URL");
  }
  if (!["http:", "https:", "ssh:"].includes(url.protocol))
    throw new Error("Unsupported repository URL");
  if (url.protocol === "ssh:") return `git+https://${url.host}${url.pathname}`;
  url.username = "";
  url.password = "";
  url.search = "";
  url.hash = "";
  return `git+${url.href}`;
}

// Generated apps acquire their own repository metadata at release time.
export function verifyConditions(_, { cwd, options }) {
  const path = resolve(cwd, "package.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  manifest.repository = {
    type: "git",
    url: publicRepositoryUrl(options.originalRepositoryURL),
    directory: `packages/${basename(cwd)}`,
  };
  verifyMetadata(manifest);
  writeFileSync(path, JSON.stringify(manifest, null, 2) + "\n");
}
