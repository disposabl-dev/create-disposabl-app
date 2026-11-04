import { existsSync, readFileSync } from "node:fs";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

export const root = fileURLToPath(new URL("../../", import.meta.url));
export const project = JSON.parse(
  readFileSync(join(root, "disposabl.json"), "utf8"),
) as { platforms: string[]; features: string[] };

// Existing shell/CI variables take precedence. No credentials are copied.
for (const file of [
  "packages/backend/.env.local",
  "apps/web/.env.local",
  "apps/mobile/.env.local",
])
  if (existsSync(join(root, file))) loadEnvFile(join(root, file));

export function backendUrl() {
  const url = process.env.E2E_CONVEX_URL || process.env.CONVEX_URL;
  if (!url)
    throw new Error(
      "Configure this app's development environment with bun run dev, or set E2E_CONVEX_URL for an isolated test backend.",
    );
  return url.replace(/\/$/, "");
}

export function siteUrl() {
  const url = process.env.E2E_CONVEX_SITE_URL || process.env.CONVEX_SITE_URL;
  if (!url)
    throw new Error(
      "Set E2E_CONVEX_SITE_URL or CONVEX_SITE_URL for API checks.",
    );
  return url.replace(/\/$/, "");
}
