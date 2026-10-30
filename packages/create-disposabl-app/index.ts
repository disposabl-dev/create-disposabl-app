#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Command, CommanderError } from "commander";
import * as p from "@clack/prompts";
import { version } from "./package.json";
import {
  features,
  platformDependencies,
  platforms,
  selectedFolders,
  selectFeatures,
  selectPlatforms,
  validateName,
  type DisposablConfig,
} from "./options";
import { createPlatformPrompt } from "./platform-prompt";
import { projectSetup } from "./project-setup";
import { createProject } from "./scaffold";

type Options = {
  yes?: boolean;
  platforms?: string;
  features?: string;
  skipInstall?: boolean;
  json?: boolean;
  listOptions?: boolean;
};
const jsonOutput = process.argv.slice(2).includes("--json");
const program = new Command("create-disposabl-app")
  .description("Create an empty Disposabl starter. Web is always included.")
  .version(version, "-v, --version")
  .argument("[appname]", "App name and new directory")
  .option(
    "--platforms <ids>",
    "Comma-separated platform IDs; Web is always included",
  )
  .option(
    "--features <ids>",
    "Comma-separated feature IDs, or none (default: none)",
  )
  .option("-y, --yes", "Skip prompts; default to Web only and no features")
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
    "\nPlatforms:\n  web (required), android, ios, windows, linux, macos, mcp,\n  openai-plugin, claude-code-plugin\n  Either plugin automatically includes MCP.\n  Disabled: api, cli, python-sdk, typescript-sdk\n\nFeatures:\n  docs, blog, changelog, authentication\n  Authentication currently records a selection only.\n\nExamples:\n  bun create disposabl-app@latest\n  bun create disposabl-app@latest my-app --yes\n  bun create disposabl-app@latest my-app --platforms web,android,ios,mcp --features docs,authentication --yes\n  bun create disposabl-app@latest my-app --platforms web --features none --skip-install --json\n  bun create disposabl-app@latest --list-options --json\n\nWithout a TTY, the CLI never prompts. Supply an app name.\nPlatform and feature choices are saved in disposabl.json.\nApp folders contain empty package.json files. No appId or Convex deployment is created.\n",
  )
  .configureOutput({ writeErr: () => {} })
  .exitOverride();

class Cancelled extends Error {}
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
          defaults: { platforms: ["web"], features: [] },
          folders: {
            web: "apps/web",
            android: "apps/mobile",
            ios: "apps/mobile",
            windows: "apps/desktop",
            linux: "apps/desktop",
            macos: "apps/desktop",
            docs: "apps/docs",
            blog: "apps/blog",
            changelog: "apps/changelog",
          },
          configOnly: [
            "mcp",
            "openai-plugin",
            "claude-code-plugin",
            "authentication",
          ],
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
    "\nDefaults: Web only; no features. Use --platforms and --features with the IDs above.",
  );
}

async function install(directory: string, interactive: boolean) {
  await new Promise<void>((done, reject) => {
    const child = spawn("bun", ["install"], {
      cwd: directory,
      stdio: ["ignore", "pipe", "pipe"],
      env: { ...process.env, NODE_ENV: "development" },
    });
    let detail = "";
    const onData = (chunk: Buffer) => {
      detail = (detail + chunk.toString()).slice(-4000);
      if (!interactive) process.stderr.write(chunk);
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.once("error", reject);
    child.once("close", (code) =>
      code === 0
        ? done()
        : reject(
            new Error(
              "bun install failed. The project was created at " +
                directory +
                ". Run bun install there to retry.\n" +
                detail.trim(),
            ),
          ),
    );
  });
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
          validate: (value) =>
            validateName(value ?? "") ||
            (existsSync(resolve(value ?? ""))
              ? "That directory already exists. Choose a new name."
              : undefined),
        }),
      );
  }
  if (!name)
    throw new Error(
      "Provide an app name in non-interactive mode. Example: bun create disposabl-app@latest my-app --platforms web --features none --yes",
    );
  const invalidName = validateName(name);
  if (invalidName) throw new Error(invalidName);
  const directory = resolve(name);
  if (existsSync(directory))
    throw new Error(
      "Directory already exists: " +
        directory +
        ". Choose a new name; existing files are never overwritten.",
    );
  if (interactive && options.platforms === undefined) {
    const selected = answer((await createPlatformPrompt().prompt()) ?? []);
    chosenPlatforms = selectPlatforms(
      selected.length ? selected.join(",") : "web",
    );
  }
  if (interactive && options.features === undefined) {
    const selected = answer(
      await p.multiselect({
        message: "Choose features (optional)",
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
  const config: DisposablConfig = {
    version: version,
    platforms: chosenPlatforms,
    features: chosenFeatures,
  };
  const setup = options.json ? undefined : projectSetup(name, config);
  let installationStarted = false;
  try {
    if (
      !options.skipInstall &&
      spawnSync("bun", ["--version"], { stdio: "ignore" }).status !== 0
    )
      throw new Error(
        "Install Bun first, or pass --skip-install to create the files only.",
      );
    const template = fileURLToPath(
      new URL("./templates/default", import.meta.url),
    );
    await createProject(template, directory, name, config);
    if (!options.skipInstall) {
      installationStarted = true;
      setup?.installing();
      await install(directory, Boolean(setup?.live));
    }
    setup?.finish({
      installation: options.skipInstall ? "Skipped" : "Complete",
    });
  } catch (error) {
    setup?.finish({
      installation: installationStarted ? "Failed" : "Not started",
    });
    throw error;
  }
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
