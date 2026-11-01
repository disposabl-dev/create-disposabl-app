import { $ } from "bun";
import { dirname, resolve } from "node:path";
import { parseEnv } from "node:util";

const root = resolve(import.meta.dir, "../../..");
const backend = `${root}/packages/backend`;
const read = async (path) =>
  (await Bun.file(path).exists()) ? parseEnv(await Bun.file(path).text()) : {};
const save = async (path, values) => {
  const previous = await read(path);
  if (Object.entries(values).every(([key, value]) => previous[key] === value))
    return;
  process.umask(0o077);
  await Bun.write(
    path,
    Object.entries({ ...previous, ...values })
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => `${key}=${JSON.stringify(value)}\n`)
      .join(""),
  );
};

$.cwd(root);
if ((await $`git rev-parse --git-dir`.quiet().nothrow()).exitCode !== 0)
  await $`git init --initial-branch=main`.quiet();
const branch = (await $`git branch --show-current`.text()).trim();
if (!branch) throw new Error("Create a named Git branch before running dev.");
const original = dirname(
  (
    await $`git rev-parse --path-format=absolute --git-common-dir`.text()
  ).trim(),
);
const key =
  process.env.CONVEX_DEPLOY_KEY ??
  (await read(`${root}/.env.local`)).CONVEX_DEPLOY_KEY ??
  (await read(`${original}/.env.local`)).CONVEX_DEPLOY_KEY;
const match = key?.match(/^preview:([\w-]+):([\w-]+)\|[A-Za-z0-9_+/=-]+$/);
if (!match)
  throw new Error(
    "Set CONVEX_DEPLOY_KEY to the project preview key in root .env.local.",
  );
let saved = await read(`${backend}/.env.local`);
if (
  saved.DISPOSABL_PREVIEW_BRANCH !== branch ||
  saved.CONVEX_SELF_HOSTED_ADMIN_KEY !== key ||
  !saved.CONVEX_SELF_HOSTED_URL
) {
  // Convex CLI's create-or-reuse API. Explicit URL/key config lets native `convex dev` use the preview.
  const response = await fetch(
    "https://api.convex.dev/api/claim_preview_deployment",
    {
      method: "POST",
      redirect: "error",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        projectSelection: {
          kind: "teamAndProjectSlugs",
          teamSlug: match[1],
          projectSlug: match[2],
        },
        identifier: branch,
        reuse: true,
      }),
    },
  );
  if (!response.ok)
    throw new Error(`Preview setup failed (${response.status}).`);
  const { instanceUrl, adminKey } = await response.json();
  if (!/^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(instanceUrl) || !adminKey)
    throw new Error("Invalid preview credentials returned by Convex.");
  await $`bun --no-env-file node_modules/@convex-dev/auth/dist/cli/init.js --keys-only --preview-name ${branch}`
    .cwd(backend)
    .env({ ...process.env, CONVEX_DEPLOY_KEY: key });
  saved = {
    DISPOSABL_PREVIEW_BRANCH: branch,
    CONVEX_SELF_HOSTED_URL: instanceUrl,
    CONVEX_SELF_HOSTED_ADMIN_KEY: adminKey,
  };
  await save(`${backend}/.env.local`, {
    ...saved,
    CONVEX_DEPLOY_KEY: undefined,
    CONVEX_DEPLOYMENT_TOKEN: undefined,
    CONVEX_DEPLOYMENT: undefined,
  });
}
for await (const manifest of new Bun.Glob("apps/*/package.json").scan({
  cwd: root,
  absolute: true,
}))
  await save(`${dirname(manifest)}/.env.local`, {
    VITE_CONVEX_URL: saved.CONVEX_SELF_HOSTED_URL,
    VITE_CONVEX_SITE_URL: saved.CONVEX_SELF_HOSTED_URL.replace(
      /\.cloud$/,
      ".site",
    ),
  });
console.log(`Using preview ${branch}.`);
