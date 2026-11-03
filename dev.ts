import { readFile, writeFile, access } from "node:fs/promises";
import { basename, dirname, join } from "node:path";
import { parseEnv } from "node:util";

const root = import.meta.dir;
const backend = join(root, "packages/backend");
const read = (path: string) => readFile(path, "utf8").catch(() => "");
const backendEnv = () => read(join(backend, ".env.local")).then(parseEnv);
let env = await backendEnv();
const config = JSON.parse(await read(join(root, "disposabl.json")));
if (!env.CONVEX_DEPLOY_KEY && (!env.CONVEX_DEPLOYMENT || config.appId)) {
  console.log("Setting up this app through your Disposabl connections…");
  const configure = Bun.spawn(
    ["bun", "create", "disposabl-app@latest", basename(root), "--yes"],
    {
      cwd: dirname(root),
      stdin: "inherit",
      stdout: "inherit",
      stderr: "inherit",
    },
  );
  if (await configure.exited)
    throw new Error(
      "Disposabl setup did not finish. Your files are saved; run bun run dev to resume.",
    );
  env = await backendEnv();
  if (!env.CONVEX_DEPLOY_KEY?.startsWith("dev:"))
    throw new Error("Disposabl setup must provide a scoped development token.");
}
if (env.CONVEX_DEPLOY_KEY && !env.CONVEX_DEPLOY_KEY.startsWith("dev:"))
  throw new Error(
    "Local development requires a development token, not production or CI credentials.",
  );
const url = env.CONVEX_URL;
const site =
  env.CONVEX_SITE_URL || url?.replace(/\.convex\.cloud$/, ".convex.site");
if (!url || !site)
  throw new Error(
    "Configure CONVEX_URL and CONVEX_SITE_URL in packages/backend/.env.local.",
  );
for (const [app, prefix] of [
  ["web", "VITE"],
  ["mobile", "EXPO_PUBLIC"],
]) {
  const directory = join(root, "apps", app);
  if (
    !(await access(directory)
      .then(() => true)
      .catch(() => false))
  )
    continue;
  const path = join(directory, ".env.local");
  const lines = (await read(path))
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith(`${prefix}_CONVEX_URL=`) &&
        !line.startsWith(`${prefix}_CONVEX_SITE_URL=`),
    );
  await writeFile(
    path,
    `${lines.join("\n").trim()}\n${prefix}_CONVEX_URL=${url}\n${prefix}_CONVEX_SITE_URL=${site}\n`,
  );
}
