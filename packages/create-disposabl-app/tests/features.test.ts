import { describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import {
  features,
  platforms,
  selectFeatures,
  selectPlatforms,
} from "../options";
import { createApp } from "../scaffold";

describe("feature selection", () => {
  test("exposes only supported features and platforms", () => {
    expect(features.map(({ id }) => id)).toEqual(["docs", "authentication"]);
    expect(platforms.map(({ id }) => id).sort()).toEqual([
      "android",
      "api",
      "cli",
      "ios",
      "mcp",
      "typescript-sdk",
      "web",
    ]);
    for (const feature of ["blog", "changelog"])
      expect(() => selectFeatures(feature)).toThrow();
    for (const platform of [
      "windows",
      "macos",
      "linux",
      "python-sdk",
      "openai-plugin",
      "claude-code-plugin",
    ])
      expect(() => selectPlatforms(platform)).toThrow();
    expect(selectPlatforms("cli,typescript-sdk")).toEqual([
      "web",
      "api",
      "cli",
      "typescript-sdk",
    ]);
  });
  test("defaults to authentication but allows none and explicit choices", () => {
    expect(selectFeatures()).toEqual(["authentication"]);
    expect(selectFeatures("none")).toEqual([]);
    expect(selectFeatures("docs")).toEqual(["docs"]);
    expect(selectFeatures("authentication,docs")).toEqual([
      "docs",
      "authentication",
    ]);
    expect(() => selectFeatures("unknown")).toThrow();
  });
});

test("auth-disabled output omits frontend auth routes while retaining backend auth", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "disposabl-auth-features-"));
  const template = join(temporary, "template");
  const authFiles = [
    "packages/disposabl-kit/client/routes/_auth-pages/login.tsx",
    "packages/disposabl-kit/client/routes/_auth-pages/signUp.tsx",
    "packages/disposabl-kit/client/routes/consent.tsx",
    "apps/web/src/router/_authenticated/dashboard.api-keys.tsx",
    "apps/mobile/src/app/(auth)/login.tsx",
    "apps/mobile/src/app/(auth)/signup.tsx",
    "apps/mobile/src/app/(authenticated)/account.tsx",
  ];
  const retainedFiles = [
    "packages/backend/convex/auth.ts",
    "packages/backend/convex/users.ts",
    "apps/web/src/router/index.tsx",
  ];
  try {
    for (const file of [
      ...authFiles,
      ...retainedFiles,
      "apps/mobile/src/app/(authenticated)/_layout.tsx",
      "apps/mobile/src/app/index.tsx",
    ]) {
      await mkdir(dirname(join(template, file)), { recursive: true });
      await writeFile(join(template, file), "original source\n");
    }
    for (const file of [
      "apps/web/vite.config.ts",
      "packages/disposabl-kit/client/lib/prerender.ts",
      "packages/disposabl-kit/server/http.ts",
      "packages/disposabl-kit/server/lib/docs.ts",
      "packages/disposabl-kit/server/lib/docs.test.ts",
    ]) {
      await mkdir(dirname(join(template, file)), { recursive: true });
      await writeFile(join(template, file), "original source\n");
    }
    await writeFile(
      join(template, "turbo.json"),
      JSON.stringify({ tasks: {} }),
    );
    for (const folder of ["", "apps/web", "apps/mobile"]) {
      await writeFile(
        join(template, folder, "package.json"),
        JSON.stringify({ devDependencies: {} }),
      );
    }
    await writeFile(join(template, "apps/mobile/app.json"), '{"expo":{}}');
    for (const enabled of [true, false]) {
      const destination = join(temporary, enabled ? "enabled" : "disabled");
      await createApp(template, destination, "test-app", {
        version: "test",
        platforms: ["web", "android", "ios"],
        features: enabled ? ["authentication"] : [],
      });
      for (const file of authFiles) {
        expect(await Bun.file(join(destination, file)).exists()).toBe(enabled);
      }
      for (const file of retainedFiles) {
        expect(await readFile(join(destination, file), "utf8")).toBe(
          "original source\n",
        );
      }
      if (!enabled) {
        expect(
          await readFile(
            join(destination, "apps/mobile/src/app/index.tsx"),
            "utf8",
          ),
        ).toContain("PublicHomeScreen");
        expect(
          await readFile(
            join(
              destination,
              "apps/mobile/src/app/(authenticated)/_layout.tsx",
            ),
            "utf8",
          ),
        ).toContain("PublicLayout");
      }
    }
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
});

test("packaged starter excludes product guides and their native dependency", async () => {
  const { spawnSync } = await import("node:child_process");
  const { existsSync, readFileSync } = await import("node:fs");
  const root = join(import.meta.dirname, "../../..");
  const build = spawnSync(
    process.execPath,
    ["run", "packages/create-disposabl-app/build.ts"],
    {
      cwd: root,
      encoding: "utf8",
    },
  );
  expect(build.status).toBe(0);
  const template = join(
    root,
    "packages/create-disposabl-app/dist/templates/default",
  );
  for (const path of [
    "apps/mobile/src/features/studio",
    "apps/web/src/router/guides.tsx",
    "apps/web/src/components/landing/guide-player.tsx",
    "apps/web/public/disposabl-guides",
    "apps/mobile/assets/disposabl-guides",
    "packages/disposabl-kit/guides.ts",
    "packages/disposabl-kit/guide-media.json",
    "packages/tests/flows/guides.e2e.ts",
  ])
    expect(existsSync(join(template, path))).toBe(false);
  const mobile = JSON.parse(
    readFileSync(join(template, "apps/mobile/package.json"), "utf8"),
  );
  expect(mobile.dependencies["expo-video"]).toBeUndefined();
  const web = JSON.parse(
    readFileSync(join(template, "apps/web/package.json"), "utf8"),
  );
  expect(web.dependencies["hls.js"]).toBeUndefined();
  expect(existsSync(join(template, "apps/web/src/router/index.tsx"))).toBe(
    true,
  );
});
