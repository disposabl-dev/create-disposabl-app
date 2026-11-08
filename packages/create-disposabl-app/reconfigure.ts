import {
  lstat,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { basename, dirname, join, resolve, sep } from "node:path";
import {
  selectFeatures,
  selectPlatforms,
  type DisposablConfig,
} from "./options";
import { createApp } from "./scaffold";
import {
  mergePurchasesManifest,
  nativeBillingPath,
  nativeBillingTest,
  omitMobilePayments,
} from "./mobile-payments";

async function files(root: string, path = ""): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(join(root, path), {
    withFileTypes: true,
  })) {
    const relative = join(path, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Symlink in starter: ${relative}`);
    if (entry.isDirectory()) result.push(...(await files(root, relative)));
    else if (entry.isFile()) result.push(relative);
    else throw new Error(`Unsupported starter entry: ${relative}`);
  }
  return result;
}

async function safeRead(
  root: string,
  path: string,
): Promise<Buffer | undefined> {
  const base = resolve(root);
  if ((await lstat(base)).isSymbolicLink())
    throw new Error(`Refusing symlink: ${base}`);
  const target = resolve(base, path);
  if (!target.startsWith(base + sep)) throw new Error(`Unsafe path: ${path}`);
  let current = base;
  for (const part of path.split(sep)) {
    current = join(current, part);
    const stat = await lstat(current).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined;
      throw error;
    });
    if (!stat) return undefined;
    if (stat.isSymbolicLink()) throw new Error(`Refusing symlink: ${current}`);
  }
  return readFile(target);
}

/** Restore only scaffold changes introduced by newly selected options. */
export async function reconfigureApp(
  template: string,
  directory: string,
  version: string,
  options: { platforms?: string; features?: string },
): Promise<DisposablConfig> {
  const configPath = "disposabl.json";
  const raw = await safeRead(directory, configPath);
  if (!raw) throw new Error("Missing disposabl.json.");
  const existing = JSON.parse(raw.toString()) as DisposablConfig;
  if (existing.version !== version)
    throw new Error(
      `App template version ${existing.version} differs from generator ${version}; use the matching generator version before reconfiguring.`,
    );
  if (!Array.isArray(existing.platforms) || !Array.isArray(existing.features))
    throw new Error("Invalid selections in disposabl.json.");
  const oldPlatforms = selectPlatforms(existing.platforms.join(","));
  if (
    !existing.desktopId &&
    oldPlatforms.some((p) => ["macos", "windows", "linux"].includes(p))
  )
    throw new Error(
      "This desktop project has no native identity. Create a fresh starter before its first installation.",
    );
  const oldFeatures = selectFeatures(existing.features.join(",") || "none");
  const config = {
    ...existing,
    desktopId: existing.desktopId ?? randomUUID().replaceAll("-", ""),
    platforms:
      options.platforms === undefined
        ? oldPlatforms
        : selectPlatforms(options.platforms),
    features:
      options.features === undefined
        ? oldFeatures
        : selectFeatures(options.features),
  };
  const combined = {
    ...config,
    platforms: selectPlatforms(
      [...oldPlatforms, ...config.platforms].join(","),
    ),
    features: selectFeatures(
      [...oldFeatures, ...config.features].join(",") || "none",
    ),
  };
  const manifest = await safeRead(directory, "package.json");
  if (!manifest) throw new Error("Missing package.json.");
  const name = JSON.parse(manifest.toString()).name as string;
  if (typeof name !== "string" || !/^[a-z0-9][a-z0-9._-]*$/.test(name))
    throw new Error("Invalid app name in package.json.");
  // Check the template before createApp copies it, including nested symlinks.
  await files(template);
  const temp = await mkdtemp(join(tmpdir(), "disposabl-reconfigure-"));
  try {
    const before = join(temp, "before");
    const after = join(temp, "after");
    const expandedBefore =
      combined.platforms.length === oldPlatforms.length
        ? before
        : join(temp, "expanded-before");
    await createApp(template, before, name, {
      ...existing,
      desktopId: config.desktopId,
      platforms: oldPlatforms,
      features: oldFeatures,
    });
    await createApp(template, after, name, combined);
    if (expandedBefore !== before)
      await createApp(template, expandedBefore, name, {
        ...existing,
        desktopId: config.desktopId,
        platforms: combined.platforms,
        features: oldFeatures,
      });
    if (
      oldFeatures.includes("payments") &&
      !config.features.includes("payments")
    )
      await omitMobilePayments(after);
    const oldFiles = new Set(await files(before));
    const nextFiles = new Set(await files(after));
    const changes: { path: string; content?: Buffer }[] = [];
    if (
      oldFeatures.includes("payments") &&
      !config.features.includes("payments")
    ) {
      const billing = join(directory, nativeBillingPath);
      const stat = await lstat(billing).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code === "ENOENT") return undefined;
          throw error;
        },
      );
      if (stat?.isSymbolicLink())
        throw new Error(`Refusing symlink: ${billing}`);
      if (stat)
        for (const path of await files(billing)) {
          if (!oldFiles.has(nativeBillingPath + path))
            throw new Error(
              `Cannot disable payments: ${nativeBillingPath + path} is a custom billing file. No files were changed.`,
            );
        }
    }
    for (const path of nextFiles) {
      if (path === configPath) continue;
      const next = await readFile(join(after, path));
      let prior = oldFiles.has(path)
        ? await readFile(join(before, path))
        : undefined;
      const current = await safeRead(directory, path);
      // A previously disabled platform may still have its generated files.
      // Compare them against the old features before restoring new ones.
      if (!prior && current)
        prior = await readFile(join(expandedBefore, path)).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code === "ENOENT") return undefined;
            throw error;
          },
        );
      if (prior?.equals(next)) continue;
      if (!current) {
        if (prior)
          throw new Error(
            `Cannot reconfigure: ${path} was removed or customized. Restore the matching starter file and retry.`,
          );
        changes.push({ path, content: next });
      } else if (current.equals(next)) continue;
      else if (!prior)
        continue; // Existing user files always win over restored files.
      else if (current.equals(prior)) changes.push({ path, content: next });
      else {
        const merged =
          basename(path) === "package.json"
            ? mergePurchasesManifest(prior, next, current)
            : undefined;
        if (merged) changes.push({ path, content: merged });
        else
          throw new Error(
            `Cannot reconfigure: ${path} conflicts with the starter changes. Reconcile this file and retry; no files were changed.`,
          );
      }
    }
    for (const path of oldFiles) {
      if (
        nextFiles.has(path) ||
        !(path.startsWith(nativeBillingPath) || path === nativeBillingTest)
      )
        continue;
      const current = await safeRead(directory, path);
      if (!current) continue;
      if (!current.equals(await readFile(join(before, path))))
        throw new Error(
          `Cannot disable payments: ${path} was customized. No files were changed.`,
        );
      changes.push({ path });
    }
    // Validate all paths before the first write, including config and parent directories.
    for (const { path } of changes) await safeRead(directory, path);
    for (const { path, content } of changes) {
      if (content) {
        await mkdir(dirname(join(directory, path)), { recursive: true });
        await writeFile(join(directory, path), content);
      } else await rm(join(directory, path));
    }
    await writeFile(
      join(directory, configPath),
      JSON.stringify(config, null, 2) + "\n",
    );
    return config;
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
