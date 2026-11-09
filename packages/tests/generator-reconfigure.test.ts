import { test } from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createApp } from "../create-disposabl-app/scaffold";
import { reconfigureApp } from "../create-disposabl-app/reconfigure";
import { mergePurchasesManifest } from "../create-disposabl-app/mobile-payments";
import { version as generatorVersion } from "../create-disposabl-app/package.json";

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

test("payment manifest merge preserves the iOS build-properties dependency", () => {
  const manifest = (payments: boolean) => ({
    dependencies: {
      "expo-build-properties": "~58.0.11",
      ...(payments ? { "react-native-purchases": "10.16.0" } : {}),
    },
  });
  const bytes = (value: unknown) => Buffer.from(JSON.stringify(value));
  const off = manifest(false);
  const on = manifest(true);
  const custom = {
    dependencies: { ...off.dependencies, "user-package": "1.0.0" },
  };
  const enabled = mergePurchasesManifest(bytes(off), bytes(on), bytes(custom));
  assert.ok(enabled);
  const disabled = mergePurchasesManifest(bytes(on), bytes(off), enabled);
  assert.ok(disabled);
  assert.deepEqual(JSON.parse(disabled.toString()), custom);
});

test(
  "code-only CLI reconfiguration preserves identity and installs both skills without setup",
  { timeout: 30000 },
  async () => {
    const temp = await mkdtemp(join(tmpdir(), "reconfigure-cli-"));
    const app = join(temp, "app");
    const cli = resolve(
      import.meta.dirname,
      "../create-disposabl-app/dist/index.js",
    );
    try {
      await createApp(template, app, "my-app", {
        version: generatorVersion,
        appId: "existing-app",
        platforms: ["web"],
        features: [],
      });
      await writeFile(join(app, "custom.txt"), "preserve my app");
      const result = execFileSync(
        process.execPath,
        [
          cli,
          "app",
          "--reconfigure-only",
          "--features",
          "payments",
          "--skip-install",
          "--json",
        ],
        {
          cwd: temp,
          // Any accidental setup call must fail instead of using a real account.
          env: { ...process.env, DISPOSABL_API_ORIGIN: "http://127.0.0.1:1" },
          encoding: "utf8",
          timeout: 20000,
        },
      );
      assert.equal(JSON.parse(result.trim()).status, "reconfigured");
      const config = JSON.parse(await read(app, "disposabl.json"));
      assert.deepEqual(config.features, ["authentication", "payments"]);
      assert.equal(config.appId, "existing-app");
      assert.equal(await read(app, "custom.txt"), "preserve my app");
      execFileSync(
        process.execPath,
        [
          cli,
          "app",
          "--reconfigure-only",
          "--android-architectures",
          "arm64-v8a",
          "--skip-install",
          "--json",
        ],
        { cwd: temp, encoding: "utf8", timeout: 20000 },
      );
      assert.deepEqual(
        JSON.parse(await read(app, "disposabl.json")).androidArchitectures,
        ["arm64-v8a"],
      );
      execFileSync(
        process.execPath,
        [
          cli,
          "app",
          "--reconfigure-only",
          "--features",
          "authentication",
          "--skip-install",
          "--json",
        ],
        { cwd: temp, encoding: "utf8", timeout: 20000 },
      );
      assert.deepEqual(
        JSON.parse(await read(app, "disposabl.json")).androidArchitectures,
        ["arm64-v8a"],
      );
      const beforeInvalid = await read(app, "disposabl.json");
      assert.throws(() =>
        execFileSync(
          process.execPath,
          [
            cli,
            "app",
            "--reconfigure-only",
            "--android-architectures",
            "bad",
            "--skip-install",
            "--json",
          ],
          { cwd: temp, stdio: "pipe", timeout: 10000 },
        ),
      );
      assert.equal(await read(app, "disposabl.json"), beforeInvalid);
      assert.equal(existsSync(join(app, ".git")), false);
      for (const agent of [".agents", ".claude"]) {
        for (const skill of ["disposabl-app", "disposabl-reconfigure"]) {
          assert.ok(await read(app, `${agent}/skills/${skill}/SKILL.md`));
        }
      }
      assert.throws(() =>
        execFileSync(
          process.execPath,
          [
            cli,
            "new-app",
            "--reconfigure-only",
            "--features",
            "none",
            "--skip-install",
            "--json",
          ],
          { cwd: temp, stdio: "pipe", timeout: 10000 },
        ),
      );
      assert.equal(existsSync(join(temp, "new-app")), false);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  },
);

test(
  "native payments selection adds and removes the SDK without replacing custom dependencies",
  { timeout: 30000 },
  async () => {
    const temp = await mkdtemp(join(tmpdir(), "payments-selection-"));
    const app = join(temp, "app");
    const manifestPath = "apps/mobile/package.json";
    const billingPath =
      "packages/disposabl-kit/mobile/billing/account-billing.tsx";
    try {
      await createApp(template, app, "billing-example", {
        version,
        platforms: ["web", "android"],
        features: ["authentication"],
      });
      const nativeConfig = () =>
        JSON.parse(
          execFileSync(
            process.execPath,
            [
              "-e",
              `const c = require("./apps/mobile/app.config.js")({ config: { scheme: ["custom"], extra: { preserved: true } } }); console.log(JSON.stringify({ scheme: c.scheme, extra: c.extra }));`,
            ],
            {
              cwd: app,
              env: {
                PATH: process.env.PATH,
                NODE_ENV: "test",
                DISPOSABL_MOBILE_CHANNEL: "preview",
              },
              encoding: "utf8",
            },
          ),
        );
      const before = nativeConfig();
      assert.deepEqual(before.scheme.slice(0, 1), ["custom"]);
      assert.equal(
        before.scheme.some((s: string) =>
          /^disposabl-billing-[a-f0-9]{12}-/.test(s),
        ),
        false,
      );
      assert.equal(before.extra.billingReturnChannel, undefined);
      let manifest = JSON.parse(await read(app, manifestPath));
      assert.equal(manifest.dependencies["react-native-purchases"], undefined);
      assert.equal(
        manifest.dependencies["react-native-purchases-ui"],
        undefined,
      );
      assert.equal(existsSync(join(app, billingPath)), false);
      assert.doesNotMatch(
        await read(app, "packages/disposabl-kit/mobile/screens/account.tsx"),
        /billingSession|AccountBilling/,
      );
      manifest.dependencies["custom-example"] = "1.2.3";
      await writeFile(
        join(app, manifestPath),
        JSON.stringify(manifest, null, 2) + "\n",
      );
      for (const features of ["payments", "authentication", "payments"]) {
        await reconfigureApp(template, app, version, { features });
        assert.ok(
          existsSync(join(app, "apps/mobile/src/app/+native-intent.ts")),
        );
        const native = nativeConfig();
        assert.equal(
          native.scheme.some((s: string) =>
            /^disposabl-billing-[a-f0-9]{12}-preview$/.test(s),
          ),
          features === "payments",
        );
        assert.equal(
          native.extra.billingReturnChannel,
          features === "payments" ? "preview" : undefined,
        );
        assert.ok(native.scheme.includes(before.scheme[1]));
        assert.equal(native.extra.preserved, true);
        manifest = JSON.parse(await read(app, manifestPath));
        assert.equal(manifest.dependencies["custom-example"], "1.2.3");
        assert.equal(
          !!manifest.dependencies["react-native-purchases"],
          features === "payments",
        );
        assert.equal(
          !!manifest.dependencies["react-native-purchases-ui"],
          features === "payments",
        );
        assert.equal(
          existsSync(join(app, billingPath)),
          features === "payments",
        );
        assert.equal(
          existsSync(
            join(app, "packages/disposabl-kit/mobile/billing/paywall.ts"),
          ),
          features === "payments",
        );
        assert.equal(
          existsSync(
            join(app, "packages/disposabl-kit/mobile/billing/web-checkout.ts"),
          ),
          features === "payments",
        );
        assert.ok(
          existsSync(join(app, "packages/backend/convex/billingHandoff.ts")),
        );
        for (const path of [
          "packages/tests/native-billing.test.ts",
          "packages/tests/mobile-storefront-observer.test.ts",
          "packages/tests/components/mobile-storefront-observer.test.mjs",
        ])
          assert.equal(existsSync(join(app, path)), features === "payments");
      }
      const config = await read(app, "disposabl.json");
      const manifestBefore = await read(app, manifestPath);
      await writeFile(
        join(app, billingPath),
        "// Custom billing implementation\n",
      );
      await assert.rejects(
        reconfigureApp(template, app, version, { features: "authentication" }),
        /customized/,
      );
      assert.equal(await read(app, "disposabl.json"), config);
      assert.equal(await read(app, manifestPath), manifestBefore);
      assert.equal(
        await read(app, billingPath),
        "// Custom billing implementation\n",
      );
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  },
);

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
      await assert.rejects(
        read(app, "packages/disposabl-kit/client/routes/billing-login.tsx"),
        /ENOENT/,
      );
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
      for (const path of [
        "packages/tests/consent-identity.test.ts",
        "packages/tests/components/consent-identity.test.mjs",
      ])
        assert.ok(existsSync(join(app, path)), path);
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
      assert.ok(
        await read(
          app,
          "packages/disposabl-kit/client/routes/billing-login.tsx",
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
      const customMobile = JSON.parse(
        await read(app, "apps/mobile/package.json"),
      );
      customMobile.dependencies["custom-example"] = "1.2.3";
      await writeFile(
        join(app, "apps/mobile/package.json"),
        JSON.stringify(customMobile, null, 2) + "\n",
      );
      await reconfigureApp(template, app, version, {
        features: "none",
        platforms: "web",
      });
      for (const path of [
        "packages/disposabl-kit/client/routes/billing-login.tsx",
        "packages/disposabl-kit/client/routes/_auth-pages/login.tsx",
        "packages/tests/consent-identity.test.ts",
        "packages/tests/components/consent-identity.test.mjs",
        "apps/mobile/src/app/(auth)/login.tsx",
      ])
        assert.equal(existsSync(join(app, path)), false, path);
      assert.match(
        await read(app, "apps/mobile/src/app/index.tsx"),
        /PublicHomeScreen/,
      );
      assert.match(
        await read(app, "packages/backend/convex/schema.ts"),
        /v.literal\("topup"\)/,
      );
      assert.equal(await read(app, "custom.txt"), "keep me");
      assert.ok(await read(app, "apps/mobile/src/app/index.tsx"));
      await reconfigureApp(template, app, version, {
        features: "payments,analytics",
        platforms: "web,android,ios",
      });
      const mobile = JSON.parse(await read(app, "apps/mobile/package.json"));
      assert.equal(mobile.dependencies["custom-example"], "1.2.3");
      for (const name of [
        "react-native-purchases",
        "react-native-purchases-ui",
      ])
        assert.ok(mobile.dependencies[name]);
      assert.match(
        await read(app, "apps/mobile/src/app/index.tsx"),
        /HomeScreen/,
      );
      assert.doesNotMatch(
        await read(app, "apps/mobile/src/app/index.tsx"),
        /PublicHomeScreen/,
      );
      assert.ok(await read(app, "packages/tests/native-billing.test.ts"));
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

test(
  "disabling authentication rejects customized starter routes",
  { timeout: 30000 },
  async () => {
    const temp = await mkdtemp(join(tmpdir(), "reconfigure-auth-removal-"));
    const app = join(temp, "app");
    try {
      await createApp(template, app, "my-app", {
        version,
        platforms: ["web", "android", "ios"],
        features: ["authentication", "payments"],
      });
      const path = "packages/disposabl-kit/client/routes/billing-login.tsx";
      await writeFile(join(app, path), "custom route\n");
      const config = await read(app, "disposabl.json");
      await assert.rejects(
        reconfigureApp(template, app, version, { features: "none" }),
        /customized/,
      );
      assert.equal(await read(app, path), "custom route\n");
      assert.equal(await read(app, "disposabl.json"), config);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  },
);

test(
  "feature changes migrate retained mobile files before mobile is re-enabled",
  { timeout: 30000 },
  async () => {
    const temp = await mkdtemp(join(tmpdir(), "reconfigure-retained-auth-"));
    const app = join(temp, "app");
    try {
      await createApp(template, app, "my-app", {
        version,
        platforms: ["web", "android"],
        features: ["authentication"],
      });
      await reconfigureApp(template, app, version, { platforms: "web" });
      const path = "apps/mobile/src/app/(auth)/login.tsx";
      const original = await read(app, path);
      const home = await read(app, "apps/mobile/src/app/index.tsx");
      const config = await read(app, "disposabl.json");
      await writeFile(join(app, path), "custom retained login\n");
      await assert.rejects(
        reconfigureApp(template, app, version, { features: "none" }),
        /customized/,
      );
      assert.equal(await read(app, path), "custom retained login\n");
      assert.equal(await read(app, "disposabl.json"), config);
      assert.equal(await read(app, "apps/mobile/src/app/index.tsx"), home);
      await writeFile(join(app, path), original);
      await reconfigureApp(template, app, version, { features: "none" });
      assert.equal(existsSync(join(app, path)), false);
      assert.match(
        await read(app, "apps/mobile/src/app/index.tsx"),
        /PublicHomeScreen/,
      );
      assert.deepEqual(
        JSON.parse(await read(app, "disposabl.json")).platforms,
        ["web"],
      );
      await reconfigureApp(template, app, version, {
        platforms: "web,android",
      });
      assert.equal(existsSync(join(app, path)), false);
      assert.match(
        await read(app, "apps/mobile/src/app/index.tsx"),
        /PublicHomeScreen/,
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
