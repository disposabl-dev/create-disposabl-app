import {
  chmod,
  lstat,
  readFile,
  rename,
  writeFile,
  rm,
} from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";

export function detectReference(directory = process.cwd()) {
  const git = (...args: string[]) =>
    spawnSync("git", args, { cwd: directory, encoding: "utf8" }).stdout?.trim();
  const branch = git("symbolic-ref", "--quiet", "--short", "HEAD");
  if (branch) return branch;
  const root = git("rev-parse", "--show-toplevel");
  const common = git("rev-parse", "--path-format=absolute", "--git-common-dir");
  const local = git("rev-parse", "--absolute-git-dir");
  if (root && common && local && common !== local) return basename(root);
  throw new Error(
    "Cannot detect a branch or worktree. Run inside the app's Git checkout or supply --reference.",
  );
}

type Development = {
  appId: string;
  name: string;
  reference: string;
  convexUrl: string;
  convexSiteUrl: string;
  deployKey: string;
};
async function updateEnv(
  file: string,
  values: Record<string, string>,
  remove: string[] = [],
) {
  const stat = await lstat(file).catch((error) => {
    if (error.code !== "ENOENT") throw error;
    return undefined;
  });
  if (stat && (!stat.isFile() || stat.isSymbolicLink()))
    throw new Error(`Refusing to replace non-regular file ${file}.`);
  const text = stat ? await readFile(file, "utf8") : "";
  const keys = new Set([...Object.keys(values), ...remove]);
  const lines = text
    .split("\n")
    .filter(
      (line) =>
        !keys.has(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=/.exec(line)?.[1] ?? ""),
    );
  const next =
    lines.join("\n").trimEnd() +
    "\n" +
    Object.entries(values)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
      .join("\n") +
    "\n";
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await writeFile(temporary, next, { flag: "wx", mode: 0o600 });
    await rename(temporary, file);
    await chmod(file, 0o600);
  } finally {
    await rm(temporary, { force: true });
  }
}
export async function configureDevelopment(
  directory: string,
  value: Development,
) {
  const root = resolve(directory);
  const config = JSON.parse(
    await readFile(join(root, "disposabl.json"), "utf8"),
  );
  if (
    config.appId !== value.appId ||
    !value.deployKey.startsWith(`dev:${value.name}|`)
  )
    throw new Error("Development credentials do not match this app.");
  if (
    !/^[a-z0-9-]+$/.test(value.name) ||
    value.convexUrl !== `https://${value.name}.convex.cloud` ||
    value.convexSiteUrl !== `https://${value.name}.convex.site`
  )
    throw new Error("Development URLs do not match the deployment.");
  const files = ["packages/backend/.env.local", "apps/web/.env.local"];
  if (config.platforms.some((p: string) => p === "android" || p === "ios"))
    files.push("apps/mobile/.env.local");
  for (const file of files) {
    const ignored = spawnSync("git", ["check-ignore", "--quiet", file], {
      cwd: root,
      stdio: "ignore",
    });
    const tracked = spawnSync("git", ["ls-files", "--error-unmatch", file], {
      cwd: root,
      stdio: "ignore",
    });
    if (ignored.status !== 0 || tracked.status !== 1)
      throw new Error(`${file} must be untracked and ignored by Git.`);
  }
  await updateEnv(
    join(root, files[0]!),
    {
      CONVEX_DEPLOY_KEY: value.deployKey,
      CONVEX_URL: value.convexUrl,
      CONVEX_SITE_URL: value.convexSiteUrl,
    },
    ["CONVEX_DEPLOYMENT"],
  );
  await updateEnv(join(root, files[1]!), {
    VITE_CONVEX_URL: value.convexUrl,
    VITE_CONVEX_SITE_URL: value.convexSiteUrl,
  });
  if (files[2])
    await updateEnv(join(root, files[2]), {
      EXPO_PUBLIC_CONVEX_URL: value.convexUrl,
      EXPO_PUBLIC_CONVEX_SITE_URL: value.convexSiteUrl,
    });
}

type Preview = {
  reference: string;
  stage?: string;
  appId: string;
  platforms: Record<
    string,
    {
      enabled: boolean;
      url?: string;
      latest?: {
        version?: string;
        status: string;
        reason?: string;
        run?: { url: string };
        githubReleaseUrl?: string | null;
        artifactUrl?: string | null;
        updateUrl?: string | null;
        url?: string | null;
      };
    }
  >;
};
export function formatPreview(preview: Preview | null) {
  if (!preview)
    return "Preview not found. Create it with disposabl previews token create --configure .";
  const lines = [
    `Preview: ${preview.reference}`,
    `App: ${preview.appId}`,
    `Stage: ${preview.stage ?? "building"}`,
  ];
  for (const [name, state] of Object.entries(preview.platforms)) {
    if (!state.enabled) {
      lines.push(`${name}: disabled`);
      continue;
    }
    const latest = state.latest;
    lines.push(
      `${name}: ${latest?.status ?? "not built"}${latest?.version ? ` (${latest.version})` : ["cli", "sdk"].includes(name) ? " (not published)" : ""}`,
    );
    for (const [label, url] of Object.entries({
      URL: state.url,
      Preview: latest?.url,
      Release: latest?.githubReleaseUrl,
      Download: latest?.artifactUrl,
      Update: latest?.updateUrl,
      "Workflow run": latest?.run?.url,
      Reason: latest?.reason,
    }))
      if (url) lines.push(`  ${label}: ${url}`);
  }
  return lines.join("\n");
}
