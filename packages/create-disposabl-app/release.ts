import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import semver from "semver";

type Registry = {
  versions: Record<string, { dist: { integrity: string } }>;
  "dist-tags": Record<string, string>;
};

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).trim();
const manifestPath = "packages/create-disposabl-app/package.json";
const manifest = () => Bun.file(manifestPath).json();
const source = process.env.GITHUB_SHA ?? "";
const releaseCommit = () =>
  git(
    "log",
    "origin/main",
    "--format=%H",
    "--fixed-strings",
    `--grep=Release-Source: ${source}`,
    "-1",
  );

async function registry(name: string): Promise<Registry> {
  const response = await globalThis.fetch(
    `https://registry.npmjs.org/${encodeURIComponent(name)}?release=${Date.now()}`,
    { signal: globalThis.AbortSignal.timeout(15_000) },
  );
  if (!response.ok) throw new Error(`npm registry returned ${response.status}`);
  return response.json();
}

export function nextVersion(requested: string, previous: string[]) {
  if (!semver.valid(requested)) throw new Error(`Invalid semver: ${requested}`);
  const stable = semver.rsort(
    previous.filter((v) => semver.valid(v) && !semver.prerelease(v)),
  )[0];
  const prerelease = semver.prerelease(requested);
  if (prerelease) {
    if (prerelease[0] !== "beta")
      throw new Error("Only -beta prereleases are supported.");
    if (previous.includes(requested))
      throw new Error(`Increment the already-used beta version ${requested}.`);
    if (stable && !semver.gt(requested, stable))
      throw new Error("Use a future version for a beta.");
    return requested;
  }
  return !stable || semver.gt(requested, stable)
    ? requested
    : semver.inc(stable, "patch")!;
}

async function prepare() {
  git("fetch", "origin", "main", "--tags");
  const resume = releaseCommit();
  if (resume) git("checkout", "--detach", resume);
  else if (git("rev-parse", "HEAD") !== git("rev-parse", "origin/main")) {
    console.log("A newer main commit will publish these changes.");
    return;
  }
  const pkg = await manifest();
  if (!resume) {
    const published = await registry(pkg.name);
    const commits = git(
      "log",
      "origin/main",
      "--format=%H",
      "--grep=^Release-Source: ",
    )
      .split("\n")
      .filter(Boolean);
    const reserved = commits.map((commit) => {
      // Releases before the workspace migration stored their manifest in cli/.
      const current = spawnSync("git", ["show", `${commit}:${manifestPath}`], {
        encoding: "utf8",
      });
      return JSON.parse(
        current.status === 0
          ? current.stdout
          : git("show", `${commit}:cli/package.json`),
      ).version;
    });
    pkg.version = nextVersion(pkg.version, [
      ...Object.keys(published.versions),
      ...reserved,
    ]);
    await writeFile(manifestPath, `${JSON.stringify(pkg, null, 2)}\n`);
    execFileSync("bun", ["install", "--lockfile-only"], {
      cwd: import.meta.dir,
      stdio: "inherit",
    });
  }
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `version=${pkg.version}\n`);
  }
  console.log(`Release version: ${pkg.version}${resume ? " (resuming)" : ""}`);
}

async function publish(artifact: string) {
  const pkg = await manifest();
  const beta = semver.prerelease(pkg.version)?.[0] === "beta";
  const channel = beta ? "beta" : "latest";
  const tag = `v${pkg.version}`;
  const integrity = `sha512-${createHash("sha512")
    .update(await readFile(artifact))
    .digest("base64")}`;
  let commit = releaseCommit();
  const published = await registry(pkg.name);
  const existing = published.versions[pkg.version];
  if (existing && (!commit || existing.dist.integrity !== integrity)) {
    throw new Error(
      `${pkg.version} is already published from another artifact.`,
    );
  }
  const current = published["dist-tags"][channel];
  if (!existing && current && semver.lt(pkg.version, current)) {
    throw new Error(
      `Refusing to move npm ${channel} backwards from ${current}.`,
    );
  }
  if (!commit) {
    git("config", "user.name", "github-actions[bot]");
    git(
      "config",
      "user.email",
      "41898282+github-actions[bot]@users.noreply.github.com",
    );
    git("add", manifestPath, "packages/create-disposabl-app/bun.lock");
    git(
      "commit",
      "--allow-empty",
      "-m",
      `release: ${tag} [skip ci]`,
      "-m",
      `Release-Source: ${source}`,
    );
    // Reject a concurrent main update instead of overwriting anyone's code.
    git("push", "--atomic", "origin", "HEAD:refs/heads/main");
    commit = git("rev-parse", "HEAD");
  }
  if (!existing) {
    execFileSync(
      "npm",
      ["publish", artifact, "--access", "public", "--tag", channel],
      { stdio: "inherit" },
    );
  }
  const deadline = Date.now() + 10 * 60_000;
  while (true) {
    const available = (await registry(pkg.name)).versions[pkg.version];
    if (available) {
      if (available.dist.integrity !== integrity)
        throw new Error("Published artifact integrity does not match.");
      break;
    }
    if (Date.now() >= deadline)
      throw new Error(
        "npm is still processing the release; rerun this workflow later.",
      );
    console.log(`Waiting for npm to expose ${pkg.version}...`);
    await delay(10_000);
  }
  git("fetch", "origin", "--tags");
  const tagged = spawnSync(
    "git",
    ["rev-parse", "--verify", `refs/tags/${tag}^{commit}`],
    { encoding: "utf8" },
  );
  if (tagged.status === 0 && tagged.stdout.trim() !== commit)
    throw new Error(`${tag} points to another commit.`);
  if (spawnSync("gh", ["release", "view", tag]).status !== 0) {
    const latest = (await registry(pkg.name))["dist-tags"].latest;
    execFileSync(
      "gh",
      [
        "release",
        "create",
        tag,
        "--target",
        commit,
        "--title",
        tag,
        "--generate-notes",
        "--notes",
        `Published [${pkg.name}@${pkg.version}](https://www.npmjs.com/package/${pkg.name}/v/${pkg.version}).`,
        ...(beta
          ? ["--prerelease", "--latest=false"]
          : [`--latest=${pkg.version === latest}`]),
      ],
      { stdio: "inherit" },
    );
  }
  console.log(
    `Released ${pkg.name}@${pkg.version} to npm ${channel} and GitHub.`,
  );
}

if (import.meta.main) {
  process.chdir(resolve(import.meta.dir, "../.."));
  if (!source || process.env.GITHUB_ACTIONS !== "true")
    throw new Error("Run releases through GitHub Actions.");
  if (process.argv[2] === "prepare") await prepare();
  else if (process.argv[2] === "publish" && process.argv[3])
    await publish(process.argv[3]);
  else throw new Error("Expected prepare or publish <tarball>.");
}
