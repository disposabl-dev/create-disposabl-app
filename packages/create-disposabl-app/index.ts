#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { lstatSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";
import * as p from "@clack/prompts";
import { version } from "./package.json";
import {
  features,
  platformDependencies,
  platforms,
  requiredFeatures,
  selectedFolders,
  selectFeatures,
  selectPlatforms,
  validateName,
  type DisposablConfig,
} from "./options";
import { createPlatformPrompt } from "./platform-prompt";
import { projectSetup } from "./project-setup";
import { createApp } from "./scaffold";
import { commitApp, install, setupApp } from "./setup";

type Options = {
  setup?: boolean;
  yes?: boolean;
  platforms?: string;
  features?: string;
  skipInstall?: boolean;
  json?: boolean;
  listOptions?: boolean;
};
const jsonOutput = process.argv.slice(2).includes("--json");
const program = new Command("create-disposabl-app")
  .description("Create a Disposabl starter. Web is always included.")
  .version(version, "-v, --version")
  .argument("[appname]", "App name and new directory")
  .option(
    "--platforms <ids>",
    "Comma-separated platform IDs; Web is always included",
  )
  .option(
    "--features <ids>",
    "Comma-separated feature IDs, or none (default: authentication)",
  )
  .option(
    "-y, --yes",
    "Skip prompts; include Web and authentication by default",
  )
  .option("--setup", "Sign in to Disposabl and configure a development preview")
  .option("--skip-install", "Create files without running bun install")
  .option(
    "--list-options",
    "List every platform and feature, including disabled choices",
  )
  .option(
    "--json",
    "Skip prompts and emit a JSON result or error; install logs go to stderr",
  )
  .helpOption("-h, --help")
  .addHelpText(
    "after",
    "\nPlatforms:\n  web (required), android, ios, api, mcp, cli, typescript-sdk\n  CLI and TypeScript SDK automatically include API.\n\nOptional features:\n  authentication, docs\n  Authentication is enabled by default. Use --features none to disable frontend authentication.\n\nExamples:\n  bun create disposabl-app@latest\n  bun create disposabl-app@latest my-app --yes\n  bun create disposabl-app@latest my-app --platforms web,android,ios,mcp --features docs --yes\n  bun create disposabl-app@latest my-app --platforms web --features none --skip-install --json\n  bun create disposabl-app@latest --list-options --json\n\nWithout a TTY, the CLI never prompts. Supply an app name.\nPlatform and feature choices are saved in disposabl.json.\nBackend authentication code is always included. Use --setup to create an app UUID and development environment through https://www.disposabl.dev.\n",
  )
  .configureOutput({ writeErr: () => {} })
  .exitOverride();

class Cancelled extends Error {}
const pathExists = (path: string) =>
  lstatSync(path, { throwIfNoEntry: false }) !== undefined;

function answer<T>(value: T): Exclude<T, symbol> {
  if (p.isCancel(value))
    throw new Cancelled("Cancelled. No files were created.");
  return value as Exclude<T, symbol>;
}

function showOptions(json: boolean) {
  if (json) {
    console.log(
      JSON.stringify(
        {
          platforms,
          platformDependencies,
          features,
          requiredFeatures,
          defaults: { platforms: ["web"], features: selectFeatures() },
          folders: {
            web: "apps/web",
            cli: "packages/cli",
            "typescript-sdk": "packages/sdk",
            android: "apps/mobile",
            ios: "apps/mobile",
            docs: "apps/docs",
          },
          configOnly: ["api", "mcp"],
        },
        null,
        2,
      ),
    );
    return;
  }
  console.log("Platforms\n");
  for (const option of platforms)
    console.log(
      "  " + option.id.padEnd(21) + option.label.padEnd(20) + option.status,
    );
  console.log(
    "\nOpenAI Plugin and Claude Code Plugin automatically include MCP.",
  );
  console.log("\nFeatures\n");
  for (const option of features)
    console.log("  " + option.id.padEnd(21) + option.hint);
  console.log(
    "\nWeb is always included. Authentication is enabled by default. Use --platforms and --features with the IDs above.",
  );
}

async function main() {
  program.parse();
  const options = program.opts<Options>();
  if (options.listOptions) return showOptions(Boolean(options.json));
  const interactive = Boolean(
    process.stdin.isTTY &&
    process.stdout.isTTY &&
    !p.isCI() &&
    !options.yes &&
    !options.json,
  );
  // Validate explicit selections before prompting or creating any files.
  let chosenPlatforms = selectPlatforms(options.platforms);
  let chosenFeatures = selectFeatures(options.features);
  let name: string | undefined = program.args[0];
  if (interactive) {
    if (!name)
      name = answer(
        await p.text({
          message: "App name",
          placeholder: "my-app",
          defaultValue: "my-app",
          validate: (value) => validateName(value ?? ""),
        }),
      );
  }
  if (!name)
    throw new Error(
      "Provide an app name in non-interactive mode. Example: bun create disposabl-app@latest my-app --platforms web --features none --yes",
    );
  const invalidName = validateName(name);
  if (invalidName) throw new Error(invalidName);
  let directory = resolve(name);
  if (options.setup && pathExists(join(directory, "disposabl.json"))) {
    const appId = await setupApp(directory, name);
    console.log(
      options.json
        ? JSON.stringify({ status: "configured", directory, appId })
        : `\nSetup complete.\n\n  cd ${name}\n  bun run dev\n`,
    );
    return;
  }
  let overwrite = false;
  if (pathExists(directory)) {
    overwrite =
      interactive &&
      answer(
        await p.confirm({
          message: `"${name}" already exists. Delete its contents and replace it?`,
          initialValue: false,
        }),
      );
    if (!overwrite) {
      const requestedName = name;
      let suffix = 2;
      do {
        const ending = `-${suffix++}`;
        name = requestedName.slice(0, 214 - ending.length) + ending;
        directory = resolve(name);
      } while (pathExists(directory));
      if (!options.json) p.log.info(`Using "${name}" instead.`);
    }
  }
  if (interactive && options.platforms === undefined) {
    const selected = answer((await createPlatformPrompt().prompt()) ?? []);
    chosenPlatforms = selectPlatforms(
      selected.length ? selected.join(",") : "web",
    );
  }
  if (interactive && options.features === undefined) {
    const selected = answer(
      await p.multiselect({
        message: "Choose optional features",
        initialValues: ["authentication"],
        options: features.map((feature) => ({
          value: feature.id,
          label: feature.label,
          hint: feature.hint,
        })),
        required: false,
      }),
    );
    chosenFeatures = selectFeatures(
      selected.length ? selected.join(",") : "none",
    );
  }
  const managedSetup =
    options.setup ??
    (interactive &&
      answer(
        await p.confirm({
          message: "Set up this app with Disposabl?",
          initialValue: false,
        }),
      ));
  const config: DisposablConfig = {
    version: version,
    platforms: chosenPlatforms,
    features: chosenFeatures,
  };
  const setup = options.json ? undefined : projectSetup(name, config);
  let installationStarted = false;
  try {
    if (spawnSync("git", ["--version"], { stdio: "ignore" }).status !== 0)
      throw new Error("Install Git first to create the app's initial commit.");
    const hasBun =
      spawnSync("bun", ["--version"], { stdio: "ignore" }).status === 0;
    if (!options.skipInstall && !hasBun)
      throw new Error(
        "Install Bun first, or pass --skip-install to create the files only.",
      );
    const template = fileURLToPath(
      new URL("./templates/default", import.meta.url),
    );
    await createApp(template, directory, name, config, overwrite);
    if (!options.skipInstall) {
      installationStarted = true;
      setup?.installing();
      await install(directory, Boolean(setup?.live));
    }
    if (hasBun) execFileSync("bun", ["fmt"], { cwd: directory, stdio: "pipe" });
    setup?.finish({
      installation: options.skipInstall ? "Skipped" : "Complete",
    });
  } catch (error) {
    setup?.finish({
      installation: installationStarted ? "Failed" : "Not started",
    });
    throw error;
  }
  execFileSync("git", ["init", "--initial-branch=main"], {
    cwd: directory,
    stdio: "pipe",
  });
  if (managedSetup) config.appId = await setupApp(directory, name);
  commitApp(directory);
  const folders = selectedFolders(config);
  if (options.json) {
    console.log(
      JSON.stringify(
        {
          status: "created",
          name,
          directory,
          configFile: "disposabl.json",
          ...config,
          folders,
          installed: !options.skipInstall,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("\nNext steps\n\n  cd " + name + "\n  bun run dev\n");
  }
}

try {
  await main();
} catch (error) {
  if (error instanceof CommanderError && error.exitCode === 0) {
    process.exitCode = 0;
  } else if (error instanceof Cancelled) {
    p.cancel(error.message);
    process.exitCode = 130;
  } else {
    const message = error instanceof Error ? error.message : String(error);
    if (jsonOutput) console.log(JSON.stringify({ status: "error", message }));
    else console.error("Error: " + message);
    process.exitCode = 1;
  }
}
