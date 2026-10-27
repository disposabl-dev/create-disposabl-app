#!/usr/bin/env bun
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { downloadTemplate } from "giget";

export async function createApp(name, source = "gh:disposabl-dev/create-disposabl-app#main") {
  if (!name || !/^[a-z0-9][a-z0-9._-]*$/.test(name) || name.length > 214) {
    throw new Error("Choose a folder name using lowercase letters, numbers, dots, underscores, or hyphens.");
  }

  const dir = resolve(name);
  // Claim the destination before downloading. Never overwrite an existing path.
  await mkdir(dir);
  console.log(`Creating ${name}...`);
  await downloadTemplate(source, {
    dir,
    force: true,
    ignore: (path) => path === "cli" || path.startsWith("cli/") || path === ".github/workflows/publish.yml",
  });

  const manifestPath = resolve(dir, "package.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.name = name;
  manifest.private = true;
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(resolve(dir, "README.md"), `# ${name}\n\nStart the development server:\n\n\`\`\`sh\nbun run dev\n\`\`\`\n`);

  const install = Bun.spawn([process.execPath, "install"], {
    cwd: dir,
    stdin: "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  if (await install.exited !== 0) {
    throw new Error(`Dependencies could not be installed. Run bun install inside ${name} to retry.`);
  }
  console.log(`\nYour app is ready.\n\n  cd ${name}\n  bun run dev\n`);
  return dir;
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 1 && ["--help", "-h"].includes(args[0])) {
    console.log("Usage: bun create disposabl-app@latest <appname>");
  } else if (args.length !== 1 || args[0].startsWith("-")) {
    console.error("Usage: bun create disposabl-app@latest <appname>");
    process.exitCode = 1;
  } else {
    try {
      await createApp(args[0]);
    } catch (error) {
      console.error(`Could not create app: ${error.message}`);
      process.exitCode = 1;
    }
  }
}
