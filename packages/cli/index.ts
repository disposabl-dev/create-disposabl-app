#!/usr/bin/env node
import { runCli } from "./commands";
runCli().catch((error) => {
  console.error(error instanceof Error ? error.message : "Command failed.");
  process.exitCode = 1;
});
