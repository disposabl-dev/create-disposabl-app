import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { createApp } from "../create-disposabl-app/scaffold";
import { displayAppName } from "../disposabl-kit/lib/app-name";

const exec = promisify(execFile);
const template = resolve(
  import.meta.dirname,
  "../create-disposabl-app/dist/templates/default",
);

test("reset welcome reflects selected platforms and hides disabled docs", async () => {
  const temp = await mkdtemp(join(tmpdir(), "starter-welcome-"));
  try {
    for (const docs of [false, true]) {
      const app = join(temp, docs ? "docs" : "minimal");
      await createApp(template, app, "welcome-fixture", {
        version: "test",
        platforms: ["web", "android"],
        features: docs ? ["docs"] : [],
      });
      assert.equal(
        existsSync(join(app, "apps/mobile/src/features/studio")),
        false,
      );
      assert.equal(
        existsSync(join(app, "packages/tests/flows/mobile-chat.e2e.ts")),
        false,
      );
      const mobile = JSON.parse(
        await readFile(join(app, "apps/mobile/package.json"), "utf8"),
      );
      assert.equal(
        mobile.dependencies["react-native-enriched-markdown"],
        undefined,
      );
      assert.equal(
        existsSync(join(app, "apps/mobile/src/app/settings.tsx")),
        true,
      );
      assert.equal(existsSync(join(app, "apps/docs")), docs);
      assert.equal(
        existsSync(join(app, "apps/web/src/router/mobile-login.tsx")),
        false,
      );
      assert.equal(
        existsSync(join(app, "packages/tests/desktop-updates.test.ts")),
        false,
      );
      assert.equal(
        existsSync(join(app, "packages/tests/desktop-publication.test.ts")),
        false,
      );
      assert.equal(
        existsSync(join(app, "packages/tests/agent-credits.test.ts")),
        false,
      );
      assert.equal(
        existsSync(
          join(app, "packages/tests/mobile-submission-policy.test.ts"),
        ),
        false,
      );
      assert.equal(
        existsSync(join(app, "packages/tests/app-telemetry.test.ts")),
        false,
      );
      assert.equal(
        existsSync(join(app, "packages/tests/telemetry-transactions.test.ts")),
        false,
      );
      assert.equal(
        existsSync(join(app, "packages/tests/fixtures/telemetry-convex")),
        false,
      );
      for (const name of [
        "sdk-analytics",
        "cli-telemetry",
        "cli-release-recovery",
      ])
        assert.equal(
          existsSync(join(app, `packages/tests/${name}.test.ts`)),
          false,
        );
      await symlink(
        resolve(import.meta.dirname, "../../node_modules"),
        join(app, "node_modules"),
        "dir",
      );
      await exec("bun", ["run", "--cwd", "packages/tests", "typecheck"], {
        cwd: app,
      });
      await writeFile(
        join(app, "welcome-check.tsx"),
        `
        import { createElement } from "react";
        import { renderToStaticMarkup } from "react-dom/server";
        import { Route } from "./apps/web/src/router/index";
        import { PasswordPage } from "./packages/disposabl-kit/client/components/password-page";
        console.log(renderToStaticMarkup(createElement(Route.options.component)));
        console.log(renderToStaticMarkup(createElement(PasswordPage, { title: "Welcome", children: "Form" })));
      `,
      );
      const { stdout } = await exec("bun", ["welcome-check.tsx"], { cwd: app });
      assert.match(stdout, /Make something/);
      assert.match(stdout, /Your welcome-fixture account/);
      assert.doesNotMatch(stdout, /disposabl-logo\.svg|Your Disposabl account/);
      assert.match(stdout, />Web</);
      assert.match(stdout, />Android</);
      assert.doesNotMatch(
        stdout,
        />iOS<|AgentOnboarding|Set up your workspace/,
      );
      assert.equal(stdout.includes('href="/docs/mobile"'), docs);
      assert.equal(stdout.includes('href="/docs/web"'), docs);
      assert.equal(stdout.includes('href="/docs/getting-started"'), docs);
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("UUID package names do not appear as app branding", () => {
  assert.equal(displayAppName("4b468ab0-76e8-448f-b067-2b3599165a00"), null);
  assert.equal(displayAppName("Folio"), "Folio");
  assert.equal(displayAppName("Disposabl"), "Disposabl");
});

test("iOS starter retains Expo image source selection", async () => {
  const temp = await mkdtemp(join(tmpdir(), "starter-ios-image-"));
  try {
    const app = join(temp, "app");
    await createApp(template, app, "ios-fixture", {
      version: "test",
      platforms: ["web", "ios"],
      features: ["authentication"],
    });
    const mobile = JSON.parse(
      await readFile(join(app, "apps/mobile/package.json"), "utf8"),
    );
    assert.deepEqual(mobile.expo.autolinking.ios.buildFromSource, [
      "expo-image",
    ]);
    assert.ok(mobile.dependencies["expo-image"]);
    const { stdout } = await exec(
      "node",
      [
        "../../node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js",
        "resolve",
        "--platform",
        "apple",
        "--json",
      ],
      { cwd: resolve(import.meta.dirname, "../../apps/mobile") },
    );
    assert.deepEqual(JSON.parse(stdout).configuration.buildFromSource, [
      "expo-image",
    ]);
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test("fresh starters are formatted without changing bundled skills", async () => {
  const temp = await mkdtemp(join(tmpdir(), "starter-format-"));
  try {
    for (const [name, platforms, features] of [
      ["minimal", ["web"], []],
      [
        "all",
        [
          "web",
          "android",
          "ios",
          "macos",
          "windows",
          "linux",
          "api",
          "mcp",
          "cli",
          "typescript-sdk",
        ],
        ["authentication", "payments", "analytics", "docs"],
      ],
    ] as const) {
      const app = join(temp, name);
      await createApp(template, app, `format-${name}`, {
        version: "test",
        platforms: [...platforms],
        features: [...features],
      });
      await exec("bun", ["fmt", "--check"], { cwd: app });
      if (name === "all") {
        const skill = "apps/mobile/.claude/skills/eas-update/SKILL.md";
        assert.equal(
          await readFile(join(app, skill), "utf8"),
          await readFile(join(template, skill), "utf8"),
        );
      }
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
});

test(
  "scaffolding tolerates absent or unsupported formatters but propagates formatting failures",
  { timeout: 15000 },
  async () => {
    const temp = await mkdtemp(join(tmpdir(), "starter-formatter-support-"));
    const scaffold = resolve(
      import.meta.dirname,
      "../create-disposabl-app/scaffold.ts",
    );
    const reconfigure = resolve(
      import.meta.dirname,
      "../create-disposabl-app/reconfigure.ts",
    );
    try {
      for (const mode of ["absent", "unsupported", "broken"]) {
        const bin = join(temp, mode);
        const app = join(bin, "app");
        await mkdir(bin);
        if (mode !== "absent")
          await writeFile(
            join(bin, "bun"),
            `#!/bin/sh\ncase "$*" in\n  "--version") echo 1.0.0; exit 0;;\n  "fmt --no-script --help") exit ${mode === "broken" ? 0 : 1};;\n  *) echo 'fixture formatter failure' >&2; exit 42;;\nesac\n`,
            { mode: 0o755 },
          );
        const script = `
        import assert from "node:assert/strict";
        import { existsSync } from "node:fs";
        import { createApp } from ${JSON.stringify(scaffold)};
        import { reconfigureApp } from ${JSON.stringify(reconfigure)};
        const app = ${JSON.stringify(app)};
        const template = ${JSON.stringify(template)};
        const create = () => createApp(template, app, "formatter-test", {
          version: "test", platforms: ["web"], features: []
        });
        if (${JSON.stringify(mode)} === "broken") {
          await assert.rejects(create, /fixture formatter failure/);
          assert.equal(existsSync(app), false);
        } else {
          await create();
          const result = await reconfigureApp(template, app, "test", { features: "authentication" });
          assert.ok(result.features.includes("authentication"));
          assert.equal(existsSync(app), true);
        }
      `;
        await exec(process.execPath, ["-e", script], {
          env: {
            NODE_ENV: "test",
            PATH: bin,
            HOME: temp,
            DO_NOT_TRACK: "1",
            E2E_TELEMETRY_DISABLED: "1",
          },
        });
      }
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  },
);
