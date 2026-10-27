import { spawn, spawnSync } from "node:child_process";
import {
  cp,
  mkdir,
  readdir,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export async function createApp(
  name: string | undefined,
  { cwd = process.cwd(), skipInstall = false } = {},
) {
  if (!name || !/^[a-z0-9][a-z0-9._-]*$/.test(name) || name.length > 214) {
    throw new Error(
      "Choose a folder name using lowercase letters, numbers, dots, underscores, or hyphens.",
    );
  }
  if (!skipInstall && spawnSync("bun", ["--version"]).status !== 0) {
    throw new Error("Install Bun from https://bun.com before creating an app.");
  }

  const dir = resolve(cwd, name);
  // Claim the destination atomically. Never overwrite an existing path.
  await mkdir(dir);
  console.log(`Creating ${name}...`);
  const template = fileURLToPath(
    new URL("./templates/default", import.meta.url),
  );
  await Promise.all(
    (await readdir(template)).map((file) =>
      cp(resolve(template, file), resolve(dir, file), {
        recursive: true,
        force: false,
        errorOnExist: true,
      }),
    ),
  );
  await rename(resolve(dir, "gitignore"), resolve(dir, ".gitignore"));

  const manifestPath = resolve(dir, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.name = name;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  if (!skipInstall) {
    await new Promise<void>((resolveInstall, reject) => {
      const install = spawn("bun", ["install"], {
        cwd: dir,
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "development" },
      });
      install.once("error", reject);
      install.once("close", (code) => {
        if (code === 0) resolveInstall();
        else {
          reject(
            new Error(
              `Dependencies could not be installed. Run bun install inside ${name} to retry.`,
            ),
          );
        }
      });
    });
  }
  console.log(
    `\nYour app is ready.\n\n  cd ${name}\n${skipInstall ? "  bun install\n" : ""}  bun run dev\n`,
  );
  return dir;
}
