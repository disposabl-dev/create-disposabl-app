import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../create-disposabl-app/scaffold";
import { reconfigureApp } from "../create-disposabl-app/reconfigure";

const template = resolve(
  import.meta.dirname,
  "../create-disposabl-app/dist/templates/default",
);
if (!existsSync(template)) {
  execFileSync("bun", ["run", "build"], {
    cwd: resolve(import.meta.dirname, "../create-disposabl-app"),
    stdio: "pipe",
  });
}
const version = "test-version";
const read = (dir: string, path: string) => readFile(join(dir, path), "utf8");

test(
  "reconfigures a generated app without losing user files",
  { timeout: 30000 },
  async () => {
    const temp = await mkdtemp(join(tmpdir(), "reconfigure-test-"));
    const app = join(temp, "app");
    try {
      await createApp(template, app, "my-app", {
        version,
        appId: "test-id",
        platforms: ["web"],
        features: [],
      });
      await writeFile(join(app, "custom.txt"), "keep me");
      await reconfigureApp(template, app, version, {
        platforms: "web,android,ios",
      });
      assert.match(
        await read(app, "apps/mobile/src/app/index.tsx"),
        /PublicHomeScreen/,
      );
      assert.match(
        await read(app, "apps/mobile/src/app/(authenticated)/_layout.tsx"),
        /AuthenticatedLayout/,
      );
      for (const [workspace, skill] of [
        ["apps/mobile", "expo-upgrade"],
        ["apps/web", "frontend-design"],
        ["packages/backend", "convex-crons"],
      ]) {
        assert.equal(
          await read(app, `${workspace}/.claude/skills/${skill}/SKILL.md`),
          await read(app, `${workspace}/.agents/skills/${skill}/SKILL.md`),
        );
      }
      await reconfigureApp(template, app, version, {
        features: "authentication",
      });
      assert.doesNotMatch(
        await read(app, "apps/mobile/src/app/index.tsx"),
        /PublicHomeScreen/,
      );
      assert.ok(
        await read(
          app,
          "packages/disposabl-kit/client/routes/_auth-pages/login.tsx",
        ),
      );
      await reconfigureApp(template, app, version, {
        features: "payments,analytics",
      });
      let config = JSON.parse(await read(app, "disposabl.json"));
      assert.deepEqual(config.features, [
        "authentication",
        "payments",
        "analytics",
      ]);
      assert.equal(config.appId, "test-id");
      assert.deepEqual(config.platforms, ["web", "android", "ios"]);
      await reconfigureApp(template, app, version, {
        features: "none",
        platforms: "web",
      });
      assert.equal(await read(app, "custom.txt"), "keep me");
      assert.ok(await read(app, "apps/mobile/src/app/index.tsx"));
      await reconfigureApp(template, app, version, {
        features: "payments,analytics",
        platforms: "web,android,ios",
      });
      const before = await read(app, "disposabl.json");
      await reconfigureApp(template, app, version, {
        features: "payments,analytics",
        platforms: "web,android,ios",
      });
      assert.equal(await read(app, "disposabl.json"), before);
      config = JSON.parse(before);
      assert.deepEqual(config.features, [
        "authentication",
        "payments",
        "analytics",
      ]);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  },
);

test(
  "rejects version and auth conflicts without changing files",
  { timeout: 30000 },
  async () => {
    const temp = await mkdtemp(join(tmpdir(), "reconfigure-conflict-"));
    const app = join(temp, "app");
    try {
      await createApp(template, app, "my-app", {
        version,
        platforms: ["web", "android"],
        features: [],
      });
      const path = "apps/mobile/src/app/index.tsx";
      await writeFile(join(app, path), "custom home\n");
      const config = await read(app, "disposabl.json");
      await assert.rejects(
        reconfigureApp(template, app, "different", {
          features: "authentication",
        }),
        /version/,
      );
      await assert.rejects(
        reconfigureApp(template, app, version, { features: "authentication" }),
        /conflicts/,
      );
      assert.equal(await read(app, path), "custom home\n");
      assert.equal(await read(app, "disposabl.json"), config);
      await assert.rejects(
        read(app, "packages/disposabl-kit/client/routes/_auth-pages/login.tsx"),
        /ENOENT/,
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  },
);

test("restores docs integration", { timeout: 30000 }, async () => {
  const temp = await mkdtemp(join(tmpdir(), "reconfigure-docs-"));
  const app = join(temp, "app");
  try {
    await createApp(template, app, "my-app", {
      version,
      platforms: ["web"],
      features: [],
    });
    await reconfigureApp(template, app, version, { features: "docs" });
    assert.ok(await read(app, "apps/docs/package.json"));
    assert.match(await read(app, "apps/web/vite.config.ts"), /docs:start/);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test(
  "rejects destination symlinks before changing configuration",
  { timeout: 30000 },
  async () => {
    const temp = await mkdtemp(join(tmpdir(), "reconfigure-link-"));
    const app = join(temp, "app");
    try {
      await createApp(template, app, "my-app", {
        version,
        platforms: ["web"],
        features: [],
      });
      await symlink(temp, join(app, "apps/mobile"));
      const config = await read(app, "disposabl.json");
      await assert.rejects(
        reconfigureApp(template, app, version, { platforms: "android" }),
        /symlink/,
      );
      assert.equal(await read(app, "disposabl.json"), config);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  },
);

test(
  "desktop identities are unique and survive reconfiguration",
  { timeout: 30000 },
  async () => {
    const temp = await mkdtemp(join(tmpdir(), "desktop-identity-"));
    try {
      const a = join(temp, "a"),
        b = join(temp, "b");
      const config = {
        version,
        platforms: ["web", "windows", "macos"] as const,
        features: [],
      };
      await createApp(template, a, "same-name", {
        ...config,
        platforms: [...config.platforms],
      });
      await createApp(template, b, "same-name", {
        ...config,
        platforms: [...config.platforms],
      });
      const first = JSON.parse(await read(a, "disposabl.json"));
      const second = JSON.parse(await read(b, "disposabl.json"));
      const desktop = JSON.parse(await read(a, "apps/desktop/package.json"));
      assert.match(first.desktopId, /^[a-f0-9]{32}$/);
      assert.notEqual(first.desktopId, second.desktopId);
      assert.equal(desktop.disposablDesktopId, first.desktopId);
      assert.ok(
        existsSync(join(a, "packages/backend/convex/desktopUpdates.ts")),
      );
      assert.match(
        await read(a, "packages/backend/convex/schema.ts"),
        /desktopUpdates: desktopUpdateTable/,
      );
      assert.match(
        await read(a, "packages/backend/convex/http.ts"),
        /desktopUpdate/,
      );
      const before = await read(b, "apps/desktop/package.json");
      delete second.desktopId;
      await writeFile(join(b, "disposabl.json"), JSON.stringify(second));
      await assert.rejects(
        reconfigureApp(template, b, version, { features: "authentication" }),
        /no native identity/,
      );
      assert.equal(await read(b, "apps/desktop/package.json"), before);

      assert.notEqual(
        desktop.name,
        JSON.parse(await read(b, "apps/desktop/package.json")).name,
      );
      assert.match(
        await read(a, "bun.lock"),
        new RegExp(`${desktop.name}@workspace:apps/desktop`),
      );
      await reconfigureApp(template, a, version, {
        features: "authentication",
      });
      assert.equal(
        JSON.parse(await read(a, "disposabl.json")).desktopId,
        first.desktopId,
      );
      assert.equal(
        JSON.parse(await read(a, "apps/desktop/package.json")).name,
        desktop.name,
      );
      execFileSync(
        "bun",
        ["install", "--frozen-lockfile", "--filter", desktop.name],
        { cwd: a, stdio: "pipe", timeout: 30000 },
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  },
);

test(
  "enabling desktop later uses the original app identity",
  { timeout: 30000 },
  async () => {
    const temp = await mkdtemp(join(tmpdir(), "desktop-later-"));
    const app = join(temp, "app");
    try {
      await createApp(template, app, "later", {
        version,
        platforms: ["web"],
        features: [],
      });
      const id = JSON.parse(await read(app, "disposabl.json")).desktopId;
      await reconfigureApp(template, app, version, {
        platforms: "web,windows",
      });
      const desktop = JSON.parse(await read(app, "apps/desktop/package.json"));
      assert.equal(desktop.disposablDesktopId, id);
      assert.match(
        await read(app, "bun.lock"),
        new RegExp(`${desktop.name}@workspace:apps/desktop`),
      );
      execFileSync(
        "bun",
        ["install", "--frozen-lockfile", "--filter", desktop.name],
        { cwd: app, stdio: "pipe", timeout: 30000 },
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  },
);
