#!/usr/bin/env node
import { parseArgs } from "node:util";
import { createApp } from "./create-app.ts";
import { version } from "./package.json";

const help = `Usage: create-disposabl-app <appname> [options]

Create a Disposabl app from the bundled starter template.

Options:
  -h, --help       Show this help message
  -v, --version    Show the CLI version
  --skip-install   Copy the starter without running bun install

Examples:
  bun create disposabl-app@latest my-app
  npx create-disposabl-app@latest my-app
  npx create-disposabl-app@latest --help

The generated app uses Bun. Install it from https://bun.com.
`;

try {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
      "skip-install": { type: "boolean" },
    },
  });
  if (values.help) console.log(help);
  else if (values.version) console.log(version);
  else if (positionals.length !== 1) {
    console.error(help);
    process.exitCode = 1;
  } else {
    await createApp(positionals[0], { skipInstall: values["skip-install"] });
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
