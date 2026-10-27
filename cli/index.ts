#!/usr/bin/env node
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
import { Command } from "commander";
import prompts from "prompts";
import { version } from "./package.json";

const program = new Command("create-disposabl-app")
  .description("Create a Disposabl app from the bundled starter.")
  .version(version, "-v, --version")
  .argument("[appname]", "Name of the new app")
  .option("-y, --yes", "Use defaults without asking questions")
  .option("--docs", "Include Docs")
  .option("--skip-install", "Skip bun install")
  .helpOption("-h, --help")
  .parse();

const validName = (name: string) =>
  /^[a-z0-9][a-z0-9._-]*$/.test(name) &&
  name.length <= 214 &&
  !["node_modules", "favicon.ico"].includes(name);

try {
  const options = program.opts();
  let name = program.args[0];
  let docs = Boolean(options.docs);
  if (process.stdin.isTTY && !options.yes) {
    const answers = await prompts(
      [
        {
          type: name ? null : "text",
          name: "name",
          message: "What is your project named?",
          initial: "my-app",
          validate: (value) =>
            validName(value) || "Use a lowercase app name without spaces.",
        },
        {
          type: "multiselect",
          name: "platforms",
          message: "Which platforms?",
          choices: [
            {
              title: "Web (required)",
              value: "web",
              selected: true,
              disabled: true,
            },
          ],
          min: 1,
          warn: "Web is required.",
          onRender(this: { value: { value: string; selected: boolean }[] }) {
            for (const choice of this.value) {
              if (choice.value === "web") choice.selected = true;
            }
          },
          hint: "Web is required. Press Enter to continue.",
        },
        {
          type: options.docs ? null : "multiselect",
          name: "features",
          message: "Which features?",
          choices: [{ title: "Docs", value: "docs" }],
          hint: "Space to select. Enter to continue without optional features.",
        },
      ],
      {
        onCancel: () => {
          console.log("Cancelled.");
          process.exit(0);
        },
      },
    );
    name ??= answers.name;
    docs ||= answers.features?.includes("docs") ?? false;
  }
  if (!name || !validName(name))
    throw new Error("Provide a lowercase app name, or run with --help.");
  if (!options.skipInstall && spawnSync("bun", ["--version"]).status !== 0)
    throw new Error("Install Bun from https://bun.com first.");
  const dir = resolve(name);
  await mkdir(dir);
  console.log(
    `\nCreating a new Disposabl app in ${dir}.\n\nUsing bun.\n\nPlatform: Web\nFeatures: ${docs ? "Docs" : "None"}\n`,
  );
  const template = fileURLToPath(
    new URL("./templates/default", import.meta.url),
  );
  for (const file of await readdir(template)) {
    if (file === "docs" && !docs) continue;
    await cp(resolve(template, file), resolve(dir, file), {
      recursive: true,
      force: false,
      errorOnExist: true,
    });
  }
  await rename(resolve(dir, "gitignore"), resolve(dir, ".gitignore"));
  const manifestPath = resolve(dir, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.name = name;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  if (!options.skipInstall) {
    await new Promise<void>((done, reject) => {
      const child = spawn("bun", ["install"], {
        cwd: dir,
        stdio: "inherit",
        env: { ...process.env, NODE_ENV: "development" },
      });
      child.once("error", reject);
      child.once("close", (code) =>
        code === 0
          ? done()
          : reject(new Error(`Run bun install inside ${name} to retry.`)),
      );
    });
  }
  console.log(
    `\nSuccess! Created ${name} at ${dir}\n\nGet started:\n\n  cd ${name}\n${options.skipInstall ? "  bun install\n" : ""}  bun run dev\n`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
