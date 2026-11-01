import {
  cp,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { join } from "node:path";
import {
  selectedFolders,
  selectFeatures,
  type DisposablConfig,
} from "./options";

export async function createApp(
  template: string,
  destination: string,
  name: string,
  config: DisposablConfig,
  overwrite = false,
) {
  config = {
    ...config,
    features: selectFeatures(config.features.join(",") || "none"),
  };
  const folders = selectedFolders(config);
  for (const folder of folders) {
    if (!existsSync(join(template, folder, "package.json"))) {
      throw new Error(
        "The bundled starter is missing " +
          folder +
          "/package.json. Rebuild the CLI.",
      );
    }
  }
  // Overwrite is allowed only after explicit confirmation in the CLI.
  if (overwrite) await rm(destination, { recursive: true, force: true });
  // Refuse a destination that appeared after choosing an available name.
  await mkdir(destination);
  try {
    for (const entry of await readdir(template)) {
      await cp(join(template, entry), join(destination, entry), {
        recursive: true,
        force: false,
        errorOnExist: true,
      });
    }
    for (const entry of await readdir(join(destination, "apps"))) {
      if (!folders.includes("apps/" + entry))
        await rm(join(destination, "apps", entry), {
          recursive: true,
          force: true,
        });
    }
    if (existsSync(join(destination, "gitignore"))) {
      await rename(
        join(destination, "gitignore"),
        join(destination, ".gitignore"),
      );
    }
    const manifestPath = join(destination, "package.json");
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    manifest.name = name;
    await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
    await writeFile(
      join(destination, "disposabl.json"),
      JSON.stringify(config, null, 2) + "\n",
    );
  } catch (error) {
    // Only remove the directory created by this invocation, never an existing app.
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
  return folders;
}
