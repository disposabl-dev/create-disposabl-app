import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { productionAnalyticsEnabled } from "../../apps/mobile/scripts/production-analytics.mjs";
import { verifyInputs } from "../../apps/mobile/scripts/android-release-verify.mjs";

const app = JSON.parse(
  readFileSync(new URL("../../disposabl.json", import.meta.url)),
);
const site = JSON.parse(
  readFileSync(new URL("../../apps/web/site.json", import.meta.url)),
);
const env = {
  GH_REPO: "disposabl-dev/create-disposabl-app",
  GITHUB_ACTIONS: "true",
  GITHUB_EVENT_NAME: "push",
  GITHUB_REF: "refs/heads/main",
  CHANNEL: "production",
  CONVEX_SITE_URL: "https://www.disposabl.dev",
  EXPO_PUBLIC_CONVEX_SITE_URL: "https://www.disposabl.dev",
  EXPO_PUBLIC_CONVEX_URL: "https://vivid-caterpillar-633.convex.cloud",
  DISPOSABL_ANDROID_VERSION_CODE: "123",
  UPDATE_POLICY: "disabled",
};
const abis = ["arm64-v8a", "x86_64"];
const manifest = {
  applicationId: "com.yastai.disposabl",
  androidArchitectures: abis,
  projectId: "project",
};
const config = {
  android: { package: manifest.applicationId, versionCode: 123 },
  extra: {
    disposablAndroidPayments: false,
    disposablAndroidArchitectures: abis,
    eas: { projectId: "project" },
  },
  updates: { enabled: false },
};

test("product production custom domain passes the existing release policy", () => {
  assert.notEqual(site.backendOrigin, env.CONVEX_SITE_URL);
  const enabled = productionAnalyticsEnabled(env, app, site);
  assert.equal(enabled, true);
  verifyInputs(config, manifest, {
    ...env,
    EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED: String(enabled),
  });
  assert.throws(
    () =>
      verifyInputs(config, manifest, {
        ...env,
        EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED: "false",
      }),
    /policy mismatch/,
  );
});
test("explicit backend overrides take precedence over the product domain", () => {
  for (const [backend, expected] of [
    ["https://different.example", false],
    [env.CONVEX_SITE_URL, true],
  ])
    assert.equal(
      productionAnalyticsEnabled(
        env,
        { ...app, productionConvexSiteUrl: backend },
        site,
      ),
      expected,
    );
});
test("local, previews and E2E cannot enable production analytics", () => {
  for (const overrides of [
    { GITHUB_ACTIONS: "" },
    { GITHUB_EVENT_NAME: "pull_request" },
    { GITHUB_REF: "refs/heads/feature" },
    { CHANNEL: "preview" },
    { E2E_TELEMETRY_DISABLED: "1" },
    { EXPO_PUBLIC_E2E: "true" },
  ])
    assert.equal(
      productionAnalyticsEnabled({ ...env, ...overrides }, app, site),
      false,
    );
});
test("generated analytics remain optional and require their configured backend", () => {
  const generated = { ...env, GH_REPO: "example/generated" };
  assert.equal(productionAnalyticsEnabled(generated, app, site), false);
  assert.equal(
    productionAnalyticsEnabled(
      { ...generated, CONVEX_SITE_URL: site.backendOrigin },
      app,
      site,
    ),
    true,
  );
  assert.equal(
    productionAnalyticsEnabled(
      { ...generated, CONVEX_SITE_URL: site.backendOrigin },
      { ...app, features: [] },
      site,
    ),
    false,
  );
  assert.equal(
    productionAnalyticsEnabled(
      { ...generated, CONVEX_SITE_URL: "https://other.example" },
      app,
      site,
    ),
    false,
  );
});

for (const [name, easEnv, inherited, expected] of [
  ["production", "PUBLIC_FIXTURE=enabled\n", {}, true],
  ["pulled telemetry suppression", "E2E_TELEMETRY_DISABLED=1\n", {}, false],
  ["pulled E2E mode", "EXPO_PUBLIC_E2E=true\n", {}, false],
  [
    "inherited telemetry suppression",
    "E2E_TELEMETRY_DISABLED=0\n",
    { E2E_TELEMETRY_DISABLED: "1" },
    false,
  ],
  [
    "inherited E2E mode",
    "EXPO_PUBLIC_E2E=false\n",
    { EXPO_PUBLIC_E2E: "true" },
    false,
  ],
])
  test("expo-env honors effective policy: " + name, async () => {
    const {
      mkdtempSync,
      mkdirSync,
      writeFileSync,
      copyFileSync,
      readFileSync,
      rmSync,
    } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const { spawnSync } = await import("node:child_process");
    const temp = mkdtempSync(join(tmpdir(), "android-policy-"));
    try {
      for (const path of [
        "apps/mobile/scripts",
        "apps/web",
        ".github/scripts",
        "bin",
        "runner",
      ])
        mkdirSync(join(temp, path), { recursive: true });
      for (const path of [
        ".github/scripts/mobile.sh",
        ".github/scripts/release-source.sh",
        "apps/mobile/scripts/production-analytics.mjs",
        "apps/mobile/eas.json",
        "apps/web/site.json",
        "disposabl.json",
      ])
        copyFileSync(
          new URL(`../../${path}`, import.meta.url),
          join(temp, path),
        );
      const bun = process.execPath;
      writeFileSync(
        join(temp, "bin/bun"),
        `#!/bin/bash\nif [[ "$1" == x ]]; then printf '%s' "$EAS_FIXTURE_ENV" > "$RUNNER_TEMP/expo.env"; else exec "$REAL_BUN" --input-type=module "$@"; fi\n`,
        { mode: 0o700 },
      );
      const githubEnv = join(temp, "github-env");
      writeFileSync(githubEnv, "");
      const result = spawnSync(
        "/bin/bash",
        [join(temp, ".github/scripts/mobile.sh"), "expo-env"],
        {
          cwd: join(temp, "apps/mobile"),
          encoding: "utf8",
          env: {
            ...process.env,
            ...env,
            E2E_TELEMETRY_DISABLED: "",
            EXPO_PUBLIC_E2E: "",
            ...inherited,
            EAS_FIXTURE_ENV: easEnv,
            EXPO_PROJECT_ID: "project",
            EAS_ENVIRONMENT: "production",
            EAS_CLI: "fixture",
            RUNNER_TEMP: join(temp, "runner"),
            GITHUB_ENV: githubEnv,
            REAL_BUN: bun,
            PATH: `${join(temp, "bin")}:${process.env.PATH}`,
          },
        },
      );
      assert.equal(result.status, 0, result.stderr);
      assert.match(
        readFileSync(githubEnv, "utf8"),
        new RegExp(
          "^EXPO_PUBLIC_DISPOSABL_ANALYTICS_ENABLED=" + expected + "$",
          "m",
        ),
      );
    } finally {
      rmSync(temp, { recursive: true, force: true });
    }
  });
