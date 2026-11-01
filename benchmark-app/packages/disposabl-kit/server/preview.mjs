import { appendFileSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const backend = resolve(root, "packages/backend");
const json = (path) => JSON.parse(readFileSync(path, "utf8"));
const output = (name, value) =>
  appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
function run(args, cwd = root, capture = false) {
  const result = spawnSync(args[0], args.slice(1), {
    cwd,
    env: process.env,
    encoding: "utf8",
    stdio: capture ? ["ignore", "pipe", "inherit"] : "inherit",
  });
  if (result.error || result.status)
    throw result.error || new Error(`${args[0]} ${args[1]} failed`);
  return result.stdout?.trim();
}

export function affectedPlatforms(
  paths,
  enabled,
  runner = "blacksmith-4vcpu-ubuntu-2404",
) {
  if (
    ![
      "blacksmith-2vcpu-ubuntu-2404",
      "blacksmith-4vcpu-ubuntu-2404",
      "blacksmith-8vcpu-ubuntu-2404",
    ].includes(runner)
  )
    throw new Error("Invalid Linux runner");
  const relevant = paths.filter(
    (path) => !/(^|\/)\.agents\//.test(path) && !/\.(md|mdx)$/.test(path),
  );
  const shared = relevant.some(
    (path) =>
      /^(bun.lock|package.json|disposabl.json|turbo.json|bunfig.toml|patches\/|\.github\/workflows\/pipeline.yml)/.test(
        path,
      ) || /^packages\/(?!backend\/|create-disposabl-app\/)/.test(path),
  );
  const mobile =
    shared || relevant.some((path) => path.startsWith("apps/mobile/"));
  const desktop =
    shared || relevant.some((path) => path.startsWith("apps/desktop/"));
  return {
    include: Object.entries({
      android: runner,
      ios: "blacksmith-6vcpu-macos-26",
      windows: "blacksmith-2vcpu-windows-2025",
      linux: "blacksmith-2vcpu-ubuntu-2404",
      macos: "blacksmith-6vcpu-macos-26",
    })
      .filter(
        ([platform]) =>
          enabled.includes(platform) &&
          (["android", "ios"].includes(platform) ? mobile : desktop),
      )
      .map(([platform, runner]) => ({
        platform,
        runner,
        directory: ["android", "ios"].includes(platform)
          ? "apps/mobile"
          : "apps/desktop",
      })),
  };
}

async function main() {
  const event = json(process.env.GITHUB_EVENT_PATH);
  const fork =
    event.pull_request &&
    event.pull_request.head.repo.full_name !== process.env.GITHUB_REPOSITORY;
  const target = event.pull_request
    ? ["--preview-name", process.env.CHANNEL]
    : ["--prod"];
  if (process.argv[2] === "web") {
    run(
      [
        "bun",
        "x",
        "--no-install",
        "--package",
        "@convex-dev/auth",
        "auth",
        "--keys-only",
        ...target,
      ],
      backend,
    );
    process.env.VITE_CONVEX_SITE_URL = process.env.CONVEX_SITE_URL;
    run(["bun", "run", "build", "--filter=!desktop"]);
    output("url", process.env.VITE_CONVEX_URL);
    output("site", process.env.CONVEX_SITE_URL);
    return;
  }
  if (fork) {
    Object.assign(process.env, {
      VITE_CONVEX_URL: "https://ci.invalid",
      VITE_CONVEX_SITE_URL: "https://ci.invalid",
    });
    run(["bun", "run", "build", "--filter=!desktop"]);
    output("matrix", JSON.stringify({ include: [] }));
    return;
  }
  run(
    [
      "bun",
      "x",
      "--no-install",
      "convex",
      "deploy",
      "--yes",
      ...(event.pull_request ? target : []),
      "--cmd-url-env-var-name",
      "VITE_CONVEX_URL",
      "--cmd",
      "bun ../disposabl-kit/server/preview.mjs web",
    ],
    backend,
  );
  run(
    [
      "bun",
      "x",
      "--no-install",
      "static-hosting",
      "upload",
      ...target,
      "--no-spa",
      "--dist",
      "../../apps/web/dist/client",
    ],
    backend,
  );
  let paths;
  if (event.pull_request) {
    paths = run(
      [
        "gh",
        "api",
        `repos/${process.env.GITHUB_REPOSITORY}/pulls/${event.number}/files?per_page=100`,
        "--paginate",
        "--jq",
        ".[] | .filename, (.previous_filename // empty)",
      ],
      root,
      true,
    ).split("\n");
  } else if (!event.before || /^0+$/.test(event.before))
    paths = ["disposabl.json"];
  else {
    run(["git", "fetch", "--depth=1", "origin", event.before]);
    paths = run(
      ["git", "diff", "--name-only", "--no-renames", event.before, event.after],
      root,
      true,
    ).split("\n");
  }
  output(
    "matrix",
    JSON.stringify(
      affectedPlatforms(
        paths,
        json(resolve(root, "disposabl.json")).platforms,
        process.env.CI_RUNNER,
      ),
    ),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await main();
