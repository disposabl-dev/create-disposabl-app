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
  selectPlatforms,
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
    platforms: selectPlatforms(config.platforms.join(",")),
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
    if (!config.features.includes("authentication")) {
      // These are auth screens and starter examples, not backend capabilities.
      for (const path of [
        "packages/disposabl-kit/client/routes/_auth-pages",
        "packages/disposabl-kit/client/routes/consent.tsx",
        "apps/web/src/router/_authenticated/dashboard.api-keys.tsx",
        "apps/web/tests/auth-branches.test.tsx",
        "apps/mobile/src/app/(auth)",
        "apps/mobile/src/app/(authenticated)/account.tsx",
      ]) {
        await rm(join(destination, path), { recursive: true, force: true });
      }
      await writeFile(
        join(destination, "apps/web/src/router/_authenticated/dashboard.tsx"),
        `import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_providers/_authenticated/dashboard")({
  component: () => <h1>Dashboard</h1>,
});
`,
      );
      if (folders.includes("apps/mobile")) {
        await writeFile(
          join(destination, "apps/mobile/src/app/index.tsx"),
          'export { PublicHomeScreen as default } from "@disposabl/disposabl-kit/mobile";\n',
        );
        await writeFile(
          join(destination, "apps/mobile/src/app/(authenticated)/_layout.tsx"),
          'export { PublicLayout as default } from "@disposabl/disposabl-kit/mobile";\n',
        );
      }
    }
    if (!config.features.includes("docs")) {
      const webPackage = join(destination, "apps/web/package.json");
      const web = JSON.parse(await readFile(webPackage, "utf8"));
      delete web.devDependencies["@disposabl/docs"];
      await writeFile(webPackage, JSON.stringify(web, null, 2) + "\n");
      for (const file of [
        "apps/web/vite.config.ts",
        "packages/disposabl-kit/client/lib/prerender.ts",
        "packages/disposabl-kit/server/http.ts",
      ]) {
        const path = join(destination, file);
        const source = await readFile(path, "utf8");
        await writeFile(
          path,
          source.replace(
            /^[ \t]*\/\/ docs:start\r?\n[\s\S]*?^[ \t]*\/\/ docs:end\r?\n/gm,
            "",
          ),
        );
      }
      const turboPath = join(destination, "turbo.json");
      const turbo = JSON.parse(await readFile(turboPath, "utf8"));
      delete turbo.tasks["@disposabl/docs#build"];
      delete turbo.tasks["@disposabl/web#build"];
      await writeFile(turboPath, JSON.stringify(turbo, null, 2) + "\n");
      for (const file of ["docs.ts", "docs.test.ts"])
        await rm(join(destination, "packages/disposabl-kit/server/lib", file));
    }
    for (const kind of ["cli", "sdk"]) {
      const folder = join(destination, "packages", kind);
      if (!folders.includes(`packages/${kind}`)) {
        await rm(folder, { recursive: true, force: true });
        continue;
      }
      const packagePath = join(folder, "package.json");
      const client = JSON.parse(await readFile(packagePath, "utf8"));
      client.name = `${name}-${kind}`;
      delete client.repository;
      if (client.name.length > 214)
        throw new Error(
          "Project name is too long for generated package names.",
        );
      if (kind === "cli") client.bin = { [name]: "dist/index.js" };
      await writeFile(packagePath, JSON.stringify(client, null, 2) + "\n");
      const readme = join(folder, "README.md");
      if (existsSync(readme))
        await writeFile(
          readme,
          (await readFile(readme, "utf8")).replaceAll(
            `@disposabl/${kind}`,
            client.name,
          ),
        );
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
    if (folders.includes("apps/mobile")) {
      const appConfigPath = join(destination, "apps/mobile/app.json");
      const appConfig = JSON.parse(await readFile(appConfigPath, "utf8"));
      appConfig.expo.name = name;
      appConfig.expo.slug = name;
      await writeFile(appConfigPath, JSON.stringify(appConfig, null, 2) + "\n");
    }
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
