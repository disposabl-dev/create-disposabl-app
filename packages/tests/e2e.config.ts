import type { E2EConfig } from "e2e";
import { web } from "@e2e-dev/web";
import { createRequire } from "node:module";
import { join } from "node:path";
import { project, root } from "./project.ts";

const targets: E2EConfig["targets"][number][] = [
  { name: "backend", platform: "backend" },
  {
    name: "web",
    engine: web(),
    app: {
      url: process.env.E2E_WEB_URL || "http://127.0.0.1:0",
      ...(!process.env.E2E_WEB_URL && {
        command: {
          executable: "bun",
          args: [
            "x",
            "--no-install",
            "vite",
            "dev",
            "--host",
            "127.0.0.1",
            "--port",
            "{port}",
            "--strictPort",
          ],
          cwd: join(root, "apps/web"),
          inheritEnv: ["VITE_*"],
          env: {
            ...(process.env.E2E_CONVEX_URL || process.env.CONVEX_URL
              ? {
                  VITE_CONVEX_URL:
                    process.env.E2E_CONVEX_URL || process.env.CONVEX_URL!,
                }
              : {}),
            ...(process.env.E2E_CONVEX_SITE_URL || process.env.CONVEX_SITE_URL
              ? {
                  VITE_CONVEX_SITE_URL:
                    process.env.E2E_CONVEX_SITE_URL ||
                    process.env.CONVEX_SITE_URL!,
                }
              : {}),
          },
          startupTimeout: 120_000,
        },
      }),
    },
  },
];

const native = project.platforms.filter(
  (platform): platform is "ios" | "android" =>
    platform === "ios" || platform === "android",
);
if (native.length) {
  const { mobile } = await import("@e2e-dev/mobile");
  // Expo normally supplies these while evaluating app.config.js. A web-only
  // CI job may provide just the backend URLs, but still loads all targets.
  for (const name of ["CONVEX_URL", "CONVEX_SITE_URL"])
    if (process.env[name] && !process.env[`EXPO_PUBLIC_${name}`])
      process.env[`EXPO_PUBLIC_${name}`] = process.env[name];
  const require = createRequire(import.meta.url);
  const app = require(join(root, "apps/mobile/app.config.js"))({
    config: require(join(root, "apps/mobile/app.json")).expo,
  });
  for (const platform of native)
    targets.push({
      name: platform,
      engine: mobile({
        platform,
        device: process.env[`E2E_${platform.toUpperCase()}_DEVICE`],
      }),
      app: {
        bundleId:
          process.env[`E2E_${platform.toUpperCase()}_APP_ID`] ||
          (platform === "ios" ? app.ios.bundleIdentifier : app.android.package),
      },
    });
}
if (project.platforms.includes("api"))
  targets.push({ name: "api", platform: "api" });

export default {
  tests: ["flows/**/*.e2e.ts"],
  targets,
  workers: 1,
  reporters: ["list", "junit"],
} satisfies E2EConfig;
